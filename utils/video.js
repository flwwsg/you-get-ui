'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 合并视频
async function merge(allFiles, saveName) {
    // 当前版本 ffmpeg version n4.3.1
    if (allFiles.length > 1) {
        // 需要版本 > 2
        let result;
        let out = null;
        if (path.extname(saveName) === '.flv') {
            // 合并 flv, 光能使者第8集只有 flv
            out = saveName + '.txt';
            concatList(allFiles, out);
            result = spawn('ffmpeg', ['-y', '-f', 'concat', '-safe', '-1', '-i', out, '-c', 'copy', '-bsf:a', 'aac_adtstoasc','--', saveName]);
        } else if(path.extname(saveName) === '.mp4') {
            // 合并 mp4
            const args = [ '-y' ];
            for (const f of allFiles) {
                args.push('-i');
                args.push(f);
            }
            result = spawn('ffmpeg', [...args, '-c', 'copy', '-bsf:a', 'aac_adtstoasc','--', saveName]);
        }

        result.stderr.on('data', data => {
            console.debug(data.toString());
        })
        result.stdout.on('data', data => {
            console.debug(data.toString());
        })
        // 退出时删除临时文件
        result.on('close', code => {
            // 删除临时文件
            allFiles.forEach(elem => {
                fs.unlinkSync(elem);
            });
            if (out) {
                fs.unlinkSync(out);
            }
        })
    }
}

// 生成合并视频的列表文件
function concatList (files, out) {
    const output = files.map(val => { return 'file \'' + val + '\'' }).join('\n');
    fs.writeFileSync(out, output);
}


module.exports = {
    merge,
}
