'use strict';

const fs = require('fs');
const axios = require('axios');

/**
 * 获取get 请求
 * @param url
 * @param headers
 */
const getContent = async function (url, headers) {
    const content = await axios.get(url, {
        headers
    });
    return content.data;
}


/**
 * 请求头，加上 referer， cookie
 * @param referer
 * @param cookie
 */
const buildHeaders = async function (referer, cookie) {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36';
    const headers = {Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.5', 'User-Agent': ua};
    if (undefined !== referer && referer !== null) {
        headers.Referer = referer;
    }
    if (undefined !== cookie && referer !== null) {
        headers.Cookie = cookie;
    }
    return headers;
}

// 获取长度
const getSize = async function(url, headers) {
    const content = await axios.get(url, {
        headers,
        // 只需要知道长度
        responseType: "stream",
    });
    const size = content.headers['content-length'];
    return parseInt(size);
}

const saveContent = async function(currentWindow, index, url, filepath, urlHeaders, method) {
    if (undefined === method || method === null) {
        method = 'GET'
    }
    const { data, headers } = await axios({
        url,
        method,
        responseType: 'stream',
        headers: urlHeaders,
    });
    const totalSize = parseInt(headers['content-length']);
    let downloadSize = 0;
    data.on('data', chunk => {
        downloadSize += chunk.length;
        console.log(`downloading progress ${downloadSize/totalSize}`);
        currentWindow.webContents.send('downloading', index, downloadSize, totalSize, filepath);
    });

    const writer = fs.createWriteStream(filepath);
    data.pipe(writer)
    writer.on('finish', () => {
        currentWindow.webContents.send('finish-download', filepath);
    })
}


module.exports = {
    getContent,
    buildHeaders,
    getSize,
    saveContent,
}
