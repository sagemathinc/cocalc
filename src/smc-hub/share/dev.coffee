###
Simple http server that serves share server, is used for local
development (cc-in-cc), the Docker image, and in production for
the main share server.

In particular, this is NOT just used for development, despite the filename.
###

express      = require('express')

http         = require('http')

hub_register = require('../hub_register')

misc         = require('smc-util/misc')
{defaults, required} = misc

share = require('./share')

{virtual_hosts} = require('./virtual-hosts')

exports.init = (opts) ->
    opts = defaults opts,
        database       : required
        base_url       : required
        share_path     : required
        logger         : undefined

    opts.logger?.debug("initializing share server using share_path='#{opts.share_path}', base_url='#{opts.base_url}'")

    # Create an express application
    router = express.Router()
    app    = express()

    # Enable gzip compression, as suggested by
    # http://expressjs.com/en/advanced/best-practice-performance.html#use-gzip-compression
    compression = require('compression')
    app.use(compression())

    vhost = virtual_hosts
        database   : opts.database
        share_path : opts.share_path
        base_url   : opts.base_url
        logger     : opts.logger

    app.use(vhost)

    router.get '/alive', (req, res) ->
        if not hub_register.database_is_working()
            # this will stop haproxy from routing traffic to us
            # until db connection starts working again.
            opts.logger?.debug("alive: answering *NO*")
            res.status(404).end()
        else
            res.send('alive')

    if opts.share_path
        share_router = share.share_router
            database : opts.database
            path     : opts.share_path
            logger   : opts.logger
            base_url : opts.base_url

    if opts.base_url
        app.use(opts.base_url, router)
        app.use(opts.base_url + '/share', share_router) if opts.share_path
        global.window?['app_base_url'] = opts.base_url
    else
        app.use(router)
        app.use('/share', share_router) if opts.share_path

    http_server = http.createServer(app)
    return {http_server:http_server, express_router:router}
