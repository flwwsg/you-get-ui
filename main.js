const { app, BrowserWindow, ipcMain } = require('electron');
const { download } = require('./downloader');
let mainWindow;
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
    download(url).then(res => {
        mainWindow.webContents.send('finish-download', res);
    }).catch(err => {
        console.error(err);
        mainWindow.webContents.send('error-download', err.message);
    })
})
