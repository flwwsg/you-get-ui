'use strict';

const fs = require('fs');
const axios = require('axios');
const httpClient = axios.create();
// 超时3秒
httpClient.defaults.timeout = 3000;
/**
 * 获取get 请求
 * @param url
 * @param headers
 */
const getContent = async function (url, headers) {
    const content = await httpClient.get(url, {
        headers
    });
    return content.data;
}


/**
 * 请求头，加上 referer， cookie
 * @param referer
 * @param cookie
 * @param origin
 */
const buildHeaders = async function (referer, cookie, origin) {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36';
    const headers = {Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.5', 'User-Agent': ua};
    if (undefined !== referer && referer !== null) {
        headers.Referer = referer;
    }
    if (undefined !== cookie && referer !== null) {
        headers.Cookie = cookie;
    }
    if (undefined !== origin && origin !== null) {
        headers.Origin = origin;
    }
    return headers;
}

// 获取长度
const getSize = async function(url, headers) {
    const content = await httpClient.get(url, {
        headers,
        // 只需要知道长度
        responseType: "stream",
    });
    const size = content.headers['content-length'];
    return parseInt(size);
}


const retrySaveContent = async function(currentWindow, index, url, urlHeaders, conf, cb) {
    for (let i = 0; i < 5; i++) {
        try {
            const { data } = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                headers: urlHeaders,
            });
            const filepath = conf.filePath[index];
            data.on('data', chunk => {
                conf.partial[index] += chunk.length;
                let s = 0;
                conf.partial.forEach( val => s += val);
                // console.debug(`downloading ${s/conf.totalSize}`);
                currentWindow.webContents.send('downloading', conf.p, s, conf.totalSize);
            });

            const writer = fs.createWriteStream(filepath);
            data.pipe(writer)
            writer.on('finish', () => {
                cb(conf.p).then(res => {
                    console.debug(res);
                });
            })
        } catch (e) {
            console.error('download fail, retry now\n', e);
        }
    }
}

module.exports = {
    getContent,
    buildHeaders,
    getSize,
    retrySaveContent,
}
