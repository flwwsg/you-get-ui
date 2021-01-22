const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const { download, getVideoInfo, merge } = require('./downloader');
const { getContent, buildHeaders } = require('./utils/net');
const fs = require('fs');

let mainWindow;
// 貌似不需要 cookies 也能下载高清视频...,这就很尴尬了
let cookies;
// 需要下载的视频
let needDownload = [];
// 已经下载好的视频
let downloaded = []
let baseUrl = '';
let watcher;
let isDownloading = false;
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
        mainWindow.openDevTools();
    })
});

// 从页面接收url
ipcMain.on('get-video-info', async (event, url) => {
    console.log(url);
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
ipcMain.on('download-selected', async (event, title, pList) => {
    pList.forEach(item => {
        if (!downloaded.includes(item)) {
            needDownload.push(item);
        }
    });
    if (needDownload.length > 0 && !isDownloading) {
        const next = needDownload.shift();
        await download(baseUrl+'?p='+needDownload.shift(), title, next, mainWindow)
    }
})


ipcMain.on('merge-movie', (event, files, title, ext) =>{
    merge(files, title, ext).then(res => {
        if (needDownload.length > 0) {
            const next = needDownload.shift();
           download(baseUrl+'?p='+next, title, next, mainWindow).then(res => {
           });
        }
    }).catch(err => {
        console.error(err);
    })
})

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
    loginWindow.openDevTools();
})

ipcMain.on('update-path', async () => {
    const files = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    if (files.canceled) {
        return;
    }
    // 通知页面保存文件路径
    mainWindow.webContents.send('render-save-path', files.filePaths[0]);
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
