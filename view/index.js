
const inputUrl = document.querySelector('#input-url');
// const search = document.querySelector('.ui-input-search');
const searchIcon = document.querySelector('.ui-icon-search');
// 记录提交

searchIcon.addEventListener('click', () => {
    console.log('input url by search icon', inputUrl.value);
})

inputUrl.addEventListener('keydown', event => {
    if (event.keyCode === 13) {
        console.log(inputUrl.value);
    }
})
