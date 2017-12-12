"""
Server directory listing through the HTTP server

{files:[..., {size:?,name:?,mtime:?,isdir:?}]}

where mtime is integer SECONDS since epoch, size is in bytes, and isdir
is only there if true.

Obviously we should probably use POST instead of GET, due to the
result being a function of time... but POST is so complicated.
Use ?random= or ?time= if you're worried about cacheing.
"""

fs = require('fs')
async = require('async')

exports.directory_listing_router = (express) ->
    base = '/.smc/directory_listing/'
    router = express.Router()
    return directory_listing_http_server(base, router)

directory_listing_http_server = (base, router) ->

    router.get base + '*', (req, res) ->
        # decodeURIComponent because decodeURI(misc.encode_path('asdf/te #1/')) != 'asdf/te #1/'
        # https://github.com/sagemathinc/cocalc/issues/2400
        path = decodeURIComponent(req.path.slice(base.length).trim())
        hidden = req.query.hidden
        ###  # this is the far slower fork and use python version:
        exports.get_listing1 path, hidden, (err, listing) ->
            if err
                res.json({error:err})
            else
                res.json(listing)
        ###

        # Fast -- do directly in this process.
        exports.get_listing0 path, hidden, (err, info) ->
            if err
                res.json({error:err})
            else
                res.json({files:info})

    return router

# SMC_LOCAL_HUB_HOME is used for developing cocalc inside cocalc...
HOME = process.env.SMC_LOCAL_HUB_HOME ? process.env.HOME

misc_node = require('smc-util-node/misc_node')

# This exposes the old cc-ls python script. This is basically 100x slower, probably
# due mainly to starting python, but works in all cases: symlinks, bad timestamps, etc.
exports.get_listing1 = (path, hidden, cb) ->
    dir = HOME + '/' + path
    if hidden
        args = ['--hidden', dir]
    else
        args = [dir]
    misc_node.execute_code
        command : "cc-ls"
        args    : args
        bash    : false
        cb      : (err, out) ->
            if err
                cb(err)
            else
                cb(undefined, JSON.parse(out?.stdout))

exports.get_listing0 = (path, hidden, cb) ->
    dir = HOME + '/' + path
    fs.readdir dir, (err, files) ->
        if err
            cb(err)
            return
        if not hidden
            files = (file for file in files when file[0] != '.')

        try
            JSON.stringify(files)
        catch
            # TODO: I don't actually know if this is **ever** a problem -- is there even a string in Node.js
            # that cannot be dumped to JSON?  With python this was a problem, but I can't find the examples now.
            # Throw away filenames that can't be json'd, since they can't be JSON'd below, which would totally
            # lock user out of viewing directory listings in their project.  Users sometimes make weird filenames
            # by accident, so...
            v = []
            for file in files
                try
                    JSON.stringify(file)
                    v.push(file)
                catch
                    # pass
            files = v

        # We use stat first, then lstat if stat fails.  The reason is that we want to provide
        # stat info on the *TARGET* of a symlink, if the symlink is not broken; otherwise, we
        # provide it on the link itself.
        get_metadata = (file, cb, stat='stat') ->
            obj = {name:file}
            # use lstat instead of stat so it works on symlinks too
            fs[stat] dir + '/' + file, (err, stats) ->
                if err
                    if stat == 'stat'
                        # probably broken symlink, so try lstat
                        get_metadata(file, cb, 'lstat')
                        return
                    else
                        obj.error = err
                else
                    if stats.isDirectory()
                        obj.isdir = true
                    else
                        obj.size = stats.size
                    obj.mtime = Math.floor((stats.mtime - 0)/1000)
                cb(undefined, obj)

        async.mapLimit(files, 20, get_metadata, cb)








