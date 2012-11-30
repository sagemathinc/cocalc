{EventEmitter} = require('events')

message = require("message")
misc    = require("misc")
defaults = misc.defaults
required = defaults.required

class Session extends EventEmitter
    # events:
    #    - 'open'   -- session is initialized, open and ready to be used
    #    - 'close'  -- session's connection is closed/terminated
    constructor: (opts) ->
        opts = defaults opts,
            conn         : required  # a Connection instance
            limits       : required  # object giving limits of session that we actually got
            session_uuid : required

        @start_time   = misc.walltime()
        @conn         = opts.conn
        @limits       = opts.limits
        @session_uuid = opts.session_uuid
        @emit("open")

    walltime: () ->
        return misc.walltime() - @start_time

    # If cb is given, it is called every time output for this particular code appears;
    # No matter what, you can always still listen in with the 'output' even, and note
    # the uuid, which is returned from this function.
    execute_code: (opts={}) ->
        opts = defaults(opts, code:defaults.required, cb:null, preparse:true)
        uuid = misc.uuid()
        if opts.cb?
            @conn.execute_callbacks[uuid] = opts.cb
        @conn.send(message.execute_code(id:uuid, code:opts.code, session_uuid:@session_uuid, preparse:opts.preparse))
        return uuid

    # default = SIGINT
    interrupt: () ->
        @conn.send(message.send_signal(session_uuid:@session_uuid, signal:2))

    kill: () ->
        @emit("close")
        @conn.send(message.send_signal(session_uuid:@session_uuid, signal:9))

    introspect: (opts) ->
        opts.session_uuid = @session_uuid
        @conn.introspect(opts)

class exports.Connection extends EventEmitter
    # Connection events:
    #    - 'connecting' -- trying to establish a connection
    #    - 'connected'  -- succesfully established a connection; data is the protocol as a string
    #    - 'error'      -- called when an error occurs
    #    - 'output'     -- received some output for stateless execution (not in any session)
    #    - 'ping'       -- a pong is received back; data is the round trip ping time
    #    - 'message'    -- any message is received
    #    - 'signed_in'  -- server pushes a succesful sign in to the client (e.g., due to
    #                      'remember me' functionality); data is the signed_in message.
    #    - 'project_list_updated' -- sent whenever the list of projects owned by this user
    #                      changed; data is empty -- browser could ignore this unless
    #                      the project list is currently being displayed.
    #    - 'project_data_changed - sent when data about a specific project has changed,
    #                      e.g., title/description/settings/etc.


    constructor: (@url) ->
        @emit("connecting")
        @_id_counter = 0
        @_sessions = {}
        @_new_sessions = {}
        @execute_callbacks = {}
        @call_callbacks = {}

        # IMPORTANT! Connection is an abstract base class.  Derived classes must
        # implement a method called _connect that takes a URL and a callback, and connects to
        # the SockJS server with that url, then creates the following event emitters:
        #      "connected", "error", "close"
        # and returns a function to write raw data to the socket.

        @_connect(@url, (data) => @emit("message", misc.from_json(data)))
        @on("message", @handle_message)

        @_last_pong = misc.walltime()
        @_connected = false
        @_ping_check_interval = 10000
        @_ping_check_id = setInterval((()=>@ping(); @_ping_check()), @_ping_check_interval)

    close: () ->
        clearInterval(@_ping_check_id)
        @_conn.close()

    _ping_check: () ->
        if @_connected and (@_last_ping - @_last_pong > 1.1*@_ping_check_interval/1000.0)
            @_fix_connection?()

    send: (mesg) ->
        try
            @_write(misc.to_json(mesg))
        catch err
            # this happens when trying to send and not connected
            #console.log(err)

    handle_message: (mesg) ->
        switch mesg.event
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
            when "pong"
                @_last_pong = misc.walltime()
                @emit("ping", @_last_pong - @_last_ping)
            when "cookies"
                @_cookies?(mesg)
            when "signed_in"
                @account_id = mesg.account_id
                @emit("signed_in", mesg)
            when "project_list_updated", 'project_data_changed'
                @emit(mesg.event, mesg)

        id = mesg.id  # the call f(null,mesg) can mutate mesg (!), so we better save the id here.
        f = @call_callbacks[id]
        if f?
            if f != null
                f(null, mesg)
            delete @call_callbacks[id]
            return

    ping: () ->
        @_last_ping = misc.walltime()
        @send(message.ping())

    new_session: (opts) ->
        opts = defaults opts,
            limits  : required
            timeout : 10          # how long until give up on getting a new session
            cb      : undefined   # cb(error, session)  if error is defined it is a string

        @call
            message : message.start_session(limits:opts.limits)
            timeout : opts.timeout
            cb      : (error, reply) =>
                if error
                    opts.cb(error)
                else
                    if reply.event == 'error'
                        opts.cb(reply.error)
                    else if reply.event == "session_started"
                        session = new Session(conn:@, limits:reply.limits, session_uuid:reply.session_uuid)
                        @_sessions[reply.session_uuid] = session
                        opts.cb(false, session)
                    else
                        opts.cb("Unknown event (='#{reply.event}') in response to start_session message.")

    execute_code: (opts={}) ->
        opts = defaults(opts, code:defaults.required, cb:null, preparse:true, allow_cache:true)
        uuid = misc.uuid()
        if opts.cb?
            @execute_callbacks[uuid] = opts.cb
        @send(message.execute_code(id:uuid, code:opts.code, preparse:opts.preparse, allow_cache:opts.allow_cache))
        return uuid

    # introspection
    introspect: (opts) ->
        opts = defaults opts,
            text_before_cursor: required
            text_after_cursor:  undefined
            timeout          :  3         # max time to wait in seconds before error
            session_uuid     :  required
            cb               :  required  # pointless without a callback

        mesg = message.introspect
            text_before_cursor : opts.text_before_cursor
            text_after_cursor  : opts.text_after_cursor
            session_uuid       : opts.session_uuid

        @call
            message : mesg
            timeout : opts.timeout
            cb      : opts.cb


    call: (opts={}) ->
        # This function:
        #    * Modifies the message by adding an id attribute with a random uuid value
        #    * Sends the message to the hub
        #    * When message comes back with that id, call the callback and delete it (if cb opts.cb is defined)
        #      The message will not be seen by @handle_message.
        #    * If the timeout is reached before any messages come back, delete the callback and stop listening.
        #      However, if the message later arrives it may still be handled by @handle_message.
        opts = defaults(opts, message:defaults.required, timeout:null, cb:undefined)
        if not opts.cb?
            @send(opts.message)
            return
        id = misc.uuid()
        opts.message.id = id
        @call_callbacks[id] = opts.cb
        @send(opts.message)
        if opts.timeout?
            setTimeout(
                (() =>
                    if @call_callbacks[id]?
                        error = "Timeout after #{opts.timeout} seconds"
                        opts.cb(error, message.error(id:id, error:error))
                        @call_callbacks[id] = null
                ), opts.timeout*1000
            )


    #################################################
    # Account Management
    #################################################
    create_account: (opts) ->
        opts = defaults(opts,
            first_name     : required
            last_name      : required
            email_address  : required
            password       : required
            agreed_to_terms: required
            timeout        : 10 # seconds
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
        opts = defaults(opts,
            email_address : required
            password     : required
            remember_me  : false
            cb           : required
            timeout      : 10 # seconds
        )
        @call(
            message : message.sign_in(email_address:opts.email_address, password:opts.password, remember_me:opts.remember_me)
            timeout : opts.timeout
            cb      : (error, mesg) =>
                opts.cb(error, mesg)
        )

    sign_out: (opts) ->
        opts = defaults(opts,
            cb           : undefined
            timeout      : 10 # seconds
        )

        @account_id = undefined

        @call(
            message : message.sign_out()
            timeout : opts.timeout
            cb      : opts.cb
        )

    change_password: (opts) ->
        opts = defaults(opts,
            email_address : required
            old_password  : required
            new_password  : required
            cb            : undefined
        )
        @call(
            message : message.change_password(
                email_address : opts.email_address
                old_password  : opts.old_password
                new_password  : opts.new_password)
            cb : opts.cb
        )

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
            timeout       : 10 # seconds
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
            timeout : 10
            cb      : opts.cb

    # restricted settings are only saved if the password is set; otherwise they are ignored.
    save_account_settings: (opts) ->
        opts = defaults opts,
            account_id : required
            settings   : required
            password   : undefined
            cb         : required

        @call
            message : message.account_settings(misc.merge(opts.settings, {account_id: opts.account_id, password: opts.password}))
            cb      : opts.cb


    ############################################
    # Scratch worksheet
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
            cb   : required
        if @account_id?
            @call
                message : message.load_scratch_worksheet()
                timeout : 5
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
            cb          : undefined
        @call
            message: message.create_project(title:opts.title, description:opts.description, public:opts.public)
            cb     : opts.cb

    get_projects: (opts) ->
        opts = defaults opts,
            cb : required
        @call
            message : message.get_projects()
            cb      : opts.cb

    #################################################
    # Individual Projects
    #################################################
    update_project_data: (opts) ->
        opts = defaults opts,
            project_id : required
            data       : required
            timeout    : 10
            cb         : undefined    # cb would get project_data_updated message back, as does everybody else with eyes on this project
        @call
            message: message.update_project_data(project_id:opts.project_id, data:opts.data)
            cb : opts.cb


#################################################
# Other account Management functionality shared between client and server
#################################################

check = require('validator').check

exports.is_valid_email_address = (email) ->
    try
        check(email).isEmail()
        return true
    catch err
        return false

exports.is_valid_password = (password) ->
    try
        check(password).len(3, 64)
        return [true, '']
    catch err
        return [false, 'Password must be between 3 and 64 characters in length.']

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
