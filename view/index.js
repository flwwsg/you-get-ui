const { ipcRenderer } = require('electron');

const inputUrl = document.querySelector('#input-url');
const searchIcon = document.querySelector('.ui-icon-search');
const tbl = document.querySelector('.ui-table');
const loginAction = document.querySelector('#login');
const hello = document.querySelector('#hello');
const updatePath = document.querySelector('#updatePathBtn');
const currentPath = document.querySelector('#currentPath');
const videoTitle = document.querySelector('#videoTitle');
const updateVideoTitle = document.querySelector('#updateVideoTitle');
const downloadBtn = document.querySelector('#downloadBtn');

let count = 1;
let allFiles = [];
let title = '';
let ext = '';
let checked = [];
const partsName = {};
let checkedParts = [];
const mixTable = new Table(tbl, {
    onCheck: function ( isAllChecked, isAllUnchecked, eleCheckbox, eleAllTdCheckbox) {
        // console.log( isAllChecked, isAllUnchecked, eleCheckbox, eleCheckbox.checked);
        downloadBtn.disabled = false;
        checked = [];
        checkedParts = [];
        for (const ele of eleAllTdCheckbox) {
            if (ele.checked) {
                const p = ele.id.slice(3);
                checked.push(p);
                checkedParts.push(partsName[p]);
            }
        }
        console.log(checked);
    }
});

downloadBtn.addEventListener('click', () => {
    downloadBtn.disabled = true;
    ipcRenderer.send('download-selected', videoTitle.innerHTML, checked, checkedParts);
});

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
    ipcRenderer.send('get-video-info', inputUrl.value);
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
});

ipcRenderer.on('set-titles', (event, parts, title) => {
    let index = 0;
    parts.forEach((ele, i) => {
        index++;
        const nextRow = tbl.insertRow();
        const cellChk = nextRow.insertCell(0);
        const cellTitle = nextRow.insertCell(1);
        const cellProgress = nextRow.insertCell(2);
        const id = 'chk'+index;
        const progressId = 'progress' + index;
        cellChk.innerHTML = `<td><input type="checkbox" id="${id}"><label class="ui-checkbox" for="${id}"></label></td>`
        cellTitle.innerHTML = ele;
        cellProgress.innerHTML = `<progress class="ui-progress" id="${progressId}"></progress>`;
        partsName[i+1] = ele;
    });
    videoTitle.innerHTML = title;
});

ipcRenderer.on('downloading', (event, index, downloadSize, totalSize) => {
    const el = document.querySelector(`#progress${index}`);
    el.value = Number(downloadSize/totalSize).toFixed(2);
});

ipcRenderer.on('error-download', (event, msg) => {
    inputUrl.readOnly = false;
    inputUrl.value = '';
})

ipcRenderer.on('finish-download', (event, filepath) => {
    // allFiles.push(filepath);
    // if (allFiles.length === 2) {
    //     inputUrl.readOnly = false;
    //     inputUrl.value = '';
    //     // TODO 临时处理
    //     ipcRenderer.send('merge-movie', allFiles, 'TODO', 'mp4');
    // }
});

// 登录成功, 构建 cookie, header
ipcRenderer.on('login-success', (event, uname) => {
    // 移除登录按钮
    loginAction.parentNode.removeChild(loginAction);
    hello.innerHTML =  'hi, '+uname;

});
