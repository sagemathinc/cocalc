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
# If a client sends a burst of messages, we discard all but the most recent this many of them:
MESG_QUEUE_MAX_COUNT    = 25
# Any messages larger than this is not allowed (it could take a long time to handle, etc.).
MESG_QUEUE_MAX_SIZE_MB  = 5

# Blobs (e.g., files dynamically appearing as output in worksheets) are kept for this
# many seconds before being discarded.  If the worksheet is saved (e.g., by a user's autosave),
# then the BLOB is saved indefinitely.
BLOB_TTL = 60*60*24    # 24 hours

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
sockjs  = require("sockjs")             # websockets (+legacy support) -- https://github.com/sockjs/sockjs-node
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

        if pathname != '/alive'
            winston.info ("#{req.connection.remoteAddress} accessed #{req.url}")

        segments = pathname.split('/')
        switch segments[1]
            when "cookies"
                cookies = new Cookies(req, res)
                conn = clients[query.id]
                if conn?
                    if query.get
                        conn.emit("get_cookie-#{query.get}", cookies.get(query.get))
                    if query.set
                        x = conn.cookies[query.set]
                        delete conn.cookies[query.set]
                        cookies.set(query.set, x.value, x.options)
                        conn.emit("set_cookie-#{query.set}")
                res.end('')
            when "alive"
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
                        account_id = undefined
                        project_id = undefined
                        dest_dir   = undefined
                        data       = undefined
                        async.series([
                            # authenticate user
                            (cb) ->
                                cookies = new Cookies(req, res)
                                value = cookies.get('remember_me')
                                if not value?
                                    res.end('ERROR -- you must enable remember_me cookies')
                                    return
                                x    = value.split('$')
                                hash = generate_hash(x[0], x[1], x[2], x[3])
                                database.key_value_store(name: 'remember_me').get
                                    key : hash
                                    cb  : (err, signed_in_mesg) =>
                                        if err
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
                                    project_id : project_id
                                    account_id : account_id
                                    cb         : (err, result) =>
                                        if err
                                            cb(err)
                                        else if not result
                                            cb("User does not have write access to project.")
                                        else
                                            winston.debug("user has write access to project.")
                                            cb()
                            # TODO: we *should* stream the file, not write to disk/read/etc.... but that is more work and I don't have time now.
                            # get the file itself
                            (cb) ->
                                winston.debug(misc.to_json(files))
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

    _remember_me_check_for_write_access_to_project = (opts) ->
        opts = defaults opts,
            project_id  : required
            remember_me : required
            cb          : required    # cb(err, has_access)
        account_id = undefined
        has_write_access = false
        async.series([
            (cb) ->
                x    = opts.remember_me.split('$')
                database.key_value_store(name: 'remember_me').get
                    key : generate_hash(x[0], x[1], x[2], x[3])
                    cb  : (err, signed_in_mesg) =>
                        if err
                            cb('unable to get remember_me cookie from db -- cookie invalid'); return
                        account_id = signed_in_mesg.account_id
                        cb()
            (cb) ->
                user_has_write_access_to_project
                    project_id : opts.project_id
                    account_id : account_id
                    cb         : (err, result) =>
                        if err
                            cb(err)
                        else if not result
                            cb("User does not have write access to project.")
                        else
                            has_write_access = true
                            cb()
        ], (err) ->
            opts.cb(err, has_write_access)
        )

    _remember_me_cache = {}
    remember_me_check_for_write_access_to_project = (opts) ->
        opts = defaults opts,
            project_id  : required
            remember_me : required
            cb          : required    # cb(err, has_access)
        key = opts.project_id + opts.remember_me
        has_write_access = _remember_me_cache[key]
        if has_write_access?
            opts.cb(false, has_write_access)
            return
        # get the answer, cache it, return answer
        _remember_me_check_for_write_access_to_project
            project_id  : opts.project_id
            remember_me : opts.remember_me
            cb          : (err, has_write_access) ->
                # if cache gets huge for some *weird* reason (should never happen under normal conditions) just reset it to avoid any possibility of DOS-->RAM crash attach
                if misc.len(_remember_me_cache) >= 100000
                    _remember_me_cache = {}

                _remember_me_cache[key] = has_write_access
                # Set a ttl time bomb on this cache entry. The idea is to keep the cache not too big,
                # but also if the user is suddenly granted permission to the project, this should be
                # reflected within a few seconds.
                f = () ->
                    delete _remember_me_cache[key]
                if has_write_access
                    setTimeout(f, 1000*60*5)   # write access lasts 5 minutes (i.e., if you revoke privs to a user they could still hit the port for 5 minutes)
                else
                    setTimeout(f, 1000*15)      # not having write access lasts 15 seconds
                opts.cb(err, has_write_access)

    _target_cache = {}
    target = (remember_me, url, cb) ->
        key = remember_me + url
        t = _target_cache[key]
        if t?
            cb(false, t)
            return
        v          = url.split('/')
        project_id = v[1]
        type       = v[2]  # 'port' or 'raw'
        winston.debug("setting up a proxy: #{v}")
        location   = undefined
        port       = undefined
        async.series([
            (cb) ->
                if not remember_me?
                    # remember_me = undefined means "allow"; this is used for the websocket upgrade.
                    cb(); return

                remember_me_check_for_write_access_to_project
                    project_id  : project_id
                    remember_me : remember_me
                    cb          : (err, has_access) ->
                        if err
                            cb(err)
                        else if not has_access
                            cb("user does not have write access to this project")
                        else
                            cb()

            (cb) ->
                database.get_project_location
                    project_id  : project_id
                    allow_cache : true
                    cb          : (err, _location) ->
                        if err
                            cb(err)
                        else
                            location = _location
                            cb()
            (cb) ->
                # determine the port
                if type == 'port'
                    port = parseInt(v[3])
                    cb()
                else if type == 'raw'
                    new_local_hub
                        username : location.username
                        host     : location.host
                        port     : location.port
                        cb       : (err, local_hub) ->
                            if err
                                cb(err)
                            else
                                # TODO Optimization: getting the status is slow (half second?), so
                                # we cache this for 15 seconds below; caching longer
                                # could cause trouble due to project restarts, but we'll
                                # have to look into that for speed (and maybe use the database
                                # to better track project restarts).
                                local_hub._get_local_hub_status (err, status) ->
                                    if err
                                        cb(err)
                                    else
                                        port = status['raw.port']
                                        cb()
                else
                    cb("unknown url type -- #{type}")
            ], (err) ->
                if err
                    cb(err)
                else
                    t = {host:location.host, port:port}
                    _target_cache[key] = t
                    # Set a ttl time bomb on this cache entry. The idea is to keep the cache not too big,
                    # but also if the user is suddenly granted permission to the project, or the project server
                    # is restarted, this should be reflected.  Since there are dozens (at least) of hubs,
                    # and any could cause a project restart at any time, we just timeout this info after
                    # a few seconds.  This helps enormously when there is a burst of requests.
                    setTimeout((()->delete _target_cache[key]), 1000*15)
                    cb(false, t)
            )

    http_proxy_server = httpProxy.createServer (req, res, proxy) ->
        if req.url == "/alive"
            res.end('')
            return

        buffer = httpProxy.buffer(req)  # see http://stackoverflow.com/questions/11672294/invoking-an-asynchronous-method-inside-a-middleware-in-node-http-proxy

        cookies = new Cookies(req, res)
        remember_me = cookies.get('remember_me')

        if not remember_me?
            res.writeHead(500, {'Content-Type':'text/html'})
            res.end("Please login to <a target='_blank' href='https://cloud.sagemath.com'>https://cloud.sagemath.com</a> and enable 'remember me' at the sign in screen, then refresh this page.")
            return

        target remember_me, req.url, (err, location) ->
            if err

                winston.debug("proxy denied -- #{err}")

                res.writeHead(500, {'Content-Type':'text/html'})
                res.end("Access denied. Please login to <a target='_blank' href='https://cloud.sagemath.com'>https://cloud.sagemath.com</a> as a user with access to this project, then refresh this page.")
            else
                proxy.proxyRequest req, res, {host:location.host, port:location.port, buffer:buffer}

    http_proxy_server.listen(program.proxy_port, program.host)

    http_proxy_server.on 'upgrade', (req, socket, head) ->
        target undefined, req.url, (err, location) ->
            if err
                winston.debug("websocket upgrade error --  this shouldn't happen since upgrade would only happen after normal thing *worked*. #{err}")
            else
                http_proxy_server.proxy.proxyWebSocketRequest(req, socket, head, location)





#############################################################
# Client = a client that is connected via sockjs to the hub
#############################################################
class Client extends EventEmitter
    constructor: (@conn) ->
        @_data_handlers = {}
        @_data_handlers[JSON_CHANNEL] = @handle_json_message_from_client

        @ip_address = @conn.remoteAddress

        # A unique id -- can come in handy
        @id = @conn.id

        # The variable account_id is either undefined or set to the
        # account id of the user that this session has successfully
        # authenticated as.  Use @account_id to decide whether or not
        # it is safe to carry out a given action.
        @account_id = undefined

        # The persistent sessions that this client started.
        # TODO: For now,these are all terminated when the client disconnects.
        @compute_session_uuids = []

        @cookies = {}
        @remember_me_db = database.key_value_store(name: 'remember_me')

        @check_for_remember_me()

        @conn.on "data", @handle_data_from_client

        @conn.on "close", () =>
            winston.debug("connection: hub <--> client(id=#{@id})  CLOSED")
            @emit 'close'
            @compute_session_uuids = []
            delete clients[@conn.id]

        winston.debug("connection: hub <--> client(id=#{@id})  ESTABLISHED")



    check_for_remember_me: () =>
        @get_cookie
            name : 'remember_me'
            cb   : (value) =>
                if value?
                    x    = value.split('$')
                    hash = generate_hash(x[0], x[1], x[2], x[3])
                    @remember_me_db.get
                        key : hash
                        cb  : (error, signed_in_mesg) =>
                            if not error and signed_in_mesg?
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
        winston.debug("hub --> client (client=#{@id}): #{misc.trunc(to_safe_str(mesg),300)}") if mesg.event != 'pong'
        @push_data_to_client(JSON_CHANNEL, to_json(mesg))

    push_data_to_client: (channel, data) ->
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
            first_name    : signed_in_mesg.first_name
            last_name     : signed_in_mesg.last_name

    # Return the full name if user has signed in; otherwise returns undefined.
    fullname: () =>
        if @signed_in_mesg?
            return @signed_in_mesg.first_name + " " + @signed_in_mesg.last_name

    signed_out: () =>
        @account_id = undefined

    #########################################################
    # Setting and getting HTTPonly cookies via SockJS + AJAX
    #########################################################
    get_cookie: (opts) ->
        opts = defaults opts,
            name : required
            cb   : required   # cb(value)
        @once("get_cookie-#{opts.name}", (value) -> opts.cb(value))
        @push_to_client(message.cookies(id:@conn.id, get:opts.name))

    set_cookie: (opts) ->
        opts = defaults opts,
            name  : required
            value : required
            ttl   : undefined    # time in seconds until cookie expires
            cb    : undefined    # cb() when cookie is set
        options = {}
        if opts.ttl?
            options.expires = new Date(new Date().getTime() + 1000*opts.ttl)
        @once("set_cookie-#{opts.name}", ()->opts.cb?())
        @cookies[opts.name] = {value:opts.value, options:options}
        @push_to_client(message.cookies(id:@conn.id, set:opts.name))

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
            account_id    : required
            first_name    : required
            last_name     : required
            email_address : required

        opts.hub = program.host
        opts.remember_me = true

        signed_in_mesg   = message.signed_in(opts)
        session_id       = uuid.v4()
        @hash_session_id = password_hash(session_id)
        ttl              = 24*3600 * 30     # 30 days

        @remember_me_db.set
            key   : @hash_session_id
            value : signed_in_mesg
            ttl   : ttl

        x = @hash_session_id.split('$')    # format:  algorithm$salt$iterations$hash
        @set_cookie
            name  : 'remember_me'
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
    # SockJS only supports one connection between the client and
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
        # generate a random channel character that isn't already taken
        while true
            channel = String.fromCharCode(Math.random()*65536)
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
        if mesg.event.slice(0,4) != 'ping' and mesg.event != 'codemirror_bcast'
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

    mesg_ping_session: (mesg) =>
        s = persistent_sage_sessions[mesg.session_uuid]
        if s?
            s.last_ping_time = new Date()
            return
        @push_to_client(message.error(id:mesg.id, error:"Pinged unknown session #{mesg.session_uuid}"))

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
    # Messages: Keeping client connected
    ######################################################
    # ping/pong
    mesg_ping: (mesg) =>
        @push_to_client(message.pong(id:mesg.id))

    ######################################################
    # Messages: Account creation, sign in, sign out
    ######################################################
    mesg_create_account: (mesg) => create_account(@, mesg)

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
        if @account_id != mesg.account_id
            @push_to_client(message.error(id:mesg.id, error:"Not signed in as user with id #{mesg.account_id}."))
        else
            get_account_settings(mesg, @push_to_client)

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

        project = undefined
        async.series([
            (cb) =>
                switch permission
                    when 'read'
                        user_has_read_access_to_project
                            project_id : mesg.project_id
                            account_id : @account_id
                            cb         : (err, result) =>
                                if err
                                    cb("Internal error determining user permission -- #{err}")
                                else if not result
                                    cb("User #{@account_id} does not have read access to project #{mesg.project_id}")
                                else
                                    # good to go
                                    cb()
                    when 'write'
                        user_has_write_access_to_project
                            project_id : mesg.project_id
                            account_id : @account_id
                            cb         : (err, result) =>
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
                    cb(false, project)
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

    mesg_create_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to create a new project.")
            return

        project_id = uuid.v4()
        project = undefined
        location = undefined

        async.series([
            # get unix account location for the project
            (cb) =>
                new_random_unix_user
                    cb : (err, _location) =>
                        location = _location
                        cb(err)

            # create project in database
            (cb) =>
                winston.debug("got random unix user location = ", location)
                database.create_project
                    project_id  : project_id
                    account_id  : @account_id
                    title       : mesg.title
                    description : mesg.description
                    public      : mesg.public
                    location    : location
                    quota       : DEFAULTS.quota   # TODO -- account based
                    idle_timeout: DEFAULTS.idle_timeout # TODO -- account based
                    cb          : cb

            (cb) =>
                new_project project_id, (err, _project) =>
                    project = _project
                    cb(err)

        ], (error) =>
            if error
                winston.debug("Issue creating project #{project_id}: #{misc.to_json(mesg)}")
                @error_to_client(id: mesg.id, error: "Failed to create new project '#{mesg.title}' -- #{misc.to_json(error)}")
                if not project?
                    # project object not even created -- just clean up database
                    database.delete_project(project_id:project_id)  # do not bother with callback
            else
                winston.debug("Successfully created project #{project_id}: #{misc.to_json(mesg)}")
                @push_to_client(message.project_created(id:mesg.id, project_id:project_id))
                push_to_clients  # push a message to all other clients logged in as this user.
                    where : {account_id:@account_id,  exclude: [@conn.id]}
                    mesg  : message.project_list_updated()
        )

    mesg_get_projects: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to get a list of projects.")
            return

        database.get_projects_with_user
            account_id : @account_id
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
                                        @push_to_client(message.project_info(id:mesg.id, info:info))
                        else
                            @push_to_client(message.project_info(id:mesg.id, info:info))

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


    mesg_update_project_data: (mesg) =>
        winston.debug("mesg_update_project_data")
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to set data about a project.")
            return

        user_has_write_access_to_project
            project_id : mesg.project_id
            account_id : @account_id
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

    mesg_save_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.save (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_close_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.close (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

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
                        u = uuid.v4()
                        save_blob uuid:u, value:content.blob, ttl:BLOB_TTL, cb:(err) =>
                            if err
                                @error_to_client(id:mesg.id, error:err)
                            else
                                if content.archive?
                                    the_url = "/blobs/#{mesg.path}.#{content.archive}?uuid=#{u}"
                                else
                                    the_url = "/blobs/#{mesg.path}?uuid=#{u}"
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

    ################################################
    # CodeMirror Sessions
    ################################################
    mesg_codemirror_get_session: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.get_codemirror_session
                path         : mesg.path
                project_id   : mesg.project_id
                session_uuid : mesg.session_uuid
                cb           : (err, session) =>
                    if err
                        @error_to_client(id:mesg.id, error:"Problem getting file editing session -- #{err}")
                    else
                        # It is critical that we initialize the
                        # diffsync objects on both sides with exactly
                        # the same document.
                        session.get_snapshot (err, snapshot) =>
                            # We add the client, so it will gets messages
                            # about changes to the document.
                            session.add_client(@, snapshot)
                            # Send parameters of session to client
                            mesg = message.codemirror_session
                                id           : mesg.id
                                session_uuid : session.session_uuid
                                path         : session.path
                                content      : snapshot
                            @push_to_client(mesg)

    get_codemirror_session : (mesg, cb) =>
        session = codemirror_sessions.by_uuid[mesg.session_uuid]
        if not session?
            @push_to_client(message.reconnect(id:mesg.id, reason:"Global hub does not know about a codemirror session with session_uuid='#{mesg.session_uuid}'"))
            cb("CodeMirror session got lost / dropped / or is known to client but not this hub")
        else
            cb(false, session)
            # Record that a client is actively doing something with this session.
            database.touch_project(project_id:session.project_id)

    mesg_codemirror_disconnect: (mesg) =>
        @get_codemirror_session mesg, (err, session) =>
            if not err
                session.client_disconnect(@, mesg)

    mesg_codemirror_diffsync: (mesg) =>
        @get_codemirror_session mesg, (err, session) =>
            if not err
                session.client_diffsync(@, mesg)

    mesg_codemirror_bcast: (mesg) =>
        @get_codemirror_session mesg, (err, session) =>
            if not err
                session.client_broadcast(@, mesg)

    mesg_codemirror_write_to_disk: (mesg) =>
        @get_codemirror_session mesg, (err, session) =>
            if not err
                session.write_to_disk(@, mesg)

    mesg_codemirror_read_from_disk: (mesg) =>
        @get_codemirror_session mesg, (err, session) =>
            if not err
                session.read_from_disk(@, mesg)

    mesg_codemirror_get_content: (mesg) =>
        @get_codemirror_session mesg, (err, session) =>
            if not err
                session.get_content(@, mesg)

    mesg_codemirror_execute_code: (mesg) =>
        @get_codemirror_session mesg, (err, session) =>
            if not err
                session.execute_code(@, mesg)

    mesg_codemirror_introspect: (mesg) =>
        @get_codemirror_session mesg, (err, session) =>
            if not err
                session.client_call(@, mesg)

    mesg_codemirror_send_signal: (mesg) =>
        @get_codemirror_session mesg, (err, session) =>
            if not err
                session.client_call(@, mesg)

    ## -- user search
    mesg_user_search: (mesg) =>
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
            database.project_users
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

            database.select
                table   : 'project_users'
                columns : ['mode']
                where   : {project_id:mesg.project_id, account_id:mesg.account_id}
                cb      : (err, result) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else if result.length > 0 and result[0][0] == 'owner'
                        # target is already has better privileges
                        @push_to_client(message.success(id:mesg.id))
                    else
                        database.update
                            table : 'project_users'
                            set   : {mode:'collaborator'}
                            where : {project_id:mesg.project_id, account_id:mesg.account_id}
                            cb    : (err) =>
                                if err
                                    @error_to_client(id:mesg.id, error:err)
                                else
                                    @push_to_client(message.success(id:mesg.id))

    mesg_remove_collaborator: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            database.select
                table   : 'project_users'
                columns : ['mode']
                where   : {project_id:mesg.project_id, account_id:mesg.account_id}
                cb      : (err, result) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else if result.length > 0 and result[0][0] == 'owner'
                        @error_to_client(id:mesg.id, error:"Cannot remove owner of project.")
                    else database.delete
                        table : 'project_users'
                        where : {project_id:mesg.project_id, account_id:mesg.account_id}
                        cb    : (err) =>
                            if err
                                @error_to_client(id:mesg.id, error:err)
                            else
                                @push_to_client(message.success(id:mesg.id))

    ################################################
    # Project snapshots -- interface to the snap servers
    ################################################
    mesg_snap: (mesg) =>
        if mesg.command not in ['ls', 'restore', 'log']
            @error_to_client(id:mesg.id, error:"invalid snap command '#{mesg.command}'")
            return
        user_has_write_access_to_project
            project_id : mesg.project_id
            account_id : @account_id
            cb         : (err, result) =>
                if err or not result
                    @error_to_client(id:mesg.id, error:"access to project #{mesg.project_id} denied")
                else
                    snap_command
                        command    : mesg.command
                        project_id : mesg.project_id
                        snapshot   : mesg.snapshot
                        path       : mesg.path
                        timeout    : mesg.timeout
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



register_hub = (cb) ->
    database.update
        table : 'hub_servers'
        where : {host : program.host, port : program.port}
        set   : {clients: misc.len(clients)}
        ttl   : 2*REGISTER_INTERVAL_S
        cb    : (err) ->
            if err
                winston.debug("Error registering with database - #{err}")
            else
                winston.debug("Successfully registered with database.")
            cb?(err)

##-------------------------------
#
# Interaction with snap servers
#
##-------------------------------

snap_command = (opts) ->
    opts = defaults opts,
        command    : required   # "ls", "restore", "log"
        project_id : required
        location   : undefined  # used by restore to send files to some non-default location (the default is the project location in the database)
        snapshot   : undefined
        path       : '.'
        timeout    : 60
        cb         : required   # cb(err, list of results when meaningful)

    switch opts.command
        when 'ls'
            delete opts.command
            snap_command_ls(opts)
        when 'restore', 'log'
            snap_command_restore_or_log(opts)
        else
            opts.cb("invalid snap command #{opts.command}")


snap_command_restore_or_log = (opts) ->
    opts = defaults opts,
        command    : required
        project_id : required
        snapshot   : required
        location   : undefined
        path       : '.'
        timeout    : 60
        cb         : required   # cb(err)

    snap_location = undefined
    socket = undefined
    async.series([
        (cb) ->
            # find a snap server with this particular snapshot
            database.snap_locate_commit
                project_id : opts.project_id
                timestamp  : opts.snapshot
                cb         : (err, r) ->
                    snap_location = r
                    cb(err)
       (cb) ->
            connect_to_snap_server snap_location.server, (err, _socket) ->
                socket = _socket
                cb(err)
        (cb) ->
            snap.client_snap
                command    : opts.command
                socket     : socket
                project_id : opts.project_id
                snapshot   : opts.snapshot
                location   : opts.location
                repo_id    : snap_location.repo_id
                path       : opts.path
                timeout    : opts.timeout
                cb         : cb
    ], opts.cb)


snap_command_ls = (opts) ->
    opts = defaults opts,
        project_id : required
        snapshot   : undefined
        path       : '.'
        timeout    : 60
        cb         : required   # cb(err, list of results when meaningful)
    if opts.snapshot?
        # Get directory listing inside a given snapshot
        listing  = undefined
        location = undefined
        socket   = undefined
        async.series([
            # First check for cached listing in the database
            (cb) ->
                database.snap_ls_cache
                    project_id : opts.project_id
                    timestamp  : opts.snapshot
                    path       : opts.path
                    cb         : (err, _listing) ->
                        listing = _listing
                        cb(err)
            (cb) ->
                if listing?  # already got it from cache, so done
                    cb(); return
                # find snap servers with this particular snapshot
                database.snap_locate_commit
                    project_id : opts.project_id
                    timestamp  : opts.snapshot
                    cb         : (err, r) ->
                        location = r
                        cb(err)
           (cb) ->
                if listing?
                    cb(); return
                # get the listing from a server
                connect_to_snap_server location.server, (err, _socket) ->
                    socket = _socket
                    cb(err)
            (cb) ->
                if listing?
                    cb(); return
                snap.client_snap
                    command : 'ls'
                    socket  : socket
                    project_id : opts.project_id
                    snapshot   : opts.snapshot
                    repo_id    : location.repo_id
                    path       : opts.path
                    timeout    : opts.timeout
                    cb         : (err, _listing) ->
                        listing = _listing
                        cb(err)
            (cb) ->
                if listing? and socket?  # socket defined means we computed the listing
                    # store listing in database cache
                    database.snap_ls_cache
                        project_id : opts.project_id
                        timestamp  : opts.snapshot
                        path       : opts.path
                        listing    : listing
                        cb         : cb
                else
                    cb()

        ], (err) ->
            opts.cb(err, listing)
        )

    else

        # Get list of all currently available snapshots for the given project:
        # This *only* involves two database queries -- no connections to snap servers.
        server_ids = undefined
        commits = undefined
        async.series([
            # query database for id's of the active snap_servers
            (cb) ->
                database.snap_servers
                    columns : ['id']
                    cb      : (err, results) ->
                        if err
                            cb(err)
                        else
                            server_ids = (r.id for r in results)
                            cb()
            # query database for snapshots of this project on any of the active snap servers
            (cb) ->
                database.snap_commits
                    project_id : opts.project_id
                    server_ids : server_ids
                    columns    : ['timestamp']
                    cb         : (err, results) ->
                        if err
                            cb(err)
                        else
                            commits = (r.timestamp for r in results)
                            commits.sort()
                            commits = _.uniq(commits, true)
                            commits.reverse()
                            cb()
        ], (err) -> opts.cb(err, commits))

_snap_server_socket_cache = {}
connect_to_snap_server = (server, cb) ->
    key    = misc.to_json(server)
    socket = _snap_server_socket_cache[key]
    if socket? and socket.writable
        cb(false, socket)
    else
        snap.client_socket
            host  : server.host
            port  : server.port
            token : server.key
            cb    : (err, socket) ->
                if not err
                    _snap_server_socket_cache[key] = socket
                cb(err, socket)


restore_project_from_most_recent_snapshot = (opts) ->
    opts = defaults opts,
        project_id : required
        location   : required
        cb         : undefined

    timestamp = "nothing to do"
    winston.debug("restore_project_from_most_recent_snapshot: #{opts.project_id} --> #{misc.to_json(opts.location)}")
    async.series([
        (cb) ->
            # We get a list of *all* currently available snapshots, since right now there
            # is now way to get just the most recent one.
            snap_command
                command    : "ls"
                project_id : opts.project_id
                cb         : (err, results) ->
                    if err
                        cb(err)
                    else
                        if results.length == 0
                            winston.debug("restore_project_from_most_recent_snapshot: #{opts.project_id} -- no snapshots; nothing to do")
                        else
                            timestamp = results[0]
                        cb()
        (cb) ->
            if timestamp == "nothing to do"
                # nothing to do
                cb()
            else
                winston.debug("restore_project_from_most_recent_snapshot: #{opts.project_id} -- started the restore")
                snap_command
                    command : "restore"
                    project_id : opts.project_id
                    location   : opts.location
                    snapshot   : timestamp
                    timeout    : 1800
                    cb         : (err) ->
                        winston.debug("restore_project_from_most_recent_snapshot: #{opts.project_id} -- finished restore")
                        if err
                            winston.debug("restore_project_from_most_recent_snapshot: #{opts.project_id} -- BUG restore #{timestamp} error -- #{err}")
                        cb(err)

    ], (err) -> opts.cb?(err))

# Make some number of snapshots on some minimum distinct number
# of snapshot servers of the given project, if possible.
snapshot_project = (opts) ->
    opts = defaults opts,
        project_id   : required
        min_replicas : 1
        cb           : undefined       # cb(err) -- called only when snapshots definitely have been made and reported to db
    # TODO!
    winston.debug("snapshot_project #{opts.project_id} on at least #{opts.min_replicas} nodes -- STUB'")
    opts.cb?()


# Move a project to longterm storage:
#
# This function assumes this is safe, i.e., that there is no Project class created on some
# global hub, which would incorrectly think the project is still allocated somewhere.
#
#    - make a snapshot on all running snap servers; at least 2 must succeed
#    - set location to null in database
#    - delete files and account (need a "delete account" script to make the create account script).
#
# Also, it's an error if the location is not on the 10.x subnet or 'localhost'.
move_project_to_longterm_storage = (opts) ->
    opts = defaults opts,
        project_id   : required
        min_replicas : 2
        cb           : undefined

    location = undefined
    async.series([
        (cb) ->
            winston.debug("move_project_to_longterm_storage -- getting location of #{opts.project_id}")
            database.get_project_location
                project_id : opts.project_id
                allow_cache : false   # no point in using a cache here
                cb         : (err, _location) =>
                    location = _location
                    if err
                        cb(err); return
                    else if location == "deploying"
                        cb("project curently being opened, so refusing to move it to storage")
                    else if not location
                        cb("done")
                    else
                        if location.host == 'localhost' or location.host.slice(0,3) == '10.'
                            cb()
                        else
                            cb("refusing to move project at non-VPN/non-local location (=#{location.host}) to longterm storage!")
        (cb) ->
            winston.debug("move_project_to_longterm_storage -- making at least 2 snapshots of #{opts.project_id}")
            snapshot_project
                project_id    : opts.project_id
                min_replicas  : opts.min_replicas
                cb : cb
        (cb) ->
            winston.debug("move_project_to_longterm_storage -- setting location to null in database")
            database.set_project_location
                project_id : opts.project_id
                location   : "" # means not deployed anywhere
                cb         : cb
        (cb) ->
            winston.debug("move_project_to_longterm_storage -- deleting account and all associated files")
            delete_unix_user
                location : location
                cb       : cb

    ], (err) ->
        winston.debug("move_project_to_longterm_storage -- DONE (err=#{err})")
        if err == "done"
            cb?()
        else
            cb?(err)
    )

test_longterm = () ->
    winston.debug("test_longterm...")
    move_project_to_longterm_storage
        project_id : '94ab8b76-672f-4a04-8b58-979fd363d34f'
        #project_id : 'bed89d12-d2d0-49dd-aaf5-34a2b41b325a'
        cb         : (err) ->
            winston.debug("test_longterm err = #{err}")

#setTimeout(test_longterm, 5000)


##############################
# Create the SockJS Server
##############################
init_sockjs_server = () ->
    sockjs_server = sockjs.createServer()

    sockjs_server.on "connection", (conn) ->
        clients[conn.id] = new Client(conn)

    sockjs_server.installHandlers(http_server, {prefix:'/hub'})


    #######################################################
# Pushing a message to clients; querying for clients
# This is (or will be) subtle, due to having
# multiple HUBs running on different computers.
#######################################################

# get_client_ids -- given query parameters, returns a list of id's,
#   where the id is the SockJS connection id, which we assume is
#   globally unique across all of space and time.
get_client_ids = (opts) ->
    opts = defaults opts,
        account_id : undefined      # include connected clients logged in under this account
        project_id : undefined      # include connected clients that are a user of this project
        exclude    : undefined      # array of id's to exclude from results
        cb         : required

    result = []
    include = (id) ->
        if id not in result
            if opts.exclude?
                if id in opts.exclude
                    return
            result.push(id)

    async.series([
        (cb) ->
            if opts.project_id?
                database.get_account_ids_using_project
                    project_id : opts.project_id
                    cb : (error, result) ->
                        if (error)
                            opts.cb(error)
                            cb(true)
                        else
                            for id in result
                                include(id)
                            cb()
            else
                cb()
        (cb) ->
            # TODO: This will be replaced by one scalable database query on an indexed column
            if opts.account_id?
                for id, client of clients
                    if client.account_id == opts.account_id
                        include(id)
            opts.cb(false, result)
            cb()
    ])


# Send a message to a bunch of clients, connected either to this hub
# or other hubs (local clients first).
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

            # *MAJOR IMPORTANT TODO*: extend to use database and inter-hub communication
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

################################################
# DiffSync-based CodeMirror sessions
#
#   [client]s.. ---> [hub] ---> [local hub] <--- [hub] <--- [client]s...
#
################################################


# The CodeMirrorDiffSyncLocalHub class represents a local hub viewed
# as a remote server for this hub.
#
# TODO later: refactor code, since it seems like all these
# DiffSync[Hub/Client] etc. things are defined by a write_mesg function.
#


codemirror_sessions = {by_path:{}, by_uuid:{}}

class CodeMirrorDiffSyncLocalHub
    constructor: (@cm_session) ->

    write_mesg: (event, obj, cb) =>
        if not obj?
            obj = {}
        obj.session_uuid = @cm_session.session_uuid
        @cm_session.local_hub.call
            timeout : 10  # ???  TODO: what is a good timeout here?
            cb      : cb
            mesg    : message['codemirror_' + event](obj)

    recv_edits : (edit_stack, last_version_ack, cb) =>
        @write_mesg  'diffsync', {edit_stack: edit_stack, last_version_ack: last_version_ack}, (err, mesg) =>
            if err
                if mesg? and mesg
                    cb(mesg)  # due to the diffsync protocol, mesg could be "retry" or a real message.
                else
                    cb(err)
            else
                @cm_session.diffsync_server.recv_edits mesg.edit_stack, mesg.last_version_ack, (err) =>
                    @cm_session.set_content(@cm_session.diffsync_server.live)
                    cb(err)

    sync_ready: () =>
        @write_mesg('diffsync_ready')

# The CodeMirrorDiffSyncClient class represents a browser client viewed as a
# remote client for this global hub.
class CodeMirrorDiffSyncClient
    constructor: (@client, @cm_session) ->

    recv_edits: (edit_stack, last_version_ack, cb) =>
        @client.push_to_client(
            message.codemirror_diffsync
                id               : @current_mesg_id
                edit_stack       : edit_stack
                last_version_ack : last_version_ack
                session_uuid     : @cm_session.session_uuid
        )
        cb()  # no way to detect failure

    send_mesg: (mesg) =>
        @client.push_to_client(mesg)

    # Suggest to the connected client that there is stuff ready to be synced
    sync_ready: () =>
        @send_mesg(message.codemirror_diffsync_ready(session_uuid: @cm_session.session_uuid))

class CodeMirrorSession
    constructor: (opts) ->
        opts = defaults opts,
            local_hub    : required
            project_id   : required
            path         : required
            cb           : required

        console.log("creating a CodeMirrorSession: #{opts.project_id}, #{opts.path}")

        @local_hub    = opts.local_hub
        @project_id   = opts.project_id
        @path         = opts.path

        @connect      = misc.retry_until_success_wrapper(f:@_connect, logname:'connect')
        # min_interval: to avoid possibly DOS's a local hub -- not sure what best choice is here.
        @sync         = misc.retry_until_success_wrapper(f:@_sync, min_interval:200, logname:'localhub_sync')

        # The downstream (web browser) clients of this hub
        @diffsync_clients = {}

        codemirror_sessions.by_path[@project_id + @path] = @
        @connect (err) =>
            if err
                opts.cb(err)
            else
                opts.cb(false, @)

    _connect: (cb) =>
        @local_hub.call
            mesg : message.codemirror_get_session(path:@path, project_id:@project_id, session_uuid:@session_uuid)
            cb   : (err, resp) =>
                if err
                    winston.debug("local_hub --> hub: (connect) error -- #{err}, #{resp}, trying to connect to #{@path} in #{@project_id}.")
                    cb?(err)
                else if resp.event == 'error'
                    cb?(resp.error)
                else

                    if @session_uuid?
                        # Send a broadcast message to all connected
                        # clients informing them of the new session id.
                        mesg = message.codemirror_bcast
                            session_uuid : @session_uuid
                            mesg         :
                                event            : 'update_session_uuid'
                                new_session_uuid : resp.session_uuid
                        @broadcast_mesg_to_clients(mesg)

                    @session_uuid = resp.session_uuid

                    codemirror_sessions.by_uuid[@session_uuid] = @

                    if @_last_sync?
                        # We have sync'd before.
                        patch = @diffsync_server._compute_edits(@_last_sync, @diffsync_server.live)

                    # Reconnect to the upstream (local_hub) server
                    @diffsync_server = new diffsync.DiffSync(doc:resp.content)
                    @set_content(resp.content)

                    if @_last_sync?
                        # applying missed patches to the new upstream version that we just got from the hub.
                        @_apply_patch_to_live(patch)
                    else
                        # This initialiation is the first.
                        @_last_sync   = resp.content

                    @diffsync_server.connect(new CodeMirrorDiffSyncLocalHub(@))
                    @sync(cb)

    _apply_patch_to_live: (patch) =>
        @diffsync_server._apply_edits_to_live(patch)
        for id, ds of @diffsync_clients
            ds.live = @diffsync_server.live

    set_content: (content) =>
        @diffsync_server.live = content
        for id, ds of @diffsync_clients
            ds.live = content

    client_broadcast: (client, mesg) =>
        # Broadcast message from some client reporting something (e.g., cursor position, etc.)
        ds_client = @diffsync_clients[client.id]
        if not ds_client?
            return # something wrong -- just drop the message

        #winston.debug("client_broadcast: #{misc.to_json(mesg)}")

        # We tag the broadcast message, in order to make it more useful to recipients (but do not
        # go so far as to advertise the account_id or email)..

        # 1. Fill in the user's name
        if client.signed_in_mesg?
            mesg.name = client.fullname()
            # Use first 6 digits of uuid... one color per session, NOT per username.
            # TODO: this could be done client side in a way that respects their color scheme...?
            mesg.color = client.id.slice(0,6)

        # 2. Send fire-and-forget message on to the local_hub, which will forward this message
        # on to all the other hubs.
        @local_hub.local_hub_socket (err, socket) ->
            if not err
                socket.write_mesg 'json', mesg

        # 3. Send message to other clients connected to this hub.
        include_self = mesg.self? and mesg.self
        for id, ds of @diffsync_clients
            if include_self or id != client.id
                ds.remote.send_mesg(mesg)

    client_disconnect: (client, mesg) =>
        # Explicitly disconnect the given client from this session.
        delete @diffsync_clients[client.id]
        client.push_to_client(message.success(id:mesg.id))
        winston.debug("Disconnected a client from session #{@session_uuid}; there are now #{misc.len(@diffsync_clients)} clients.")

    client_diffsync: (client, mesg) =>
        # Message from some client reporting new edits; we apply them,
        # generate new edits, and send those out so that the client
        # can complete the sync cycle.

        if @_sync_lock
            client.push_to_client(message.codemirror_diffsync_retry_later(id:mesg.id))
            return

        winston.debug("client_diffsync; the clients are #{misc.keys(@diffsync_clients)}")
        ds_client = @diffsync_clients[client.id]
        if not ds_client?
            f = () =>
                r = message.reconnect(id:mesg.id, reason:"Client with id #{client.id} is not registered with this hub for editing #{@path} in some project.")
                client.push_to_client(r)
            # We wait a bit before sending the reconnect message, since this is often the
            # result of resetting the local_hub connection (which takes 5 seconds), and
            # the client will instantly try to reconnect again, which will fail and lead to
            # this again, which ends up slowing everything down.
            setTimeout(f, 1000)
            return

        @_sync_lock = true
        before = @diffsync_server.live
        ds_client.recv_edits    mesg.edit_stack, mesg.last_version_ack, (err) =>
            if err
                @_sync_lock = false
                client.error_to_client(id:mesg.id, error:"CodeMirrorSession -- unable to push diffsync changes from client (id=#{client.id}) -- #{err}")
                return

            # Update master live document with result.
            @set_content(ds_client.live)
            @_sync_lock = false

            # Send back our own edits to this client.
            ds_client.remote.current_mesg_id = mesg.id  # used to tag the return message
            ds_client.push_edits (err) =>
                if err
                    winston.debug("CodeMirrorSession -- push_edits returned -- #{err}")

            if before != @diffsync_server.live
                # Sync new state with upstream local_hub.
                @sync () =>
                    # View of the document changed and we're done syncing with upstream, so suggest other clients sync with us.
                    for id, ds of @diffsync_clients
                        if client.id != id
                            ds.remote.sync_ready()

    get_snapshot: (cb) =>
        if @diffsync_server?
            cb(false, @diffsync_server.live)
        else
            @connect (err) =>
                if err
                    cb(err)
                else
                    cb(false, @diffsync_server.live)

    broadcast_mesg_to_clients: (mesg, exclude_id) =>
        for id, ds of @diffsync_clients
            if id != exclude_id
                ds.remote.send_mesg(mesg)

    _sync: (cb) =>    # cb(err)
        winston.debug("codemirror session -- syncing with local hub")
        @_sync_lock = true
        before = @diffsync_server.live
        @diffsync_server.push_edits (err) =>
            after = @diffsync_server.live
            if err
                @set_content(before)
                # We do *NOT* remove the sync_lock in this branch; only do that after a successful sync, since
                # otherwise clients think they have successfully sync'd with the hub, but when the hub resets,
                # the clients end up doing the wrong thing.
                winston.debug("codemirror session local hub sync error -- #{err}; #{before != after}")
                if typeof(err) == 'string'
                    err = err.toLowerCase()
                    if err.indexOf('retry') != -1
                        winston.debug("sync: retrying...")
                        # This is normal -- it's because the diffsync algorithm only allows sync with
                        # one client (and upstream) at a time.
                        cb(err); return
                    else if err.indexOf("unknown") != -1 or err.indexOf('not registered') != -1
                        winston.debug("sync: reconnecting...")
                        @connect () =>
                            cb(err); return # still an error even if connect works.
                    else if err.indexOf("timed out") != -1
                        @local_hub.restart () =>
                            cb(err); return
                cb(err)
            else
                @set_content(after)
                winston.debug("codemirror session local hub sync -- pushed edits, thus completing cycle")
                @_sync_lock = false
                @_last_sync = after # what was the last successful sync with upstream.
                if before != after
                    @_tell_clients_to_sync()
                cb()

    _tell_clients_to_sync: () =>
        winston.debug("codemirror session local hub sync -- there were changes; informing clients.")
        # Tell the clients that content has changed due to an upstream sync, so they may want to sync again.
        for id, ds of @diffsync_clients
            ds.remote.sync_ready()

    # Add a new diffsync browser client.
    add_client: (client, snapshot) =>  # snapshot = a snapshot of the document that client and server start with -- MUST BE THE SAME!
        # Create object that represents this side of the diffsync connection with client
        ds_client = new diffsync.DiffSync(doc:snapshot)
        # Connected it to object that represents the client side
        ds_client.connect(new CodeMirrorDiffSyncClient(client, @))
        # Remember the client object
        @diffsync_clients[client.id] = ds_client
        # Make sure to remove the client object when the client's WebSocket disconnects.
        # This avoid broadcasting messages willy-nilly (and illegally).
        client.on 'close', () =>
            delete @diffsync_clients[client.id]

    write_to_disk: (client, mesg, cb) =>
        async.series([
            (cb) =>
                @sync(cb)

            (cb) =>
                @local_hub.call
                    mesg : message.codemirror_write_to_disk(session_uuid : @session_uuid)
                    cb   : (err, resp) =>
                        if err
                            resp = message.reconnect(id:mesg.id, reason:"Error writing to disk -- #{err}")
                            client.push_to_client(resp)
                            @sync() # will cause a reconnect
                        else
                            winston.debug("wrote '#{@path}' to disk")
                            resp.id = mesg.id
                            if misc.filename_extension(@path) == "sagews"
                                make_blobs_permanent
                                    blob_ids   : diffsync.uuids_of_linked_files(@diffsync_server.live)
                                    cb         : (err) =>
                                        if err
                                            client.error_to_client(id:mesg.id, error:err)
                                        else
                                            client.push_to_client(resp)
                            else
                                 client.push_to_client(resp)
                        cb(err)
        ], (err) => cb?(err))


    read_from_disk: (client, mesg) =>
        @local_hub.call
            mesg : message.codemirror_read_from_disk(session_uuid : @session_uuid)
            cb   : (err, resp) =>
                if err
                    winston.debug("Error reading from disk -- #{err} -- reconnecting")
                    @reconnect () =>
                        resp = message.reconnect(id:mesg.id, reason:"error reading from disk -- #{err}")
                        client.push_to_client(resp)
                else
                    resp.id = mesg.id
                    client.push_to_client(resp)

    get_content: (client, mesg) =>
        client.push_to_client( message.codemirror_content(id:mesg.id, content:@diffsync_server.live) )

    execute_code: (client, mesg) =>
        @local_hub.call
            multi_response : true
            mesg : mesg
            cb   : (err, resp) =>   # cb can be called multiple times due to multi_response=True
                if err
                    winston.debug("Server error executing code in local codemirror session -- #{err} -- reconnecting")
                    @reconnect () =>
                        resp = message.reconnect(id:mesg.id, reason:"error executing code-- #{err}")
                        client.push_to_client(resp)
                else
                    if resp.done
                        @local_hub.remove_multi_response_listener(resp.id)
                    client.push_to_client(resp)

    client_call: (client, mesg) =>
        @local_hub.call
            mesg : mesg
            cb   : (err, resp) =>
                if err
                    winston.debug("client_call: error -- #err -- reconnecting")
                    @reconnect () =>
                        resp = message.reconnect(id:mesg.id, reason:"error introspecting code-- #{err}")
                        client.push_to_client(resp)
                else
                    client.push_to_client(resp)

##############################
# LocalHub
##############################

connect_to_a_local_hub = (opts) ->    # opts.cb(err, socket)
    opts = defaults opts,
        port         : required
        secret_token : required
        timeout      : 10
        cb           : required

    socket = misc_node.connect_to_locked_socket
        port  : opts.port
        token : opts.secret_token
        timeout : opts.timeout
        cb    : (err) =>
            if err
                opts.cb(err)
            else
                misc_node.enable_mesg(socket)
                opts.cb(false, socket)

    socket.on 'data', (data) ->
        misc_node.keep_portforward_alive(opts.port)


_local_hub_cache = {}
new_local_hub = (opts) ->    # cb(err, hub)
    opts = defaults opts,
        username : required
        host     : required
        port     : 22
        cb       : required
    hash = "#{opts.username}@#{opts.host} -p#{opts.port}"
    H = _local_hub_cache[hash]   # memory leak issues?
    if H?
        winston.debug("new_local_hub already cached")
        opts.cb(false, H)
    else
        start_time = misc.walltime()
        H = new LocalHub(opts.username, opts.host, opts.port, (err) ->
                   winston.debug("new_local_hub creation: time= #{misc.walltime() - start_time}")
                   if not err
                      _local_hub_cache[hash] = H
                   opts.cb?(err, H)
            )

class LocalHub  # use the function "new_local_hub" above; do not construct this directly!
    constructor: (@username, @host, @port, cb) ->
        winston.debug("Creating LocalHub(#{@username}, #{@host}, #{@port}, ...)")
        assert @username? and @host? and @port? and cb?
        @address = "#{username}@#{host}"
        @id = "#{@address} -p#{@port}"  # string that uniquely identifies this local hub -- useful for other code, e.g., sessions
        @_sockets = {}
        @_multi_response = {}
        @local_hub_socket  (err) =>
            if err
                @restart (err) =>
                    if err
                        cb("Unable to start and connect to local hub #{@address} -- #{err}")
                    else
                        @local_hub_socket (err) =>
                            cb(err, @)
            else
                cb(false, @)

    restart: (cb) =>
        winston.debug("restarting a local hub")
        if @_restart_lock
            winston.debug("local hub restart -- hit a lock")
            cb("already restarting")
            return
        @_restart_lock = true
        async.series([
            (cb) =>
                winston.debug("local_hub restart: Killing all processes")
                if @username.length != 8
                    winston.debug("local_hub restart: skipping killall since this user #{@username} is clearly not a cloud.sagemath project :-)")
                    cb()
                else
                    @_restart_lock = false
                    @killall () =>
                        @_restart_lock = true
                        cb()
            (cb) =>
                winston.debug("local_hub restart: Push latest version of code to remote machine...")
                @_push_local_hub_code (err) =>
                    if err
                        winston.debug("local hub code push -- failed #{err}")
                        winston.debug("proceeding anyways, since it's critical that the user have access.")
                    cb()
            (cb) =>
                winston.debug("local_hub restart: Restart the local services....")
                @_restart_lock = false # so we can call @_exec_on_local_hub
                @_exec_on_local_hub
                    command : 'start_smc'
                    timeout : 45
                    cb      : (err, output) =>
                        #winston.debug("result: #{err}, #{misc.to_json(output)}")
                        cb(err)
                # MUST be here, since _restart_lock prevents _exec_on_local_hub!
                @_restart_lock = true
        ], (err) =>
            winston.debug("local_hub restart: #{err}")
            @_restart_lock = false
            cb(err)
        )

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
        if mesg.id?
            @_multi_response[mesg.id]?(false, mesg)
            return
        if mesg.event == 'codemirror_diffsync_ready'
            @get_codemirror_session
                session_uuid : mesg.session_uuid
                cb           : (err, session) ->
                    if not err
                        session.sync()
        if mesg.event == 'codemirror_bcast'
            @get_codemirror_session
                session_uuid : mesg.session_uuid
                cb           : (err, session) ->
                    if not err
                        session.broadcast_mesg_to_clients(mesg)

    handle_blob: (opts) =>
        opts = defaults opts,
            uuid : required
            blob : required

        winston.debug("local_hub --> global_hub: received a blob with uuid #{opts.uuid}")
        # Store blob in DB.
        save_blob
            uuid  : opts.uuid
            value : opts.blob
            ttl   : BLOB_TTL
            cb    : (err, ttl) =>
                if err
                    resp = message.save_blob(sha1:opts.uuid, error:err)
                    winston.debug("handle_blob: error! -- #{err}")
                else
                    resp = message.save_blob(sha1:opts.uuid, ttl:ttl)

                @local_hub_socket  (err,socket) ->
                     socket.write_mesg('json', resp)

    # The unique standing authenticated control socket to the remote local_hub daemon.
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

                for c in @_local_hub_socket_queue
                    c(false, @_socket)

    # Get a new socket connection to the local_hub; this socket will have been
    # authenticated via the secret_token, and enhanced to be able to
    # send/receive json and blob messages.
    new_socket: (cb) =>     # cb(err, socket)
        @open   (err, port, secret_token) =>
            if err
                cb(err); return
            connect_to_a_local_hub
                port         : port
                secret_token : secret_token
                cb           : (err, socket) =>
                    if not err
                        cb(err, socket)
                    else
                        delete @_status  # forget port and secret token.
                        cb(err)

    remove_multi_response_listener: (id) =>
        delete @_multi_response[id]

    call: (opts) =>
        opts = defaults opts,
            mesg    : required
            timeout : 10
            multi_response : false   # if true, timeout ignored; call @remove_multi_response_listener(mesg.id) to remove
            cb      : undefined

        if not opts.mesg.id?
            opts.mesg.id = uuid.v4()

        @local_hub_socket (err, socket) =>
            if err
                opts.cb?(err)
                return
            socket.write_mesg 'json', opts.mesg
            if opts.multi_response
                @_multi_response[opts.mesg.id] = opts.cb
            else
                socket.recv_mesg
                    type    : 'json'
                    id      : opts.mesg.id
                    timeout : opts.timeout
                    cb      : (mesg) =>
                        if mesg.event == 'error'
                            opts.cb(true, mesg.error)
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
                winston.debug("getting new socket to a local_hub")
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
                winston.debug("Send the message asking to be connected with a #{opts.type} session.")
                socket.write_mesg('json', mesg)
                # Now we wait for a response for opt.timeout seconds
                f = (type, resp) =>
                    clearTimeout(timer)
                    winston.debug("Getting #{opts.type} session -- get back response type=#{type}, resp=#{to_json(resp)}")
                    if resp.event == 'error'
                        cb(resp.error)
                    else
                        # We will now only use this socket for binary communications.
                        misc_node.disable_mesg(socket)
                        cb()
                socket.once 'mesg', f
                timed_out = () =>
                    socket.removeListener('mesg', f)
                    socket.end()
                    cb("Timed out after waiting #{opts.timeout} seconds for response from #{opts.type} session server. Please try again later.")
                timer = setTimeout(timed_out, opts.timeout*1000)

        ], (err) =>
            if err
                winston.debug("Error getting a socket -- (declaring total disaster) -- #{err}")
                # This @_socket.destroy() below is VERY important, since just deleting the socket might not send this,
                # and the local_hub -- if the connection were still good -- would have two connections
                # with the global hub, thus doubling sync and broadcast messages.  NOT GOOD.
                @_socket?.destroy()
                delete @_status; delete @_socket

            else if socket?
                @_sockets[opts.session_uuid] = socket
                socket.history = undefined
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
                #  over one single SockJS connection.)
                channel = opts.client.register_data_handler (data)->
                    if not ignore
                        console_socket.write(data)

                mesg = message.session_connected
                    session_uuid : opts.session_uuid
                    data_channel : channel
                opts.cb(false, mesg)

                history = console_socket.history

                # console --> client:
                # When data comes in from the socket, we push it on to the connected
                # client over the channel we just created.
                if history?
                    opts.client.push_data_to_client(channel, history)
                    console_socket.on 'data', (data) ->
                        opts.client.push_data_to_client(channel, data)

                        # Record in database that there was activity in this project.
                        # This is *way* too frequent -- a tmux session make it always on for no reason.
                        # database.touch_project(project_id:opts.project_id)

                else
                    console_socket.history = ''
                    console_socket.on 'data', (data) ->
                        console_socket.history += data
                        n = console_socket.history.length
                        if n > 400000   # TODO: totally arbitrary; also have to change the same thing in local_hub.coffee
                            console_socket.history = console_socket.history.slice(300000)

                        # Never push more than 20000 characters at once to client, since display is slow, etc.
                        if data.length > 20000
                            data = "[...]"+data.slice(data.length-20000)

                        opts.client.push_data_to_client(channel, data)

                        # See comment above.
                        #database.touch_project(project_id:opts.project_id)


    #########################################
    # CodeMirror sessions
    #########################################
    # Return a CodeMirrorSession object corresponding to the given session_uuid or path.
    get_codemirror_session: (opts) =>
        opts = defaults opts,
            session_uuid : undefined   # give at least one of the session uuid or path
            project_id   : undefined
            path         : undefined
            cb           : required    # cb(err, session)
        if opts.session_uuid?
            session = codemirror_sessions.by_uuid[opts.session_uuid]
            if session?
                opts.cb(false, session)
                return
        if opts.path? and opts.project_id?
            session = codemirror_sessions.by_path[opts.project_id + opts.path]
            if session?
                opts.cb(false, session)
                return
        if not (opts.path? and opts.project_id?)
            opts.cb("reconnect")  # caller should  send path when it tries next.
            return

        # Create a new session object.
        new CodeMirrorSession
            local_hub   : @
            project_id  : opts.project_id
            path        : opts.path
            cb          : opts.cb

    #########################################
    # Sage sessions -- TODO!
    #########################################

    sage_session:  (opts) =>
        opts = defaults opts,
            session_uuid : undefined
            path         : undefined
            cb           : required
        # TODO!!!

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

    # TODO:
    #
    #    file_editor_session -- for multiple simultaneous file editing, etc.
    #
    #    worksheet_session -- build on a sage session to have multiple simultaneous worksheet users

    # Open connection to the remote local_hub if it is not already opened,
    # and setup everything so we have a persistent ssh connection
    # between some port on localhost and the remote account, over
    # which all the action happens.
    # The callback gets called via "cb(err, port, secret_token)"; if err=false, then
    # port is supposed to be a valid port portforward to a local_hub somewhere.
    open: (cb) =>    # cb(err, port, secret_token)
        winston.debug("opening a local_hub: #{@id}")
        if @_status? and @_status.local_port? and @_status.secret_token?
            # TODO: check here that @_port is actually still open and valid...
            cb(false, @_status.local_port, @_status.secret_token)
            return

        # Lock so that we don't attempt to open connection more than
        # once at the same time.
        if @_opening?
            n = 0
            check = () =>
                n += 1
                if n >= 100 # 10 seconds max
                    clearInterval(timer)
                    cb("Timed out waiting for project to open.")
                    return
                if not @_opening?
                    clearInterval(timer)
                    @open(cb)
                    return
            timer = setInterval(check, 100)
            return

        # Now open the project.
        @_opening = true
        status   = undefined
        async.series([
            (cb) =>
                @_push_local_hub_code(cb)
            (cb) =>
                @_get_local_hub_status (err, _status) =>
                    @_status = _status
                    cb(err)
            (cb) =>
                if not @_status.installed
                    @_exec_on_local_hub
                        command : 'build'
                        timeout : 360
                        cb      : cb
                else
                    cb()
            (cb) =>
                # If all goes well, the following will make it so @_status
                # is defined and says all is well.
                @_restart_local_hub_if_not_all_daemons_running(cb)
            (cb) =>
                if @_status.local_port
                    cb()
                else
                    if @_status['local_hub.port']
                        misc_node.forward_remote_port_to_localhost
                            username    : @username
                            host        : @host
                            ssh_port    : @port
                            remote_port : @_status['local_hub.port']
                            cb          : (err, local_port) =>
                                @_status.local_port = local_port
                                cb(err)
                    else
                        cb("Unable to start local_hub daemon on #{@address}")

        ], (err) =>
            delete @_opening
            if err
                cb(err)
            else
                cb(false, @_status.local_port, @_status.secret_token)
        )


    _push_local_hub_code: (cb) =>
        winston.debug("pushing latest code to #{@address}")
        tm = misc.walltime()
        output = ''
        async.series([
            (cb) =>
                misc_node.execute_code
                    command : "rsync"
                    args    : ['-axHL', '-e', "ssh -o StrictHostKeyChecking=no -p #{@port}",
                               'local_hub_template/', '--exclude=node_modules/*', "#{@address}:~#{@username}/.sagemathcloud/"]
                    timeout : 60
                    bash    : false
                    path    : SALVUS_HOME
                    cb      : (err, out) =>
                        if err
                            cb(err)
                        else
                            output += out.stdout + '\n' + out.stderr
                            cb()

            (cb) =>
                misc_node.execute_code
                    command : "rsync"
                    args    : ['-axH', '-e', "ssh -o StrictHostKeyChecking=no -p #{@port}",
                               'local_hub_template/node_modules/', "#{@address}:~#{@username}/.sagemathcloud/node_modules/"]
                    timeout : 60
                    bash    : false
                    path    : SALVUS_HOME
                    cb      : (err, out) =>
                        if err
                            cb(err)
                        else
                            output += out.stdout + '\n' + out.stderr
                            cb()
            ], (err) =>
                winston.debug("time to rsync latest code to #{@address}: #{misc.walltime(tm)} seconds -- #{err}")
                cb(err, output)
            )

    _exec_on_local_hub: (opts) =>
        opts = defaults opts,
            command : required
            timeout : 30
            dot_sagemathcloud_path : true
            cb      : required

        if opts.dot_sagemathcloud_path
            opts.command = "~#{@username}/.sagemathcloud/#{opts.command}"

        if @_restart_lock
            opts.cb("_restart_lock..."); return

        # ssh [user]@[host] [-p port] .sagemathcloud/[commmand]
        tm = misc.walltime()
        misc_node.execute_code
            command : "ssh"
            args    : [@address, '-p', @port, '-o', 'StrictHostKeyChecking=no', opts.command]
            timeout : opts.timeout
            bash    : false
            cb      : (err, output) =>
                winston.debug("time to exec #{opts.command} on local hub: #{misc.walltime(tm)}") #; output=#{misc.to_json(output)}")
                opts.cb(err, output)

    _get_local_hub_status: (cb) =>
        winston.debug("getting status of remote location")
        @_exec_on_local_hub
            command : "status"
            timeout  : 10
            cb      : (err, out) =>
                if out?.stdout?
                    status = misc.from_json(out.stdout)
                cb(err, status)

    _restart_local_hub_daemons: (cb) =>
        winston.debug("restarting local_hub daemons")
        @_exec_on_local_hub
            command : "restart_smc"
            timeout : 30
            cb      : (err, out) =>
                cb(err)

    killall: (cb) =>
        winston.debug("kill all processes running on a local hub (including the local hub itself)")
        @_exec_on_local_hub
            command : "pkill -9 -u #{@username}"  # pkill is *WAY better* than killall (which evidently does not work in some cases)
            dot_sagemathcloud_path : false
            timeout : 30
            cb      : (err, out) =>
                winston.debug("killall returned -- #{err}, #{misc.to_json(out)}")
                # We explicitly ignore errors since killall kills self while at it.
                cb()

    _restart_local_hub_if_not_all_daemons_running: (cb) =>
        if @_status.local_hub and @_status.sage_server and @_status.console_server
            cb()
        else
            # Not all daemons are running -- restart required
            @_restart_local_hub_daemons (err) =>
                if err
                    cb(err)
                else
                    # try one more time:
                    @_get_local_hub_status (err,_status) =>
                        @_status = _status
                        cb(err)


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
                @local_hub_socket (err, _socket) ->
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
                socket.recv_mesg type: 'blob', id:data_uuid, timeout:60, cb:(_data) ->
                    data = _data
                    data.archive = result_archive
                    cb()

        ], (err) ->
            if err
                cb(err)
            else
                cb(false, data)
        )

    # Write a file
    write_file: (opts) -> # cb(err)
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
                @local_hub_socket (err, _socket) ->
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
                socket.recv_mesg type: 'json', id:id, timeout:10, cb:(mesg) ->
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

# Get the location of the given project, or if it isn't located somewhere,
# then deploy it and report back the location when done deploying.
# Use database.get_project_location to get the project location without deploying.

get_project_location = (opts) ->
    opts = defaults opts,
        project_id  : required
        allow_cache : false
        cb          : undefined       # cb(err, location)
        attempts    : 50
    winston.debug
    if not attempts?
        attempts = 50

    error = true
    location = undefined

    async.series([
        (cb) ->
            database.get_project_location
                project_id  : opts.project_id
                allow_cache : opts.allow_cache
                cb          : (err, _location) =>
                    location = _location
                    if err
                        cb(err)
                    else if location == "deploying"
                        winston.debug("get_project_location: another hub is currently deploying #{opts.project_id}")
                        # Another hub or "thread" of this hub is currently deploying
                        # the project.  We keep querying every few seconds until this changes.
                        if opts.attempts <= 0
                            cb("failed to deploy project (too many attempts)")
                        else
                            winston.debug("get_project_location -- try again in 10 seconds (attempts=#{attempts}).")
                            f = () ->
                                get_project_location
                                    project_id  : opts.project_id
                                    allow_cache : opts.allow_cache
                                    cb          : opts.cb
                                    attempts    : opts.attempts-1
                            setTimeout(f, 10000)
                            error = false
                            cb(true)
                    else if location
                        error = false
                        cb(true)
                    else
                        cb() # more to do
        (cb) ->
            database.set_project_location
                project_id : opts.project_id
                location   : "deploying"
                ttl        : 360
                cb         : cb

        (cb) ->
            new_random_unix_user
                cb : (err, _location) =>
                    if err
                        cb("project location not defined -- and allocating new one led to error -- #{err}")
                        return
                    location = _location
                    cb()
        (cb) ->
            # We now initiate a restore; this blocks on getting the project object (because the location must be known to get that)
            # hence blocks letting the user do other things with the project.   I tried not locking
            # on this and it is confusing (and terrifying!) as a user to see "no files" at the beginning.
            # When I improve the UI to be clearer about what is going on, then this could be made optionally non-blocking.
            restore_project_from_most_recent_snapshot
                project_id : opts.project_id
                location   : location
                cb         : cb

        (cb) ->
            # To reduce the probability of a very rare possibility of a database race
            # condition, at this point we check to make sure the project didn't somehow
            # get deployed by another hub, which would cause database.get_project_location
            # to not return "deploying".  In this case, we instead return where that deploy
            # is, and delete the account we just made.
            database.get_project_location
                project_id  : opts.project_id
                allow_cache : false
                cb          : (err, loc) ->
                    if err
                        cb(err); return
                    if loc == "deploying"
                        # Contents in database are as expected (no race); we set new location.
                        # Finally set the project location.
                        database.set_project_location
                            project_id : opts.project_id
                            location   : location
                            cb         : cb
                    else
                        winston.debug("Project #{opts.project_id} somehow magically got deployed by another hub.")
                        # Let other project win.
                        # We absolutely don't want two hubs simultaneously believing a project
                        # is in two locations, since that would potentially lead to data loss
                        # for the user (though probably not, due to snapshots, but still!)
                        delete_unix_user
                            location : location
                            # no callback -- no point at all in waiting for this.
                        location = loc
                        cb()
        ], (err) ->
            if err  # early termination of above steps
                if error   # genuine error -- just report it
                    opts.cb?(error, err)
                else       # early term, but not an error
                    if location != 'deploying'
                        opts.cb?(false, location)
                    else
                        # do nothing -- opts.cb will get called later
            else
                # got location, the hard way
                opts.cb?(false, location)
        )

class Project
    constructor: (@project_id, cb) ->
        if not @project_id?
            throw "When creating Project, the project_id must be defined"
        winston.debug("Instantiating Project class for project with id #{@project_id}.")
        async.series([
            (cb) =>
                winston.debug("Getting project #{@project_id} location.")
                get_project_location
                    project_id  : @project_id
                    allow_cache : false
                    cb          : (err, location) =>
                        @location = location
                        winston.debug("Location of project #{@project_id} is #{misc.to_json(@location)}")
                        cb(err)

            # Get a connection to the local hub
            (cb) =>
                new_local_hub
                    username : @location.username
                    host     : @location.host
                    port     : @location.port
                    cb       : (err, hub) =>
                        if err
                            cb(err)
                        else
                            @local_hub = hub
                            cb()
            # Write the project id to the local hub unix account, since it is useful to
            # have there (for various services).
            (cb) =>
                @write_file
                    path : ".sagemathcloud/info.json"
                    project_id : @project_id
                    data       : misc.to_json(project_id:@project_id, location:@location)
                    cb         : cb
        ], (err) => cb(err, @))

    _fixpath: (obj) =>
        if obj?
            if obj.path?
                if obj.path[0] != '/'
                    obj.path = @location.path + '/' + obj.path
            else
                obj.path = @location.path

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
            timeout : 10
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


    undelete_project: (opts) =>
        opts = defaults opts,
            cb : undefined
        database.undelete_project
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

    # Return a CodeMirrorSession object corresponding to the given session_uuid
    # (if such a thing exists somewhere), or with the given path.
    get_codemirror_session: (opts) =>
        opts = defaults opts,
            session_uuid : undefined   # give at least one of the session uuid or path
            path         : undefined
            project_id   : undefined
            cb           : required
        @_fixpath(opts)
        @local_hub.get_codemirror_session(opts)

    sage_session: (opts) =>
        @_fixpath(opts.path)
        opts.project_id = @project_id
        @local_hub.sage_session(opts)

    terminate_session: (opts) =>
        opts = defaults opts,
            session_uuid : required
            cb           : undefined
        opts.project_id = @project_id
        @local_hub.terminate_session(opts)

    # Backup the project in various ways (e.g., rsync/rsnapshot/etc.)
    save: (cb) =>
        winston.debug("project2-save-stub")
        cb?()

    close: (cb) =>
        winston.debug("project2-close-stub")
        cb?()

    # TODO -- pointless, just exec on remote
    size_of_local_copy: (cb) =>
        winston.debug("project2-size_of_local_copy-stub")
        cb(false, 0)



    # move_file: (src, dest, cb) =>
    #     @exec(message.project_exec(command: "mv", args: [src, dest]), cb)

    # make_directory: (path, cb) =>
    #     @exec(message.project_exec(command: "mkdir", args: [path]), cb)

    # remove_file: (path, cb) =>
    #     @exec(message.project_exec(command: "rm", args: [path]), cb)


########################################
# Permissions related to projects
########################################
#

# Return the access that account_id has to project_id.  The
# possibilities are 'none', 'owner', 'collaborator', 'viewer'
get_project_access = (opts) ->
    opts = defaults opts,
        project_id : required
        account_id : required
        cb : required        # cb(err, mode)
    winston.debug("opts = #{misc.to_json(opts)}")
    database.select
        table : 'project_users'
        where : {project_id : opts.project_id,  account_id: opts.account_id}
        columns : ['mode']
        cb : (err, results) ->
            if err
                opts.cb(err)
            else
                if results.length == 0
                    opts.cb(false, null)
                else
                    opts.cb(false, results[0][0])

user_owns_project = (opts) ->
    opts = defaults opts,
        project_id : required
        account_id : required
        cb : required         # input: (error, result) where if defined result is true or false
    get_project_access
        project_id : opts.project_id
        account_id : opts.account_id
        cb : (err, mode) ->
            if err
                opts.cb(err)
            else
                opts.cb(false, mode == 'owner')

user_has_write_access_to_project = (opts) ->
    opts = defaults opts,
        project_id : required
        account_id : required
        cb : required        # cb(err, true or false)
    get_project_access
        project_id : opts.project_id
        account_id : opts.account_id
        cb : (err, mode) ->
            if err
                opts.cb(err)
            else
                opts.cb(false, mode in ['owner', 'collaborator'])

user_has_read_access_to_project = (opts) ->
    opts = defaults opts,
        project_id : required
        account_id : required
        cb : required        # cb(err, true or false)
    get_project_access
        project_id : opts.project_id
        account_id : opts.account_id
        cb : (err, mode) ->
            if err
                opts.cb(err)
            else
                opts.cb(false, mode != 'none')

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

    signed_in_mesg = null
    async.series([
        # POLICY 1: A given email address is allowed at most 5 failed login attempts per minute.
        (cb) ->
            database.count
                table: "failed_sign_ins_by_email_address"
                where: {email_address:mesg.email_address, time: {'>=':cass.minutes_ago(1)}}
                cb: (error, count) ->
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
                table: "failed_sign_ins_by_email_address"
                where: {email_address:mesg.email_address, time: {'>=':cass.hours_ago(1)}}
                cb: (error, count) ->
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
                table: "failed_sign_ins_by_ip_address"
                where: {ip_address:client.ip_address, time: {'>=':cass.minutes_ago(1)}}
                cb: (error, count) ->
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
                table: "failed_sign_ins_by_ip_address"
                where: {ip_address:client.ip_address, time: {'>=':cass.hours_ago(1)}}
                cb: (error, count) ->
                    if error
                        sign_in_error(error)
                        cb(true); return
                    if count > 250
                        sign_in_error("A given ip address is allowed at most 250 failed login attempts per hour. Please wait.")
                        cb(true); return
                    cb()

        # get account and check credentials
        (cb) ->
            # Do not give away info about whether the e-mail address is valid:
            error_mesg = "Invalid e-mail or password."
            database.get_account
                email_address : mesg.email_address
                cb            : (error, account) ->
                    if error
                        record_sign_in
                            ip_address    : client.ip_address
                            successful    : false
                            email_address : mesg.email_address
                        sign_in_error(error_mesg)
                        cb(true); return
                    if not is_password_correct(password:mesg.password, password_hash:account.password_hash)
                        record_sign_in
                            ip_address    : client.ip_address
                            successful    : false
                            email_address : mesg.email_address
                            account_id    : account.account_id
                        sign_in_error(error_mesg)
                        cb(true); return
                    else

                        signed_in_mesg = message.signed_in
                            id            : mesg.id
                            account_id    : account.account_id
                            first_name    : account.first_name
                            last_name     : account.last_name
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
                    account_id : signed_in_mesg.account_id
                    first_name : signed_in_mesg.first_name
                    last_name  : signed_in_mesg.last_name
                    email_address : signed_in_mesg.email_address
            cb()
    ])


# Record to the database a failed and/or successful login attempt.
record_sign_in = (opts) ->
    opts = defaults opts,
        ip_address    : required
        successful    : required
        email_address : required
        first_name    : undefined
        last_name     : undefined
        account_id    : undefined
        remember_me   : false
    if not opts.successful
        database.update
            table : 'failed_sign_ins_by_ip_address'
            set   : {email_address:opts.email_address}
            where : {time:cass.now(), ip_address:opts.ip_address}
        database.update
            table : 'failed_sign_ins_by_email_address'
            set   : {ip_address:opts.ip_address}
            where : {time:cass.now(), email_address:opts.email_address}
    else
        database.update
            table : 'successful_sign_ins'
            set   : {ip_address:opts.ip_address, first_name:opts.first_name, last_name:opts.last_name, email_address:opts.email_address, remember_me:opts.remember_me}
            where : {time:cass.now(), account_id:opts.account_id}



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

# Delete a unix user from some compute vm (as specified by location).
# NOTE: Since this can get called automatically, and there is the possibility
# of adding locations not on our VPN, if the location isn't 'localhost' or
# on the 10.x vpn, then it is an error.
delete_unix_user = (opts) ->
    opts = defaults opts,
        location : required
        timeout  : 120        # it could take a while to "rm -rf" all files?
        cb       : undefined

    if opts.location.username.length != 8
        # this is just a sort of triple check
        opts.cb?("delete_unix_user: refusing, due to suspicious username (='#{opts.location.username}') with length not 8")
        return

    misc_node.execute_code
        command     : 'ssh'
        args        : ['-o', 'StrictHostKeyChecking=no', opts.location.host, 'sudo',
                      'delete_unix_user.py', opts.location.username]
        timeout     : opts.timeout
        bash        : false
        err_on_exit : true
        cb      : (err, output) =>
            if err
                winston.debug("failed to delete unix user #{misc.to_json(opts.location)} -- #{err}")
            opts.cb?(err)

# Create a unix user with some random user name on some compute vm.
new_random_unix_user = (opts) ->
    opts = defaults opts,
        cb          : required
    cache = new_random_unix_user.cache

    if cache.length > 0
        user = cache.shift()
        opts.cb(false, user)
    else
        # Just make a user without involving the cache at all.
        new_random_unix_user_no_cache(opts)

    # Now replenish the cache for next time.
    replenish_random_unix_user_cache()

new_random_unix_user_cache_target_size = 1
if program.keyspace == "test"
    new_random_unix_user_cache_target_size = 0

new_random_unix_user.cache = []
replenish_random_unix_user_cache = () ->
    cache = new_random_unix_user.cache
    if cache.length < new_random_unix_user_cache_target_size
        winston.debug("New unix user cache has size #{cache.length}, which is less than target size #{new_random_unix_user_cache_target_size}, so we create a new account.")
        new_random_unix_user_no_cache
            cb : (err, user) =>
                if err
                    winston.debug("Failed to create a new unix user for cache -- #{err}; trying again soon.")
                    # try again in 5 seconds
                    setTimeout(replenish_random_unix_user_cache, 5000)
                else
                    winston.debug("New unix user for cache '#{misc.to_json(user)}'. Now firing up its local hub.")
                    new_local_hub
                        username : user.username
                        host     : user.host
                        port     : user.port
                        cb       : (err) =>
                            if err
                                winston.debug("Failed to create a new unix user for cache -- #{err}; trying again soon.")
                                # try again in 5 seconds
                                setTimeout(replenish_random_unix_user_cache, 5000)
                            else
                                # only save user if we succeed in starting a local hub.
                                cache.push(user)
                                winston.debug("SUCCESS -- created a new unix user for cache, which now has size #{cache.length}")
                                replenish_random_unix_user_cache()



new_random_unix_user_no_cache = (opts) ->
    opts = defaults opts,
        cb          : required
    host = undefined
    username = undefined
    async.series([
        (cb) ->
            # first get a computer on which to create an account
            database.random_compute_server
                cb  : (err, resp) ->
                    if err
                        cb(err)
                    else
                        host = resp.host
                        winston.debug("creating new unix user on #{host}")
                        cb()
        (cb) ->
            # ssh to that computer and create account using script
            misc_node.execute_code
                command : 'ssh'
                args    : ['-o', 'StrictHostKeyChecking=no', host, 'sudo', 'create_unix_user.py']
                timeout : 45
                bash    : false
                err_on_exit: true
                cb      : (err, output) =>
                    if err
                        winston.debug("failed to create new unix user on #{host} -- #{err}")
                        cb(err)
                    else
                        username = output.stdout.replace(/\s/g, '')
                        if username.length == 0
                            winston.debug("FAILED to create new user on #{host}; empty username")
                            cb("error creating user")
                        else
                            winston.debug("created new user #{username} on #{host}")
                            cb()

    ], (err) ->
        if err
            opts.cb(err)
        else
            opts.cb(false, {host:host, username:username, port:22, path:'.'})
    )

create_account = (client, mesg) ->
    id = mesg.id
    account_id = null
    async.series([
        # run tests on generic validity of input
        (cb) ->
            issues = client_lib.issues_with_create_account(mesg)

            # Do not allow *really* stupid passwords.
            [valid, reason] = is_valid_password(mesg.password)
            if not valid
                issues['password'] = reason

            # TODO -- only uncomment this for easy testing, allow any password choice
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

        # query database to determine whether the email address is available
        (cb) ->
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

        # create new account
        (cb) ->
            database.create_account(
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
                    account_id = result
                    database.log(
                        event : 'create_account'
                        value : {account_id:account_id, first_name:mesg.first_name, last_name:mesg.last_name, email_address:mesg.email_address}
                    )
                    cb()
            )

        # send message back to user that they are logged in as the new user
        (cb) ->
            mesg = message.signed_in
                id            : mesg.id
                account_id    : account_id
                remember_me   : false
                first_name    : mesg.first_name
                last_name     : mesg.last_name
                email_address : mesg.email_address
                hub           : program.host + ':' + program.port
            client.signed_in(mesg)
            client.push_to_client(mesg)
            cb()
    ])


change_password = (mesg, client_ip_address, push_to_client) ->
    account = null
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
            database.get_account(
              email_address : mesg.email_address
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
            )

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

    if mesg.old_email_address == mesg.new_email_address  # easy case
        push_to_client(message.changed_email_address(id:mesg.id))
        return

    if not client_lib.is_valid_email_address(mesg.new_email_address)
        push_to_client(message.changed_email_address(id:mesg.id, error:'email_invalid'))
        return

    async.series([
        # Make sure there hasn't been an email change attempt for this
        # email address in the last 5 seconds:
        (cb) ->
            WAIT = 5
            tracker = database.key_value_store(name:'change_email_address_tracker')
            tracker.get(
                key : mesg.old_email_address
                cb : (error, value) ->
                    if error
                        push_to_client(message.changed_email_address(id:mesg.id, error:error))
                        cb(true)
                        return
                    if value?  # is defined, so problem -- it's over
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

        # validate the password
        (cb) ->
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
            database.log(event : 'change_email_address', value : {client_ip_address : client_ip_address, old_email_address : mesg.old_email_address, new_email_address : mesg.new_email_address})

            #################################################
            # TODO: At this point, we should send an email to
            # old_email_address with a hash-code that can be used
            # to undo the change to the email address.
            #################################################

            database.change_email_address
                account_id    : mesg.account_id
                email_address : mesg.new_email_address
                cb : (error, success) ->
                    if error
                        push_to_client(message.changed_email_address(id:mesg.id, error:error))
                    else
                        push_to_client(message.changed_email_address(id:mesg.id)) # finally, success!
                    cb()
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
            database.get_account(
                email_address : mesg.email_address
                cb            : (error, account) ->
                    if error # no such account
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"No account with e-mail address #{mesg.email_address}."))
                        cb(true); return
                    else
                        cb()
            )

        # We now know that there is an account with this email address.
        # put entry in the password_reset uuid:value table with ttl of 15 minutes, and send an email
        (cb) ->
            id = database.uuid_value_store(name:"password_reset").set(
                value : mesg.email_address
                ttl   : 60*15,
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
                Somebody just requested to change the password on your SageMath cloud account.
                If you requested this password change, please change your password by
                following the link below:

                     https://cloud.sagemath.com#forgot##{id}

                If you don't want to change your password, ignore this message.
                """

            send_email
                subject : 'SageMath cloud password reset confirmation'
                body    : body
                to      : mesg.email_address
                cb      : (error) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Internal error sending password reset email to #{mesg.email_address}."))
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

# This function sends a message to the client (via push_to_client)
# with the account settings for the account with given id.  We assume
# that caller code has already determined that the user initiating
# this request has the given account_id.
get_account_settings = (mesg, push_to_client) ->
    account_settings = null
    async.series([
        # 1. Get entry in the database corresponding to this account.
        (cb) ->
            database.get_account
                account_id : mesg.account_id
                cb : (error, data) ->
                    if error
                        push_to_client(message.error(id:mesg.id, error:error))
                        cb(true) # bail
                    else
                        delete data['password_hash']

                        # 2. Set defaults for unset keys.  We do this so that in the
                        # long run it will always be easy to migrate the database
                        # forward (with new columns).
                        for key, val of message.account_settings_defaults
                            if not data[key]?
                                data[key] = val

                        account_settings = data
                        account_settings.id = mesg.id
                        cb()

        # 3. Get information about user plan
        (cb) ->
            database.get_plan
                plan_id : account_settings['plan_id']
                cb : (error, plan) ->
                    if error
                        push_to_client(message.error(id:mesg.id, error:error))
                        cb(true) # bail out
                    else
                        # TODO -- none of this is used anymore
                        account_settings.plan_name = plan.name
                        account_settings.storage_limit = plan.storage_limit
                        account_settings.session_limit = plan.session_limit
                        account_settings.max_session_time = plan.max_session_time
                        account_settings.ram_limit = plan.ram_limit
                        account_settings.support_level = plan.support_level

                        # 4. Send result to client
                        push_to_client(message.account_settings(account_settings))
                        cb() # done!
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

emailjs = require('emailjs')
email_server = null

# here's how I test this function:  require('hub').send_email(subject:'subject', body:'body', to:'wstein@gmail.com', cb:winston.debug)
exports.send_email = send_email = (opts={}) ->
    opts = defaults(opts,
        subject : required
        body    : required
        from    : 'salvusmath@gmail.com'
        to      : required
        cc      : ''
        cb      : undefined)

    async.series([
        (cb) ->
            if email_server == null
                filename = 'data/secrets/salvusmath_email_password'
                require('fs').readFile(filename, 'utf8', (error, password) ->
                    if error
                        winston.info("Unable to read the file '#{filename}', which is needed to send emails.")
                        opts.cb(error)
                    email_server  = emailjs.server.connect(
                       user     : "salvusmath"
                       password : password
                       host     : "smtp.gmail.com"
                       ssl      : true
                    )
                    cb()
                )
            else
                cb()
        (cb) ->
            email_server.send(
               text : opts.body
               from : opts.from
               to   : opts.to
               cc   : opts.cc
               subject : opts.subject,
            opts.cb)
            cb()
    ])



########################################
# Blobs
########################################

MAX_BLOB_SIZE = 12000000
MAX_BLOB_SIZE_HUMAN = "12MB"

save_blob = (opts) ->
    opts = defaults opts,
        uuid  : undefined  # if not given, is generated; function always returns the uuid that was used
        #value : required   # NOTE: value *must* be a Buffer.
        value : undefined
        cb    : required   # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl
        ttl   : undefined  # object in blobstore will have *at least* this ttl in seconds; if there is already something,  in blobstore with longer ttl, we leave it; undefined = infinite ttl

    if not opts.value?
        err = "BUG -- error in call to save_blob (uuid=#{opts.uuid}); received a save_blob request with undefined value"
        winston.debug(err)
        opts.cb(err)
        return

    if opts.value.length > MAX_BLOB_SIZE
        opts.cb("blobs are limited to #{MAX_BLOB_SIZE_HUMAN} and you just tried to save one of size #{opts.value.length/1000000}MB")
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
                ttl = opts.ttl
                if not ttl?
                    ttl = 0
                f = opts.cb
                opts.cb = (err) -> f(err, ttl)
                db.set(opts)

get_blob = (opts) ->
    opts = defaults opts,
        uuid : required
        cb   : required
    database.uuid_blob_store(name:"blobs").get(opts)

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

# The ping timer for compute sessions is very simple:
#     - an attribute 'last_ping_time', which client code must set periodicially
#     - the input session must have a kill() method
#     - an interval timer
#     - if the timeout option is set to 0, the ping timer is not activated

# This is the time in *seconds* until a session that not being actively pinged is killed.
# This is a global var, since it must be
DEFAULT_SESSION_KILL_TIMEOUT = 3 * client_lib.DEFAULT_SESSION_PING_TIME

enable_ping_timer = (opts) ->
    opts = defaults opts,
        session : required
        timeout : DEFAULT_SESSION_KILL_TIMEOUT    # time in *seconds* until session not being actively pinged is killed

    if not opts.timeout
        # do nothing -- this will keep other code cleaner
        return

    opts.session.last_ping_time = new Date()

    timer = undefined
    check_for_timeout = () ->
        d = ((new Date()) - opts.session.last_ping_time )/1000
        if  d > opts.timeout
            clearInterval(timer)
            opts.session.kill()

    timer = setInterval(check_for_timeout, opts.timeout*1000)

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
connect_to_database = (cb) ->
    if database? # already did this
        cb(); return
    new cass.Salvus
        hosts    : program.database_nodes.split(',')
        keyspace : program.keyspace
        cb       : (err, _db) ->
            database = _db
            cb(err)


#############################################
# Start everything running
#############################################
exports.start_server = start_server = () ->
    # the order of init below is important
    init_http_server()
    init_http_proxy_server()
    winston.info("Using Cassandra keyspace #{program.keyspace}")
    hosts = program.database_nodes.split(',')

    # Once we connect to the database, start serving.
    connect_to_database (err) ->
        if err
            winston.debug("Failed to connect to database!")
            return

        # start updating stats cache every minute (on every hub)
        update_server_stats(); setInterval(update_server_stats, 60*1000)
        register_hub(); setInterval(register_hub, REGISTER_INTERVAL_S*1000)

        init_sockjs_server()
        init_stateless_exec()
        http_server.listen(program.port, program.host)
        winston.info("Started hub. HTTP port #{program.port}; keyspace #{program.keyspace}")

#############################################
# Process command line arguments
#############################################
program.usage('[start/stop/restart/status/nodaemon] [options]')
    .option('--port <n>', 'port to listen on (default: 5000)', parseInt, 5000)
    .option('--proxy_port <n>', 'port that the proxy server listens on (default: 5001)', parseInt, 5001)
    .option('--log_level [level]', "log level (default: INFO) useful options include WARNING and DEBUG", String, "INFO")
    .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', String, "data/pids/hub.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', String, "data/logs/hub.log")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "test")', String, 'test')
    .option('--passwd [email_address]', 'Reset password of given user', String, '')
    .parse(process.argv)

console.log(program._name)
if program._name.slice(0,3) == 'hub'
    # run as a server/daemon (otherwise, is being imported as a library)
    if program.rawArgs[1] in ['start', 'restart']
        process.addListener "uncaughtException", (err) ->
            winston.debug("BUG ****************************************************************************")
            winston.debug("Uncaught exception: " + err)
            winston.debug(new Error().stack)
            winston.debug("BUG ****************************************************************************")

    if program.passwd
        console.log("Resetting password")
        reset_password program.passwd, (err) -> process.exit()
    else
        console.log("Running web server; pidfile=#{program.pidfile}")
        daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)
