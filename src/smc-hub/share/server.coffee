###
Share server

###

express      = require('express')
http         = require('http')

hub_register = require('../hub_register')

misc         = require('smc-util/misc')
{defaults, required} = misc

exports.init = (opts) ->
    console.log 'share server - doing nothing'
    opts = defaults opts,
        database       : required
        base_url       : required
        port           : required
        host           : required
        share_path     : required
        logger         : undefined

    opts.logger?.debug("initializing express http share server")

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

    if opts.base_url
        app.use(opts.base_url, router)
    else
        app.use(router)

    http_server = http.createServer(app)
    return {http_server:http_server, express_router:router}
