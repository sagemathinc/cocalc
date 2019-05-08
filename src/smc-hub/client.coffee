###
Client = a client that is connected via a persistent connection to the hub
###

{EventEmitter}       = require('events')

uuid                 = require('node-uuid')
async                = require('async')

exports.COOKIE_OPTIONS = COOKIE_OPTIONS = {secure:true}

Cookies              = require('cookies')            # https://github.com/jed/cookies
misc                 = require('smc-util/misc')
{defaults, required, to_safe_str} = misc
{JSON_CHANNEL}       = require('smc-util/client')
message              = require('smc-util/message')
compute_upgrades     = require('smc-util/upgrades')
base_url_lib         = require('./base-url')
access               = require('./access')
clients              = require('./clients').get_clients()
auth                 = require('./auth')
auth_token           = require('./auth-token')
password             = require('./password')
local_hub_connection = require('./local_hub_connection')
sign_in              = require('./sign-in')
hub_projects         = require('./projects')
{get_stripe}         = require('./stripe/connect')
{get_support}        = require('./support')
{send_email}         = require('./email')
{api_key_action}     = require('./api/manage')
{create_account, delete_account} = require('./create-account')
db_schema            = require('smc-util/db-schema')

underscore = require('underscore')

{callback} = require('awaiting')
{callback2} = require('smc-util/async-utils')

{record_user_tracking} = require('./postgres/user-tracking')

DEBUG2 = !!process.env.SMC_DEBUG2

REQUIRE_ACCOUNT_TO_EXECUTE_CODE = false

# Anti DOS parameters:
# If a client sends a burst of messages, we space handling them out by this many milliseconds:
# (this even includes keystrokes when using the terminal)
MESG_QUEUE_INTERVAL_MS  = 0
# If a client sends a massive burst of messages, we discard all but the most recent this many of them:
# The client *should* be implemented in a way so that this never happens, and when that is
# the case -- according to our loging -- we might switch to immediately banning clients that
# hit these limits...
MESG_QUEUE_MAX_COUNT    = 300
MESG_QUEUE_MAX_WARN    = 50

# Any messages larger than this is dropped (it could take a long time to handle, by a de-JSON'ing attack, etc.).
MESG_QUEUE_MAX_SIZE_MB  = 10

# How long to cache a positive authentication for using a project.
CACHE_PROJECT_AUTH_MS = 1000*60*15    # 15 minutes

# How long all info about a websocket Client connection
# is kept in memory after a user disconnects.  This makes it
# so that if they quickly reconnect, the connections to projects
# and other state doesn't have to be recomputed.
CLIENT_DESTROY_TIMER_S = 60*10  # 10 minutes
#CLIENT_DESTROY_TIMER_S = 0.1    # instant -- for debugging

CLIENT_MIN_ACTIVE_S = 45

# How frequently we tell the browser clients to report metrics back to us.
# Set to 0 to completely disable metrics collection from clients.
CLIENT_METRICS_INTERVAL_S = if DEBUG2 then 15 else 60*2

# recording metrics and statistics
metrics_recorder = require('./metrics-recorder')

# setting up client metrics
mesg_from_client_total         = metrics_recorder.new_counter('mesg_from_client_total',
                                     'counts Client::handle_json_message_from_client invocations', ['event'])
push_to_client_stats_h         = metrics_recorder.new_histogram('push_to_client_histo_ms', 'Client: push_to_client',
                                     buckets : [1, 10, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
                                     labels: ['event']
                                 )

# All known metrics from connected clients.  (Map from id to metrics.)
# id is deleted from this when client disconnects.
client_metrics = metrics_recorder.client_metrics

if not misc.is_object(client_metrics)
    throw Error("metrics_recorder must have a client_metrics attribute map")

class exports.Client extends EventEmitter
    constructor: (opts) ->
        super()
        @_opts = defaults opts,
            conn           : undefined
            logger         : undefined
            database       : required
            compute_server : required
            host           : undefined
            port           : undefined

        @conn            = @_opts.conn
        @logger          = @_opts.logger
        @database        = @_opts.database
        @compute_server  = @_opts.compute_server

        @_when_connected = new Date()

        @_messages =
            being_handled : {}
            total_time    : 0
            count         : 0

        # The variable account_id is either undefined or set to the
        # account id of the user that this session has successfully
        # authenticated as.  Use @account_id to decide whether or not
        # it is safe to carry out a given action.
        @account_id = undefined

        if @conn?
            # has a persistent connection, e.g., NOT just used for an API
            @init_conn()
        else
            @id = misc.uuid()

    init_conn: =>
        # initialize everything related to persistent connections
        @_data_handlers  = {}
        @_data_handlers[JSON_CHANNEL] = @handle_json_message_from_client

        # The persistent sessions that this client starts.
        @compute_session_uuids = []

        @install_conn_handlers()

        @ip_address = @conn.address.ip

        # A unique id -- can come in handy
        @id = @conn.id

        # Setup remember-me related cookie handling
        @cookies = {}
        c = new Cookies(@conn.request, COOKIE_OPTIONS)
        ##@dbg('init_conn')("cookies = '#{@conn.request.headers['cookie']}', #{base_url_lib.base_url() + 'remember_me'}, #{@_remember_me_value}")
        @_remember_me_value = c.get(base_url_lib.base_url() + 'remember_me')

        @check_for_remember_me()

        # Security measure: check every 5 minutes that remember_me
        # cookie used for login is still valid.  If the cookie is gone
        # and this fails, user gets a message, and see that they must sign in.
        @_remember_me_interval = setInterval(@check_for_remember_me, 1000*60*5)

        if CLIENT_METRICS_INTERVAL_S
            @push_to_client(message.start_metrics(interval_s:CLIENT_METRICS_INTERVAL_S))

    touch: (opts={}) =>
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
        @database.touch(opts)

        setTimeout((()=>delete @_touch_lock[key]), CLIENT_MIN_ACTIVE_S*1000)

    install_conn_handlers: () =>
        dbg = @dbg('install_conn_handlers')
        if @_destroy_timer?
            clearTimeout(@_destroy_timer)
            delete @_destroy_timer

        @conn.on "data", (data) =>
            @handle_data_from_client(data)

        @conn.on "end", () =>
            dbg("connection: hub <--> client(id=#{@id}, address=#{@ip_address})  -- CLOSED")
            @destroy()
            ###
            # I don't think this destroy_timer is of any real value at all unless
            # we were to fully maintain client state while they are gone.  Doing this
            # is a serious liability, e.g., in a load-spike situation.
            # CRITICAL -- of course we need to cancel all changefeeds when user disconnects,
            # even temporarily, since messages could be dropped otherwise. (The alternative is to
            # cache all messages in the hub, which has serious memory implications.)
            @query_cancel_all_changefeeds()
            # Actually destroy Client in a few minutes, unless user reconnects
            # to this session.  Often the user may have a temporary network drop,
            # and we keep everything waiting for them for short time
            # in case this happens.
            @_destroy_timer = setTimeout(@destroy, 1000*CLIENT_DESTROY_TIMER_S)
            ###

        dbg("connection: hub <--> client(id=#{@id}, address=#{@ip_address})  ESTABLISHED")

    dbg: (desc) =>
        if @logger?.debug
            return (args...) => @logger.debug("Client(#{@id}).#{desc}:", args...)
        else
            return ->

    destroy: () =>
        dbg = @dbg('destroy')
        dbg("destroy connection: hub <--> client(id=#{@id}, address=#{@ip_address})  -- CLOSED")

        if @id
            # cancel any outstanding queries.
            @database.cancel_user_queries(client_id:@id)

        delete @_project_cache
        delete client_metrics[@id]
        clearInterval(@_remember_me_interval)
        @query_cancel_all_changefeeds()
        @closed = true
        @emit('close')
        @compute_session_uuids = []
        c = clients[@id]
        delete clients[@id]
        dbg("num_clients=#{misc.len(clients)}")
        if c? and c.call_callbacks?
            for id,f of c.call_callbacks
                f("connection closed")
            delete c.call_callbacks
        for h in local_hub_connection.all_local_hubs()
            h.free_resources_for_client_id(@id)

    remember_me_failed: (reason) =>
        return if not @conn?
        @signed_out()  # so can't do anything with projects, etc.
        @push_to_client(message.remember_me_failed(reason:reason))

    check_for_remember_me: () =>
        return if not @conn?
        dbg = @dbg("check_for_remember_me")
        value = @_remember_me_value
        if not value?
            @remember_me_failed("no remember_me cookie")
            return
        x    = value.split('$')
        if x.length != 4
            @remember_me_failed("invalid remember_me cookie")
            return
        hash = auth.generate_hash(x[0], x[1], x[2], x[3])
        dbg("checking for remember_me cookie with hash='#{hash.slice(0,15)}...'") # don't put all in log -- could be dangerous
        @database.get_remember_me
            hash : hash
            cb   : (error, signed_in_mesg) =>
                dbg("remember_me: got error", error,  "signed_in_mesg", signed_in_mesg)
                if error
                    @remember_me_failed("error accessing database")
                    return
                if not signed_in_mesg?
                    @remember_me_failed("remember_me deleted or expired")
                    return
                # sign them in if not already signed in
                if @account_id != signed_in_mesg.account_id
                    signed_in_mesg.hub = @_opts.host + ':' + @_opts.port
                    @hash_session_id   = hash
                    @signed_in(signed_in_mesg)
                    @push_to_client(signed_in_mesg)

    cap_session_limits: (limits) ->
        ###
        Capping resource limits; client can request anything.
        We cap what they get based on the account type, etc...
        This functions *modifies* the limits object in place.
        ###
        if @account_id?  # logged in
            misc.min_object(limits, SESSION_LIMITS)  # TODO
        else
            misc.min_object(limits, SESSION_LIMITS_NOT_LOGGED_IN)  # TODO

    push_to_client: (mesg, cb) =>
        ###
        Pushing messages to this particular connected client
        ###
        if @closed
            cb?("disconnected")
            return
        dbg = @dbg("push_to_client")

        if mesg.event != 'pong'
            dbg("hub --> client (client=#{@id}): #{misc.trunc(to_safe_str(mesg),300)}")
            #dbg("hub --> client (client=#{@id}): #{misc.trunc(JSON.stringify(mesg),1000)}")
            #dbg("hub --> client (client=#{@id}): #{JSON.stringify(mesg)}")

        if mesg.id?
            start = @_messages.being_handled[mesg.id]
            if start?
                time_taken = new Date() - start
                delete @_messages.being_handled[mesg.id]
                @_messages.total_time += time_taken
                @_messages.count += 1
                avg = Math.round(@_messages.total_time / @_messages.count)
                dbg("[#{time_taken} mesg_time_ms]  [#{avg} mesg_avg_ms] -- mesg.id=#{mesg.id}")
                push_to_client_stats_h.observe({event:mesg.event}, time_taken)

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
        json = misc.to_json_socket(mesg)
        tm = new Date() - t
        if tm > 10
            dbg("mesg.id=#{mesg.id}: time to json=#{tm}ms; length=#{json.length}; value='#{misc.trunc(json, 500)}'")
        @push_data_to_client(JSON_CHANNEL, json)
        if not listen
            cb?()
            return

    push_data_to_client: (channel, data) ->
        return if not @conn?
        if @closed
            return
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

    signed_in: (signed_in_mesg) =>
        return if not @conn?
        # Call this method when the user has successfully signed in.

        @signed_in_mesg = signed_in_mesg  # save it, since the properties are handy to have.

        # Record that this connection is authenticated as user with given uuid.
        @account_id = signed_in_mesg.account_id

        sign_in.record_sign_in
            ip_address    : @ip_address
            successful    : true
            remember_me   : signed_in_mesg.remember_me    # True if sign in accomplished via rememember me token.
            email_address : signed_in_mesg.email_address
            account_id    : signed_in_mesg.account_id
            utm           : signed_in_mesg.utm
            referrer      : signed_in_mesg.referrer
            database      : @database

        # Get user's group from database.
        @get_groups()

    signed_out: () =>
        @account_id = undefined

    # Setting and getting HTTP-only cookies via Primus + AJAX
    get_cookie: (opts) ->
        opts = defaults opts,
            name : required
            cb   : required   # cb(undefined, value)
        if not @conn?.id?
            # no connection or connection died
            return
        @once("get_cookie-#{opts.name}", (value) -> opts.cb(value))
        @push_to_client(message.cookies(id:@conn.id, get:opts.name, url:base_url_lib.base_url()+"/cookies"))

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
        @push_to_client(message.cookies(id:@conn.id, set:opts.name, url:base_url_lib.base_url()+"/cookies", value:opts.value))

    remember_me: (opts) ->
        return if not @conn?
        ###
        Remember me.  There are many ways to implement
        "remember me" functionality in a web app. Here's how
        we do it with SMC:    We generate a random uuid,
        which along with salt, is stored in the user's
        browser as an httponly cookie.  We password hash the
        random uuid and store that in our database.  When
        the user later visits the SMC site, their browser
        sends the cookie, which the server hashes to get the
        key for the database table, which has corresponding
        value the mesg needed for sign in.  We then sign the
        user in using that message.

        The reason we use a password hash is that if
        somebody gains access to an entry in the key:value
        store of the database, we want to ensure that they
        can't use that information to login.  The only way
        they could login would be by gaining access to the
        cookie in the user's browser.

        There is no point in signing the cookie since its
        contents are random.

        Regarding ttl, we use 1 year.  The database will forget
        the cookie automatically at the same time that the
        browser invalidates it.
        ###

        # WARNING: The code below is somewhat replicated in
        # passport_login.

        opts = defaults opts,
            email_address : required
            account_id    : required
            ttl           : 24*3600 *30     # 30 days, by default
            cb            : undefined

        ttl = opts.ttl; delete opts.ttl
        opts.hub = @_opts.host
        opts.remember_me = true

        opts0 = misc.copy(opts)
        delete opts0.cb
        signed_in_mesg   = message.signed_in(opts0)
        session_id       = uuid.v4()
        @hash_session_id = auth.password_hash(session_id)

        x = @hash_session_id.split('$')    # format:  algorithm$salt$iterations$hash
        @_remember_me_value = [x[0], x[1], x[2], session_id].join('$')
        @set_cookie  # same name also hardcoded in the client!
            name  : base_url_lib.base_url() + 'remember_me'
            value : @_remember_me_value
            ttl   : ttl

        @database.save_remember_me
            account_id : opts.account_id
            hash       : @hash_session_id
            value      : signed_in_mesg
            ttl        : ttl
            cb         : opts.cb

    invalidate_remember_me: (opts) ->
        return if not @conn?

        opts = defaults opts,
            cb : required

        if @hash_session_id?
            @database.delete_remember_me
                hash : @hash_session_id
                cb   : opts.cb
        else
            opts.cb()

    ###
    Our realtime socket connection might only support one connection
    between the client and
    server, so we multiplex multiple channels over the same
    connection.  There is one base channel for JSON messages called
    JSON_CHANNEL, which themselves can be routed to different
    callbacks, etc., by the client code.  There are 16^4-1 other
    channels, which are for sending raw data.  The raw data messages
    are prepended with a UTF-16 character that identifies the
    channel.  The channel character is random (which might be more
    secure), and there is no relation between the channels for two
    distinct clients.
    ###

    handle_data_from_client: (data) =>
        return if not @conn?
        dbg = @dbg("handle_data_from_client")
        ## Only enable this when doing low level debugging -- performance impacts AND leakage of dangerous info!
        if DEBUG2
            dbg("handle_data_from_client('#{misc.trunc(data.toString(),400)}')")

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
            @logger?.error(msg)
            @error_to_client(error:msg)
            return

        if data.length == 0
            msg = "The server ignored a message since it was empty."
            @logger?.error(msg)
            @error_to_client(error:msg)
            return

        if not @_handle_data_queue?
            @_handle_data_queue = []

        channel = data[0]
        h = @_data_handlers[channel]

        if not h?
            if channel != 'X'  # X is a special case used on purpose -- not an error.
                @logger?.error("unable to handle data on an unknown channel: '#{channel}', '#{data}'")
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

            if @_handle_data_queue.length > MESG_QUEUE_MAX_WARN
                dbg("MESG_QUEUE_MAX_WARN(=#{MESG_QUEUE_MAX_WARN}) exceeded (=#{@_handle_data_queue.length}) -- just a warning")

            # drop oldest message to keep
            if @_handle_data_queue.length > MESG_QUEUE_MAX_COUNT
                dbg("MESG_QUEUE_MAX_COUNT(=#{MESG_QUEUE_MAX_COUNT}) exceeded (=#{@_handle_data_queue.length}) -- drop oldest messages")
                while @_handle_data_queue.length > MESG_QUEUE_MAX_COUNT
                    discarded_mesg = @_handle_data_queue.shift()
                    data = discarded_mesg?[1]
                    dbg("discarded_mesg='#{misc.trunc(data?.toString?(),1000)}'")


            # get task
            task = @_handle_data_queue.shift()
            # do task
            task[0](task[1])
            # do next one in >= MESG_QUEUE_INTERVAL_MS
            setTimeout( @_handle_data_queue_empty_function, MESG_QUEUE_INTERVAL_MS )

        @_handle_data_queue_empty_function()

    register_data_handler: (h) ->
        return if not @conn?
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

    ###
    Message handling functions:

    Each function below that starts with mesg_ handles a given
    message type (an event).  The implementations of many of the
    handlers are somewhat long/involved, so the function below
    immediately calls another function defined elsewhere.  This will
    make it easier to refactor code to other modules, etc., later.
    This approach also clarifies what exactly about this object
    is used to implement the relevant functionality.
    ###
    handle_json_message_from_client: (data) =>
        return if not @conn?
        if @_ignore_client
            return
        try
            mesg = misc.from_json_socket(data)
        catch error
            @logger?.error("error parsing incoming mesg (invalid JSON): #{mesg}")
            return
        dbg = @dbg('handle_json_message_from_client')
        if mesg.event != 'ping'
            dbg("hub <-- client: #{misc.trunc(to_safe_str(mesg), 120)}")

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
            mesg_from_client_total.labels("#{mesg.event}").inc(1)
        else
            @push_to_client(message.error(error:"Hub does not know how to handle a '#{mesg.event}' event.", id:mesg.id))
            if mesg.event == 'get_all_activity'
                dbg("ignoring all further messages from old client=#{@id}")
                @_ignore_client = true

    mesg_ping: (mesg) =>
        @push_to_client(message.pong(id:mesg.id, now:new Date()))

    # Messages: Sessions
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

    # Messages: Account creation, deletion, sign in, sign out
    mesg_create_account: (mesg) =>
        create_account
            client   : @
            mesg     : mesg
            database : @database
            logger   : @logger
            host     : @_opts.host
            port     : @_opts.port
            sign_in  : @conn?  # browser clients have a websocket conn

    mesg_delete_account: (mesg) =>
        delete_account
            client   : @
            mesg     : mesg
            database : @database
            logger   : @logger

    mesg_sign_in: (mesg) =>
        sign_in.sign_in
            client   : @
            mesg     : mesg
            logger   : @logger
            database : @database
            host     : @_opts.host
            port     : @_opts.port

    mesg_sign_in_using_auth_token: (mesg) =>
        sign_in.sign_in_using_auth_token
            client   : @
            mesg     : mesg
            logger   : @logger
            database : @database
            host     : @_opts.host
            port     : @_opts.port

    mesg_sign_out: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"Not signed in."))
            return

        if mesg.everywhere
            # invalidate all remember_me cookies
            @database.invalidate_all_remember_me
                account_id : @account_id
        @signed_out()  # deletes @account_id... so must be below database call above
        # invalidate the remember_me on this browser
        @invalidate_remember_me
            cb:(error) =>
                @dbg('mesg_sign_out')("signing out: #{mesg.id}, #{error}")
                if not error
                    @push_to_client(message.error(id:mesg.id, error:error))
                else
                    @push_to_client(message.signed_out(id:mesg.id))

    # Messages: Password/email address management
    mesg_change_password: (mesg) =>
        password.change_password
            mesg       : mesg
            account_id : @account_id
            ip_address : @ip_address
            database   : @database
            cb         : (err) =>
                @push_to_client(message.changed_password(id:mesg.id, error:err))

    mesg_forgot_password: (mesg) =>
        password.forgot_password
            mesg       : mesg
            ip_address : @ip_address
            database   : @database
            cb         : (err) =>
                @push_to_client(message.forgot_password_response(id:mesg.id, error:err))

    mesg_reset_forgot_password: (mesg) =>
        password.reset_forgot_password
            mesg       : mesg
            database   : @database
            cb         : (err) =>
                @push_to_client(message.reset_forgot_password_response(id:mesg.id, error:err))

    mesg_change_email_address: (mesg) =>
        password.change_email_address
            mesg       : mesg
            account_id : @account_id
            ip_address : @ip_address
            database   : @database
            logger     : @logger
            cb         : (err) =>
                @push_to_client(message.changed_email_address(id:mesg.id, error:err))

    mesg_send_verification_email: (mesg) =>
        auth = require('./auth')
        auth.verify_email_send_token
            account_id  : mesg.account_id
            only_verify : mesg.only_verify ? true
            database    : @database
            cb          : (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @success_to_client(id:mesg.id)

    mesg_unlink_passport: (mesg) =>
        if not @account_id?
            @error_to_client(id:mesg.id, error:"must be logged in")
        else
            @database.delete_passport
                account_id : @account_id
                strategy   : mesg.strategy
                id         : mesg.id
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @success_to_client(id:mesg.id)

    # Messages: Account settings
    get_groups: (cb) =>
        # see note above about our "infinite caching".  Maybe a bad idea.
        if @groups?
            cb?(undefined, @groups)
            return
        @database.get_account
            columns    : ['groups']
            account_id : @account_id
            cb         : (err, r) =>
                if err
                    cb?(err)
                else
                    @groups = r['groups']
                    cb?(undefined, @groups)

    # Messages: Log errors that client sees so we can also look at them
    mesg_log_client_error: (mesg) =>
        @dbg('mesg_log_client_error')(mesg.error)
        if not mesg.type?
            mesg.type = "error"
        if not mesg.error?
            mesg.error = "error"
        @database.log_client_error
            event      : mesg.type
            error      : mesg.error
            account_id : @account_id
            cb         : (err) =>
                if not mesg.id?
                    return
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @success_to_client(id:mesg.id)

    mesg_webapp_error: (mesg) =>
        @dbg('mesg_webapp_error')(mesg.msg)
        mesg = misc.copy_without(mesg, 'event')
        mesg.account_id = @account_id
        @database.webapp_error(mesg)

    # Messages: Project Management
    get_project: (mesg, permission, cb) =>
        ###
        How to use this: Either call the callback with the project, or if an error err
        occured, call @error_to_client(id:mesg.id, error:err) and *NEVER*
        call the callback.  This function is meant to be used in a bunch
        of the functions below for handling requests.

        mesg -- must have project_id field
        permission -- must be "read" or "write"
        cb(err, project)
          *NOTE*:  on failure, if mesg.id is defined, then client will receive
                   an error message; the function calling get_project does *NOT*
                   have to send the error message back to the client!
        ###
        dbg = @dbg('get_project')

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
                            database       : @database
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
                            database       : @database
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
                project = hub_projects.new_project(mesg.project_id, @database, @compute_server)
                @database.touch_project(project_id:mesg.project_id)
                @_project_cache ?= {}
                @_project_cache[key] = project
                # cache for a while
                setTimeout((()=>delete @_project_cache?[key]), CACHE_PROJECT_AUTH_MS)
                dbg("got project; caching and returning")
                cb(undefined, project)
        )

    mesg_create_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to create a new project.")
            return
        @touch()

        dbg = @dbg('mesg_create_project')

        project_id = undefined
        project    = undefined

        async.series([
            (cb) =>
                dbg("create project entry in database")
                @database.create_project
                    account_id  : @account_id
                    title       : mesg.title
                    description : mesg.description
                    image       : mesg.image
                    cb          : (err, _project_id) =>
                        project_id = _project_id; cb(err)
            (cb) =>
                dbg("open project...")
                # We do the open/state below so that when user tries to open it in a moment it opens more quickly;
                # also, in single dev mode, this ensures that project path is created, so can copy
                # files to the project, etc.
                # Also, if mesg.start is set, the project gets started below.
                @compute_server.project
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

    mesg_read_text_files_from_projects: (mesg) =>
        if not misc.is_array(mesg.project_id)
            @error_to_client(id:mesg.id, error:"project_id must be an array")
            return
        if not misc.is_array(mesg.path) or mesg.path.length != mesg.project_id.length
            @error_to_client(id:mesg.id, error:"if project_id is an array, then path must be an array of the same length")
            return
        v = []
        f = (mesg, cb) =>
            @get_project mesg, 'read', (err, project) =>
                if err
                    cb(err)
                    return
                project.read_file
                    path : mesg.path
                    cb   : (err, content) =>
                        if err
                            v.push({path:mesg.path, project_id:mesg.project_id, error:err})
                        else
                            v.push({path:mesg.path, project_id:mesg.project_id, content:content.blob.toString()})
                        cb()
        paths = []
        for i in [0...mesg.project_id.length]
            paths.push({id:mesg.id, path:mesg.path[i], project_id:mesg.project_id[i]})
        async.mapLimit paths, 20, f, (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.text_file_read_from_project(id:mesg.id, content:v))

    mesg_read_text_file_from_project: (mesg) =>
        if misc.is_array(mesg.project_id)
            @mesg_read_text_files_from_projects(mesg)
            return
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
                            database       : @database
                            cb             : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("user must have read access to source project #{mesg.src_project_id}")
                                else
                                    cb()
                    (cb) =>
                        access.user_has_write_access_to_project
                            database       : @database
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
                @compute_server.project
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

    mesg_local_hub: (mesg) =>
        ###
        Directly communicate with the local hub.  If the
        client has write access to the local hub, there's no
        reason they shouldn't be allowed to send arbitrary
        messages directly (they could anyways from the terminal).
        ###
        dbg = @dbg('mesg_local_hub')
        dbg("hub --> local_hub: ", mesg)
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
                        dbg("ERROR: #{err} calling message #{misc.to_json(mesg.message)}")
                        @error_to_client(id:mesg.id, error:err)
                    else
                        if not mesg.multi_response
                            resp.id = mesg.id
                        @push_to_client(resp)

    mesg_user_search: (mesg) =>
        if not mesg.admin and (not mesg.limit? or mesg.limit > 50)
            # hard cap at 50... (for non-admin)
            mesg.limit = 50
        locals = {results: undefined}
        async.series([
            (cb) =>
                if mesg.admin
                    @assert_user_is_in_group('admin', cb)
                else
                    cb()
            (cb) =>
                @touch()
                @database.user_search
                    query  : mesg.query
                    limit  : mesg.limit
                    admin  : mesg.admin
                    active : mesg.active
                    cb     : (err, results) =>
                        locals.results = results
                        cb(err)
        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.user_search_results(id:mesg.id, results:locals.results))
        )

    mesg_invite_collaborator: (mesg) =>
        @touch()
        dbg = @dbg('mesg_invite_collaborator')
        #dbg("mesg: #{misc.to_json(mesg)}")
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            locals =
                email_address : undefined
                done          : false

            # SECURITY NOTE: mesg.project_id is valid and the client has write access, since otherwise,
            # the @get_project function above wouldn't have returned without err...
            async.series([
                (cb) =>
                    @database.add_user_to_project
                        project_id   : mesg.project_id
                        account_id   : mesg.account_id
                        group        : 'collaborator'  # in future will be "invite_collaborator", once implemented
                        cb           : cb

                (cb) =>
                    # only send an email when there is an mesg.email body to send.
                    # we want to make it explicit when they're sent, and implicitly disable it for API usage.
                    if not mesg.email?
                        locals.done = true
                    cb()

                (cb) =>
                    if locals.done
                        cb(); return

                    {one_result} = require('./postgres')
                    @database._query
                        query : "SELECT email_address FROM accounts"
                        where : "account_id = $::UUID" : mesg.account_id
                        cb    : one_result 'email_address', (err, x) =>
                            locals.email_address = x
                            cb(err)

                (cb) =>
                    if (not locals.email_address) or locals.done
                        cb(); return

                    # INFO: for testing this, you have to reset the invite field each time you sent yourself an invitation
                    # in psql: UPDATE projects SET invite = NULL WHERE project_id = '<UUID of your cc-in-cc dev project>';
                    @database.when_sent_project_invite
                        project_id : mesg.project_id
                        to         : locals.email_address
                        cb         : (err, when_sent) =>
                            #console.log("mesg_invite_collaborator email #{locals.email_address}, #{err}, #{when_sent}")
                            if err
                                cb(err)
                            else if when_sent >= misc.days_ago(7)   # successfully sent < one week ago -- don't again
                                locals.done = true
                                cb()
                            else
                                cb()

                (cb) =>
                    if locals.done or (not locals.email_address)
                        cb(); return

                    cb()  # we return early, because there is no need to let someone wait for sending the email

                    # available message fields
                    # mesg.title            - title of project
                    # mesg.link2proj
                    # mesg.replyto
                    # mesg.replyto_name
                    # mesg.email            - body of email
                    # mesg.subject

                    # send an email to the user -- async, not blocking user.
                    # TODO: this can take a while -- we need to take some action
                    # if it fails, e.g., change a setting in the projects table!
                    if mesg.replyto_name?
                        subject = "#{mesg.replyto_name} invited you to collaborate on CoCalc in project '#{mesg.title}'"
                    else
                        subject = "Invitation to CoCalc for collaborating in project '#{mesg.title}'"
                    # override subject if explicitly given
                    if mesg.subject?
                        subject  = mesg.subject

                    if mesg.link2proj? # make sure invitees know where to go
                        base_url = mesg.link2proj.split("/")
                        base_url = "#{base_url[0]}//#{base_url[2]}"
                        direct_link = "Open <a href='#{mesg.link2proj}'>the project '#{mesg.title}'</a>."
                    else # fallback for outdated clients
                        base_url = 'https://cocalc.com/'
                        direct_link = ''

                    email_body = (mesg.email ? '') + """
                        <br/><br/>
                        <b>To accept the invitation, please open
                        <a href='#{base_url}'>#{base_url}</a>
                        and sign in using your email address '#{locals.email_address}'.
                        #{direct_link}</b><br/>
                        """

                    # The following is only for backwards compatibility with outdated webapp clients during the transition period
                    if not mesg.title?
                        subject = "Invitation to CoCalc for collaborating on a project"

                    # asm_group: 699 is for invites https://app.sendgrid.com/suppressions/advanced_suppression_manager
                    opts =
                        to           : locals.email_address
                        bcc          : 'invites@cocalc.com'
                        fromname     : 'CoCalc'
                        from         : 'invites@cocalc.com'
                        replyto      : mesg.replyto ? 'help@cocalc.com'
                        replyto_name : mesg.replyto_name
                        subject      : subject
                        category     : "invite"
                        asm_group    : 699
                        body         : email_body
                        cb           : (err) =>
                            if err
                                dbg("FAILED to send email to #{locals.email_address}  -- err={misc.to_json(err)}")
                            @database.sent_project_invite
                                project_id : mesg.project_id
                                to         : locals.email_address
                                error      : err
                    send_email(opts)

                ], (err) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.success(id:mesg.id))
                )


    mesg_invite_noncloud_collaborators: (mesg) =>
        dbg = @dbg('mesg_invite_noncloud_collaborators')
        @touch()
        @get_project mesg, 'write', (err, project) =>
            if err
                return

            if mesg.to.length > 1024
                @error_to_client(id:mesg.id, error:"Specify less recipients when adding collaborators to project.")
                return

            # users to invite
            to = (x for x in mesg.to.replace(/\s/g,",").replace(/;/g,",").split(',') when x)

            # invitation template
            email = mesg.email

            invite_user = (email_address, cb) =>
                dbg("inviting #{email_address}")
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
                        @database.account_exists
                            email_address : email_address
                            cb            : (err, _account_id) =>
                                dbg("account_exists: #{err}, #{_account_id}")
                                account_id = _account_id
                                cb(err)
                    (cb) =>
                        if account_id
                            dbg("user #{email_address} already has an account -- add directly")
                            # user has an account already
                            done = true
                            @database.add_user_to_project
                                project_id : mesg.project_id
                                account_id : account_id
                                group      : 'collaborator'
                                cb         : cb
                        else
                            dbg("user #{email_address} doesn't have an account yet -- may send email (if we haven't recently)")
                            # create trigger so that when user eventually makes an account,
                            # they will be added to the project.
                            @database.account_creation_actions
                                email_address : email_address
                                action        : {action:'add_to_project', group:'collaborator', project_id:mesg.project_id}
                                ttl           : 60*60*24*14  # valid for 14 days
                                cb            : cb
                    (cb) =>
                        if done
                            cb()
                        else
                            @database.when_sent_project_invite
                                project_id : mesg.project_id
                                to         : email_address
                                cb         : (err, when_sent) =>
                                    if err
                                        cb(err)
                                    else if when_sent >= misc.days_ago(7)   # successfully sent < one week ago -- don't again
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
                            subject  = "CoCalc Invitation"
                            # override subject if explicitly given
                            if mesg.subject?
                                subject  = mesg.subject

                            if mesg.link2proj? # make sure invitees know where to go
                                base_url = mesg.link2proj.split("/")
                                base_url = "#{base_url[0]}//#{base_url[2]}"
                                direct_link = "Then go to <a href='#{mesg.link2proj}'>the project '#{mesg.title}'</a>."
                            else # fallback for outdated clients
                                base_url = 'https://cocalc.com/'
                                direct_link = ''

                            # asm_group: 699 is for invites https://app.sendgrid.com/suppressions/advanced_suppression_manager
                            opts =
                                to           : email_address
                                bcc          : 'invites@cocalc.com'
                                fromname     : 'CoCalc'
                                from         : 'invites@cocalc.com'
                                replyto      : mesg.replyto ? 'help@cocalc.com'
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
                                        dbg("FAILED to send email to #{email_address}  -- err={misc.to_json(err)}")
                                    @database.sent_project_invite
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
            @database.remove_collaborator_from_project
                project_id : mesg.project_id
                account_id : mesg.account_id
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    # NOTE: this is different than invite_collab, in that it is
    # much more similar to remove_collaborator.  It also supports
    # adding multiple collabs to multiple projects in one
    # transaction.
    mesg_add_collaborator: (mesg) =>
        @touch()
        if not misc.is_array(mesg.project_id)
            projects = [mesg.project_id]
            accounts = [mesg.account_id]
        else
            projects = mesg.project_id
            accounts = mesg.account_id
        try
            await @database.add_collaborators_to_projects(@account_id, accounts, projects)
            @push_to_client(message.success(id:mesg.id))
        catch err
            @error_to_client(id:mesg.id, error:"#{err}")

    mesg_remove_blob_ttls: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"not yet signed in"))
        else
            @database.remove_blob_ttls
                uuids : mesg.uuids
                cb    : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_version: (mesg) =>
        # The version of the client...
        @smc_version = mesg.version
        @dbg('mesg_version')("client.smc_version=#{mesg.version}")
        {version} = require('./server-settings')(@database)
        if mesg.version < version.version_recommended_browser ? 0
            @push_version_update()

    push_version_update: =>
        {version} = require('./server-settings')(@database)
        @push_to_client(message.version(version:version.version_recommended_browser, min_version:version.version_min_browser))
        if version.version_min_browser and @smc_version < version.version_min_browser
            # Client is running an unsupported bad old version.
            # Brutally disconnect client!  It's critical that they upgrade, since they are
            # causing problems or have major buggy code.
            if new Date() - @_when_connected <= 30000
                # If they just connected, kill the connection instantly
                @conn.end()
            else
                # Wait 1 minute to give them a chance to save data...
                setTimeout((()=>@conn.end()), 60000)

    _user_is_in_group: (group) =>
        return @groups? and group in @groups

    assert_user_is_in_group: (group, cb) =>
        @get_groups (err) =>
            if not err and not @_user_is_in_group('admin')  # user_is_in_group works after get_groups is called.
                err = "must be logged in and a member of the admin group"
            cb(err)

    mesg_project_set_quotas: (mesg) =>
        if not misc.is_valid_uuid_string(mesg.project_id)
            @error_to_client(id:mesg.id, error:"invalid project_id")
            return
        project = undefined
        dbg = @dbg("mesg_project_set_quotas(project_id='#{mesg.project_id}')")
        async.series([
            (cb) =>
                @assert_user_is_in_group('admin', cb)
            (cb) =>
                dbg("update base quotas in the database")
                @database.set_project_settings
                    project_id : mesg.project_id
                    settings   : misc.copy_without(mesg, ['event', 'id'])
                    cb         : cb
            (cb) =>
                dbg("get project from compute server")
                @compute_server.project
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

    ###
    Public/published projects data
    ###
    path_is_in_public_paths: (path, paths) =>
        return misc.path_is_in_public_paths(path, misc.keys(paths))

    get_public_project: (opts) =>
        ###
        Get a compute.Project object, or cb an error if the given
        path in the project isn't public.   This is just like getting
        a project, but first ensures that given path is public.
        ###
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
        @database.path_is_public
            project_id : opts.project_id
            path       : opts.path
            cb         : (err, is_public) =>
                if err
                    opts.cb(err)
                    return
                if is_public
                    @compute_server.project
                        project_id : opts.project_id
                        cb         : opts.cb
                else
                    # no
                    opts.cb("path '#{opts.path}' of project with id '#{opts.project_id}' is not public")

    mesg_public_get_directory_listing: (mesg) =>
        dbg = @dbg('mesg_public_get_directory_listing')
        for k in ['path', 'project_id']
            if not mesg[k]?
                dbg("missing stuff in message")
                @error_to_client(id:mesg.id, error:"must specify #{k}")
                return

        # We only require that there is at least one public path.  If so,
        # we then get this listing and if necessary filter out the not public
        # entries in the listing.
        project = undefined
        listing  = undefined
        async.series([
            (cb) =>
                dbg("checking for public path")
                @database.has_public_path
                    project_id : mesg.project_id
                    cb         : (err, is_public) =>
                        if err
                            dbg("error checking -- #{err}")
                            cb(err)
                        else if not is_public
                            dbg("no public paths at all -- deny all listings")
                            cb("not_public") # be careful about changing this. This is a specific error we're giving now when a directory is not public.
                            # Client figures out context and gives more detailed error message. Right now we use it in src/smc-webapp/project_files.cjsx
                            # to provide user with helpful context based error about why they can't access a given directory
                        else
                            cb()
            (cb) =>
                dbg("get the project")
                @compute_server.project
                    project_id : mesg.project_id
                    cb         : (err, x) =>
                        project = x; cb(err)
            (cb) =>
                dbg("get the directory listing")
                project.directory_listing
                    path    : mesg.path
                    hidden  : mesg.hidden
                    time    : mesg.time
                    start   : mesg.start
                    limit   : mesg.limit
                    cb      : (err, x) =>
                        listing = x; cb(err)
            (cb) =>
                dbg("filtering out public paths from listing")
                @database.filter_public_paths
                    project_id : mesg.project_id
                    path       : mesg.path
                    listing    : listing
                    cb         : (err, x) =>
                        listing = x; cb(err)
        ], (err) =>
            if err
                dbg("something went wrong -- #{err}")
                @error_to_client(id:mesg.id, error:err)
            else
                dbg("it worked; telling client")
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
                            # since this maybe be a Buffer... (depending on backend)
                            if Buffer.isBuffer(data)
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
                    database       : @database
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
    Data Query
    ###
    mesg_query: (mesg) =>
        dbg = @dbg("user_query")
        query = mesg.query
        if not query?
            @error_to_client(id:mesg.id, error:"malformed query")
            return
        # CRITICAL: don't enable this except for serious debugging, since it can result in HUGE output
        #dbg("account_id=#{@account_id} makes query='#{misc.to_json(query)}'")
        first = true
        if mesg.changes
            @_query_changefeeds ?= {}
            @_query_changefeeds[mesg.id] = true
        mesg_id = mesg.id
        @database.user_query
            client_id  : @id
            account_id : @account_id
            query      : query
            options    : mesg.options
            changes    : if mesg.changes then mesg_id
            cb         : (err, result) =>
                if @closed  # connection closed, so nothing further to do with this
                    return
                if result?.action == 'close'
                    err = 'close'
                if err
                    dbg("user_query(query='#{misc.to_json(query)}') error:", err)
                    if @_query_changefeeds?[mesg_id]
                        delete @_query_changefeeds[mesg_id]
                    @error_to_client(id:mesg_id, error:err)
                    if mesg.changes and not first and @_query_changefeeds?[mesg_id]?
                        dbg("changefeed got messed up, so cancel it:")
                        @database.user_query_cancel_changefeed(id : mesg_id)
                else
                    if mesg.changes and not first
                        resp = result
                        resp.id = mesg_id
                        resp.multi_response = true
                    else
                        first = false
                        resp = mesg
                        resp.query = result
                    @push_to_client(resp)

    query_cancel_all_changefeeds: (cb) =>
        if not @_query_changefeeds?
            cb?(); return
        cnt = misc.len(@_query_changefeeds)
        if cnt == 0
            cb?(); return
        dbg = @dbg("query_cancel_all_changefeeds")
        v = @_query_changefeeds
        dbg("cancel #{cnt} changefeeds")
        delete @_query_changefeeds
        f = (id, cb) =>
            dbg("cancel id=#{id}")
            @database.user_query_cancel_changefeed
                id : id
                cb : (err) =>
                    if err
                        dbg("FEED: warning #{id} -- error canceling a changefeed #{misc.to_json(err)}")
                    else
                        dbg("FEED: canceled changefeed -- #{id}")
                    cb()
        async.map(misc.keys(v), f, (err) => cb?(err))

    mesg_query_cancel: (mesg) =>
        if not @_query_changefeeds?[mesg.id]?
            # no such changefeed
            @success_to_client(id:mesg.id)
        else
            # actualy cancel it.
            if @_query_changefeeds?
                delete @_query_changefeeds[mesg.id]
            @database.user_query_cancel_changefeed
                id : mesg.id
                cb : (err, resp) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        mesg.resp = resp
                        @push_to_client(mesg)

    mesg_get_usernames: (mesg) =>
        if not @account_id?
            @error_to_client(id:mesg.id, error:"user must be signed in")
            return
        @database.get_usernames
            account_ids : mesg.account_ids
            use_cache   : true
            cb          : (err, usernames) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.usernames(usernames:usernames, id:mesg.id))

    ###
    Support Tickets → Zendesk
    ###
    mesg_create_support_ticket: (mesg) =>
        dbg = @dbg("mesg_create_support_ticket")
        dbg("#{misc.to_json(mesg)}")

        m = underscore.omit(mesg, 'id', 'event')
        get_support().create_ticket m, (err, url) =>
            dbg("callback being called with #{err} and url: #{url}")
            if err?
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(
                    message.support_ticket_url(id:mesg.id, url: url))

    mesg_get_support_tickets: (mesg) =>
        # retrieves the support tickets the user with the current account_id
        dbg = @dbg("mesg_get_support_tickets")
        dbg("#{misc.to_json(mesg)}")
        if not @account_id
            err = "You must be signed in to use support related functions."
            @error_to_client(id:mesg.id, error:err)
            return

        get_support().get_support_tickets @account_id, (err, tickets) =>
            if err?
                @error_to_client(id:mesg.id, error:err)
            else
                dbg("tickets: #{misc.to_json(tickets)}")
                @push_to_client(
                    message.support_tickets(id:mesg.id, tickets: tickets))

    ###
    Stripe-integration billing code
    ###
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
        @_stripe = get_stripe()
        if not @_stripe?
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
                @database.get_stripe_customer_id
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

                        # Log that the user is requesting this info, which means
                        # they are billing the subscription page.  This is
                        # potentially useful to record.
                        @database.log
                            event : 'billing'
                            value : {account_id: @account_id}

    stripe_need_customer_id: (id, cb) =>
        # Like stripe_get_customer_id, except sends an error to the
        # user if they aren't registered yet, instead of returning undefined.
        @dbg("stripe_need_customer_id")()
        @stripe_get_customer_id id, (err, customer_id) =>
            if err
                cb(err); return
            if not customer_id?
                err = "customer not defined"
                @stripe_error_to_client(id:id, error:err)
                cb(err); return
            cb(undefined, customer_id)

    # id : user's CoCalc account id
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
            @_stripe.customers.retrieve customer_id, (err, customer) =>
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
                stripe_publishable_key : @_stripe?.publishable_key
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
                        @database.get_account
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
                        @_stripe.customers.create x, (err, customer) =>
                            if err
                                cb(err)
                            else
                                customer_id = customer.id
                                cb()
                    (cb) =>
                        dbg("success; now save customer id token to database")
                        @database.set_stripe_customer_id
                            account_id  : @account_id
                            customer_id : customer_id
                            cb          : cb
                    (cb) =>
                        dbg("success; sync user account with stripe")
                        @database.stripe_update_customer(account_id : @account_id, stripe : @_stripe, customer_id : customer_id,  cb: cb)
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
                        @_stripe.customers.createCard(customer_id, {card:mesg.token}, cb)
                    (cb) =>
                        dbg("success; sync user account with stripe")
                        @database.stripe_update_customer(account_id : @account_id, stripe : @_stripe, customer_id : customer_id,  cb: cb)
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
                    @_stripe.customers.deleteCard(customer_id, mesg.card_id, cb)
            (cb) =>
                @database.stripe_update_customer(account_id : @account_id, stripe : @_stripe, customer_id : customer_id, cb: cb)
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
                    @_stripe.customers.update(customer_id, {default_source:mesg.card_id}, cb)
            (cb) =>
                dbg("update database")
                @database.stripe_update_customer(account_id : @account_id, stripe : @_stripe, customer_id : customer_id,  cb: cb)
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
                    @_stripe.customers.updateCard(customer_id, mesg.card_id, mesg.info, cb)
            (cb) =>
                @database.stripe_update_customer(account_id : @account_id, stripe : @_stripe, customer_id : customer_id, cb: cb)
        ], (err) =>
            if err
                @stripe_error_to_client(id:mesg.id, error:err)
            else
                @success_to_client(id:mesg.id)
        )

    mesg_stripe_get_plans: (mesg) =>
        dbg = @dbg("mesg_stripe_get_plans")
        dbg("get descriptions of the available plans that the user might subscribe to")
        async.series([
            (cb) =>
                @stripe_get_customer_id(mesg.id, cb)   # ensures @_stripe is defined below
            (cb) =>
                @_stripe.plans.list (err, plans) =>
                    if err
                        @stripe_error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.stripe_plans(id: mesg.id, plans: plans))
        ])

    mesg_stripe_create_subscription: (mesg) =>
        dbg = @dbg("mesg_stripe_create_subscription")
        dbg("create a subscription for this user, using some billing method")
        if not @ensure_fields(mesg, 'plan')
            @stripe_error_to_client(id:mesg.id, error:"missing field 'plan'")
            return

        schema = require('smc-util/schema').PROJECT_UPGRADES.subscription[mesg.plan.split('-')[0]]
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
                coupon   : mesg.coupon_id

            subscription = undefined
            tax_rate = undefined
            async.series([
                (cb) =>
                    dbg('determine applicable tax')
                    require('./stripe/sales-tax').stripe_sales_tax
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
                    @_stripe.customers.createSubscription customer_id, options, (err, s) =>
                        if err
                            cb(err)
                        else
                            subscription = s
                            cb()
                (cb) =>
                    if schema.cancel_at_period_end
                        dbg("Setting subscription to cancel at period end")
                        @_stripe.subscriptions.update(subscription.id, {cancel_at_period_end:true}, cb)
                    else
                        cb()
                (cb) =>
                    dbg("Successfully added subscription; now save info in our database about subscriptions....")
                    @database.stripe_update_customer(account_id : @account_id, stripe : @_stripe, customer_id : customer_id, cb: cb)
                (cb) =>
                    if not options.coupon
                        cb()
                        return
                    dbg("add coupon to customer history")
                    @validate_coupon options.coupon, (err, coupon, coupon_history) =>
                        if err
                            cb(err)
                            return
                        coupon_history[coupon.id] += 1
                        @database.update_coupon_history
                            account_id     : @account_id
                            coupon_history : coupon_history
                            cb             : cb
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
                    @_stripe.subscriptions.update(subscription_id, {cancel_at_period_end:mesg.at_period_end}, cb)
                (cb) =>
                    @database.stripe_update_customer(account_id : @account_id, stripe : @_stripe, customer_id : customer_id, cb: cb)
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
                        coupon   : mesg.coupon_id
                    @_stripe.customers.updateSubscription(customer_id, subscription_id, changes, cb)
                (cb) =>
                    @database.stripe_update_customer(account_id : @account_id, stripe : @_stripe, customer_id : customer_id, cb: cb)
                (cb) =>
                    if not mesg.coupon_id
                        cb()

                    if mesg.coupon_id
                        @validate_coupon mesg.coupon_id, (err, coupon, coupon_history) =>
                            if err
                                cb(err)
                                return
                            coupon_history[coupon.id] += 1
                            @database.update_coupon_history
                                account_id     : @account_id
                                coupon_history : coupon_history
                                cb             : cb
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
            @_stripe.customers.listSubscriptions customer_id, options, (err, subscriptions) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.stripe_subscriptions(id:mesg.id, subscriptions:subscriptions))

    mesg_stripe_get_coupon: (mesg) =>
        dbg = @dbg("mesg_stripe_get_coupon")
        dbg("get the coupon with id == #{mesg.coupon_id}")
        if not @ensure_fields(mesg, 'coupon_id')
            dbg("missing field coupon_id")
            return
        @validate_coupon mesg.coupon_id, (err, coupon) =>
            if err
                @stripe_error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.stripe_coupon(id:mesg.id, coupon:coupon))

    # Checks these coupon criteria:
    # - Exists
    # - Is valid
    # - Used by this account less than the max per account (hard coded default is 1)
    # Calls cb(err, coupon, coupon_history)
    validate_coupon: (coupon_id, cb) =>
        dbg = @dbg("validate_coupon")
        @_stripe = get_stripe()
        async.series([
            (local_cb) =>
                dbg("retrieve the coupon")
                @_stripe.coupons.retrieve(coupon_id, local_cb)
            (local_cb) =>
                dbg("check account coupon_history")
                @database.get_coupon_history
                    account_id : @account_id
                    cb         : local_cb
        ], (err, [coupon, coupon_history]) =>
            if err
                cb(err)
                return
            if not coupon.valid
                cb("Sorry! This coupon has expired.")
                return
            coupon_history ?= {}
            times_used = coupon_history[coupon.id] ? 0
            if times_used >= (coupon.metadata.max_per_account ? 1)
                cb("You've already used this coupon.")
                return

            coupon_history[coupon.id] = times_used
            cb(err, coupon, coupon_history)
        )

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
            @_stripe.charges.list options, (err, charges) =>
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
            @_stripe.invoices.list options, (err, invoices) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.stripe_invoices(id:mesg.id, invoices:invoices))

    mesg_stripe_admin_create_invoice_item: (mesg) =>
        dbg = @dbg("mesg_stripe_admin_create_invoice_item")
        @_stripe = get_stripe()
        if not @_stripe?
            err = "stripe billing not configured"
            dbg(err)
            @error_to_client(id:id, error:err)
            return
        customer_id = undefined
        description = undefined
        email       = undefined
        new_customer = true
        async.series([
            (cb) =>
                @assert_user_is_in_group('admin', cb)
            (cb) =>
                dbg("check for existing stripe customer_id")
                @database.get_account
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
                    @database.stripe_update_customer
                        account_id  : mesg.account_id
                        stripe      : get_stripe()
                        customer_id : customer_id
                        cb          : cb
                else
                    dbg("create stripe entry for this customer")
                    x =
                        description : description
                        email       : email
                        metadata    :
                            account_id : mesg.account_id
                    @_stripe.customers.create x, (err, customer) =>
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
                    @database.set_stripe_customer_id
                        account_id  : mesg.account_id
                        customer_id : customer_id
                        cb          : cb
            (cb) =>
                if not (mesg.amount? and mesg.description?)
                    dbg("no amount or description -- not creating an invoice")
                    cb()
                else
                    dbg("now create the invoice item")
                    @_stripe.invoiceItems.create
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


    mesg_api_key: (mesg) =>
        api_key_action
            database   : @database
            account_id : @account_id
            password   : mesg.password
            action     : mesg.action
            cb       : (err, api_key) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    if api_key?
                        @push_to_client(message.api_key_info(id:mesg.id, api_key:api_key))
                    else
                        @success_to_client(id:mesg.id)

    mesg_user_auth: (mesg) =>
        auth_token.get_user_auth_token
            database        : @database
            account_id      : @account_id  # strictly not necessary yet... but good if user has to be signed in,
                                           # since more secure and we can rate limit attempts from a given user.
            user_account_id : mesg.account_id
            password        : mesg.password
            cb              : (err, auth_token) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.user_auth_token(id:mesg.id, auth_token:auth_token))

    mesg_revoke_auth_token: (mesg) =>
        auth_token.revoke_user_auth_token
            database        : @database
            auth_token      : mesg.auth_token
            cb              : (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    # Receive and store in memory the latest metrics status from the client.
    mesg_metrics: (mesg) =>
        dbg = @dbg('mesg_metrics')
        dbg()
        if not mesg?.metrics
            return
        metrics = mesg.metrics
        #dbg('GOT: ', misc.to_json(metrics))
        if not misc.is_array(metrics)
            # client is messing with us...?
            return
        for metric in metrics
            if not misc.is_array(metric?.values)
                # what?
                return
            if metric.values.length == 0
                return
            for v in metric.values
                if not misc.is_object(v?.labels)
                    # what?
                    return
            switch metric.type
                when 'gauge'
                    metric.aggregator = 'average'
                else
                    metric.aggregator = 'sum'

        client_metrics[@id] = metrics
        #dbg('RECORDED: ', misc.to_json(client_metrics[@id]))

    mesg_get_available_upgrades: (mesg) =>
        dbg = @dbg("mesg_get_available_upgrades")
        locals = {}
        async.series([
            (cb) =>
                dbg("get stripe id")
                @stripe_get_customer_id @account_id, (err, id) =>
                    locals.id = id
                    cb(err)
            (cb) =>
                dbg("get stripe customer data")
                @stripe_get_customer locals.id, (err, stripe_customer) =>
                    locals.stripe_data = stripe_customer?.subscriptions?.data
                    cb(err)
            (cb) =>
                dbg("get user project upgrades")
                @database.get_user_project_upgrades
                    account_id : @account_id
                    cb         : (err, projects) =>
                        locals.projects = projects
                        cb(err)
        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                locals.x = compute_upgrades.available_upgrades(locals.stripe_data, locals.projects)
                locals.resp = message.available_upgrades
                    id        : mesg.id
                    total     : compute_upgrades.get_total_upgrades(locals.stripe_data)
                    excess    : locals.x.excess
                    available : locals.x.available
                @push_to_client(locals.resp)
        )

    mesg_remove_all_upgrades: (mesg) =>
        dbg = @dbg("mesg_remove_all_upgrades")
        if not @account_id?
            @error_to_client(id:mesg.id, error:'you must be signed in')
            return
        @database.remove_all_user_project_upgrades
            account_id : @account_id
            projects   : mesg.projects
            cb         : (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    _check_project_access: (project_id, cb) =>
        if not @account_id?
            cb('you must be signed in to access project')
            return
        if not misc.is_valid_uuid_string(project_id)
            cb('project_id must be specified and valid')
            return
        access.user_has_write_access_to_project
            database       : @database
            project_id     : project_id
            account_groups : @groups
            account_id     : @account_id
            cb             : (err, result) =>
                if err
                    cb(err)
                else if not result
                    cb("must have write access")
                else
                    cb()

    _check_syncdoc_access: (string_id, cb) =>
        if not @account_id?
            cb('you must be signed in to access syncdoc')
            return
        if not typeof string_id == 'string' and string_id.length == 40
            cb('string_id must be specified and valid')
            return
        @database._query
            query : "SELECT project_id FROM syncstrings"
            where : {"string_id = $::CHAR(40)" : string_id}
            cb    : (err, results) =>
                if err
                    cb(err)
                else if results.rows.length != 1
                    cb("no such syncdoc")
                else
                    project_id = results.rows[0].project_id
                    @_check_project_access(project_id, cb)

    mesg_disconnect_from_project: (mesg) =>
        dbg = @dbg('mesg_disconnect_from_project')
        @_check_project_access mesg.project_id, (err) =>
            if err
                dbg("failed -- #{err}")
                @error_to_client(id:mesg.id, error:"unable to disconnect from project #{mesg.project_id} -- #{err}")
            else
                local_hub_connection.disconnect_from_project(mesg.project_id)
                @push_to_client(message.success(id:mesg.id))

    mesg_touch_project: (mesg) =>
        dbg = @dbg('mesg_touch_project')
        async.series([
            (cb) =>
                dbg("checking conditions")
                @_check_project_access(mesg.project_id, cb)
            (cb) =>
                @touch
                    project_id : mesg.project_id
                    action     : 'touch'
                    cb         : cb
            (cb) =>
                f = @database.ensure_connection_to_project
                if f?
                    dbg("also create socket connection (so project can query db, etc.)")
                    # We do NOT block on this -- it can take a while.
                    f(mesg.project_id)
                cb()
        ], (err) =>
            if err
                dbg("failed -- #{err}")
                @error_to_client(id:mesg.id, error:"unable to touch project #{mesg.project_id} -- #{err}")
            else
                @push_to_client(message.success(id:mesg.id))
        )

    mesg_get_syncdoc_history: (mesg) =>
        dbg = @dbg('mesg_syncdoc_history')
        try
            dbg("checking conditions")
            # this raises an error if user does not have access
            await callback(@_check_syncdoc_access, mesg.string_id)
            # get the history
            history = await @database.syncdoc_history_async(mesg.string_id, mesg.patches)
            dbg("success!")
            @push_to_client(message.syncdoc_history(id:mesg.id, history:history))
        catch err
            dbg("failed -- #{err}")
            @error_to_client(id:mesg.id, error:"unable to get syncdoc history for string_id #{mesg.string_id} -- #{err}")

    mesg_user_tracking: (mesg) =>
        dbg = @dbg("mesg_user_tracking")
        try
            if not @account_id
                throw Error("you must be signed in to record a tracking event")
            await record_user_tracking(@database, @account_id, mesg.evt, mesg.value)
            @push_to_client(message.success(id:mesg.id))
        catch err
            dbg("failed -- #{err}")
            @error_to_client(id:mesg.id, error:"unable to record user_tracking event #{mesg.evt} -- #{err}")

    mesg_admin_reset_password: (mesg) =>
        dbg = @dbg("mesg_reset_password")
        dbg(mesg.email_address)
        try
            if not misc.is_valid_email_address(mesg.email_address)
                throw Error("invalid email address")
            await callback(@assert_user_is_in_group, 'admin')
            if not await callback2(@database.account_exists, {email_address : mesg.email_address})
                throw Error("no such account with email #{mesg.email_address}")
            # We now know that there is an account with this email address.
            # put entry in the password_reset uuid:value table with ttl of 8 hours.
            id = await callback2(@database.set_password_reset, {email_address : mesg.email_address, ttl:8*60*60});
            mesg.link = "/app#forgot-#{id}"
            @push_to_client(mesg)
        catch err
            dbg("failed -- #{err}")
            @error_to_client(id:mesg.id, error:"#{err}")


