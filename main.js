const { app, BrowserWindow, ipcMain, session } = require('electron');
const { download } = require('./downloader');
const { getContent, buildHeaders } = require('./utils/net');
let mainWindow;
let cookies;
// 启动app
app.on('ready', () => {
    // createWindow
    mainWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            // enableRemoteModule: true,
        }
    })
    mainWindow.loadFile(`${__dirname}/view/index.html`);
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    })
    mainWindow.openDevTools();
});

// 从页面接收url
ipcMain.on('start-download', (event, url) => {
    console.log(url);
    download(url, mainWindow).then(res => {
        // mainWindow.webContents.send('error-download', res);
    }).catch(err => {
        console.error(err);
        mainWindow.webContents.send('error-download', err.message);
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

function getUsername() {
    session.defaultSession.cookies.get({domain: '.bilibili.com'}).then(res => {
        const list = [];
        res.filter(value => {
            if (value.path === '/') {
                list.push(`${value.name}=${value.value}`);
            }
        })
        cookies = list.join('; ');
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
