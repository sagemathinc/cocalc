##############################################################################
#
# This is the Salvus HUB module.  It runs as a daemon, sitting in the
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

REQUIRE_ACCOUNT_TO_EXECUTE_CODE = false

# node.js -- builtin libraries
net     = require 'net'
http    = require 'http'
url     = require 'url'
{EventEmitter} = require 'events'

mime    = require('mime')

# salvus libraries
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


#############################################################
# Client = a client that is connected via sockjs to the hub
#############################################################
class Client extends EventEmitter
    constructor: (@conn) ->
        @_data_handlers = {}
        @_data_handlers[JSON_CHANNEL] = @handle_json_message_from_client

        @ip_address = @conn.remoteAddress

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
            for session_uuid in @compute_session_uuids
                winston.debug("KILLING -- #{session_uuid}?")
                # TODO: there will be a special property to not delete certain of these later.
                session = compute_sessions[session_uuid]
                if session? and session.kill?
                    winston.debug("Actually killing -- #{session_uuid}")
                    session.kill()
                    # pid     = session.pid; winston.debug("Killing session with pid=#{pid}")
                    # sage.send_signal
                    #     host   : session.conn.host
                    #     port   : session.conn.port
                    #     pid    : session.pid
                    #     signal : 9
                    # session.conn.close()
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


    # Call this method when the user has successfully signed in.
    signed_in: (signed_in_mesg) =>

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
        if mesg.event != 'ping'
            winston.debug("client --> hub: #{to_safe_str(mesg)}")
        handler = @["mesg_#{mesg.event}"]
        if handler?
            handler(mesg)
        else
            @push_to_client(message.error(error:"The Salvus hub does not know how to handle a '#{mesg.event}' event.", id:mesg.id))
    ######################################################
    # Permission to send a message to a named compute session.
    ######################################################
    check_permission: (mesg) ->
        if not mesg.session_uuid?
            return true
        session = compute_sessions[mesg.session_uuid]
        if not session?
            @push_to_client(message.error(id:mesg.id, error:"Unknown compute session #{mesg.session_uuid}."))
            return false
        # TODO: make this more flexible later
        if session.account_id != @account_id
            @push_to_client(message.error(id:mesg.id, error:"You are not allowed to access compute session #{mesg.session_uuid}."))
            return false
        return true

    ######################################################
    # Messages: Sage compute sessions and code execution
    ######################################################
    mesg_execute_code: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to execute code."))
            return
        if not @check_permission(mesg)
            return
        if mesg.session_uuid?
            send_to_persistent_sage_session(mesg)
        else
            stateless_sage_exec(mesg, @push_to_client)

    mesg_start_session: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to start a session."))
            return

        switch mesg.type
            when 'sage'
                create_persistent_sage_session(@, mesg)
            when 'console'
                create_persistent_console_session(@, mesg)
            else
                @push_to_client(message.error(id:mesg.id, error:"Unknown message type '#{mesg.type}'"))

    mesg_connect_to_session: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to start a session."))
            return
        switch mesg.type
            when 'console'
                connect_to_existing_console_session(@, mesg)
            else
                # TODO
                @push_to_client(message.error(id:mesg.id, error:"Connecting to session of type '#{mesg.type}' not yet implemented"))

    mesg_send_signal: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to send a signal."))
            return
        if not @check_permission(mesg)
            return
        if console_sessions[mesg.session_uuid]?
            send_to_persistent_console_session(mesg)
        else if persistent_sage_sessions[mesg.session_uuid]?
            send_to_persistent_sage_session(mesg)
        else
            @push_to_client(message.error(id:mesg.id, error:"Unknown session #{mesg.session_uuid}"))

    mesg_ping_session: (mesg) =>
        s = console_sessions[mesg.session_uuid]
        if s?
            s.last_ping_time = new Date()
            return
        s = persistent_sage_sessions[mesg.session_uuid]
        if s?
            s.last_ping_time = new Date()
            return
        @push_to_client(message.error(id:mesg.id, error:"Pinged unknown session #{mesg.session_uuid}"))

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
        if not @check_permission(mesg)
            return
        send_to_persistent_sage_session(mesg)

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
                    @push_to_client(message.error(id:mesg.id, message:error))
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_load_scratch_worksheet: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to load the scratch worksheet from the server."))
            return
        #winston.debug(@account_id)
        database.uuid_value_store(name:"scratch_worksheets").get
            uuid : @account_id
            cb   : (error, data) =>
                #winston.debug("error=#{error}, data=#{data}")
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
    mesg_create_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to create a new project.")
            return

        #@error_to_client(id: mesg.id, error: "Project creation is temporarily disabled.")
        #return

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
                    quota       : DEFAULTS.quota   # TODO -- account based
                    idle_timeout: DEFAULTS.idle_timeout # TODO -- account based
                    cb          : cb

            # open, save, close project on a compute server, to initialize the
            # git repos, etc.
            # TODO: we might as an optimization just leave it open initially,
            # since the user is likely to want to use it right after creating it.
            (cb) =>
                project = new Project(project_id)
                project.open(cb)
            (cb) =>
                project.save
                    account_id  : @account_id
                    add_all     : true
                    commit_mesg : "new project"
                    cb          : cb
            (cb) =>
                project.close(cb)
        ], (error) =>
            if error
                winston.debug("Issue creating project #{project_id}: #{misc.to_json(mesg)}")
                @error_to_client(id: mesg.id, error: "Failed to create new project '#{mesg.title}' -- #{misc.to_json(error)}")
                # Delete half-created project from database, since we just wasted space and
                # this half-initialized project will confuse client code.
                if project?
                    project.delete()
                else
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
        # TODO -- permissions!
        project = new Project(mesg.project_id)
        project.save
            account_id  : @account_id
            add_all     : mesg.add_all
            commit_mesg : mesg.commit_mesg
            cb          : (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_close_project: (mesg) =>
        # TODO -- permissions!
        project = new Project(mesg.project_id)
        project.close (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.success(id:mesg.id))

    mesg_write_text_file_to_project: (mesg) =>
        # TODO -- permissions!
        #winston.debug("**** mesg_write_text_file_to_project")
        project = new Project(mesg.project_id)
        project.write_file mesg.path, mesg.content, (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.file_written_to_project(id:mesg.id))

    mesg_read_text_file_from_project: (mesg) =>
        project = new Project(mesg.project_id)
        project.read_file
            path : mesg.path
            cb   : (err, content) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    t = content.blob.toString()
                    @push_to_client(message.text_file_read_from_project(id:mesg.id, content:t))

    mesg_read_file_from_project: (mesg) =>
        project = new Project(mesg.project_id)
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
        project = new Project(mesg.project_id)
        project.move_file mesg.src, mesg.dest, (err, content) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.file_moved_in_project(id:mesg.id))

    mesg_make_directory_in_project: (mesg) =>
        project = new Project(mesg.project_id)
        project.make_directory mesg.path, (err, content) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.directory_made_in_project(id:mesg.id))

    mesg_remove_file_from_project: (mesg) =>
        project = new Project(mesg.project_id)
        project.remove_file mesg.path, (err, resp) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                resp.id = mesg.id
                @push_to_client(resp)

    mesg_create_project_branch: (mesg) =>
        project = new Project(mesg.project_id)
        project.branch_op mesg.branch, 'create', (err, resp) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                resp.id = mesg.id
                @push_to_client(resp)

    mesg_checkout_project_branch: (mesg) =>
        project = new Project(mesg.project_id)
        project.branch_op mesg.branch, 'checkout', (err, resp) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                resp.id = mesg.id
                @push_to_client(resp)

    mesg_delete_project_branch: (mesg) =>
        project = new Project(mesg.project_id)
        project.branch_op mesg.branch, 'delete', (err, resp) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                resp.id = mesg.id
                @push_to_client(resp)

    mesg_merge_project_branch: (mesg) =>
        project = new Project(mesg.project_id)
        project.branch_op mesg.branch, 'merge', (err, resp) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                resp.id = mesg.id
                @push_to_client(resp)

    mesg_project_exec: (mesg) =>
        (new Project(mesg.project_id)).exec mesg, (err, resp) =>
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


##############################
# Working with projects
##############################

class Project
    constructor: (@project_id) ->
        if not @project_id?
            throw "When creating Project, the project_id must be defined"

    ##############################################
    # Database state stuff
    ##############################################
    _choose_new_host: (cb) ->
        # For now we just choose a host at random.  In the long run,
        # we may experiment with other load balancing algorithms, and
        # take into account properties of the project itself.  For
        # example, we will have an "infinite uptime" option.
        database.random_compute_server type:'project', cb:(err, hostinfo) ->
            #winston.debug("*** #{err}, #{misc.to_json(hostinfo)}")
            if err
                cb(err)
            else if not hostinfo?
                cb("No project servers are currently available.")
            else
                cb(false, hostinfo.host)

    _minus_one_host: (host, cb) ->
        database.score_compute_server(host:host, cb:cb, delta:-1)

    _plus_one_host: (host, cb) ->
        database.score_compute_server(host:host, cb:cb, delta:+1)

    _connect: (host, cb) ->
        if not host?
            throw "BUG -- host must be defined"

        if @_socket? and @_socket.host == host
            cb(false, @_socket.socket)
            return

        socket = net.connect {host:host, port:cass.COMPUTE_SERVER_PORTS.project}, () =>
            winston.debug("!! connected to #{misc.to_json(host)}")
            # connected
            misc_node.enable_mesg(socket)
            # We cache the connection for later.  We only cache a
            # connection to *one* host, since a project is only
            # supposed to ever be hosted on one compute server.
            @_socket = {host:host, socket:socket}
            cb(false, socket)

        # There are numerous actions that require adding a listener to
        # the socket, sending blobs, then removing it.  Since many of
        # these could happen simultaneously, I'm upping the max
        # listeners a bit, just in case.
        socket.setMaxListeners(30)

        socket.once 'error', (err) =>
            if err == 'ECONNREFUSED'
                # An error occured connecting -- this suggests
                # that the relevant project server is down.
                cb(err)

        # Make sure not to cache the socket in case anything goes wrong with it.
        socket.once 'close', () =>
            if @_socket?
                delete @_socket
        socket.once 'end', () =>
            if @_socket?
                delete @_socket
        socket.once 'timeout', () =>
            if @_socket?
                delete @_socket

    # Returns the host that is currently hosting the project
    # (according to the database) or null if the project is not
    # currently on any host.
    get_host: (cb) =>    # cb(err, host)
        database.get_project_host(project_id:@project_id, cb:cb)

    _is_being_opened: (cb) =>    # cb(err, is_being_opened)
        database.is_project_being_opened(project_id:@project_id, cb:cb)

    _lock_for_opening: (ttl, cb) =>    # cb(err)
        database.lock_project_for_opening(project_id:@project_id, ttl:ttl, cb:cb)

    _remove_opening_lock: (cb) =>
        database.remove_project_opening_lock(project_id:@project_id, cb:cb)

    _is_being_saved: (cb) =>    # cb(err, is_being_opened)
        database.is_project_being_saved(project_id:@project_id, cb:cb)

    _lock_for_saving: (ttl, cb) =>    # cb(err)
        database.lock_project_for_saving(project_id:@project_id, ttl:ttl, cb:cb)

    _remove_saving_lock: (cb) =>
        database.remove_project_saving_lock(project_id:@project_id, cb:cb)

    # Open the project (if necessary) and get a working socket connection to the project_server.
    socket: (cb) ->     # cb(err, socket)
        host   = undefined
        socket = undefined
        async.series([
            (c) =>
                @open (err, _host) =>
                    if err
                        winston.debug("project.socket -- error opening project -- #{err}")
                        c(err)
                    else
                        host = _host
                        winston.debug("project.socket -- deploy to host '#{host}'")
                        c()
            (c) =>
                @_connect host, (err, _socket) =>
                    if err
                        winston.debug("project.socket -- error connecting to project server #{err}")
                        c(err)
                    else
                        socket = _socket
                        winston.debug("project.socket -- got a socket connection to the project_server")
                        c()
        ], (err) ->
            if err
                cb(err)
            else
                cb(false, socket)
        )

    # Open the project on some host if it is not already opened. If it
    # is currently being opened by this or another hub, we return an
    # error.  (The client can choose to show some sort of notification
    # and retry after waiting a moment.)
    open: (cb) ->   # cb(err, host)
        if not cb?
            throw "cb must be defined"
        host = undefined
        had_to_recurse = false
        async.series([
            # First, we check in the database to see if the project is
            # already opened on a compute server, and if so, return
            # that host.
            (c) =>
                winston.debug("open project -- get host")
                @get_host (err, _host) ->
                    host = _host
                    if err
                        c(true) # failed -- done
                    else if _host?
                        c(true) # done
                    else
                        c()

            # Is anybody else trying to open this project right now?
            (c) =>
                winston.debug("open project -- check if anybody else opening project right now")
                @_is_being_opened (err, is_being_opened) =>
                    if err
                        c(true)  # failed -- don't try any further
                    else if is_being_opened
                        # In the rare case of two opens at the same
                        # time, try again repeatedly, up to a total of
                        # 10 seconds (after which user client will
                        # have given up).
                        total_time = 0
                        delta = 200
                        try_again = () =>
                            @get_host (err, _host) ->
                                if not err and _host?  # got it!
                                    host = _host
                                    c(true)
                                else
                                    delta += delta
                                    if total_time + delta <= 10000
                                        setTimeout(try_again, delta)
                                    else
                                        # give up.
                                        c("Project #{@project_id} is currently being opened by another hub. Please try again in a few seconds. (#{err})")
                        setTimeout(try_again, delta)
                    else
                        # Not open, not being opened, let's get on it!
                        # The 15 below is a timeout in seconds, after which our lock self-destructs.
                        @_lock_for_opening(15, c)

            # We choose a project server host.
            (c) =>
                winston.debug("open project -- choose a host")
                @_choose_new_host (err, _host) =>
                    if err
                        @_remove_opening_lock()
                        c(err)
                    else
                        host = _host
                        c()

            # Open the project on that host
            (c) =>
                winston.debug("open project -- open on that host (='#{host}')")
                @_open_on_host host, (err) =>
                    @_remove_opening_lock()
                    if err
                        if host == 'localhost' or host == '127.0.0.1'
                            # debugging mode -- just give up instantly.
                            winston.debug("_open_on_host -- err opening on localhost '#{err}'")
                            host = undefined  # so error messages will propagate below.
                            c(err)
                            return

                        # Downvote this host, and try again.
                        @_minus_one_host host, (err) =>
                            if err
                                # This is serious -- if we can't even connect to the database
                                # to flag a host as down, then there is no point in going on.
                                host = undefined  # so error messages will propagate below.
                                c(true)
                            else
                                # Try again.  This will not lead to infinite recursion since each
                                # time it is called, we just successfully flagged a host as down
                                # in the database, and eventually we'll run out of hosts.
                                had_to_recurse = true
                                @open(cb)
                                host = undefined  # so error messages will propagate below.
                                c()
                    else
                        # Finally, got it!
                        # Upvote this host, since it worked.
                        @_plus_one_host(host)
                        c()
        ], (err) ->
            if not had_to_recurse   # the recursive call will call cb
                if host?  # if host got defined then done
                    cb(false, host)
                else
                    cb(err)
        )

    # This is called by 'open' once we determine that the project is
    # not already opened, and also we determine on which host we plan
    # to open the project.
    _open_on_host: (host, cb) ->
        socket  = undefined
        id      = uuid.v4()   # used to tag communication with the project server
        bundles = undefined
        quota   = undefined
        idle_timeout = undefined

        async.series([
            # Get a connection to the project server.
            (c) =>
                winston.debug("_open_on_host - get a connection to the project server.")
                @_connect host, (err, s) ->
                    if err
                        c(err)
                    else
                        socket = s
                        c()

            # Get each bundle blob from the database in preparation to
            # send it to the project_server.
            (c) =>
                winston.debug("_open_on_host - get bundle blobs from the database.")
                database.get_project_bundles project_id:@project_id, cb:(err, result) ->
                    if err
                        c(err)
                    else
                        # bundles is an array of Buffers
                        bundles = result
                        # Make a corresponding list of temporary
                        # uuid's that will be used when sending the
                        # bundles.
                        bundles.uuids = (uuid.v4() for i in [0...bundles.length])
                        c()

            # Get meta information about the project that is needed to open the project.
            (c) =>
                winston.debug("_open_on_host -- get meta information about the project that is needed to open the project.")
                database.get_project_open_info project_id:@project_id, cb:(err, result) ->
                    if err
                        c(err)
                    else
                        {quota, idle_timeout} = result
                        c()

            # Send open_project mesg.
            (c) =>
                winston.debug("_open_on_host -- Send open_project mesg")
                mesg_open_project = message.open_project
                    id           : id
                    project_id   : @project_id
                    bundle_uuids : bundles.uuids
                    quota        : quota
                    idle_timeout : idle_timeout
                socket.write_mesg 'json', mesg_open_project
                c()

            # Starting sending the bundles as blobs.
            (c) ->
                winston.debug("_open_on_host -- start sending bundles as blobs")
                for i in [0...bundles.length]
                    socket.write_mesg 'blob', {uuid:bundles.uuids[i],blob:bundles[i]}
                c()

            # Wait for the project server to respond with success
            # (having received all blobs) or failure (something went wrong).
            (c) ->
                winston.debug("_open_on_host -- wait for the project server to respond")
                socket.recv_mesg id:id, type:'json', timeout:30, cb:(mesg) ->
                    winston.debug("_open_on_host -- received response #{misc.to_json(mesg)}")
                    switch mesg.event
                        when 'error'
                            # something went wrong...
                            c(mesg.error)
                        when 'project_opened'
                            # finally, got it.
                            c()
                        else
                            c("Expected a 'project_opened' message, but got a '#{mesg.event}' message instead.")

            # Save where project is running to the database
            (c) =>
                winston.debug("_open_on_host -- save where (='#{host}') project running to database")
                database.set_project_host(project_id:@project_id, host:host, cb:c)

        ], cb)

    # Save the project to the database.  This involves saving at least
    # zero (!) bundles to the project_bundles table.
    save: (opts) -> # cb(err) -- indicates when done
        opts = defaults opts,
            account_id : undefined  # required only if commit_mesg is given
            commit_mesg: undefined  # if defined will commit first before saving back to database.
            add_all    : false      # if true add everything we can to the repo before commiting.
            cb         : undefined

        id = uuid.v4() # used to tag communication with the project server

        save_mesg = message.save_project
            id                     : id
            project_id             : @project_id
            starting_bundle_number : 0  # will get changed below
            commit_mesg            : opts.commit_mesg
            add_all                : opts.add_all

        socket             = undefined
        host               = undefined
        project_saved_mesg = undefined
        recv_bundles       = undefined
        not_open = false

        nothing_to_do = false

        async.series([
            # If project is already locked for saving (by this or
            # another hub), return an error.
            (c) =>
                @_is_being_saved (err, is_being_saved) =>
                    if err
                        c(err)
                    else if is_being_saved
                        nothing_to_do = true
                        c(true)
                    else
                        @_lock_for_saving(30, c)

            # Determine which project_server is hosting this project.
            # If none, then there is nothing further to do.
            (c) =>
                database.get_project_host project_id:@project_id, cb:(err, _host) =>
                    if err
                        c(err)
                    else
                        if not _host?
                            not_open = true
                            c(true)
                        else
                            host = _host
                            c()

            # Get the user's name and email for the commit message
            (c) =>
                database.get_gitconfig account_id:opts.account_id, cb:(err, gitconfig) ->
                    if err
                        c(err)
                    else
                        save_mesg.gitconfig = gitconfig
                        c()

            # Find the index of the largest bundle that we already have in the database
            (c) =>
                database.largest_project_bundle_index project_id:@project_id, cb:(err, n) ->
                    if err
                        c(err)
                    else
                        save_mesg.starting_bundle_number = n + 1
                        c()

            # Connect to the project server that is hosting this project right now.
            (c) =>
                @_connect host, (err, s) ->
                    if err
                        c(err)
                    else
                        socket = s
                        c()

            (c) =>
                # TODO
                save_mesg.author = "TODOWilliam Stein <wstein@gmail.com>"
                c()

            # Send message to project server requesting that it save
            # the the project and send back to us any bundle(s) that
            # it creates when saving the project.
            (c) =>
                socket.write_mesg 'json', save_mesg
                c()

            # Listen for bundles, find out how many bundles to expect
            # and receive the bundles.
            (c) =>
                bundle_uuids      = undefined
                remaining_bundles = undefined

                recv_bundles = (type, mesg) =>
                    switch type
                        when 'json'
                            if mesg.id == id
                                switch mesg.event
                                    when 'error'
                                        c(mesg.error)
                                    when 'project_saved'
                                        project_saved_mesg = mesg
                                        bundle_uuids       = mesg.bundle_uuids
                                        remaining_bundles  = misc.len(bundle_uuids)
                                        if remaining_bundles == 0
                                            # done -- no need to wait for any blobs
                                            c()
                        when 'blob'
                            if bundle_uuids? and bundle_uuids[mesg.uuid]?
                                database.save_project_bundle
                                    project_id : @project_id
                                    number     : bundle_uuids[mesg.uuid]
                                    bundle     : mesg.blob
                                    cb         : (err) ->
                                        if err
                                            c(err)
                                        else
                                            remaining_bundles -= 1
                                            if remaining_bundles == 0
                                                # done -- we have received and *saved* all bundles to the database successfully
                                                c()
                socket.on 'mesg', recv_bundles

        ], (err) =>
            if err and nothing_to_do
                opts.cb?()
                return
            @_remove_saving_lock()
            if socket? and recv_bundles?
                socket.removeListener('mesg', recv_bundles)
            if not_open
                opts.cb?()
            else
                opts.cb?(err)
        )

    delete: (cb) =>
        @close(() => database.delete_project(project_id:@project_id, cb:cb))

    # Close the project.  This does *NOT* save the project first; it
    # just immediately kills all processes and clears all disk space.
    close: (cb) =>  # cb(err) -- indicates when done
        id     = uuid.v4()
        socket = undefined
        host   = undefined

        async.series([
            # Get project's current host
            (c) =>
                database.get_project_host project_id:@project_id, cb: (err, _host) ->
                    if err
                        c(true)
                    else
                        if not _host?      # not currently hosted somewhere, so "done" but no error.
                            c('ok')
                        else
                            host = _host
                            c()

            # Connect to the project server that is hosting this project right now.
            (c) =>
                @_connect host, (err, s) ->
                    if err
                        c(err)
                    else
                        socket = s
                        c()

            # Put a lock, so nobody tries to save or open this project while we are closing.
            # 15 seconds should be plenty of time.
            (c) =>
                winston.debug("project close: -- lock")
                @_lock_for_opening(15, ->)
                @_lock_for_saving(15, c)

            # Send the close message
            (c) =>
                winston.debug("project close: -- send close message")
                socket.write_mesg 'json', message.close_project(id: id, project_id: @project_id)
                c()

            # And wait for response from project server
            (c) =>
                winston.debug("project close: -- waiting for response from project server")
                socket.recv_mesg type:'json', id:id, timeout:10, cb:(mesg) =>
                    switch mesg.event
                        when 'error'
                            c(mesg.error)
                        when 'project_closed'
                            c() # successfully closed project
                        else
                            c("BUG closing project -- unknown mesg event type '#{mesg.event}'")

            # Store in the database that the project is not allocated
            # on any host.
            (c) =>
                winston.debug("project close -- store that project is closed")
                database.set_project_host
                    project_id : @project_id
                    host       : ""
                    cb         : c

        ], (err) =>
            @_remove_opening_lock()
            @_remove_saving_lock()
            if err == 'ok'
                cb()
            else
                cb(err)
        )

    # Tag the input message mesg with a uuid and this project_id, then
    # send it to the project server hosting this project (or create
    # one if there is none right now).  Finally do the standard:
    # cb(err, response_mesg).  If err is true, then there was an error
    # getting a socket to the project server in the first place; if
    # err is false, then it is still possible that response_mesg.event
    # == 'error' due to the project server having issues.
    call: (opts) =>
        opts = defaults opts,
            message : required
            timeout : 10
            cb      : required

        socket = undefined
        id     = uuid.v4()
        async.series([
            (c) =>
                @socket (err,_socket) ->
                    if err
                        opts.cb(err)
                        c(true)
                    else
                        socket = _socket
                        c()
            (c) =>
                if not opts.message.id?
                    opts.message.id = id
                opts.message.project_id = @project_id
                socket.write_mesg 'json', opts.message
                c()
            (c) =>
                socket.recv_mesg type:'json', id:opts.message.id, timeout:opts.timeout, cb:(mesg) ->
                    opts.cb(false, mesg)
                    c()
        ])

    # Read a file from a project into memory on the hub.  This is
    # used, e.g., for client-side editing, worksheets, etc.  This does
    # not pull the file from the database; instead, it loads it live
    # from the project_server virtual machine.
    read_file: (opts) -> # cb(err, content_of_file)  -- indicates when done
        {path, archive, cb} = defaults opts,
            path    : required
            archive : undefined
            cb      : required

        socket    = undefined
        id        = uuid.v4()
        data      = undefined
        data_uuid = undefined

        async.series([
            # Get a socket connection to the project host.  This will open
            # the project if it isn't already opened.
            (c) =>
                @socket (err, _socket) ->
                    if err
                        c(err)
                    else
                        socket = _socket
                        c()
            (c) =>
                socket.write_mesg 'json', message.read_file_from_project(id:id, project_id:@project_id, path:path, archive:archive)
                socket.recv_mesg type:'json', id:id, timeout:10, cb:(mesg) =>
                    switch mesg.event
                        when 'error'
                            c(mesg.error)
                        when 'file_read_from_project'
                            data_uuid = mesg.data_uuid
                            c()
                        else
                            c("Unknown mesg event '#{mesg.event}'")

            (c) =>
                socket.recv_mesg type: 'blob', id:data_uuid, timeout:10, cb:(_data) ->
                    data = _data
                    c()

        ], (err) ->
            if err
                cb(err)
            else
                cb(false, data)
        )

    # Write a file to a compute node.  This is used when saving during
    # client-side editing, for worksheets, etc.  This does not
    # directly change anything in the database -- it only impacts the
    # files on the compute node.  This does not trigger a save (which
    # would change the database).
    write_file: (path, data, cb) ->   # cb(err)
        socket    = undefined
        id        = uuid.v4()
        data_uuid = uuid.v4()

        async.series([
            (c) =>
                @socket (err, _socket) ->
                    #winston.debug("@socket returned: #{err}, #{_socket}")
                    if err
                        c(err)
                    else
                        socket = _socket
                        c()
            (c) =>
                mesg = message.write_file_to_project
                    id         : id
                    project_id : @project_id
                    path       : path
                    data_uuid  : data_uuid
                # winston.debug("mesg = #{misc.to_json(mesg)}")
                socket.write_mesg 'json', mesg
                socket.write_mesg 'blob', {uuid:data_uuid, blob:data}
                c()

            (c) =>
                socket.recv_mesg type: 'json', id:id, timeout:10, cb:(mesg) ->
                    switch mesg.event
                        when 'file_written_to_project'
                            c()
                        when 'error'
                            c(mesg.error)
                        else
                            c("Unexpected message type '#{mesg.event}'")
        ], cb)

    make_directory: (path, cb) ->
        socket = undefined
        id     = uuid.v4()
        async.series([
            (c) =>
                @socket (err, _socket) ->
                    if err
                        c(err)
                    else
                        socket = _socket
            (c) =>
                m = message.make_directory_in_project
                    id         : id
                    project_id : @project_id
                    path       : path
                socket.write_mesg 'json', m
                c()
            (c) =>
                socket.recv_mesg type:'json', id:id, timeout:10, cb:(mesg) ->
                    switch mesg.event
                        when 'directory_made_in_project'
                            c()
                        when 'error'
                            c(mesg.error)
                        else
                            c("Unexpected message type '#{mesg.event}'")
        ], cb)

    # Move a file or directory
    move_file: (src, dest, cb) ->
        winston.debug("MOVE: #{src} --> #{dest}")
        socket = undefined
        id     = uuid.v4()
        async.series([
            (c) =>
                @socket (err, _socket) ->
                    if err
                        c(err)
                    else
                        socket = _socket
                        c()
            (c) =>
                m = message.move_file_in_project
                    id         : id
                    project_id : @project_id
                    src        : src
                    dest       : dest
                socket.write_mesg 'json', m
                c()
            (c) =>
                socket.recv_mesg type:'json', id:id, timeout:10, cb:(mesg) ->
                    switch mesg.event
                        when 'file_moved_in_project'
                            c()
                        when 'error'
                            c(mesg.error)
                        else
                            c("Unexpected message type '#{mesg.event}'")
        ], cb)

    # Remove a file or directory
    remove_file: (path, cb) =>
        id = uuid.v4()
        @call
            message: message.remove_file_from_project
                id         : id
                project_id : @project_id
                path       : path
            cb : cb

    # Branch op
    branch_op : (branch, op, cb) =>
        @call
            message: message["#{op}_project_branch"]
                branch      : branch
                project_id  : @project_id
            cb : cb

    # Exec a command
    exec : (mesg, cb) =>
        @call
            message : mesg
            cb      : cb
            timeout : mesg.timeout

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

create_persistent_sage_session = (client, mesg) ->
    winston.info('creating persistent sage session')
    # generate a uuid
    session_uuid = uuid.v4()
    client.cap_session_limits(mesg.limits)
    database.random_compute_server(type: 'sage', cb:(error, sage_server) ->
        if error
            client.push_to_client(message.error(id:mesg.id, error:error))
            return
        kill_message = undefined
        sage_conn = new sage.Connection(
            host:sage_server.host
            port:sage_server.port
            recv:(type, m) ->
                switch type
                    when 'json'
                        winston.info("(hub) persistent_sage_conn (#{session_uuid})-- recv(#{to_safe_str(m)})")
                        switch m.event
                            # DANGER: forwarding execute_javascript messages is a potential a security issue.
                            when "output", "terminate_session", "execute_javascript"
                                m.session_uuid = session_uuid  # tag with session uuid
                                client.push_to_client(m)
                            when "session_description"
                                # record this for later use for signals:
                                persistent_sage_sessions[session_uuid].pid = m.pid
                                persistent_sage_sessions[session_uuid].account_id = client.account_id
                                kill_message =
                                    host   : sage_server.host
                                    port   : sage_server.port
                                    pid    : m.pid
                                    signal : 9
                                client.push_to_client(message.session_started(id:mesg.id, session_uuid:session_uuid, limits:m.limits))
                            else
                                client.push_to_client(m)
                    when 'blob'
                        save_blob
                            uuid  : m.uuid
                            value : m.blob
                            ttl   : 600  # deleted after ten minutes
                            cb    : (err) ->
                                # TODO: actually use this for something
                    else
                        raise("unknown message type '#{type}'")
            cb: ->
                winston.info("(hub) persistent_sage_conn -- connected.")
                # send message to server requesting parameters for this session
                sage_conn.send_json(mesg)
        )
        # Save sage_conn object so that when the user requests evaluation of
        # code in the session with this id, we use this.
        session =
            conn           : sage_conn
            kill           : () ->
                if kill_message?
                    sage.send_signal(kill_message)
                sage_conn.close()

        enable_ping_timer(session : session)

        persistent_sage_sessions[session_uuid] = session
        compute_sessions[session_uuid] = session
        client.compute_session_uuids.push(session_uuid)

        winston.info("(hub) added #{session_uuid} to persistent sessions")
    )

send_to_persistent_sage_session = (mesg) ->
    winston.debug("send_to_persistent_sage_session(#{to_safe_str(mesg)})")

    session_uuid = mesg.session_uuid
    session = persistent_sage_sessions[session_uuid]
    if not session?
        winston.error("TODO -- session #{mesg.session_uuid} does not exist")
        return

    # modify the message so that it can be interpreted by sage server
    switch mesg.event
        when "send_signal"
            mesg.pid = session.pid

    if mesg.event == 'send_signal'   # other control messages would go here too
        # TODO: this function is a DOS vector, so we need to secure/limit it
        # Also, need to ensure that user is really allowed to do this action, whatever it is.
        sage.send_signal
            host   : session.conn.host
            port   : session.conn.port
            pid    : mesg.pid
            signal : mesg.signal
    else
        session.conn.send_json(mesg)

########################################
# Console Sessions
########################################

# TODO
console_sessions = {}

send_to_persistent_console_session = (mesg) ->
    {host, port, pid} = console_sessions[mesg.session_uuid]
    mesg.pid = pid
    socket = net.connect {host:host, port:port}, () ->
        misc_node.enable_mesg(socket)
        socket.write_mesg('json', mesg)

connect_to_existing_console_session = (client, mesg) ->
    #
    # TODO: actually do something to make sure user is allowed to make this connection!
    #
    console_session = console_sessions[mesg.session_uuid]
    if not console_session?
        # TODO: check in database for sessions on other nodes
        client.push_to_client(message.error(id:mesg.id, error:"There is no known console session with id #{mesg.session_uuid}."))
    else if console_session.closed
        client.push_to_client(message.error(id:mesg.id, error:"Cannot connect to session with id #{mesg.session_uuid} since it has already closed."))
    else
        channel = client.register_data_handler((data) -> console_session.write(data))
        console_session.on("data", (data) -> client.push_data_to_client(channel, data))
        client.push_to_client(message.session_connected(id:mesg.id, data_channel:channel))

create_persistent_console_session = (client, mesg) ->
    winston.debug("creating a console session for user with account_id #{client.account_id}")
    session_uuid = uuid.v4()

    if not mesg.params?
        mesg.params = {}

    # Cap limits on the console session.
    client.cap_session_limits(mesg.limits)

    database.random_compute_server(type:'console', cb:(error, console_server) ->
        winston.debug(to_json(error) + to_json(console_server))
        if error
            client.push_to_client(message.error(id:mesg.id, error:error))
            return

        console_session = net.connect {port:console_server.port, host:console_server.host}, () ->

            # store the console_session, so other clients can
            # potentially tune in (TODO: also store something in database)
            console_session.closed = false

            console_session.on('end', ()->console_session.closed = true)

            enable_ping_timer(session: console_session)

            console_session.port = console_server.port
            console_session.host = console_server.host
            console_session.account_id = client.account_id
            console_sessions[session_uuid] = console_session
            compute_sessions[session_uuid] = console_session
            client.compute_session_uuids.push(session_uuid)

            # Add functionality to TCP socket so that we can send JSON messages
            misc_node.enable_mesg(console_session)

            # Send session configuration as a JSON message
            console_session.write_mesg('json', mesg)
            winston.debug("console session -- wrote config message (=#{to_json(mesg)}")

            # Get back pid of child
            console_session.once 'mesg', (type, resp) ->
                winston.debug("Console session -- get back pid of child #{type}, #{to_json(resp)}")
                misc_node.disable_mesg(console_session)

                if resp.event == 'error'
                    # did not start session; pass error on to client and throw away.
                    client.push_to_client(resp)
                    delete compute_sessions[session_uuid]
                    delete console_sessions[session_uuid]
                    return

                if resp.event != 'session_description'
                    # THIS could only happen if there is a serious bug.
                    client.push_to_client(message.error(id:mesg.id, error:"Internal error creating a new console session; got weird mesg='#{to_json(resp)}'.  Please report."))
                    return

                console_session.pid = resp.pid
                kill_mesg = message.send_signal(session_uuid:session_uuid, pid:console_session.pid, signal:9)
                console_session.kill = () -> send_to_persistent_console_session(kill_mesg)

                # Relay data from client to console_session
                channel = client.register_data_handler((data) ->
                    if console_session.closed
                        client.push_data_to_client(channel, "Session closed. ")
                    else
                        console_session.write(data)
                )

                # relay data from console_session to client
                console_session.on('data', (data) -> client.push_data_to_client(channel, data))

                resp = message.session_started
                    id           : mesg.id
                    session_uuid : session_uuid
                    limits       : mesg.limits
                    data_channel : channel
                client.push_to_client(resp)
    )

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
        host:host
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
        console.trace()
        winston.debug("BUG ****************************************************************************")

    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)
