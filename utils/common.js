'use strict';

// 重试函数
const retryFunc = async function(count, asyncCallback, ...args) {
    if (undefined === count || count === null || isNaN(parseInt(count))) {
        // 至少跑一次
        count = 1;
    }
    if (count < 1) {
        console.error('retry failed');
        // 结果, 是否成功
        return [ null, false ];
    }
    try {
        console.debug('try function remain', count , 'times' );
        const res = await asyncCallback(...args);
        return [ res, true ];
    } catch (e) {
        console.error('execute asyncCallback failed', e.stack);
        return retryFunc(count--, asyncCallback, ...args);
    }
};

module.exports = {
    retryFunc,
}
