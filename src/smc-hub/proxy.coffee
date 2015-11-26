misc    = require('smc-util/misc')
{defaults, required} = misc

hub_projects = require('./projects')

exports.target_parse_req = (remember_me, url) ->
    v          = url.split('/')
    project_id = v[1]
    type       = v[2]  # 'port' or 'raw'
    key        = remember_me + project_id + type
    if type == 'port'
        key += v[3]
        port = v[3]
    return {key:key, type:type, project_id:project_id, port_number:port}

exports.jupyter_server_port = (opts) ->
    opts = defaults opts,
        project_id     : required   # assumed valid and that all auth already done
        compute_server : required
        database       : required
        cb             : required   # cb(err, port)
    hub_projects.new_project(opts.project_id, opts.database, opts.compute_server).jupyter_port
        cb   : opts.cb
