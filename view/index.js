const { ipcRenderer } = require('electron');
const { channelName } = require('../utils/constants');

const inputUrl = document.querySelector('#input-url');
const searchIcon = document.querySelector('.ui-icon-search');
const tbl = document.querySelector('.ui-table');
const loginAction = document.querySelector('#login');
const hello = document.querySelector('#hello');
const updatePath = document.querySelector('#updatePathBtn');
const currentPath = document.querySelector('#currentPath');
const videoTitle = document.querySelector('#videoTitle');
const downloadBtn = document.querySelector('#downloadBtn');
const clearBtn = document.querySelector('#clearBtn');

let checked = [];
const partsName = {};
let checkedParts = [];
const chineseCh = ['，',' 。','！','？', '【','】','（',' ）'];
const englishCh = [',', '.', '!', '?','[', ']', '(', ')'];
const mixTable = new Table(tbl, {
    onCheck: function ( isAllChecked, isAllUnchecked, eleCheckbox, eleAllTdCheckbox) {
        // console.log( isAllChecked, isAllUnchecked, eleCheckbox, eleCheckbox.checked);
        downloadBtn.disabled = false;
        clearBtn.disabled = false;
        checked = [];
        checkedParts = [];
        for (const ele of eleAllTdCheckbox) {
            if (ele.checked) {
                const p = ele.id.slice(3);
                checked.push(p);
                checkedParts.push(partsName[p]);
            }
        }
    },
    data: {

    },
});

// 删除选中的内容
clearBtn.addEventListener('click', () => {
    const body = tbl.getElementsByTagName('tbody')[0];
    checked.forEach( value => {
        const chk = document.querySelector('#chk'+value);
        // 删除 tr 节点
        body.removeChild(chk.parentNode.parentNode);
    });
    checked = [];
    checkedParts = [];
});

downloadBtn.addEventListener('click', () => {
    downloadBtn.disabled = true;
    clearBtn.disabled = true;
    ipcRenderer.send(channelName.downloadSelected, videoTitle.value, checked, checkedParts);
});

// update current path
if (localStorage.getItem('savePath')) {
    currentPath.innerHTML = localStorage.getItem('savePath');
} else {
    currentPath.innerHTML = '视频默认保存在当前目录,点击按钮更新路径'
}
searchIcon.addEventListener('click', () => {
    ipcRenderer.send(channelName.queryVideoInfo, inputUrl.value, currentPath.innerHTML);
})

loginAction.addEventListener('click', (event) => {
    event.preventDefault();
    ipcRenderer.send(channelName.login);
})

// 打开文件保存对话框
updatePath.addEventListener('click', () => {
    ipcRenderer.send(channelName.changeSavePath);
})

ipcRenderer.on(channelName.displaySavePath, (event, filePath) => {
    localStorage.setItem('savePath', filePath);
    currentPath.innerHTML = filePath;
});

ipcRenderer.on(channelName.updateTitle, (event, parts, title) => {
    let index = 0;
    // start download
    if (tbl.getElementsByTagName('tbody').length > 0) {
        tbl.removeChild(tbl.getElementsByTagName('tbody')[0]);
    }
    // 使用 Table 组件,空数据时,会删除 tbody 节点
    if (tbl.getElementsByTagName('tbody').length < 1) {
        tbl.appendChild(document.createElement('tbody'));
    }
    parts.forEach((ele, i) => {
        index++;
        const nextRow = tbl.getElementsByTagName('tbody')[0].insertRow();
        const cellChk = nextRow.insertCell(0);
        const cellTitle = nextRow.insertCell(1);
        const cellProgress = nextRow.insertCell(2);
        const id = 'chk'+index;
        const progressId = 'progress' + index;
        cellChk.innerHTML = `<td><input type="checkbox" id="${id}"><label class="ui-checkbox" for="${id}"></label></td>`
        cellTitle.innerHTML = ele;
        cellProgress.innerHTML = `<progress class="ui-progress" id="${progressId}"></progress>`;
        partsName[i+1] = normalFileName(ele);
    });
    videoTitle.value = title;
});

ipcRenderer.on(channelName.downloading, (event, index, downloadSize, totalSize) => {
    const el = document.querySelector(`#progress${index}`);
    el.value = Number(downloadSize/totalSize).toFixed(2);
});

ipcRenderer.on(channelName.downloadFailed, (event, msg) => {
    inputUrl.readOnly = false;
    inputUrl.value = '';
})


// 登录成功, 构建 cookie, header
ipcRenderer.on(channelName.loginSuccess, (event, uname) => {
    // 移除登录按钮
    loginAction.parentNode.removeChild(loginAction);
    hello.innerHTML =  'hi, '+uname;
});

function normalFileName(s) {
    for (let i = 0; i < chineseCh.length; i++) {
        const reg = new RegExp(chineseCh[i], 'g');
        s.replace(reg, englishCh[i]);
    }
    return s.replace(/\//g, '-');
}
