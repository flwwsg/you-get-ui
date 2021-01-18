const { ipcRenderer } = require('electron');

const inputUrl = document.querySelector('#input-url');
// const search = document.querySelector('.ui-input-search');
const searchIcon = document.querySelector('.ui-icon-search');
// 记录提交

searchIcon.addEventListener('click', () => {
    console.log('input url by search icon', inputUrl.value);
    inputUrl.readOnly = true;
    // start download
    ipcRenderer.send('start-download', inputUrl.value);
})

ipcRenderer.on('error-download', (event, msg) => {
    alert(msg);
    inputUrl.readOnly = false;
    inputUrl.value = '';
})

ipcRenderer.on('finish-download', (event, msg) => {
    alert(msg);
    inputUrl.readOnly = false;
    inputUrl.value = '';
})
