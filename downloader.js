'use strict';
const { getContent, buildHeaders, getSize } = require('./utils/net');
const cheerio = require('cheerio');
const htmlparser2 = require('htmlparser2');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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


const getInitialState = async function(cheerioDom) {
    for (const node of cheerioDom('script')) {
        if (node.children.length > 0) {
            for (const child of node.children) {
                if (child.data) {
                    if (child.data.startsWith('window.__INITIAL_STATE__=')) {
                        return JSON.parse(child.data.split(';(function()')[0].slice(25));
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

/**
 * 从 url 获取视频
 * @returns {Promise<{baseUrl, parts: *, title}>}
 */
async function getVideoInfo(url) {
    // TODO support av
    const ex = new RegExp(/https?:\/\/(www.)?bilibili.com\/video\/(BV(\S+))/);
    if (!ex.exec(url)) {
        return;
    }
    // 支持
    const baseUrl = url.split('?')[0];
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
    // 解析所有的视频标题
    const parts = initialState.videoData.pages.map(val => {
        return val.part;
    });
    return { baseUrl, parts, title: initialState.videoData.title };

}

/**
 *
 * @param url
 * @param title
 * @param p
 * @param currentWindow
 * @returns {Promise<null|{size: number}>}
 */
async function download(url, title, p, currentWindow) {
    // 下载的地址
    const streams = {};
    const dashStreams = {};
    let bestStream;
    let bestDashStream = { size: 0};
    // get initial_state and playInfo
    let headers = await buildHeaders();
    let htmlContent = await getContent(url, headers);
    let dom = htmlparser2.parseDocument(htmlContent);
    let root = cheerio.load(dom);
    const initialState = await getInitialState(root);
    const playInfo = await getPlayInfo(root);

    if (!initialState) {
        console.error('get initialState or playInfo error');
        process.exit(1);
    }
    // console.log(initialState);
    // console.log(playInfo);

    if (playInfo === null) {
        console.error('get playInfo fail');
        process.exit(1);
    }
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
    for (const st of streamTypes) {
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
    // console.debug(streams);
    // console.debug(dashStreams);
    // console.debug(bestStream, bestDashStream);
    if (bestDashStream.size > 0) {
        return bestDashStream;
    } else {
        return bestStream
    }
}

// 合并视频
async function merge(allFiles, saveName) {
    // 当前版本 ffmpeg version n4.3.1
    if (allFiles.length > 1) {
        // 需要版本 > 2
        let result;
        let out = null;
        if (path.extname(saveName) === '.flv') {
            // 合并 flv
            out = saveName + '.txt';
            concatList(allFiles, out);
            result = spawn('ffmpeg', ['-y', '-f', 'concat', '-safe', '-1', '-i', out, '-c', 'copy', '-bsf:a', 'aac_adtstoasc','--', saveName]);
        } else if(path.extname(saveName) === '.mp4') {
            // 合并 mp4 文件
            const args = [ '-y' ];
            for (const f of allFiles) {
                args.push('-i');
                args.push(f);
            }
            result = spawn('ffmpeg', [...args, '-c', 'copy', '-bsf:a', 'aac_adtstoasc','--', saveName]);
        }

        result.stderr.on('data', data => {
            console.debug(data.toString());
        })
        result.stdout.on('data', data => {
            console.debug(data.toString());
        })
        // 退出时删除临时文件
        result.on('close', code => {
            // 删除临时文件
            allFiles.forEach(elem => {
                fs.unlinkSync(elem);
            });
            if (out) {
                fs.unlinkSync(out);
            }
        })
    }
}

// 生成合并视频的列表文件
function concatList (files, out) {
    const output = files.map(val => { return 'file \'' + val + '\'' }).join('\n');
    fs.writeFileSync(out, output);
}


module.exports = {
    download,
    getVideoInfo,
    merge,
}
