###
Run sagetex
###

misc                 = require('smc-util/misc')
{required, defaults} = misc
{webapp_client}      = require('../webapp_client')
util = require('./util')

exports.sagetex = (opts) ->
    opts = defaults opts,
        path       : required
        project_id : required
        time       : undefined  # time to use for aggregate
        cb         : required     # cb(err, build output)

    locals = util.parse_path(opts.path)  # base, directory, filename
    locals.sagetex_file = locals.base + '.sagetex.sage'
    webapp_client.exec
        allow_post  : false  # definitely could take a long time to fully run sage
        timeout     : 360
        command     : 'sage'
        args        : [locals.sagetex_file]
        project_id  : opts.project_id
        path        : locals.directory
        err_on_exit : false
        aggregate   : opts.time
        cb          : opts.cb


