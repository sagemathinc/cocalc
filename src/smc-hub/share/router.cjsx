"""


"""

PAGE_SIZE            = 15

os_path              =require('path')

{React}              = require('smc-webapp/smc-react')
express              = require('express')
misc                 = require('smc-util/misc')
{defaults, required} = misc

react_support        = require('./react')
{Landing}            = require('smc-webapp/share/landing')
{PublicPathsBrowser} = require('smc-webapp/share/public-paths-browser')
{PublicPath}         = require('smc-webapp/share/public-path')
{Page}               = require('smc-webapp/share/page')
{get_public_paths}   = require('./public_paths')

react = (res, component) ->
    react_support.react(res, <Page>{component}</Page>)

exports.share_router = (opts) ->
    opts = defaults opts,
        database : required
        path     : required
        logger   : undefined

    if opts.logger?
        dbg = (args...) ->
            opts.logger.debug("share_router: ", args...)
    else
        dbg = ->

    _ready_queue = []
    public_paths = undefined
    dbg("getting_public_paths")
    get_public_paths opts.database, (err, x) ->
        if err
            # This is fatal and should be impossible...
            dbg("get_public_paths - ERROR", err)
        else
            public_paths = x
            dbg("got_public_paths - initialized")
            for cb in _ready_queue
                cb()
            _ready_queue = []

    ready = (cb) ->
        if public_paths?
            cb()
        else
            _ready_queue.push(cb)

    router = express.Router()

    router.get '/', (req, res) ->
        ready ->
            react res, <Landing public_paths = {public_paths.get()} />

    router.get '/paths/', (req, res) ->
        ready ->
            react res, <PublicPathsBrowser
                page_number  = {parseInt(req.query.page ? 0)}
                page_size    = {PAGE_SIZE}
                public_paths = {public_paths.get()} />

    #router.get /^\/[a-fA-F0-9]{40}/i, (req, res) ->
    router.get '/paths/:id/', (req, res) ->
        ready ->
            id = req.params.id
            dbg("got id='#{id}'")
            path = public_paths.get(id)
            if not path?
                res.sendStatus(404)
            else
                react res, <PublicPath path={path} />

    router.get '/paths/:id/:path', (req, res) ->
        ready ->
            id   = req.params.id
            path = req.params.path
            dbg("got id='#{id}', path='#{path}'")
            info = public_paths.get(id)
            if not info?
                res.sendStatus(404)
            else
                dir = opts.path.replace('[project_id]', info.get('project_id'))
                path_to_file = os_path.join(dir, path)
                res.sendFile(path_to_file)

    router.get '*', (req, res) ->
        res.send("unknown path='#{req.path}'")

    return router
