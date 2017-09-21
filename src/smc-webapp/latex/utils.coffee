{defaults, required} = misc = require('smc-util/misc')
{webapp_client} = require('../webapp_client')

# Make a (server-side) self-destructing temporary uuid-named directory in path.
exports.tmp_dir = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        ttl        : 60             # self destruct tmp dir in this many seconds
        cb         : required       # cb(err, directory_name)
    path_name = 'tex-preview-' + misc.uuid().slice(0,8)
    if "'" in opts.path
        opts.cb("there is a disturbing ' in the path: '#{opts.path}'")
        return
    remove_tmp_dirs
        project_id : opts.project_id
        path       : opts.path
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

# remove any tex-preview dirs that are older than ttl seconds.
# NOTE: err isn't unlikely due to several of these happening at once.
remove_tmp_dirs = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        ttl        : 60            # run the remove in this many seconds
        cb         : undefined
    # Note: if the browser disconnects or refreshes before this f is
    # run, then the tmp dir will not get cleaned up.   This is OK with
    # kucalc, since it's tmpfs local to the project, and will get fixed
    # longrun by replacing this code by a stateful backend.
    #console.log 'setting timer to do rm_tmp'
    rm_tmp = ->
        command = "find . -type d -name 'tex-preview-*' -not -newermt '-#{opts.ttl} seconds' -exec rm -rf {} \\;"
        #console.log 'doing rm_tmp', command
        webapp_client.exec
            project_id : opts.project_id
            path       : opts.path
            command    : command
            cb         : (err, output) =>
                #console.log 'rm_tmp', opts.tmp_dir, err, output
                opts.cb?(err)
    setTimeout(rm_tmp, opts.ttl*1000)