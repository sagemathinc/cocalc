##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
The Hub's HTTP Server
###

fs           = require('fs')
path_module  = require('path')
Cookies      = require('cookies')
util         = require('util')
ms           = require('ms')

async        = require('async')
cookieParser = require('cookie-parser')
body_parser  = require('body-parser')
express      = require('express')
formidable   = require('formidable')
http_proxy   = require('http-proxy')
http         = require('http')
winston      = require('winston')

winston      = require('./winston-metrics').get_logger('hub_http_server')

misc         = require('smc-util/misc')
{defaults, required} = misc

misc_node    = require('smc-util-node/misc_node')
hub_register = require('./hub_register')
auth         = require('./auth')
access       = require('./access')
hub_projects = require('./projects')
MetricsRecorder  = require('./metrics-recorder')


{http_message_api_v1} = require('./api/handler')

# Rendering stripe invoice server side to PDF in memory
{stripe_render_invoice} = require('./stripe/invoice')

SMC_ROOT    = process.env.SMC_ROOT
STATIC_PATH = path_module.join(SMC_ROOT, 'static')

exports.init_express_http_server = (opts) ->
    opts = defaults opts,
        base_url       : required
        dev            : false       # if true, serve additional dev stuff, e.g., a proxyserver.
        database       : required
        compute_server : required
        cookie_options : undefined
    winston.debug("initializing express http server")
    winston.debug("MATHJAX_URL = ", misc_node.MATHJAX_URL)

    if opts.database.is_standby
        server_settings = undefined
    else
        server_settings = require('./server-settings')(opts.database)

    # Create an express application
    router = express.Router()
    app    = express()
    http_server = http.createServer(app)
    app.use(cookieParser())

    # Enable compression, as
    # suggested by http://expressjs.com/en/advanced/best-practice-performance.html#use-gzip-compression
    # NOTE "Express runs everything in order" -- https://github.com/expressjs/compression/issues/35#issuecomment-77076170
    compression = require('compression')
    app.use(compression())

    # Very large limit, since can be used to send, e.g., large single patches, and
    # the default is only 100kb!  https://github.com/expressjs/body-parser#limit-2
    router.use(body_parser.json({limit: '3mb'}))
    router.use(body_parser.urlencoded({extended: true, limit: '3mb'}))

    # initialize metrics
    response_time_histogram = MetricsRecorder.new_histogram('http_histogram', 'http server'
                                  buckets : [0.01, 0.1, 1, 2, 5, 10, 20]
                                  labels: ['path', 'method', 'code']
                              )
    # response time metrics
    router.use (req, res, next) ->
        res_finished_h = response_time_histogram.startTimer()
        original_end = res.end
        res.end = ->
            original_end.apply(res, arguments)
            {dirname}   = require('path')
            path_split  = req.path.split('/')
            # for API paths, we want to have data for each endpoint
            path_tail   = path_split[path_split.length-3 ..]
            is_api      = path_tail[0] == 'api' and path_tail[1] == 'v1'
            if is_api
                dir_path = path_tail.join('/')
            else
                # for regular paths, we ignore the file
                dir_path = dirname(req.path).split('/')[..1].join('/')
            #winston.debug('response timing/path_split:', path_tail, is_api, dir_path)
            res_finished_h({path:dir_path, method:req.method, code:res.statusCode})
        next()

    # save utm parameters and referrer in a (short lived) cookie or read it to fill in locals.utm
    # webapp takes care of consuming it (see misc_page.get_utm)
    router.use (req, res, next) ->
        # quickly return in the usual case
        if Object.keys(req.query).length == 0
            next()
            return
        utm = {}

        utm_cookie = req.cookies[misc.utm_cookie_name]
        if utm_cookie
            try
                data = misc.from_json(window.decodeURIComponent(utm_cookie))
                utm = misc.merge(utm, data)

        for k, v of req.query
            continue if not misc.startswith(k, 'utm_')
            # untrusted input, limit the length of key and value
            k = k[4...50]
            utm[k] = v[...50] if k in misc.utm_keys

        if Object.keys(utm).length
            utm_data = encodeURIComponent(JSON.stringify(utm))
            res.cookie(misc.utm_cookie_name, utm_data, {path: '/', maxAge: ms('1 day'), httpOnly: false})
            res.locals.utm = utm

        referrer_cookie = req.cookies[misc.referrer_cookie_name]
        if referrer_cookie
            res.locals.referrer = referrer_cookie

        winston.debug("HTTP server: #{req.url} -- UTM: #{misc.to_json(res.locals.utm)}")
        next()

    app.enable('trust proxy') # see http://stackoverflow.com/questions/10849687/express-js-how-to-get-remote-client-address

    # The webpack content. all files except for unhashed .html should be cached long-term ...
    cacheLongTerm = (res, path) ->
        if not opts.dev  # ... unless in dev mode
            timeout = ms('100 days') # more than a year would be invalid
            res.setHeader('Cache-Control', "public, max-age='#{timeout}'")
            res.setHeader('Expires', new Date(Date.now() + timeout).toUTCString());

    # robots.txt: disable indexing for published subdirectories, in particular to avoid a lot of 500/404 errors
    router.use '/robots.txt', (req, res) ->
        res.header("Content-Type", "text/plain")
        res.header('Cache-Control', 'private, no-cache, must-revalidate')
        res.write('''
                  User-agent: *
                  Allow: /share
                  Disallow: /projects/*
                  Disallow: /*/raw/
                  Disallow: /*/port/
                  Disallow: /haproxy
                  ''')
        res.end()

    # The /static content
    router.use '/static',
        express.static(STATIC_PATH, setHeaders: cacheLongTerm)

    router.use '/policies',
        express.static(path_module.join(STATIC_PATH, 'policies'), {maxAge: 0})
    router.use '/doc',
        express.static(path_module.join(STATIC_PATH, 'doc'), {maxAge: 0})

    router.get '/', (req, res) ->
        # for convenicnece, a simple heuristic checks for the presence of the remember_me cookie
        # that's not a security issue b/c the hub will do the heavy lifting
        # TODO code in comments is a heuristic looking for the remember_me cookie, while when deployed the haproxy only
        # looks for the has_remember_me value (set by the client in accounts).
        # This could be done in different ways, it's not clear what works best.
        #remember_me = req.cookies[opts.base_url + 'remember_me']
        has_remember_me = req.cookies[auth.remember_me_cookie_name(opts.base_url)]
        if has_remember_me == 'true' # and remember_me?.split('$').length == 4 and not req.query.signed_out?
            res.redirect(opts.base_url + '/app')
        else
            #res.cookie(opts.base_url + 'has_remember_me', 'false', { maxAge: 60*60*1000, httpOnly: false })
            res.sendFile(path_module.join(STATIC_PATH, 'index.html'), {maxAge: 0})

    router.get '/app', (req, res) ->
        #res.cookie(opts.base_url + 'has_remember_me', 'true', { maxAge: 60*60*1000, httpOnly: false })
        res.sendFile(path_module.join(STATIC_PATH, 'app.html'), {maxAge: 0})

    # The base_url javascript, which sets the base_url for the client.
    router.get '/base_url.js', (req, res) ->
        res.send("window.app_base_url='#{opts.base_url}';")

    # used by HAPROXY for testing that this hub is OK to receive traffic
    router.get '/alive', (req, res) ->
        if not hub_register.database_is_working()
            # this will stop haproxy from routing traffic to us
            # until db connection starts working again.
            winston.debug("alive: answering *NO*")
            res.status(404).end()
        else
            res.send('alive')

    router.get '/metrics', (req, res) ->
        res.header("Content-Type", "text/plain")
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        metricsRecorder = MetricsRecorder.get()
        if metricsRecorder?
            # res.send(JSON.stringify(opts.metricsRecorder.get(), null, 2))
            res.send(metricsRecorder.metrics())
        else
            res.send(JSON.stringify(error:'Metrics recorder not initialized.'))

    # /concurrent -- used by kubernetes to decide whether or not to kill the container; if
    # below the warn thresh, returns number of concurrent connection; if hits warn, then
    # returns 404 error, meaning hub may be unhealthy.  Kubernetes will try a few times before
    # killing the container.  Will also return 404 if there is no working database connection.
    router.get '/concurrent-warn', (req, res) ->
        if not hub_register.database_is_working()
            winston.debug("/concurrent-warn: not healthy, since database connection not working")
            res.status(404).end()
            return
        c = opts.database.concurrent()
        if c >= opts.database._concurrent_warn
            winston.debug("/concurrent-warn: not healthy, since concurrent >= #{opts.database._concurrent_warn}")
            res.status(404).end()
            return
        res.send("#{c}")

    # Return number of concurrent connections (could be useful)
    router.get '/concurrent', (req, res) ->
        res.send("#{opts.database.concurrent()}")

    # HTTP API
    router.post '/api/v1/*', (req, res) ->
        h = req.header('Authorization')
        if not h?
            res.status(400).send(error:'You must provide authentication via an API key.')
            return
        [type, user] = misc.split(h)
        switch type
            when "Bearer"
                api_key = user
            when "Basic"
                api_key = new Buffer.from(user, 'base64').toString().split(':')[0]
            else
                res.status(400).send(error:"Unknown authorization type '#{type}'")
                return

        http_message_api_v1
            event          : req.path.slice(req.path.lastIndexOf('/') + 1)
            body           : req.body
            api_key        : api_key
            logger         : winston
            database       : opts.database
            compute_server : opts.compute_server
            ip_address     : req.ip
            cb      : (err, resp) ->
                if err
                    res.status(400).send(error:err)  # Bad Request
                else
                    res.send(resp)

    # HTTP-POST-based user queries
    require('./user-query').init(router, auth.remember_me_cookie_name(opts.base_url), opts.database)

    # HTTP-POST-based user API
    require('./user-api').init
        router         : router
        cookie_name    : auth.remember_me_cookie_name(opts.base_url)
        database       : opts.database
        compute_server : opts.compute_server
        logger         : winston

    # stripe invoices:  /invoice/[invoice_id].pdf
    stripe_connections = require('./stripe/connect').get_stripe()
    if stripe_connections?
        router.get '/invoice/*', (req, res) ->
            winston.debug("/invoice/* (hub --> client): #{misc.to_json(req.query)}, #{req.path}")
            path = req.path.slice(req.path.lastIndexOf('/') + 1)
            i = path.lastIndexOf('-')
            if i != -1
                path = path.slice(i+1)
            i = path.lastIndexOf('.')
            if i == -1
                res.status(404).send("invoice must end in .pdf")
                return
            invoice_id = path.slice(0,i)
            winston.debug("id='#{invoice_id}'")

            stripe_render_invoice(stripe_connections, invoice_id, true, res)
    else
        router.get '/invoice/*', (req, res) ->
            res.status(404).send("stripe not configured")

    # return uuid-indexed blobs (mainly used for graphics)
    router.get '/blobs/*', (req, res) ->
        #winston.debug("blob (hub --> client): #{misc.to_json(req.query)}, #{req.path}")
        if not misc.is_valid_uuid_string(req.query.uuid)
            res.status(404).send("invalid uuid=#{req.query.uuid}")
            return
        if not hub_register.database_is_working()
            res.status(404).send("can't get blob -- not connected to database")
            return
        opts.database.get_blob
            uuid : req.query.uuid
            cb   : (err, data) ->
                if err
                    res.status(500).send("internal error: #{err}")
                else if not data?
                    res.status(404).send("blob #{req.query.uuid} not found")
                else
                    filename = req.path.slice(req.path.lastIndexOf('/') + 1)
                    if req.query.download?
                        # tell browser to download the link as a file instead
                        # of displaying it in browser
                        res.attachment(filename)
                    else
                        res.type(filename)
                    res.send(data)

    # TODO: is this cookie trick dangerous in some surprising way?
    router.get '/cookies', (req, res) ->
        if req.query.set
            # TODO: implement expires as part of query?  not needed for now.
            maxAge = 1000*24*3600*30*6  # 6 months -- long is fine now since we support "sign out everywhere" ?
            cookies = new Cookies(req, res, opts.cookie_options)
            cookies.set(req.query.set, req.query.value, {maxAge:maxAge})
        res.end()

    # Used to determine whether or not a token is needed for
    # the user to create an account.
    if server_settings?
        router.get '/registration', (req, res) ->
            if server_settings.all.account_creation_token
                res.json({token:true})
            else
                res.json({})

    if server_settings?
        router.get '/customize', (req, res) ->
            res.json(server_settings.pub)

    # Save other paths in # part of URL then redirect to the single page app.
    router.get ['/projects*', '/help*', '/settings*', '/admin*', '/dashboard*'], (req, res) ->
        url = require('url')
        q = url.parse(req.url, true).search # gives exactly "?key=value,key=..."
        res.redirect(opts.base_url + "/app#" + req.path.slice(1) + q)

    # Return global status information about smc
    router.get '/stats', (req, res) ->
        if not hub_register.database_is_working()
            res.json({error:"not connected to database"})
            return
        opts.database.get_stats
            update : false   # never update in hub b/c too slow. instead, run $ hub --update_stats via a cronjob every minute
            ttl    : 30
            cb     : (err, stats) ->
                res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
                if err
                    res.status(500).send("internal error: #{err}")
                else
                    res.header("Content-Type", "application/json")
                    res.send(JSON.stringify(stats, null, 1))

    ###
    # Stripe webhooks -- not done
    router.post '/stripe', (req, res) ->
        form = new formidable.IncomingForm()
        form.parse req, (err, fields, files) ->
            # record and act on the webhook here -- see https://stripe.com/docs/webhooks
            # winston.debug("STRIPE: webhook -- #{err}, #{misc.to_json(fields)}")
        res.send('')
    ###

    # Get the http server and return it.
    if opts.base_url
        app.use(opts.base_url, router)
    else
        app.use(router)

    if opts.dev
        dev = require('./dev/hub-http-server')
        dev.init_http_proxy(app, opts.database, opts.base_url, opts.compute_server, winston)
        dev.init_websocket_proxy(http_server, opts.database, opts.base_url, opts.compute_server, winston)
        dev.init_share_server(app, opts.database, opts.base_url, winston);

    return {http_server:http_server, express_router:router}

