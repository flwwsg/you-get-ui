'use strict';

// 重试函数
const retryFunc = async function(logger, count, asyncCallback, ...args) {
    if (undefined === count || count === null || isNaN(parseInt(count))) {
        // 至少跑一次
        count = 1;
    }
    if (count < 1) {
        logger.error('retry failed');
        // 结果, 是否成功
        return [ null, false ];
    }
    try {
        logger.debug('try function remain', count , 'times', asyncCallback.name, JSON.stringify(args));
        const res = await asyncCallback(...args);
        return [ res, true ];
    } catch (e) {
        logger.error('execute asyncCallback failed', asyncCallback.name, e.stack);
        return retryFunc(logger, count-1, asyncCallback, ...args);
    }
};

module.exports = {
    retryFunc,
}
