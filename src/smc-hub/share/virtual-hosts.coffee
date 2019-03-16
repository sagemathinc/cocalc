###
Support for virtual hosts.
###

os_path              = require('path')


misc                 = require('smc-util/misc')
{defaults, required} = misc
{get_public_paths}   = require('./public_paths')
{render_static_path} = require('./render-static-path')
util                 = require('./util')

{is_authenticated}   = require('./authenticate')

exports.virtual_hosts = (opts) ->
    opts = defaults opts,
        database       : required
        share_path     : required
        base_url       : required
        logger         : undefined
    if opts.logger?
        dbg = (args...) ->
            opts.logger.debug("virtual_hosts: ", args...)
    else
        dbg = ->

    public_paths = undefined
    dbg("getting_public_paths")
    get_public_paths opts.database, (err, x) ->
        if err
            # This is fatal and should be impossible...
            dbg("get_public_paths - ERROR", err)
        else
            public_paths = x
            dbg("got_public_paths - initialized")

    middleware = (req, res, next) ->
        if req.query.host?
            # used mainly for development to fake virtual hosts, since using a real
            # one is impossible in cc-in-cc dev, since the HAproxy server sends
            # them all straight to the share server!
            host = req.query.host
        else
            host = req.headers.host?.toLowerCase()
        # dbg("host = ", host, 'req.url=', req.url)
        info = public_paths?.get_vhost(host)
        if not info?
            # dbg("not a virtual host path")
            return next()

        # TODO:
        #   - worry about public_paths not being defined at first by delaying response like in router.cjsx?
        #   - should we bother with is_public check?
        #   - what about HTTP auth?
        path = req.url
        if opts.base_url
            path = path.slice(opts.base_url.length)

        is_auth = is_authenticated
            req    : req
            res    : res
            path   : path
            auth   : info.get('auth')
            logger : opts.logger

        if not is_auth
            dbg("virtual host: not authenticated -- denying  host='#{host}', path='#{path}'")
            return

        dir = util.path_to_files(opts.share_path, os_path.join(info.get('project_id'), info.get('path')))
        dbg("is a virtual host path -- host='#{host}', path='#{path}', dir='#{dir}'")
        render_static_path
            req  : req
            res  : res
            dir  : dir
            path : path

    return middleware


