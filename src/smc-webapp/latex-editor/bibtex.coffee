###
Run BibTex
###

misc                 = require('smc-util/misc')
{required, defaults} = misc
{webapp_client}      = require('../webapp_client')
util                 = require('./util')

exports.bibtex = (opts) ->
    opts = defaults opts,
        path       : required
        project_id : required
        time       : undefined  # time to use for aggregate
        cb         : required     # cb(err, build output)

    locals = util.parse_path(opts.path)  # base, directory, filename
    webapp_client.exec
        allow_post  : false  # definitely could take a long time to fully run sage
        timeout     : 15
        command     : 'bibtex'
        args        : [locals.base]
        project_id  : opts.project_id
        path        : locals.directory
        err_on_exit : false
        aggregate   : opts.time
        cb          : opts.cb
