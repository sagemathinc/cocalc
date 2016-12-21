###
This is the Salvus Global HUB module.  It runs as a daemon, sitting in the
middle of the action, connected to potentially thousands of clients,
many Sage sessions, and a RethinkDB database cluster.  There are
many HUBs running on VM's all over the installation.

GPLv3
###

DEBUG = DEBUG2 = false

if not process.env.SMC_TEST
    if process.env.SMC_DEBUG or process.env.SMC_DEBUG2 or process.env.DEVEL
        DEBUG = true
    if process.env.SMC_DEBUG2
        DEBUG2 = true

REQUIRE_ACCOUNT_TO_EXECUTE_CODE = false

# Anti DOS parameters:
# If a client sends a burst of messages, we space handling them out by this many milliseconds:
# (this even includes keystrokes when using the terminal)
MESG_QUEUE_INTERVAL_MS  = 0
# If a client sends a burst of messages, we discard all but the most recent this many of them:
#MESG_QUEUE_MAX_COUNT    = 25
MESG_QUEUE_MAX_COUNT    = 60
# Any messages larger than this is dropped (it could take a long time to handle, by a de-JSON'ing attack, etc.).
MESG_QUEUE_MAX_SIZE_MB  = 7

# How long to cache a positive authentication for using a project.
CACHE_PROJECT_AUTH_MS = 1000*60*15    # 15 minutes

# How long all info about a websocket Client connection
# is kept in memory after a user disconnects.  This makes it
# so that if they quickly reconnect, the connections to projects
# and other state doesn't have to be recomputed.
CLIENT_DESTROY_TIMER_S = 60*10  # 10 minutes
#CLIENT_DESTROY_TIMER_S = 0.1    # instant -- for debugging

CLIENT_MIN_ACTIVE_S = 45  # ??? is this a good choice?  No idea.

# node.js -- builtin libraries
net            = require('net')
assert         = require('assert')
fs             = require('fs')
path_module    = require('path')
underscore     = require('underscore')
{EventEmitter} = require('events')
mime           = require('mime')

program = undefined  # defined below -- can't import with nodev6 at module level when hub.coffee used as a module.

# smc path configurations (shared with webpack)
misc_node      = require('smc-util-node/misc_node')
SMC_ROOT       = misc_node.SMC_ROOT
SALVUS_HOME    = misc_node.SALVUS_HOME
OUTPUT_DIR     = misc_node.OUTPUT_DIR
STATIC_PATH    = path_module.join(SALVUS_HOME, OUTPUT_DIR)
WEBAPP_LIB     = misc_node.WEBAPP_LIB

underscore = require('underscore')

# SMC libraries
misc    = require('smc-util/misc')
{defaults, required} = misc
message = require('smc-util/message')     # salvus message protocol
client_lib = require('smc-util/client')

sage    = require('./sage')               # sage server
JSON_CHANNEL = client_lib.JSON_CHANNEL
{send_email} = require('./email')

auth   = require('./auth')
access = require('./access')

local_hub_connection = require('./local_hub_connection')
hub_projects         = require('./projects')
hub_proxy            = require('./proxy')

# express http server -- serves some static/dynamic endpoints
hub_http_server = require('./hub_http_server')

# registers the hub with the database periodically
hub_register = require('./hub_register')

# How frequently to register with the database that this hub is up and running,
# and also report number of connected clients
REGISTER_INTERVAL_S = 45   # every 45 seconds

smc_version = {}
init_smc_version = () ->
    smc_version = require('./hub-version')
    # winston.debug("init smc_version: #{misc.to_json(smc_version.version)}")
    smc_version.on 'change', (version) ->
        winston.debug("smc_version changed -- sending updates to clients")
        for id, c of clients
            if c.smc_version < version.version
                c.push_version_update()

to_json = misc.to_json
to_safe_str = misc.to_safe_str
from_json = misc.from_json

# third-party libraries: add any new nodejs dependencies to the NODEJS_PACKAGES list in build.py
async   = require("async")
uuid    = require('node-uuid')

Cookies = require('cookies')            # https://github.com/jed/cookies


winston = require('winston')            # logging -- https://github.com/flatiron/winston

# Set the log level
winston.remove(winston.transports.Console)
if not process.env.SMC_TEST
    winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

# module scope variables:
database           = null

# the connected clients
clients = require('./clients').get_clients()

#############################################################
# Client = a client that is connected via a persistent connection to the hub
#############################################################
class Client extends EventEmitter
    constructor: (@conn) ->
        @_when_connected = new Date()
        @_data_handlers = {}
        @_data_handlers[JSON_CHANNEL] = @handle_json_message_from_client

        @_messages =
            being_handled : {}
            total_time    : 0
            count         : 0

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

        @install_conn_handlers()

        # Setup remember-me related cookie handling
        @cookies = {}

        c = new Cookies(@conn.request)
        @_remember_me_value = c.get(BASE_URL + 'remember_me')

        @check_for_remember_me()

        # Security measure: check every 5 minutes that remember_me
        # cookie used for login is still valid.  If the cookie is gone
        # and this fails, user gets a message, and see that they must sign in.
        @_remember_me_interval = setInterval(@check_for_remember_me, 1000*60*5)

    touch: (opts={}) =>
        #winston.debug("touch('#{opts.project_id}', '#{opts.path}')")
        if not @account_id  # not logged in
            opts.cb?('not logged in')
            return
        opts = defaults opts,
            project_id : undefined
            path       : undefined
            action     : 'edit'
            force      : false
            cb         : undefined
        # touch -- indicate by changing field in database that this user is active.
        # We do this at most once every CLIENT_MIN_ACTIVE_S seconds, for given choice
        # of project_id, path (unless force is true).
        if not @_touch_lock?
            @_touch_lock = {}
        key = "#{opts.project_id}-#{opts.path}-#{opts.action}"
        if not opts.force and @_touch_lock[key]
            opts.cb?("touch lock")
            return
        opts.account_id = @account_id
        @_touch_lock[key] = true
        delete opts.force
        database.touch(opts)
        setTimeout((()=>delete @_touch_lock[key]), CLIENT_MIN_ACTIVE_S*1000)

    install_conn_handlers: () =>
        #winston.debug("install_conn_handlers")
        if @_destroy_timer?
            clearTimeout(@_destroy_timer)
            delete @_destroy_timer

        @conn.on "data", (data) =>
            @handle_data_from_client(data)

        @conn.on "end", () =>
            winston.debug("connection: hub <--> client(id=#{@id}, address=#{@ip_address})  -- CLOSED")
            @destroy()
            #winston.debug("connection: hub <--> client(id=#{@id}, address=#{@ip_address})  -- CLOSED; starting destroy timer")
            # CRITICAL -- of course we need to cancel all changefeeds when user disconnects,
            # even temporarily, since messages could be dropped otherwise. (The alternative is to
            # cache all messages in the hub, which has serious memory implications.)
            #@query_cancel_all_changefeeds()
            # Actually destroy Client in a few minutes, unless user reconnects
            # to this session.  Often the user may have a temporary network drop,
            # and we keep everything waiting for them for short time
            # in case this happens.
            #@_destroy_timer = setTimeout(@destroy, 1000*CLIENT_DESTROY_TIMER_S)
            #

        winston.debug("connection: hub <--> client(id=#{@id}, address=#{@ip_address})  ESTABLISHED")

    dbg: (desc) =>
        if DEBUG
            return (m) => winston.debug("Client(#{@id}).#{desc}: #{m}")
        else
            return (m) =>

    destroy: () =>
        winston.debug("destroy connection: hub <--> client(id=#{@id}, address=#{@ip_address})  -- CLOSED")
        clearInterval(@_remember_me_interval)
        @query_cancel_all_changefeeds()
        @closed = true
        @emit('close')
        @compute_session_uuids = []
        c = clients[@conn.id]
        delete clients[@conn.id]
        if c? and c.call_callbacks?
            for id,f of c.call_callbacks
                f("connection closed")
            delete c.call_callbacks
        for h in local_hub_connection.all_local_hubs()
            h.free_resources_for_client_id(@id)

    remember_me_failed: (reason) =>
        #winston.debug("client(id=#{@id}): remember_me_failed(#{reason})")
        @signed_out()  # so can't do anything with projects, etc.
        @push_to_client(message.remember_me_failed(reason:reason))

    check_for_remember_me: () =>
        value = @_remember_me_value
        if not value?
            @remember_me_failed("no remember_me cookie")
            return
        x    = value.split('$')
        if x.length != 4
            @remember_me_failed("invalid remember_me cookie")
            return
        hash = auth.generate_hash(x[0], x[1], x[2], x[3])
        winston.debug("checking for remember_me cookie with hash='#{hash.slice(0,15)}...'") # don't put all in log -- could be dangerous
        database.get_remember_me
            hash : hash
            cb   : (error, signed_in_mesg) =>
                winston.debug("remember_me: got error=#{error}, signed_in_mesg=#{misc.to_json(signed_in_mesg)}")
                if error
                    @remember_me_failed("error accessing database")
                    return
                if not signed_in_mesg?
                    @remember_me_failed("remember_me deleted or expired")
                    return
                # sign them in if not already signed in
                if @account_id != signed_in_mesg.account_id
                    signed_in_mesg.hub = program.host + ':' + program.port
                    @hash_session_id   = hash
                    @signed_in(signed_in_mesg)
                    @push_to_client(signed_in_mesg)
                ###
                database.is_banned_user
                    email_address : signed_in_mesg.email_address
                    cb            : (err, is_banned) =>
                        if err
                            @remember_me_failed("error checking whether or not user is banned -- {err}")
                        else if is_banned
                            # delete this auth key, since banned users are a waste of space.
                            # TODO: probably want to log this attempt...
                            @remember_me_failed("user is banned")
                            @delete_remember_me(hash : hash)
                        else
                            # good -- sign them in if not already
                            if @account_id != signed_in_mesg.account_id
                                signed_in_mesg.hub     = program.host + ':' + program.port
                                @hash_session_id = hash
                                @signed_in(signed_in_mesg)
                                @push_to_client(signed_in_mesg)
                ###

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
    push_to_client: (mesg, cb) =>
        if @closed
            cb?("disconnected")
            return

        if mesg.event != 'pong'
            winston.debug("hub --> client (client=#{@id}): #{misc.trunc(to_safe_str(mesg),300)}")

        if mesg.id?
            start = @_messages.being_handled[mesg.id]
            if start?
                time_taken = new Date() - start
                delete @_messages.being_handled[mesg.id]
                @_messages.total_time += time_taken
                @_messages.count += 1
                avg = Math.round(@_messages.total_time / @_messages.count)
                winston.debug("client=#{@id}: [#{time_taken} mesg_time_ms]  [#{avg} mesg_avg_ms] -- mesg.id=#{mesg.id}")

        # If cb *is* given and mesg.id is *not* defined, then
        # we also setup a listener for a response from the client.
        listen = cb? and not mesg.id?
        if listen
            # This message is not a response to a client request.
            # Instead, we are initiating a request to the user and we
            # want a result back (hence cb? being defined).
            mesg.id = misc.uuid()
            if not @call_callbacks?
                @call_callbacks = {}
            @call_callbacks[mesg.id] = cb
            f = () =>
                g = @call_callbacks?[mesg.id]
                if g?
                    delete @call_callbacks[mesg.id]
                    g("timed out")
            setTimeout(f, 15000) # timeout after some seconds

        t = new Date()
        json = to_json(mesg)
        tm = new Date() - t
        if tm > 10
            winston.debug("client=#{@id}, mesg.id=#{mesg.id}: time to json=#{tm}ms; length=#{json.length}; value='#{misc.trunc(json, 500)}'")
        @push_data_to_client(JSON_CHANNEL, json)
        if not listen
            cb?()
            return

    push_data_to_client: (channel, data) ->
        if @closed
            return
        #winston.debug("inside push_data_to_client(#{channel},'#{data}')")
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

        # Get user's group from database.
        @get_groups()

    signed_out: () =>
        @account_id = undefined

    #########################################################
    # Setting and getting HTTP-only cookies via Primus + AJAX
    #########################################################
    get_cookie: (opts) ->
        opts = defaults opts,
            name : required
            cb   : required   # cb(value)
        if not @conn?.id?
            # no connection or connection died
            return
        #winston.debug("!!!!  get cookie '#{opts.name}'")
        @once("get_cookie-#{opts.name}", (value) -> opts.cb(value))
        @push_to_client(message.cookies(id:@conn.id, get:opts.name, url:BASE_URL+"/cookies"))

    set_cookie: (opts) ->
        opts = defaults opts,
            name  : required
            value : required
            ttl   : undefined    # time in seconds until cookie expires
        if not @conn?.id?
            # no connection or connection died
            return

        options = {}
        if opts.ttl?
            options.expires = new Date(new Date().getTime() + 1000*opts.ttl)
        @cookies[opts.name] = {value:opts.value, options:options}
        @push_to_client(message.cookies(id:@conn.id, set:opts.name, url:BASE_URL+"/cookies", value:opts.value))

    remember_me: (opts) ->
        #############################################################
        # Remember me.  There are many ways to implement
        # "remember me" functionality in a web app. Here's how
        # we do it with SMC:    We generate a random uuid,
        # which along with salt, is stored in the user's
        # browser as an httponly cookie.  We password hash the
        # random uuid and store that in our database.  When
        # the user later visits the SMC site, their browser
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
        # Regarding ttl, we use 1 year.  The database will forget
        # the cookie automatically at the same time that the
        # browser invalidates it.
        #
        #############################################################

        # WARNING: The code below is somewhat replicated in
        # passport_login.

        opts = defaults opts,
            email_address : required
            account_id    : required
            cb            : undefined

        opts.hub = program.host
        opts.remember_me = true

        opts0 = misc.copy(opts)
        delete opts0.cb
        signed_in_mesg   = message.signed_in(opts0)
        session_id       = uuid.v4()
        @hash_session_id = auth.password_hash(session_id)
        ttl              = 24*3600 * 30     # 30 days

        x = @hash_session_id.split('$')    # format:  algorithm$salt$iterations$hash
        @_remember_me_value = [x[0], x[1], x[2], session_id].join('$')
        @set_cookie
            name  : BASE_URL + 'remember_me'
            value : @_remember_me_value
            ttl   : ttl

        database.save_remember_me
            account_id : opts.account_id
            hash       : @hash_session_id
            value      : signed_in_mesg
            ttl        : ttl
            cb         : opts.cb

    invalidate_remember_me: (opts) ->
        opts = defaults opts,
            cb : required

        if @hash_session_id?
            database.delete_remember_me
                hash : @hash_session_id
                cb   : opts.cb
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

        ## Only enable this when doing low level debugging -- performance impacts AND leakage of dangerous info!
        if DEBUG2
            winston.debug("handle_data_from_client('#{misc.trunc(data.toString(),400)}')")

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
            if channel != 'X'  # X is a special case used on purpose -- not an error.
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
        if @_ignore_client
            return
        try
            mesg = from_json(data)
        catch error
            winston.error("error parsing incoming mesg (invalid JSON): #{mesg}")
            return
        #winston.debug("got message: #{data}")
        if mesg.event != 'ping'
            winston.debug("hub <-- client (client=#{@id}): #{misc.trunc(to_safe_str(mesg), 120)}")

        # check for message that is coming back in response to a request from the hub
        if @call_callbacks? and mesg.id?
            f = @call_callbacks[mesg.id]
            if f?
                delete @call_callbacks[mesg.id]
                f(undefined, mesg)
                return

        if mesg.id?
            @_messages.being_handled[mesg.id] = new Date()

        handler = @["mesg_#{mesg.event}"]
        if handler?
            handler(mesg)
        else
            @push_to_client(message.error(error:"Hub does not know how to handle a '#{mesg.event}' event.", id:mesg.id))
            if mesg.event == 'get_all_activity'
                winston.debug("ignoring all further messages from old client=#{@id}")
                @_ignore_client = true

    ######################################################
    # ping/pong
    ######################################################
    mesg_ping: (mesg) =>
        @push_to_client(message.pong(id:mesg.id, now:new Date()))

    ######################################################
    # Messages: Sessions
    ######################################################
    mesg_start_session: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to start a session."))
            return

        switch mesg.type
            when 'console'
                @connect_to_console_session(mesg)
            else
                @error_to_client(id:mesg.id, error:"Unknown message type '#{mesg.type}'")

    mesg_connect_to_session: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to start a session."))
            return
        switch mesg.type
            when 'console'
                if not mesg.params?.path? or not mesg.params?.filename?
                    @push_to_client(message.error(id:mesg.id, error:"console session path and filename must be defined"))
                    return
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
    # Messages: Account creation, deletion, sign in, sign out
    ######################################################
    mesg_create_account: (mesg) =>
        create_account(@, mesg)

    mesg_delete_account: (mesg) =>
        delete_account(mesg, @, @push_to_client)

    mesg_sign_in: (mesg) => sign_in(@,mesg)

    mesg_sign_out: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"Not signed in."))
            return

        if mesg.everywhere
            # invalidate all remeber_me cookies
            database.invalidate_all_remember_me
                account_id : @account_id
        @signed_out()  # deletes @account_id... so must be below database call above
        # invalidate the remember_me on this browser
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

    mesg_unlink_passport: (mesg) =>
        if not @account_id
            @error_to_client(id:mesg.id, error:"must be logged in")
        else
            database.delete_passport
                account_id : @account_id
                strategy   : mesg.strategy
                id         : mesg.id
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @success_to_client(id:mesg.id)

    ######################################################
    # Messages: Account settings
    ######################################################
    get_groups: (cb) =>
        # see note above about our "infinite caching".  Maybe a bad idea.
        if @groups?
            cb?(undefined, @groups)
            return
        database.get_account
            columns    : ['groups']
            account_id : @account_id
            cb         : (err, r) =>
                if err
                    cb?(err)
                else
                    @groups = r['groups']
                    cb?(undefined, @groups)

    ######################################################
    # Messages: Log errors that client sees so we can also look at them
    ######################################################

    mesg_log_client_error: (mesg) =>
        winston.debug("log_client_error: #{misc.to_json(mesg.error)}")
        if not mesg.type?
            mesg.type = "error"
        if not mesg.error?
            mesg.error = "error"
        database.log_client_error
            event      : mesg.type
            error      : mesg.error
            account_id : @account_id

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
        dbg = (m) -> winston.debug("get_project(client=#{@id}, #{mesg.project_id}): #{m}")

        err = undefined
        if not mesg.project_id?
            err = "mesg must have project_id attribute -- #{to_safe_str(mesg)}"
        else if not @account_id?
            err = "user must be signed in before accessing projects"

        if err
            if mesg.id?
                @error_to_client(id:mesg.id, error:err)
            cb(err)
            return

        key = mesg.project_id + permission
        project = @_project_cache?[key]
        if project?
            # Use the cached project so we don't have to re-verify authentication
            # for the user again below, which
            # is very expensive.  This cache does expire, in case user
            # is kicked out of the project.
            cb(undefined, project)
            return

        dbg()
        async.series([
            (cb) =>
                switch permission
                    when 'read'
                        access.user_has_read_access_to_project
                            project_id     : mesg.project_id
                            account_id     : @account_id
                            account_groups : @groups
                            database       : database
                            cb             : (err, result) =>
                                if err
                                    cb("Internal error determining user permission -- #{err}")
                                else if not result
                                    cb("User #{@account_id} does not have read access to project #{mesg.project_id}")
                                else
                                    # good to go
                                    cb()
                    when 'write'
                        access.user_has_write_access_to_project
                            database       : database
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
        ], (err) =>
            if err
                if mesg.id?
                    @error_to_client(id:mesg.id, error:err)
                dbg("error -- #{err}")
                cb(err)
            else
                project = hub_projects.new_project(mesg.project_id, database, compute_server)
                database.touch_project(project_id:mesg.project_id)
                if not @_project_cache?
                    @_project_cache = {}
                @_project_cache[key] = project
                # cache for a while
                setTimeout((()=>delete @_project_cache[key]), CACHE_PROJECT_AUTH_MS)
                dbg("got project; caching and returning")
                cb(undefined, project)
        )

    mesg_create_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to create a new project.")
            return
        @touch()

        dbg = (m) -> winston.debug("mesg_create_project(#{misc.to_json(mesg)}): #{m}")

        project_id = undefined
        project    = undefined
        location   = undefined

        async.series([
            (cb) =>
                dbg("create project entry in database")
                database.create_project
                    account_id  : @account_id
                    title       : mesg.title
                    description : mesg.description
                    cb          : (err, _project_id) =>
                        project_id = _project_id; cb(err)
            (cb) =>
                dbg("open project...")
                # We do the open/state below so that when user tries to open it in a moment it opens more quickly;
                # also, in single dev mode, this ensures that project path is created, so can copy
                # files to the project, etc.
                # Also, if mesg.start is set, the project gets started below.
                compute_server.project
                    project_id : project_id
                    cb         : (err, project) =>
                        if err
                            dbg("failed to get project -- #{err}")
                        else
                            async.series([
                                (cb) =>
                                    project.open(cb:cb)
                                (cb) =>
                                    project.state(cb:cb, force:true, update:true)
                                (cb) =>
                                    if mesg.start
                                        project.start(cb:cb)
                                    else
                                        dbg("not auto-starting the new project")
                                        cb()
                            ], (err) =>
                                dbg("open project and get state: #{err}")
                            )
                cb() # we don't need to wait for project to open before responding to user that project was created.
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

    mesg_project_exec: (mesg) =>
        if mesg.command == "ipython-notebook"
            # we just drop these messages, which are from old non-updated clients (since we haven't
            # written code yet to not allow them to connect -- TODO!).
            return
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

    mesg_copy_path_between_projects: (mesg) =>
        @touch()
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
                        access.user_has_read_access_to_project
                            project_id     : mesg.src_project_id
                            account_id     : @account_id
                            account_groups : @groups
                            database       : database
                            cb             : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("user must have read access to source project #{mesg.src_project_id}")
                                else
                                    cb()
                    (cb) =>
                        access.user_has_write_access_to_project
                            database       : database
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
                compute_server.project
                    project_id : mesg.src_project_id
                    cb         : (err, project) =>
                        if err
                            cb(err); return
                        else
                            project.copy_path
                                path              : mesg.src_path
                                target_project_id : mesg.target_project_id
                                target_path       : mesg.target_path
                                overwrite_newer   : mesg.overwrite_newer
                                delete_missing    : mesg.delete_missing
                                backup            : mesg.backup
                                timeout           : mesg.timeout
                                exclude_history   : mesg.exclude_history
                                cb                : cb
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

            if mesg.message.event == 'project_exec' and mesg.message.command == "ipython-notebook"
                # we just drop these messages, which are from old non-updated clients (since we haven't
                # written code yet to not allow them to connect -- TODO!).
                return

            # It's extremely useful if the local hub has a way to distinguish between different clients who are
            # being proxied through the same hub.
            mesg.message.client_id = @id

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
        @touch()
        database.user_search
            query : mesg.query
            limit : mesg.limit
            cb    : (err, results) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.user_search_results(id:mesg.id, results:results))

    mesg_invite_collaborator: (mesg) =>
        @touch()
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
        @touch()
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

            invite_user = (email_address, cb) =>
                winston.debug("inviting #{email_address}")
                if not misc.is_valid_email_address(email_address)
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
                            winston.debug("user #{email_address} doesn't have an account yet -- may send email (if we haven't recently)")
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
                            database.when_sent_project_invite
                                project_id : mesg.project_id
                                to         : email_address
                                cb         : (err, when_sent) =>
                                    if err
                                        cb(err)
                                    else if when_sent - 0 >= misc.days_ago(7) - 0 # successfully sent < one week ago -- don't again
                                        done = true
                                        cb()
                                    else
                                        cb()
                    (cb) =>
                        if done
                            cb()
                        else
                            cb()
                            # send an email to the user -- async, not blocking user.
                            # TODO: this can take a while -- we need to take some action
                            # if it fails, e.g., change a setting in the projects table!
                            subject  = "SageMathCloud Invitation"
                            # override subject if explicitly given
                            if mesg.subject?
                                subject  = mesg.subject

                            if mesg.link2proj? # make sure invitees know where to go
                                base_url = mesg.link2proj.split("/")
                                base_url = "#{base_url[0]}//#{base_url[2]}"
                                direct_link = "Then go to <a href='#{mesg.link2proj}'>project '#{mesg.title}'</a>."
                            else # fallback for outdated clients
                                base_url = 'https://cloud.sagemath.com/'
                                direct_link = ''

                            # asm_group: 699 is for invites https://app.sendgrid.com/suppressions/advanced_suppression_manager
                            opts =
                                to           : email_address
                                bcc          : 'invites@sagemath.com'
                                fromname     : 'SageMathCloud'
                                from         : 'invites@sagemath.com'
                                replyto      : mesg.replyto ? 'help@sagemath.com'
                                replyto_name : mesg.replyto_name
                                subject      : subject
                                category     : "invite"
                                asm_group    : 699
                                body         : email + """<br/><br/>
                                               <b>To accept the invitation, please sign up at
                                               <a href='#{base_url}'>#{base_url}</a>
                                               using exactly the email address '#{email_address}'.
                                               #{direct_link}</b><br/>"""
                                cb           : (err) =>
                                    if err
                                        winston.debug("FAILED to send email to #{email_address}  -- err={misc.to_json(err)}")
                                    database.sent_project_invite
                                        project_id : mesg.project_id
                                        to         : email_address
                                        error      : err
                            send_email(opts)

                ], cb)

            async.map to, invite_user, (err, results) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.invite_noncloud_collaborators_resp(id:mesg.id, mesg:"Invited #{mesg.to} to collaborate on a project."))

    mesg_remove_collaborator: (mesg) =>
        @touch()
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            # See "Security note" in mesg_invite_collaborator
            database.remove_collaborator_from_project
                project_id : mesg.project_id
                account_id : mesg.account_id
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))


    ######################################################
    # Blobs
    ######################################################
    mesg_remove_blob_ttls: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"not yet signed in"))
        else
            database.remove_blob_ttls
                uuids : mesg.uuids
                cb    : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    ################################################
    # The version of the running server.
    ################################################
    mesg_version: (mesg) =>
        @smc_version = mesg.version
        winston.debug("client.smc_version=#{mesg.version}")
        if mesg.version < smc_version.version
            @push_version_update()

    push_version_update: =>
        @push_to_client(message.version(version:smc_version.version, min_version:smc_version.min_browser_version))
        if smc_version.min_browser_version and @smc_version and @smc_version < smc_version.min_browser_version
            # Client is running an unsupported bad old version.
            # Brutally disconnect client!  It's critical that they upgrade, since they are
            # causing problems or have major buggy code.
            if new Date() - @_when_connected <= 30000
                # If they just connected, kill the connection instantly
                @conn.end()
            else
                # Wait 1 minute to give them a chance to save data...
                setTimeout((()=>@conn.end()), 60000)

    ################################################
    # Administration functionality
    ################################################
    user_is_in_group: (group) =>
        return @groups? and group in @groups

    mesg_project_set_quotas: (mesg) =>
        if not @user_is_in_group('admin')
            @error_to_client(id:mesg.id, error:"must be logged in and a member of the admin group to set project quotas")
        else if not misc.is_valid_uuid_string(mesg.project_id)
            @error_to_client(id:mesg.id, error:"invalid project_id")
        else
            project = undefined
            dbg = @dbg("mesg_project_set_quotas(project_id='#{mesg.project_id}')")
            async.series([
                (cb) =>
                    dbg("update base quotas in the database")
                    database.set_project_settings
                        project_id : mesg.project_id
                        settings   : misc.copy_without(mesg, ['event', 'id'])
                        cb         : cb
                (cb) =>
                    dbg("get project from compute server")
                    compute_server.project
                        project_id : mesg.project_id
                        cb         : (err, p) =>
                            project = p; cb(err)
                (cb) =>
                    dbg("determine total quotas and apply")
                    project.set_all_quotas(cb:cb)
            ], (err) =>
                if err
                    @error_to_client(id:mesg.id, error:"problem setting project quota -- #{err}")
                else
                    @push_to_client(message.success(id:mesg.id))
            )

    ################################################
    # Public/published projects data
    ################################################
    path_is_in_public_paths: (path, paths) =>
        #winston.debug("path_is_in_public_paths('#{path}', #{misc.to_json(paths)})")
        return misc.path_is_in_public_paths(path, misc.keys(paths))

    # Get a compute.Project object, or cb an error if the given path in the project isn't public.
    # This is just like getting a project, but first ensures that given path is public.
    get_public_project: (opts) =>
        opts = defaults opts,
            project_id : undefined
            path       : undefined
            use_cache  : true
            cb         : required

        if not opts.project_id?
            opts.cb("get_public_project: project_id must be defined")
            return

        if not opts.path?
            opts.cb("get_public_project: path must be defined")
            return

        # determine if path is public in given project, without using cache to determine paths; this *does* cache the result.
        database.path_is_public
            project_id : opts.project_id
            path       : opts.path
            cb         : (err, is_public) =>
                if err
                    opts.cb(err)
                    return
                if is_public
                    compute_server.project
                        project_id : opts.project_id
                        cb         : opts.cb
                else
                    # no
                    opts.cb("path '#{opts.path}' of project with id '#{opts.project_id}' is not public")

    mesg_public_get_directory_listing: (mesg) =>
        for k in ['path', 'project_id']
            if not mesg[k]?
                @error_to_client(id:mesg.id, error:"must specify #{k}")
                return

        # We only require that there is at least one public path.  If so,
        # we then get this listing and if necessary filter out the not public
        # entries in the listing.
        project = undefined
        listing  = undefined
        async.series([
            (cb) =>
                database.has_public_path
                    project_id : mesg.project_id
                    cb         : (err, is_public) =>
                        if err
                            cb(err)
                        else if not is_public
                            cb("not_public") # be careful about changing this. This is a specific error we're giving now when a directory is not public.
                            # Client figures out context and gives more detailed error message. Right now we use it in src/smc-webapp/project_files.cjsx
                            # to provide user with helpful context based error about why they can't access a given directory
                        else
                            cb()
            (cb) =>
                compute_server.project
                    project_id : mesg.project_id
                    cb         : (err, x) =>
                        project = x; cb(err)
            (cb) =>
                project.directory_listing
                    path    : mesg.path
                    hidden  : mesg.hidden
                    time    : mesg.time
                    start   : mesg.start
                    limit   : mesg.limit
                    cb      : (err, x) =>
                        listing = x; cb(err)
            (cb) =>
                database.filter_public_paths
                    project_id : mesg.project_id
                    path       : mesg.path
                    listing    : listing
                    cb         : (err, x) =>
                        listing = x; cb(err)
        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.public_directory_listing(id:mesg.id, result:listing))
        )

    mesg_public_get_text_file: (mesg) =>
        if not mesg.path?
            @error_to_client(id:mesg.id, error:'must specify path')
            return
        @get_public_project
            project_id : mesg.project_id
            path       : mesg.path
            cb         : (err, project) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                    return
                project.read_file
                    path    : mesg.path
                    maxsize : 20000000  # restrict to 20MB limit
                    cb      : (err, data) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            # since this is get_text_file
                            data = data.toString('utf-8')
                            @push_to_client(message.public_text_file_contents(id:mesg.id, data:data))

    mesg_copy_public_path_between_projects: (mesg) =>
        @touch()
        if not mesg.src_project_id?
            @error_to_client(id:mesg.id, error:"src_project_id must be defined")
            return
        if not mesg.target_project_id?
            @error_to_client(id:mesg.id, error:"target_project_id must be defined")
            return
        if not mesg.src_path?
            @error_to_client(id:mesg.id, error:"src_path must be defined")
            return
        project = undefined
        async.series([
            (cb) =>
                # ensure user can write to the target project
                access.user_has_write_access_to_project
                    database       : database
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
            (cb) =>
                @get_public_project
                    project_id : mesg.src_project_id
                    path       : mesg.src_path
                    cb         : (err, x) =>
                        project = x
                        cb(err)
            (cb) =>
                project.copy_path
                    path            : mesg.src_path
                    target_project_id : mesg.target_project_id
                    target_path     : mesg.target_path
                    overwrite_newer : mesg.overwrite_newer
                    delete_missing  : mesg.delete_missing
                    timeout         : mesg.timeout
                    exclude_history : mesg.exclude_history
                    backup          : mesg.backup
                    cb              : cb
        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.success(id:mesg.id))
        )

    ###
    # DataQuery
    ###
    mesg_query: (mesg) =>
        query = mesg.query
        if not query?
            @error_to_client(id:mesg.id, error:"malformed query")
            return
        dbg = @dbg("user_query")
        # CRITICAL: don't enable this except for serious debugging, since it can result in HUGE output
        #dbg("account_id=#{@account_id} makes query='#{misc.to_json(query)}'")
        first = true
        if mesg.changes
            @_query_changefeeds ?= {}
            @_query_changefeeds[mesg.id] = true
        mesg_id = mesg.id
        database.user_query
            account_id : @account_id
            query      : query
            options    : mesg.options
            changes    : if mesg.changes then mesg_id
            cb         : (err, result) =>
                if err
                    dbg("user_query error: #{misc.to_json(err)}")
                    if @_query_changefeeds?[mesg_id]
                        delete @_query_changefeeds[mesg_id]
                    @error_to_client(id:mesg_id, error:err)
                    if mesg.changes and not first
                        # also, assume changefeed got messed up, so cancel it.
                        database.user_query_cancel_changefeed(id : mesg_id)
                else
                    ##if Math.random() <= .3  # for testing -- force forgetting about changefeed with probability 10%.
                    ##    delete @_query_changefeeds[mesg_id]
                    if mesg.changes and not first
                        resp = result
                        resp.id = mesg_id
                        resp.multi_response = true
                        #winston.debug("CHANGE UPDATE: sending #{misc.to_json(resp)}")
                    else
                        first = false
                        resp = mesg
                        resp.query = result
                    @push_to_client(resp)
                    #setTimeout((=>@push_to_client(mesg)),Math.random()*5000)

    query_cancel_all_changefeeds: (cb) =>
        if not @_query_changefeeds? or misc.len(@_query_changefeeds) == 0
            cb?(); return
        dbg = @dbg("query_cancel_all_changefeeds")
        v = @_query_changefeeds
        dbg("canceling #{v.length} changefeeds")
        delete @_query_changefeeds
        f = (id, cb) =>
            dbg("canceling id=#{id}")
            database.user_query_cancel_changefeed
                id : id
                cb : (err) =>
                    if err
                        dbg("FEED: warning #{id} -- error canceling a changefeed #{misc.to_json(err)}")
                    else
                        dbg("FEED: canceled changefeed -- #{id}")
                    cb()
        async.map(misc.keys(v), f, (err) => cb?(err))

    mesg_query_cancel: (mesg) =>
        if not @_query_changefeeds?
            # no changefeeds
            @success_to_client(id:mesg.id)
        else
            database.user_query_cancel_changefeed
                id : mesg.id
                cb : (err, resp) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        mesg.resp = resp
                        @push_to_client(mesg)
                        delete @_query_changefeeds?[mesg.id]

    mesg_query_get_changefeed_ids: (mesg) =>
        mesg.changefeed_ids = @_query_changefeeds ? {}
        @push_to_client(mesg)


    ############################################
    # Bulk information about several projects or accounts
    #############################################

    mesg_get_usernames: (mesg) =>
        if not @account_id?
            @error_to_client(id:mesg.id, error:"user must be signed in")
            return
        database.get_usernames
            account_ids : mesg.account_ids
            use_cache   : true
            cb          : (err, usernames) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.usernames(usernames:usernames, id:mesg.id))

    ######################################################
    # Support Tickets → Zendesk
    ######################################################

    mesg_create_support_ticket: (mesg) =>
        dbg = @dbg("mesg_create_support_ticket")
        dbg("#{misc.to_json(mesg)}")

        m = underscore.omit(mesg, 'id', 'event')
        support.create_ticket m, (err, url) =>
            dbg("callback being called with #{err} and url: #{url}")
            if err?
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(
                    message.support_ticket_url(id:mesg.id, url: url))

    # retrieves the support tickets the user with the current account_id
    mesg_get_support_tickets: (mesg) =>
        dbg = @dbg("mesg_get_support_tickets")
        dbg("#{misc.to_json(mesg)}")
        if not @account_id
            err = "You must be signed in to use support related functions."
            @error_to_client(id:mesg.id, error:err)
            return

        support.get_support_tickets @account_id, (err, tickets) =>
            if err?
                @error_to_client(id:mesg.id, error:err)
            else
                dbg("tickets: #{misc.to_json(tickets)}")
                @push_to_client(
                    message.support_tickets(id:mesg.id, tickets: tickets))

    ######################################################
    #Stripe-integration billing code
    ######################################################
    ensure_fields: (mesg, fields) =>
        if not mesg.id?
            return false
        if typeof(fields) == 'string'
            fields = fields.split(' ')
        for f in fields
            if not mesg[f.trim()]?
                err = "invalid message; must have #{f} field"
                @error_to_client(id:mesg.id, error:err)
                return false
        return true

    stripe_get_customer_id: (id, cb) =>  # id = message id
        # cb(err, customer_id)
        #  - if err, then an error message with id the given id is sent to the
        #    user, so client code doesn't have to
        #  - if no customer info yet with stripe, then NOT an error; instead,
        #    customer_id is undefined.
        dbg = @dbg("stripe_get_customer_id")
        dbg()
        if not @account_id?
            err = "You must be signed in to use billing related functions."
            @error_to_client(id:id, error:err)
            cb(err)
            return
        if not stripe?
            err = "stripe billing not configured"
            dbg(err)
            @error_to_client(id:id, error:err)
            cb(err)
        else
            if @stripe_customer_id?
                dbg("using cached @stripe_customer_id")
                cb(undefined, @stripe_customer_id)
            else
                if @_stripe_customer_id_cbs?
                    @_stripe_customer_id_cbs.push({id:id, cb:cb})
                    return
                @_stripe_customer_id_cbs = [{id:id, cb:cb}]
                dbg('getting stripe_customer_id from db...')
                database.get_stripe_customer_id
                    account_id : @account_id
                    cb         : (err, customer_id) =>
                        @stripe_customer_id = customer_id  # cache for later
                        for x in @_stripe_customer_id_cbs
                            {id, cb} = x
                            if err
                                dbg("fail -- #{err}")
                                @error_to_client(id:id, error:err)
                                cb(err)
                            else
                                dbg("got result #{customer_id}")
                                cb(undefined, customer_id)
                        delete @_stripe_customer_id_cbs

    # like stripe_get_customer_id, except sends an error to the
    # user if they aren't registered yet, instead of returning undefined.
    stripe_need_customer_id: (id, cb) =>
        @dbg("stripe_need_customer_id")()
        @stripe_get_customer_id id, (err, customer_id) =>
            if err
                cb(err); return
            if not customer_id?
                err = "customer not defined"
                @stripe_error_to_client(id:id, error:err)
                cb(err); return
            cb(undefined, customer_id)

    stripe_get_customer: (id, cb) =>
        dbg = @dbg("stripe_get_customer")
        dbg("getting id")
        @stripe_get_customer_id id, (err, customer_id) =>
            if err
                dbg("failed -- #{err}")
                cb(err)
                return
            if not customer_id?
                dbg("no customer_id set yet")
                cb(undefined, undefined)
                return
            dbg("now getting stripe customer object")
            stripe.customers.retrieve customer_id, (err, customer) =>
                if err
                    dbg("failed -- #{err}")
                    @error_to_client(id:id, error:err)
                    cb(err)
                else
                    dbg("got it")
                    cb(undefined, customer)

    stripe_error_to_client: (opts) =>
        opts = defaults opts,
            id    : required
            error : required
        err = opts.error
        if typeof(err) != 'string'
            if err.stack?
                err = err.stack.split('\n')[0]
            else
                err = misc.to_json(err)
        @dbg("stripe_error_to_client")(err)
        @error_to_client(id:opts.id, error:err)

    mesg_stripe_get_customer: (mesg) =>
        dbg = @dbg("mesg_stripe_get_customer")
        dbg("get information from stripe about this customer, e.g., subscriptions, payment methods, etc.")
        @stripe_get_customer mesg.id, (err, customer) =>
            if err
                return
            resp = message.stripe_customer
                id                     : mesg.id
                stripe_publishable_key : stripe?.publishable_key
                customer               : customer
            @push_to_client(resp)

    mesg_stripe_create_source: (mesg) =>
        dbg = @dbg("mesg_stripe_get_customer")
        dbg("create a payment method (credit card) in stripe for this user")
        if not @ensure_fields(mesg, 'token')
            dbg("missing token field -- bailing")
            return
        dbg("looking up customer")
        @stripe_get_customer_id mesg.id, (err, customer_id) =>
            if err  # database or other major error (e.g., no stripe conf)
                    # @get_stripe_customer sends error message to user
                dbg("failed -- #{err}")
                return
            if not customer_id?
                dbg("create new stripe customer (from card token)")
                description = undefined
                email = undefined
                async.series([
                    (cb) =>
                        dbg("get identifying info about user")
                        database.get_account
                            columns    : ['email_address', 'first_name', 'last_name']
                            account_id : @account_id
                            cb         : (err, r) =>
                                if err
                                    cb(err)
                                else
                                    email = r.email_address
                                    description = "#{r.first_name} #{r.last_name}"
                                    dbg("they are #{description} with email #{email}")
                                    cb()
                    (cb) =>
                        dbg("creating stripe customer")
                        x =
                            source      : mesg.token
                            description : description
                            email       : email
                            metadata    :
                                account_id : @account_id
                        stripe.customers.create x, (err, customer) =>
                            if err
                                cb(err)
                            else
                                customer_id = customer.id
                                cb()
                    (cb) =>
                        dbg("success; now save customer id token to database")
                        database.set_stripe_customer_id
                            account_id  : @account_id
                            customer_id : customer_id
                            cb          : cb
                    (cb) =>
                        dbg("success; sync user account with stripe")
                        database.stripe_update_customer(account_id : @account_id, stripe : stripe, customer_id : customer_id,  cb: cb)
                ], (err) =>
                    if err
                        dbg("failed -- #{err}")
                        @stripe_error_to_client(id:mesg.id, error:err)
                    else
                        @success_to_client(id:mesg.id)
                )
            else
                dbg("add card to existing stripe customer")
                async.series([
                    (cb) =>
                        stripe.customers.createCard(customer_id, {card:mesg.token}, cb)
                    (cb) =>
                        dbg("success; sync user account with stripe")
                        database.stripe_update_customer(account_id : @account_id, stripe : stripe, customer_id : customer_id,  cb: cb)
                ], (err) =>
                    if err
                        @stripe_error_to_client(id:mesg.id, error:err)
                    else
                        @success_to_client(id:mesg.id)
                )

    mesg_stripe_delete_source: (mesg) =>
        dbg = @dbg("mesg_stripe_delete_source")
        dbg("delete a payment method for this user")
        if not @ensure_fields(mesg, 'card_id')
            dbg("missing card_id field")
            return
        customer_id = undefined
        async.series([
            (cb) =>
                @stripe_get_customer_id(mesg.id, (err, x) => customer_id = x; cb(err))
            (cb) =>
                if not customer_id?
                    cb("no customer information so can't delete source")
                else
                    stripe.customers.deleteCard(customer_id, mesg.card_id, cb)
            (cb) =>
                database.stripe_update_customer(account_id : @account_id, stripe : stripe, customer_id : customer_id, cb: cb)
        ], (err) =>
            if err
                @stripe_error_to_client(id:mesg.id, error:err)
            else
                @success_to_client(id:mesg.id)
        )

    mesg_stripe_set_default_source: (mesg) =>
        dbg = @dbg("mesg_stripe_set_default_source")
        dbg("set a payment method for this user to be the default")
        if not @ensure_fields(mesg, 'card_id')
            dbg("missing field card_id")
            return
        customer_id = undefined
        async.series([
            (cb) =>
                @stripe_get_customer_id(mesg.id, (err, x) => customer_id = x; cb(err))
            (cb) =>
                if not customer_id?
                    cb("no customer information so can't update source")
                else
                    dbg("now setting the default source in stripe")
                    stripe.customers.update(customer_id, {default_source:mesg.card_id}, cb)
            (cb) =>
                dbg("update database")
                database.stripe_update_customer(account_id : @account_id, stripe : stripe, customer_id : customer_id,  cb: cb)
        ], (err) =>
            if err
                dbg("failed -- #{err}")
                @stripe_error_to_client(id:mesg.id, error:err)
            else
                dbg("success")
                @success_to_client(id:mesg.id)
        )

    mesg_stripe_update_source: (mesg) =>
        dbg = @dbg("mesg_stripe_update_source")
        dbg("modify a payment method")

        if not @ensure_fields(mesg, 'card_id info')
            return
        if mesg.info.metadata?
            @error_to_client(id:mesg.id, error:"you may not change card metadata")
            return
        customer_id = undefined
        async.series([
            (cb) =>
                @stripe_get_customer_id(mesg.id, (err, x) => customer_id = x; cb(err))
            (cb) =>
                if not customer_id?
                    cb("no customer information so can't update source")
                else
                    stripe.customers.updateCard(customer_id, mesg.card_id, mesg.info, cb)
            (cb) =>
                database.stripe_update_customer(account_id : @account_id, stripe : stripe, customer_id : customer_id, cb: cb)
        ], (err) =>
            if err
                @stripe_error_to_client(id:mesg.id, error:err)
            else
                @success_to_client(id:mesg.id)
        )

    mesg_stripe_get_plans: (mesg) =>
        dbg = @dbg("mesg_stripe_get_plans")
        dbg("get descriptions of the available plans that the user might subscribe to")
        stripe.plans.list (err, plans) =>
            if err
                @stripe_error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.stripe_plans(id: mesg.id, plans: plans))

    mesg_stripe_create_subscription: (mesg) =>
        dbg = @dbg("mesg_stripe_create_subscription")
        dbg("create a subscription for this user, using some billing method")
        if not @ensure_fields(mesg, 'plan')
            @stripe_error_to_client(id:mesg.id, error:"missing field 'plan'")
            return

        schema = require('smc-util/schema').PROJECT_UPGRADES.membership[mesg.plan.split('-')[0]]
        if not schema?
            @stripe_error_to_client(id:mesg.id, error:"unknown plan -- '#{mesg.plan}'")
            return

        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                dbg("fail -- #{err}")
                return
            projects = mesg.projects
            if not mesg.quantity?
                mesg.quantity = 1

            options =
                plan     : mesg.plan
                quantity : mesg.quantity
                coupon   : mesg.coupon

            subscription = undefined
            tax_rate = undefined
            async.series([
                (cb) =>
                    dbg('determine applicable tax')
                    stripe_sales_tax
                        customer_id : customer_id
                        cb          : (err, rate) =>
                            tax_rate = rate
                            dbg("tax_rate = #{tax_rate}")
                            if tax_rate
                                # CRITICAL: if we don't just multiply by 100, since then sometimes
                                # stripe comes back with an error like this
                                #    "Error: Invalid decimal: 8.799999999999999; must contain at maximum two decimal places."
                                options.tax_percent = Math.round(tax_rate*100*100)/100
                            cb(err)
                (cb) =>
                    dbg("add customer subscription to stripe")
                    stripe.customers.createSubscription customer_id, options, (err, s) =>
                        if err
                            cb(err)
                        else
                            subscription = s
                            cb()
                (cb) =>
                    if schema.cancel_at_period_end
                        dbg("Setting subscription to cancel at period end")
                        stripe.customers.cancelSubscription(customer_id, subscription.id, {at_period_end:true}, cb)
                    else
                        cb()
                (cb) =>
                    dbg("Successfully added subscription; now save info in our database about subscriptions....")
                    database.stripe_update_customer(account_id : @account_id, stripe : stripe, customer_id : customer_id, cb: cb)
            ], (err) =>
                if err
                    dbg("fail -- #{err}")
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @success_to_client(id:mesg.id)
            )

    mesg_stripe_cancel_subscription: (mesg) =>
        dbg = @dbg("mesg_stripe_cancel_subscription")
        dbg("cancel a subscription for this user")
        if not @ensure_fields(mesg, 'subscription_id')
            dbg("missing field subscription_id")
            return
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            projects        = undefined
            subscription_id = mesg.subscription_id
            async.series([
                (cb) =>
                    dbg("cancel the subscription at stripe")
                    # This also returns the subscription, which lets
                    # us easily get the metadata of all projects associated to this subscription.
                    stripe.customers.cancelSubscription(customer_id, subscription_id, {at_period_end:mesg.at_period_end}, cb)
                (cb) =>
                    database.stripe_update_customer(account_id : @account_id, stripe : stripe, customer_id : customer_id, cb: cb)
            ], (err) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @success_to_client(id:mesg.id)
            )


    mesg_stripe_update_subscription: (mesg) =>
        dbg = @dbg("mesg_stripe_update_subscription")
        dbg("edit a subscription for this user")
        if not @ensure_fields(mesg, 'subscription_id')
            dbg("missing field subscription_id")
            return
        subscription_id = mesg.subscription_id
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            subscription = undefined
            async.series([
                (cb) =>
                    dbg("Update the subscription.")
                    changes =
                        quantity : mesg.quantity
                        plan     : mesg.plan
                        coupon   : mesg.coupon
                    stripe.customers.updateSubscription(customer_id, subscription_id, changes, cb)
                (cb) =>
                    database.stripe_update_customer(account_id : @account_id, stripe : stripe, customer_id : customer_id, cb: cb)
            ], (err) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @success_to_client(id:mesg.id)
            )

    mesg_stripe_get_subscriptions: (mesg) =>
        dbg = @dbg("mesg_stripe_get_subscriptions")
        dbg("get a list of all the subscriptions that this customer has")
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            options =
                limit          : mesg.limit
                ending_before  : mesg.ending_before
                starting_after : mesg.starting_after
            stripe.customers.listSubscriptions customer_id, options, (err, subscriptions) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.stripe_subscriptions(id:mesg.id, subscriptions:subscriptions))

    mesg_stripe_get_charges: (mesg) =>
        dbg = @dbg("mesg_stripe_get_charges")
        dbg("get a list of charges for this customer.")
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            options =
                customer       : customer_id
                limit          : mesg.limit
                ending_before  : mesg.ending_before
                starting_after : mesg.starting_after
            stripe.charges.list options, (err, charges) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.stripe_charges(id:mesg.id, charges:charges))

    mesg_stripe_get_invoices: (mesg) =>
        dbg = @dbg("mesg_stripe_get_invoices")
        dbg("get a list of invoices for this customer.")
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            options =
                customer       : customer_id
                limit          : mesg.limit
                ending_before  : mesg.ending_before
                starting_after : mesg.starting_after
            stripe.invoices.list options, (err, invoices) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.stripe_invoices(id:mesg.id, invoices:invoices))

    mesg_stripe_admin_create_invoice_item: (mesg) =>
        if not @user_is_in_group('admin')
            @error_to_client(id:mesg.id, error:"must be logged in and a member of the admin group to create invoice items")
            return
        dbg = @dbg("mesg_stripe_admin_create_invoice_item")
        customer_id = undefined
        description = undefined
        email       = undefined
        new_customer = true
        async.series([
            (cb) =>
                dbg("check for existing stripe customer_id")
                database.get_account
                    columns       : ['stripe_customer_id', 'email_address', 'first_name', 'last_name', 'account_id']
                    account_id    : mesg.account_id
                    email_address : mesg.email_address
                    cb            : (err, r) =>
                        if err
                            cb(err)
                        else
                            customer_id = r.stripe_customer_id
                            email = r.email_address
                            description = "#{r.first_name} #{r.last_name}"
                            mesg.account_id = r.account_id
                            cb()
            (cb) =>
                if customer_id?
                    new_customer = false
                    dbg("already signed up for stripe -- sync local user account with stripe")
                    database.stripe_update_customer
                        account_id  : mesg.account_id
                        stripe      : stripe
                        customer_id : customer_id
                        cb          : cb
                else
                    dbg("create stripe entry for this customer")
                    x =
                        description : description
                        email       : email
                        metadata    :
                            account_id : mesg.account_id
                    stripe.customers.create x, (err, customer) =>
                        if err
                            cb(err)
                        else
                            customer_id = customer.id
                            cb()
            (cb) =>
                if not new_customer
                    cb()
                else
                    dbg("store customer id in our database")
                    database.set_stripe_customer_id
                        account_id  : mesg.account_id
                        customer_id : customer_id
                        cb          : cb
            (cb) =>
                if not (mesg.amount? and mesg.description?)
                    dbg("no amount or description -- not creating an invoice")
                    cb()
                else
                    dbg("now create the invoice item")
                    stripe.invoiceItems.create
                        customer    : customer_id
                        amount      : mesg.amount*100
                        currency    : "usd"
                        description : mesg.description
                    ,
                        (err, invoice_item) =>
                            if err
                                cb(err)
                            else
                                cb()
        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @success_to_client(id:mesg.id)
        )


##############################
# File use tracking
##############################

normalize_path = (path) ->
    # Rules:
    # kdkd/tmp/.test.sagews.sage-chat --> kdkd/tmp/test.sagews, comment "chat"
    # foo/bar/.2014-11-01-175408.ipynb.syncdoc --> foo/bar/2014-11-01-175408.ipynb
    path = misc.trunc_middle(path, 2048)  # prevent potential attacks/mistakes involving a large path breaking things...
    ext = misc.filename_extension(path)
    action = 'edit'
    {head, tail} = misc.path_split(path)
    if ext == "sage-chat"
        action = 'chat'  # editing sage-chat gets the extra important chat action (instead of just edit)
        if tail?[0] == '.'
            # hidden sage-chat associated to a regular file, so notify about the regular file
            path = path.slice(0, path.length-'.sage-chat'.length)
            {head, tail} = misc.path_split(path)
            tail = tail.slice(1) # get rid of .
            if head
                path = head + '/' + tail
            else
                path = tail
    else if ext.slice(0,7) == 'syncdoc'   # for IPython, and possibly other things later
        path = path.slice(0, path.length - ext.length - 1)
        {head, tail} = misc.path_split(path)
        tail = tail.slice(1) # get rid of .
        if head
            path = head + '/' + tail
        else
            path = tail
    else if ext == "sage-history"
        path = undefined
    #else if ext == '.sagemathcloud.log'  # ignore for now
    #    path = undefined
    return {path:path, action:action}

path_activity_cache = {}
path_activity = (opts) ->
    opts = defaults opts,
        account_id : required
        project_id : required
        path       : required
        client     : required
        cb         : undefined

    {path, action} = normalize_path(opts.path)
    winston.debug("path_activity(#{opts.account_id},#{opts.project_id},#{path}): #{action}")
    if not path?
        opts.cb?()
        return

    opts.client.touch
        project_id : opts.project_id
        path       : path
        action     : action
        force      : action == 'chat'
        cb         : opts.cb

##############################
# Create the Primus realtime socket server
##############################
primus_server = undefined
init_primus_server = (http_server) ->
    Primus = require('primus')
    # change also requires changing head.html
    opts =
        transformer : 'engine.io'    # 'websockets', 'engine.io','sockjs'
        pathname    : path_module.join(BASE_URL, '/hub')
    primus_server = new Primus(http_server, opts)
    winston.debug("primus_server: listening on #{opts.pathname}")
    primus_server.on "connection", (conn) ->
        winston.debug("primus_server: new connection from #{conn.address.ip} -- #{conn.id}")
        f = (data) ->
            id = data.toString()
            winston.debug("primus_server: got id='#{id}'")
            conn.removeListener('data',f)
            C = clients[id]
            #winston.debug("primus client ids=#{misc.to_json(misc.keys(clients))}")
            if C?
                if C.closed
                    winston.debug("primus_server: '#{id}' matches expired Client -- deleting")
                    delete clients[id]
                    C = undefined
                else
                    winston.debug("primus_server: '#{id}' matches existing Client -- re-using")

                    # In case the connection hadn't been officially ended yet the changefeeds might
                    # have been left open sending messages that won't get through. So ensure the client
                    # must recreate them all before continuing.
                    C.query_cancel_all_changefeeds()

                    cookies = new Cookies(conn.request)
                    if C._remember_me_value == cookies.get(BASE_URL + 'remember_me')
                        old_id = C.conn.id
                        C.conn.removeAllListeners()
                        C.conn = conn
                        conn.id = id
                        conn.write(conn.id)
                        C.install_conn_handlers()
                    else
                        winston.debug("primus_server: '#{id}' matches but cookies do not match, so not re-using")
                        C = undefined
            if not C?
                winston.debug("primus_server: '#{id}' unknown, so making a new Client with id #{conn.id}")
                conn.write(conn.id)
                clients[conn.id] = new Client(conn)

        conn.on("data",f)

#######################################################
# Pushing a message to clients; querying for clients.
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



reset_password = (email_address, cb) ->
    read = require('read')
    passwd0 = passwd1 = undefined
    account_id = undefined
    async.series([
        (cb) ->
            connect_to_database
                pool : 1
                cb   : cb
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
            # change the user's password in the database.
            database.change_password
                account_id    : account_id
                password_hash : auth.password_hash(passwd0)
                cb            : cb
    ], (err) ->
        if err
            winston.debug("Error -- #{err}")
        else
            winston.debug("Password changed for #{email_address}")
        cb?()
    )

########################################
# Account Management
########################################

password_crack_time = (password) -> Math.floor(zxcvbn.zxcvbn(password).crack_time/(3600*24.0)) # time to crack in days

#############################################################################
# User sign in
#
# Anti-DOS cracking throttling policy is basically like this, except we reset the counters
# each minute and hour, so a crafty attacker could get twice as many tries by finding the
# reset interval and hitting us right before and after.  This is an acceptable tradeoff
# for making the data structure trivial.
#
#   * POLICY 1: A given email address is allowed at most 3 failed login attempts per minute.
#   * POLICY 2: A given email address is allowed at most 30 failed login attempts per hour.
#   * POLICY 3: A given ip address is allowed at most 10 failed login attempts per minute.
#   * POLICY 4: A given ip address is allowed at most 50 failed login attempts per hour.
#############################################################################
sign_in_fails = {email_m:{}, email_h:{}, ip_m:{}, ip_h:{}}

clear_sign_in_fails_m = () ->
    sign_in_fails.email_m = {}
    sign_in_fails.ip_m = {}

clear_sign_in_fails_h = () ->
    sign_in_fails.email_h = {}
    sign_in_fails.ip_h = {}

_sign_in_fails_intervals = undefined

record_sign_in_fail = (opts) ->
    {email, ip} = defaults opts,
        email : required
        ip    : required
    if not _sign_in_fails_intervals?
        # only start clearing if there has been a failure...
        _sign_in_fails_intervals = [setInterval(clear_sign_in_fails_m, 60000), setInterval(clear_sign_in_fails_h, 60*60000)]

    winston.debug("WARNING: record_sign_in_fail(#{email}, #{ip})")
    s = sign_in_fails
    if not s.email_m[email]?
        s.email_m[email] = 0
    if not s.ip_m[ip]?
        s.ip_m[ip] = 0
    if not s.email_h[email]?
        s.email_h[email] = 0
    if not s.ip_h[ip]?
        s.ip_h[ip] = 0
    s.email_m[email] += 1
    s.email_h[email] += 1
    s.ip_m[ip] += 1
    s.ip_h[ip] += 1

sign_in_check = (opts) ->
    {email, ip} = defaults opts,
        email : required
        ip    : required
    s = sign_in_fails
    if s.email_m[email] > 3
        # A given email address is allowed at most 3 failed login attempts per minute
        return "Wait a minute, then try to login again.  If you can't remember your password, reset it or email help@sagemath.com."
    if s.email_h[email] > 30
        # A given email address is allowed at most 30 failed login attempts per hour.
        return "Wait an hour, then try to login again.  If you can't remember your password, reset it or email help@sagemath.com."
    if s.ip_m[ip] > 10
        # A given ip address is allowed at most 10 failed login attempts per minute.
        return "Wait a minute, then try to login again.  If you can't remember your password, reset it or email help@sagemath.com."
    if s.ip_h[ip] > 50
        # A given ip address is allowed at most 50 failed login attempts per hour.
        return "Wait an hour, then try to login again.  If you can't remember your password, reset it or email help@sagemath.com."
    return false

sign_in = (client, mesg, cb) ->
    dbg = (m) -> winston.debug("sign_in(#{mesg.email_address}): #{m}")
    dbg()
    tm = misc.walltime()

    sign_in_error = (error) ->
        dbg("sign_in_error -- #{error}")
        record_sign_in
            ip_address    : client.ip_address
            successful    : false
            email_address : mesg.email_address
            account_id    : account?.account_id
        client.push_to_client(message.sign_in_failed(id:mesg.id, email_address:mesg.email_address, reason:error))
        cb?(error)

    if not mesg.email_address
        sign_in_error("Empty email address.")
        return

    if not mesg.password
        sign_in_error("Empty password.")
        return

    mesg.email_address = misc.lower_email_address(mesg.email_address)

    m = sign_in_check
        email : mesg.email_address
        ip    : client.ip_address
    if m
        sign_in_error("sign_in_check fail(ip=#{client.ip_address}): #{m}")
        return

    signed_in_mesg = undefined
    account = undefined
    async.series([
        (cb) ->
            dbg("get account and check credentials")
            # NOTE: Despite people complaining, we do give away info about whether
            # the e-mail address is for a valid user or not.
            # There is no security in not doing this, since the same information
            # can be determined via the invite collaborators feature.
            database.get_account
                email_address : mesg.email_address
                columns       : ['password_hash', 'account_id', 'passports']
                cb            : (err, _account) ->
                    account = _account; cb(err)
        (cb) ->
            dbg("got account; now checking if password is correct...")
            auth.is_password_correct
                database      : database
                account_id    : account.account_id
                password      : mesg.password
                password_hash : account.password_hash
                cb            : (err, is_correct) ->
                    if err
                        cb("Error checking correctness of password -- #{err}")
                        return
                    if not is_correct
                        if not account.password_hash
                            cb("The account #{mesg.email_address} exists but doesn't have a password. Either set your password by clicking 'Forgot Password?' or log in using #{misc.keys(account.passports).join(', ')}.  If that doesn't work, email help@sagemath.com and we will sort this out.")
                        else
                            cb("Incorrect password for #{mesg.email_address}.  You can reset your password by clicking the 'Forgot Password?' link.   If that doesn't work, email help@sagemath.com and we will sort this out.")
                    else
                        cb()
        # remember me
        (cb) ->
            if mesg.remember_me
                dbg("remember_me -- setting the remember_me cookie")
                signed_in_mesg = message.signed_in
                    id            : mesg.id
                    account_id    : account.account_id
                    email_address : mesg.email_address
                    remember_me   : false
                    hub           : program.host + ':' + program.port
                client.remember_me
                    account_id    : signed_in_mesg.account_id
                    email_address : signed_in_mesg.email_address
                    cb            : cb
            else
                cb()
    ], (err) ->
        if err
            dbg("send error to user (in #{misc.walltime(tm)}seconds) -- #{err}")
            sign_in_error(err)
            cb?(err)
        else
            dbg("user got signed in fine (in #{misc.walltime(tm)}seconds) -- sending them a message")
            client.signed_in(signed_in_mesg)
            client.push_to_client(signed_in_mesg)
            cb?()
    )


# Record to the database a failed and/or successful login attempt.
record_sign_in = (opts) ->
    opts = defaults opts,
        ip_address    : required
        successful    : required
        email_address : undefined
        account_id    : undefined
        remember_me   : false
    if not opts.successful
        record_sign_in_fail
            email : opts.email_address
            ip    : opts.ip_address
    else
        database.log
            event : 'successful_sign_in'
            value :
                ip_address    : opts.ip_address
                email_address : opts.email_address ? null
                remember_me   : opts.remember_me
                account_id    : opts.account_id

is_valid_password = (password) ->
    [valid, reason] = client_lib.is_valid_password(password)
    if not valid
        return [valid, reason]
    return [true, '']


create_account = (client, mesg, cb) ->
    id = mesg.id
    account_id = null
    dbg = (m) -> winston.debug("create_account (#{mesg.email_address}): #{m}")
    tm = misc.walltime()
    if mesg.email_address?
        mesg.email_address = misc.lower_email_address(mesg.email_address)
    async.series([
        (cb) ->
            dbg("run tests on generic validity of input")
            # issues_with_create_account also does check is_valid_password!
            issues = client_lib.issues_with_create_account(mesg)

            # TODO -- only uncomment this for easy testing to allow any password choice.
            # the client test suite will then fail, which is good, so we are reminded to comment this out before release!
            # delete issues['password']

            if misc.len(issues) > 0
                cb(issues)
            else
                cb()

        (cb) ->
            # Make sure this ip address hasn't requested too many accounts recently,
            # just to avoid really nasty abuse, but still allow for demo registration
            # behind a single router.
            dbg("make sure not too many accounts were created from the given ip")
            database.count_accounts_created_by
                ip_address : client.ip_address
                age_s      : 60*30
                cb         : (err, n) ->
                    if err
                        cb(err)
                    else if n > 150
                        cb({'other':"Too many accounts are being created from the ip address #{client.ip_address}; try again later."})
                    else
                        cb()
        (cb) ->
            dbg("query database to determine whether the email address is available")
            database.account_exists
                email_address : mesg.email_address
                cb            : (error, not_available) ->
                    if error
                        cb('other':"Unable to create account.  Please try later. -- #{misc.to_json(error)}")
                    else if not_available
                        cb(email_address:"This e-mail address is already taken.")
                    else
                        cb()

        (cb) ->
            dbg("check that account is not banned")
            database.is_banned_user
                email_address : mesg.email_address
                cb            : (err, is_banned) ->
                    if err
                        cb('other':"Unable to create account.  Please try later.")
                    else if is_banned
                        cb(email_address:"This e-mail address is banned.")
                    else
                        cb()
        (cb) ->
            dbg("check if a registration token is required")
            database.get_server_setting
                name : 'account_creation_token'
                cb   : (err, token) =>
                    if not token
                        cb()
                    else
                        if token != mesg.token
                            cb(token:"Incorrect registration token.")
                        else
                            cb()
        (cb) ->
            dbg("create new account")
            database.create_account
                first_name    : mesg.first_name
                last_name     : mesg.last_name
                email_address : mesg.email_address
                password_hash : auth.password_hash(mesg.password)
                created_by    : client.ip_address
                cb: (error, result) ->
                    if error
                        cb({'other':"Unable to create account right now.  Please try later."})
                    else
                        account_id = result
                        database.log
                            event : 'create_account'
                            value :
                                account_id    : account_id
                                first_name    : mesg.first_name
                                last_name     : mesg.last_name
                                email_address : mesg.email_address
                                created_by    : client.ip_address
                            cb    : cb

        (cb) ->
            dbg("check for account creation actions")
            database.do_account_creation_actions
                email_address : mesg.email_address
                account_id    : account_id
                cb            : cb
        (cb) ->
            dbg("set remember_me cookie...")
            # so that proxy server will allow user to connect and
            # download images, etc., the very first time right after they make a new account.
            client.remember_me
                email_address : mesg.email_address
                account_id    : account_id
                cb            : cb
    ], (reason) ->
        if reason
            dbg("send message to user that there was an error (in #{misc.walltime(tm)}seconds) -- #{misc.to_json(reason)}")
            client.push_to_client(message.account_creation_failed(id:id, reason:reason))
            cb?("error creating account -- #{misc.to_json(reason)}")
        else
            dbg("send message back to user that they are logged in as the new user (in #{misc.walltime(tm)}seconds)")
            mesg1 = message.signed_in
                id            : mesg.id
                account_id    : account_id
                email_address : mesg.email_address
                first_name    : mesg.first_name
                last_name     : mesg.last_name
                remember_me   : false
                hub           : program.host + ':' + program.port
            client.signed_in(mesg1)
            client.push_to_client(mesg1)
            cb?()
    )

delete_account = (mesg, client, push_to_client) ->
    dbg = (m) -> winston.debug("delete_account(mesg.account_id): #{m}")
    dbg()

    database.mark_account_deleted
        account_id    : mesg.account_id
        cb            : (err) =>
            push_to_client(message.account_deleted(id:mesg.id, error:err))

change_password = (mesg, client_ip_address, push_to_client) ->
    account = null
    mesg.email_address = misc.lower_email_address(mesg.email_address)
    async.series([
        (cb) ->
            if not mesg.email_address?
                # There are no guarantees about incoming messages
                cb("email_address must be specified")
                return
            # get account and validate the password
            database.get_account
              email_address : mesg.email_address
              columns       : ['password_hash', 'account_id']
              cb : (error, result) ->
                if error
                    cb({other:error})
                    return
                account = result
                auth.is_password_correct
                    database             : database
                    account_id           : result.account_id
                    password             : mesg.old_password
                    password_hash        : account.password_hash
                    allow_empty_password : true
                    cb                   : (err, is_correct) ->
                        if err
                            cb(err)
                        else
                            if not is_correct
                                err = "invalid old password"
                                database.log
                                    event : 'change_password'
                                    value : {email_address:mesg.email_address, client_ip_address:client_ip_address, message:err}
                                cb(err)
                            else
                                cb()
        (cb) ->
            # check that new password is valid
            [valid, reason] = is_valid_password(mesg.new_password)
            if not valid
                cb({new_password:reason})
            else
                cb()

        (cb) ->
            # record current password hash (just in case?) and that we are changing password and set new password
            database.log
                event : "change_password"
                value :
                    account_id : account.account_id
                    client_ip_address : client_ip_address
                    previous_password_hash : account.password_hash

            database.change_password
                account_id    : account.account_id
                password_hash : auth.password_hash(mesg.new_password),
                cb            : cb
    ], (err) ->
        push_to_client(message.changed_password(id:mesg.id, error:err))
    )

change_email_address = (mesg, client_ip_address, push_to_client) ->

    dbg = (m) -> winston.debug("change_email_address(mesg.account_id, mesg.old_email_address, mesg.new_email_address): #{m}")
    dbg()

    mesg.old_email_address = misc.lower_email_address(mesg.old_email_address)
    mesg.new_email_address = misc.lower_email_address(mesg.new_email_address)

    if mesg.old_email_address == mesg.new_email_address  # easy case
        dbg("easy case -- no change")
        push_to_client(message.changed_email_address(id:mesg.id))
        return

    if not misc.is_valid_email_address(mesg.new_email_address)
        dbg("invalid email address")
        push_to_client(message.changed_email_address(id:mesg.id, error:'email_invalid'))
        return

    async.series([
        (cb) ->
            auth.is_password_correct
                database             : database
                account_id           : mesg.account_id
                password             : mesg.password
                allow_empty_password : true  # in case account created using a linked passport only
                cb                   : (err, is_correct) ->
                    if err
                        cb("Error checking password -- please try again in a minute -- #{err}.")
                    else if not is_correct
                        cb("invalid_password")
                    else
                        cb()

        (cb) ->
            # Record current email address (just in case?) and that we are
            # changing email address to the new one.  This will make it
            # easy to implement a "change your email address back" feature
            # if I need to at some point.
            dbg("log change to db")
            database.log
                event : 'change_email_address'
                value :
                    client_ip_address : client_ip_address
                    old_email_address : mesg.old_email_address
                    new_email_address : mesg.new_email_address
            #################################################
            # TODO: At this point, maybe we should send an email to
            # old_email_address with a temporary hash-code that can be used
            # to undo the change to the email address?
            #################################################
            dbg("actually make change in db")
            database.change_email_address
                account_id    : mesg.account_id
                email_address : mesg.new_email_address
                cb : cb
        (cb) ->
            # If they just changed email to an address that has some actions, carry those out...
            # TODO: move to hook this only after validation of the email address?
            database.do_account_creation_actions
                email_address : mesg.new_email_address
                account_id    : mesg.account_id
                cb            : cb
    ], (err) ->
        push_to_client(message.changed_email_address(id:mesg.id, error:err))
    )

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

    # This is an easy check to save work and also avoid empty email_address, which causes trouble below
    if not misc.is_valid_email_address(mesg.email_address)
        push_to_client(message.error(id:mesg.id, error:"Invalid email address."))
        return

    mesg.email_address = misc.lower_email_address(mesg.email_address)

    id = null
    async.series([
        (cb) ->
            # Record this password reset attempt in our database
            database.record_password_reset_attempt
                email_address : mesg.email_address
                ip_address    : client_ip_address
                cb            : cb
        (cb) ->
            # POLICY 1: We limit the number of password resets that an email address can receive
            database.count_password_reset_attempts
                email_address : mesg.email_address
                age_s         : 60*60  # 1 hour
                cb            : (err, count) ->
                    if err
                        cb(err)
                    else if count >= 31
                        cb("Too many password resets for this email per hour; try again later.")
                    else
                        cb()

        (cb) ->
            # POLICY 2: a given ip address can send at most 10 password reset requests per minute
            database.count_password_reset_attempts
                ip_address : client_ip_address
                age_s      : 60  # 1 minute
                cb         : (err, count) ->
                    if err
                        cb(err)
                    else if count > 10
                        cb("Too many password resets per minute; try again later.")
                    else
                        cb()
        (cb) ->
            # POLICY 3: a given ip can send at most 60 per hour
            database.count_password_reset_attempts
                ip_address : client_ip_address
                age_s      : 60*60  # 1 hour
                cb         : (err, count) ->
                    if err
                        cb(err)
                    else if count > 60
                        cb("Too many password resets per hour; try again later.")
                    else
                        cb()
        (cb) ->
            database.account_exists
                email_address : mesg.email_address
                cb : (err, exists) ->
                    if err
                        cb(err)
                    else if not exists
                        cb("No account with e-mail address #{mesg.email_address}")
                    else
                        cb()
        (cb) ->
            # We now know that there is an account with this email address.
            # put entry in the password_reset uuid:value table with ttl of
            # 1 hour, and send an email
            database.set_password_reset
                email_address : mesg.email_address
                ttl           : 60*60
                cb            : (err, _id) ->
                    id = _id; cb(err)
        (cb) ->
            # send an email to mesg.email_address that has a password reset link
            body = """
                <div>Hello,</div>
                <div>&nbsp;</div>
                <div>
                Somebody just requested to change the password of your SageMathCloud account.
                If you requested this password change, please click this link:</div>
                <div>&nbsp;</div>
                <div style="text-align: center;">
                <span style="font-size:12px;"><b>
                  <a href="https://cloud.sagemath.com#forgot-#{id}">https://cloud.sagemath.com#forgot-#{id}</a>
                </b></span>
                </div>
                <div>&nbsp;</div>
                <div>If you don't want to change your password, ignore this message.</div>
                <div>&nbsp;</div>
                <div>In case of problems, email
                <a href="mailto:help@sagemath.com">help@sagemath.com</a> immediately
                (or just reply to this email).
                <div>&nbsp;</div>
                """

            send_email
                subject : 'SageMathCloud Password Reset'
                body    : body
                from    : 'SageMath Help <help@sagemath.com>'
                to      : mesg.email_address
                category: "password_reset"
                cb      : cb
    ], (err) ->
        if err
            push_to_client(message.forgot_password_response(id:mesg.id, error:err))
        else
            push_to_client(message.forgot_password_response(id:mesg.id))
    )



reset_forgot_password = (mesg, client_ip_address, push_to_client) ->
    if mesg.event != 'reset_forgot_password'
        push_to_client(message.error(id:mesg.id, error:"incorrect message event type: #{mesg.event}"))
        return

    email_address = account_id = db = null

    async.series([
        (cb) ->
            # Verify password is valid and compute its hash.
            [valid, reason] = is_valid_password(mesg.new_password)
            if not valid
                cb(reason); return
            # Check that request is still valid
            database.get_password_reset
                id : mesg.reset_code
                cb   : (err, x) ->
                    if err
                        cb(err)
                    else if not x
                        cb("Password reset request is no longer valid.")
                    else
                        email_address = x
                        cb()
        (cb) ->
            # Get the account_id.
            database.get_account
                email_address : email_address
                columns       : ['account_id']
                cb            : (err, account) ->
                    account_id = account?.account_id; cb(err)
        (cb) ->
            # Make the change
            database.change_password
                account_id    : account_id
                password_hash : auth.password_hash(mesg.new_password)
                cb            : (err, account) ->
                    if err
                        cb(err)
                    else
                        # only allow successful use of this reset token once
                        database.delete_password_reset
                            id : mesg.reset_code
                            cb : cb
    ], (err) ->
        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:err))
    )

###
Connect to database
###
database = undefined

connect_to_database_rethink = (opts) ->
    opts = defaults opts,
        error : 120
        pool  : program.db_pool
        cb    : required
    dbg = (m) -> winston.debug("connect_to_database (rethinkdb): #{m}")
    if database? # already did this
        dbg("already done")
        opts.cb(); return
    dbg("connecting...")
    database = require('./rethink').rethinkdb
        hosts           : program.database_nodes.split(',')
        database        : program.keyspace
        error           : opts.error
        pool            : opts.pool
        concurrent_warn : program.db_concurrent_warn
        cb              : opts.cb

connect_to_database_postgresql = (opts) ->
    opts = defaults opts,
        error : 120
        pool  : program.db_pool
        cb    : required
    dbg = (m) -> winston.debug("connect_to_database (postgreSQL): #{m}")
    if database? # already did this
        dbg("already done")
        opts.cb(); return
    dbg("connecting...")
    require('./postgres').db
        host     : 'localhost'  # TODO
        database : 'smcdev'     # TODO  # and todo for other options...
        cb       : (err, db) ->
            if err
                database = undefined
                opts.cb(err)
            else
                database = db
                opts.cb()

connect_to_database = connect_to_database_postgresql
#connect_to_database = connect_to_database_rethink

# client for compute servers
compute_server = undefined
init_compute_server = (cb) ->
    winston.debug("init_compute_server: creating compute_server client")
    require('./compute-client.coffee').compute_server
        database : database
        dev      : program.dev
        single   : program.single
        base_url : BASE_URL
        cb       : (err, x) ->
            if not err
                winston.debug("compute server created")
            else
                winston.debug("FATAL ERROR creating compute server -- #{err}")
            compute_server = x
            database.compute_server = compute_server
            # This is used by the database when handling certain writes to make sure
            # that the there is a connection to the corresponding project, so that
            # the project can respond.
            database.ensure_connection_to_project = (project_id) ->
                local_hub_connection.connect_to_project(project_id, database, compute_server)

            cb?(err)


update_primus = (cb) ->
    misc_node.execute_code
        command : path_module.join(SMC_ROOT, WEBAPP_LIB, '/primus/update_primus')
        cb      : cb

#############################################
# Billing settings
# How to set in database:
#    db=require('rethink').rethinkdb();0
#    db.set_server_setting(cb:console.log, name:'stripe_publishable_key', value:???)
#    db.set_server_setting(cb:console.log, name:'stripe_secret_key',      value:???)
#############################################
stripe  = undefined
# TODO: this needs to listen to a changefeed on the database for changes to the server_settings table
init_stripe = (cb) ->
    dbg = (m) -> winston.debug("init_stripe: #{m}")
    dbg()

    billing_settings = {}

    async.series([
        (cb) ->
            database.get_server_setting
                name : 'stripe_secret_key'
                cb   : (err, secret_key) ->
                    if err
                        dbg("error getting stripe_secret_key")
                        cb(err)
                    else
                        if secret_key
                            dbg("go stripe secret_key")
                        else
                            dbg("invalid secret_key")
                        stripe = require("stripe")(secret_key)
                        cb()
        (cb) ->
            database.get_server_setting
                name : 'stripe_publishable_key'
                cb   : (err, value) ->
                    dbg("stripe_publishable_key #{err}, #{value}")
                    if err
                        cb(err)
                    else
                        stripe.publishable_key = value
                        cb()
    ], (err) ->
        if err
            dbg("error initializing stripe: #{err}")
        else
            dbg("successfully initialized stripe api")
        cb?(err)
    )

# Delete expired data from the database.
delete_expired = (cb) ->
    async.series([
        (cb) ->
            connect_to_database(error:99999, pool:5, cb:cb)
        (cb) ->
            database.delete_expired
                count_only        : false
                repeat_until_done : true
                cb                : cb
    ], cb)

blob_maintenance = (cb) ->
    async.series([
        (cb) ->
            connect_to_database(error:99999, pool:5, cb:cb)
        (cb) ->
            database.blob_maintenance(cb:cb)
    ], cb)

stripe_sync = (dump_only, cb) ->
    dbg = (m) -> winston.debug("stripe_sync: #{m}")
    dbg()
    users = undefined
    target = undefined
    async.series([
        (cb) ->
            dbg("connect to the database")
            connect_to_database(error:99999, cb:cb)
        (cb) ->
            dbg("initialize stripe")
            init_stripe(cb)
        (cb) ->
            dbg("get all customers from the database with stripe -- this is a full scan of the database and will take a while")
            # TODO: we could make this way faster by putting an index on the stripe_customer_id field.
            q = database.table('accounts').filter((r)->r.hasFields('stripe_customer_id'))
            q = q.pluck('account_id', 'stripe_customer_id', 'stripe_customer')
            q.run (err, x) ->
                users = x; cb(err)
        (cb) ->
            dbg("dump stripe_customer data to file for statistical analysis")
            target = "#{process.env.HOME}/stripe/"
            fs.exists target, (exists) ->
                if not exists
                    fs.mkdir(target, cb)
                else
                    cb()
        (cb) ->
            dbg('actually writing customer data')
            # NOTE: Of coure this is potentially one step out of date -- but in theory this should always be up to date
            dump = []
            for x in users
                # these could all be embarassing if this backup "got out" -- remove anything about actual credit card
                # and person's name/email.
                y = misc.copy_with(x.stripe_customer, ['created', 'subscriptions', 'metadata'])
                y.subscriptions = y.subscriptions?.data
                y.metadata = y.metadata?.account_id?.slice(0,8)
                dump.push(y)
            fs.writeFile("#{target}/stripe_customers-#{misc.to_iso(new Date())}.json", misc.to_json(dump), cb)
        (cb) ->
            if dump_only
                cb()
                return
            dbg("got #{users.length} users with stripe info")
            f = (x, cb) ->
                dbg("updating customer #{x.account_id} data to our local database")
                database.stripe_update_customer
                    account_id  : x.account_id
                    stripe      : stripe
                    customer_id : x.stripe_customer_id
                    cb          : cb
            async.mapLimit(users, 3, f, cb)
    ], (err) ->
        if err
            dbg("error updating customer info -- #{err}")
        else
            dbg("updated all customer info successfully")
        cb?(err)
    )


stripe_sales_tax = (opts) ->
    opts = defaults opts,
        customer_id : required
        cb          : required
    stripe.customers.retrieve opts.customer_id, (err, customer) ->
        if err
            opts.cb(err)
            return
        if not customer.default_source?
            opts.cb(undefined, 0)
            return
        zip = undefined
        state = undefined
        for x in customer.sources.data
            if x.id == customer.default_source
                zip = x.address_zip?.slice(0,5)
                state = x.address_state
                break
        if not zip? or state != 'WA'
            opts.cb(undefined, 0)
            return
        opts.cb(undefined, misc_node.sales_tax(zip))

# real-time reporting of hub metrics

MetricsRecorder = require('./metrics-recorder')
metricsRecorder = null

init_metrics = (cb) ->
    if program.statsfile?
        # make it absolute, with defaults it will sit next to the hub.log file
        if program.statsfile[0] != '/'
            STATS_FN = path_module.join(SMC_ROOT, program.statsfile)
        # make sure the directory exists
        dir = require('path').dirname(STATS_FN)
        if not fs.existsSync(dir)
            fs.mkdirSync(dir)
    else
        STATS_FN = null
    dbg = (msg) -> winston.info("MetricsRecorder: #{msg}")
    {number_of_clients} = require('./hub_register')
    collect = () ->
        try
            record_metric('nb_clients', number_of_clients(), MetricsRecorder.TYPE.CONT)
        catch err

    metricsRecorder = new MetricsRecorder.MetricsRecorder(STATS_FN, dbg, collect, cb)

# use record_metric to update its state

exports.record_metric = record_metric = (key, value, type) ->
    metricsRecorder?.record(key, value, type)

# Support Tickets

support = undefined
init_support = (cb) ->
    {Support} = require('./support')
    support = new Support cb: (err, s) =>
        support = s
        cb(err)


#############################################
# Start everything running
#############################################
BASE_URL = ''

exports.start_server = start_server = (cb) ->
    winston.debug("start_server")

    winston.debug("dev = #{program.dev}")

    # make sure base_url doesn't end in slash
    BASE_URL = program.base_url

    while BASE_URL and BASE_URL[BASE_URL.length-1] == '/'
        BASE_URL = BASE_URL.slice(0, BASE_URL.length-1)

    winston.debug("base_url='#{BASE_URL}'")
    fs.writeFileSync(path_module.join(SMC_ROOT, 'data', 'base_url'), BASE_URL)

    # the order of init below is important
    winston.debug("port = #{program.port}, proxy_port=#{program.proxy_port}")
    winston.info("using database #{program.keyspace}")
    hosts = program.database_nodes.split(',')
    http_server = express_router = undefined

    # Log anything that blocks the CPU for more than 10ms -- see https://github.com/tj/node-blocked
    blocked = require('blocked')
    blocked (ms) ->
        # filter values > 100 ms
        if ms > 100
            record_metric('blocked', ms, type=MetricsRecorder.TYPE.DISC)
        # record that something blocked for over 10ms
        winston.debug("BLOCKED for #{ms}ms")

    init_smc_version()

    async.series([
        (cb) ->
            if not program.port
                cb(); return
            init_metrics(cb)
        (cb) ->
            # this defines the global (to this file) database variable.
            winston.debug("Connecting to the database.")
            misc.retry_until_success
                f           : (cb) -> connect_to_database(cb:cb)
                start_delay : 1000
                max_delay   : 10000
                cb          : () ->
                    winston.debug("connected to database.")
                    cb()
        (cb) ->
            if not program.port
                cb(); return
            if program.dev or program.update
                winston.debug("updating the database schema...")
                database.update_schema(cb:cb)
            else
                cb()
        (cb) ->
            if not program.port
                cb(); return
            init_stripe(cb)
        (cb) ->
            if not program.port
                cb(); return
            init_support(cb)
        (cb) ->
            init_compute_server(cb)
        (cb) ->
            if not program.port
                cb(); return
            # proxy server and http server; this working etc. *relies* on compute_server having been created
            # However it can still serve many things without database.  TODO: Eventually it could inform user
            # that database isn't working.
            x = hub_http_server.init_express_http_server
                base_url       : BASE_URL
                dev            : program.dev
                stripe         : stripe
                compute_server : compute_server
                database       : database
                metricsRecorder: metricsRecorder
            {http_server, express_router} = x
            winston.debug("starting express webserver listening on #{program.host}:#{program.port}")
            http_server.listen(program.port, program.host, cb)
        (cb) ->
            if not program.port
                cb(); return
            async.parallel([
                (cb) ->
                    # init authentication via passport (requires database)
                    auth.init_passport
                        router   : express_router
                        database : database
                        base_url : BASE_URL
                        host     : program.host
                        cb       : cb
                (cb) ->
                    if program.dev or program.update
                        update_primus(cb)
                    else
                        cb()
            ], cb)
    ], (err) =>
        if err
            winston.error("Error starting hub services! err=#{err}")
        else
            # Synchronous initialize of other functionality, now that the database, etc., are working.
            winston.debug("base_url='#{BASE_URL}'")

            if program.port
                winston.debug("initializing primus websocket server")
                init_primus_server(http_server)

            if program.proxy_port
                winston.debug("initializing the http proxy server on port #{program.proxy_port}")
                hub_proxy.init_http_proxy_server
                    database       : database
                    compute_server : compute_server
                    base_url       : BASE_URL
                    port           : program.proxy_port
                    host           : program.host

            if program.port
                # Start updating stats cache every so often -- note: this is cached in the database, so it isn't
                # too big a problem if we call it too frequently.
                # Randomized start to balance between all hubs.
                # It's important that we call this periodically, or stats will only get stored to the
                # database when somebody happens to visit /stats
                d = 5000 + 60 * 1000 * Math.random()
                setTimeout((-> database.get_stats(); setInterval(database.get_stats, 120*1000)), d)

                # Register periodically with the database.
                hub_register.start
                    database   : database
                    clients    : clients
                    host       : program.host
                    port       : program.port
                    interval_s : REGISTER_INTERVAL_S

                winston.info("Started hub. HTTP port #{program.port}; keyspace #{program.keyspace}")
        cb?(err)
    )

###
# Command line admin stuff -- should maybe be moved to another program?
###
add_user_to_project = (project_id, email_address, cb) ->
    account_id = undefined
    async.series([
        # ensure database object is initialized
        (cb) ->
            connect_to_database(cb:cb)
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

command_line = () ->
    program = require('commander')          # command line arguments -- https://github.com/visionmedia/commander.js/
    daemon  = require("start-stop-daemon")  # don't import unless in a script; otherwise breaks in node v6+

    program.usage('[start/stop/restart/status/nodaemon] [options]')
        .option('--port <n>', 'port to listen on (default: 5000; 0 -- do not start)', ((n)->parseInt(n)), 5000)
        .option('--proxy_port <n>', 'port that the proxy server listens on (default: 0 -- do not start)', ((n)->parseInt(n)), 0)
        .option('--log_level [level]', "log level (default: debug) useful options include INFO, WARNING and DEBUG", String, "debug")
        .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
        .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', String, "data/pids/hub.pid")
        .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', String, "data/logs/hub.log")
        .option('--statsfile [string]', 'if set, this file contains periodically updated metrics (default: null, suggest value: "data/logs/stats.json")', String, null)
        .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
        .option('--keyspace [string]', 'Database name to use (default: "smc")', String, 'smc')
        .option('--passwd [email_address]', 'Reset password of given user', String, '')
        .option('--update', 'Update schema and primus on startup (always true for --dev; otherwise, false)')
        .option('--stripe_sync', 'Sync stripe subscriptions to database for all users with stripe id', String, 'yes')
        .option('--stripe_dump', 'Dump stripe subscriptions info to ~/stripe/', String, 'yes')
        .option('--delete_expired', 'Delete expired data from the database', String, 'yes')
        .option('--blob_maintenance', 'Do blob-related maintenance (dump to tarballs, offload to gcloud)', String, 'yes')
        .option('--add_user_to_project [project_id,email_address]', 'Add user with given email address to project with given ID', String, '')
        .option('--base_url [string]', 'Base url, so https://sitenamebase_url/', String, '')  # '' or string that starts with /
        .option('--local', 'If option is specified, then *all* projects run locally as the same user as the server and store state in .sagemathcloud-local instead of .sagemathcloud; also do not kill all processes on project restart -- for development use (default: false, since not given)', Boolean, false)
        .option('--foreground', 'If specified, do not run as a deamon')
        .option('--dev', 'if given, then run in VERY UNSAFE single-user local dev mode')
        .option('--single', 'if given, then run in LESS SAFE single-machine mode')
        .option('--db_pool <n>', 'number of db connections in pool (default: 50)', ((n)->parseInt(n)), 50)
        .option('--db_concurrent_warn <n>', 'be very unhappy if number of concurrent db requests exceeds this (default: 300)', ((n)->parseInt(n)), 300)
        .parse(process.argv)

        # NOTE: the --local option above may be what is used later for single user installs, i.e., the version included with Sage.

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
        else if program.stripe_sync
            console.log("Stripe sync")
            stripe_sync(false, (err) -> winston.debug("DONE", err); process.exit())
        else if program.stripe_dump
            console.log("Stripe dump")
            stripe_sync(true, (err) -> winston.debug("DONE", err); process.exit())
        else if program.delete_expired
            delete_expired (err) ->
                winston.debug("DONE", err)
                process.exit()
        else if program.blob_maintenance
            blob_maintenance (err) ->
                winston.debug("DONE", err)
                process.exit()
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
            console.log("Running hub; pidfile=#{program.pidfile}, port=#{program.port}, proxy_port=#{program.proxy_port}")
            # logFile = /dev/null to prevent huge duplicated output that is already in program.logfile
            if program.foreground
                start_server (err) ->
                    if err and program.dev
                        process.exit(1)
            else
                daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile, logFile:'/dev/null', max:30}, start_server)


if process.argv.length > 1
    command_line()
