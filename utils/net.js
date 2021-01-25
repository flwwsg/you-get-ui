'use strict';

const fs = require('fs');
const axios = require('axios');
const { channelName, userAgent } = require('./constants');

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
    const headers = {Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.5', 'User-Agent': userAgent};
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

// 下载视频, TODO 支持断点续传
const saveContents = async function(currentWindow, index, url, urlHeaders, conf, cb) {
    const { data } = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: urlHeaders,
        // 5s
        timeout: 1000 * 5,
    });
    const filepath = conf.filePath[index];
    data.on('data', chunk => {
        conf.partial[index] += chunk.length;
        let s = 0;
        conf.partial.forEach( val => s += val);
        currentWindow.webContents.send(channelName.downloading, conf.p, s, conf.totalSize);
    });

    const writer = fs.createWriteStream(filepath);
    data.pipe(writer)
    writer.on('finish', () => {
        cb(conf.p).then(res => {
            console.debug('write success', filepath);
        });
    });
}

module.exports = {
    getContent,
    buildHeaders,
    getSize,
    saveContents,
}
