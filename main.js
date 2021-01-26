'use strict';

const log = require('why-is-node-running');
// const hd = require('heapdump');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, session, dialog, Tray, Menu } = require('electron');
const { getVideoInfo, queryDownloadUrl, getUsername } = require('./extractor/bilibili');
const { buildHeaders, saveContents } = require('./utils/net');
const { channelName, userAgent } = require('./utils/constants');
const { retryFunc } = require('./utils/common');
const { merge } = require("./utils/video");
const path = require('path');

let mainWindow;
// 貌似不需要 cookies 也能下载高清视频...,这就很尴尬了
let cookies;
// 需要下载的视频
let needDownload = [];
// 已经下载好的视频
let downloaded = []
let baseUrl = '';
let title = '';
// 正在下载
// { p: {filePath: [], partial: [], size: 0} };
const downloading = {};
// 分集名字
const partsName = {};
let failedParts = [];
let saveDir = '';
let tray;

// 启动app
app.whenReady().then( () => {
    // createWindow
    mainWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            // enableRemoteModule: true,
        },
        width: 700,
        height: 800,
    });
    mainWindow.loadFile(`${__dirname}/view/index.html`);
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // mainWindow.openDevTools();
    });

    // 设置托盘
    tray = new Tray(path.join(__dirname, 'view', 'download.png'));
    tray.setToolTip('downloader');
    const contextMenu = Menu.buildFromTemplate([
        // 退出
        {
            label: 'Exit',
            type: 'normal',
            role: 'quit',
        }
    ])
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    })
    // 关闭窗口时,不退出
    mainWindow.on('close', event => {
        if (mainWindow.isVisible()) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
});


// 从页面接收url
ipcMain.on(channelName.queryVideoInfo, async (event, url, currentPath) => {
    if (needDownload.length > 0 || Object.keys(downloading).length > 0) {
        await dialog.showMessageBox(mainWindow, {
            title: '下载中,请稍等',
            message: '下载中,请稍等',
        });
        return;
    }
    try {
        fs.lstatSync(currentPath);
    } catch (e) {
        console.error(e.message);
        await dialog.showMessageBox(mainWindow, {
            title: '文件保存路径错误',
            message: `${currentPath} 不存在`,
        });
        return;
    }
    saveDir = currentPath;
    failedParts = [];
    const res = await getVideoInfo(url);
    if (res) {
        const title = res.title;
        const parts = res.parts;
        baseUrl = res.baseUrl;
        mainWindow.webContents.send(channelName.updateTitle, parts, title);
    } else {
        await dialog.showMessageBox(mainWindow, {
            title: 'tips',
            message: '不支持的地址',
        });
        mainWindow.webContents.send(channelName.downloadFailed);
    }
})

// 下载所选
ipcMain.on(channelName.downloadSelected, async (event, videoTitle, pList, parts) => {
    title = videoTitle.replace(/[\/\\]/g, '-');
    pList.forEach((item, i) => {
        if (!downloaded.includes(item) && !downloading[item]) {
            needDownload.push(item);
            partsName[item] = parts[i];
        }
    });
    await download();
})

ipcMain.on(channelName.login, () => {
    const url = 'https://passport.bilibili.com/login';
    const loginWindow = new BrowserWindow({
            webPreferences: {
                nodeIntegration: true,
            }
        })
    loginWindow.loadURL(url, {
        userAgent,
    }).then(() => {
        const waitForLogin = setInterval(() => {
            const nextUrl = loginWindow.webContents.getURL();
            // const agent = loginWindow.webContents.getUserAgent();
            // console.log(nextUrl, agent);
            if (nextUrl === url) {
                // 未登录
                console.log('please login...');
            } else {
                // 登录成功
                clearInterval(waitForLogin);
                loginWindow.close();
                // 通知 renderer 更新页面
                mainWindow.webContents.send(channelName.loginSuccess);
            }
        }, 2000);

    }).catch(err => {
        // 肯定是已经登录成功了
        console.error(err);
        loginWindow.on('ready-to-show', () => {
            // 拼接 cookie, 获取昵称
            getUsername(session).then(uname => {
                mainWindow.webContents.send(channelName.loginSuccess, uname);
            });
            loginWindow.close();
        });
    })
})

ipcMain.on(channelName.changeSavePath, async () => {
    const files = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    if (files.canceled) {
        return;
    }
    // 通知页面保存文件路径
    saveDir = files.filePaths[0];
    mainWindow.webContents.send(channelName.displaySavePath, files.filePaths[0]);
})

// 合并视频
async function mergeMovie(p) {
    const conf = downloading[p];
    if (undefined === conf || failedParts.includes(p)) {
        // 肯定是被跳过了
        return;
    }
    conf.count ++;
    if (conf.count !== conf.filePath.length) {
        // 只在最后一个 promise 内合并
        return;
    }
    await merge(conf.filePath, conf.saveName);
    downloaded.push(p);
    delete downloading[p];
    await download();
}


async function download() {
    // 同时下载的个数为多个时,下载会死机... FIXME
    if (needDownload.length > 0) {
        const remain = 3 - Object.keys(downloading).length;
        if (remain < 1) {
            return;
        }
        for(let r = 0; r < remain; r++) {
            const next = needDownload.shift();
            if (undefined === next) {
                // 没有东西了
                break;
            }
            if (failedParts.includes(next)) {
                // 删除之前失败的视频
                const index = failedParts.indexOf(next);
                failedParts = [].concat(failedParts.slice(0, index), failedParts.slice(index + 1, failedParts.length));
            }
            const downloadUrl = baseUrl+'?p='+next;
            console.debug('downloading', downloadUrl);
            downloading[next] = {
                // 临时保存的文件路径
                filePath: [],
                // 下载的临时数据
                partial: [],
                totalSize: 0,
                p: next,
                // 最后保存的路径
                saveName: '',
                count: 0,
            };
            // bestSource = { container: '扩展名', quality: '品质', src: [[下载地址列表]], size: 总大小 }
            const res = await retryFunc(5, queryDownloadUrl, downloadUrl, title, parseInt(next), mainWindow);
            if (!res[1]) {
                // 下载失败, 跳过
                // 失败了,先下载别的.等待下一次循环
                failedParts.push(next);
                delete downloading[next];
                console.error('skip', next);
                r--;
                continue;
            }
            const bestSource = res[0];
            if (bestSource === null || bestSource.size === 0) {
                // 跳过这个视频
                console.error('error query url', next, 'skip');
                r--;
                continue;
            }
            downloading[next].totalSize = bestSource.size;
            downloading[next].partial = Array.from({length: bestSource.src.length}, (() => 0));
            // console.debug(JSON.stringify(bestSource));
            const ext = bestSource.container;
            const headers = await buildHeaders(downloadUrl);
            downloading[next].filePath = Array.from({length: bestSource.src.length},
                ((v, i) => `${saveDir}/${title}[${i}]${partsName[next]}.${ext}`));
            downloading[next].saveName = `${saveDir}/${title}${partsName[next]}.${ext}`;
            for (let i = 0; i < bestSource.src.length; i++) {
                const res = await retryFunc(5, saveContents, mainWindow, i, bestSource.src[i], headers, downloading[next], mergeMovie);
                if (!res[1]) {
                    // 下载失败了
                    failedParts.push(next);
                    delete downloading[next];
                    console.error('skip', next);
                }
            }
        }

    }
}

process.on('uncaughtException', function (err) {
    console.error('get uncaught exception', err.stack);
})

// 检测保存运行node的进程
setInterval(function () {
    log() // logs out active handles that are keeping node running
}, 10000)

// function writeSnapshot() {
//     hd.writeSnapshot(path.join(path.join(__dirname, 'tmp'), Date.now().toString()+'.heapsnapshot'));
// }
// TODO
// kill -USR2 <pid> ,记录内存使用
