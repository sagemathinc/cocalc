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
hub_proxy    = require('./proxy')
hub_projects = require('./projects')
MetricsRecorder  = require('./metrics-recorder')

conf         = require('./conf')


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

    server_settings = require('./server-settings')(opts.database)

    # Create an express application
    router = express.Router()
    app    = express()
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
                                  buckets : [0.01, 0.1, 1, 2, 10, 20]
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
        c = opts.database.concurrent()
        if not hub_register.database_is_working() or c >= opts.database._concurrent_warn
            winston.debug("/concurrent: not healthy, since concurrent >= #{opts.database._concurrent_warn}")
            res.status(404).end()
        else
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
    router.get '/registration', (req, res) ->
        if server_settings.all.account_creation_token
            res.json({token:true})
        else
            res.json({})

    router.get '/customize', (req, res) ->
        res.json(server_settings.pub)

    # Save other paths in # part of URL then redirect to the single page app.
    router.get ['/projects*', '/help*', '/settings*', '/admin*'], (req, res) ->
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
        # Proxy server urls -- on SMC in production, HAproxy sends these requests directly to the proxy server
        # serving (from this process) on another port.  However, for development, we handle everything
        # directly in the hub server (there is no separate proxy server), so have to handle these routes
        # directly here.

        # Implementation below is insecure -- it doesn't even check if user is allowed access to the project.
        # This is fine in dev mode, since all as the same user anyways.
        proxy_cache = {}

        # The port forwarding proxy server probably does not work, and definitely won't upgrade to websockets.
        # Jupyter Classical won't work: (1) the client connects to the wrong URL (no base_url),
        # (2) no websocket upgrade, (3) jupyter listens on eth0 instead of localhost.
        # Jupyter2 works fine though.
        dev_proxy_port = (req, res) ->
            if req.headers['cookie']?
                req.headers['cookie'] = hub_proxy.strip_remember_me_cookie(req.headers['cookie']).cookie
            req_url = req.url.slice(opts.base_url.length)
            {key, port_number, project_id} = hub_proxy.target_parse_req('', req_url)
            proxy = proxy_cache[key]
            if proxy?
                proxy.web(req, res)
                return
            winston.debug("proxy port: req_url='#{req_url}', port='#{port_number}'")
            get_port = (cb) ->
                if port_number == 'jupyter'
                    hub_proxy.jupyter_server_port
                        project_id     : project_id
                        compute_server : opts.compute_server
                        database       : opts.database
                        cb             : cb
                else
                    cb(undefined, port_number)
            get_port (err, port) ->
                winston.debug("get_port: port='#{port}'")
                if err
                    res.status(500).send("internal error: #{err}")
                else
                    target = "http://localhost:#{port}"
                    proxy = http_proxy.createProxyServer(ws:false, target:target, timeout:7000)

                    # Workaround for bug https://github.com/nodejitsu/node-http-proxy/issues/1142; otherwise
                    # POST's with body just hang.
                    proxy.on 'proxyReq', (proxyReq, req) =>
                        if req.body and req.complete
                            bodyData = JSON.stringify(req.body)
                            proxyReq.setHeader('Content-Type', 'application/json')
                            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData))
                            proxyReq.write(bodyData)

                    proxy_cache[key] = proxy
                    proxy.on("error", -> delete proxy_cache[key])  # when connection dies, clear from cache
                    # also delete after a few seconds  - caching is only to optimize many requests near each other
                    setTimeout((-> delete proxy_cache[key]), 60*1000*60)
                    proxy.web(req, res)

        port_regexp = '^' + opts.base_url + '\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/port\/*'

        app.get( port_regexp, dev_proxy_port)
        app.post(port_regexp, dev_proxy_port)

        # Also, ensure the raw server works
        dev_proxy_raw = (req, res) ->
            # avoid XSS...
            if req.headers['cookie']?
                req.headers['cookie'] = hub_proxy.strip_remember_me_cookie(req.headers['cookie']).cookie

            #winston.debug("cookie=#{req.headers['cookie']}")
            req_url = req.url.slice(opts.base_url.length)
            {key, project_id} = hub_proxy.target_parse_req('', req_url)
            winston.debug("dev_proxy_raw '#{project_id}', '#{key}','#{req_url}'")
            proxy = proxy_cache[key]
            if proxy?
                winston.debug("dev_proxy_raw: use cache")
                proxy.web(req, res)
                return
            opts.compute_server.project
                project_id : project_id
                cb         : (err, project) ->
                    if err
                        res.status(500).send("internal error: #{err}")
                    else
                        project.status
                            cb : (err, status) ->
                                if err
                                    res.status(500).send("internal error: #{err}")
                                else if not status['raw.port']
                                    res.status(500).send("no raw server listening")
                                else
                                    port   = status['raw.port']
                                    target = "http://localhost:#{port}"
                                    winston.debug("dev_proxy_raw: connnect to #{target}")
                                    proxy  = http_proxy.createProxyServer(ws:false, target:target, timeout:7000)

                                    # Workaround for bug https://github.com/nodejitsu/node-http-proxy/issues/1142
                                    proxy.on 'proxyReq', (proxyReq, req) =>
                                        if req.body and req.complete
                                            bodyData = JSON.stringify(req.body)
                                            proxyReq.setHeader('Content-Type', 'application/json')
                                            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData))
                                            proxyReq.write(bodyData)

                                    proxy_cache[key] = proxy

                                    # when connection dies, clear from cache
                                    proxy.on("error", -> delete proxy_cache[key])
                                    proxy.web(req, res)
                                    # also delete eventually (1 hour)
                                    setTimeout((-> delete proxy_cache[key]), 1000*60*60)

        raw_regexp = '^' + opts.base_url + '\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/raw*'
        app.get( raw_regexp, dev_proxy_raw)
        app.post(raw_regexp, dev_proxy_raw)

        # Also create and expose the share server
        if false
            PROJECT_PATH = conf.project_path()
            share_server = require('./share/server')
            share_router = share_server.share_router
                database : opts.database
                path     : "#{PROJECT_PATH}/[project_id]"
                base_url : opts.base_url
                logger   : winston
            app.use(opts.base_url + '/share', share_router)

    app.on 'upgrade', (req, socket, head) ->
        winston.debug("\n\n*** http_server websocket(#{req.url}) ***\n\n")
        req_url = req.url.slice(opts.base_url.length)
        # TODO: THIS IS NOT DONE and does not work.  I still don't know how to
        # proxy wss:// from the *main* site to here in the first place; i.e.,
        # this upgrade is never hit, since the main site (that is
        # proxying to this server) is already trying to do something.
        # I don't know if this sort of multi-level proxying is even possible.

    http_server = http.createServer(app)
    return {http_server:http_server, express_router:router}

