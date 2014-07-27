{EventEmitter} = require('events')

# don't delete the following -- even if not used below, since this needs to be available to page/
async = require('async')
marked = require('marked')
# end "don't delete"

_     = require('underscore')

salvus_version = require('salvus_version')

diffsync = require('diffsync')

message = require("message")
misc    = require("misc")

docs = require("docs")

defaults = misc.defaults
required = defaults.required

# This is the default time in *seconds* between pings sent by the
# client to the server to indicate that a given session is being
# actively viewed.  This variable is used by hub.coffee to set
# its kill timeout, so do not change the name here without changing
# it there.   It *is* safe to change the value.
exports.DEFAULT_SESSION_PING_TIME = 600

# JSON_CHANNEL is the channel used for JSON.  The hub imports this
# file, so if this constant is ever changed (for some reason?), it
# only has to be changed on this one line.  Moreover, channel
# assignment in the hub is implemented *without* the assumption that
# the JSON channel is '\u0000'.
JSON_CHANNEL = '\u0000'
exports.JSON_CHANNEL = JSON_CHANNEL # export, so can be used by hub

# Default timeout for many operations -- a user will get an error in many cases
# if there is no response to an operation after this amount of time.
DEFAULT_TIMEOUT = 30  # in seconds

# Default minimum ping time (see below) -- if don't get response this quickly, then will reconnect automatically
# Making this shorter can easily lead to false positives and lots of reconnects for no reason, which means that
# many messages, etc., get dropped.  Making this too long means it can take longer for the client to realize that
# it needs to reconnect.  Making this too short also limits the maximum message time.
PING_CHECK_INTERVAL = 45  # in seconds


# change these soon
git0 = 'git0'
gitls = 'git-ls'

class Session extends EventEmitter
    # events:
    #    - 'open'   -- session is initialized, open and ready to be used
    #    - 'close'  -- session's connection is closed/terminated
    #    - 'execute_javascript' -- code that server wants client to run related to this session
    constructor: (opts) ->
        opts = defaults opts,
            conn         : required     # a Connection instance
            project_id   : required
            session_uuid : required
            params       : undefined
            data_channel : undefined    # optional extra channel that is used for raw data
            init_history : undefined    # used for console

        @start_time   = misc.walltime()
        @conn         = opts.conn
        @params       = opts.params
        @project_id   = opts.project_id
        @session_uuid = opts.session_uuid
        @data_channel = opts.data_channel
        @init_history = opts.init_history
        @emit("open")

        if @reconnect?
            @conn.on "connected", (() => setTimeout(@reconnect, 500))

    reconnect: (cb) =>
        # Called when the connection gets dropped, then reconnects
        if not @conn._signed_in? or not @conn._signed_in
            setTimeout(@reconnect, 500)
            return  # do *NOT* do cb?() yet!

        @conn.call
            message : message.connect_to_session
                session_uuid : @session_uuid
                type         : @type()
                project_id   : @project_id
                params       : @params
            cb      : (error, reply) =>
                if error
                    cb?(error); return
                switch reply.event
                    when 'error'
                        cb?(reply.error)
                    when 'session_connected'
                        @conn.change_data_channel
                            prev_channel : @data_channel
                            new_channel  : reply.data_channel
                            session      : @
                        @data_channel = reply.data_channel
                        @init_history = reply.history
                        @emit("reconnect")
                        cb?()
                    else
                        cb?("bug in hub")

    terminate_session: (cb) =>
        @conn.call
            message :
                message.terminate_session
                    project_id   : @project_id
                    session_uuid : @session_uuid
            timeout : 30
            cb      : cb

    walltime: () =>
        return misc.walltime() - @start_time

    handle_data: (data) =>
        @emit("data", data)

    write_data: (data) ->
        @conn.write_data(@data_channel, data)

    # default = SIGINT
    interrupt: (cb) ->
        tm = misc.mswalltime()
        if @_last_interrupt? and tm - @_last_interrupt < 100
            # client self-limit: do not send signals too frequently, since that wastes bandwidth and can kill the process
            cb?()
        else
            @_last_interrupt = tm
            @conn.call(message:message.send_signal(session_uuid:@session_uuid, signal:2), timeout:10, cb:cb)

    kill: (cb) ->
        @emit("close")
        @conn.call(message:message.send_signal(session_uuid:@session_uuid, signal:9), timeout:10, cb:cb)

    restart: (cb) =>
        @conn.call(message:message.restart_session(session_uuid:@session_uuid), timeout:10, cb:cb)

    # Starts a ping interval timer that periodicially pings the server
    # to indicate that this session is being actively viewed.  Pinging
    # stops if the function continue_pinging() returns false.
    # If the continue_pinging function is not defined, just ping server once.
    ping: (continue_pinging) ->
        if not continue_pinging?
            @conn.send(message.ping_session(session_uuid:@session_uuid))
            return
        timer = undefined
        ping = () =>
            if continue_pinging()
                @ping()
            else
                clearInterval(timer)
        timer = setInterval(ping, exports.DEFAULT_SESSION_PING_TIME * 1000)

###
#
# A Sage session, which links the client to a running Sage process;
# provides extra functionality to kill/interrupt, etc.
#
#   Client <-- (sockjs) ---> Hub  <--- (tcp) ---> sage_server
#
###

class SageSession extends Session
    # If cb is given, it is called every time output for this particular code appears;
    # No matter what, you can always still listen in with the 'output' even, and note
    # the uuid, which is returned from this function.
    execute_code: (opts) ->
        opts = defaults opts,
            code     : required
            cb       : undefined
            data     : undefined
            preparse : true
            uuid     : undefined

        if opts.uuid?
            uuid = opts.uuid
        else
            uuid = misc.uuid()
        if opts.cb?
            @conn.execute_callbacks[uuid] = opts.cb

        @conn.send(
            message.execute_code
                id   : uuid
                code : opts.code
                data : opts.data
                session_uuid : @session_uuid
                preparse : opts.preparse
        )

        return uuid

    type: () => "sage"

    introspect: (opts) ->
        opts.session_uuid = @session_uuid
        @conn.introspect(opts)

# TODO -- for 'interact2'
#
#     variable: (opts) ->
#         opts = defaults opts,
#             name      : required
#             namespace : 'globals()'
#         return SageSessionVariable(@, opts.name, opts.namespace)

# class SageSessionVariable extends EventEmitter
#     constructor: (@session, @name, @namespace, cb) ->
#         @uuid = misc.uuid()
#         @session.execute_code
#             code : "sage_salvus.register_variable(salvus.data['name'], eval(salvus.data['namespace']), salvus.data['uuid'])"
#             data :
#                 name      : @name
#                 namespace : @namespace
#                 uuid      : @uuid
#             preparse : false
#             cb       : cb

#     set : (value, cb) =>
#         @session.execute_code
#             code     :
#             cb       :
#             preparse : false

#     get : (cb) =>  # cb(err, value) -- value must be JSON-able
#         @session.execute_code
#             code :
#             cb   :
#             preparse : false


###
#
# A Console session, which connects the client to a pty on a remote machine.
#
#   Client <-- (sockjs) ---> Hub  <--- (tcp) ---> console_server
#
###

class ConsoleSession extends Session
    type: () => "console"




class exports.Connection extends EventEmitter
    # Connection events:
    #    - 'connecting' -- trying to establish a connection
    #    - 'connected'  -- succesfully established a connection; data is the protocol as a string
    #    - 'error'      -- called when an error occurs
    #    - 'output'     -- received some output for stateless execution (not in any session)
    #    - 'execute_javascript' -- code that server wants client to run (not for a particular session)
    #    - 'ping'       -- a pong is received back; data is the round trip ping time
    #    - 'message'    -- emitted when a JSON message is received           on('message', (obj) -> ...)
    #    - 'data'       -- emitted when raw data (not JSON) is received --   on('data, (id, data) -> )...
    #    - 'signed_in'  -- server pushes a succesful sign in to the client (e.g., due to
    #                      'remember me' functionality); data is the signed_in message.
    #    - 'project_list_updated' -- sent whenever the list of projects owned by this user
    #                      changed; data is empty -- browser could ignore this unless
    #                      the project list is currently being displayed.
    #    - 'project_data_changed - sent when data about a specific project has changed,
    #                      e.g., title/description/settings/etc.



    constructor: (@url) ->
        @setMaxListeners(100)   #TODO: lower this to <=10 and track down issues/remove leaks.
        @emit("connecting")
        @_id_counter       = 0
        @_sessions         = {}
        @_new_sessions     = {}
        @_data_handlers    = {}
        @execute_callbacks = {}
        @call_callbacks    = {}

        @register_data_handler(JSON_CHANNEL, @handle_json_data)

        # IMPORTANT! Connection is an abstract base class.  Derived classes must
        # implement a method called _connect that takes a URL and a callback, and connects to
        # the SockJS server with that url, then creates the following event emitters:
        #      "connected", "error", "close"
        # and returns a function to write raw data to the socket.

        @_connect @url, (data) =>
            if data.length > 0  # all messages must start with a channel; length 0 means nothing.

                # Incoming messages are tagged with a single UTF-16
                # character c (there are 65536 possibilities).  If
                # that character is JSON_CHANNEL, the message is
                # encoded as JSON and we handle it in the usual way.
                # If the character is anything else, the raw data in
                # the message is sent to an appropriate handler, if
                # one has previously been registered.  The motivation
                # is that we the ability to multiplex multiple
                # sessions over a *single* SockJS connection, and it
                # is absolutely critical that there is minimal
                # overhead regarding the amount of data transfered --
                # 1 character is minimal!

                channel = data[0]
                data    = data.slice(1)

                @_handle_data(channel, data)

                # give other listeners a chance to do something with this data.
                @emit("data", channel, data)

        @_last_pong = misc.walltime()
        @_connected = false

        # have to get a round trip packet between client and hub every
        # this many ms, or client will start freaking out and trying
        # to reconnect.  This limits things like max size of files we
        # can edit.
        @_ping_check_interval = PING_CHECK_INTERVAL * 1000
        @_ping_check_id = setInterval((()=>@ping(); @_ping_check()), @_ping_check_interval)

    close: () ->
        clearInterval(@_ping_check_id)
        @_conn.close()

    _ping_check: () ->
        if @_connected and (@_last_ping - @_last_pong > 1.1*@_ping_check_interval/1000.0)
            @_signed_in = false
            @_fix_connection?()

    # Send a JSON message to the hub server.
    send: (mesg) ->
        @write_data(JSON_CHANNEL, misc.to_json(mesg))

    # Send raw data via certain channel to the hub server.
    write_data: (channel, data) =>
        try
            @_write(channel + data)
        catch err
            # TODO: this happens when trying to send and the client not connected
            # We might save up messages in a local queue and keep retrying, for
            # a sort of offline mode ?  I have not worked out how to handle this yet.
            #console.log(err)

    handle_json_data: (data) =>
        mesg = misc.from_json(data)
        switch mesg.event
            when "execute_javascript"
                if mesg.session_uuid?
                    @_sessions[mesg.session_uuid].emit("execute_javascript", mesg)
                else
                    @emit("execute_javascript", mesg)
            when "output"
                cb = @execute_callbacks[mesg.id]
                if cb?
                    cb(mesg)
                    delete @execute_callbacks[mesg.id] if mesg.done
                if mesg.session_uuid?  # executing in a persistent session
                    @_sessions[mesg.session_uuid].emit("output", mesg)
                else   # stateless exec
                    @emit("output", mesg)
            when "terminate_session"
                session = @_sessions[mesg.session_uuid]
                session?.emit("close")
            when "session_reconnect"
                if mesg.data_channel?
                    @_sessions[mesg.data_channel]?.reconnect()
                else if mesg.session_uuid?
                    @_sessions[mesg.session_uuid]?.reconnect()
            when "pong"
                @_last_pong = misc.walltime()
                @emit("ping", @_last_pong - @_last_ping)
            when "cookies"
                @_cookies?(mesg)
            when "signed_in"
                @account_id = mesg.account_id
                @_signed_in = true
                if localStorage?
                    localStorage['remember_me'] = mesg.account_id
                @emit("signed_in", mesg)
            when "remember_me_failed"
                if localStorage?
                    delete localStorage['remember_me']
                @emit(mesg.event, mesg)
            when "project_list_updated", 'project_data_changed'
                @emit(mesg.event, mesg)
            when "codemirror_diffsync_ready"
                @emit(mesg.event, mesg)
            when "codemirror_bcast"
                @emit(mesg.event, mesg)
            when "error"
                # An error that isn't tagged with an id -- some sort of general problem.
                if not mesg.id?
                    console.log("WARNING: #{mesg.error}")
                    return

        id = mesg.id  # the call f(null,mesg) can mutate mesg (!), so we better save the id here.
        f = @call_callbacks[id]
        if f?
            if f != null
                f(null, mesg)
            delete @call_callbacks[id]

        # Finally, give other listeners a chance to do something with this message.
        @emit('message', mesg)

    change_data_channel: (opts) =>
        opts = defaults opts,
            prev_channel : required
            new_channel  : required
            session      : required
        @unregister_data_handler(opts.prev_channel)
        delete @_sessions[opts.prev_channel]
        @_sessions[opts.new_channel] = opts.session
        @register_data_handler(opts.new_channel, opts.session.handle_data)

    register_data_handler: (channel, h) ->
        @_data_handlers[channel] = h

    unregister_data_handler: (channel) ->
        delete @_data_handlers[channel]

    _handle_data: (channel, data) =>
        f = @_data_handlers[channel]
        if f?
            f(data)
        #else
            #console.log("Error -- missing channel #{channel} for data #{data}.  @_data_handlers = #{misc.to_json(@_data_handlers)}")

    ping: () ->
        @_last_ping = misc.walltime()
        @send(message.ping())

    connect_to_session: (opts) ->
        opts = defaults opts,
            type         : required
            session_uuid : required
            project_id   : required
            timeout      : DEFAULT_TIMEOUT
            params  : undefined   # extra params relevant to the session (in case we need to restart it)
            cb           : required
        @call
            message : message.connect_to_session
                session_uuid : opts.session_uuid
                type         : opts.type
                project_id   : opts.project_id
                params       : opts.params

            timeout : opts.timeout

            cb      : (error, reply) =>
                if error
                    opts.cb(error); return
                switch reply.event
                    when 'error'
                        opts.cb(reply.error)
                    when 'session_connected'
                        @_create_session_object
                            type         : opts.type
                            project_id   : opts.project_id
                            session_uuid : opts.session_uuid
                            data_channel : reply.data_channel
                            init_history : reply.history
                            params       : opts.params
                            cb           : opts.cb
                    else
                        opts.cb("Unknown event (='#{reply.event}') in response to connect_to_session message.")

    new_session: (opts) ->
        opts = defaults opts,
            timeout : DEFAULT_TIMEOUT          # how long until give up on getting a new session
            type    : "sage"      # "sage", "console"
            params  : undefined   # extra params relevant to the session
            project_id : undefined # project that this session starts in (TODO: make required)
            cb      : required    # cb(error, session)  if error is defined it is a string

        @call
            message : message.start_session
                type       : opts.type
                params     : opts.params
                project_id : opts.project_id

            timeout : opts.timeout

            cb      : (error, reply) =>
                if error
                    opts.cb(error)
                else
                    if reply.event == 'error'
                        opts.cb(reply.error)
                    else if reply.event == "session_started" or reply.event == "session_connected"
                        @_create_session_object
                            type         : opts.type
                            project_id   : opts.project_id
                            session_uuid : reply.session_uuid
                            data_channel : reply.data_channel
                            cb           : opts.cb
                    else
                        opts.cb("Unknown event (='#{reply.event}') in response to start_session message.")


    _create_session_object: (opts) =>
        opts = defaults opts,
            type         : required
            project_id   : required
            session_uuid : required
            data_channel : undefined
            params       : undefined
            init_history : undefined
            cb           : required

        session_opts =
            conn         : @
            project_id   : opts.project_id
            session_uuid : opts.session_uuid
            data_channel : opts.data_channel
            init_history : opts.init_history
            params       : opts.params

        switch opts.type
            when 'sage'
                session = new SageSession(session_opts)
            when 'console'
                session = new ConsoleSession(session_opts)
            else
                opts.cb("Unknown session type: '#{opts.type}'")
        @_sessions[opts.session_uuid] = session
        if opts.data_channel != JSON_CHANNEL
            @_sessions[opts.data_channel] = session
        @register_data_handler(opts.data_channel, session.handle_data)
        opts.cb(false, session)

    execute_code: (opts={}) ->
        opts = defaults(opts, code:defaults.required, cb:null, preparse:true, allow_cache:true, data:undefined)
        uuid = misc.uuid()
        if opts.cb?
            @execute_callbacks[uuid] = opts.cb
        @send(message.execute_code(id:uuid, code:opts.code, preparse:opts.preparse, allow_cache:opts.allow_cache, data:opts.data))
        return uuid

    # introspection
    introspect: (opts) ->
        opts = defaults opts,
            line          :  required
            timeout       :  DEFAULT_TIMEOUT          # max time to wait in seconds before error
            session_uuid  :  required
            preparse      :  true
            cb            :  required  # pointless without a callback

        mesg = message.introspect
            line         : opts.line
            session_uuid : opts.session_uuid
            preparse     : opts.preparse

        @call
            message : mesg
            timeout : opts.timeout
            cb      : opts.cb

    call: (opts={}) =>
        # This function:
        #    * Modifies the message by adding an id attribute with a random uuid value
        #    * Sends the message to the hub
        #    * When message comes back with that id, call the callback and delete it (if cb opts.cb is defined)
        #      The message will not be seen by @handle_message.
        #    * If the timeout is reached before any messages come back, delete the callback and stop listening.
        #      However, if the message later arrives it may still be handled by @handle_message.
        opts = defaults opts,
            message : required
            timeout : undefined
            cb      : undefined
        if not opts.cb?
            @send(opts.message)
            return
        if not opts.message.id?
            id = misc.uuid()
            opts.message.id = id
        else
            id = opts.message.id
        @call_callbacks[id] = opts.cb
        @send(opts.message)
        if opts.timeout
            setTimeout(
                (() =>
                    if @call_callbacks[id]?
                        error = "Timeout after #{opts.timeout} seconds"
                        opts.cb(error, message.error(id:id, error:error))
                        @call_callbacks[id] = null
                ), opts.timeout*1000
            )

    call_local_hub: (opts) =>
        opts = defaults opts,
            project_id : required    # determines the destination local hub
            message    : required
            multi_response : false
            timeout    : undefined
            cb         : undefined
        m = message.local_hub
                multi_response : opts.multi_response
                project_id : opts.project_id
                message    : opts.message
                timeout    : opts.timeout
        if opts.cb?
            f = (err, resp) =>
                #console.log("call_local_hub:#{misc.to_json(opts.message)} got back #{misc.to_json(err:err,resp:resp)}")
                opts.cb?(err, resp)
        else
            f = undefined

        if opts.multi_response
            m.id = misc.uuid()
            #console.log("setting up execute callback on id #{m.id}")
            @execute_callbacks[m.id] = (resp) =>
                #console.log("execute_callback: ", resp)
                opts.cb?(undefined, resp)
            @send(m)
        else
            @call
                message : m
                timeout : opts.timeout
                cb      : f


    #################################################
    # Version
    #################################################
    server_version: (opts) =>
        opts = defaults opts,
            cb : required
        @call
            message : message.get_version()
            cb      : (err, mesg) =>
                opts.cb(err, mesg.version)

    #################################################
    # Stats
    #################################################
    server_stats: (opts) =>
        opts = defaults opts,
            cb : required
        @call
            message : message.get_stats()
            cb      : (err, mesg) =>
                if err
                    opts.cb(err)
                else if mesg.event == 'error'
                    opts.cb(mesg.error)
                else
                    opts.cb(err, mesg.stats)

    #################################################
    # Account Management
    #################################################
    create_account: (opts) =>
        opts = defaults(opts,
            first_name     : required
            last_name      : required
            email_address  : required
            password       : required
            agreed_to_terms: required
            timeout        : DEFAULT_TIMEOUT # seconds
            cb             : required
        )
        mesg = message.create_account(
            first_name     : opts.first_name
            last_name      : opts.last_name
            email_address  : opts.email_address
            password       : opts.password
            agreed_to_terms: opts.agreed_to_terms
        )
        @call(message:mesg, timeout:opts.timeout, cb:opts.cb)

    sign_in: (opts) ->
        opts = defaults opts,
            email_address : required
            password      : required
            remember_me   : false
            cb            : required
            timeout       : DEFAULT_TIMEOUT # seconds

        @call
            message : message.sign_in(email_address:opts.email_address, password:opts.password, remember_me:opts.remember_me)
            timeout : opts.timeout
            cb      : (error, mesg) =>
                opts.cb(error, mesg)

    sign_out: (opts) ->
        opts = defaults opts,
            cb           : undefined
            timeout      : DEFAULT_TIMEOUT # seconds

        @account_id = undefined

        @call
            message : message.sign_out()
            timeout : opts.timeout
            cb      : opts.cb

    change_password: (opts) ->
        opts = defaults opts,
            email_address : required
            old_password  : required
            new_password  : required
            cb            : undefined
        @call
            message : message.change_password
                email_address : opts.email_address
                old_password  : opts.old_password
                new_password  : opts.new_password
            cb : opts.cb

    change_email: (opts) ->
        opts = defaults opts,
            account_id        : required
            old_email_address : required
            new_email_address : required
            password          : required
            cb                : undefined

        @call
            message: message.change_email_address
                account_id        : opts.account_id
                old_email_address : opts.old_email_address
                new_email_address : opts.new_email_address
                password          : opts.password
            cb : opts.cb

    # forgot password -- send forgot password request to server
    forgot_password: (opts) ->
        opts = defaults opts,
            email_address : required
            cb            : required
        @call
            message: message.forgot_password
                email_address : opts.email_address
            cb: opts.cb

    # forgot password -- send forgot password request to server
    reset_forgot_password: (opts) ->
        opts = defaults(opts,
            reset_code    : required
            new_password  : required
            cb            : required
            timeout       : DEFAULT_TIMEOUT # seconds
        )
        @call(
            message : message.reset_forgot_password(reset_code:opts.reset_code, new_password:opts.new_password)
            cb      : opts.cb
        )

    # cb(false, message.account_settings), assuming this connection has logged in as that user, etc..  Otherwise, cb(error).
    get_account_settings: (opts) ->
        opts = defaults opts,
            account_id : required
            cb         : required

        @call
            message : message.get_account_settings(account_id: opts.account_id)
            timeout : DEFAULT_TIMEOUT
            cb      : opts.cb

    # restricted settings are only saved if the password is set; otherwise they are ignored.
    save_account_settings: (opts) ->
        opts = defaults opts,
            account_id : required
            settings   : required
            password   : undefined
            cb         : undefined

        @call
            message : message.account_settings(misc.merge(opts.settings, {account_id: opts.account_id, password: opts.password}))
            cb      : opts.cb


    ############################################
    # Scratch worksheet
    # TODO: delete all this -- is deprecated.
    #############################################
    save_scratch_worksheet: (opts={}) ->
        opts = defaults opts,
            data : required
            cb   : undefined   # cb(false, info) = saved ok; cb(true, info) = did not save
        if @account_id?
            @call
                message : message.save_scratch_worksheet(data:opts.data)
                timeout : 5
                cb      : (error, m) ->
                    if error
                        opts.cb(true, m.error)
                    else
                        opts.cb(false, "Saved scratch worksheet to server.")
        else
            if localStorage?
                localStorage.scratch_worksheet = opts.data
                opts.cb(false, "Saved scratch worksheet to local storage in your browser (sign in to save to backend database).")
            else
                opts.cb(true, "Log in to save scratch worksheet.")

    load_scratch_worksheet: (opts={}) ->
        opts = defaults opts,
            cb      : required
            timeout : 5
        if @account_id?
            @call
                message : message.load_scratch_worksheet()
                timeout : opts.timeout
                cb      : (error, m) ->
                    if error
                        opts.cb(true, m.error)
                    else
                        opts.cb(false, m.data)
        else
            if localStorage? and localStorage.scratch_worksheet?
                opts.cb(false, localStorage.scratch_worksheet)
            else
                opts.cb(true, "Log in to load scratch worksheet.")

    delete_scratch_worksheet: (opts={}) ->
        opts = defaults opts,
            cb   : undefined
        if @account_id?
            @call
                message : message.delete_scratch_worksheet()
                timeout : 5
                cb      : (error, m) ->
                    if error
                        opts.cb?(true, m.error)
                    else
                        opts.cb?(false, "Deleted scratch worksheet from the server.")
        else
            if localStorage? and localStorage.scratch_worksheet?
                delete localStorage.scratch_worksheet
            opts.cb?(false)


    ############################################
    # User Feedback
    #############################################
    report_feedback: (opts={}) ->
        opts = defaults opts,
            category    : required
            description : required
            nps         : undefined
            cb          : undefined

        @call
            message: message.report_feedback
                category    : opts.category
                description : opts.description
                nps         : opts.nps
            cb     : opts.cb

    feedback: (opts={}) ->
        opts = defaults opts,
            cb : required
        @call
            message: message.get_all_feedback_from_user()
            cb : (err, results) ->
                opts.cb(err, misc.from_json(results?.data))

    #################################################
    # Project Management
    #################################################
    create_project: (opts) ->
        opts = defaults opts,
            title       : required
            description : required
            public      : required
            hidden      : false
            cb          : undefined
        @call
            message: message.create_project(title:opts.title, description:opts.description, public:opts.public, hidden:opts.hidden)
            cb     : opts.cb

    get_projects: (opts) ->
        opts = defaults opts,
            hidden : false
            cb : required
        @call
            message : message.get_projects(hidden:opts.hidden)
            cb      : opts.cb

    #################################################
    # Individual Projects
    #################################################

    project_info: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        @call
            message : message.get_project_info(project_id : opts.project_id)
            cb      : (err, resp) =>
                opts.cb(err, resp?.info)

    # Return info about all sessions that have been started in this
    # project, since the local hub was started.
    project_session_info: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        @call
            message : message.project_session_info(project_id : opts.project_id)
            cb      : (err, resp) =>
                opts.cb(err, resp?.info)

    update_project_data: (opts) ->
        opts = defaults opts,
            project_id : required
            data       : required
            timeout    : DEFAULT_TIMEOUT
            cb         : undefined    # cb would get project_data_updated message back, as does everybody else with eyes on this project
        @call
            message: message.update_project_data(project_id:opts.project_id, data:opts.data)
            cb : opts.cb

    open_project: (opts) ->
        opts = defaults opts,
            project_id   : required
            cb           : required
        @call
            message :
                message.open_project
                    project_id : opts.project_id
            cb : opts.cb

    close_project: (opts) ->
        opts = defaults opts,
            project_id  : required
            cb          : undefined
        @call
            message :
                message.close_project
                    project_id  : opts.project_id
            cb : opts.cb

    delete_project: (opts) =>
        opts = defaults opts,
            project_id : required
            timeout    : DEFAULT_TIMEOUT
            cb         : undefined
        @call
            message :
                message.delete_project
                    project_id  : opts.project_id
            timeout : opts.timeout
            cb : opts.cb

    undelete_project: (opts) =>
        opts = defaults opts,
            project_id : required
            timeout    : DEFAULT_TIMEOUT
            cb         : undefined
        @call
            message :
                message.undelete_project
                    project_id  : opts.project_id
            timeout : opts.timeout
            cb : opts.cb

    # hide the given project from this user
    hide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : undefined
        @call
            message :
                message.hide_project_from_user
                    project_id  : opts.project_id
            cb : opts.cb

    # unhide the given project from this user
    unhide_project_from_user: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : undefined
        @call
            message :
                message.unhide_project_from_user
                    project_id  : opts.project_id
            cb : opts.cb

    move_project: (opts) =>
        opts = defaults opts,
            project_id : required
            timeout    : 60*15              # 15 minutes -- since moving a project is potentially time consuming.
            target     : undefined          # optional target; if given will attempt to move to the given host
            cb         : undefined          # cb(err, new_location)
        @call
            message :
                message.move_project
                    project_id  : opts.project_id
                    target      : opts.target
            timeout : opts.timeout
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(false, resp.location)

    write_text_file_to_project: (opts) ->
        opts = defaults opts,
            project_id : required
            path       : required
            content    : required
            timeout    : DEFAULT_TIMEOUT
            cb         : undefined

        @call
            message :
                message.write_text_file_to_project
                    project_id : opts.project_id
                    path       : opts.path
                    content    : opts.content
            timeout : opts.timeout
            cb      : (err, resp) => opts.cb?(err, resp)

    read_text_file_from_project: (opts) ->
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : required
            timeout    : DEFAULT_TIMEOUT

        @call
            message :
                message.read_text_file_from_project
                    project_id : opts.project_id
                    path       : opts.path
            timeout : opts.timeout
            cb : opts.cb

    # Like "read_text_file_from_project" above, except the callback
    # message gives a temporary url from which the file can be
    # downloaded using standard AJAX.
    read_file_from_project: (opts) ->
        opts = defaults opts,
            project_id : required
            path       : required
            timeout    : DEFAULT_TIMEOUT
            archive    : 'tar.bz2'   # NOT SUPPORTED ANYMORE! -- when path is a directory: 'tar', 'tar.bz2', 'tar.gz', 'zip', '7z'
            cb         : required

        base = window?.salvus_base_url  # will be defined in web browser
        if not base?
            base = ''
        if opts.path[0] == '/'
            # absolute path to the root
            if base != ''
                opts.path = '.sagemathcloud-local/root' + opts.path  # use root symlink, which is created by start_smc
            else
                opts.path = '.sagemathcloud/root' + opts.path  # use root symlink, which is created by start_smc

        url = encodeURI("#{base}/#{opts.project_id}/raw/#{opts.path}")

        opts.cb(false, {url:url})
        # This is the old hub/database version -- too slow, and loads the database/server, way way too much.
        ###
        @call
            timeout : opts.timeout
            message :
                message.read_file_from_project
                    project_id : opts.project_id
                    path       : opts.path
                    archive    : opts.archive
            cb : opts.cb
        ###

    move_file_in_project: (opts) ->
        opts = defaults opts,
            project_id : required
            src        : required
            dest       : required
            cb         : required
        @call
            message :
                message.move_file_in_project
                    project_id : opts.project_id
                    src        : opts.src
                    dest       : opts.dest
            cb : opts.cb

    make_directory_in_project: (opts) ->
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : required
        @call
            message :
                message.make_directory_in_project
                    project_id : opts.project_id
                    path       : opts.path
            cb : opts.cb

    # remove_file_from_project: (opts) ->
    #     opts = defaults opts,
    #         project_id : required
    #         path       : required
    #         cb         : required
    #     @call
    #         message :
    #             message.remove_file_from_project
    #                 project_id : opts.project_id
    #                 path       : opts.path
    #         cb : opts.cb

    move_file_in_project: (opts) ->
        opts = defaults opts,
            project_id : required
            src        : required
            dest       : required
            cb         : required
        @call
            message :
                message.move_file_in_project
                    project_id : opts.project_id
                    src        : opts.src
                    dest       : opts.dest
            cb : opts.cb

    project_branch_op: (opts) ->
        opts = defaults opts,
            project_id : required
            branch     : required
            op         : required
            cb         : required
        @call
            message : message["#{opts.op}_project_branch"]
                project_id : opts.project_id
                branch     : opts.branch
            cb : opts.cb


    stopped_editing_file: (opts) =>
        opts = defaults opts,
            project_id : required
            filename   : required
            cb         : undefined
        @call
            message : message.stopped_editing_file
                project_id : opts.project_id
                filename   : opts.filename
            cb      : opts.cb

    invite_noncloud_collaborators: (opts) =>
        opts = defaults opts,
            project_id : required
            to         : required
            email      : required
            cb         : required

        @call
            message: message.invite_noncloud_collaborators
                project_id : opts.project_id
                email      : opts.email
                to         : opts.to
            cb : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    if not resp.error
                        resp.error = "error inviting collaborators"
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp)

    copy_path_between_projects: (opts) =>
        opts = defaults opts,
            src_project_id    : required    # id of source project
            src_path          : required    # relative path of director or file in the source project
            target_project_id : required    # if of target project
            target_path       : undefined   # defaults to src_path
            overwrite_newer   : false       # overwrite newer versions of file at destination (destructive)
            delete_missing    : false       # delete files in dest that are missing from source (destructive)
            timeout           : undefined   # how long to wait for the copy to complete before reporting "error" (though it could still succeed)
            cb                : undefined   # cb(err)

        cb = opts.cb
        delete opts.cb

        @call
            message : message.copy_path_between_projects(opts)
            cb      : (err, resp) =>
                if err
                    cb?(err)
                else if resp.event == 'error'
                    cb?(resp.error)
                else
                    cb?(undefined, resp)

    ######################################################################
    # Execute a program in a given project
    ######################################################################
    exec: (opts) ->
        opts = defaults opts,
            project_id : required
            path       : ''
            command    : required
            args       : []
            timeout    : 30
            network_timeout : undefined
            max_output : undefined
            bash       : false
            err_on_exit : true
            cb         : required   # cb(err, {stdout:..., stderr:..., exit_code:...}).

        if not opts.network_timeout?
            opts.network_timeout = opts.timeout * 1.5

        #console.log("Executing -- #{opts.command}, #{misc.to_json(opts.args)} in '#{opts.path}'")
        @call
            message : message.project_exec
                project_id : opts.project_id
                path       : opts.path
                command    : opts.command
                args       : opts.args
                timeout    : opts.timeout
                max_output : opts.max_output
                bash       : opts.bash
                err_on_exit : opts.err_on_exit
            timeout : opts.network_timeout
            cb      : (err, mesg) ->
                #console.log("Executing #{opts.command}, #{misc.to_json(opts.args)} -- got back: #{err}, #{misc.to_json(mesg)}")
                if err
                    opts.cb(err, mesg)
                else if mesg.event == 'error'
                    opts.cb(mesg.error)
                else
                    opts.cb(false, {stdout:mesg.stdout, stderr:mesg.stderr, exit_code:mesg.exit_code})

    makedirs: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : undefined      # (err)
        @exec
            project_id : opts.project_id
            command    : 'mkdir'
            args       : ['-p', opts.path]
            cb         : opts.cb

    remove_file_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : undefined      # (err)
        @exec
            project_id : opts.project_id
            command    : 'rm'
            args       : ['-rf', opts.path]
            cb         : opts.cb

    #################################################
    # Git Commands
    # TODO: this is all deprecated (?).
    #################################################

    git_remove_file: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            author     : required
            message    : undefined
            cb         : undefined      # (err)

        if not opts.message?
            opts.message = "Remove '#{opts.path}'"

        async.series([
            (cb) =>
                @exec
                    project_id : opts.project_id
                    command    : git0
                    args       : ['rm', '-rf', opts.path]
                    cb         : (err, output) ->
                        if err
                            cb(err)
                        else if output.exit_code
                            cb(output.stdout + output.stderr)
                        else
                            cb()
            (cb) =>
                # We commit just the file that changed.
                @exec
                    project_id : opts.project_id
                    command    : git0
                    args       : ["commit", "-a", "-m", opts.message, "--author", opts.author]
                    cb         : (err, output) ->
                        if err
                            cb(err)
                        else if output.exit_code
                            cb(err + " -- " + misc.to_json(output))
                        else
                            cb()
        ], (err) =>
            if err
                opts.cb("Error removing '#{opts.path}' -- #{err}")
            else
                opts.cb()
        )

    git_commit_file: (opts) =>
        # Save just this one file in its own commit to the local git repo.
        opts = defaults opts,
            project_id : required
            path       : required
            author     : required
            message    : undefined
            cb         : undefined      # (err)

        if opts.message == "undefined"
            opts.message = "Saved '#{opts.path}'"

        nothing_to_do = false
        async.series([
            (cb) =>
                # Check to see if there are uncommited changes
                @exec
                    project_id : opts.project_id
                    command    : git0
                    args       : ['status', opts.path]
                    cb         : (err, output) ->
                        if err
                            cb(err)
                        else if output.exit_code
                            cb(output.stdout + output.stderr)
                        else if output.stdout.indexOf('nothing to commit') != -1
                            # DONE -- nothing further to do
                            nothing_to_do = true
                            cb(true)
                        else
                            # Add and commit as usual.
                            cb()
            (cb) =>
                # We add the changes to the worksheet to the repo.
                @exec
                    project_id : opts.project_id
                    command    : git0
                    args       : ["add", opts.path]
                    cb         : (err, output) ->
                        if err
                            cb(err)
                        else if output.exit_code
                            cb(output.stdout + output.stderr)
                        else
                            cb()
            (cb) =>
                # We commit just the file that changed.
                @exec
                    project_id : opts.project_id
                    command    : git0
                    args       : ["commit", "-m", opts.message, opts.path, "--author", opts.author]
                    cb         : (err, output) ->
                        if err
                            cb(err)
                        else if output.exit_code
                            cb(err + " -- " + misc.to_json(output))
                        else
                            cb()
        ], (err) =>
            if err and not nothing_to_do
                opts.cb("Error saving '#{opts.path}' to the repository -- #{err}")
            else
                opts.cb() # good
        )

    #################################################
    # Search
    #################################################

    user_search: (opts) =>
        opts = defaults opts,
            query    : required
            query_id : -1     # So we can check that it matches the most recent query
            limit    : 20
            timeout  : DEFAULT_TIMEOUT
            cb       : required

        @call
            message : message.user_search(query:opts.query, limit:opts.limit)
            timeout : opts.timeout
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(false, resp.results, opts.query_id)

    project_users: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required   # cb(err, list_of_users) -- see message.coffee for format of entries
        @call
            message : message.get_project_users(project_id:opts.project_id)
            cb      : (err, resp) =>
                if resp?.event == 'error'
                    err = resp.error
                if err
                    opts.cb(err)
                else
                    opts.cb(false, resp.users)

    project_invite_collaborator: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : (err) =>
        @call
            message : message.invite_collaborator(project_id:opts.project_id, account_id:opts.account_id)
            cb      : (err, result) =>
                if err
                    opts.cb(err)
                else if result.event == 'error'
                    opts.cb(result.error)
                else
                    opts.cb(false, result)

    project_remove_collaborator: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : (err) =>

        @call
            message : message.remove_collaborator(project_id:opts.project_id, account_id:opts.account_id)
            cb      : (err, result) =>
                if err
                    opts.cb(err)
                else if result.event == 'error'
                    opts.cb(result.error)
                else
                    opts.cb(undefined, result)

    #################################################
    # Linked projects
    #################################################
    linked_projects: (opts) =>
        opts = defaults opts,
            project_id : required
            add        : undefined   # if given should be: project_id or list of project_id's; each is added
            remove     : undefined   # if given should be: project_id or list of project_id's; each is added
            cb         : required    # if neither add nor remove are specified, then cb(err, list of linked project ids)
        if opts.add? and typeof(opts.add) == 'string'
            opts.add = [opts.add]
        if opts.remove? and typeof(opts.remove) == 'string'
            opts.remove = [opts.remove]
        @call
            message : message.linked_projects(project_id : opts.project_id, add:opts.add, remove:opts.remove)
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp.list)

    #################################################
    # File Management
    #################################################
    project_snap_listing: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : ''
            start      : 0
            limit      : 500
            timeout    : 60
            hidden     : false
            cb         : required

        if opts.path.length >= 18
            i = opts.path.indexOf('/')
            if i == -1
                opts.cb("invalid date"); return
            path0 = opts.path.slice(0,i) + ' ' + opts.path.slice(i+1)
            i = path0.indexOf('/')
            if i == -1
                path = ''
            else
                path = path0.slice(i+1)
                path0 = path0.slice(0, i)

            # This is horrible code that works on supported platforms.
            # This puts the time in a format that new Date(...) can parse on everything.
            v = path0.split(' ')
            a = new Date(v[0]).toUTCString().split(' ')
            snapshot = "#{a[1]} #{a[2]} #{a[3]} #{v[1]}"

            snapshot = (new Date(snapshot)).toISOString().slice(0,19)
            real_path = '.zfs/snapshot/' + snapshot + '/' + path
            @project_directory_listing
                path       : real_path
                project_id : opts.project_id
                hidden     : opts.hidden
                cb         : (err, files) ->
                    if err
                        opts.cb(err)
                    else
                        files.real_path = real_path
                        opts.cb(undefined, files)
            return

        @call
            message:
                message.snap
                    command         : 'ls'
                    project_id      : opts.project_id
                    path            : opts.path
                    timeout         : opts.timeout
                    timezone_offset : (new Date()).getTimezoneOffset()  # the difference (UTC time) - (local time), in minutes.

            timeout :
                opts.timeout

            cb : (err, resp) ->
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    if opts.path.length == 0
                        files = ({name:name, isdir:true} for name in resp.list)
                        opts.cb(false, {files:files})
                    else if opts.path.length == 10
                        files = ({name:new Date("Tue, 01 Jan 1974 #{file.local}").toLocaleTimeString(), isdir:true, fullname:".zfs/snapshot/#{file.utc}"} for file in resp.list)
                        opts.cb(false, {files:files})
                    else
                        opts.cb('invalid snapshot directory name')

    project_snap_status: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required     # cb(err, utc_seconds_epoch)
        @call
            message:
                message.snap
                    command    : 'status'
                    project_id : opts.project_id
            cb : (err, resp) ->
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(false, resp.list)  # it's always called "list", even if it isn't a list (in this case)


    # return the time in seconds since epoch UTC of the last snapshot.
    project_last_snapshot_time: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required     # cb(err, utc_seconds_epoch)
        @call
            message:
                message.snap
                    command    : 'last'
                    project_id : opts.project_id
            cb : (err, resp) ->
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(false, resp.list)  # it's always called "list", even if it isn't a list (in this case)

    project_directory_listing: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : '.'
            time       : false
            start      : 0
            limit      : 999999999 # effectively unlimited by default -- get what you can in the time you have...
            timeout    : 60
            hidden     : false
            cb         : required

        if opts.path.slice(0,9) == ".snapshot" and (opts.path.length == 9 or opts.path[9] == '/')
            opts.path = opts.path.slice(9)
            if opts.path.length > 0 and opts.path[0] == '/'
                opts.path = opts.path.slice(1)  # delete leading slash
            delete opts.time
            @project_snap_listing(opts)
            return

        args = []
        if opts.time
            args.push("--time")
        if opts.hidden
            args.push("--hidden")
        args.push("--limit")
        args.push(opts.limit)
        args.push("--start")
        args.push(opts.start)
        if opts.path == ""
            opts.path = "."
        args.push(opts.path)

        @exec
            project_id : opts.project_id
            command    : gitls
            args       : args
            timeout    : opts.timeout
            cb         : (err, output) ->
                if err
                    opts.cb(err)
                else if output.exit_code
                    opts.cb(output.stderr)
                else
                    v = misc.from_json(output.stdout)
                    if opts.path == '.' and opts.hidden
                        v.files.unshift({name:'.snapshot', isdir:true})
                    opts.cb(err, v)

    project_status: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required     # cb(err, utc_seconds_epoch)
        @call
            message:
                message.project_status
                    project_id : opts.project_id
            cb : (err, resp) ->
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(false, resp.status)

    project_get_state: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required     # cb(err, utc_seconds_epoch)
        @call
            message:
                message.project_get_state
                    project_id : opts.project_id
            cb : (err, resp) ->
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(false, resp.state)

    project_get_local_state: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required     # cb(err, utc_seconds_epoch)
        @call
            message:
                message.project_get_local_state
                    project_id : opts.project_id
            cb : (err, resp) ->
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(false, resp.state)

    #################################################
    # Project Server Control
    #################################################
    restart_project_server: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required    # will keep retrying until it succeeds at which point opts.cb().

        @call
            message : message.project_restart(project_id:opts.project_id)
            timeout : 30    # should take about 5 seconds, but maybe network is slow (?)
            cb      : opts.cb

    close_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required    # will keep retrying until it succeeds at which point opts.cb().

        @call
            message : message.close_project(project_id:opts.project_id)
            timeout : 120
            cb      : opts.cb

    #################################################
    # Some UI state
    #################################################
    in_fullscreen_mode: (state) =>
        if state?
            @_fullscreen_mode = state
        return $(window).width() <= 979 or @_fullscreen_mode

    #################################################
    # Tasks
    #################################################
    ### -- commented out here and in hub, since not used and security not implemented anyways.
    create_task_list: (opts) =>
        opts = defaults opts,
            owners       : required
            cb           : required
        @call
            message :
                message.create_task_list
                    owners       : opts.owners
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp.task_list_id)

    edit_task_list: (opts) =>
        opts = defaults opts,
            task_list_id : required
            project_id   : undefined    # give this if task list usage is authenticated via project_id
            data         : undefined
            deleted      : undefined    # use for deleting a task list
            cb           : undefined
        @call
            message :
                message.edit_task_list
                    task_list_id : opts.task_list_id
                    project_id   : opts.project_id
                    data         : opts.data
                    deleted      : opts.deleted
            cb : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined)

    get_task_list_last_edited: (opts) =>
        opts = defaults opts,
            task_list_id : required
            project_id   : undefined    # give this if task list usage is authenticated via project_id
            cb           : required
        @call
            message :
                message.get_task_list_last_edited
                    task_list_id    : opts.task_list_id
                    project_id      : opts.project_id
            cb : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp.last_edited)


    get_task_list: (opts) =>
        opts = defaults opts,
            task_list_id : required
            project_id   : undefined    # give this if task list usage is authenticated via project_id
            columns      : undefined
            include_deleted : false
            cb           : required
        @call
            message :
                message.get_task_list
                    task_list_id    : opts.task_list_id
                    project_id      : opts.project_id
                    include_deleted : opts.include_deleted
                    columns         : opts.columns
            cb : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp.task_list)

    set_project_task_list: (opts) =>
        opts = defaults opts,
            task_list_id : required
            project_id   : undefined    # give this if task list usage is authenticated via project_id
            cb           : undefined
        @call
            message :
                message.set_project_task_list
                    task_list_id    : opts.task_list_id
                    project_id      : opts.project_id
            cb : (err, resp) =>
                if err
                    opts.cb?(err)
                else if resp.event == 'error'
                    opts.cb?(resp.error)
                else
                    opts.cb()

    create_task: (opts) =>
        opts = defaults opts,
            task_list_id : required
            title        : "No title"
            position     : 0
            project_id   : undefined    # give this if task list usage is authenticated via project_id
            cb           : required
        @call
            message :
                message.create_task
                    task_list_id : opts.task_list_id
                    title        : opts.title
                    position     : opts.position
                    project_id   : opts.project_id
            cb : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp.task_id)

    edit_task: (opts) =>
        opts = defaults opts,
            task_list_id : required
            task_id      : required
            project_id   : undefined    # give this if task list usage is authenticated via project_id
            id           : undefined
            title        : undefined
            position     : undefined
            done         : undefined
            data         : undefined
            deleted      : undefined
            sub_task_list_id : undefined
            cb           : undefined

        @call
            message :
                message.edit_task
                    task_list_id : opts.task_list_id
                    task_id      : opts.task_id
                    project_id   : opts.project_id
                    title        : opts.title
                    position     : opts.position
                    deleted      : opts.deleted
                    sub_task_list_id : opts.sub_task_list_id
                    data         : opts.data
                    done         : opts.done
            cb : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp.task_id)
    ###


#################################################
# Other account Management functionality shared between client and server
#################################################

reValidEmail = (() ->
    sQtext = "[^\\x0d\\x22\\x5c\\x80-\\xff]"
    sDtext = "[^\\x0d\\x5b-\\x5d\\x80-\\xff]"
    sAtom = "[^\\x00-\\x20\\x22\\x28\\x29\\x2c\\x2e\\x3a-\\x3c\\x3e\\x40\\x5b-\\x5d\\x7f-\\xff]+"
    sQuotedPair = "\\x5c[\\x00-\\x7f]"
    sDomainLiteral = "\\x5b(" + sDtext + "|" + sQuotedPair + ")*\\x5d"
    sQuotedString = "\\x22(" + sQtext + "|" + sQuotedPair + ")*\\x22"
    sDomain_ref = sAtom
    sSubDomain = "(" + sDomain_ref + "|" + sDomainLiteral + ")"
    sWord = "(" + sAtom + "|" + sQuotedString + ")"
    sDomain = sSubDomain + "(\\x2e" + sSubDomain + ")*"
    sLocalPart = sWord + "(\\x2e" + sWord + ")*"
    sAddrSpec = sLocalPart + "\\x40" + sDomain # complete RFC822 email address spec
    sValidEmail = "^" + sAddrSpec + "$" # as whole string
    return new RegExp(sValidEmail)
)()

exports.is_valid_email_address = (email) ->
    # From http://stackoverflow.com/questions/46155/validate-email-address-in-javascript
    # but converted to Javascript; it's near the middle but claims to be exactly RFC822.
    if reValidEmail.test(email)
        return true
    else
        return false

exports.is_valid_password = (password) ->
    if password.length >= 6 and password.length <= 64
        return [true, '']
    else
        return [false, 'Password must be between 6 and 64 characters in length.']

exports.issues_with_create_account = (mesg) ->
    issues = {}
    if not mesg.agreed_to_terms
        issues.agreed_to_terms = 'Agree to the Salvus Terms of Service.'
    if mesg.first_name == ''
        issues.first_name = 'Enter a first name.'
    if mesg.last_name == ''
        issues.last_name = 'Enter a last name.'
    if not exports.is_valid_email_address(mesg.email_address)
        issues.email_address = 'Email address does not appear to be valid.'
    [valid, reason] = exports.is_valid_password(mesg.password)
    if not valid
        issues.password = reason
    return issues



##########################################################################


htmlparser = require("htmlparser")

# extract plain text from a dom tree object, as produced by htmlparser.
dom_to_text = (dom, divs=false) ->
    result = ''
    for d in dom
        switch d.type
            when 'text'
                result += d.data
            when 'tag'
                switch d.name
                    when 'div','p'
                        divs = true
                        result += '\n'
                    when 'br'
                        if not divs
                            result += '\n'
        if d.children?
            result += dom_to_text(d.children, divs)
    result = result.replace(/&nbsp;/g,' ')
    return result

# html_to_text returns a lossy plain text representation of html,
# which does preserve newlines (unlink wrapped_element.text())
exports.html_to_text = (html) ->
    handler = new htmlparser.DefaultHandler((error, dom) ->)
    (new htmlparser.Parser(handler)).parseComplete(html)
    return dom_to_text(handler.dom)

