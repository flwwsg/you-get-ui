'use strict';
const { getContent, buildHeaders, getSize, saveContent } = require('./utils/net');
const cheerio = require('cheerio');
const htmlparser2 = require('htmlparser2');
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

// 流媒体类型
const streamTypes = [
    {
        'id': 'hdflv2_4k', 'quality': 120, 'audio_quality': 30280,
        'container': 'FLV', 'video_resolution': '2160p', 'desc': '超清 4K'
    },
    {
        'id': 'flv_p60', 'quality': 116, 'audio_quality': 30280,
        'container': 'FLV', 'video_resolution': '1080p', 'desc': '高清 1080P60'
    },
    {
        'id': 'hdflv2', 'quality': 112, 'audio_quality': 30280,
        'container': 'FLV', 'video_resolution': '1080p', 'desc': '高清 1080P+'
    },
    {
        'id': 'flv', 'quality': 80, 'audio_quality': 30280,
        'container': 'FLV', 'video_resolution': '1080p', 'desc': '高清 1080P'
    },
    {
        'id': 'flv720_p60', 'quality': 74, 'audio_quality': 30280,
        'container': 'FLV', 'video_resolution': '720p', 'desc': '高清 720P60'
    },
    {
        'id': 'flv720', 'quality': 64, 'audio_quality': 30280,
        'container': 'FLV', 'video_resolution': '720p', 'desc': '高清 720P'
    },
    {
        'id': 'hdmp4', 'quality': 48, 'audio_quality': 30280,
        'container': 'MP4', 'video_resolution': '720p', 'desc': '高清 720P (MP4)'
    },
    {
        'id': 'flv480', 'quality': 32, 'audio_quality': 30280,
        'container': 'FLV', 'video_resolution': '480p', 'desc': '清晰 480P'
    },
    {
        'id': 'flv360', 'quality': 16, 'audio_quality': 30216,
        'container': 'FLV', 'video_resolution': '360p', 'desc': '流畅 360P'
    },
]
const streamQualities = {};
for (const st of streamTypes) {
    streamQualities[st.quality] = st;
}

// 下载的地址
const streams = {};
const dashStreams = {};
let bestStream;
let bestDashStream = { size: 0};

const getInitialState = async function(cheerioDom) {
    for (const node of cheerioDom('script')) {
        if (node.children.length > 0) {
            for (const child of node.children) {
                if (child.data) {
                    if (child.data.startsWith('window.__INITIAL_STATE__=')) {
                        return JSON.parse(child.data.split(';')[0].slice(25));
                    }
                }
            }
        }
    }
};

const getPlayInfo =  async function(cheerioDom) {
    for (const node of cheerioDom('script')) {
        if (node.children.length > 0) {
            for (const child of node.children) {
                if (child.data) {
                    if (child.data.startsWith('window.__playinfo__=')) {
                        return JSON.parse(child.data.slice(20));
                    }
                }
            }
        }
    }
}

// 不知道这接口干嘛的
const bilibiliApi = async function(avid, cid, qn) {
    return `https://api.bilibili.com/x/player/playurl?avid=${avid}&cid=${cid}&qn=${qn}&type=&otype=json&fnver=0&fnval=16&fourk=1`
}

// 不知道这接口干嘛的
const bilibiliInterfaceApi = async function(cid, qn) {
    if (undefined === qn || qn === null) {
        qn = 0;
    }
    const entropy = 'rbMCKn@KuamXWlPMoJGsKcbiJKUfkPF_8dABscJntvqhRSETg'
    // 翻转字符串,解出 key 跟 secure key
    const res =  entropy.split('').reverse().map(v => {
        return String.fromCharCode(v.charCodeAt(0) + 2);
    }).join('').split(':');
    const appKey = res[0];
    const sec = res[1];
    const params = `appkey=${appKey}&cid=${cid}&otype=json&qn=${qn}&quality=${qn}&type=`;
    const chkSum = crypto.createHash('md5').update(params+sec).digest('hex');
    return `https://interface.bilibili.com/v2/playurl?${params}&sign=${chkSum}`;
}


async function download(url) {
    // check url is bilibili
    if (!url.startsWith('https://www.bilibili.com/video')) {
        throw new Error(`${url} does not supported`);
    }
    // get initial_state and playInfo
    let headers = await buildHeaders();
    let htmlContent = await getContent(url, headers);
    // console.log(httpContent);
    let dom = htmlparser2.parseDocument(htmlContent);
    let root = cheerio.load(dom);
    const initialState = await getInitialState(root);
    const playInfo = await getPlayInfo(root);

    if (!initialState || !playInfo) {
        console.error('get initialState or playInfo error');
        process.exit(1);
    }
    // console.log(initialState);
    // console.log(playInfo);

    // get playInfo_
    headers = await buildHeaders(null, 'CURRENT_FNVAL=16');
    htmlContent = await getContent(url, headers);
    dom = htmlparser2.parseDocument(htmlContent);
    root = cheerio.load(dom);
    const playInfo2 = await getPlayInfo(root);
    if (playInfo2 === null) {
        console.error('get playInfo 2 fail');
        process.exit(1);
    }
    // 总集数
    const pn = initialState.videoData.videos;
    console.log('total number of video', pn);

    // 查找集数
    const p = parseInt(/.*?p=(\d+)/.exec(url)[1]);
    console.log(JSON.stringify(initialState));
    console.log(JSON.stringify(playInfo));
    console.log(JSON.stringify(playInfo2));

    // TODO check play list
    let title = initialState.videoData.title;
    if (pn > 1) {
        title = `${title}-P${p}-${initialState.videoData.pages[p-1].part}`;
    }
    console.log(`title is ${title}`);

    // construct playInfo
    const avid = initialState.aid;
    const cid = initialState.videoData.pages[p-1].cid;
    // 默认品质
    let currentQuality, bestQuality;
    if (playInfo) {
        currentQuality = playInfo.data.quality || null;
        if (playInfo.data && playInfo.data.accept_quality && playInfo.data.accept_quality.length > 0) {
            bestQuality = playInfo.data.accept_quality[0];
        }
    }
    const playInfos = [];
    if (playInfo) {
        playInfos.push(playInfo);
    }
    if (playInfo2) {
        playInfos.push(playInfo2);
    }

    // get format from api
    for (const qn of [120, 112, 80, 64, 32, 16]) {
        if(!currentQuality || qn < currentQuality) {
            const apiUrl = await bilibiliApi(avid, cid, qn);
            headers = await buildHeaders(url);
            const apiPlayInfo = await getContent(apiUrl, headers);
            if (apiPlayInfo.code === 0) {
                // success
                playInfos.push(apiPlayInfo);
            } else {
                console.error('query bilibili api fail with', apiPlayInfo);
            }
        }

        if (!bestQuality || qn <= bestQuality) {
            const apiUrl = await bilibiliInterfaceApi(cid, qn);
            headers = await buildHeaders(url);
            const apiPlayInfoData = await getContent(apiUrl, headers);
            if (apiPlayInfoData.quality) {
                playInfos.push({
                    code: 0,
                    message: 0,
                    ttl: 1,
                    data: apiPlayInfoData
                });
            }
        }
    }
    if (!playInfos) {
        console.error('try get play info fail.');
        process.exit(1);
    }

    for (const info of playInfos) {
        const quality = info.data.quality;
        const formatId = streamQualities[quality].id;
        const container = streamQualities[quality].container.toLowerCase();
        const desc = streamQualities[quality].desc;
        if (info.data.durl) {
            const src = [];
            let size = 0;
            for (const durl of info.data.durl) {
                src.push(durl.url);
                size += durl.size;
            }
            streams[formatId] = {
                container,
                quality: desc,
                size,
                src,
            };
        }

        // 音视频分离
        if (info.data.dash) {
            const audioSizeCache = {};
            for (const video of info.data.dash.video) {
                const s = streamQualities[video.id];
                const formatId = 'datsh-' + s.id;
                // 强制 mp4 格式
                const container = 'mp4';
                const desc = s.desc;
                const audioQuality = s.audio_quality;
                const baseUrl = video.baseUrl;
                headers = await buildHeaders(url);
                let size = await getSize(baseUrl, headers);
                // audio track
                if (info.data.dash.audio) {
                    let audioBaseUrl = info.data.dash.audio[0].baseUrl;
                    for (const audio of info.data.dash.audio) {
                        if (parseInt(audio.id) === audioQuality) {
                            audioBaseUrl = audio.baseUrl;
                            break;
                        }
                    }
                    if (!audioSizeCache[audioQuality]) {
                        headers = await buildHeaders(url)
                        audioSizeCache[audioQuality] = await getSize(audioBaseUrl, headers);
                    }
                    size += audioSizeCache[audioQuality];
                    dashStreams[formatId] = {
                        container,
                        quality: desc,
                        src: [[baseUrl], [audioBaseUrl]],
                        size,
                    };
                } else {
                    dashStreams[formatId] = {
                        container,
                        quality: desc,
                        src: [[baseUrl]],
                        size,
                    };
                }
            }
        }
    }

    // 选择最好品质的下载(已经合并音轨 flv)
    for (const k of Object.keys(streamTypes)) {
        const st = streamTypes[k];
        if (streams[st.id]) {
            bestStream = { ...streams[st.id], id: st.id};
            break;
        }
    }

    // 优先选择 dashStream,但是要合并音轨
    for(const k of Object.keys(dashStreams)) {
        const ds = dashStreams[k];
        if (ds.size > bestDashStream.size) {
            bestDashStream = {...ds, id: k};
        }
    }
    console.log(streams);
    console.log(dashStreams);
    console.log(bestStream, bestDashStream);
    headers = await buildHeaders(url);
    const allFiles = [];
    let ext;
    if (bestDashStream.size > 0) {
        // 就是你了
        for (let i=0; i<bestDashStream.src.length; i++) {
            // TODO 多线程下载
            ext = bestDashStream.container;
            const downloadUrl = bestDashStream.src[i][0];
            const tmpFile = path.join(__dirname, title+`[${i}].`+ext);
            allFiles.push(tmpFile);
            await saveContent(downloadUrl, tmpFile, headers)
        }
    } else {
        // TODO download flv
    }
    if (allFiles.length > 1) {
        // 需要版本 > 2
        const out = path.join(__dirname, title + `.` + ext);
        const list = allFiles.join(' -i ');
        console.log(out, allFiles, list);
        const args = [];
        for (const f of allFiles) {
            args.push('-i');
            args.push(f);
        }
        const result = spawn('ffmpeg', [...args, '-c', 'copy', '-bsf:a', 'aac_adtstoasc','--', out]);
        result.stderr.on('data', data => {
            console.log(data.toString());
        })
        result.stdout.on('data', data => {
            console.log(data.toString());
        })
    }

}
//
// main().then(res => {
//     console.log(res);
// }).catch(e => {
//     console.error(e);
// })

module.exports = {
    download,
}
