#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Client = a client that is connected via a persistent connection to the hub
###

{EventEmitter}       = require('events')

uuid                 = require('node-uuid')
async                = require('async')

# TODO: I'm very suspicious about this sameSite:"none" config option.
exports.COOKIE_OPTIONS = COOKIE_OPTIONS = Object.freeze(secure:true, sameSite:'none')

Cookies              = require('cookies')            # https://github.com/jed/cookies
misc                 = require('smc-util/misc')
{defaults, required, to_safe_str} = misc
message              = require('smc-util/message')
access               = require('./access')
clients              = require('./clients').getClients()
auth                 = require('./auth')
auth_token           = require('./auth-token')
password             = require('./password')
local_hub_connection = require('./local_hub_connection')
sign_in              = require('./sign-in')
hub_projects         = require('./projects')
{StripeClient}       = require('./stripe/client')
{get_support}        = require('./support')
{send_email, send_invite_email} = require('./email')
{api_key_action}     = require('./api/manage')
{create_account, delete_account} = require('./client/create-account')
{purchase_license}   = require('./client/license')
db_schema            = require('smc-util/db-schema')
{ escapeHtml }       = require("escape-html")
{CopyPath}           = require('./copy-path')
{remember_me_cookie_name} = require('./auth')
path_join = require('path').join
base_path = require('smc-util-node/base-path').default

underscore = require('underscore')

{callback} = require('awaiting')
{callback2} = require('smc-util/async-utils')

{record_user_tracking} = require('./postgres/user-tracking')
{project_has_network_access} = require('./postgres/project-queries')
{is_paying_customer} = require('./postgres/account-queries')
{get_personal_user} = require('./postgres/personal')

{PW_RESET_ENDPOINT, PW_RESET_KEY} = require('./password')

DEBUG2 = !!process.env.SMC_DEBUG2

REQUIRE_ACCOUNT_TO_EXECUTE_CODE = false

# Temporarily to handle old clients for a few days.
JSON_CHANNEL = '\u0000'

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
# On the other hand, it is good to make this large enough that projects can save
MESG_QUEUE_MAX_SIZE_MB  = 20

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
            personal        : undefined

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

        @copy_path = new CopyPath(@)

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
        @_remember_me_value = c.get(remember_me_cookie_name())

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

    get_personal_user: () =>
        if @account_id or not @conn? or not @_opts.personal
            # there is only one account
            return
        dbg = @dbg("check_for_remember_me")
        dbg("personal mode")
        try
            signed_in_mesg = {account_id:await get_personal_user(@database), event:'signed_in'}
            # sign them in if not already signed in (due to async this could happen
            # by get_personal user getting called twice at once).
            if @account_id != signed_in_mesg.account_id
                signed_in_mesg.hub = @_opts.host + ':' + @_opts.port
                @signed_in(signed_in_mesg)
                @push_to_client(signed_in_mesg)
        catch err
            dbg("remember_me: personal mode error", err.toString())
            @remember_me_failed("error getting personal user -- #{err}")
        return

    check_for_remember_me: () =>
        return if not @conn?
        dbg = @dbg("check_for_remember_me")

        if @_opts.personal
            @get_personal_user()
            return

        value = @_remember_me_value
        if not value?
            @remember_me_failed("no remember_me cookie")
            return
        x    = value.split('$')
        if x.length != 4
            @remember_me_failed("invalid remember_me cookie")
            return
        try
            hash = auth.generate_hash(x[0], x[1], x[2], x[3])
        catch err
            dbg("unable to generate hash from '#{value}' -- #{err}")
            @remember_me_failed("invalid remember_me cookie")
            return

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
        data = misc.to_json_socket(mesg)
        tm = new Date() - t
        if tm > 10
            dbg("mesg.id=#{mesg.id}: time to json=#{tm}ms; length=#{data.length}; value='#{misc.trunc(data, 500)}'")
        @push_data_to_client(data)
        if not listen
            cb?()
            return

    push_data_to_client: (data) ->
        return if not @conn?
        if @closed
            return
        @conn.write(data)

    error_to_client: (opts) =>
        opts = defaults opts,
            id    : undefined
            error : required
        if opts.error instanceof Error
            # Javascript Errors as come up with exceptions don't JSON.
            # Since the point is just to show an error to the client,
            # it is better to send back the string!
            opts.error = opts.error.toString()
        @push_to_client(message.error(id:opts.id, error:opts.error))

    success_to_client: (opts) =>
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
            ip_address      : @ip_address
            successful      : true
            remember_me     : signed_in_mesg.remember_me    # True if sign in accomplished via rememember me token.
            email_address   : signed_in_mesg.email_address
            account_id      : signed_in_mesg.account_id
            database        : @database

        # Get user's group from database.
        @get_groups()

    signed_out: () =>
        @account_id = undefined

    # Setting and getting HTTP-only cookies via Primus + AJAX
    get_cookie: (opts) =>
        opts = defaults opts,
            name : required
            cb   : required   # cb(undefined, value)
        if not @conn?.id?
            # no connection or connection died
            return
        @once("get_cookie-#{opts.name}", (value) -> opts.cb(value))
        @push_to_client(message.cookies(id:@conn.id, get:opts.name, url:path_join(base_path, "cookies")))

    set_cookie: (opts) =>
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
        @push_to_client(message.cookies(id:@conn.id, set:opts.name, url:path_join(base_path, "cookies"), value:opts.value))

    remember_me: (opts) =>
        return if not @conn?
        ###
        Remember me.  There are many ways to implement
        "remember me" functionality in a web app. Here's how
        we do it with CoCalc:    We generate a random uuid,
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
            lti_id        : undefined
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
            name  : remember_me_cookie_name()
            value : @_remember_me_value
            ttl   : ttl

        @database.save_remember_me
            account_id : opts.account_id
            hash       : @hash_session_id
            value      : signed_in_mesg
            ttl        : ttl
            cb         : opts.cb

    invalidate_remember_me: (opts) =>
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

        if not @_handle_data_queue?
            @_handle_data_queue = []

        # The rest of the function is basically the same as "h(data.slice(1))", except that
        # it ensure that if there is a burst of messages, then (1) we handle at most 1 message
        # per client every MESG_QUEUE_INTERVAL_MS, and we drop messages if there are too many.
        # This is an anti-DOS measure.
        @_handle_data_queue.push([@handle_json_message_from_client, data])

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

    # TODO: I think this is deprecated:
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


    # Messages: Account creation, deletion, sign in, sign out
    mesg_create_account: (mesg) =>
        if @_opts.personal
            @error_to_client(id:mesg.id, error:"account creation not allowed on personal server")
            return
        create_account
            client   : @
            mesg     : mesg
            database : @database
            host     : @_opts.host
            port     : @_opts.port
            sign_in  : @conn?  # browser clients have a websocket conn

    mesg_delete_account: (mesg) =>
        delete_account
            client   : @
            mesg     : mesg
            database : @database

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
            @push_to_client(message.error(id:mesg.id, error:"not signed in"))
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
                if error
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
                    license     : mesg.license
                    cb          : (err, _project_id) =>
                        project_id = _project_id; cb(err)
            (cb) =>
                cb() # we don't need to wait for project to open before responding to user that project was created.
                dbg("open project...")
                # We do the open/start below so that when user tries to open it in a moment it opens more quickly;
                # also, in single dev mode, this ensures that project path is created, so can copy
                # files to the project, etc.
                # Also, if mesg.start is set, the project gets started below.
                try
                    project = await @compute_server(project_id)
                    await project.state(force:true, update:true)
                    if mesg.start
                        await project.start()
                    else
                        dbg("not auto-starting the new project")
                catch err
                    dbg("failed to start project running -- #{err}")
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
        @copy_path.copy(mesg)

    mesg_copy_path_status: (mesg) =>
        @copy_path.status(mesg)

    mesg_copy_path_delete: (mesg) =>
        @copy_path.delete(mesg)

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
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to search for users."))
            return

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


    # this is an async function
    allow_urls_in_emails: (project_id) =>
        is_paying = await is_paying_customer(@database, @account_id)
        has_network = await project_has_network_access(@database, project_id)
        return is_paying or has_network

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
                settings      : undefined

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
                        cb()
                        return
                    @database.get_server_settings_cached
                        cb : (err, settings) =>
                            if err
                                cb(err)
                            else
                                locals.settings = settings
                                cb()

                (cb) =>
                    if locals.done or (not locals.email_address)
                        dbg("NOT send_email invite to #{locals.email_address}")
                        cb()
                        return

                    ## do not send email if project doesn't have network access (and user is not a paying customer)
                    #if (not await is_paying_customer(@database, @account_id) and not await project_has_network_access(@database, mesg.project_id))
                    #    dbg("NOT send_email invite to #{locals.email_address} -- due to project lacking network access (and user not a customer)")
                    #    return

                    # we always send invite emails. for non-upgraded projects, we sanitize the content of the body
                    # ATTN: this must harmonize with smc-webapp/projects → allow_urls_in_emails
                    # also see mesg_invite_noncloud_collaborators

                    dbg("send_email invite to #{locals.email_address}")
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

                    send_invite_email
                        to            : locals.email_address
                        subject       : subject
                        email         : mesg.email
                        email_address : locals.email_address
                        title         : mesg.title
                        allow_urls    : await @allow_urls_in_emails(mesg.project_id)
                        replyto       : mesg.replyto ? settings.organization_email
                        replyto_name  : mesg.replyto_name
                        link2proj     : mesg.link2proj
                        settings      : locals.settings
                        cb            : (err) =>
                            if err
                                dbg("FAILED to send email to #{locals.email_address}  -- err=#{misc.to_json(err)}")
                            @database.sent_project_invite
                                project_id   : mesg.project_id
                                to           : locals.email_address
                                error        : err
                            cb(err) # call the cb one scope up so that the client is informed that we sent the invite (or not)

                ], (err) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.success(id:mesg.id))
                )

    mesg_add_license_to_project: (mesg) =>
        dbg = @dbg('mesg_add_license_to_project')
        dbg()
        @touch()
        @_check_project_access mesg.project_id, (err) =>
            if err
                dbg("failed -- #{err}")
                @error_to_client(id:mesg.id, error:"must have write access to #{mesg.project_id} -- #{err}")
                return
            try
                await @database.add_license_to_project(mesg.project_id, mesg.license_id)
                @success_to_client(id:mesg.id)
            catch err
                @error_to_client(id:mesg.id, error:"#{err}")

    mesg_remove_license_from_project: (mesg) =>
        dbg = @dbg('mesg_remove_license_from_project')
        dbg()
        @touch()
        @_check_project_access mesg.project_id, (err) =>
            if err
                dbg("failed -- #{err}")
                @error_to_client(id:mesg.id, error:"must have write access to #{mesg.project_id} -- #{err}")
                return
            try
                await @database.remove_license_from_project(mesg.project_id, mesg.license_id)
                @success_to_client(id:mesg.id)
            catch err
                @error_to_client(id:mesg.id, error:"#{err}")

    mesg_invite_noncloud_collaborators: (mesg) =>
        dbg = @dbg('mesg_invite_noncloud_collaborators')

        #
        # Uncomment this in case of attack by evil forces:
        #
        ## @error_to_client(id:mesg.id, error:"inviting collaborators who do not already have a cocalc account to projects is currently disabled due to abuse");
        ## return

        # Otherwise we always allow sending email invites
        # The body is sanitized and not allowed to contain any URLs (anti-spam), unless
        # (a) the sender is a paying customer or (b) the project has network access.
        #
        # ATTN: this must harmonize with smc-webapp/projects → allow_urls_in_emails
        # also see mesg_invite_collaborator

        @touch()
        @get_project mesg, 'write', (err, project) =>
            if err
                return

            if mesg.to.length > 1024
                @error_to_client(id:mesg.id, error:"Specify less recipients when adding collaborators to project.")
                return

            # users to invite
            to = (x for x in mesg.to.replace(/\s/g,",").replace(/;/g,",").split(',') when x)

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

                locals =
                    done       : false
                    account_id : undefined
                    settings   : undefined

                async.series([
                    # already have an account?
                    (cb) =>
                        @database.account_exists
                            email_address : email_address
                            cb            : (err, _account_id) =>
                                dbg("account_exists: #{err}, #{_account_id}")
                                locals.account_id = _account_id
                                cb(err)
                    (cb) =>
                        if locals.account_id
                            dbg("user #{email_address} already has an account -- add directly")
                            # user has an account already
                            locals.done = true
                            @database.add_user_to_project
                                project_id : mesg.project_id
                                account_id : locals.account_id
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
                        if locals.done
                            cb()
                        else
                            @database.when_sent_project_invite
                                project_id : mesg.project_id
                                to         : email_address
                                cb         : (err, when_sent) =>
                                    if err
                                        cb(err)
                                    else if when_sent >= misc.days_ago(7)   # successfully sent < one week ago -- don't again
                                        locals.done = true
                                        cb()
                                    else
                                        cb()

                    (cb) =>
                        if locals.done
                            cb()
                            return
                        @database.get_server_settings_cached
                            cb: (err, settings) =>
                                if err
                                    cb(err)
                                else
                                    locals.settings = settings
                                    cb()

                    (cb) =>
                        if locals.done
                            dbg("NOT send_email invite to #{email_address}")
                            cb()
                            return

                        # send an email to the user -- async, not blocking user.
                        # TODO: this can take a while -- we need to take some action
                        # if it fails, e.g., change a setting in the projects table!
                        subject  = "CoCalc Invitation"
                        # override subject if explicitly given
                        if mesg.subject?
                            subject  = mesg.subject

                        dbg("send_email invite to #{email_address}")
                        send_invite_email
                            to            : email_address
                            subject       : subject
                            email         : mesg.email
                            email_address : email_address
                            title         : mesg.title
                            allow_urls    : await @allow_urls_in_emails(mesg.project_id)
                            replyto       : mesg.replyto ? settings.organization_email
                            replyto_name  : mesg.replyto_name
                            link2proj     : mesg.link2proj
                            settings      : locals.settings
                            cb            : (err) =>
                                if err
                                    dbg("FAILED to send email to #{email_address}  -- err=#{misc.to_json(err)}")
                                @database.sent_project_invite
                                    project_id : mesg.project_id
                                    to         : email_address
                                    error      : err
                                cb(err) # call the cb one scope up so that the client is informed that we sent the invite (or not)

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
    # adding multiple collabs to multiple projects (NOT in one
    # transaction, though).
    mesg_add_collaborator: (mesg) =>
        @touch()
        projects = mesg.project_id
        accounts = mesg.account_id
        tokens = mesg.token_id

        is_single_token = false
        if tokens
            if not misc.is_array(tokens)
                is_single_token = true
                tokens = [tokens]
            projects = ('' for _ in [0...tokens.length])  # will get mutated below as tokens are used
        if not misc.is_array(projects)
            projects = [projects]
        if not misc.is_array(accounts)
            accounts = [accounts]

        try
            await @database.add_collaborators_to_projects(@account_id, accounts, projects, tokens)
            resp = message.success(id:mesg.id)
            if tokens
                # Tokens determine the projects, and it maybe useful to the client to know what
                # project they just got added to!
                if is_single_token
                    resp.project_id = projects[0]
                else
                    resp.project_id = projects
            @push_to_client(resp)
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
        {version} = await require('./servers/server-settings').default()
        if mesg.version < version.version_recommended_browser ? 0
            @push_version_update()

    push_version_update: =>
        {version} = await require('./servers/server-settings').default()
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
                try
                    project = await @compute_server(mesg.project_id)
                    cb()
                catch err
                    cb(err)
            (cb) =>
                dbg("determine total quotas and apply")
                try
                    project.setAllQuotas()
                    cb()
                catch err
                    cb(err)
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
                    try
                        opts.cb(undefined, await @compute_server(opts.project_id))
                    catch err
                        opts.cb(err)
                else
                    # no
                    opts.cb("path '#{opts.path}' of project with id '#{opts.project_id}' is not public")

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
                # Obviously, no need to check write access about the source project,
                # since we are only granting access to public files.  This function
                # should ensure that the path is public:
                @get_public_project
                    project_id : mesg.src_project_id
                    path       : mesg.src_path
                    cb         : (err, x) =>
                        project = x
                        cb(err)
            (cb) =>
                try
                    await project.copyPath
                        path            : mesg.src_path
                        target_project_id : mesg.target_project_id
                        target_path     : mesg.target_path
                        overwrite_newer : mesg.overwrite_newer
                        delete_missing  : mesg.delete_missing
                        timeout         : mesg.timeout
                        backup          : mesg.backup
                        public          : true
                        wait_until_done : true
                    cb()
                catch err
                    cb(err)
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
                    @error_to_client(id:mesg_id, error:"#{err}")   # Ensure err like Error('foo') can be JSON'd
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
    handle_stripe_mesg: (mesg) =>
        try
            await @_stripe_client ?= new StripeClient(@)
        catch err
            @error_to_client(id:mesg.id, error:"${err}")
        @_stripe_client.handle_mesg(mesg)

    mesg_stripe_get_customer: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_create_source: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_delete_source: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_set_default_source: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_update_source: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_create_subscription: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_cancel_subscription: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_update_subscription: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_get_subscriptions: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_get_coupon: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_get_charges: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_get_invoices: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_stripe_admin_create_invoice_item: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_get_available_upgrades: (mesg) =>
        mesg.event = 'stripe_get_available_upgrades'  # for backward compat
        @handle_stripe_mesg(mesg)

    mesg_remove_all_upgrades: (mesg) =>
        mesg.event = 'stripe_remove_all_upgrades'     # for backward compat
        @handle_stripe_mesg(mesg)

    mesg_stripe_sync_site_license_subscriptions: (mesg) =>
        @handle_stripe_mesg(mesg)

    mesg_purchase_license: (mesg) =>
        try
            await @_stripe_client ?= new StripeClient(@)
            resp = await purchase_license(@database, @_stripe_client, @account_id, mesg.info, @dbg("purchase_license"))
            @push_to_client(message.purchase_license_resp(id:mesg.id, resp:resp))
        catch err
            @error_to_client(id:mesg.id, error:err.toString())

    #  END stripe-related functionality

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
                # IMPORTANT: do this ensure_connection_to_project *first*, since
                # it is critical always ensure this, and the @touch below gives
                # an error if done more than once per 45s, whereas we may want
                # to check much more frequently that we have a TCP connection
                # to the project.
                f = @database.ensure_connection_to_project
                if f?
                    dbg("also create socket connection (so project can query db, etc.)")
                    # We do NOT block on this -- it can take a while.
                    f(mesg.project_id)
                cb()
            (cb) =>
                @touch
                    project_id : mesg.project_id
                    action     : 'touch'
                    cb         : cb
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
            # put entry in the password_reset uuid:value table with ttl of 24 hours.
            # NOTE: when users request their own reset, the ttl is 1 hour, but when we
            # as admins send one manually, they typically need more time, so 1 day instead.
            # We used 8 hours for a while and it is often not enough time.
            id = await callback2(@database.set_password_reset, {email_address : mesg.email_address, ttl:24*60*60});
            mesg.link = "#{PW_RESET_ENDPOINT}?#{PW_RESET_KEY}=#{id}"
            @push_to_client(mesg)
        catch err
            dbg("failed -- #{err}")
            @error_to_client(id:mesg.id, error:"#{err}")

    mesg_admin_ban_user: (mesg) =>
        dbg = @dbg("mesg_admin_ban_user")
        dbg(mesg.account_id)
        try
            if mesg.ban
                dbg("banning the user")
                await callback2(@database.ban_user, {account_id:mesg.account_id})
                await callback2(@database.invalidate_all_remember_me, {account_id:mesg.account_id})
            else
                dbg("unbanning the user")
                await callback2(@database.unban_user, {account_id:mesg.account_id})
            @push_to_client(message.success(id:mesg.id))
        catch err
            dbg("failed -- #{err}")
            @error_to_client(id:mesg.id, error:"#{err}")
