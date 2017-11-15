###
Render the public path

###

os_path              = require('path')
fs                   = require('fs')

misc                 = require('smc-util/misc')
{defaults, required} = misc

{React}              = require('smc-webapp/smc-react')
{PublicPath}         = require('smc-webapp/share/public-path')

# res = html response object
# obj = immutable js data about this public path
exports.render_public_path = (opts) ->
    opts = defaults opts,
        res   : required
        info  : required   # immutable info about the public share
        dir   : required   # directory on diskcontaining files for this path
        react : required

        locals =
            path_to_file: os_path.join(opts.dir, opts.info.get('path'))
        fs.lstat locals.path_to_file, (err, stats) ->
            if err
                res.sendStatus(404)
                return
            if stats.isDirectory()
                # TODO: show directory listing
                res.send("directory listing...")
                return
            # stats.size
            # TODO: if too big... just show an error and direct raw download link
            get_content = (cb) ->
                ext = misc.filename_extension(locals.path_to_file)
                switch ext
                    when 'md'
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
                    res.sendStatus(404)
                    return
                opts.react opts.res, <PublicPath info={opts.info} content={locals.content} />

exports.render_sub_public_path = (opts) ->
    opts = defaults opts,
        res  : required
        info : required   # immutable info about the public share
        path : required   # path into the public share
        dir  : required   # directory on diskcontaining files for this path

        path_to_file = os_path.join(opts.dir, opts.info.get('path'), opts.path)
        fs.lstat path_to_file, (err, stats) ->
            if err
                res.sendStatus(404)
                return
            if stats.isDirectory()
                # TODO: show directory listing
                res.send("directory listing...")
                return
            # stats.size
            # TODO: if too big... just show an error and direct raw download link
            #opts.res.sendFile(path_to_file)
            opts.res.send("<img src='raw/#{opts.info.get('id')}/#{opts.info.get('path')}'>")
