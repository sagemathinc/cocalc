###
Convert Rst file to hidden HTML file, which gets displayed in an iframe with
src pointed to this file (via raw server).
###

{flatten}            = require('underscore')
misc                 = require('smc-util/misc')

{required, defaults} = misc

{aux_file}           = require('../code-editor/util')
{webapp_client}      = require('../webapp_client')

exports.convert = (opts) ->
    opts = defaults opts,
        path       : required
        project_id : required
        time       : undefined
        cb         : required
    webapp_client.exec
        command     : 'rst2html'
        args        : [opts.path, aux_file(opts.path, 'html')]
        project_id  : opts.project_id
        err_on_exit : true
        aggregate   : opts.time
        cb          : opts.cb
