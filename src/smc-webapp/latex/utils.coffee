{defaults, required} = misc = require('smc-util/misc')
{webapp_client} = require('../webapp_client')

# Make a (server-side) self-destructing temporary uuid-named directory in path.
exports.tmp_dir = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        ttl        : 120            # self destruct in this many seconds
        cb         : required       # cb(err, directory_name)
    path_name = "." + misc.uuid()   # hidden
    if "'" in opts.path
        opts.cb("there is a disturbing ' in the path: '#{opts.path}'")
        return
    remove_tmp_dir
        project_id : opts.project_id
        path       : opts.path
        tmp_dir    : path_name
        ttl        : opts.ttl
    webapp_client.exec
        project_id : opts.project_id
        path       : opts.path
        command    : "mkdir"
        args       : [path_name]
        cb         : (err, output) =>
            if err
                opts.cb("Problem creating temporary directory in '#{opts.path}'")
            else
                opts.cb(false, path_name)

remove_tmp_dir = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        tmp_dir    : required
        ttl        : 120            # run in this many seconds (even if client disconnects)
        cb         : undefined
    webapp_client.exec
        project_id : opts.project_id
        command    : "sleep #{opts.ttl} && rm -rf '#{opts.path}/#{opts.tmp_dir}'"
        timeout    : 10 + opts.ttl
        cb         : (err, output) =>
            cb?(err)
