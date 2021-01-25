'use strict';

// 信号通道名称
const channelName = {
    // 获取视频信息
    queryVideoInfo: 'query-video-info',
    // 下载选中的视频
    downloadSelected: 'download-selected',
    // 登录 b 站
    login: 'login',
    // 登录成功
    loginSuccess: 'login-success',
    // 更新保存目录
    changeSavePath: 'change-save-path',
    // 显示保存目录
    displaySavePath: 'display-save-path',
    // 正在下载
    downloading: 'downloading',
    // 更新标题
    updateTitle: 'update-title',
    // 下载失败
    downloadFailed: 'download-failed',
};

const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Safari/537.36';

module.exports = {
    channelName,
    userAgent,
}
