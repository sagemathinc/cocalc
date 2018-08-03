###
Render the public path

###

# Do not backend render any file beyond this size, instead showing
# a download link.   This is to avoid a share server blocking for
# a long time or using a lot of RAM.
MAX_SIZE_MB          = 10
MAX_SIZE             = 1000000*MAX_SIZE_MB # size in bytes

os_path              = require('path')
fs                   = require('fs')

misc                 = require('smc-util/misc')
{defaults, required} = misc

{React}              = require('smc-webapp/app-framework')
{PublicPath}         = require('smc-webapp/share/public-path')
{DirectoryListing}   = require('smc-webapp/share/directory-listing')


extensions = require('smc-webapp/share/extensions')

{get_listing}        = require('./listing')
util                 = require('./util')


exports.render_public_path = (opts) ->
    opts = defaults opts,
        req    : required
        res    : required   # html response object
        info   : undefined  # immutable.js info about the public share, if url starts with share id (as opposed to project_id)
        dir    : required   # directory on disk containing files for this path
        react  : required
        path   : required
        viewer : required
        hidden : false
        sort   : required   # e.g., '-mtime' = sort files in reverse by timestamp

    locals =
        path_to_file: os_path.join(opts.dir, opts.path)

    dbg = (args...) ->
        console.log("render_public_path('#{locals.path_to_file}')", args...)
    dbg()
    fs.stat locals.path_to_file, (err, stats) ->
        if err
            dbg("error", err)
            opts.res.sendStatus(404)
            return

        if stats.isDirectory()
            dbg("is directory")
            if opts.path.slice(-1) != '/'
                util.redirect_to_directory(opts.req, opts.res)
                return

            get_listing locals.path_to_file, (err, files) ->
                if err
                    # TODO: show directory listing
                    opts.res.send("Error getting directory listing -- #{err}")
                else
                    if opts.sort[0] == '-'
                        reverse = true
                        sort = opts.sort.slice(1)
                    else
                        reverse = false
                        sort = opts.sort
                    files.sort(misc.field_cmp(sort))
                    if reverse
                        files.reverse()
                    C = <DirectoryListing
                            hidden = {opts.hidden}
                            info   = {opts.info}
                            files  = {files}
                            viewer = {opts.viewer}
                            path   = {opts.path} />
                    opts.react(opts.res, C, opts.path)
            return

        dbg("is file")
        # stats.size
        # TODO: if too big... just show an error and direct raw download link
        get_content = (cb) ->
            if stats.size > MAX_SIZE
                locals.content = undefined  # means -- too big to load.
                cb()
                return

            ext = misc.filename_extension(locals.path_to_file)?.toLowerCase()
            if extensions.image[ext] or extensions.pdf[ext] or extensions.video[ext]
                cb()
                return
            else
                fs.readFile locals.path_to_file, (err, data) ->
                    if err
                        dbg("file read error")
                        cb(err)
                    else
                        locals.content = data.toString()
                        cb()

        get_content (err) ->
            if err
                opts.res.sendStatus(404)
                return

            component = <PublicPath
                info     = {opts.info}
                content  = {locals.content}
                viewer   = {opts.viewer}
                path     = {opts.path}
                size     = {stats.size}
                max_size = {MAX_SIZE} />

            opts.react(opts.res, component, opts.path)

