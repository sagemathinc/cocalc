###
The Hub's HTTP Server
###

fs          = require('fs')
path_module = require('path')
Cookies     = require('cookies')
util        = require('util')
ms          = require('ms')

async       = require('async')
body_parser = require('body-parser')
express     = require('express')
formidable  = require('formidable')
http_proxy  = require('http-proxy')
http        = require('http')
winston     = require('winston')

misc    = require('smc-util/misc')
{defaults, required} = misc

misc_node    = require('smc-util-node/misc_node')

hub_register = require('./hub_register')

auth         = require('./auth')

access       = require('./access')

hub_proxy    = require('./proxy')

hub_projects = require('./projects')

# Rendering stripe invoice server side to PDF in memory
{stripe_render_invoice} = require('./stripe-invoice')

SMC_ROOT    = process.env.SMC_ROOT
STATIC_PATH = path_module.join(SMC_ROOT, 'static')

exports.init_express_http_server = (opts) ->
    opts = defaults opts,
        base_url       : required
        dev            : false  # if true, serve additional dev stuff, e.g., a proxyserver.
        stripe         : undefined   # stripe api connection
        database       : required
        compute_server : required
        metricsRecorder: undefined
    winston.debug("initializing express http server")
    winston.debug("MATHJAX_URL = ", misc_node.MATHJAX_URL)

    # Create an express application
    router = express.Router()
    app    = express()
    router.use(body_parser.urlencoded({ extended: true }))

    # The webpack content. all files except for unhashed .html should be cached long-term ...
    cacheLongTerm = (res, path) ->
        if not opts.dev  # ... unless in dev mode
            timeout = ms('100 days') # more than a year would be invalid
            res.setHeader('Cache-Control', "public, max-age='#{timeout}'")
            res.setHeader('Expires', new Date(Date.now() + timeout).toUTCString());

    # The /static content
    router.use '/static',
        express.static(STATIC_PATH, setHeaders: cacheLongTerm)

    router.use '/policies',
        express.static(path_module.join(STATIC_PATH, 'policies'), {maxAge: 0})

    router.get '/', (req, res) ->
        res.sendFile(path_module.join(STATIC_PATH, 'index.html'), {maxAge: 0})

    # The base_url javascript, which sets the base_url for the client.
    router.get '/base_url.js', (req, res) ->
        res.send("window.smc_base_url='#{opts.base_url}';")

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
        res.header("Content-Type", "application/json")
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        if opts.metricsRecorder?
            res.send(JSON.stringify(opts.metricsRecorder.get(), null, 2))
        else
            res.send(JSON.stringify(error:'no metrics recorder'))

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

    # stripe invoices:  /invoice/[invoice_id].pdf
    if opts.stripe?
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

            stripe_render_invoice(opts.stripe, invoice_id, true, res)
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
            expires = new Date(new Date().getTime() + 1000*24*3600*30*36) # 3 years -- this is fine now since we support "sign out everywhere"
            cookies = new Cookies(req, res)
            cookies.set(req.query.set, req.query.value, {expires:expires})
        res.end()

    # Used to determine whether or not a token is needed for
    # the user to create an account.
    router.get '/registration', (req, res) ->
        if not hub_register.database_is_working()
            res.json({error:"not connected to database"})
            return
        opts.database.get_server_setting
            name : 'account_creation_token'
            cb   : (err, token) ->
                if err or not token
                    res.json({})
                else
                    res.json({token:true})

    router.get '/customize', (req, res) ->
        if not hub_register.database_is_working()
            res.json({error:"not connected to database"})
            return
        opts.database.get_site_settings
            cb : (err, settings) ->
                if err or not settings
                    res.json({})
                else
                    res.json(settings)

    # Save other paths in # part of URL then redirect to the single page app.
    router.get ['/projects*', '/help*', '/settings*'], (req, res) ->
        res.redirect(opts.base_url + "/#" + req.path.slice(1))

    # Return global status information about smc
    router.get '/stats', (req, res) ->
        if not hub_register.database_is_working()
            res.json({error:"not connected to database"})
            return
        opts.database.get_stats
            cb : (err, stats) ->
                if err
                    res.status(500).send("internal error: #{err}")
                else
                    res.json(stats)

    ###
    # Stripe webhooks -- not done
    router.post '/stripe', (req, res) ->
        form = new formidable.IncomingForm()
        form.parse req, (err, fields, files) ->
            # record and act on the webhook here -- see https://stripe.com/docs/webhooks
            # winston.debug("STRIPE: webhook -- #{err}, #{misc.to_json(fields)}")
        res.send('')
    ###

    router.post '/upload', (req, res) ->
        if not hub_register.database_is_working()
            res.status(500).send("file upload failed -- not connected to database")
            return
        # See https://github.com/felixge/node-formidable
        # user uploaded a file
        winston.debug("User uploading a file...")
        form = new formidable.IncomingForm()
        form.parse req, (err, fields, files) ->
            if err or not files.file? or not files.file.path? or not files.file.name?
                e = "file upload failed -- #{misc.to_safe_str(err)} -- #{misc.to_safe_str(files)}"
                winston.debug(e)
                res.status(500).send(e)
                return # nothing to do -- no actual file upload requested

            account_id = undefined
            project_id = undefined
            dest_dir   = undefined
            data       = undefined
            async.series([
                (cb) ->
                    # authenticate user
                    cookies = new Cookies(req, res)
                    # we prefix base_url to cookies mainly for doing development of SMC inside SMC.
                    value = cookies.get(opts.base_url + 'remember_me')
                    if not value?
                        cb('you must enable remember_me cookies to upload files')
                        return
                    x    = value.split('$')
                    hash = auth.generate_hash(x[0], x[1], x[2], x[3])
                    opts.database.get_remember_me
                        hash : hash
                        cb   : (err, signed_in_mesg) =>
                            if err or not signed_in_mesg?
                                cb('unable to get remember_me cookie from db -- cookie invalid')
                                return
                            account_id = signed_in_mesg.account_id
                            if not account_id?
                                cb('invalid remember_me cookie')
                                return
                            winston.debug("Upload from: '#{account_id}'")
                            project_id = req.query.project_id
                            dest_dir   = req.query.dest_dir
                            if dest_dir == ""
                                dest_dir = '.'
                            winston.debug("project = #{project_id}; dest_dir = '#{dest_dir}'")
                            cb()
                (cb) ->
                    # auth user access to *write* to the project
                    access.user_has_write_access_to_project
                        database   : opts.database
                        project_id : project_id
                        account_id : account_id
                        cb         : (err, result) =>
                            #winston.debug("PROXY: #{project_id}, #{account_id}, #{err}, #{misc.to_json(result)}")
                            if err
                                cb(err)
                            else if not result
                                cb("User does not have write access to project.")
                            else
                                winston.debug("user has write access to project.")
                                cb()
                (cb) ->
                    #winston.debug(misc.to_json(files))
                    winston.debug("Reading file from disk '#{files.file.path}'")
                    fs.readFile files.file.path, (err, _data) ->
                        if err
                            cb(err)
                        else
                            data = _data
                            cb()

                # actually send the file to the project
                (cb) ->
                    winston.debug("getting project...")
                    project = hub_projects.new_project(project_id, opts.database, opts.compute_server)
                    path = dest_dir + '/' + files.file.name
                    winston.debug("writing file '#{path}' to project...")
                    project.write_file
                        path : path
                        data : data
                        cb   : cb

            ], (err) ->
                if err
                    winston.debug(e)
                    e = "file upload error -- #{misc.to_safe_str(err)}"
                    res.status(500).send(e)
                else
                    res.send('received upload:\n\n')
                # delete tmp file
                if files?.file?.path?
                    fs.unlink(files.file.path)
            )

    # Get the http server and return it.
    if opts.base_url
        app.use(opts.base_url, router)
    else
        app.use(router)

    if opts.dev
        # Proxy server urls -- on SMC in production, HAproxy sends these requests directly to the proxy server
        # serving (from this process) on another port.  However, for development, we handle everything
        # directly in the hub server, so have to handle these routes.

        # Implementation below is insecure -- it doesn't even check if user is allowed access to the project.
        # This is fine in dev mode, since all as the same user anyways.
        proxy_cache = {}

        # The port forwarding proxy server probably does not work, and definitely won't upgrade to websockets.
        # Jupyter won't work yet: (1) the client connects to the wrong URL (no base_url), (2) no websocket upgrade,
        # (3) jupyter listens on eth0 instead of localhost.  All are somewhat easy to address, I hope.
        dev_proxy_port = (req, res) ->
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
                    proxy = http_proxy.createProxyServer(ws:false, target:target, timeout:0)
                    proxy_cache[key] = proxy
                    proxy.on("error", -> delete proxy_cache[key])  # when connection dies, clear from cache
                    proxy.web(req, res)

        port_regexp = '^' + opts.base_url + '\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/port\/*'
        app.get(port_regexp, dev_proxy_port)
        app.post(port_regexp, dev_proxy_port)

        # The raw server fully works
        app.get '^' + opts.base_url + '\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/raw*', (req, res) ->
            req_url = req.url.slice(opts.base_url.length)
            {key, project_id} = hub_proxy.target_parse_req('', req_url)
            proxy = proxy_cache[key]
            if proxy?
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
                                    proxy  = http_proxy.createProxyServer(ws:false, target:target, timeout:0)
                                    proxy_cache[key] = proxy
                                    proxy.on("error", -> delete proxy_cache[key])  # when connection dies, clear from cache
                                    proxy.web(req, res)

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

