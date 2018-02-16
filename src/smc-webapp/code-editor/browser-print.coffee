###
Take a PDF file and open it in a new tab to be printed from browser
###

misc = require('smc-util/misc')
{required, defaults} = misc

exports.print = (opts) ->
    opts = defaults opts,
        pdf : required   # filename that should end in pdf

    console.log 'todo', opts.pdf