'use strict';
const { buildHeaders, retryGetContents, retryGetSize } = require('../utils/net');
const cheerio = require('cheerio');
const htmlparser2 = require('htmlparser2');
const crypto = require('crypto');

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
    let baseUrl = url.split('?')[0];
    if (baseUrl[baseUrl.length - 1] === '/') {
        baseUrl = baseUrl.slice(0, baseUrl.length - 1)
    }
    // get initial_state and playInfo
    let headers = await buildHeaders();
    const res = await retryGetContents(url, headers);
    let htmlContent = res[0];
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
 * 查询下载地址
 * @param url
 * @param title
 * @param p
 * @param currentWindow
 * @param logger
 * @returns {Promise<null|{size: number}>}
 */
async function queryDownloadUrl(url, title, p, currentWindow, logger) {
    // 下载的地址
    const streams = {};
    const dashStreams = {};
    let bestStream;
    let bestDashStream = { size: 0};
    // get initial_state and playInfo
    let headers = await buildHeaders();
    logger.debug('get html content', p);
    const res = await retryGetContents(url, headers);
    let htmlContent = res[0];
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
    // // get format from api 貌似不需要
    // for (const qn of [120, 112, 80, 64, 32, 16]) {
    //     if(!currentQuality || qn < currentQuality) {
    //         const apiUrl = await bilibiliApi(avid, cid, qn);
    //         headers = await buildHeaders(url);
    //         logger.debug('get api player info content', p, qn);
    //         const apiPlayInfo = await getContent(apiUrl, headers);
    //         if (apiPlayInfo.code === 0) {
    //             // success
    //             playInfos.push(apiPlayInfo);
    //         } else {
    //             logger.error('query bilibili api fail with', apiPlayInfo);
    //         }
    //     }
    //
    //     if (!bestQuality || qn <= bestQuality) {
    //         const apiUrl = await bilibiliInterfaceApi(cid, qn);
    //         headers = await buildHeaders(url);
    //         logger.debug('get api player info interface content', p, qn);
    //         const apiPlayInfoData = await getContent(apiUrl, headers);
    //         if (apiPlayInfoData.quality) {
    //             playInfos.push({
    //                 code: 0,
    //                 message: 0,
    //                 ttl: 1,
    //                 data: apiPlayInfoData
    //             });
    //         }
    //     }
    // }
    if (!playInfos) {
        console.error('try get play info fail.');
        process.exit(1);
    }
    logger.debug('query', p, 'play infos', JSON.stringify(playInfos));
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
                logger.debug('get size of', p, baseUrl);
                let size = 0;
                const res = await retryGetSize(baseUrl, headers);
                size = res[0];
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
                        logger.debug('get audio size of', p, audioBaseUrl);
                        const res = await retryGetSize(audioBaseUrl, headers);
                        audioSizeCache[audioQuality] = res[0];
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
    logger.debug('query', p, 'best stream', JSON.stringify(bestStream),  'best dash stream', JSON.stringify(bestDashStream));
    if (bestDashStream.size > 0) {
        // 归一化,src 字段
        bestDashStream.src = bestDashStream.src.map(value => {
            return value[0];
        });
        return bestDashStream;
    } else {
        // 光能使者第 8 集是flv
        return bestStream
    }
}

/**
 * 获取用户名
 * @param session
 * @returns {Promise<*>}
 */
async function getUsername(session) {
    const res = await session.defaultSession.cookies.get({domain: '.bilibili.com'});
    const list = [];
    res.filter(value => {
        if (value.path === '/') {
            list.push(`${value.name}=${value.value}`);
        }
    })
    const cookies = list.join('; ');
    console.log(cookies);
    const headers = await buildHeaders('https://www.bilibili.com', cookies);
    const result = await retryGetContents('https://api.bilibili.com/x/web-interface/nav', headers);
    const contents = result[0];
    return contents.data.uname;

}

module.exports = {
    getVideoInfo,
    queryDownloadUrl,
    getUsername,
}
