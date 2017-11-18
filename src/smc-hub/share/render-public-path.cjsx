###
Render the public path

###

os_path              = require('path')
fs                   = require('fs')

misc                 = require('smc-util/misc')
{defaults, required} = misc

{React}              = require('smc-webapp/smc-react')
{PublicPath}         = require('smc-webapp/share/public-path')
{DirectoryListing}   = require('smc-webapp/share/directory-listing')


extensions = require('smc-webapp/share/extensions')

{get_listing}        = require('./listing')
util                 = require('./util')


exports.render_public_path = (opts) ->
    opts = defaults opts,
        req    : required
        res    : required   # html response object
        info   : required   # immutable.js info about the public share
        dir    : required   # directory on disk containing files for this path
        react  : required
        path   : required
        viewer : required

        locals =
            path_to_file: os_path.join(opts.dir, opts.path)
        fs.lstat locals.path_to_file, (err, stats) ->
            if err
                opts.res.sendStatus(404)
                return
            if stats.isDirectory()
                if opts.path.slice(-1) != '/'
                    util.redirect_to_directory(opts.req, opts.res)
                    return

                get_listing locals.path_to_file, (err, files) ->
                    if err
                        # TODO: show directory listing
                        opts.res.send("Error getting directory listing -- #{err}")
                    else
                        opts.react opts.res, <DirectoryListing info={opts.info} files={files} viewer={opts.viewer} path={opts.path} />, "#{opts.req.params.id}/#{opts.path}"
                return
            # stats.size
            # TODO: if too big... just show an error and direct raw download link
            get_content = (cb) ->
                ext = misc.filename_extension(locals.path_to_file)?.toLowerCase()
                if extensions.image[ext] or extensions.pdf[ext]
                        cb()
                        return
                else
                    fs.readFile locals.path_to_file, (err, data) ->
                        if err
                            cb(err)
                        else
                            locals.content = data.toString()
                            cb()
            get_content (err) ->
                if err
                    opts.res.sendStatus(404)
                    return
                opts.react opts.res, <PublicPath info={opts.info} content={locals.content} viewer={opts.viewer} path={opts.path} />, "#{opts.req.params.id}/#{opts.path}"

