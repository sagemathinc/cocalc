###
The raw router.
###

fs           = require('fs')
os_path      = require('path')
async        = require('async')

express      = require('express')

serve_static = require('serve-static')

misc         = require('smc-util/misc')
{defaults, required} = misc

{public_access_request} = require('./access')

listing = require('./listing')

exports.raw_router = (opts) ->
    opts = defaults opts,
        database : required
        path     : required
        logger   : undefined

    if opts.logger?
        d = (args...) ->
            opts.logger.debug("raw_router: ", args...)
    else
        d = ->

    d()

    router = express.Router()

    router.get '/', (req, res) ->
        res.send("raw router")

    router.get '*', (req, res) ->
        project_id = req.path.slice(1,37)
        if not misc.is_valid_uuid_string(project_id)
            res.status(404).end()
            return
        d('project_id=', project_id)
        path = req.path.slice(38)
        d('path=', path)
        path = decodeURIComponent(path)
        d('decoded path=', path)
        public_access_request
            database   : opts.database
            project_id : project_id
            path       : path
            cb         : (err, is_public) ->
                if err
                    # TODO
                    d(path, 'err', err)
                    res.send("error: ", err)
                else if not is_public
                    d(path, 'not public')
                    res.status(404).end()
                else
                    dir = opts.path.replace('[project_id]', project_id)
                    info = {project_id: project_id, path:path}
                    d("serve", path, " from", dir, info)
                    serve_raw_path(res, os_path.join(dir, path), info)

serve_raw_path = (res, path, info) ->
    if path.length > 0 and path[path.length - 1] == '/'
        send_directory_listing(res, path, info)
        return
    fs.lstat path, (err, stats) ->
        if err
            # no such file
            res.send(404)
            return
        if stats.isDirectory()
            # TODO: redirect to /
            res.send(404)
        else
            res.sendFile(path)


send_directory_listing = (res, path, info) ->
    done = false
    async.series([
        (cb) ->
            i = os_path.join(path, 'index.html')
            fs.lstat i, (err) ->
                if not err
                    res.sendFile(i)
                    done = true
                cb()
        (cb) ->
            if done
                cb(); return
            i = os_path.join(path, 'index.htm')
            fs.lstat i, (err) ->
                if not err
                    res.sendFile(i)
                    done = true
                cb()
        (cb) ->
            if done
                cb(); return
            listing.get_listing path, (err, data) ->
                if err
                    res.send(404)
                else
                    res.send(listing.render_directory_listing(data, info))
    ])