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
##############################################################################


SALVUS_HOME=process.cwd()

REQUIRE_ACCOUNT_TO_EXECUTE_CODE = false

# node.js -- builtin libraries
net     = require 'net'
assert  = require('assert')
http    = require 'http'
url     = require 'url'
fs      = require 'fs'
{EventEmitter} = require 'events'

mime    = require('mime')

# salvus libraries
sync_obj = require('sync_obj')
sage    = require("sage")               # sage server
misc    = require("misc")
{defaults, required} = require 'misc'
message = require("message")     # salvus message protocol
cass    = require("cassandra")
client_lib = require("client")
JSON_CHANNEL = client_lib.JSON_CHANNEL

misc_node = require 'misc_node'

to_json = misc.to_json
to_safe_str = misc.to_safe_str
from_json = misc.from_json

# third-party libraries: add any new nodejs dependencies to the NODEJS_PACKAGES list in build.py
async   = require("async")
program = require('commander')          # command line arguments -- https://github.com/visionmedia/commander.js/
daemon  = require("start-stop-daemon")  # daemonize -- https://github.com/jiem/start-stop-daemon
winston = require('winston')            # logging -- https://github.com/flatiron/winston
sockjs  = require("sockjs")             # websockets (+legacy support) -- https://github.com/sockjs/sockjs-node
uuid    = require('node-uuid')

Cookies = require('cookies')            # https://github.com/jed/cookies


diffsync = require('diffsync')


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
            else
                res.end('hub server')

    )

    http_server.on('close', clean_up_on_shutdown)


#############################################################
# Client = a client that is connected via sockjs to the hub
#############################################################
class Client extends EventEmitter
    constructor: (@conn) ->
        @_data_handlers = {}
        @_data_handlers[JSON_CHANNEL] = @handle_json_message_from_client

        @ip_address = @conn.remoteAddress

        # A unique id -- can come in handy
        @id = uuid.v4()

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

        @conn.on("data", @handle_data_from_client)
        @conn.on "close", () =>
            @compute_session_uuids = []
            delete clients[@conn.id]


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
        winston.debug("hub --> client (#{@account_id}): #{misc.trunc(to_safe_str(mesg),300)}") if mesg.event != 'pong'
        @push_data_to_client(JSON_CHANNEL, to_json(mesg))

    push_data_to_client: (channel, data) ->
        @conn.write(channel + data)

    error_to_client: (opts) ->
        opts = defaults opts,
            id    : required
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
        # Regarding ttl, we use 1 week.  The database will forget
        # the cookie automatically at the same time that the
        # browser invalidates it.
        #############################################################

        opts = defaults opts,
            account_id    : required
            first_name    : required
            last_name     : required
            email_address : required

        opts.remember_me = true
        signed_in_mesg   = message.signed_in(opts)
        session_id       = uuid.v4()
        @hash_session_id = password_hash(session_id)
        ttl              = 7*24*3600     # 7 days

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
        if data.length >= 10000000  # 10 MB
            @push_to_client(message.error(error:"Messages are limited to 10MB.", id:mesg.id))

        if data.length == 0
            winston.error("EMPTY DATA MESSAGE -- ignoring!")
            return

        channel = data[0]
        h = @_data_handlers[channel]
        if h?
            h(data.slice(1))
        else
            winston.error("unable to handle data on an unknown channel: '#{channel}', '#{data}'")

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
        if mesg.event.slice(0,4) != 'ping'
            winston.debug("client --> hub: #{misc.trunc(to_safe_str(mesg), 300)}")
        handler = @["mesg_#{mesg.event}"]
        if handler?
            handler(mesg)
        else
            @push_to_client(message.error(error:"The Salvus hub does not know how to handle a '#{mesg.event}' event.", id:mesg.id))

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
        # mesg -- must have project_id field; if has id fields, an error is sent to the client with that id tagged on.
        # permission -- must be "read" or "write"
        # cb -- takes one argument:  cb(project); called *only* on success;
        #       on failure, client will receive a message.

        if not mesg.project_id?
            cb("mesg must have project_id attribute -- #{to_safe_str(mesg)}")
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
                database.touch_project(project_id:mesg.project_id)
                new_project mesg.project_id, (err, _project) =>
                    project = _project
                    cb(err)
        ], (err) =>
                if err
                    if mesg.id?
                        @error_to_client(id:mesg.id, error:err)
                    cb(err)
                else
                    cb(false, project)
        )

    mesg_create_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to create a new project.")
            return

        project_id = uuid.v4()
        project = undefined

        async.series([
            # create project in database
            (cb) =>
                database.create_project
                    project_id  : project_id
                    account_id  : @account_id
                    title       : mesg.title
                    description : mesg.description
                    public      : mesg.public
                    location    : mesg.location
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

    mesg_project_session_info: (mesg) =>
        assert mesg.event == 'project_session_info'
        @get_project mesg, 'read', (err, project) =>
            if err
                @error_to_client(id:mesg.id, error:err)
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
                        # Store content in uuid:blob store and provide a temporary (valid for 10 minutes) link to it.
                        u = uuid.v4()
                        save_blob uuid:u, value:content.blob, ttl:600, cb:(err) =>
                            if err
                                @error_to_client(id:mesg.id, error:err)
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
                mesg : mesg
                cb   : (err, resp) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(resp)

    ################################################
    # Blob Management
    ################################################
    mesg_save_blobs_to_project: (mesg) =>
        user_has_write_access_to_project
            project_id : mesg.project_id
            account_id : @account_id
            cb : (err, t) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else if not t
                    @error_to_client(id:mesg.id, error:"Cannot save blobs, since user does not have write access to this project.")
                else
                    save_blobs_to_project
                        project_id : mesg.project_id
                        blob_ids   : mesg.blob_ids
                        cb         : (err) =>
                            if err
                                @error_to_client(id:mesg.id, error:err)
                            else:
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
                        snapshot = session.get_snapshot()
                        # We add the client, so it will gets messages
                        # about changes to the document.
                        session.add_client(@, snapshot)
                        # Send parameters of session to client
                        mesg = message.codemirror_session
                            id           : mesg.id
                            session_uuid : session.session_uuid
                            path         : session.path
                            chat         : session.chat
                            content      : snapshot
                        @push_to_client(mesg)

    get_codemirror_session : (mesg, cb) =>
        session = codemirror_sessions.by_uuid[mesg.session_uuid]
        if not session?
            @push_to_client(message.reconnect(id:mesg.id, reason:"Global hub does not know about a codemirror session with session_uuid='#{mesg.session_uuid}'"))
            cb("CodeMirror session got lost / dropped / or is known to client but not this hub")
        else
            cb(false, session)

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

codemirror_sessions = {by_path:{}, by_uuid:{}}

# The CodeMirrorDiffSyncLocalHub class represents a local hub viewed
# as a remote server for this hub.
#
# TODO later: refactor code, since it seems like all these
# DiffSync[Hub/Client] etc. things are defined by a write_mesge function.
#
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
                cb(err)
            else if mesg.event == 'error'
                cb(mesg.error)
            else
                @cm_session.diffsync_server.recv_edits(mesg.edit_stack, mesg.last_version_ack, (err) =>
                    @cm_session.set_content(@cm_session.diffsync_server.live)
                    cb(err))

    sync_ready: () =>
        @write_mesg('diffsync_ready')

# The CodeMirrorDiffSyncClient class represents a browser client viewed as a
# remote client for this local hub.
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
            session_uuid : required
            path         : required
            content      : required
            chat         : required

        @local_hub    = opts.local_hub
        @session_uuid = opts.session_uuid
        @path         = opts.path
        @chat         = opts.chat

        # Our upstream server (the local hub)
        @diffsync_server = new diffsync.DiffSync(doc:opts.content)
        @diffsync_server.connect(new CodeMirrorDiffSyncLocalHub(@))

        # The downstream clients of this hub
        @diffsync_clients = {}

    reconnect: (cb) =>
        delete codemirror_sessions.by_uuid[@session_uuid]
        @local_hub.call
            mesg : message.codemirror_get_session(path:@path)
            cb   : (err, resp) =>
                if err
                    cb?(err)
                else if resp.event == 'error'
                    cb?(resp.error)
                else
                    @session_uuid = resp.session_uuid
                    codemirror_sessions.by_uuid[@session_uuid] = @

                    # Reconnect to the upstream (local_hub) server, reset live to what we have now.
                    content = @diffsync_server.live
                    @diffsync_server = new diffsync.DiffSync(doc:resp.content)
                    @diffsync_server.connect(new CodeMirrorDiffSyncLocalHub(@))
                    @diffsync_server.live = content

                    # Forget our downstream clients -- they will get reconnect messages, and keep
                    # going fine without no noticed side effect!
                    @diffsync_clients = {}

                    # Sync with upstream.
                    @sync(cb)


    set_content: (content) =>
        @diffsync_server.live = content
        for id, ds of @diffsync_clients
            ds.live = content

    client_broadcast: (client, mesg) =>
        # Broadcast message from some client reporting something (e.g., cursor position, chat, etc.)
        ds_client = @diffsync_clients[client.id]
        if not ds_client?
            return # something wrong -- just drop the message

        winston.debug("client_broadcast: #{misc.to_json(mesg)}")

        # We tag the broadcast message, in order to make it more useful to recipients (but do not
        # go so far as to advertise the account_id or email)..

        # 1. Fill in the user's name
        if client.signed_in_mesg?
            mesg.name = client.fullname()
            # Use first 6 digits of uuid... one color per session, NOT per username.
            # TODO: this could be done client side in a way that respects their color scheme...?
            mesg.color = client.id.slice(0,6)

        # If this is a chat message, also fill in the time and store it.
        if mesg.mesg?.event == 'chat'
            # This is weird, but it does do-JSON to a string t so that 'new Date(t)' works.
            s = misc.to_json(new Date())
            mesg.date = s.slice(1, s.length-1)
            @chat.push   # what is saved is also defined in local_hub.coffee in save method of ChatRecorder.
                name  : mesg.name
                color : mesg.color
                date  : mesg.date
                mesg  : mesg.mesg

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



    client_diffsync: (client, mesg) =>
        # Message from some client reporting new edits; we apply them,
        # generate new edits, and send those out so that the client
        # can complete the sync cycle.
        ds_client = @diffsync_clients[client.id]
        if not ds_client?
            client.push_to_client(message.reconnect(id:mesg.id, reason:"Client with id #{client.id} is not registered with this hub."))
            return

        before = @diffsync_server.live
        ds_client.recv_edits    mesg.edit_stack, mesg.last_version_ack, (err) =>
            @set_content(ds_client.live)
            changed = (before != @diffsync_server.live)

            # Propagate new live state to other clients -- TODO: there
            # should just be one live document shared instead of a
            # bunch of copies.
            for id, ds of @diffsync_clients
                if client.id != id
                    ds.live = @diffsync_server.live   # TODO -- should be automatic once the .live's all reference the same thing
                    if changed  # suggest a resync
                        ds.remote.sync_ready()

            # Sync new state with upstream local_hub
            @sync()

            # Respond
            if err
                client.error_to_client(id:mesg.id, error:"CodeMirrorSession -- unable to push diffsync changes -- #{err}")
                return

            # Now send back our own edits to this client.
            ds_client.remote.current_mesg_id = mesg.id  # used to tag the return message
            ds_client.push_edits (err) =>
                if err
                    winston.debug("CodeMirrorSession -- push_edits returned -- #{err}")

    get_snapshot: () =>
        return @diffsync_server.live  # TODO -- only ok now since is a string and not a reference...

    broadcast_mesg_to_clients: (mesg, exclude_id) =>
        for id, ds of @diffsync_clients
            if id != exclude_id
                ds.remote.send_mesg(mesg)

    sync: (cb) =>
        if @_upstream_sync_lock? and @_upstream_sync_lock
            return

        @_upstream_sync_lock = true
        before = @diffsync_server.live
        @diffsync_server.push_edits (err) =>
            @_upstream_sync_lock = false
            if err
                winston.debug("Error pushing codemirror changes to upstream -- reconnecting")
                @reconnect(cb)
            else
                if before != @diffsync_server.live
                    # Tell the clients that content has changed due to an upstream sync, so they may want to sync again.
                    for id, ds of @diffsync_clients
                        ds.remote.sync_ready()
                cb?()

    add_client: (client, snapshot) =>  # snapshot = a snapshot of the document that client and server start with -- MUST BE THE SAME!
        # Add a new diffsync browser client.
        ds_client = new diffsync.DiffSync(doc:snapshot)
        ds_client.connect(new CodeMirrorDiffSyncClient(client, @))
        @diffsync_clients[client.id] = ds_client

    write_to_disk: (client, mesg) =>
        @local_hub.call
            mesg : message.codemirror_write_to_disk(session_uuid : @session_uuid)
            cb   : (err, resp) =>
                if err
                    @reconnect () =>
                        resp = message.reconnect(id:mesg.id, reason:"Error writing to disk -- #{err} -- reconnecting")
                        client.push_to_client(resp)
                else
                    resp.id = mesg.id
                    client.push_to_client(resp)

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

##############################
# LocalHub
##############################

connect_to_a_local_hub = (opts) ->    # opts.cb(err, socket)
    opts = defaults opts,
        port         : required
        secret_token : required
        cb           : required

    socket = misc_node.connect_to_locked_socket
        port  : opts.port
        token : opts.secret_token
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
        assert @username? and @host? and @port? and cb?
        @address = "#{username}@#{host}"
        @id = "#{@address} -p#{@port}"  # string that uniquely identifies this local hub -- useful for other code, e.g., sessions
        @_sockets = {}
        @local_hub_socket  (err,socket) =>
            if err
                cb("Unable to start and connect to local hub #{@address} -- #{err}")
            else
                cb(false, @)

    # Send a JSON message to a session.
    # NOTE -- This makes no sense for console sessions, since they use a binary protocol,
    # but makes sense for other sessions.
    send_message_to_session: (opts) =>
        opts = defaults opts,
            message      : required
            session_uuid : required
            cb           : undefined   # cb(err)

        socket = @_sockets[opts.session_uuid]
        if not socket?
            opts.cb("Session #{opts.session_uuid} is no longer open.")
            return
        try
            socket.write_mesg('json', opts.message)
            opts.cb()
        catch e
            opts.cb("Errro sending message to session #{opts.session_uuid} -- #{e}")


    # handle incoming JSON messages from the local_hub that do *NOT* have an id tag
    handle_mesg: (mesg) =>
        if mesg.id?
            return # handled elsewhere
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

    # The standing authenticated control socket to the remote local_hub daemon.
    local_hub_socket: (cb) =>
        if @_socket?
            cb(false, @_socket)
            return
        @new_socket (err, socket) =>
            if err
                cb(err)
            else
                @_socket = socket

                socket.on 'mesg', (type, mesg) =>
                    @handle_mesg(mesg)

                socket.on 'end', () =>
                    delete @_status
                    delete @_socket

                cb(false, @_socket)

    # Get a new socket connection to the local_hub; this socket will have been
    # authenticated via the secret_token, and enhanced to be able to
    # send/receive json and blob messages.
    new_socket: (cb, retries) =>     # cb(err, socket)
        if not retries?
            retries = 0
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
                        if retries > 1
                            cb(err)
                        else
                            delete @_status
                            @new_socket(cb, retries + 1)

    call: (opts) =>
        opts = defaults opts,
            mesg    : required
            timeout : 10
            cb      : undefined

        if not opts.mesg.id?
            opts.mesg.id = uuid.v4()

        @local_hub_socket (err, socket) ->
            if err
                opts.cb?(err)
                return
            socket.write_mesg 'json', opts.mesg
            socket.recv_mesg type:'json', id:opts.mesg.id, timeout:opts.timeout, cb:(mesg) ->
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
            timeout      : 5
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
                # TODO -- declare total disaster !? -- start over with next connection attempt.
                winston.debug("Error getting a socket -- (declaring total disaster) -- #{err}")
                delete @_status; delete @_socket
            else if socket?
                @_sockets[opts.session_uuid] = socket
                socket.history = ''
            opts.cb(err, socket)
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

                console_socket.on 'end', () =>
                    delete @_sockets[opts.session_uuid]

                # Plug the two consoles together
                #
                # client --> console:
                # Create a binary channel that the client can use to write to the socket.
                # (This uses our system for multiplexing JSON and multiple binary streams
                #  over one single SockJS connection.)
                channel = opts.client.register_data_handler (data)->
                    console_socket.write(data)

                mesg = message.session_connected
                    session_uuid : opts.session_uuid
                    data_channel : channel
                opts.cb(false, mesg)

                history = console_socket.history

                # console --> client:
                # When data comes in from the socket, we push it on to the connected
                # client over the channel we just created.
                console_socket.on 'data', (data) ->
                    console_socket.history += data
                    n = console_socket.history.length
                    if n > 15000   # TODO: totally arbitrary; also have to change the same thing in local_hub.coffee
                        console_socket.history = console_socket.history.slice(10000)
                    opts.client.push_data_to_client(channel, data)

                opts.client.push_data_to_client(channel, history)

    #########################################
    # CodeMirror sessions
    #########################################
    # Return a CodeMirrorSession object corresponding to the given session_uuid or path.
    get_codemirror_session: (opts) =>
        opts = defaults opts,
            session_uuid : undefined   # give at least one of the session uuid or filename
            project_id   : undefined
            path         : undefined
            cb           : required    # cb(err, session)
        if opts.session_uuid?
            session = codemirror_sessions.by_uuid[opts.session_uuid]
            if session?
                opts.cb(false, session)
                return
        if opts.path?
            session = codemirror_sessions.by_path[opts.path]
            if session?
                opts.cb(false, session)
                return
        # Create a new session object.
        @call
            mesg : message.codemirror_get_session(session_uuid:opts.session_uuid, project_id:opts.project_id, path:opts.path)
            cb   : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    session = new CodeMirrorSession
                        local_hub    : @
                        session_uuid : resp.session_uuid
                        path         : resp.path
                        content      : resp.content
                        chat         : resp.chat
                    codemirror_sessions.by_uuid[resp.session_uuid] = session
                    codemirror_sessions.by_path[resp.path] = session
                    opts.cb(false, session)

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
        winston.debug("Opening a local_hub.")
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
                @_get_local_hub_status (err,_status) =>
                    @_status = _status
                    cb(err)
            (cb) =>
                if not @_status.installed
                    @_exec_on_local_hub('build', 120, cb)
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
        winston.debug("pushing latest code to remote location")
        misc_node.execute_code
            command : "rsync"
            args    : ['-axHL', '-e', "ssh -o StrictHostKeyChecking=no -p #{@port}",
                       'local_hub_template/', "#{@address}:~#{@username}/.sagemathcloud/"]
            timeout : 15
            bash    : false
            path    : SALVUS_HOME
            cb      : cb

    _exec_on_local_hub: (command, timeout, cb) =>
        # ssh [user]@[host] [-p port] .sagemathcloud/[commmand]
        misc_node.execute_code
            command : "ssh"
            args    : [@address, '-p', @port, '-o', 'StrictHostKeyChecking=no', "~#{@username}/.sagemathcloud/#{command}"]
            timeout : timeout
            bash    : false
            cb      : cb

    _get_local_hub_status: (cb) =>
        winston.debug("getting status of remote location")
        @_exec_on_local_hub "status", 10, (err, out) =>
            if out?.stdout?
                status = misc.from_json(out.stdout)
            cb(err, status)

    _restart_local_hub_daemons: (cb) =>
        winston.debug("restarting local_hub daemons")
        @_exec_on_local_hub "restart_smc", 10, (err, out) =>
            cb(err)

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
            path    : required
            project_id : required
            archive : undefined   # for directories
            cb      : required

        socket    = undefined
        id        = uuid.v4()
        data      = undefined
        data_uuid = undefined

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
                socket.recv_mesg type:'json', id:id, timeout:10, cb:(mesg) =>
                    switch mesg.event
                        when 'error'
                            cb(mesg.error)
                        when 'file_read_from_project'
                            data_uuid = mesg.data_uuid
                            cb()
                        else
                            cb("Unknown mesg event '#{mesg.event}'")

            (cb) =>
                socket.recv_mesg type: 'blob', id:data_uuid, timeout:10, cb:(_data) ->
                    data = _data
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

# Connect to a local hub (using appropriate port and secret token),
# login, and enhance socket with our message protocol.


_project_cache = {}
new_project = (project_id, cb) ->   # cb(err, project)
    P = _project_cache[project_id]
    if P?
        if P == "instantiating"
            # Try again in a second. We must believe that the code
            # doing the instantiation will terminate and correctly set P.
            setTimeout((() -> new_project(project_id, cb)), 1000)
        else
            cb(false, P)
    else
        _project_cache[project_id] = "instantiating"
        start_time = misc.walltime()
        new Project(project_id, (err, P) ->
            winston.debug("new_project: time= #{misc.walltime() - start_time}")
            if err
                delete _project_cache[project_id]
            else
                _project_cache[project_id] = P
            cb(err, P)
        )

class Project
    constructor: (@project_id, cb) ->
        if not @project_id?
            throw "When creating Project, the project_id must be defined"
        winston.debug("Instantiating Project class for project with id #{@project_id}.")
        database.get_project_location
            project_id : @project_id
            cb         : (err, location) =>
                winston.debug("Location of project #{misc.to_json(location)}")
                @location = location
                new_local_hub
                    username : location.username
                    host     : location.host
                    port     : location.port
                    cb       : (err, hub) =>
                        if err
                            cb(err)
                        else
                            @local_hub = hub
                            cb(false, @)

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

    call: (opts) =>
        opts = defaults opts,
            mesg    : required
            timeout : 10
            cb      : undefined
        @_fixpath(opts.mesg)
        opts.mesg.project_id = @project_id
        @local_hub.call(opts)

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
#   * POLICY 1: A given email address is allowed at most 3 failed login attempts per minute.
#   * POLICY 2: A given email address is allowed at most 10 failed login attempts per hour.
#   * POLICY 3: A given ip address is allowed at most 10 failed login attempts per minute.
#   * POLICY 4: A given ip address is allowed at most 25 failed login attempts per hour.
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
        # POLICY 1: A given email address is allowed at most 3 failed login attempts per minute.
        (cb) ->
            database.count
                table: "failed_sign_ins_by_email_address"
                where: {email_address:mesg.email_address, time: {'>=':cass.minutes_ago(1)}}
                cb: (error, count) ->
                    if error
                        sign_in_error(error)
                        cb(true); return
                    if count > 3
                        sign_in_error("A given email address is allowed at most 3 failed login attempts per minute. Please wait.")
                        cb(true); return
                    cb()
        # POLICY 2: A given email address is allowed at most 10 failed login attempts per hour.
        (cb) ->
            database.count
                table: "failed_sign_ins_by_email_address"
                where: {email_address:mesg.email_address, time: {'>=':cass.hours_ago(1)}}
                cb: (error, count) ->
                    if error
                        sign_in_error(error)
                        cb(true); return
                    if count > 10
                        sign_in_error("A given email address is allowed at most 10 failed login attempts per hour. Please wait.")
                        cb(true); return
                    cb()

        # POLICY 3: A given ip address is allowed at most 10 failed login attempts per minute.
        (cb) ->
            database.count
                table: "failed_sign_ins_by_ip_address"
                where: {ip_address:client.ip_address, time: {'>=':cass.minutes_ago(1)}}
                cb: (error, count) ->
                    if error
                        sign_in_error(error)
                        cb(true); return
                    if count > 10
                        sign_in_error("A given ip address is allowed at most 10 failed login attempts per minute. Please wait.")
                        cb(true); return
                    cb()

        # POLICY 4: A given ip address is allowed at most 25 failed login attempts per hour.
        (cb) ->
            database.count
                table: "failed_sign_ins_by_ip_address"
                where: {ip_address:client.ip_address, time: {'>=':cass.hours_ago(1)}}
                cb: (error, count) ->
                    if error
                        sign_in_error(error)
                        cb(true); return
                    if count > 25
                        sign_in_error("A given ip address is allowed at most 25 failed login attempts per hour. Please wait.")
                        cb(true); return
                    cb()

        # get account and check credentials
        (cb) ->
            database.get_account
                email_address : mesg.email_address
                cb            : (error, account) ->
                    if error
                        record_sign_in
                            ip_address    : client.ip_address
                            successful    : false
                            email_address : mesg.email_address
                        sign_in_error(error)
                        cb(true); return
                    if not is_password_correct(password:mesg.password, password_hash:account.password_hash)
                        record_sign_in
                            ip_address    : client.ip_address
                            successful    : false
                            email_address : mesg.email_address
                            account_id    : account.account_id
                        sign_in_error("Invalid password for #{mesg.email_address}.")
                        cb(true); return
                    else

                        signed_in_mesg = message.signed_in
                            id            : mesg.id
                            account_id    : account.account_id
                            first_name    : account.first_name
                            last_name     : account.last_name
                            email_address : mesg.email_address
                            remember_me   : false

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

        # make sure this ip address hasn't requested more than 100
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
                    else if value < 100
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
#   * a given email address can be sent at most 2 password resets per hour
#   * a given ip address can send at most 3 password reset request per minute
#   * a given ip can send at most 25 per hour
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

        # POLICY 1: We limit the number of password resets that an email address can receive to at most 2 per hour
        (cb) ->
            database.count
                table   : "password_reset_attempts_by_email_address"
                where   : {email_address:mesg.email_address, time:{'>=':cass.hours_ago(1)}}
                cb      : (error, count) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    if count >= 3
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Salvus will not send more than 2 password resets to #{mesg.email_address} per hour."))
                        cb(true)
                        return
                    cb()

        # POLICY 2: a given ip address can send at most 3 password reset request per minute
        (cb) ->
            database.count
                table   : "password_reset_attempts_by_ip_address"
                where   : {ip_address:client_ip_address,  time:{'>=':cass.hours_ago(1)}}
                cb      : (error, count) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    if count >= 4
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Please wait a minute before sending another password reset request from the ip address #{client_ip_address}."))
                        cb(true); return
                    cb()


        # POLICY 3: a given ip can send at most 25 per hour
        (cb) ->
            database.count
                table : "password_reset_attempts_by_ip_address"
                where : {ip_address:client_ip_address, time:{'>=':cass.hours_ago(1)}}
                cb    : (error, count) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    if count >= 26
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"There have been too many password reset requests from #{client_ip_address}.  Wait an hour before sending any more password reset requests."))
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
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Internal Salvus error generating password reset for #{mesg.email_address}."))
                        cb(true); return
                    else
                        cb()
            )

        # send an email to mesg.email_address that has a link to
        (cb) ->
            body = """
                Somebody just requested to change the password on your Salvus account.
                If you requested this password change, please change your password by
                following the link below:

                     https://salv.us#forgot##{id}

                If you don't want to change your password, ignore this message.
                """

            send_email
                subject : 'Salvus password reset confirmation'
                body    : body
                to      : mesg.email_address
                cb      : (error) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Internal Salvus error sending password reset email to #{mesg.email_address}."))
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
                        # 2. Set defaults for unset keys.  We do this so that in the
                        # long run it will always be easy to migrate the database
                        # forward (with new columns).
                        delete data['password_hash']

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

save_blob = (opts) ->
    opts = defaults opts,
        uuid  : undefined  # if not give, is generated; function always returns the uuid that was used
        value : required   # NOTE: value *must* be a Buffer.
        ttl   : undefined
        cb    : required
    if opts.value.length >= 10000000
        # TODO: PRIMITIVE anti-DOS measure -- very important do something better later!
        opts.cb("Blobs must be at most 10MB, but you tried to store one of size #{opts.value.length} bytes")
    else
        return database.uuid_blob_store(name:"blobs").set(opts)

get_blob = (opts) ->
    opts = defaults opts,
        uuid : required
        cb   : required
    database.uuid_blob_store(name:"blobs").get(opts)


# For each element of the array blob_ids, (1) add an entry to the project_blobs
# table associated it to the given project *and* (2) remove its ttl.
# An object can only be saved to one project.
_save_blobs_to_project_cache = {}
save_blobs_to_project = (opts) ->
    opts = defaults opts,
        project_id : required
        blob_ids   : required
        cb         : required

    # ANTI-DOS measure -- don't allow more than 1000 blobs to be moved at once
    if opts.blob_ids.length > 1000
        cb("At most 1000 blobs may be saved to a project at once.")

    blob_store = database.uuid_blob_store(name:"blobs")

    tasks = []
    for id in opts.blob_ids
        if _save_blobs_to_project_cache[id]?
            continue
        tasks.push (cb) =>
            async.series([
                (cb) =>
                    # 1. Ensure there is an entry in the project_blobs table.
                    database.update
                        table : 'project_blobs'
                        where : {blob_id : id}
                        set   : {project_id : opts.project_id}
                        cb    : cb
                (cb) =>
                    # 2. Remove ttl
                    blob_store.set_ttl
                        uuid  : id
                        cb    : cb
                (cb) =>
                    # Record in a local cache that we already made
                    # this object permanent, so we'll not hit the
                    # database again for this id.
                    _save_blobs_to_project_cache[id] = null
                    cb()
            ], cb)

    # Carry out all the above tasks in parallel.
    async.parallel(tasks, opts.cb)

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
                #winston.debug("(hub) persistent_sage_conn (#{@session_uuid})-- recv(#{to_safe_str(mesg)})")
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
                    ttl   : 600  # deleted after ten minutes
                    cb    : (err) ->
                        # TODO: actually use this for something (?)
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

    kill : () =>
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
                client.compute_session_uuids.push(@session_uuid)
                cb()

        ], cb)


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
# Start everything running
#############################################
exports.start_server = start_server = () ->
    # the order of init below is important
    init_http_server()
    winston.info("Using Cassandra keyspace #{program.keyspace}")
    database = new cass.Salvus(hosts:program.database_nodes.split(','), keyspace:program.keyspace)
    init_sockjs_server()
    init_stateless_exec()
    http_server.listen(program.port, program.host)
    winston.info("Started hub. HTTP port #{program.port}; TCP port #{program.tcp_port}; keyspace #{program.keyspace}")

#############################################
# Process command line arguments
#############################################
program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 5000)', parseInt, 5000)
    .option('-t, --tcp_port <n>', 'tcp port to listen on from other tornado servers (default: 5001)', parseInt, 5001)
    .option('-l, --log_level [level]', "log level (default: INFO) useful options include WARNING and DEBUG", String, "INFO")
    .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', String, "data/pids/hub.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', String, "data/logs/hub.log")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "test")', String, 'test')
    .parse(process.argv)

if program._name == 'hub.js'
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.debug("BUG ****************************************************************************")
        winston.debug("Uncaught exception: " + err)
        winston.debug(new Error().stack)
        winston.debug("BUG ****************************************************************************")

    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)
