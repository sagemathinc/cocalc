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

# SMC_LOCAL_HUB_HOME is used for developing cocalc inside cocalc...
HOME = process.env.SMC_LOCAL_HUB_HOME ? process.env.HOME

misc_node = require('smc-util-node/misc_node')

exports.get_listing = (path, hidden, cb) ->
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








