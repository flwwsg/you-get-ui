'use strict';

const fs = require('fs');
const axios = require('axios');
const { channelName, userAgent } = require('./constants');

// 获取 http 链接
const getClient = (timeout) => {
    const httpClient = axios.create();
    // 超时3秒
    httpClient.defaults.timeout = timeout || 10000;
    return httpClient;
}

/**
 * 获取get 请求
 * @param url
 * @param headers
 */
const getContent = async function (url, headers) {
    const content = await axios({
        url,
        method: 'get',
        timeout: 10*1000,
        headers,
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
    const cancelToken = axios.CancelToken;
    const source = cancelToken.source();
    const content = await axios({
        url,
        timeout: 10*1000,
        headers,
        // 只需要知道长度
        responseType: "stream",
        cancelToken: source.token,
    });
    const size = content.headers['content-length'];
    // 不取消的话,会阻塞连接 TODO 只连接一次,不预先获取 size
    source.cancel('cancel get size of ' + url);
    return parseInt(size);
}

// 下载视频, TODO 支持断点续传
const saveContents = async function(currentWindow, index, url, urlHeaders, conf, cb) {
    const { data } = await getClient().request({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: urlHeaders,
        // 5s
        timeout: 1000 * 10,
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
        cb(conf.p, index).then(res => {
            console.debug('write success', filepath);
        });
    });
    // onDownloadProgress 只支持 xhr
}

module.exports = {
    getContent,
    buildHeaders,
    getSize,
    saveContents,
}
