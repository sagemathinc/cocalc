###
Simple http server that serves both raw and share together, is used for local development (cc-in-cc),
and maybe the Docker image someday (?).
###

express      = require('express')

http         = require('http')

hub_register = require('../hub_register')

misc         = require('smc-util/misc')
{defaults, required} = misc

raw = require('./raw')
share = require('./share')


exports.init = (opts) ->
    opts = defaults opts,
        database       : required
        base_url       : required
        share_path     : undefined
        raw_path       : undefined
        logger         : undefined

    opts.logger?.debug("initializing share dev server using share_path='#{opts.share_path}', raw_path='#{opts.raw_path}', base_url='#{opts.base_url}'")

    # Create an express application
    router = express.Router()
    app    = express()

    router.get '/alive', (req, res) ->
        if not hub_register.database_is_working()
            # this will stop haproxy from routing traffic to us
            # until db connection starts working again.
            opts.logger?.debug("alive: answering *NO*")
            res.status(404).end()
        else
            res.send('alive')

    if opts.raw_path
        raw_router = raw.raw_router
            database : opts.database
            path     : opts.raw_path
            logger   : opts.logger

    if opts.share_path
        share_router = share.share_router
            database : opts.database
            path     : opts.share_path
            logger   : opts.logger
            base_url : opts.base_url

    if opts.base_url
        app.use(opts.base_url, router)
        app.use(opts.base_url + '/raw',   raw_router)   if opts.raw_path
        app.use(opts.base_url + '/share', share_router) if opts.share_path
        global.window?['app_base_url'] = opts.base_url
    else
        app.use(router)
        app.use('/raw',   raw_router)   if opts.raw_path
        app.use('/share', share_router) if opts.share_path

    http_server = http.createServer(app)
    return {http_server:http_server, express_router:router}
