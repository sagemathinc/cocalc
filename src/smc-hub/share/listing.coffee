###
Utilities that are useful for getting directory listings.
###

fs    = require('fs')
async = require('async')

exports.get_listing = (dir, cb) ->
    fs.readdir dir, (err, files) ->
        if err
            cb(err)
            return
        # Do NOT filter hidden files (why would we? -- github doesn't)
        ## files = (fn for fn in files when fn.charAt(0) isnt '.')
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
        async.mapLimit(files, 10, get_metadata, cb)

exports.render_directory_listing = (data, info) ->
    s = ["<a href='..'>..</a>"]
    for obj in data
        name = obj.name
        link = encodeURIComponent(name)
        if obj.isdir
            link += '/'
            name += '/'
        s.push("<a style='text-decoration:none' href='#{link}'>#{name}</a>")
    body = s.join('<br/>')
    return "<body style='margin:40px'><h2>#{info.project_id}:#{info.path}</h2>#{body}</body>"
