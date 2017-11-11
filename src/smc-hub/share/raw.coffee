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

HEXCHARS = ("#{i}" for i in [0..9]).concat(String.fromCharCode(i) for i in [97..122])

# redirect /[uuid] and /[uuid]?query=123 to /[uuid]/ and /[uuid]/?query=123
redirect_to_directory = (req, res) ->
    query = req.url.slice(req.path.length)
    res.redirect(301, req.baseUrl + req.path + '/' + query)


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
        # simple listing by first 2 characters in project_id
        # CREATE INDEX IF NOT EXISTS project_id_2char ON public_paths (substring(project_id::text from 1 for 2));
        # CREATE INDEX IF NOT EXISTS project_id_1char ON public_paths (substring(project_id::text from 1 for 1));

        opts.database._query
            query : '''
                    SELECT DISTINCT(substring(project_id::text from 1 for 1)) AS prefix, COUNT(DISTINCT project_id) AS num FROM public_paths
                    GROUP BY prefix
                    ORDER BY prefix
                    '''
            cb    : (err, result) ->
                if err
                    res.send(JSON.stringify(err))
                else
                    out = """
                    <h1>Public Projects</h1>
                    """
                    for row in result.rows
                        out += "<a href='#{row.prefix}'>#{row.prefix}...</a> (#{row.num})<br/>"
                    res.send(out)

    router.get /^\/[0-9a-z]$/, (req, res) ->
        # matches one uuid char
        c1 = req.path[1]

        opts.database._query
            query : '''
                    SELECT DISTINCT(substring(project_id::text from 1 for 2)) AS prefix, COUNT(DISTINCT project_id) AS num FROM public_paths
                    WHERE substring(project_id::text from 1 for 1) = $1::TEXT
                    GROUP BY prefix
                    ORDER BY prefix
                    '''
            params : [c1]
            cb    : (err, result) ->
                if err
                    res.send(JSON.stringify(err))
                else
                    out = """
                    <h1>Public Projects</h1>
                    <a href='./'>UP</a><br/><br/>
                    """
                    for row in result.rows
                        out += "<a href='#{row.prefix}'>#{row.prefix}...</a> (#{row.num})<br/>"
                    res.send(out)

    router.get /^\/[0-9a-z]{2}$/, (req, res) ->
        # matches two uuid char
        c2 = req.path[1..2]
        console.log(c2)
        opts.database._query
            query : 'SELECT DISTINCT(project_id) FROM public_paths'
            where :
                "substring(project_id::text from 1 for 2) = $::TEXT" : c2
            order_by : 'project_id'
            cb    : (err, result) ->
                if err
                    res.send(JSON.stringify(err))
                else
                    out = """
                    <h1>Public Projects</h1>
                    <a href='#{c2[0]}'>UP</a><br/><br/>
                    Found #{result.rowCount}<br/><br/>
                    """
                    for row in result.rows
                        pid = row.project_id
                        out += "<a href='#{pid}'>#{pid}</a><br/>"
                    res.send(out)

    router.get '*', (req, res) ->
        project_id = req.path.slice(1,37)
        if not misc.is_valid_uuid_string(project_id)
            res.status(404).end()
            return

        # this must be /[uuid]
        if req.path.length == 37
            redirect_to_directory(req, res)
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
                    d("serve", path, "from", dir, info)
                    serve_raw_path(req, res, os_path.join(dir, path), info)

serve_raw_path = (req, res, path, info) ->
    if path.length > 0 and path[path.length - 1] == '/'
        send_directory_listing(req, res, path, info)
        return
    fs.lstat path, (err, stats) ->
        if err
            # no such file
            res.sendStatus(404)
            return
        if stats.isDirectory()
            # Actually a directorys
            redirect_to_directory(req, res)
        else
            res.sendFile(path)


send_directory_listing = (req, res, path, info) ->
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
                    res.sendStatus(404)
                else
                    res.send(listing.render_directory_listing(data, info))
    ])