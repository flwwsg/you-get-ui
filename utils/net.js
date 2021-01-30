'use strict';

const fs = require('fs');
const axios = require('axios');
const { channelName, userAgent } = require('./constants');
const { retryFunc } = require('./common');

/**
 * 获取get 请求
 * @param url
 * @param headers
 */
const getContent = async function (url, headers) {
    const content = await axios({
        url,
        method: 'get',
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
// 单独处理，不能使用 retry
const saveContents = async function(currentWindow, index, url, urlHeaders, conf, cb) {
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
    return data;
}

const retryGetContents = async function(url, headers) {
    return retryFunc(console, 5, getContent, url, headers);
}

const retryGetSize = async function(url, headers) {
    return retryFunc(console, 5, getSize, url, headers);
}

const retrySaveContents = async function(logger, currentWindow, index, url, headers, conf, cb) {
    return retryFunc(logger, 5, saveContents, currentWindow, index, url, headers, conf, cb);
}

module.exports = {
    buildHeaders,
    retryGetContents,
    retryGetSize,
    retrySaveContents,
}
