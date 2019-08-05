const $ = require('jquery');

window.addEventListener('load', () => {
    $('#scratch').on('click', () => alert("Hello"))

    let scratch = $('#scratch')
    if(scratch)
        scratch.click(() => alert('Hello there again!'))
})
