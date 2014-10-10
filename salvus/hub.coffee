##############################################################################
#
# This is the Salvus Global HUB module.  It runs as a daemon, sitting in the
# middle of the action, connected to potentially thousands of clients,
# many Sage sessions, and a Cassandra database cluster.  There are
# many HUBs running on VM's all over the installation.
#
# Run this by running ./hub [options]
#
# For local debugging, run this way, since it gives better stack traces.
#
#         make_coffee && echo "require('hub').start_server()" | coffee
#
# or even this is fine:
#
#     ./hub nodaemon --port 5000 --tcp_port 5001 --keyspace salvus --host 10.2.2.3 --database_nodes 10.2.1.2,10.2.2.2,10.2.3.2,10.2.4.2
#
##############################################################################

SALVUS_HOME=process.cwd()

REQUIRE_ACCOUNT_TO_EXECUTE_CODE = false

# Anti DOS parameters:
# If a client sends a burst of messages, we space handling them out by this many milliseconds:.
MESG_QUEUE_INTERVAL_MS  = 50
#MESG_QUEUE_INTERVAL_MS  = 20
# If a client sends a burst of messages, we discard all but the most recent this many of them:
#MESG_QUEUE_MAX_COUNT    = 25
MESG_QUEUE_MAX_COUNT    = 150
# Any messages larger than this is dropped (it could take a long time to handle, by a de-JSON'ing attack, etc.).
MESG_QUEUE_MAX_SIZE_MB  = 7

# How long to cache a positive authentication for using a project.
CACHE_PROJECT_AUTH_MS = 1000*60*15    # 15 minutes

# How long to cache believing that a project is public.   If a user
# makes their project private, this fact might be ignored for few minutes.
# However, if they make it public (from private), that is instant.
CACHE_PROJECT_PUBLIC_MS = 1000*60*15    # 15 minutes

# Blobs (e.g., files dynamically appearing as output in worksheets) are kept for this
# many seconds before being discarded.  If the worksheet is saved (e.g., by a user's autosave),
# then the BLOB is saved indefinitely.
BLOB_TTL = 60*60*24*30   # 1 month

# How frequently to register with the database that this hub is up and running, and also report
# number of connected clients
REGISTER_INTERVAL_S = 30   # every 30 seconds

# node.js -- builtin libraries
net     = require 'net'
assert  = require('assert')
http    = require('http')
url     = require('url')
fs      = require('fs')
{EventEmitter} = require('events')

_       = require('underscore')
mime    = require('mime')

# salvus libraries
sage    = require("sage")               # sage server
misc    = require("misc")
{defaults, required} = require('misc')
message = require("message")     # salvus message protocol
cass    = require("cassandra")
cql     = require("node-cassandra-cql")
client_lib = require("client")
JSON_CHANNEL = client_lib.JSON_CHANNEL

salvus_version = require('salvus_version')


snap = require("snap")

misc_node = require('misc_node')

to_json = misc.to_json
to_safe_str = misc.to_safe_str
from_json = misc.from_json

# third-party libraries: add any new nodejs dependencies to the NODEJS_PACKAGES list in build.py
async   = require("async")
program = require('commander')          # command line arguments -- https://github.com/visionmedia/commander.js/
daemon  = require("start-stop-daemon")  # daemonize -- https://github.com/jiem/start-stop-daemon
uuid    = require('node-uuid')

Cookies = require('cookies')            # https://github.com/jed/cookies


diffsync = require('diffsync')

winston = require('winston')            # logging -- https://github.com/flatiron/winston

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, level: 'debug')

# defaults
# TEMPORARY until we flesh out the account types
DEFAULTS =
    quota        : {disk:{soft:128, hard:256}, inode:{soft:4096, hard:8192}}
    zfs_quota    : '5G'
    idle_timeout : 3600


# module scope variables:
http_server        = null
database           = null

# the connected clients
clients            = {}

# Temporary project data directory
project_data = 'data/projects/'

fs.exists project_data, (exists) ->
    if not exists
        fs.mkdir(project_data)

PROJECT_TEMPLATE = 'conf/project_templates/default/'

###
# HTTP Server
###
formidable = require('formidable')
util = require('util')

init_http_server = () ->
    http_server = http.createServer((req, res) ->

        {query, pathname} = url.parse(req.url, true)

        pathname = pathname.slice(program.base_url.length)

        if pathname != '/alive'
            winston.info("#{req.connection.remoteAddress} accessed #{req.url}")
            winston.info("pathname='#{pathname}'")

        segments = pathname.split('/')
        switch segments[1]
            when "cookies"
                cookies = new Cookies(req, res)
                if query.set
                    # TODO: implement expires as part of query.
                    cookies.set(query.set, query.value, {expires:new Date(new Date().getTime() + 1000*24*3600*365)})
                res.end('')
            when "alive"
                if not database_is_working
                    # this will stop haproxy from routing traffic to us until db connection starts working again.
                    res.writeHead(404, {'Content-Type':'text/plain'})
                res.end('')
            when "proxy"
                res.end("testing the proxy server -- #{pathname}")
            when "stats"
                server_stats (err, stats) ->
                    if err
                        res.writeHead(500, {'Content-Type':'text/plain'})
                        res.end("internal error: #{err}")
                    else
                        res.end(misc.to_json(stats))
            when "registration"
                database.key_value_store(name:'global_admin_settings').get
                    key : 'account_creation_token'
                    cb  : (err, token) ->
                        if err or not token
                            res.end(misc.to_json({}))
                        else
                            res.end(misc.to_json({token:true}))

            when "blobs"
                #winston.debug("serving a blob: #{misc.to_json(query)}")
                if not query.uuid?
                    res.writeHead(500, {'Content-Type':'text/plain'})
                    res.end("internal error: #{error}")
                    return
                get_blob uuid:query.uuid, cb:(error, data) ->
                    #winston.debug("query got back: #{error}, #{misc.to_json(data)}")
                    if error
                        res.writeHead(500, {'Content-Type':'text/plain'})
                        res.end("internal error: #{error}")
                    else if not data?
                        res.writeHead(404, {'Content-Type':'text/plain'})
                        res.end("404 blob #{query.uuid} not found")
                    else
                        header = {'Content-Type':mime.lookup(pathname)}
                        if query.download?
                            # tell browser to download the link as a file instead of displaying it in browser
                            header['Content-disposition'] = 'attachment; filename=' + segments[segments.length-1]
                        res.writeHead(200, header)
                        res.end(data, 'utf-8')

            when 'projects', 'help', 'settings'
                res.writeHead(302, {
                  'Location': program.base_url + '/#' +  segments.slice(1).join('/')
                })
                res.end()

            when "upload"
                # See https://github.com/felixge/node-formidable
                if req.method == "POST"
                    # user uploaded a file
                    winston.debug("User uploading a file...")
                    form = new formidable.IncomingForm()
                    form.parse req, (err, fields, files) ->
                        res.writeHead(200, {'content-type': 'text/plain'})
                        res.write('received upload:\n\n');
                        res.end('')
                        if not files.file? or not files.file.path? or not files.file.name?
                            winston.debug("file upload failed -- #{misc.to_json(files)}")
                            return # nothing to do -- no actual file upload requested

                        account_id = undefined
                        project_id = undefined
                        dest_dir   = undefined
                        data       = undefined
                        async.series([
                            # authenticate user
                            (cb) ->
                                cookies = new Cookies(req, res)
                                # we prefix base_url to cookies mainly for doing development of SMC inside SMC.
                                value = cookies.get(program.base_url + 'remember_me')
                                if not value?
                                    res.end('ERROR -- you must enable remember_me cookies')
                                    return
                                x    = value.split('$')
                                hash = generate_hash(x[0], x[1], x[2], x[3])
                                database.key_value_store(name: 'remember_me').get
                                    key         : hash
                                    consistency : cql.types.consistencies.one
                                    cb          : (err, signed_in_mesg) =>
                                        if err or not signed_in_mesg?
                                            cb('unable to get remember_me cookie from db -- cookie invalid'); return
                                        account_id = signed_in_mesg.account_id
                                        if not account_id?
                                            cb('invalid remember_me cookie'); return
                                        winston.debug("Upload from: '#{account_id}'")
                                        project_id = query.project_id
                                        dest_dir   = query.dest_dir
                                        if dest_dir == ""
                                            dest_dir = '.'
                                        winston.debug("project = #{project_id}")
                                        winston.debug("dest_dir = '#{dest_dir}'")
                                        cb()
                            # auth user access to *write* to the project
                            (cb) ->
                                user_has_write_access_to_project
                                    project_id     : project_id
                                    account_id     : account_id
                                    cb             : (err, result) =>
                                        #winston.debug("PROXY: #{project_id}, #{account_id}, #{err}, #{misc.to_json(result)}")
                                        if err
                                            cb(err)
                                        else if not result
                                            cb("User does not have write access to project.")
                                        else
                                            winston.debug("user has write access to project.")
                                            cb()
                            # TODO: we *should* stream the file, not write to disk/read/etc.... but that is
                            # more work and I don't have time now.
                            # get the file itself
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
                                new_project project_id, (err, project) ->
                                    if err
                                        cb(err)
                                    else
                                        path = dest_dir + '/' + files.file.name
                                        winston.debug("writing file '#{path}' to project...")
                                        project.write_file
                                            path : path
                                            data : data
                                            cb   : cb

                        ], (err) ->
                            if err
                                winston.debug("Error during file upload: #{misc.to_json(err)}")
                            # delete tmp file
                            if files?.file?.path?
                                fs.unlink(files.file.path)
                        )
            else
                res.end('hub server')

    )

    http_server.on('close', clean_up_on_shutdown)


###
# HTTP Proxy Server, which passes requests directly onto http servers running on project vm's
###

httpProxy = require('http-proxy')

init_http_proxy_server = () =>

    _remember_me_check_for_access_to_project = (opts) ->
        opts = defaults opts,
            project_id  : required
            remember_me : required
            type        : 'write'     # 'read' or 'write'
            cb          : required    # cb(err, has_access)
        dbg = (m) -> winston.debug("_remember_me_check_for_access_to_project: #{m}")
        account_id       = undefined
        email_address    = undefined
        has_access = false
        hash             = undefined
        async.series([
            (cb) ->
                dbg("get remember_me message")
                x    = opts.remember_me.split('$')
                hash = generate_hash(x[0], x[1], x[2], x[3])
                database.key_value_store(name: 'remember_me').get
                    key         : hash
                    consistency : cql.types.consistencies.one
                    cb          : (err, signed_in_mesg) =>
                        if err or not signed_in_mesg?
                            cb("unable to get remember_me from db -- #{err}")
                            dbg("failed to get remember_me -- #{err}")
                        else
                            account_id    = signed_in_mesg.account_id
                            email_address = signed_in_mesg.email_address
                            dbg("account_id=#{account_id}, email_address=#{email_address}")
                            cb()
            (cb) ->
                if not email_address?
                    cb(); return
                dbg("check if user is banned")
                database.is_banned_user
                    email_address : email_address
                    cb            : (err, is_banned) ->
                        if err
                            cb(err); return
                        if is_banned
                            dbg("delete this auth key, since banned users are a waste of space.")
                            @remember_me_db.delete(key : hash)
                            cb('banned')
                        else
                            cb()
            (cb) ->
                dbg("check if user has #{opts.type} access to project")
                if opts.type == 'write'
                    user_has_write_access_to_project
                        project_id : opts.project_id
                        account_id : account_id
                        cb         : (err, result) =>
                            dbg("got: #{err}, #{result}")
                            if err
                                cb(err)
                            else if not result
                                cb("User does not have write access to project.")
                            else
                                has_access = true
                                cb()
                else
                    user_has_read_access_to_project
                        project_id : opts.project_id
                        account_id : account_id
                        cb         : (err, result) =>
                            dbg("got: #{err}, #{result}")
                            if err
                                cb(err)
                            else if not result
                                cb("User does not have read access to project.")
                            else
                                has_access = true
                                cb()

        ], (err) ->
            opts.cb(err, has_access)
        )

    _remember_me_cache = {}
    remember_me_check_for_access_to_project = (opts) ->
        opts = defaults opts,
            project_id  : required
            remember_me : required
            type        : 'write'
            cb          : required    # cb(err, has_access)
        key = opts.project_id + opts.remember_me + opts.type
        has_access = _remember_me_cache[key]
        if has_access?
            opts.cb(false, has_access)
            return
        # get the answer, cache it, return answer
        _remember_me_check_for_access_to_project
            project_id  : opts.project_id
            remember_me : opts.remember_me
            type        : opts.type
            cb          : (err, has_access) ->
                # if cache gets huge for some *weird* reason (should never happen under normal conditions),
                # just reset it to avoid any possibility of DOS-->RAM crash attack
                if misc.len(_remember_me_cache) >= 100000
                    _remember_me_cache = {}

                _remember_me_cache[key] = has_access
                # Set a ttl time bomb on this cache entry. The idea is to keep the cache not too big,
                # but also if the user is suddenly granted permission to the project, this should be
                # reflected within a few seconds.
                f = () ->
                    delete _remember_me_cache[key]
                if has_access
                    setTimeout(f, 1000*60*6)    # access lasts 6 minutes (i.e., if you revoke privs to a user they could still hit the port for 5 minutes)
                else
                    setTimeout(f, 1000*60*2)    # not having access lasts 2 minute
                opts.cb(err, has_access)

    _target_cache = {}
    target = (remember_me, url, cb) ->
        v          = url.split('/')
        project_id = v[1]
        type       = v[2]  # 'port' or 'raw'
        key = remember_me + project_id + type
        if type == 'port'
            key += v[3]
        t = _target_cache[key]
        if t?
            cb(false, t)
            return

        tm = misc.walltime()
        winston.debug("target: setting up proxy: #{v}")
        host       = undefined
        port       = undefined
        async.series([
            (cb) ->
                if not remember_me?
                    # remember_me = undefined means "allow"; this is used for the websocket upgrade.
                    cb(); return

                # It's still unclear if we will ever grant read access to the raw server.
                #if type == 'raw'
                #    access_type = 'read'
                #else
                #    access_type = 'write'
                access_type = 'write'

                remember_me_check_for_access_to_project
                    project_id  : project_id
                    remember_me : remember_me
                    type        : access_type
                    cb          : (err, has_access) ->
                        if err
                            cb(err)
                        else if not has_access
                            cb("user does not have #{access_type} access to this project")
                        else
                            cb()
            (cb) ->
                if host?
                    cb()
                else
                    bup_server.project
                        project_id : project_id
                        cb         : (err, project) ->
                            if err
                                cb(err)
                            else
                                host = project.client.host
                                cb()
            (cb) ->
                # determine the port
                if type == 'port'
                    port = parseInt(v[3])
                    cb()
                else if type == 'raw'
                    bup_server.project
                        project_id : project_id
                        cb         : (err, project) ->
                            if err
                                cb(err)
                            else
                                project.status
                                    cb : (err, status) ->
                                        if err
                                            cb(err)
                                        else if not status['raw.port']?
                                            cb("raw port not available")
                                        else
                                            port = status['raw.port']
                                            cb()
                else
                    cb("unknown url type -- #{type}")
            ], (err) ->
                winston.debug("target: setup proxy; time=#{misc.walltime(tm)} seconds -- err=#{err}; host=#{host}; port=#{port}; type=#{type}")
                if err
                    cb(err)
                else
                    t = {host:host, port:port}
                    _target_cache[key] = t
                    # Set a ttl time bomb on this cache entry. The idea is to keep the cache not too big,
                    # but also if the user is suddenly granted permission to the project, or the project server
                    # is restarted, this should be reflected.  Since there are dozens (at least) of hubs,
                    # and any could cause a project restart at any time, we just timeout this info after
                    # a few seconds.  This helps enormously when there is a burst of requests.
                    setTimeout((()->delete _target_cache[key]), 1000*30)
                    cb(false, t)
            )

    #proxy = httpProxy.createProxyServer(ws:true)

    http_proxy_server = http.createServer (req, res) ->
        req_url = req.url.slice(program.base_url.length)  # strip base_url for purposes of determining project location/permissions
        if req_url == "/alive"
            res.end('')
            return

        #buffer = httpProxy.buffer(req)  # see http://stackoverflow.com/questions/11672294/invoking-an-asynchronous-method-inside-a-middleware-in-node-http-proxy

        cookies = new Cookies(req, res)
        remember_me = cookies.get(program.base_url + 'remember_me')

        if not remember_me?
            res.writeHead(500, {'Content-Type':'text/html'})
            res.end("Please login to <a target='_blank' href='https://cloud.sagemath.com'>https://cloud.sagemath.com</a> with cookies enabled, then refresh this page.")
            return

        target remember_me, req_url, (err, location) ->
            if err
                winston.debug("proxy denied -- #{err}")
                res.writeHead(500, {'Content-Type':'text/html'})
                res.end("Access denied. Please login to <a target='_blank' href='https://cloud.sagemath.com'>https://cloud.sagemath.com</a> as a user with access to this project, then refresh this page.")
            else
                t = "http://#{location.host}:#{location.port}"
                proxy = httpProxy.createProxyServer(ws:false, target:t, timeout:0)
                proxy.on "error", (e) ->
                    winston.debug("non-websocket http proxy -- create proxy #{t}; error -- #{e}")
                proxy.web(req, res)

    http_proxy_server.listen(program.proxy_port, program.host)

    _ws_proxy_servers = {}
    http_proxy_server.on 'upgrade', (req, socket, head) ->
        req_url = req.url.slice(program.base_url.length)  # strip base_url for purposes of determining project location/permissions
        target undefined, req_url, (err, location) ->
            if err
                winston.debug("websocket upgrade error --  this shouldn't happen since upgrade would only happen after normal thing *worked*. #{err}")
            else
                winston.debug("websocket upgrade -- ws://#{location.host}:#{location.port}")
                t = "ws://#{location.host}:#{location.port}"
                proxy = _ws_proxy_servers[t]
                if not proxy?
                    winston.debug("websocket upgrade #{t}: not using cache")
                    proxy = httpProxy.createProxyServer(ws:true, target:t, timeout:0)
                    proxy.on "error", (e) ->
                        winston.debug("websocket upgrade -- create proxy #{t}; error -- #{e}")
                    _ws_proxy_servers[t] = proxy
                else
                    winston.debug("websocket upgrade: using cache")
                proxy.ws(req, socket, head)





#############################################################
# Client = a client that is connected via a persistent connection to the hub
#############################################################
class Client extends EventEmitter
    constructor: (@conn) ->
        @_data_handlers = {}
        @_data_handlers[JSON_CHANNEL] = @handle_json_message_from_client

        @ip_address = @conn.address.ip

        # A unique id -- can come in handy
        @id = @conn.id


        # The variable account_id is either undefined or set to the
        # account id of the user that this session has successfully
        # authenticated as.  Use @account_id to decide whether or not
        # it is safe to carry out a given action.
        @account_id = undefined

        # The persistent sessions that this client started.
        @compute_session_uuids = []

        @cookies = {}
        @remember_me_db = database.key_value_store(name: 'remember_me')

        @conn.on "data", @handle_data_from_client

        @conn.on "end", () =>
            winston.debug("connection: hub <--> client(id=#{@id}, address=#{@ip_address})  CLOSED")
            @emit 'close'
            @compute_session_uuids = []
            delete clients[@conn.id]

        winston.debug("connection: hub <--> client(id=#{@id}, address=#{@ip_address})  ESTABLISHED")

        cookies = new Cookies(@conn.request)
        value = cookies.get(program.base_url + 'remember_me')
        @_validate_remember_me(value)

        #@check_for_remember_me()

    remember_me_failed: (reason) =>
        @push_to_client(message.remember_me_failed(reason:reason))

    check_for_remember_me: () =>
        winston.debug("client(id=#{@id}): check for remember me")
        @get_cookie
            name : program.base_url + 'remember_me'
            cb   : (value) =>
                @_validate_remember_me(value)

    _validate_remember_me: (value) =>
                #winston.debug("_validate_remember_me: #{value}")
                if not value?
                    @remember_me_failed("no remember_me cookie")
                    return
                x    = value.split('$')
                hash = generate_hash(x[0], x[1], x[2], x[3])
                @remember_me_db.get
                    key         : hash
                    #consistency : cql.types.consistencies.one
                    cb          : (error, signed_in_mesg) =>
                        if error
                            @remember_me_failed("error accessing database")
                            return
                        if not signed_in_mesg?
                            @remember_me_failed("remember_me deleted or expired")
                            return
                        database.is_banned_user
                            email_address : signed_in_mesg.email_address
                            cb            : (err, is_banned) =>
                                if err
                                    @remember_me_failed("error checking whether or not user is banned")
                                else if is_banned
                                    # delete this auth key, since banned users are a waste of space.
                                    # TODO: probably want to log this attempt...
                                    @remember_me_failed("user is banned")
                                    @remember_me_db.delete(key : hash)
                                else
                                    # good -- sign them in
                                    signed_in_mesg.hub = program.host + ':' + program.port
                                    @hash_session_id = hash
                                    @signed_in(signed_in_mesg)
                                    @push_to_client(signed_in_mesg)

    #######################################################
    # Capping resource limits; client can request anything.
    # We cap what they get based on the account type, etc...
    # This functions *modifies* the limits object in place.
    #######################################################
    cap_session_limits: (limits) ->
        if @account_id?  # logged in
            misc.min_object(limits, SESSION_LIMITS)  # TODO
        else
            misc.min_object(limits, SESSION_LIMITS_NOT_LOGGED_IN)  # TODO

    #######################################################
    # Pushing messages to this particular connected client
    #######################################################
    push_to_client: (mesg) =>
        if mesg.event != 'pong'
            winston.debug("hub --> client (client=#{@id}): #{misc.trunc(to_safe_str(mesg),300)}")
        @push_data_to_client(JSON_CHANNEL, to_json(mesg))

    push_data_to_client: (channel, data) ->
        #winston.debug("push_data_to_client(#{channel},'#{data}')")
        @conn.write(channel + data)

    error_to_client: (opts) ->
        opts = defaults opts,
            id    : undefined
            error : required
        @push_to_client(message.error(id:opts.id, error:opts.error))

    success_to_client: (opts) ->
        opts = defaults opts,
            id    : required
        @push_to_client(message.success(id:opts.id))

    # Call this method when the user has successfully signed in.
    signed_in: (signed_in_mesg) =>

        @signed_in_mesg = signed_in_mesg  # save it, since the properties are handy to have.

        # Record that this connection is authenticated as user with given uuid.
        @account_id = signed_in_mesg.account_id

        record_sign_in
            ip_address    : @ip_address
            successful    : true
            remember_me   : signed_in_mesg.remember_me    # True if sign in accomplished via rememember me token.
            email_address : signed_in_mesg.email_address
            account_id    : signed_in_mesg.account_id

    # Return the full name if user has signed in; otherwise returns undefined.
    fullname: () =>
        if @account_settings?
            return @account_settings.first_name + " " + @account_settings.last_name

    signed_out: () =>
        @account_id = undefined

    #########################################################
    # Setting and getting HTTP-only cookies via Primus + AJAX
    #########################################################
    get_cookie: (opts) ->
        opts = defaults opts,
            name : required
            cb   : required   # cb(value)
        #winston.debug("!!!!  get cookie '#{opts.name}'")
        @once("get_cookie-#{opts.name}", (value) -> opts.cb(value))
        @push_to_client(message.cookies(id:@conn.id, get:opts.name, url:program.base_url+"/cookies"))

    set_cookie: (opts) ->
        opts = defaults opts,
            name  : required
            value : required
            ttl   : undefined    # time in seconds until cookie expires
        options = {}
        if opts.ttl?  # Todo: ignored
            options.expires = new Date(new Date().getTime() + 1000*opts.ttl)
        @cookies[opts.name] = {value:opts.value, options:options}  # TODO: this can't work
        @push_to_client(message.cookies(id:@conn.id, set:opts.name, url:program.base_url+"/cookies", value:opts.value))

    remember_me: (opts) ->
        #############################################################
        # Remember me.  There are many ways to implement
        # "remember me" functionality in a web app. Here's how
        # we do it with Salvus.  We generate a random uuid,
        # which along with salt, is stored in the user's
        # browser as an httponly cookie.  We password hash the
        # random uuid and store that in our database.  When
        # the user later visits the Salvus site, their browser
        # sends the cookie, which the server hashes to get the
        # key for the database table, which has corresponding
        # value the mesg needed for sign in.  We then sign the
        # user in using that message.
        #
        # The reason we use a password hash is that if
        # somebody gains access to an entry in the key:value
        # store of the database, we want to ensure that they
        # can't use that information to login.  The only way
        # they could login would be by gaining access to the
        # cookie in the user's browser.
        #
        # There is no point in signing the cookie since its
        # contents are random.
        #
        # Regarding ttl, we use 1 month.  The database will forget
        # the cookie automatically at the same time that the
        # browser invalidates it.
        #############################################################

        opts = defaults opts,
            email_address : required
            account_id    : required

        opts.hub = program.host
        opts.remember_me = true

        signed_in_mesg   = message.signed_in(opts)
        session_id       = uuid.v4()
        @hash_session_id = password_hash(session_id)
        ttl              = 24*3600 * 365     # 365 days

        # write it -- quick and loose, then more replicas
        @remember_me_db.set
            key         : @hash_session_id
            value       : signed_in_mesg
            ttl         : ttl
            consistency : cql.types.consistencies.one
            cb          : (err) =>
                # write to more replicas, just for good measure
                @remember_me_db.set
                    key         : @hash_session_id
                    value       : signed_in_mesg
                    ttl         : ttl
                    consistency : cql.types.consistencies.localQuorum
                    cb          : (err) =>
                        if err
                            winston.debug("WARNING: issue writing remember me cookie: #{err}")

        x = @hash_session_id.split('$')    # format:  algorithm$salt$iterations$hash
        @set_cookie
            name  : program.base_url + 'remember_me'
            value : [x[0], x[1], x[2], session_id].join('$')
            ttl   : ttl

    invalidate_remember_me: (opts) ->
        opts = defaults opts,
            cb : required

        if @hash_session_id?
            @remember_me_db.delete
                key : @hash_session_id
                cb  : opts.cb
        else
            opts.cb()

    ######################################################################
    #
    # Our realtime socket connection might only supports one connection between the client and
    # server, so we multiplex multiple channels over the same
    # connection.  There is one base channel for JSON messages called
    # JSON_CHANNEL, which themselves can be routed to different
    # callbacks, etc., by the client code.  There are 16^4-1 other
    # channels, which are for sending raw data.  The raw data messages
    # are prepended with a UTF-16 character that identifies the
    # channel.  The channel character is random (which might be more
    # secure), and there is no relation between the channels for two
    # distinct clients.
    #
    ######################################################################

    handle_data_from_client: (data) =>
        #winston.debug("handle_data_from_client(#{data.slice(0,100)})")
        # TODO: THIS IS A SIMPLE anti-DOS measure; it might be too
        # extreme... we shall see.  It prevents a number of attacks,
        # e.g., users storing a multi-gigabyte worksheet title,
        # etc..., which would (and will) otherwise require care with
        # every single thing we store.

        # TODO: the two size things below should be specific messages (not generic error_to_client), and
        # be sensibly handled by the client.
        if data.length >= MESG_QUEUE_MAX_SIZE_MB * 10000000
            # We don't parse it, we don't look at it, we don't know it's id.  This shouldn't ever happen -- and probably would only
            # happen because of a malicious attacker.  JSON parsing arbitrarily large strings would
            # be very dangerous, and make crashing the server way too easy.
            # We just respond with this error below.   The client should display to the user all id-less errors.
            msg = "The server ignored a huge message since it exceeded the allowed size limit of #{MESG_QUEUE_MAX_SIZE_MB}MB.  Please report what caused this if you can."
            winston.error(msg)
            @error_to_client(error:msg)
            return

        if data.length == 0
            msg = "The server ignored a message since it was empty."
            winston.error(msg)
            @error_to_client(error:msg)
            return

        if not @_handle_data_queue?
            @_handle_data_queue = []

        channel = data[0]
        h = @_data_handlers[channel]

        if not h?
            winston.error("unable to handle data on an unknown channel: '#{channel}', '#{data}'")
            # Tell the client that they had better reconnect.
            @push_to_client( message.session_reconnect(data_channel : channel) )
            return

        # The rest of the function is basically the same as "h(data.slice(1))", except that
        # it ensure that if there is a burst of messages, then (1) we handle at most 1 message
        # per client every MESG_QUEUE_INTERVAL_MS, and we drop messages if there are too many.
        # This is an anti-DOS measure.

        @_handle_data_queue.push([h, data.slice(1)])

        if @_handle_data_queue_empty_function?
            return

        # define a function to empty the queue
        @_handle_data_queue_empty_function = () =>
            if @_handle_data_queue.length == 0
                # done doing all tasks
                delete @_handle_data_queue_empty_function
                return

            # drop oldest message to keep
            if @_handle_data_queue.length > MESG_QUEUE_MAX_COUNT
                winston.debug("MESG_QUEUE_MAX_COUNT(=#{MESG_QUEUE_MAX_COUNT}) exceeded (=#{@_handle_data_queue.length}) -- drop oldest messages")
                while @_handle_data_queue.length > MESG_QUEUE_MAX_COUNT
                    @_handle_data_queue.shift()

            # get task
            task = @_handle_data_queue.shift()
            # do task
            task[0](task[1])
            # do next one in >= MESG_QUEUE_INTERVAL_MS
            setTimeout( @_handle_data_queue_empty_function, MESG_QUEUE_INTERVAL_MS )

        @_handle_data_queue_empty_function()

    register_data_handler: (h) ->
        # generate a channel character that isn't already taken -- if these get too large,
        # this will break (see, e.g., http://blog.fgribreau.com/2012/05/how-to-fix-could-not-decode-text-frame.html);
        # however, this is a counter for *each* individual user connection, so they won't get too big.
        # Ultimately, we'll redo things to use primus/websocket channel support, which should be much more powerful
        # and faster.
        if not @_last_channel?
            @_last_channel = 1
        while true
            @_last_channel += 1
            channel = String.fromCharCode(@_last_channel)
            if not @_data_handlers[channel]?
                break
        @_data_handlers[channel] = h
        return channel

    ################################################################
    # Message handling functions:
    #
    # Each function below that starts with mesg_ handles a given
    # message type (an event).  The implementations of many of the
    # handlers are somewhat long/involved, so the function below
    # immediately calls another function defined elsewhere.  This will
    # make it easier to refactor code to other modules, etc., later.
    # This approach also clarifies what exactly about this object
    # is used to implement the relevant functionality.
    ################################################################

    handle_json_message_from_client: (data) =>
        try
            mesg = from_json(data)
        catch error
            winston.error("error parsing incoming mesg (invalid JSON): #{mesg}")
            return
        #winston.debug("got message: #{data}")
        if mesg.event != 'codemirror_bcast' and mesg.event != 'ping'
            winston.debug("client --> hub (client=#{@id}): #{misc.trunc(to_safe_str(mesg), 300)}")
        handler = @["mesg_#{mesg.event}"]
        if handler?
            handler(mesg)
        else
            @push_to_client(message.error(error:"Hub does not know how to handle a '#{mesg.event}' event.", id:mesg.id))

    ######################################################
    # Plug into an existing sage session
    ######################################################
    get_sage_session: (mesg, cb) ->    # if allowed to connect cb(false, session); if not, error sent to client and cb(true)
        if not mesg.session_uuid?
            err = "Invalid message -- does not have a session_uuid field."
            @error_to_client(id:mesg.id, error:err)
            cb?(err)
            return

        # Check if we already have a TCP connection to this session.
        session = compute_sessions[mesg.session_uuid]
        if not session?
            # Make a new connection -- this will connect to correct
            # running session if the session_uuid corresponds to one.
            # If nothing is running, it will make a new session.
            session = new SageSession
                client       : @
                project_id   : mesg.project_id
                session_uuid : mesg.session_uuid
                cb           : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                        cb?(err)
                    else
                        cb?(false, session)
            return

        # Connect client to existing connection.
        if session.is_client(@)
            cb?(false, session)
        else
            # add_client *DOES* check permissions
            session.add_client @, (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                    cb?(err)
                else
                    cb?(false, session)

    ######################################################
    # ping/pong
    ######################################################
    mesg_ping: (mesg) =>
        @push_to_client(message.pong(id:mesg.id))


    ######################################################
    # Messages: Sage compute sessions and code execution
    ######################################################
    mesg_execute_code: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to execute code."))
            return
        if not mesg.session_uuid?
            stateless_sage_exec(mesg, @push_to_client)
            return

        @get_sage_session mesg, (err, session) =>
            if err
                return
            else
                session.send_json(@, mesg)

    mesg_start_session: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to start a session."))
            return

        switch mesg.type
            when 'sage'
                # This also saves itself to persistent_sage_sessions and compute_sessions global dicts...
                session = new SageSession
                    client     : @
                    project_id : mesg.project_id
                    cb         : (err) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            winston.debug("sending #{misc.to_json(message.session_started(id:mesg.id, session_uuid:session.session_uuid))}")
                            @push_to_client(message.session_started(id:mesg.id, session_uuid:session.session_uuid))
            when 'console'
                @connect_to_console_session(mesg)
            else
                @error_to_client(id:mesg.id, error:"Unknown message type '#{mesg.type}'")

    mesg_connect_to_session: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to start a session."))
            return
        switch mesg.type
            when 'sage'
                # Getting the session with given mesg.session_uuid
                # adds this client to the session, if this client has
                # appropriate permissions.
                @get_sage_session mesg, (err, session) =>
                    if not err
                        @push_to_client(message.session_connected(id:mesg.id, session_uuid:mesg.session_uuid))
            when 'console'
                @connect_to_console_session(mesg)
            else
                # TODO
                @push_to_client(message.error(id:mesg.id, error:"Connecting to session of type '#{mesg.type}' not yet implemented"))

    connect_to_console_session: (mesg) =>
        # TODO -- implement read-only console sessions too (easy and amazing).
        @get_project mesg, 'write', (err, project) =>
            if not err  # get_project sends error to client
                project.console_session
                    client       : @
                    params       : mesg.params
                    session_uuid : mesg.session_uuid
                    cb           : (err, connect_mesg) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            connect_mesg.id = mesg.id
                            @push_to_client(connect_mesg)

    mesg_send_signal: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to send a signal."))
            return
        @get_sage_session mesg, (err, session) =>
            if err
                return
            else
                session.send_signal(mesg.signal)

    mesg_restart_session: (mesg) =>
        @get_sage_session mesg, (err, session) =>
            if err
                return
            session.restart  @, mesg, (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_terminate_session: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if not err  # get_project sends error to client
                project.terminate_session
                    session_uuid : mesg.session_uuid
                    cb           : (err, resp) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(mesg)  # same message back.

    ######################################################
    # Message: introspections
    #   - completions of an identifier / methods on an object (may result in code evaluation)
    #   - docstring of function/object
    #   - source code of function/class
    ######################################################
    mesg_introspect: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to send a signal."))
            return
        @get_sage_session mesg, (err, session) =>
            if err
                return
            else
                session.send_json(@, mesg)

    ######################################################
    # Messages: Account creation, sign in, sign out
    ######################################################
    mesg_create_account: (mesg) =>
        create_account(@, mesg)

    mesg_sign_in: (mesg) => sign_in(@,mesg)

    mesg_sign_out: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"Not signed in."))
            return

        @signed_out()
        #winston.debug("after signed_out, account_id = #{@account_id}")
        @invalidate_remember_me
            cb:(error) =>
                winston.debug("signing out: #{mesg.id}, #{error}")
                if not error
                    @push_to_client(message.error(id:mesg.id, error:error))
                else
                    @push_to_client(message.signed_out(id:mesg.id))

    ######################################################
    # Messages: Password/email address management
    ######################################################
    mesg_password_reset: (mesg) =>
        password_reset(mesg, @ip_address, @push_to_client)

    mesg_change_password: (mesg) =>
        change_password(mesg, @ip_address, @push_to_client)

    mesg_forgot_password: (mesg) =>
        forgot_password(mesg, @ip_address, @push_to_client)

    mesg_reset_forgot_password: (mesg) =>
        reset_forgot_password(mesg, @ip_address, @push_to_client)

    mesg_change_email_address: (mesg) =>
        change_email_address(mesg, @ip_address, @push_to_client)

    ######################################################
    # Messages: Account settings
    ######################################################
    mesg_get_account_settings: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"not yet signed in"))
        else if @account_id != mesg.account_id
            @push_to_client(message.error(id:mesg.id, error:"not signed in as user with id #{mesg.account_id}."))
        else
            database.get_account
                account_id : @account_id
                cb : (err, data) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        # delete password hash -- user doesn't want to see/know that.
                        delete data['password_hash']

                        # Set defaults for unset keys.  We do this so that in the
                        # long run it will always be easy to migrate the database
                        # forward (with new columns).
                        for key, val of message.account_settings_defaults
                            if not data[key]?
                                data[key] = val

                        # Cache the groups of this user, so we don't have to look
                        # them up for other permissions.  Caveat: user may have to refresh
                        # their browser to update group membership, in case their
                        # groups change.  If this is an issue, make this property get
                        # deleted automatically.
                        @groups = data.groups
                        @account_settings = data

                        # Send account settings back to user.
                        data.id = mesg.id
                        @push_to_client(message.account_settings(data))

    get_groups: (cb) =>
        # see note above about our "infinite caching".  Maybe a bad idea.
        if @groups?
            cb(undefined, @groups)
            return
        database.get_account
            columns    : ['groups']
            account_id : @account_id
            cb         : (err, r) =>
                if err
                    cb(err)
                else
                    @groups = r['groups']
                    cb(undefined, @groups)

    mesg_account_settings: (mesg) =>
        if @account_id != mesg.account_id
            @push_to_client(message.error(id:mesg.id, error:"Not signed in as user with id #{mesg.account_id}."))
        else
            save_account_settings(mesg, @push_to_client)

    ######################################################
    # Messages: Saving/loading scratch worksheet
    ######################################################
    mesg_save_scratch_worksheet: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to save the scratch worksheet to the server."))
            return

        database.uuid_value_store(name:"scratch_worksheets").set
            uuid  : @account_id
            value : mesg.data
            cb    : (error, result) =>
                if error
                    @push_to_client(message.error(id:mesg.id, error:error))
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_load_scratch_worksheet: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to load the scratch worksheet from the server."))
            return
        database.uuid_value_store(name:"scratch_worksheets").get
            uuid : @account_id
            cb   : (error, data) =>
                if error
                    @push_to_client(message.error(id:mesg.id, error:error))
                else
                    @push_to_client(message.scratch_worksheet_loaded(id:mesg.id, data:data))

    mesg_delete_scratch_worksheet: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to delete your scratch worksheet from the server."))
            return
        database.uuid_value_store(name:"scratch_worksheets").delete
            uuid : @account_id
            cb   : (error, data) =>
                if error
                    @push_to_client(message.error(id:mesg.id, error:error))
                else
                    @push_to_client(message.success(id:mesg.id))

    ######################################################
    # Messages: Client feedback
    ######################################################
    mesg_report_feedback: (mesg) =>
        report_feedback(mesg, @push_to_client, @account_id)

    mesg_get_all_feedback_from_user: (mesg) =>
        get_all_feedback_from_user(mesg, @push_to_client, @account_id)

    ######################################################
    # Messages: Project Management
    ######################################################

    # Either call the callback with the project, or if an error err
    # occured, call @error_to_client(id:mesg.id, error:err) and *NEVER*
    # call the callback.  This function is meant to be used in a bunch
    # of the functions below for handling requests.
    get_project: (mesg, permission, cb) =>
        # mesg -- must have project_id field
        # permission -- must be "read" or "write"
        # cb(err, project)
        #   *NOTE*:  on failure, if mesg.id is defined, then client will receive an error message; the function
        #            calling get_project does *NOT* have to send the error message back to the client!


        err = undefined
        if not mesg.project_id?
            err = "mesg must have project_id attribute -- #{to_safe_str(mesg)}"
        else if not @account_id?
            err = "user must be signed in before accessing projects"

        if err?
            if mesg.id?
                @error_to_client(id:mesg.id, error:err)
            cb(err)
            return

        key = mesg.project_id + permission
        project = @_project_cache?[key]
        if project?
            # Use the cached project so we don't have to re-verify authentication for the user again below, which
            # is very expensive.  This cache does expire, in case user is kicked out of the project.
            cb(undefined, project)
            return

        project = undefined
        async.series([
            (cb) =>
                switch permission
                    when 'read'
                        user_has_read_access_to_project
                            project_id     : mesg.project_id
                            account_id     : @account_id
                            account_groups : @groups
                            cb             : (err, result) =>
                                if err
                                    cb("Internal error determining user permission -- #{err}")
                                else if not result
                                    cb("User #{@account_id} does not have read access to project #{mesg.project_id}")
                                else
                                    # good to go
                                    cb()
                    when 'write'
                        user_has_write_access_to_project
                            project_id     : mesg.project_id
                            account_groups : @groups
                            account_id     : @account_id
                            cb             : (err, result) =>
                                if err
                                    cb("Internal error determining user permission -- #{err}")
                                else if not result
                                    cb("User #{@account_id} does not have write access to project #{mesg.project_id}")
                                else
                                    # good to go
                                    cb()
                    else
                        cb("Internal error -- unknown permission type '#{permission}'")
            (cb) =>
                new_project mesg.project_id, (err, _project) =>
                    if err
                        cb(err)
                    else
                        project = _project
                        database.touch_project(project_id:mesg.project_id)
                        cb()
        ], (err) =>
                if err
                    if mesg.id?
                        @error_to_client(id:mesg.id, error:err)
                    cb(err)
                else
                    if not @_project_cache?
                        @_project_cache = {}
                    @_project_cache[key] = project
                    setTimeout((()=>delete @_project_cache[key]), CACHE_PROJECT_AUTH_MS)  # cache for a while
                    cb(undefined, project)
        )

    # Mark a project as "deleted" in the database.  This is non-destructive by design --
    # as is almost everything in SMC.  Projects cannot be permanently deleted.
    mesg_delete_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to delete a project.")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return # error handled in get_project
            project.delete_project
                cb : (err, ok) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_undelete_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to undelete a project.")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return # error handled in get_project
            project.undelete_project
                cb : (err, ok) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_hide_project_from_user: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "you must be signed in to hide a project")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            async.series([
                (cb) =>
                    if mesg.account_id? and mesg.account_id != @account_id
                        # trying to hide project from another user -- @account_id must be owner of project
                        user_owns_project
                            project_id : mesg.project_id
                            account_id : @account_id
                            cb         : (err, is_owner) =>
                                if err
                                    cb(err)
                                else if not is_owner
                                    cb("only the owner of a project may hide it from collaborators")
                                else
                                    cb()
                    else
                        mesg.account_id = @account_id
                        cb()
                (cb) =>
                    project.hide_project_from_user
                        account_id : mesg.account_id
                        cb         : cb
            ], (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))
            )

    mesg_unhide_project_from_user: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "you must be signed in to unhide a project")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            async.series([
                (cb) =>
                    if mesg.account_id? and mesg.account_id != @account_id
                        # trying to unhide project from another user -- @account_id must be owner of project
                        user_owns_project
                            project_id : mesg.project_id
                            account_id : @account_id
                            cb         : (err, is_owner) =>
                                if err
                                    cb(err)
                                else if not is_owner
                                    cb("only the owner of a project may unhide it from collaborators")
                                else
                                    cb()
                    else
                        mesg.account_id = @account_id
                        cb()
                (cb) =>
                    project.unhide_project_from_user
                        account_id : mesg.account_id
                        cb         : cb
            ], (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))
            )

    mesg_move_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to move a project.")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return # error handled in get_project
            project.move_project
                target : mesg.target
                cb : (err, location) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.project_moved(id:mesg.id, location:location))

    mesg_create_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to create a new project.")
            return

        dbg = (m) -> winston.debug("mesg_create_project(#{misc.to_json(mesg)}): #{m}")

        project_id = uuid.v4()
        project    = undefined
        location   = undefined

        async.series([
            (cb) =>
                dbg("create project entry in database")
                database.create_project
                    project_id  : project_id
                    account_id  : @account_id
                    title       : mesg.title
                    description : mesg.description
                    public      : mesg.public
                    cb          : cb
            (cb) =>
                dbg("start project opening so that when user tries to open it in a moment it opens more quickly")
                new_local_hub
                    project_id : project_id
                    cb         : (err, hub) =>
                        if not err
                            dbg("got local hub/project, now calling a function so that it opens")
                            hub.local_hub_socket (err, socket) =>
                                dbg("opened project")
                cb() # but don't wait!
        ], (err) =>
            if err
                dbg("error; project #{project_id} -- #{err}")
                @error_to_client(id: mesg.id, error: "Failed to create new project '#{mesg.title}' -- #{misc.to_json(err)}")
            else
                dbg("SUCCESS: project #{project_id}")
                @push_to_client(message.project_created(id:mesg.id, project_id:project_id))
                push_to_clients  # push a message to all other clients logged in as this user.
                    where : {account_id:@account_id,  exclude: [@conn.id]}
                    mesg  : message.project_list_updated()
                # As an optimization, we start the process of opening the project, since the user is likely
                # to open the project soon anyways.
                dbg("start process of opening project")
                @get_project {project_id:project_id}, 'write', (err, project) =>
        )



    mesg_get_projects: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to get a list of projects.")
            return

        database.get_projects_with_user
            account_id : @account_id
            hidden     : mesg.hidden
            cb         : (error, projects) =>
                if error
                    @error_to_client(id: mesg.id, error: "Database error -- failed to obtain list of your projects.")
                else
                    # sort them by last_edited (something db doesn't do)
                    projects.sort((a,b) -> if a.last_edited < b.last_edited then +1 else -1)
                    @push_to_client(message.all_projects(id:mesg.id, projects:projects))

    mesg_get_project_info: (mesg) =>
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            else
                process = (info) =>
                    if info.hide_from_accounts?
                        info.hidden = @account_id in info.hide_from_accounts
                        delete info.hide_from_accounts
                    return info

                project.get_info (err, info) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        if not info.location
                            # This is what would happen if the project were shelved after being created;
                            # suddenly the location would be null, even though in some hubs the Project
                            # instance would exist.  In this case, we need to recreate the project, which
                            # will deploy it somewhere.
                            delete _project_cache[project.project_id]
                            @get_project mesg, 'read', (err, project) =>
                                # give it this one try only this time.
                                project.get_info (err, info) =>
                                    if err
                                        @error_to_client(id:mesg.id, error:err)
                                    else
                                        @push_to_client(message.project_info(id:mesg.id, info:process(info)))
                        else
                            @push_to_client(message.project_info(id:mesg.id, info:process(info)))

    mesg_project_session_info: (mesg) =>
        assert mesg.event == 'project_session_info'
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            else
                project.call
                    mesg : mesg
                    cb   : (err, info) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.project_session_info(id:mesg.id, info:info))

    mesg_project_status: (mesg) =>
        winston.debug("mesg_project_status")
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            else
                project.local_hub.project.status
                    cb   : (err, status) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            if status?
                                delete status.secret_token
                            @push_to_client(message.project_status(id:mesg.id, status:status))


    mesg_project_get_state: (mesg) =>
        winston.debug("mesg_project_get_state")
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            else
                project.local_hub.project.get_state
                    cb   : (err, state) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.project_get_state(id:mesg.id, state:state))

    mesg_project_get_local_state: (mesg) =>
        winston.debug("mesg_project_get_local_state")
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            else
                project.local_hub.project.get_local_state
                    cb   : (err, state) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.project_get_local_state(id:mesg.id, state:state))


    mesg_update_project_data: (mesg) =>
        winston.debug("mesg_update_project_data")
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to set data about a project.")
            return

        user_has_write_access_to_project
            project_id     : mesg.project_id
            account_id     : @account_id
            account_groups : @groups
            cb: (error, ok) =>
                winston.debug("mesg_update_project_data -- cb")
                if error
                    @error_to_client(id:mesg.id, error:error)
                    return
                else if not ok
                    @error_to_client(id:mesg.id, error:"You do not own the project with id #{mesg.project_id}.")
                else
                    # sanatize the mesg.data object -- we don't want client to just be able to set anything about a project.
                    data = {}
                    for field in ['title', 'description', 'public']
                        if mesg.data[field]?
                            data[field] = mesg.data[field]
                    winston.debug("mesg_update_project_data -- about to call update")
                    database.update
                        table   : "projects"
                        where   : {project_id:mesg.project_id}
                        set     : data
                        cb      : (error, result) =>
                            winston.debug("mesg_update_project_data -- cb2 #{error}, #{result}")
                            if error
                                @error_to_client(id:mesg.id, error:"Database error changing properties of the project with id #{mesg.project_id}.")
                            else
                                push_to_clients
                                    where : {project_id:mesg.project_id, account_id:@account_id}
                                    mesg  : message.project_data_updated(id:mesg.id, project_id:mesg.project_id)

    mesg_write_text_file_to_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.write_file
                path : mesg.path
                data : mesg.content
                cb   : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.file_written_to_project(id:mesg.id))

    mesg_read_text_file_from_project: (mesg) =>
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            project.read_file
                path : mesg.path
                cb   : (err, content) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        t = content.blob.toString()
                        @push_to_client(message.text_file_read_from_project(id:mesg.id, content:t))

    mesg_read_file_from_project: (mesg) =>
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            project.read_file
                path    : mesg.path
                archive : mesg.archive
                cb      : (err, content) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        # Store content in uuid:blob store and provide a temporary link to it.
                        u = misc_node.uuidsha1(content.blob)
                        save_blob
                            uuid  : u
                            value : content.blob
                            ttl   : BLOB_TTL
                            check : false       # trusted hub generated the uuid above.
                            cb    : (err) =>
                                if err
                                    @error_to_client(id:mesg.id, error:err)
                                else
                                    if content.archive?
                                        the_url = program.base_url + "/blobs/#{mesg.path}.#{content.archive}?uuid=#{u}"
                                    else
                                        the_url = program.base_url + "/blobs/#{mesg.path}?uuid=#{u}"
                                    @push_to_client(message.temporary_link_to_file_read_from_project(id:mesg.id, url:the_url))

    mesg_move_file_in_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.move_file mesg.src, mesg.dest, (err, content) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.file_moved_in_project(id:mesg.id))

    mesg_make_directory_in_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.make_directory mesg.path, (err, content) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.directory_made_in_project(id:mesg.id))

    mesg_remove_file_from_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.remove_file mesg.path, (err, resp) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    resp.id = mesg.id
                    @push_to_client(resp)

    mesg_project_exec: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.call
                mesg    : mesg
                timeout : mesg.timeout
                cb      : (err, resp) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(resp)

    mesg_project_restart: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.local_hub.restart (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_close_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.local_hub.close (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_linked_projects: (mesg) =>
        if not mesg.add? and not mesg.remove?
            # get list of linked projects
            @get_project mesg, 'read', (err, project) =>
                if err
                    return
                # we have read access to this project, so we can see list of linked projects
                database.linked_projects
                    project_id : project.project_id
                    cb         : (err, list) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.linked_projects(id:mesg.id, list:list))
        else
            @get_project mesg, 'write', (err, project) =>
                if err
                    return
                # we have read/write access to this project, so we can add/remove linked projects
                database.linked_projects
                    add        : mesg.add
                    remove     : mesg.remove
                    project_id : project.project_id
                    cb         : (err) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.success(id:mesg.id))



    mesg_copy_path_between_projects: (mesg) =>
        if not mesg.src_project_id?
            @error_to_client(id:mesg.id, error:"src_project_id must be defined")
            return
        if not mesg.target_project_id?
            @error_to_client(id:mesg.id, error:"target_project_id must be defined")
            return
        if not mesg.src_path?
            @error_to_client(id:mesg.id, error:"src_path must be defined")
            return

        async.series([
            (cb) =>
                # Check permissions for the source and target projects (in parallel) --
                # need read access to the source and write access to the target.
                async.parallel([
                    (cb) =>
                        user_has_read_access_to_project
                            project_id     : mesg.src_project_id
                            account_id     : @account_id
                            account_groups : @groups
                            cb         : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("user must have read access to source project #{mesg.src_project_id}")
                                else
                                    cb()
                    (cb) =>
                        user_has_write_access_to_project
                            project_id     : mesg.target_project_id
                            account_id     : @account_id
                            account_groups : @groups
                            cb             : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("user must have write access to target project #{mesg.target_project_id}")
                                else
                                    cb()
                ], cb)

            (cb) =>
                # do the copy
                project = bup_server.get_project(mesg.src_project_id)
                project.copy_path
                    path            : mesg.src_path
                    project_id      : mesg.target_project_id
                    target_path     : mesg.target_path
                    overwrite_newer : mesg.overwrite_newer
                    delete_missing  : mesg.delete_missing
                    timeout         : mesg.timeout
                    cb              : cb

        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.success(id:mesg.id))
        )


    ################################################
    # Directly communicate with the local hub.  If the
    # client has write access to the local hub, there's no
    # reason they shouldn't be allowed to send arbitrary
    # messages directly (they could anyways from the terminal).
    ################################################
    mesg_local_hub: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            if not mesg.message?
                # in case the message itself is invalid -- is possible
                @error_to_client(id:mesg.id, error:"message must be defined")
                return

            # It's extremely useful if the local hub has a way to distinguish between different clients who are
            # being proxied through the same hub.
            mesg.message.client_id = @id

            # Tag broadcast messages with identifying info.
            if mesg.message.event == 'codemirror_bcast'
                if @signed_in_mesg?
                    if not mesg.message.name?
                        mesg.message.name = @fullname()
                    if not mesg.message.color?
                        # Use first 6 digits of uuid... one color per session, NOT per username.
                        # TODO: this could be done client side in a way that respects their color scheme...?
                        mesg.message.color = @id.slice(0,6)

            if mesg.message.event == 'codemirror_write_to_disk'
                # Record that a client is actively doing something with this session, but
                # use a timeout to give local hub a chance to actually do the above save...
                f = () =>
                    # record that project is active in the database
                    database.touch_project(project_id : project.project_id)
                    # snapshot project and rsync it out to replicas, if enough time has passed.
                    project.local_hub?.project.save()
                setTimeout(f, 10000)  # 10 seconds later, possibly replicate.

            # Record eaching opening of a file in the database log
            if mesg.message.event == 'codemirror_get_session' and mesg.message.path? and mesg.message.path != '.sagemathcloud.log' and @account_id? and mesg.message.project_id?
                database.log_file_access
                    project_id : mesg.message.project_id
                    account_id : @account_id
                    filename   : mesg.message.path

            # Make the actual call
            project.call
                mesg           : mesg.message
                timeout        : mesg.timeout
                multi_response : mesg.multi_response
                cb             : (err, resp) =>
                    if err
                        winston.debug("ERROR: #{err} calling message #{to_json(mesg.message)}")
                        @error_to_client(id:mesg.id, error:err)
                    else
                        if not mesg.multi_response
                            resp.id = mesg.id
                        @push_to_client(resp)

    ## -- user search
    mesg_user_search: (mesg) =>
        if not mesg.limit? or mesg.limit > 50
            # hard cap at 50...
            mesg.limit = 50
        database.user_search
            query : mesg.query
            limit : mesg.limit
            cb    : (err, results) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.user_search_results(id:mesg.id, results:results))

    mesg_get_project_users: (mesg) =>
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            database.get_project_users
                project_id : mesg.project_id
                cb         : (err, users) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.project_users(id:mesg.id, users:users))

    mesg_invite_collaborator: (mesg) =>
        if mesg.account_id == @account_id
            @error_to_client(id:mesg.id, error:"You cannot add yourself as a collaborator on a project.")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            # SECURITY NOTE: mesg.project_id is valid and the client has write access, since otherwise,
            # the @get_project function above wouldn't have returned without err...
            database.add_user_to_project
                project_id : mesg.project_id
                account_id : mesg.account_id
                group      : 'collaborator'  # in future will be "invite_collaborator", once implemented
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_invite_noncloud_collaborators: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return

            if mesg.to.length > 1024
                @error_to_client(id:mesg.id, error:"Specify less recipients when adding collaborators to project.")
                return

            # users to invite
            to = (x for x in mesg.to.replace(/\s/g,",").replace(/;/g,",").split(',') when x)
            #winston.debug("invite users: to=#{misc.to_json(to)}")

            # invitation template
            email = mesg.email
            if email.indexOf("https://cloud.sagemath.com") == -1
                # User deleted the link template for some reason.
                email += "\nhttps://cloud.sagemath.com\n"

            invite_user = (email_address, cb) =>
                winston.debug("inviting #{email_address}")
                if not client_lib.is_valid_email_address(email_address)
                    cb("invalid email address '#{email_address}'")
                    return
                email_address = misc.lower_email_address(email_address)
                if email_address.length >= 128
                    # if an attacker tries to embed a spam in the email address itself (e.g, wstein+spam_message@gmail.com), then
                    # at least we can limit its size.
                    cb("email address must be at most 128 characters: '#{email_address}'")
                    return
                done  = false
                account_id = undefined
                async.series([
                    # already have an account?
                    (cb) =>
                        database.account_exists
                            email_address : email_address
                            cb            : (err, _account_id) =>
                                winston.debug("account_exists: #{err}, #{_account_id}")
                                account_id = _account_id
                                cb(err)
                    (cb) =>
                        if account_id
                            winston.debug("user #{email_address} already has an account -- add directly")
                            # user has an account already
                            done = true
                            database.add_user_to_project
                                project_id : mesg.project_id
                                account_id : account_id
                                group      : 'collaborator'
                                cb         : cb
                        else
                            winston.debug("user #{email_address} doesn't have an account yet -- will send email")
                            # create trigger so that when user eventually makes an account,
                            # they will be added to the project.
                            database.account_creation_actions
                                email_address : email_address
                                action        : {action:'add_to_project', group:'collaborator', project_id:mesg.project_id}
                                ttl           : 60*60*24*14  # valid for 14 days
                                cb            : cb
                    (cb) =>
                        if done
                            cb()
                        else
                            cb()
                            # send an email to the user -- async, not blocking user.
                            # TODO: this can take a while -- we need to take some actionif it fails, e.g., change a setting in the projects table!
                            s = @signed_in_mesg
                            send_email
                                to      : email_address
                                from    : if s? then "#{s.first_name} #{s.last_name} <#{s.email_address}>" else undefined
                                subject : "SageMathCloud Invitation"
                                body    : email.replace("https://cloud.sagemath.com", "Sign up at https://cloud.sagemath.com using the email address #{email_address}.")
                                cb      : (err) =>
                                    winston.debug("send_email to #{email_address} -- done -- err={misc.to_json(err)}")

                ], cb)

            async.map to, invite_user, (err, results) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.invite_noncloud_collaborators_resp(id:mesg.id, mesg:"Invited #{mesg.to} to collaborate on a project."))

    mesg_remove_collaborator: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            # See "Security note" in mesg_invite_collaborator
            database.remove_user_from_project
                project_id : mesg.project_id
                account_id : mesg.account_id
                group      : 'collaborator'
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))


    ################################################
    # Project snapshots -- interface to the snap servers
    ################################################
    mesg_snap: (mesg) =>
        if mesg.command not in ['ls', 'restore', 'log', 'last', 'status']
            @error_to_client(id:mesg.id, error:"invalid snap command '#{mesg.command}'")
            return
        user_has_write_access_to_project
            project_id     : mesg.project_id
            account_id     : @account_id
            account_groups : @groups
            cb             : (err, result) =>
                if err or not result
                    @error_to_client(id:mesg.id, error:"access to project #{mesg.project_id} denied")
                else
                    snap_command
                        command    : mesg.command
                        project_id : mesg.project_id
                        snapshot   : mesg.snapshot
                        path       : mesg.path
                        timeout    : mesg.timeout
                        timezone_offset : mesg.timezone_offset
                        cb         : (err, list) =>
                            if err
                                @error_to_client(id:mesg.id, error:err)
                            else
                                mesg.list = list
                                @push_to_client(mesg)

    ################################################
    # The version of the running server.
    ################################################
    mesg_get_version: (mesg) =>
        mesg.version = salvus_version.version
        @push_to_client(mesg)

    ################################################
    # Stats about cloud.sagemath
    ################################################
    mesg_get_stats: (mesg) =>
        server_stats (err, stats) =>
            mesg.stats = stats
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(mesg)

    ################################################
    # Administration functionality
    ################################################
    user_is_in_group: (group) =>
        return @groups? and 'admin' in @groups

    mesg_project_set_quota: (mesg) =>
        if not @user_is_in_group('admin')
            @error_to_client(id:mesg.id, error:"must be logged in and a member of the admin group to set project quotas")
        else
            bup_server.get_project(mesg.project_id).set_settings
                memory     : mesg.memory
                cpu_shares : mesg.cpu_shares
                cores      : mesg.cores
                disk       : mesg.disk
                scratch    : mesg.scratch
                inode      : mesg.inode
                mintime    : mesg.mintime
                login_shell: mesg.login_shell
                network    : mesg.network
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:"problem setting quota -- #{err}")
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_set_account_creation_token: (mesg) =>
        if not @user_is_in_group('admin')
            @error_to_client(id:mesg.id, error:"must be logged in and a member of the admin group to set account creation token")
        else
            s = database.key_value_store(name:'global_admin_settings')
            s.set
                key   : 'account_creation_token'
                value : mesg.token
                cb    : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:"problem setting account creation token -- #{err}")
                    else
                        @push_to_client(message.success(id:mesg.id))


    mesg_get_account_creation_token: (mesg) =>
        if not @user_is_in_group('admin')
            @error_to_client(id:mesg.id, error:"must be logged in and a member of the admin group to get account creation token")
        else
            s = database.key_value_store(name:'global_admin_settings')
            s.get
                key   : 'account_creation_token'
                cb    : (err, val) =>
                    if err
                        @error_to_client(id:mesg.id, error:"problem getting account creation token -- #{err}")
                    else
                        if not val?
                            val = ''
                        @push_to_client(message.get_account_creation_token(id:mesg.id, token:val))

    ################################################
    # Public/published projects data
    ################################################
    get_public_project: (mesg, cb) =>
        err = undefined
        if not mesg.project_id?
            err = "mesg must have project_id attribute -- #{to_safe_str(mesg)}"
            if mesg.id?
                @error_to_client(id:mesg.id, error:err)
            cb(err)
            return

        project = @_public_project_cache?[mesg.project_id]
        if project?
            # Use the cached project so we don't have to re-verify public nature
            # of project, etc.
            cb(undefined, project)
            return

        database.project_is_public
            project_id : mesg.project_id
            cb         : (err, is_public) =>
                if err
                    # since this error is public facing, we don't want
                    # to give a low level database message.
                    err = "no public project with id #{mesg.project_id} available"
                if not err and not is_public
                    err = "project #{mesg.project_id} is not public"
                if err
                    if mesg.id?
                        @error_to_client(id:mesg.id, error:err)
                    cb(err)
                    return
                project = bup_server.get_project(mesg.project_id)
                if not @_public_project_cache?
                    @_public_project_cache = {}
                @_public_project_cache[mesg.project_id] = project
                setTimeout((()=>delete @_public_project_cache[mesg.project_id]), CACHE_PROJECT_PUBLIC_MS)  # cache for a while
                cb(undefined, project)

    mesg_public_get_project_info: (mesg) =>
        @get_public_project mesg, (err, project) =>
            if err
                return
            database.get_project_data
                project_id : mesg.project_id
                objectify  : true
                columns    : cass.PUBLIC_PROJECT_COLUMNS
                cb         : (err, info) =>
                    if err
                        @error_to_client(id:mesg.id, error:"no project with id #{mesg.project_id} available")
                    else
                        info.read_only = true
                        @push_to_client(message.public_project_info(id:mesg.id, info:info))

    mesg_public_get_directory_listing: (mesg) =>
        @get_public_project mesg, (err, project) =>
            if err
                return
             project.directory_listing
                path    : mesg.path
                hidden  : mesg.hidden
                time    : mesg.time
                start   : mesg.start
                limit   : mesg.limit
                cb      : (err, result) =>
                    if err
                        @error_to_client(id:mesg.id, error:"no project with id #{mesg.project_id} available")
                    else
                        @push_to_client(message.public_directory_listing(id:mesg.id, result:result))

    mesg_public_get_text_file: (mesg) =>
        @get_public_project mesg, (err, project) =>
            if err
                return
            project.read_file
                path    : mesg.path
                maxsize : 1000000  # restrict to 1MB -- for now
                cb      : (err, data) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.public_text_file_contents(id:mesg.id, data:data))


    ################################################
    # Task list messages..
    ################################################
    # The code below all work(ed) when written, but I had not
    # implemented limitations and authentication.  Also, I don't
    # plan now to use this code.  So I'm disabling handling any
    # of these messages, as a security precaution.
    ###
    mesg_create_task_list: (mesg) =>
        # TODO: add verification that owners is valid
        # TODO: error if user (or project) already has too many task lists (?)
        database.create_task_list
            owners      : mesg.owners    # list of project or account id's that are allowed to edit this task list.
            cb          : (err, task_list_id) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    mesg = message.task_list_created
                        id           : mesg.id
                        task_list_id : task_list_id
                    @push_to_client(mesg)

    mesg_edit_task_list: (mesg) =>
        # TODO: add verification that this client can edit the given task list
        database.edit_task_list
            task_list_id : mesg.task_list_id
            data         : mesg.data
            deleted      : mesg.deleted
            cb           : (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_get_task_list: (mesg) =>
        # TODO: add verification that this client can view the given task list
        database.get_task_list
            task_list_id : mesg.task_list_id
            columns      : mesg.columns
            include_deleted : mesg.include_deleted
            cb           : (err, task_list) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    mesg = message.task_list_resp
                        id        : mesg.id
                        task_list : task_list
                    @push_to_client(mesg)

    mesg_get_task_list_last_edited: (mesg) =>
        # TODO: add verification that this client can view the given task list
        database.get_task_list_last_edited
            task_list_id : mesg.task_list_id
            cb           : (err, last_edited) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    mesg = message.task_list_resp
                        id        : mesg.id
                        task_list : {last_edited : last_edited}
                    @push_to_client(mesg)

    mesg_set_project_task_list: (mesg) =>
        # TODO: add verification ...
        database.set_project_task_list
            task_list_id : mesg.task_list_id
            project_id   : mesg.project_id
            cb           : (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_create_task: (mesg) =>
        # TODO: add verification that this client can edit the given task list
        # TODO: error if title is too long
        database.create_task
            task_list_id : mesg.task_list_id
            title        : mesg.title
            position     : mesg.position
            cb          : (err, task_id) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    mesg = message.task_created
                        id      : mesg.id
                        task_id : task_id
                    @push_to_client(mesg)


    mesg_edit_task: (mesg) =>
        #winston.debug("edit_task: mesg=#{misc.to_json(mesg)}")
        # TODO: add verification that this client can edit the given task
        database.edit_task
            task_list_id : mesg.task_list_id
            task_id      : mesg.task_id
            title        : mesg.title
            position     : mesg.position
            data         : mesg.data
            done         : mesg.done
            deleted      : mesg.deleted
            sub_task_list_id : mesg.sub_task_list_id
            cb           : (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))
    ###



_server_stats_cache = undefined
server_stats = (cb) ->
    if _server_stats_cache?
        cb(false, _server_stats_cache)
    else
        cb("server stats not yet computed")

update_server_stats = () ->
    database.get_stats
        cb : (err, stats) ->
            if not err
                _server_stats_cache = stats


database_is_working = false
register_hub = (cb) ->
    database.update
        table : 'hub_servers'
        where : {host : program.host, port : program.port, dummy: true}
        set   : {clients: misc.len(clients)}
        ttl   : 2*REGISTER_INTERVAL_S
        cb    : (err) ->
            if err
                database_is_working = false
                winston.debug("Error registering with database - #{err}")
            else
                database_is_working = true
                winston.debug("Successfully registered with database.")
            cb?(err)

##-------------------------------
#
# Interaction with snap servers
#
##-------------------------------

snap_command = (opts) ->
    opts.cb("snap_command is deprecated")


##############################
# Create the Primus realtime socket server
##############################
primus_server = undefined
init_primus_server = () ->
    Primus = require('primus')
    opts =
        transformer : 'websockets'
        pathname    : '/hub'
    primus_server = new Primus(http_server, opts)
    winston.debug("primus_server: listening on #{opts.pathname}")
    primus_server.on "connection", (conn) ->
        winston.debug("primus_server: new connection from #{conn.address.ip} -- #{conn.id}")
        clients[conn.id] = new Client(conn)


#######################################################
# Pushing a message to clients; querying for clients
# This is (or will be) subtle, due to having
# multiple HUBs running on different computers.
#######################################################

# get_client_ids -- given query parameters, returns a list of id's,
#   where the id is the connection id, which we assume is
#   globally unique across all of space and time.
get_client_ids = (opts) ->
    opts = defaults opts,
        account_id : undefined      # include connected clients logged in under this account
        project_id : undefined      # include connected clients that are a user of this project
        exclude    : undefined      # array of id's to exclude from results
        cb         : required

    result = []   # will have list of client id's in it

    # include a given client id in result, if it isn't in the exclude array
    include = (id) ->
        if id not in result
            if opts.exclude?
                if id in opts.exclude
                    return
            result.push(id)

    account_ids = {}   # account_id's to consider

    if opts.account_id?
        account_ids[opts.account_id] = true

    async.series([
        # If considering a given project, then get all the relevant account_id's.
        (cb) ->
            if opts.project_id?
                database.get_account_ids_using_project
                    project_id : opts.project_id
                    cb         : (err, result) ->
                        if err
                            cb(err); return
                        for r in result
                            account_ids[r] = true
                        cb()
            else
                cb()
        # Now get the corresponding connected client id's.
        (cb) ->
            for id, client of clients
                if account_ids[client.account_id]?
                    include(id)
            cb()
    ], (err) ->
        opts.cb(err, result)
    )


# Send a message to a bunch of clients connected to this hub.
# This does not send anything to other hubs or clients at other hubs; the only
# way for a message to go to a client at another hub is via some local hub.
# This design means that we do not have to track which hubs which
# clients are connected to in a database or registry, which wold be a nightmare
# especially due to synchronization issues (some TODO comments might refer to such
# a central design, because that *was* the non-implemented design at some point).
push_to_clients = (opts) ->
    opts = defaults opts,
        mesg     : required
        where    : undefined  # see the get_client_ids function
        to       : undefined
        cb       : undefined

    dest = []

    async.series([
        (cb) ->
            if opts.where?
                get_client_ids(misc.merge(opts.where, cb:(error, result) ->
                    if error
                        opts.cb?(true)
                        cb(true)
                    else
                        dest = dest.concat(result)
                        cb()
                ))
            else
                cb()

        (cb) ->
            # include all clients explicitly listed in "to"
            if opts.to?
                dest = dest.concat(opts.to)

            for id in dest
                client = clients[id]
                if client?
                    winston.debug("pushing a message to client #{id}")
                    client.push_to_client(opts.mesg)
                else
                    winston.debug("not pushing message to client #{id} since not actually connected")
            opts.cb?(false)
            cb()


    ])



##############################
# LocalHub
##############################

connect_to_a_local_hub = (opts) ->    # opts.cb(err, socket)
    opts = defaults opts,
        port         : required
        host         : required
        secret_token : required
        timeout      : 10
        cb           : required

    socket = misc_node.connect_to_locked_socket
        port    : opts.port
        host    : opts.host
        token   : opts.secret_token
        timeout : opts.timeout
        cb      : (err) =>
            if err
                opts.cb(err)
            else
                misc_node.enable_mesg(socket, 'connection_to_a_local_hub')
                opts.cb(false, socket)

    socket.on 'data', (data) ->
        misc_node.keep_portforward_alive(opts.port)

_local_hub_cache = {}
new_local_hub = (opts) ->    # cb(err, hub)
    opts = defaults opts,
        project_id : required
        cb         : required

    hash = opts.project_id
    H    = _local_hub_cache[hash]

    if H?
        winston.debug("new_local_hub (#{opts.project_id}) -- using cached version")
        opts.cb(false, H)
    else
        start_time = misc.walltime()
        new LocalHub opts.project_id, (err, H) ->
            if err
                opts.cb(err)
            else
                _local_hub_cache[hash] = H
                opts.cb(undefined, H)

class LocalHub  # use the function "new_local_hub" above; do not construct this directly!
    constructor: (@project_id, cb) ->
        @_sockets = {}
        @_multi_response = {}
        @path = '.'    # should deprecate - *is* used by some random code elsewhere in this file
        @dbg("getting deployed running project")
        @project = bup_server.get_project(@project_id)
        cb(undefined, @)

    dbg: (m) =>
        winston.debug("local_hub(#{@project_id}): #{m}")

    close: (cb) =>
        winston.debug("local_hub.close(#{@project_id}): #{m}")
        @project.close(cb:cb)

    move: (opts) =>
        opts = defaults opts,
            target : undefined
            cb     : undefined          # cb(err, {host:hostname})
        winston.debug("local_hub.close(#{@project_id}): #{m}")
        @project.move(opts)

    restart: (cb) =>
        @dbg("restart")
        @project.restart(cb:cb)
        delete @_status
        delete @_socket

    # Send a JSON message to a session.
    # NOTE -- This makes no sense for console sessions, since they use a binary protocol,
    # but makes sense for other sessions.
    send_message_to_session: (opts) =>
        opts = defaults opts,
            message      : required
            session_uuid : required
            cb           : undefined   # cb?(err)

        socket = @_sockets[opts.session_uuid]
        if not socket?
            opts.cb?("Session #{opts.session_uuid} is no longer open.")
            return
        try
            socket.write_mesg('json', opts.message)
            opts.cb?()
        catch e
            opts.cb?("Error sending message to session #{opts.session_uuid} -- #{e}")

    # handle incoming JSON messages from the local_hub that do *NOT* have an id tag,
    # except those in @_multi_response.
    handle_mesg: (mesg) =>
        #@dbg("local_hub --> hub: received mesg: #{to_json(mesg)}")
        if mesg.id?
            @_multi_response[mesg.id]?(false, mesg)
            return
        if mesg.client_id?
            # Should we worry about ensuring that message from this local hub are allowed to
            # send messages to this client?  NO.  For them to send a message, they would have to
            # know the client's id, which is a random uuid, assigned each time the user connects.
            # It obviously is known to the local hub -- but if the user has connected to the local
            # hub then they should be allowed to receive messages.
            clients[mesg.client_id]?.push_to_client(mesg)

    handle_blob: (opts) =>
        opts = defaults opts,
            uuid : required
            blob : required

        @dbg("local_hub --> global_hub: received a blob with uuid #{opts.uuid}")
        # Store blob in DB.
        save_blob
            uuid  : opts.uuid
            value : opts.blob
            ttl   : BLOB_TTL
            check : true         # if malicious user tries to overwrite a blob with given sha1 hash, they get an error.
            cb    : (err, ttl) =>
                if err
                    resp = message.save_blob(sha1:opts.uuid, error:err)
                    @dbg("handle_blob: error! -- #{err}")
                else
                    resp = message.save_blob(sha1:opts.uuid, ttl:ttl)

                @local_hub_socket  (err,socket) =>
                     socket.write_mesg('json', resp)

    # Connection to the remote local_hub daemon that we use for control.
    local_hub_socket: (cb) =>
        if @_socket?
            cb(false, @_socket)
            return

        if @_local_hub_socket_connecting? and @_local_hub_socket_connecting
            @_local_hub_socket_queue.push(cb)
            return
        @_local_hub_socket_connecting = true
        @_local_hub_socket_queue = [cb]
        @new_socket (err, socket) =>
            @_local_hub_socket_connecting = false
            if err
                for c in @_local_hub_socket_queue
                    c(err)
            else
                @_socket = socket

                socket.on 'mesg', (type, mesg) =>
                    switch type
                        when 'blob'
                            @handle_blob(mesg)
                        when 'json'
                            @handle_mesg(mesg)

                socket.on 'end', () =>
                    delete @_status
                    delete @_socket
                socket.on 'close', () =>
                    delete @_status
                    delete @_socket
                socket.on 'error', () =>
                    delete @_status
                    delete @_socket

                for c in @_local_hub_socket_queue
                    c(false, @_socket)

    # Get a new connection to the local_hub,
    # authenticated via the secret_token, and enhanced
    # to be able to send/receive json and blob messages.
    new_socket: (cb) =>     # cb(err, socket)
        f = (cb) =>
            connect_to_a_local_hub
                port         : @address.port
                host         : @address.host
                secret_token : @address.status.secret_token
                cb           : cb
        socket = undefined
        async.series([
            (cb) =>
                if not @address?
                    # get address of a working local hub
                    @project.local_hub_address
                        cb : (err, address) =>
                            @address = address; cb(err)
                else
                    cb()
            (cb) =>
                # try to connect to local hub socket using last known address
                f (err, _socket) =>
                    if not err
                        socket = _socket
                        cb()
                    else
                        # failed so get address of a working local hub
                        @project.local_hub_address
                            cb : (err, address) =>
                                @address = address; cb(err)
            (cb) =>
                if not socket?
                    # still don't have our connection -- try again
                    f (err, _socket) =>
                       socket = _socket; cb(err)
                else
                    cb()
        ], (err) =>
            cb(err, socket)
        )

    remove_multi_response_listener: (id) =>
        delete @_multi_response[id]

    call: (opts) =>
        opts = defaults opts,
            mesg           : required
            timeout        : undefined  # NOTE: a nonzero timeout MUST be specified, or we will not even listen for a response from the local hub!  (Ensures leaking listeners won't happen.)
            multi_response : false   # if true, timeout ignored; call @remove_multi_response_listener(mesg.id) to remove
            cb             : undefined

        if not opts.mesg.id?
            if opts.timeout or opts.multi_response   # opts.timeout being undefined or 0 both mean "don't do it"
                opts.mesg.id = uuid.v4()

        @local_hub_socket (err, socket) =>
            if err
                opts.cb?(err)
                return
            socket.write_mesg('json', opts.mesg)
            if opts.multi_response
                @_multi_response[opts.mesg.id] = opts.cb
            else if opts.timeout
                socket.recv_mesg
                    type    : 'json'
                    id      : opts.mesg.id
                    timeout : opts.timeout
                    cb      : (mesg) =>
                        if mesg.event == 'error'
                            opts.cb(mesg.error)
                        else
                            opts.cb(false, mesg)

    ####################################################
    # Session management
    #####################################################

    _open_session_socket: (opts) =>
        opts = defaults opts,
            session_uuid : required
            type         : required  # 'sage', 'console'
            params       : required
            project_id   : required
            timeout      : 10
            cb           : required  # cb(err, socket)
        socket = @_sockets[opts.session_uuid]
        if socket?
            opts.cb(false, socket)
            return

        # We do not currently have an active open socket connection to this session.
        # We make a new socket connection to the local_hub, then
        # send a connect_to_session message, which will either
        # plug this socket into an existing session with the given session_uuid, or
        # create a new session with that uuid and plug this socket into it.
        async.series([
            (cb) =>
                @dbg("getting new socket connection to a local_hub")
                @new_socket (err, _socket) =>
                    if err
                        cb(err)
                    else
                        socket = _socket
                        cb()
            (cb) =>
                mesg = message.connect_to_session
                    id           : uuid.v4()   # message id
                    type         : opts.type
                    project_id   : opts.project_id
                    session_uuid : opts.session_uuid
                    params       : opts.params
                @dbg("Send the message asking to be connected with a #{opts.type} session.")
                socket.write_mesg('json', mesg)
                # Now we wait for a response for opt.timeout seconds
                f = (type, resp) =>
                    clearTimeout(timer)
                    #@dbg("Getting #{opts.type} session -- get back response type=#{type}, resp=#{to_json(resp)}")
                    if resp.event == 'error'
                        cb(resp.error)
                    else
                        # We will now only use this socket for binary communications.
                        misc_node.disable_mesg(socket)
                        socket.history = resp.history

                        # Keep our own copy of the console history (in this global hub), so when clients (re-)connect
                        # we do not have to get the whole history from the local hub.
                        socket.on 'data', (data) =>
                            # DO NOT Record in database that there was activity in this project, since
                            # this is *way* too frequent -- a tmux session make it always on...
                            # database.touch_project(project_id:opts.project_id)
                            socket.history += data
                            n = socket.history.length
                            if n > 200000   # TODO: totally arbitrary; also have to change the same thing in local_hub.coffee
                                # take last 100000 characters
                                socket.history = socket.history.slice(socket.history.length-100000)

                        socket.on 'end', () =>
                            @dbg("console session #{opts.session_uuid} -- socket connection to local_hub closed")
                            delete @_sockets[opts.session_uuid]

                        cb()
                socket.once 'mesg', f
                timed_out = () =>
                    socket.removeListener('mesg', f)
                    socket.end()
                    cb("Timed out after waiting #{opts.timeout} seconds for response from #{opts.type} session server. Please try again later.")
                timer = setTimeout(timed_out, opts.timeout*1000)

        ], (err) =>
            if err
                @dbg("Error getting a socket -- (declaring total disaster) -- #{err}")
                # This @_socket.destroy() below is VERY important, since just deleting the socket might not send this,
                # and the local_hub -- if the connection were still good -- would have two connections
                # with the global hub, thus doubling sync and broadcast messages.  NOT GOOD.
                @_socket?.destroy()
                delete @_status; delete @_socket
            else if socket?
                @_sockets[opts.session_uuid] = socket
                opts.cb(false, socket)
        )

    # Connect the client with a console session, possibly creating a session in the process.
    console_session: (opts) =>
        opts = defaults opts,
            client       : required
            project_id   : required
            params       : {command: 'bash'}
            session_uuid : undefined   # if undefined, a new session is created; if defined, connect to session or get error
            cb           : required    # cb(err, [session_connected message])

        # Connect to the console server
        if not opts.session_uuid?
            # Create a new session
            opts.session_uuid = uuid.v4()

        @_open_session_socket
            session_uuid : opts.session_uuid
            project_id   : opts.project_id
            type         : 'console'
            params       : opts.params
            cb           : (err, console_socket) =>
                if err
                    opts.cb(err)
                    return

                ignore = false
                console_socket.on 'end', () =>
                    ignore = true
                    delete @_sockets[opts.session_uuid]

                # Plug the two consoles together
                #
                # client --> console:
                # Create a binary channel that the client can use to write to the socket.
                # (This uses our system for multiplexing JSON and multiple binary streams
                #  over one single connection.)
                channel = opts.client.register_data_handler (data) ->
                    if not ignore
                        console_socket.write(data)

                mesg = message.session_connected
                    session_uuid : opts.session_uuid
                    data_channel : channel
                    history      : console_socket.history.slice(console_socket.history.length - 100000)   # only last 100,000
                opts.cb(false, mesg)

                # console --> client:
                # When data comes in from the socket, we push it on to the connected
                # client over the channel we just created.
                console_socket.on 'data', (data) ->
                    # Never push more than 20000 characters at once to client, since display is slow, etc.
                    if data.length > 20000
                        data = "[...]" + data.slice(data.length-20000)
                    opts.client.push_data_to_client(channel, data)


    terminate_session: (opts) =>
        opts = defaults opts,
            session_uuid : required
            project_id   : required
            cb           : undefined
        @call
            mesg :
                message.terminate_session
                    session_uuid : opts.session_uuid
                    project_id   : opts.project_id
            timeout : 30
            cb      : opts.cb

    killall: (cb) =>
        @dbg("kill all processes running on a local hub (including the local hub itself)")
        @project.stop(cb:cb)


    # Read a file from a project into memory on the hub.  This is
    # used, e.g., for client-side editing, worksheets, etc.  This does
    # not pull the file from the database; instead, it loads it live
    # from the project_server virtual machine.
    read_file: (opts) => # cb(err, content_of_file)
        {path, project_id, archive, cb} = defaults opts,
            path       : required
            project_id : required
            archive    : 'tar.bz2'   # for directories; if directory, then the output object "data" has data.archive=actual extension used.
            cb         : required

        socket    = undefined
        id        = uuid.v4()
        data      = undefined
        data_uuid = undefined
        result_archive   = undefined

        async.series([
            # Get a socket connection to the local_hub.
            (cb) =>
                @local_hub_socket (err, _socket) =>
                    if err
                        cb(err)
                    else
                        socket = _socket
                        cb()
            (cb) =>
                socket.write_mesg 'json', message.read_file_from_project(id:id, project_id:project_id, path:path, archive:archive)
                socket.recv_mesg type:'json', id:id, timeout:60, cb:(mesg) =>
                    switch mesg.event
                        when 'error'
                            cb(mesg.error)
                        when 'file_read_from_project'
                            data_uuid = mesg.data_uuid
                            result_archive = mesg.archive
                            cb()
                        else
                            cb("Unknown mesg event '#{mesg.event}'")

            (cb) =>
                socket.recv_mesg type: 'blob', id:data_uuid, timeout:60, cb:(_data) =>
                    data = _data
                    data.archive = result_archive
                    cb()

        ], (err) =>
            if err
                cb(err)
            else
                cb(false, data)
        )

    # Write a file
    write_file: (opts) => # cb(err)
        {path, project_id, cb, data} = defaults opts,
            path       : required
            project_id : required
            data       : required   # what to write
            cb         : required

        socket    = undefined
        id        = uuid.v4()
        data_uuid = uuid.v4()

        async.series([
            (cb) =>
                @local_hub_socket (err, _socket) =>
                    if err
                        cb(err)
                    else
                        socket = _socket
                        cb()
            (cb) =>
                mesg = message.write_file_to_project
                    id         : id
                    project_id : project_id
                    path       : path
                    data_uuid  : data_uuid
                socket.write_mesg 'json', mesg
                socket.write_mesg 'blob', {uuid:data_uuid, blob:data}
                cb()

            (cb) =>
                socket.recv_mesg type: 'json', id:id, timeout:10, cb:(mesg) =>
                    switch mesg.event
                        when 'file_written_to_project'
                            cb()
                        when 'error'
                            cb(mesg.error)
                        else
                            cb("Unexpected message type '#{mesg.event}'")
        ], cb)


##############################
# Projects
##############################

# Create a project object that is connected to a local hub (using
# appropriate port and secret token), login, and enhance socket
# with our message protocol.

_project_cache = {}
new_project = (project_id, cb, delay) ->   # cb(err, project)
    #winston.debug("project request (project_id=#{project_id})")
    P = _project_cache[project_id]
    if P?
        if P == "instantiating"
            if not delay?
                delay = 500
            else
                delay = Math.min(30000, 1.2*delay)
            # Try again; We must believe that the code
            # doing the instantiation will terminate and correctly set P.
            setTimeout((() -> new_project(project_id, cb)), delay)
        else
            cb(false, P)
    else
        _project_cache[project_id] = "instantiating"
        start_time = misc.walltime()
        new Project(project_id, (err, P) ->
            winston.debug("new Project(#{project_id}): time= #{misc.walltime() - start_time}")
            if err
                delete _project_cache[project_id]
            else
                _project_cache[project_id] = P
            cb(err, P)
        )



class Project
    constructor: (@project_id, cb) ->
        if not @project_id
            cb("when creating Project, the project_id must be defined")
            return
        @dbg("instantiating Project class")

        new_local_hub
            project_id : @project_id
            cb         : (err, hub) =>
                if err
                    cb(err, @)
                else
                    @local_hub = hub
                    cb(undefined, @)

    dbg: (m) =>
        winston.debug("project(#{@project_id}): #{m}")

    _fixpath: (obj) =>
        if obj? and @local_hub?
            if obj.path?
                if obj.path[0] != '/'
                    obj.path = @local_hub.path+ '/' + obj.path
            else
                obj.path = @local_hub.path

    owner: (cb) =>
        database.get_project_data
            project_id : @project_id
            columns : ['account_id']
            cb      : (err, result) =>
                if err
                    cb(err)
                else
                    cb(err, result[0])

    # get latest info about project from database
    get_info: (cb) =>
        database.get_project_data
            project_id : @project_id
            objectify  : true
            columns    : cass.PROJECT_COLUMNS
            cb         : (err, result) =>
                if err
                    cb(err)
                else
                    cb(err, result)

    call: (opts) =>
        opts = defaults opts,
            mesg    : required
            multi_response : false
            timeout : 15
            cb      : undefined
        @_fixpath(opts.mesg)
        opts.mesg.project_id = @project_id
        @local_hub.call(opts)

    # Set project as deleted (which sets a flag in the database)
    delete_project: (opts) =>
        opts = defaults opts,
            cb : undefined
        database.delete_project
            project_id : @project_id
            cb         : opts.cb
        @local_hub.killall()  # might as well do this to conserve resources

    move_project: (opts) =>
        opts = defaults opts,
            target : undefined   # optional prefered target
            cb : undefined
        @dbg("move_project")
        @local_hub.move_project(opts)

    undelete_project: (opts) =>
        opts = defaults opts,
            cb : undefined
        database.undelete_project
            project_id : @project_id
            cb         : opts.cb

    hide_project_from_user: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        database.hide_project_from_user
            account_id : opts.account_id
            project_id : @project_id
            cb         : opts.cb

    unhide_project_from_user: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        database.unhide_project_from_user
            account_id : opts.account_id
            project_id : @project_id
            cb         : opts.cb

    # Get current session information about this project.
    session_info: (cb) =>
        @call
            message : message.project_session_info(project_id:@project_id)
            cb : cb

    read_file: (opts) =>
        @_fixpath(opts)
        opts.project_id = @project_id
        @local_hub.read_file(opts)

    write_file: (opts) =>
        @_fixpath(opts)
        opts.project_id = @project_id
        @local_hub.write_file(opts)

    console_session: (opts) =>
        @_fixpath(opts.params)
        opts.project_id = @project_id
        @local_hub.console_session(opts)

    terminate_session: (opts) =>
        opts = defaults opts,
            session_uuid : required
            cb           : undefined
        opts.project_id = @project_id
        @local_hub.terminate_session(opts)


########################################
# Permissions related to projects
########################################

user_owns_project = (opts) ->
    opts = defaults opts,
        project_id : required
        account_id : required
        cb         : required         # input: (error, result) where if defined result is true or false
    opts.groups = ['owner']
    database.user_is_in_project_group(opts)

user_is_in_project_group = (opts) ->
    opts = defaults opts,
        project_id     : required
        account_id     : undefined
        account_groups : undefined
        groups         : required
        consistency    : cql.types.consistencies.one
        cb             : required        # cb(err, true or false)
    dbg = (m) -> winston.debug("user_is_in_project_group -- #{m}")
    dbg()
    if not opts.account_id?
        dbg("not logged in, so for now we just say 'no' -- this may change soon.")
        opts.cb(undefined, false) # do not have access
        return

    access = false
    async.series([
        (cb) ->
            dbg("check if admin or in appropriate group -- #{misc.to_json(opts.account_groups)}")
            if opts.account_groups? and 'admin' in opts.account_groups  # check also done below!
                access = true
                cb()
            else
                database.user_is_in_project_group
                    project_id     : opts.project_id
                    account_id     : opts.account_id
                    groups         : opts.groups
                    consistency    : cql.types.consistencies.one
                    cb             : (err, x) ->
                        access = x
                        cb(err)
        (cb) ->
            if access
                cb() # done
            else if opts.account_groups?
                # already decided above
                cb()
            else
                # User does not have access in normal way and account_groups not provided, so
                # we do an extra group check before denying user.
                database.get_account
                    columns    : ['groups']
                    account_id : opts.account_id
                    cb         : (err, r) ->
                        if err
                            cb(err)
                        else
                            access = 'admin' in r['groups']
                            cb()
        ], (err) ->
            dbg("done with tests -- now access=#{access}, err=#{err}")
            opts.cb(err, access)
        )

user_has_write_access_to_project = (opts) ->
    opts.groups = ['owner', 'collaborator']
    user_is_in_project_group(opts)

user_has_read_access_to_project = (opts) ->
    # Read access is granted if user is in any of the groups listed below (owner, collaborator, or *viewer*).
    #dbg = (m) -> winston.debug("user_has_read_access_to_project #{opts.project_id}, #{opts.account_id}; #{m}")
    main_cb = opts.cb
    done = false
    async.parallel([
        (cb)->
            opts.groups = ['owner', 'collaborator', 'viewer']
            opts.cb = (err, in_group) ->
                if err
                    cb(err)
                else
                    if not done and in_group
                        #dbg("yes, since in group")
                        main_cb(undefined, true)
                        done = true
                    cb()
            user_is_in_project_group(opts)
    ], (err) ->
        #dbg("nope, since neither in group nor public")
        if not done
            main_cb(err, false)
    )



########################################
# Passwords
########################################

password_hash_library = require('password-hash')
crypto = require('crypto')

# You can change the parameters at any time and no existing passwords
# or cookies should break.  This will only impact newly created
# passwords and cookies.  Old ones can be read just fine (with the old
# parameters).
HASH_ALGORITHM   = 'sha512'
HASH_ITERATIONS  = 1000
HASH_SALT_LENGTH = 32

# This function is private and burried inside the password-hash
# library.  To avoid having to fork/modify that library, we've just
# copied it here.  We need it for remember_me cookies.
generate_hash = (algorithm, salt, iterations, password) ->
    iterations = iterations || 1
    hash = password
    for i in [1..iterations]
        hash = crypto.createHmac(algorithm, salt).update(hash).digest('hex')
    return algorithm + '$' + salt + '$' + iterations + '$' + hash

exports.password_hash = password_hash = (password) ->
    return password_hash_library.generate(password,
        algorithm  : HASH_ALGORITHM
        saltLength : HASH_SALT_LENGTH
        iterations : HASH_ITERATIONS   # This blocks the server for about 10 milliseconds...
    )

reset_password = (email_address, cb) ->
    read = require('read')
    passwd0 = passwd1 = undefined
    account_id = undefined
    async.series([
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            database.get_account
                email_address : email_address
                columns       : ['account_id']
                cb            : (err, data) ->
                    if err
                        cb(err)
                    else
                        account_id = data.account_id
                        cb()
        (cb) ->
            read {prompt:'Password: ', silent:true}, (err, passwd) ->
                passwd0 = passwd; cb(err)
        (cb) ->
            read {prompt:'Retype password: ', silent:true}, (err, passwd) ->
                if err
                    cb(err)
                else
                    passwd1 = passwd
                    if passwd1 != passwd0
                        cb("Passwords do not match.")
                    else
                        cb()
        (cb) ->
            database.change_password
                account_id    : account_id
                password_hash : password_hash(passwd0)
                cb            : cb

    ], (err) ->
        if err
            winston.debug("Error -- #{err}")
        else
            winston.debug("Password changed for #{email_address}")
        cb?()
    )


# Password checking.  opts.cb(false, true) if the
# password is correct, opts.cb(true) on error (e.g., loading from
# database), and opts.cb(false, false) if password is wrong.  You must
# specify exactly one of password_hash, account_id, or email_address.
# In case you specify password_hash, in addition to calling the
# callback (if specified), this function also returns true if the
# password is correct, and false otherwise; it can do this because
# there is no async IO when the password_hash is specified.
is_password_correct = (opts) ->
    opts = defaults opts,
        password      : required
        cb            : undefined
        password_hash : undefined
        account_id    : undefined
        email_address : undefined
    if opts.password_hash?
        r = password_hash_library.verify(opts.password, opts.password_hash)
        opts.cb?(false, r)
        return r
    else if opts.account_id? or opts.email_address?
        database.get_account
            account_id    : opts.account_id
            email_address : opts.email_address
            columns       : ['password_hash']
            cb            : (error, account) ->
                if error
                    opts.cb?(error)
                else
                    opts.cb?(false, password_hash_library.verify(opts.password, account.password_hash))
    else
        opts.cb?("One of password_hash, account_id, or email_address must be specified.")



########################################
# Account Management
########################################

password_crack_time = (password) -> Math.floor(zxcvbn.zxcvbn(password).crack_time/(3600*24.0)) # time to crack in days

#############################################################################
# User sign in
#
# Anti-DOS cracking throttling policy:
#
#   * POLICY 1: A given email address is allowed at most 5 failed login attempts per minute.
#   * POLICY 2: A given email address is allowed at most 100 failed login attempts per hour.
#   * POLICY 3: A given ip address is allowed at most 100 failed login attempts per minute.
#   * POLICY 4: A given ip address is allowed at most 250 failed login attempts per hour.
#############################################################################
sign_in = (client, mesg) =>
    #winston.debug("sign_in")
    sign_in_error = (error) ->
        client.push_to_client(message.sign_in_failed(id:mesg.id, email_address:mesg.email_address, reason:error))

    if mesg.email_address == ""
        sign_in_error("Empty email address.")
        return

    if mesg.password == ""
        sign_in_error("Empty password.")
        return

    mesg.email_address = misc.lower_email_address(mesg.email_address)

    signed_in_mesg = null
    async.series([
        # POLICY 1: A given email address is allowed at most 5 failed login attempts per minute.
        (cb) ->
            database.count
                table       : "failed_sign_ins_by_email_address"
                where       : {email_address:mesg.email_address, time: {'>=':cass.minutes_ago(1)}}
                consistency : cql.types.consistencies.one
                cb          : (error, count) ->
                    if error
                        sign_in_error(error)
                        cb(true); return
                    if count > 5
                        sign_in_error("A given email address is allowed at most 5 failed login attempts per minute. Please wait.")
                        cb(true); return
                    cb()
        # POLICY 2: A given email address is allowed at most 100 failed login attempts per hour.
        (cb) ->
            database.count
                table       : "failed_sign_ins_by_email_address"
                where       : {email_address:mesg.email_address, time: {'>=':cass.hours_ago(1)}}
                consistency : cql.types.consistencies.one
                cb          : (error, count) ->
                    if error
                        sign_in_error(error)
                        cb(true); return
                    if count > 100
                        sign_in_error("A given email address is allowed at most 100 failed login attempts per hour. Please wait.")
                        cb(true); return
                    cb()

        # POLICY 3: A given ip address is allowed at most 100 failed login attempts per minute.
        (cb) ->
            database.count
                table       : "failed_sign_ins_by_ip_address"
                where       : {ip_address:client.ip_address, time: {'>=':cass.minutes_ago(1)}}
                consistency : cql.types.consistencies.one
                cb          : (error, count) ->
                    if error
                        sign_in_error(error)
                        cb(true); return
                    if count > 100
                        sign_in_error("A given ip address is allowed at most 100 failed login attempts per minute. Please wait.")
                        cb(true); return
                    cb()

        # POLICY 4: A given ip address is allowed at most 250 failed login attempts per hour.
        (cb) ->
            database.count
                table       : "failed_sign_ins_by_ip_address"
                where       : {ip_address:client.ip_address, time: {'>=':cass.hours_ago(1)}}
                consistency : cql.types.consistencies.one
                cb          : (error, count) ->
                    if error
                        sign_in_error(error)
                        cb(true); return
                    if count > 250
                        sign_in_error("A given ip address is allowed at most 250 failed login attempts per hour. Please wait.")
                        cb(true); return
                    cb()

        # POLICY: Don't allow banned users to sign in.
        (cb) ->
            database.is_banned_user
                email_address : mesg.email_address
                cb            : (err, is_banned) ->
                    if err
                        sign_in_error(err)
                        cb(err)
                    else
                        if is_banned
                            sign_in_error("User '#{mesg.email_address}' is banned from SageMathCloud due to violation of the terms of usage.")
                            cb(true)
                        else
                            cb()

        # get account and check credentials
        (cb) ->
            # NOTE: Despite people complaining, we do give away info about whether the e-mail address is for a valid user or not.
            # There is no security in not doing this, since the same information can be determined via the invite collaborators feature.
            database.get_account
                email_address : mesg.email_address
                consistency   : cql.types.consistencies.one
                columns       : ['password_hash', 'account_id']
                cb            : (error, account) ->
                    if error
                        record_sign_in
                            ip_address    : client.ip_address
                            successful    : false
                            email_address : mesg.email_address
                        sign_in_error("There is no account with email address #{mesg.email_address}.")
                        cb(true); return
                    if not is_password_correct(password:mesg.password, password_hash:account.password_hash)
                        record_sign_in
                            ip_address    : client.ip_address
                            successful    : false
                            email_address : mesg.email_address
                            account_id    : account.account_id
                        sign_in_error("Incorrect password.")
                        cb(true); return
                    else

                        signed_in_mesg = message.signed_in
                            id            : mesg.id
                            account_id    : account.account_id
                            email_address : mesg.email_address
                            remember_me   : false
                            hub           : program.host + ':' + program.port

                        client.signed_in(signed_in_mesg)
                        client.push_to_client(signed_in_mesg)
                        cb()

        # remember me
        (cb) ->
            if mesg.remember_me
                client.remember_me
                    account_id    : signed_in_mesg.account_id
                    email_address : signed_in_mesg.email_address
            cb()
    ])


# Record to the database a failed and/or successful login attempt.
record_sign_in = (opts) ->
    opts = defaults opts,
        ip_address    : required
        successful    : required
        email_address : required
        account_id    : undefined
        remember_me   : false
    if not opts.successful
        database.update
            table       : 'failed_sign_ins_by_ip_address'
            set         : {email_address:opts.email_address}
            where       : {time:cass.now(), ip_address:opts.ip_address}
            consistency : cql.types.consistencies.one
        database.update
            table       : 'failed_sign_ins_by_email_address'
            set         : {ip_address:opts.ip_address}
            where       : {time:cass.now(), email_address:opts.email_address}
            consistency : cql.types.consistencies.one
    else
        database.update
            table       : 'successful_sign_ins'
            set         : {ip_address:opts.ip_address, email_address:opts.email_address, remember_me:opts.remember_me}
            where       : {time:cass.now(), account_id:opts.account_id}
            consistency : cql.types.consistencies.one



# We cannot put the zxcvbn password strength checking in
# client.coffee since it is too big (~1MB).  The client
# will async load and use this, of course, but a broken or
# *hacked* client might not properly verify this, so we
# do it in the server too.  NOTE: I tested Dropbox and
# they have a GUI to warn against week passwords, but still
# allow them anyways!
zxcvbn = require('../static/zxcvbn/zxcvbn')  # this require takes about 100ms!


# Current policy is to allow all but trivial passwords for user convenience.
# To change this, just increase this number.
MIN_ALLOWED_PASSWORD_STRENGTH = 1

is_valid_password = (password) ->
    [valid, reason] = client_lib.is_valid_password(password)
    if not valid
        return [valid, reason]
    password_strength = zxcvbn.zxcvbn(password)  # note -- this is synchronous (but very fast, I think)
    #winston.debug("password strength = #{password_strength}")
    if password_strength.score < MIN_ALLOWED_PASSWORD_STRENGTH
        return [false, "Choose a password that isn't very weak."]
    return [true, '']




create_account = (client, mesg) ->
    id = mesg.id
    account_id = null
    dbg = (m) -> winston.debug("create_account (#{mesg.email_address}): #{m}")
    async.series([
        (cb) ->
            dbg("run tests on generic validity of input")
            issues = client_lib.issues_with_create_account(mesg)

            # Do not allow *really* stupid passwords.
            [valid, reason] = is_valid_password(mesg.password)
            if not valid
                issues['password'] = reason

            # TODO -- only uncomment this for easy testing to allow any password choice.
            # the client test suite will then fail, which is good, so we are reminded to comment this out before release!
            # delete issues['password']

            if misc.len(issues) > 0
                client.push_to_client(message.account_creation_failed(id:id, reason:issues))
                cb(true)
            else
                cb()

        # make sure this ip address hasn't requested more than 5000
        # accounts in the last 6 hours (just to avoid really nasty
        # evils, but still allow for demo registration behind a wifi
        # router -- say)
        (cb) ->
            dbg("ip_tracker test")
            ip_tracker = database.key_value_store(name:'create_account_ip_tracker')
            ip_tracker.get(
                key : client.ip_address
                cb  : (error, value) ->
                    if error
                        client.push_to_client(message.account_creation_failed(id:id, reason:{'other':"Unable to create account.  Please try later."}))
                        cb(true)
                    if not value?
                        ip_tracker.set(key: client.ip_address, value:1, ttl:6*3600)
                        cb()
                    else if value < 5000
                        ip_tracker.set(key: client.ip_address, value:value+1, ttl:6*3600)
                        cb()
                    else # bad situation
                        database.log(
                            event : 'create_account'
                            value : {ip_address:client.ip_address, reason:'too many requests'}
                        )
                        client.push_to_client(message.account_creation_failed(id:id, reason:{'other':"Too many account requests from the ip address #{client.ip_address} in the last 6 hours.  Please try again later."}))
                        cb(true)
            )

        (cb) ->
            dbg("query database to determine whether the email address is available")
            database.is_email_address_available(mesg.email_address, (error, available) ->
                if error
                    client.push_to_client(message.account_creation_failed(id:id, reason:{'other':"Unable to create account.  Please try later."}))
                    cb(true)
                else if not available
                    client.push_to_client(message.account_creation_failed(id:id, reason:{email_address:"This e-mail address is already taken."}))
                    cb(true)
                else
                    cb()
            )
        (cb) ->
            dbg("check that account is not banned")
            database.is_banned_user
                email_address : mesg.email_address
                cb            : (err, is_banned) ->
                    if err
                        client.push_to_client(message.account_creation_failed(id:id, reason:{'other':"Unable to create account.  Please try later."}))
                        cb(true)
                    else if is_banned
                        client.push_to_client(message.account_creation_failed(id:id, reason:{email_address:"This e-mail address is banned."}))
                        cb(true)
                    else
                        cb()
        (cb) ->
            dbg("check if a registration token is required")
            database.key_value_store(name:'global_admin_settings').get
                key : 'account_creation_token'
                cb  : (err, token) =>
                    if not token
                        cb()
                    else
                        if token != mesg.token
                            client.push_to_client(message.account_creation_failed(id:id, reason:{token:"Incorrect registration token."}))
                            cb(true)
                        else
                            cb()
        (cb) ->
            dbg("create new account")
            database.create_account
                first_name:    mesg.first_name
                last_name:     mesg.last_name
                email_address: mesg.email_address
                password_hash: password_hash(mesg.password)
                cb: (error, result) ->
                    if error
                        client.push_to_client(message.account_creation_failed(
                                 id:id, reason:{'other':"Unable to create account right now.  Please try later."})
                        )
                        cb(true)
                    else
                        account_id = result
                        database.log
                            event : 'create_account'
                            value : {account_id:account_id, first_name:mesg.first_name, last_name:mesg.last_name, email_address:mesg.email_address}
                        cb()

        (cb) ->
            dbg("check for account creation actions")
            account_creation_actions
                email_address : mesg.email_address
                account_id    : account_id
                cb            : cb

        (cb) ->
            dbg("send message back to user that they are logged in as the new user")
            mesg = message.signed_in
                id            : mesg.id
                account_id    : account_id
                email_address : mesg.email_address
                first_name    : mesg.first_name
                last_name     : mesg.last_name
                remember_me   : false
                hub           : program.host + ':' + program.port
            client.signed_in(mesg)
            client.push_to_client(mesg)
            dbg("set remember_me cookie...")
            # so that proxy server will allow user to connect and
            # download images, etc., the very first time right after they make a new account.
            client.remember_me
                email_address : mesg.email_address
                account_id    : account_id
            cb()
    ])


account_creation_actions = (opts) ->
    opts = defaults opts,
        email_address : required
        account_id    : required
        cb            : required
    winston.debug("account_creation_actions for #{opts.email_address}")
    database.account_creation_actions
        email_address : opts.email_address
        cb            : (err, actions) ->
            if err
                opts.cb(err); return
            f = (action, cb) ->
                winston.debug("account_creation_actions: action = #{misc.to_json(action)}")
                if action.action == 'add_to_project'
                    database.add_user_to_project
                        project_id : action.project_id
                        account_id : opts.account_id
                        group      : action.group
                        cb         : (err) =>
                            if err
                                winston.debug("Error adding user to project: #{err}")
                            cb(err)
                else
                    cb("unknown action -- #{action.action}")
            async.map(actions, f, (err) -> opts.cb(err))

run_all_account_creation_actions = (cb) ->
    dbg = (m) -> winston.debug("all_account_creation: #{m}")

    email_addresses = undefined
    users           = undefined

    async.series([
        (cb) ->
            dbg("connect to database...")
            connect_to_database(cb)
        (cb) ->
            dbg("get all email addresses in the account creation actions table")
            database.select
                table   : 'account_creation_actions'
                columns : ['email_address']
                cb      : (err, results) ->
                    if err
                        cb(err)
                    else
                        dbg("got #{results.length} creation actions from database")
                        email_addresses = (x[0] for x in results)
                        cb()
        (cb) ->
            dbg("for each action, determine if the account has been created (most probably won't be) and get account_id")
            database.select
                table     : 'email_address_to_account_id'
                columns   : ['email_address', 'account_id']
                where     : {email_address:{'in':email_addresses}}
                objectify : true
                cb        : (err, results) ->
                    if err
                        cb(err)
                    else
                        dbg("got #{results.length} of these accounts have already been created")
                        users = results
                        cb()
        (cb) ->
            dbg("for each of the #{users.length} for which the account has been created, do all the actions")
            i = 0
            f = (user, cb) ->
                i += 1
                dbg("considering user #{i} of #{users.length}")
                account_creation_actions
                    email_address : user.email_address
                    account_id    : user.account_id
                    cb            : cb
            # We use mapSeries instead of map, so that the log output is clearer, and since this is fairly small.
            # We could do it in parallel and be way faster, but not necessary.
            async.mapSeries(users, f, (err) -> cb(err))
    ], cb)




change_password = (mesg, client_ip_address, push_to_client) ->
    account = null
    mesg.email_address = misc.lower_email_address(mesg.email_address)
    async.series([
        # make sure there hasn't been a password change attempt for this
        # email address in the last 5 seconds
        (cb) ->
            tracker = database.key_value_store(name:'change_password_tracker')
            tracker.get(
                key : mesg.email_address
                cb : (error, value) ->
                    if error
                        cb()  # DB error, so don't bother with the tracker
                        return
                    if value?  # is defined, so problem -- it's over
                        push_to_client(message.changed_password(id:mesg.id, error:{'too_frequent':'Please wait at least 5 seconds before trying to change your password again.'}))
                        database.log(
                            event : 'change_password'
                            value : {email_address:mesg.email_address, client_ip_address:client_ip_address, message:"attack?"}
                        )
                        cb(true)
                        return
                    else
                        # record change in tracker with ttl (don't care about confirming that this succeeded)
                        tracker.set(
                            key   : mesg.email_address
                            value : client_ip_address
                            ttl   : 5
                        )
                        cb()
            )

        # get account and validate the password
        (cb) ->
            database.get_account
              email_address : mesg.email_address
              columns       : ['password_hash', 'account_id']
              cb : (error, result) ->
                if error
                    push_to_client(message.changed_password(id:mesg.id, error:{other:error}))
                    cb(true)
                    return
                account = result
                if not is_password_correct(password:mesg.old_password, password_hash:account.password_hash)
                    push_to_client(message.changed_password(id:mesg.id, error:{old_password:"Invalid old password."}))
                    database.log(
                        event : 'change_password'
                        value : {email_address:mesg.email_address, client_ip_address:client_ip_address, message:"Invalid old password."}
                    )
                    cb(true)
                    return
                cb()

        # check that new password is valid
        (cb) ->
            [valid, reason] = is_valid_password(mesg.new_password)
            if not valid
                push_to_client(message.changed_password(id:mesg.id, error:{new_password:reason}))
                cb(true)
            else
                cb()

        # record current password hash (just in case?) and that we are changing password and set new password
        (cb) ->

            database.log(
                event : "change_password"
                value :
                    account_id : account.account_id
                    client_ip_address : client_ip_address
                    previous_password_hash : account.password_hash
            )

            database.change_password(
                account_id:    account.account_id
                password_hash: password_hash(mesg.new_password),
                cb : (error, result) ->
                    if error
                        push_to_client(message.changed_password(id:mesg.id, error:{misc:error}))
                    else
                        push_to_client(message.changed_password(id:mesg.id, error:false)) # finally, success!
                    cb()
            )
    ])


change_email_address = (mesg, client_ip_address, push_to_client) ->

    dbg = (m) -> winston.debug("change_email_address(mesg.account_id, mesg.old_email_address, mesg.new_email_address): #{m}")
    dbg()

    mesg.old_email_address = misc.lower_email_address(mesg.old_email_address)
    mesg.new_email_address = misc.lower_email_address(mesg.new_email_address)

    if mesg.old_email_address == mesg.new_email_address  # easy case
        dbg("easy case -- no change")
        push_to_client(message.changed_email_address(id:mesg.id))
        return

    if not client_lib.is_valid_email_address(mesg.new_email_address)
        dbg("invalid email address")
        push_to_client(message.changed_email_address(id:mesg.id, error:'email_invalid'))
        return

    async.series([
        # Make sure there hasn't been an email change attempt for this
        # email address in the last 5 seconds:
        (cb) ->
            dbg("limit email address change attempts")
            WAIT = 5
            tracker = database.key_value_store(name:'change_email_address_tracker')
            tracker.get(
                key : mesg.old_email_address
                cb : (error, value) ->
                    if error
                        push_to_client(message.changed_email_address(id:mesg.id, error:error))
                        dbg("error: #{error}")
                        cb(true)
                        return
                    if value?  # is defined, so problem -- it's over
                        dbg("limited!")
                        push_to_client(message.changed_email_address(id:mesg.id, error:'too_frequent', ttl:WAIT))
                        database.log(
                            event : 'change_email_address'
                            value : {email_address:mesg.old_email_address, client_ip_address:client_ip_address, message:"attack?"}
                        )
                        cb(true)
                        return
                    else
                        # record change in tracker with ttl (don't care about confirming that this succeeded)
                        tracker.set(
                            key   : mesg.old_email_address
                            value : client_ip_address
                            ttl   : WAIT    # seconds
                        )
                        cb()
            )

        (cb) ->
            dbg("no limit issues, so validate the password")
            is_password_correct
                account_id    : mesg.account_id
                password      : mesg.password
                cb : (error, is_correct) ->
                    if error
                        push_to_client(message.changed_email_address(id:mesg.id, error:"Server error checking password."))
                        cb(true)
                        return
                    else if not is_correct
                        push_to_client(message.changed_email_address(id:mesg.id, error:"invalid_password"))
                        cb(true)
                        return
                    cb()

        # Record current email address (just in case?) and that we are
        # changing email address to the new one.  This will make it
        # easy to implement a "change your email address back" feature
        # if I need to at some point.
        (cb) ->
            dbg("log change to db")

            database.log(event : 'change_email_address', value : {client_ip_address : client_ip_address, old_email_address : mesg.old_email_address, new_email_address : mesg.new_email_address})

            #################################################
            # TODO: At this point, we should send an email to
            # old_email_address with a hash-code that can be used
            # to undo the change to the email address.
            #################################################

            dbg("actually make change in db")
            database.change_email_address
                account_id    : mesg.account_id
                email_address : mesg.new_email_address
                cb : (error, success) ->
                    dbg("db change; got #{error}, #{success}")
                    if error
                        push_to_client(message.changed_email_address(id:mesg.id, error:error))
                    else
                        push_to_client(message.changed_email_address(id:mesg.id)) # finally, success!
                    cb()

        (cb) ->
            # If they just changed email to an address that has some actions, carry those out...
            # TODO: move to hook this only after validation of the email address.
            account_creation_actions
                email_address : mesg.new_email_address
                account_id    : mesg.account_id
                cb            : cb
    ])


#############################################################################
# Send an email message to the given email address with a code that
# can be used to reset the password for a certain account.
#
# Anti-use-salvus-to-spam/DOS throttling policies:
#   * a given email address can be sent at most 30 password resets per hour
#   * a given ip address can send at most 100 password reset request per minute
#   * a given ip can send at most 250 per hour
#############################################################################
forgot_password = (mesg, client_ip_address, push_to_client) ->
    if mesg.event != 'forgot_password'
        push_to_client(message.error(id:mesg.id, error:"Incorrect message event type: #{mesg.event}"))
        return

    # This is an easy check to save work and also avoid empty email_address, which causes CQL trouble.
    if not client_lib.is_valid_email_address(mesg.email_address)
        push_to_client(message.error(id:mesg.id, error:"Invalid email address."))
        return

    mesg.email_address = misc.lower_email_address(mesg.email_address)

    id = null
    async.series([
        # record this password reset attempt in our database
        (cb) ->
            database.update
                table   : 'password_reset_attempts_by_ip_address'
                set     : {email_address:mesg.email_address}
                where   : {ip_address:client_ip_address, time:cass.now()}
                cb      : (error, result) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    else
                        cb()
        (cb) ->
            database.update
                table   : 'password_reset_attempts_by_email_address'
                set     : {ip_address:client_ip_address}
                where   : {email_address:mesg.email_address, time:cass.now()}
                cb      : (error, result) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    else
                        cb()

        # POLICY 1: We limit the number of password resets that an email address can receive
        (cb) ->
            database.count
                table   : "password_reset_attempts_by_email_address"
                where   : {email_address:mesg.email_address, time:{'>=':cass.hours_ago(1)}}
                cb      : (error, count) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    if count >= 31
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Will not send more than 30 password resets to #{mesg.email_address} per hour."))
                        cb(true)
                        return
                    cb()

        # POLICY 2: a given ip address can send at most 100 password reset request per minute
        (cb) ->
            database.count
                table   : "password_reset_attempts_by_ip_address"
                where   : {ip_address:client_ip_address,  time:{'>=':cass.hours_ago(1)}}
                cb      : (error, count) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    if count >= 101
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Please wait a minute before sending another password reset requests."))
                        cb(true); return
                    cb()


        # POLICY 3: a given ip can send at most 1000 per hour
        (cb) ->
            database.count
                table : "password_reset_attempts_by_ip_address"
                where : {ip_address:client_ip_address, time:{'>=':cass.hours_ago(1)}}
                cb    : (error, count) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    if count >= 1001
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"There have been too many password resets.  Wait an hour before sending any more password reset requests."))
                        cb(true); return
                    cb()

        (cb) ->
            database.get_account
                email_address : mesg.email_address
                columns       : ['account_id']   # have to get something
                cb            : (error, account) ->
                    if error # no such account
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"No account with e-mail address #{mesg.email_address}."))
                        cb(true); return
                    else
                        cb()

        # We now know that there is an account with this email address.
        # put entry in the password_reset uuid:value table with ttl of 1 hour, and send an email
        (cb) ->
            id = database.uuid_value_store(name:"password_reset").set(
                value : mesg.email_address
                ttl   : 60*60,
                cb    : (error, results) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Internal error generating password reset for #{mesg.email_address}."))
                        cb(true); return
                    else
                        cb()
            )

        # send an email to mesg.email_address that has a link to
        (cb) ->
            body = """
                Somebody just requested to change the password on your SageMathCloud account.
                If you requested this password change, please change your password by
                following the link below within 15 minutes:

                     https://cloud.sagemath.com#forgot-#{id}

                If you don't want to change your password, ignore this message.

                In case of problems, email wstein@uw.edu.
                """

            send_email
                subject : 'SageMathCloud password reset confirmation'
                body    : body
                to      : mesg.email_address
                cb      : (error) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Internal error sending password reset email to #{mesg.email_address} -- #{error}."))
                        cb(true)
                    else
                        push_to_client(message.forgot_password_response(id:mesg.id))
                        cb()
    ])


reset_forgot_password = (mesg, client_ip_address, push_to_client) ->
    if mesg.event != 'reset_forgot_password'
        push_to_client(message.error(id:mesg.id, error:"incorrect message event type: #{mesg.event}"))
        return

    email_address = account_id = db = null

    async.series([
        # check that request is valid
        (cb) ->
            db = database.uuid_value_store(name:"password_reset")
            db.get
                uuid : mesg.reset_code
                cb   : (error, value) ->
                    if error
                        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:error))
                        cb(true); return
                    if not value?
                        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:"This password reset request is no longer valid."))
                        cb(true); return
                    email_address = value
                    cb()

        # Verify password is valid and compute its hash.
        (cb) ->
            [valid, reason] = is_valid_password(mesg.new_password)
            if not valid
                push_to_client(message.reset_forgot_password_response(id:mesg.id, error:reason))
                cb(true)
            else
                cb()

        # Get the account_id.
        (cb) ->
            database.get_account
                email_address : email_address
                columns       : ['account_id']
                cb            : (error, account) ->
                    if error
                        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:error))
                        cb(true)
                    else
                        account_id = account.account_id
                        cb()

        # Make the change
        (cb) ->
            database.change_password
                account_id: account_id
                password_hash : password_hash(mesg.new_password)
                cb : (error, account) ->
                    if error
                        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:error))
                        cb(true)
                    else
                        push_to_client(message.reset_forgot_password_response(id:mesg.id)) # success
                        db.delete(uuid: mesg.reset_code)  # only allow successful use of this reset token once
                        cb()
    ])

# mesg is an account_settings message.  We save everything in the
# message to the database.  The restricted settings are completely
# ignored if mesg.password is not set and correct.
save_account_settings = (mesg, push_to_client) ->
    if mesg.event != 'account_settings'
        push_to_client(message.error(id:mesg.id, error:"Wrong message type: #{mesg.event}"))
        return
    settings = {}
    for key of message.unrestricted_account_settings
        settings[key] = mesg[key]
    database.update_account_settings
        account_id : mesg.account_id
        settings   : settings
        cb         : (error, results) ->
            if error
                push_to_client(message.error(id:mesg.id, error:error))
            else
                push_to_client(message.account_settings_saved(id:mesg.id))


########################################
# User Feedback
########################################
report_feedback = (mesg, push_to_client, account_id) ->
    data = {}  # TODO -- put interesting info here
    database.report_feedback
        account_id  : account_id
        category    : mesg.category
        description : mesg.description
        data        : data
        nps         : mesg.nps
        cb          : (err, results) -> push_to_client(message.feedback_reported(id:mesg.id, error:err))

get_all_feedback_from_user = (mesg, push_to_client, account_id) ->
    if account_id == null
        push_to_client(message.all_feedback_from_user(id:mesg.id, error:true, data:to_json("User not signed in.")))
        return
    database.get_all_feedback_from_user
        account_id  : account_id
        cb          : (err, results) -> push_to_client(message.all_feedback_from_user(id:mesg.id, data:to_json(results), error:err))



#########################################
# Sending emails
#########################################

nodemailer   = require("nodemailer")
email_server = undefined

# here's how I test this function:
#    require('hub').send_email(subject:'TEST MESSAGE', body:'body', to:'wstein@uw.edu', cb:console.log)
exports.send_email = send_email = (opts={}) ->
    opts = defaults opts,
        subject : required
        body    : required
        from    : 'SageMathCloud <wstein@uw.edu>'          # obviously change this at some point.  But it is the best "reply to right now"
        to      : required
        cc      : ''
        cb      : undefined

    dbg = (m) -> winston.debug("send_email(to:#{opts.to}) -- #{m}")
    dbg(opts.body)

    disabled = false
    async.series([
        (cb) ->
            if email_server?
                cb(); return
            dbg("starting sendgrid client...")
            filename = 'data/secrets/sendgrid_email_password'
            fs.readFile filename, 'utf8', (error, password) ->
                if error
                    err = "unable to read the file '#{filename}', which is needed to send emails."
                    dbg(err)
                    cb(err)
                else
                    pass = password.toString().trim()
                    if pass.length == 0
                        winston.debug("email_server: explicitly disabled -- so pretend to always succeed for testing purposes")
                        disabled = true
                        email_server = {disabled:true}
                        cb()
                        return
                    email_server = nodemailer.createTransport "SMTP",
                        service : "SendGrid"
                        port    : 2525
                        auth    :
                            user: "wstein",
                            pass: pass
                    dbg("started email server")
                    cb()
        (cb) ->
            if disabled or email_server?.disabled
                cb(undefined, 'email disabled -- no actual message sent')
                return
            winston.debug("sendMail to #{opts.to} starting...")
            email_server.sendMail
                from    : opts.from
                to      : opts.to
                text    : opts.body
                subject : opts.subject
                cc      : opts.cc,
                cb      : (err) =>
                    winston.debug("sendMail to #{opts.to} done... (err=#{misc.to_json(err)})")
                    if err
                        dbg("sendMail -- error = #{misc.to_json(err)}")
                    cb(err)

    ], (err, message) ->
        if err
            # so next time it will try fresh to connect to email server, rather than being wrecked forever.
            email_server = undefined
            err = "error sending email -- #{misc.to_json(err)}"
            dbg(err)
        else
            dbg("successfully sent email")
        opts.cb?(err, message)
    )


########################################
# Blobs
########################################

MAX_BLOB_SIZE = 12000000
MAX_BLOB_SIZE_HUMAN = "12MB"

blobs = {}

# save a blob in the blobstore database with given misc_node.uuidsha1 hash.
save_blob = (opts) ->
    opts = defaults opts,
        uuid  : undefined  # uuid=sha1-based from value; actually *required*, but instead of a traceback, get opts.cb(err)
        value : undefined  # actually *required*, but instead of a traceback, get opts.cb(err)
        ttl   : undefined  # object in blobstore will have *at least* this ttl in seconds; if there is already something, in blobstore with longer ttl, we leave it; undefined = infinite ttl
        check : true       # if true, return an error (via cb) if misc_node.uuidsha1(opts.value) != opts.uuid.  This is a check against bad user-supplied data.
        cb    : required   # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl

    if false  # enable this for testing -- HOWEVER, don't do this in production with
              # more than one hub, or things will break in subtle ways (obviously).
        blobs[opts.uuid] = opts.value
        opts.cb()
        winston.debug("save_blob #{opts.uuid}")
        return

    err = undefined

    if not opts.value?
        err = "save_blob: UG -- error in call to save_blob (uuid=#{opts.uuid}); received a save_blob request with undefined value"

    else if not opts.uuid?
        err = "save_blob: BUG -- error in call to save_blob; received a save_blob request without corresponding uuid"

    else if opts.value.length > MAX_BLOB_SIZE
        err = "save_blob: blobs are limited to #{MAX_BLOB_SIZE_HUMAN} and you just tried to save one of size #{opts.value.length/1000000}MB"

    else if opts.check and opts.uuid != misc_node.uuidsha1(opts.value)
        err = "save_blob: uuid=#{opts.uuid} must be derived from the Sha1 hash of value, but it is not (possible malicious attack)"

    if err?
        winston.debug(err)
        opts.cb(err)
        return

    # Store the blob in the database, if it isn't there already.
    db = database.uuid_blob_store(name:"blobs")
    db.get_ttl
        uuid : opts.uuid
        cb   : (err, ttl) ->
            if err
                opts.cb(err); return
            if ttl? and (ttl == 0 or ttl >= opts.ttl)
                # nothing to store -- done.
                opts.cb(false, ttl)
            else
                # store it in the database
                if not opts.ttl?
                    opts.ttl = 0
                db.set
                    uuid  : opts.uuid
                    value : opts.value
                    ttl   : opts.ttl
                    cb    : (err) -> opts.cb(err, ttl)

get_blob = (opts) ->
    opts = defaults opts,
        uuid        : required
        cb          : required
        max_retries : 5
            # if blob isn't in the database yet, we retry up to max_retries many times, after waiting 300ms for it.
            # We do this since Cassandra is only eventually consistent, and clients can be querying other nodes.
    if false
        opts.cb(false, blobs[opts.uuid])
        winston.debug("get_blob #{opts.uuid}")
        return
    database.uuid_blob_store(name:"blobs").get
        uuid : opts.uuid
        cb   : (err, result) ->
            if err
                opts.cb(err)
            else if not result? and opts.max_retries >= 1
                f = () ->
                    get_blob(uuid:opts.uuid, cb:opts.cb, max_retries:opts.max_retries-1)
                setTimeout(f, 300)
            else
                opts.cb(false, result)


# For each element of the array blob_ids, remove its ttl.
_make_blobs_permanent_cache = {}
make_blobs_permanent = (opts) ->
    opts = defaults opts,
        blob_ids   : required
        cb         : required
    uuids = (id for id in opts.blob_ids when not _make_blobs_permanent_cache[id]?)
    database.uuid_blob_store(name:"blobs").set_ttls
        uuids : uuids
        ttl   : 0
        cb    : (err) ->
            if not err
                for id in uuids
                    _make_blobs_permanent_cache[id] = true
            opts.cb(err)

########################################
# Compute Sessions (of various types)
########################################
compute_sessions = {}



########################################
# Persistent Sage Sessions
########################################
persistent_sage_sessions = {}

# The walltime and cputime are severly limited for not-logged in users, for now:
SESSION_LIMITS_NOT_LOGGED_IN = {cputime:3*60, walltime:5*60, vmem:2000, numfiles:1000, quota:128}

# The walltime and cputime are not limited for logged in users:
SESSION_LIMITS = {cputime:0, walltime:0, vmem:2000, numfiles:1000, quota:128}



#####################################################################
# SageSession -- a specific Sage process running inside a deployed
# project.  This typically corresponds to a worksheet.
#####################################################################

class SageSession
    constructor : (opts) ->
        opts = defaults opts,
            client       : required
            project_id   : required
            session_uuid : undefined
            cb           : undefined   # cb(err)

        @project_id = opts.project_id

        @clients    = [opts.client]   # start with our 1 *local* client (connected to this particular hub)

        if not opts.session_uuid?
            opts.session_uuid = uuid.v4()
        @session_uuid = opts.session_uuid

        @restart(opts.client, opts.cb)

    # handle incoming messages from sage server
    _recv: (type, mesg) =>
        switch type
            when 'json'
                winston.debug("sage_server --> hub: (session=#{@session_uuid}) #{to_safe_str(mesg)}")
                for client in @clients
                    switch mesg.event
                        when "output", "terminate_session", "execute_javascript"
                            mesg.session_uuid = @session_uuid  # tag with session uuid
                            client.push_to_client(mesg)
                        when "session_description"
                            @pid = mesg.pid
                            @limits = mesg.limits
                            client.push_to_client(message.session_started(id:@_mesg_id, session_uuid:@session_uuid, limits:mesg.limits))
                        else
                            client.push_to_client(mesg)
            when 'blob'
                save_blob
                    uuid  : mesg.uuid
                    value : mesg.blob
                    ttl   : BLOB_TTL  # deleted after this long
                    check : true      # guard against malicious users trying to fake a sha1 hash to goatse somebody else's worksheet
                    cb    : (err, ttl) ->
                        if err
                            winston.debug("Error saving blob for Sage Session -- #{err}")
            else
                raise("unknown message type '#{type}'")


    # add a new client to listen/use this session
    add_client : (client, cb) =>
        for c in @clients
            if c == client
                cb?()  # already known
                return
        mesg = {project_id : @project.project_id, id : uuid.v4() }  # id not used
        client.get_project mesg, 'write', (err, proj) =>
            if err
                cb?(err)
            else
                @clients.push(client)
                cb?()

    is_client: (client) =>
        return client in @clients

    # remove a client from listening/using this session
    remove_client: (client) =>
        @clients = (c for c in @clients if c != client)

    send_signal: (signal) =>
        if @pid? and @conn?
            sage.send_signal
                host         : @host
                port         : @port
                secret_token : @secret_token
                pid          : @pid
                signal       : signal

    kill: () =>
        @send_signal(9)
        @conn?.close()
        @conn = undefined

    send_json: (client, mesg) ->
        winston.debug("hub --> sage_server: #{misc.trunc(to_safe_str(mesg),300)}")
        async.series([
            (cb) =>
                if @conn?
                    cb()
                else
                    @restart(client, cb)
            (cb) =>
                @conn.send_json(mesg)
        ])

    send_blob: (client, uuid, blob) ->
        async.series([
            (cb) =>
                if @conn?
                    cb()
                else
                    @restart(client, cb)
            (cb) =>
                @conn.send_blob(uuid, blob)
        ])

    restart: (client, cb) =>
        winston.debug("Restarting a Sage session...")
        @kill()

        async.series([
            (cb) =>
                winston.debug("Getting project with id #{@project_id}")
                client.get_project {project_id:@project_id}, 'write', (err, project) =>
                    if err
                        cb(err)
                    else
                        @project = project
                        cb()
            (cb) =>
                winston.debug("Ensure that project is opened on a host.")
                @project.local_hub.open (err, port, secret_token) =>
                    if err
                        cb(err)
                    else
                        @port = port
                        @secret_token = secret_token
                        cb()

            (cb) =>
                winston.debug("Make connection to sage server.")
                @conn = new sage.Connection
                    port         : @port
                    secret_token : @secret_token
                    recv         : @_recv
                    cb           : cb

            (cb) =>
                mesg = message.connect_to_session
                    type         : 'sage'
                    project_id   : @project_id
                    session_uuid : @session_uuid
                @conn.send_json(mesg)
                cb()

            (cb) =>
                winston.debug("Registering the session.")
                persistent_sage_sessions[@session_uuid] = @
                compute_sessions[@session_uuid] = @
                if @session_uuid not in client.compute_session_uuids
                    client.compute_session_uuids.push(@session_uuid)
                cb()

        ], (err) => cb?(err))


##########################################
# Stateless Sage Sessions
##########################################
stateless_exec_cache = null

init_stateless_exec = () ->
    stateless_exec_cache = database.key_value_store(name:'stateless_exec')

stateless_sage_exec = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec #{to_safe_str(input_mesg)}")
    exec_nocache = () ->
        output_messages = []
        stateless_sage_exec_nocache(input_mesg,
            (mesg) ->
                if mesg.event == "output"
                    output_messages.push(mesg)
                output_message_callback(mesg)
                if mesg.done and input_mesg.allow_cache
                    winston.info("caching result")
                    stateless_exec_cache.set(key:[input_mesg.code, input_mesg.preparse], value:output_messages)
        )
    if not input_mesg.allow_cache
        exec_nocache()
        return
    stateless_exec_cache.get(key:[input_mesg.code, input_mesg.preparse], cb:(err, output) ->
        if output?
            winston.info("(hub) -- using cache")
            for mesg in output
                mesg.id = input_mesg.id
                output_message_callback(mesg)
        else
            exec_nocache()
    )

stateless_sage_exec_fake = (input_mesg, output_message_callback) ->
    # test mode to eliminate all of the calls to sage_server time/overhead
    output_message_callback({"stdout":eval(input_mesg.code),"done":true,"event":"output","id":input_mesg.id})

stateless_exec_using_server = (input_mesg, output_message_callback, host, port) ->
    sage_conn = new sage.Connection(
        secret_token: secret_token
        port:port
        recv:(type, mesg) ->
            winston.info("(hub) sage_conn -- received message #{to_safe_str(mesg)}")
            if type == 'json'
                output_message_callback(mesg)
            # TODO: maybe should handle 'blob' type?
        cb: ->
            winston.info("(hub) sage_conn -- sage: connected.")
            sage_conn.send_json(message.start_session(limits:{walltime:5, cputime:5, numfiles:1000, vmem:2048}))
            winston.info("(hub) sage_conn -- send: #{to_safe_str(input_mesg)}")
            sage_conn.send_json(input_mesg)
            sage_conn.send_json(message.terminate_session())
    )

# TODO: delete -- no longer makes sense
stateless_sage_exec_nocache = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec_nocache #{to_safe_str(input_mesg)}")
    database.random_compute_server(type:'sage', cb:(err, sage_server) ->
        if sage_server?
            stateless_exec_using_server(input_mesg, output_message_callback, sage_server.host, sage_server.port)
        else
            winston.error("(hub) no sage servers!")
            output_message_callback(message.terminate_session(reason:'no Sage servers'))
    )


#############################################
# Clean up on shutdown
#############################################

clean_up_on_shutdown = () ->
    # No point in keeping the port forwards around, since they are only *known* in RAM locally.
    winston.debug("Unforwarding ports...")
    misc_node.unforward_all_ports()


#############################################
# Connect to database
#############################################
#
# load database password from 'data/secrets/cassandra/hub'
#

connect_to_database = (cb) ->
    if database? # already did this
        cb(); return
    fs.readFile "#{SALVUS_HOME}/data/secrets/cassandra/hub", (err, password) ->
        if err
            cb(err)
        else
            new cass.Salvus
                hosts       : program.database_nodes.split(',')
                keyspace    : program.keyspace
                username    : 'hub'
                password    : password.toString().trim()
                consistency : cql.types.consistencies.localQuorum
                cb          : (err, _db) ->
                    if err
                        winston.debug("Error connecting to database")
                        cb(err)
                    else
                        winston.debug("Successfully connected to database.")
                        database = _db
                        cb()

bup_server = undefined
init_bup_server = (cb) ->
    winston.debug("creating bup server global client")
    require('bup_server').global_client
        database : database
        cb       : (err, x) ->
            if not err
                winston.debug("bup server created")
            else
                winston.debug("ERROR creating bup server -- #{err}")
            bup_server = x
            cb?(err)





#############################################
# Start everything running
#############################################
exports.start_server = start_server = () ->
    # the order of init below is important
    winston.info("Using keyspace #{program.keyspace}")
    hosts = program.database_nodes.split(',')

    # Once we connect to the database, start serving.
    misc.retry_until_success
        f           : connect_to_database
        start_delay : 1000
        max_delay   : 10000
        cb          : () =>
            winston.debug("connected to database.")
            init_bup_server()
            init_http_server()
            init_http_proxy_server()

            # start updating stats cache every so often -- note: this is cached in the database, so it isn't
            # too big a problem if we call it too frequently...
            update_server_stats(); setInterval(update_server_stats, 120*1000)
            register_hub(); setInterval(register_hub, REGISTER_INTERVAL_S*1000)

            init_primus_server()
            init_stateless_exec()
            http_server.listen(program.port, program.host)

            winston.info("Started hub. HTTP port #{program.port}; keyspace #{program.keyspace}")

###
# Command line admin stuff -- should maybe be moved to another program?
###
add_user_to_project = (email_address, project_id, cb) ->
     account_id = undefined
     async.series([
         # ensure database object is initialized
         (cb) ->
             connect_to_database(cb)
         # find account id corresponding to email address
         (cb) ->
             database.account_exists
                 email_address : email_address
                 cb            : (err, _account_id) ->
                     account_id = _account_id
                     cb(err)
         # add user to that project as a collaborator
         (cb) ->
             database.add_user_to_project
                 project_id : project_id
                 account_id : account_id
                 group      : 'collaborator'
                 cb         : cb
     ], cb)


#############################################
# Process command line arguments
#############################################
program.usage('[start/stop/restart/status/nodaemon] [options]')
    .option('--port <n>', 'port to listen on (default: 5000)', parseInt, 5000)
    .option('--proxy_port <n>', 'port that the proxy server listens on (default: 5001)', parseInt, 5001)
    .option('--log_level [level]', "log level (default: debug) useful options include INFO, WARNING and DEBUG", String, "debug")
    .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', String, "data/pids/hub.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', String, "data/logs/hub.log")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "test")', String, 'test')
    .option('--passwd [email_address]', 'Reset password of given user', String, '')
    .option('--add_user_to_project [email_address,project_id]', 'Add user with given email address to project with given ID', String, '')
    .option('--base_url [string]', 'Base url, so https://sitenamebase_url/', String, '')  # '' or string that starts with /
    .option('--local', 'If option is specified, then *all* projects run locally as the same user as the server and store state in .sagemathcloud-local instead of .sagemathcloud; also do not kill all processes on project restart -- for development use (default: false, since not given)', Boolean, false)
    .option('--account_creation_actions', 'Run all known account creation actions for accounts that have been created (used mainly to clean up after a particular bug)')
    .parse(process.argv)

    # NOTE: the --local option above may be what is used later for single user installs, i.e., the version included with Sage.

console.log(program._name)
if program._name.slice(0,3) == 'hub'
    # run as a server/daemon (otherwise, is being imported as a library)

    #if program.rawArgs[1] in ['start', 'restart']
    process.addListener "uncaughtException", (err) ->
        winston.debug("BUG ****************************************************************************")
        winston.debug("Uncaught exception: " + err)
        winston.debug(err.stack)
        winston.debug("BUG ****************************************************************************")

    if program.passwd
        console.log("Resetting password")
        reset_password(program.passwd, (err) -> process.exit())
    if program.account_creation_actions
        console.log("Account creation actions")
        run_all_account_creation_actions (err) ->
            console.log("DONE --", err)
            (err) -> process.exit()
    else if program.add_user_to_project
        console.log("Adding user to project")
        v = program.add_user_to_project.split(',')
        add_user_to_project v[0], v[1], (err) ->
            if err
                 console.log("Failed to add user: #{err}")
            else
                 console.log("User added to project.")
            process.exit()
    else
        console.log("Running web server; pidfile=#{program.pidfile}")
        daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)
