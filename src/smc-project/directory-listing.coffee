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
        exports.get_listing1 path, hidden, (err, listing) ->
            if err
                res.json({error:err})
            else
                res.json(listing)
        ###
        exports.get_listing path, hidden, (err, info) ->
            if err
                res.json({error:err})
            else
                res.json({files:info})
        ###

    return router

# SMC_LOCAL_HUB_HOME is used for developing cocalc inside cocalc...
HOME = process.env.SMC_LOCAL_HUB_HOME ? process.env.HOME

misc_node = require('smc-util-node/misc_node')

# We temporarily use the old cc-ls python script until the pure node get_listing0 below,
# which is 100x faster, works in all cases: symlinks, bad timestamps, etc.
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

        get_metadata = (file, cb) ->
            obj = {name:file}
            # use lstat instead of stat so it works on symlinks too
            fs.lstat dir + '/' + file, (err, stats) ->
                if err
                    obj.error = err
                else
                    if stats.isDirectory()
                        obj.isdir = true
                    else
                        obj.size = stats.size
                    obj.mtime = Math.floor((stats.mtime - 0)/1000)
                cb(undefined, obj)

        async.map(files, get_metadata, cb)








