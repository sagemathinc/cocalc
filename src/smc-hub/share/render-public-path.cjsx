###
Render the public path

###

os_path              = require('path')
fs                   = require('fs')

misc                 = require('smc-util/misc')
{defaults, required} = misc

{React}              = require('smc-webapp/smc-react')
{PublicPath}         = require('smc-webapp/share/public-path')

exports.render_public_path = (opts) ->
    opts = defaults opts,
        res   : required   # html response object
        info  : required   # immutable.js info about the public share
        dir   : required   # directory on diskcontaining files for this path
        react : required
        path  : undefined

        locals =
            path_to_file: os_path.join(opts.dir, opts.info.get('path'))
        fs.lstat locals.path_to_file, (err, stats) ->
            if err
                opts.res.sendStatus(404)
                return
            if stats.isDirectory()
                # TODO: show directory listing
                opts.res.send("directory listing...")
                return
            # stats.size
            # TODO: if too big... just show an error and direct raw download link
            get_content = (cb) ->
                ext = misc.filename_extension(locals.path_to_file)?.toLowerCase()
                switch ext
                    when 'md', 'html', 'htm', 'sagews', 'ipynb'
                        fs.readFile locals.path_to_file, (err, data) ->
                            if err
                                cb(err)
                            else
                                locals.content = data.toString()
                                cb()
                    else
                        cb()
            get_content (err) ->
                if err
                    opts.res.sendStatus(404)
                    return
                opts.react opts.res, <PublicPath info={opts.info} content={locals.content} />

