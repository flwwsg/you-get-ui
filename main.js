const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const { download, getVideoInfo, merge } = require('./downloader');
const { getContent, buildHeaders, saveContent } = require('./utils/net');

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

// 启动app
app.on('ready', () => {
    // createWindow
    mainWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            // enableRemoteModule: true,
        },
        width: 1500,
        height: 2000,
    })
    mainWindow.loadFile(`${__dirname}/view/index.html`);
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // mainWindow.openDevTools();
    })
});

// 从页面接收url
ipcMain.on('get-video-info', async (event, url, currentPath) => {
    if (needDownload.length > 0 || Object.keys(downloading).length > 0) {
        await dialog.showMessageBox(mainWindow, {
            title: '下载中,请稍等',
            message: '下载中,请稍等',
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
        mainWindow.webContents.send('set-titles', parts, title);
    } else {
        await dialog.showMessageBox(mainWindow, {
            title: 'tips',
            message: '不支持的地址',
        });
        mainWindow.webContents.send('error-download');
    }
})

// 下载所选
ipcMain.on('download-selected', async (event, videoTitle, pList, parts) => {
    title = videoTitle;
    pList.forEach((item, i) => {
        if (!downloaded.includes(item) && !downloading[item]) {
            needDownload.push(item);
            partsName[item] = parts[i];
        }
    });
    await downloadP();
})

async function downloadP() {
    // 同时下载的个数为1, 多个下载会死机... FIXME
    if (needDownload.length > 0) {
        const remain = 1 - Object.keys(downloading).length;
        if (remain < 1) {
            return;
        }
        for(let i = 0; i < remain; i++) {
            const next = needDownload.shift();
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
            const bestSource = await retryDownload(downloadUrl, title, parseInt(next), mainWindow);
            if (!bestSource) {
                // 跳过这个视频
                i--;
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
                // TODO support saving path
                await saveContent(mainWindow, i, bestSource.src[i][0], headers, downloading[next], mergeMovie);
            }
        }

    }
}

// 重试
async function retryDownload(downloadUrl, title, next, mainWindow) {
    for (let i = 0; i < 5; i++) {
        try {
            console.debug('try', i, 'times')
            const bestSource = await download(downloadUrl, title, next, mainWindow);
            if (bestSource) {
                return bestSource;
            }
        } catch (e) {
            console.error(e.message);
        }
    }
    // 失败了,先下载别的.等待下一次循环
    delete downloading[next];
    console.error('skip', next);
    return null;
}

// 合并视频
async function mergeMovie(p) {
    const conf = downloading[p];
    if (undefined === conf) {
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
    await downloadP();
}

ipcMain.on('login', () => {
    const url = 'https://passport.bilibili.com/login';
    const loginWindow = new BrowserWindow({
            webPreferences: {
                nodeIntegration: true,
                // enableRemoteModule: true,
            }
        })
    loginWindow.loadURL(url, {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36'
    }).then(res => {
        const waitForLogin = setInterval(() => {
            const nextUrl = loginWindow.webContents.getURL();
            const agent = loginWindow.webContents.getUserAgent();
            console.log(nextUrl, agent);
            if (nextUrl === url) {
                // 未登录
                console.log('please login...');
            } else {
                // 登录成功
                clearInterval(waitForLogin);
                loginWindow.close();
                // 通知 renderer 更新页面
                mainWindow.webContents.send('login-success');
            }
        }, 2000);

    }).catch(err => {
        // 肯定是已经登录成功了
        console.error(err);
        loginWindow.on('ready-to-show', () => {
            // 拼接 cookie, 获取昵称
            getUsername();
            loginWindow.close();
        });
    })
})

ipcMain.on('update-path', async () => {
    const files = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    if (files.canceled) {
        return;
    }
    // 通知页面保存文件路径
    saveDir = files.filePaths[0];
    mainWindow.webContents.send('render-save-path', files.filePaths[0]);
})

ipcMain.on('update-video-title', async (event, videoTitle) => {
    title = videoTitle;
})

function getUsername() {
    session.defaultSession.cookies.get({domain: '.bilibili.com'}).then(res => {
        const list = [];
        res.filter(value => {
            if (value.path === '/') {
                list.push(`${value.name}=${value.value}`);
            }
        })
        cookies = list.join('; ');
        console.log(cookies);
        buildHeaders('https://www.bilibili.com', cookies).then( res => {
            getContent('https://api.bilibili.com/x/web-interface/nav', res).then( data => {
                mainWindow.webContents.send('login-success', data.data.uname);
            })
        })
        return cookies;
    }).catch(err => {
        console.error(err);
    })
}
process.on('uncaughtException', function (err) {
    console.error(err.stack);
})
