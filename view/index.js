const { ipcRenderer } = require('electron');

const inputUrl = document.querySelector('#input-url');
const searchIcon = document.querySelector('.ui-icon-search');
const tbl = document.querySelector('.ui-table');
const loginAction = document.querySelector('#login');
const hello = document.querySelector('#hello');
const updatePath = document.querySelector('#updatePathBtn');
const currentPath = document.querySelector('#currentPath');

let count = 1;
let allFiles = [];
let title = '';
let ext = '';
// update current path
if (localStorage.getItem('savePath')) {
    currentPath.innerHTML = localStorage.getItem('savePath');
} else {
    currentPath.innerHTML = '视频默认保存在当前目录,点击按钮更新路径'
}
searchIcon.addEventListener('click', () => {
    console.log('input url by search icon', inputUrl.value);
    inputUrl.readOnly = true;
    // start download
    ipcRenderer.send('start-download', inputUrl.value);
})

loginAction.addEventListener('click', (event) => {
    event.preventDefault();
    ipcRenderer.send('login');
})

// 打开文件保存对话框
updatePath.addEventListener('click', () => {
    ipcRenderer.send('update-path');
})

ipcRenderer.on('render-save-path', (event, filePath) => {
    localStorage.setItem('savePath', filePath);
    currentPath.innerHTML = filePath;
})

ipcRenderer.on('set-title', (event, newTitle, newExt) => {
    const nextRow = tbl.insertRow();
    const cellChk = nextRow.insertCell(0);
    const cellTitle = nextRow.insertCell(1);
    const cellProgress = nextRow.insertCell(2);
    const id = 'chk'+count;
    const progressId = 'progress' + count;
    title = newTitle;
    ext = newExt;
    count++;
    cellChk.innerHTML = `<td><input type="checkbox" id="${id}"><label class="ui-checkbox" for="${id}"></label></td>`
    cellTitle.innerHTML = title+'.'+ext;
    cellProgress.innerHTML = `<progress class="ui-progress" id="${progressId}"></progress>`;
});

ipcRenderer.on('downloading', (event, index, downloadSize, totalSize) => {
    const el = document.querySelector(`#progress${index+1}`);
    el.value = Number(downloadSize/totalSize).toFixed(2);
});

ipcRenderer.on('error-download', (event, msg) => {
    inputUrl.readOnly = false;
    inputUrl.value = '';
})

ipcRenderer.on('finish-download', (event, filepath) => {
    allFiles.push(filepath);
    if (allFiles.length === count-1) {
        inputUrl.readOnly = false;
        inputUrl.value = '';
        ipcRenderer.send('merge-movie', allFiles, title, ext);
    }
});

// 登录成功, 构建 cookie, header
ipcRenderer.on('login-success', (event, uname) => {
    // 移除登录按钮
    loginAction.parentNode.removeChild(loginAction);
    hello.innerHTML =  'hi, '+uname;

});

const mixTable = new Table(tbl, {});
