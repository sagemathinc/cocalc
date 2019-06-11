"""
Router for public share server.

"""

PAGE_SIZE            = 100

os_path              = require('path')

{React}              = require('smc-webapp/app-framework')

express              = require('express')
misc                 = require('smc-util/misc')
{defaults, required} = misc

react_support        = require('./react')

{PublicPathsBrowser} = require('smc-webapp/share/public-paths-browser')
{Page}               = require('smc-webapp/share/page')
{get_public_paths0}   = require('./public-paths')
{render_public_path} = require('./render-public-path')
{render_static_path} = require('./render-static-path')
util                 = require('./util.coffee')

# this reads it from disk
google_analytics     = util.google_analytics_token()

react_viewer = (base_url, path, project_id, notranslate, viewer, is_public) ->
    return (res, component, subtitle) ->
        the_page = <Page
            base_url         = {base_url}
            path             = {path}
            project_id       = {project_id}
            subtitle         = {subtitle}
            notranslate      = {!!notranslate}
            google_analytics = {google_analytics}
            viewer           = {viewer}
            is_public        = {is_public}
        >
            {component}
        </Page>
        extra = {path:path, project_id:project_id}  # just used for log
        react_support.react(res, the_page, extra, viewer)

exports.share_router = (opts) ->
    opts = defaults opts,
        database : required
        path     : required
        logger   : undefined
        base_url : ''

    global.window['app_base_url'] = opts.base_url

    if opts.logger?
        dbg = (args...) ->
            opts.logger.debug("share_router: ", args...)
    else
        dbg = ->

    dbg("base_url = ", opts.base_url)
    dbg("path = ", opts.path)


    log_ip = (req) ->
        ip_addresses = req.headers['x-forwarded-for'] || req.connection.remoteAddress
        dbg("remote='#{ip_addresses}' requests url='#{req.url}'")

    if opts.path.indexOf('[project_id]') == -1
        # VERY BAD
        throw RuntimeError("opts.path must contain '[project_id]'")

    path_to_files = (project_id) ->
        return util.path_to_files(opts.path, project_id)

    _ready_queue = []
    public_paths = undefined
    dbg("getting_public_paths")
    get_public_paths0 opts.database, (err, x) ->
        if err
            # This is fatal and should be impossible...
            dbg("get_public_paths - ERROR", err)
        else
            public_paths = x
            dbg("got_public_paths - initialized")
            for cb in _ready_queue
                cb()
            _ready_queue = []
    ###
    try
        public_paths = await get_public_paths(opts.database)
        dbg("got_public_paths - initialized")
        for cb in _ready_queue
            cb()
        _ready_queue = []
    catch err
        # This is fatal and should be impossible...
        dbg("get_public_paths - ERROR", err)
    ###

    ready = (cb) ->
        if public_paths?
            cb()
        else
            _ready_queue.push(cb)

    router = express.Router()

    for name in ['favicon-32x32.png', 'cocalc-icon.svg']
        router.use "/#{name}", express.static(os_path.join(process.env.SMC_ROOT, "webapp-lib/#{name}"),
                                    {immutable:true, maxAge:86000000})

    # TODO: serve from static file when/if it gets at all big; or from some refactor
    # of our existing css.  That said, our aim for the share server is extreme cleanliness
    # and simplicity, so what we want may be different from cocalc interactive.
    router.get '/share.css', (req, res) ->
        res.type("text/css")
        res.send("""
.cocalc-jupyter-anchor-link {
  visibility : hidden
};
        """)

    router.get '/', (req, res) ->
        log_ip(req)
        if req.originalUrl.split('?')[0].slice(-1) != '/'
            # note: req.path already has the slash added.
            res.redirect(301, req.baseUrl + req.path)
            return
        ready ->
            page_number = parseInt(req.query.page ? 1)
            page = <PublicPathsBrowser
                page_number  = {page_number}
                page_size    = {PAGE_SIZE}
                paths_order  = {public_paths.order()}
                public_paths = {public_paths.get()} />
            r = react_viewer(opts.base_url, '/', undefined, true, 'share', public_paths.is_public)
            r(res, page, "#{page_number} of #{PAGE_SIZE}")

    router.get '/:id/*?', (req, res) ->
        log_ip(req)
        ready ->
            if misc.is_valid_uuid_string(req.params.id)
                # explicit project_id specified instead of sha1 hash id of share.
                project_id = req.params.id
                info = undefined
            else
                info = public_paths.get(req.params.id)
                if not info? or info.get('auth')   # TODO: For now, /share server does NOT make vhost visible at all if there is any auth info..
                    res.sendStatus(404)
                    return
                project_id = info.get('project_id')

            path = req.params[0]
            #dbg("router.get '/:id/*?': #{project_id} and #{path}: #{public_paths.is_public(project_id, path)}, info: #{misc.to_json(info)}, path: #{path}")
            if not path?
                #dbg("no path → 404")
                res.sendStatus(404)
                return

            # Check that the requested path is definitely contained
            # in a current valid non-disabled public path.  This is important so:
            #   (a) if access is via public_path id and that path just got
            #   revoked, but share server hasn't caught up and removed target,
            #   then we want request to still be denied.
            #   (b) when accessing by project_id, the only restriction would be
            #   by what happens to be in the path to files.  So share server not having
            #   updated yet is a problem, but ALSO, in some cases (dev server, docker personal)
            #   that path is just to the live files in the project, so very dangerous.


            if not public_paths.is_public(project_id, path)
                res.sendStatus(404)
                return

            dir  = path_to_files(project_id)
            viewer = req.query.viewer
            if viewer?
                render_public_path
                    req    : req
                    res    : res
                    info   : info
                    dir    : dir
                    path   : path
                    react  : react_viewer(opts.base_url, "/#{req.params.id}/#{path}", project_id, false, viewer, public_paths.is_public)
                    viewer : viewer
                    hidden : req.query.hidden
                    sort   : req.query.sort ? '-mtime'
            else
                render_static_path
                    req   : req
                    res   : res
                    dir   : dir
                    path  : path

    router.get '*', (req, res) ->
        res.send("unknown path='#{req.path}'")

    return router

