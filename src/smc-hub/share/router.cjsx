"""


"""

PAGE_SIZE          = 10

{React}            = require('smc-webapp/smc-react')
express            = require('express')
misc               = require('smc-util/misc')
{defaults, required} = misc

{react}            = require('./react')
{Landing}          = require('smc-webapp/share/landing')
{get_public_paths} = require('./public_paths')

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
            landing_page = <Landing
                page_number  = {parseInt(req.query.page ? 0)}
                page_size    = {PAGE_SIZE}
                public_paths = {public_paths.get()} />
            react(res, landing_page)

    return router
