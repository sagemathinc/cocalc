###
Convert Rst file to hidden HTML file, which gets displayed in an iframe with
src pointed to this file (via raw server).
###

{flatten}            = require('underscore')
misc                 = require('smc-util/misc')

{required, defaults} = misc

{aux_file}           = require('../code-editor/util')
{webapp_client}      = require('../webapp_client')

current_cbs = {}
exports.convert = (opts) ->
    opts = defaults opts,
        path       : required
        project_id : required
        time       : undefined
        cb         : required
    key = opts.project_id + opts.path
    if current_cbs[key]
        current_cbs[key].push(opts.cb)
        return
    current_cbs[key] = [opts.cb]
    webapp_client.exec
        command     : 'rst2html'
        args        : [opts.path, aux_file(opts.path, 'html')]
        project_id  : opts.project_id
        err_on_exit : true
        aggregate   : opts.time
        cb          : (err) ->
            if not current_cbs[key]? or current_cbs[key].length == 0
                return
            cb = current_cbs[key].shift()
            if misc.is_array(cb)
                for c in cb
                    c(err)
            else
                cb(err)
            v = current_cbs[key]
            delete current_cbs[key]
            if v.length > 0
                # need to run again with all these cb's, since input path
                # may have changed from when this rst2html call started!
                exports.convert(path:@props.path, project_id:@props.project, cb:flatten(v))
