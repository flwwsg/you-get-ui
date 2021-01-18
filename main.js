const { app, BrowserWindow } = require('electron');

let mainWindow;
// 启动app
app.on('ready', () => {
    // createWindow
    mainWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
        }
    })
    mainWindow.loadFile(`${__dirname}/view/index.html`);
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    })
    mainWindow.openDevTools();
});




