###
Convert a file on the backend to PDF..
###

misc                 = require('smc-util/misc')
{required, defaults} = misc
{webapp_client}      = require('../webapp_client')

exports.convert = (opts) ->
    opts = defaults opts,
        path : required
        cb   : required
    console.log 'convert', opts.path
    pdf = opts.path + '.pdf'
    #webapp_client.exec
    opts.cb(undefined, pdf)