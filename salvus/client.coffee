{EventEmitter} = require('events')

message = require("salvus_message")
misc    = require("misc")

class Session extends EventEmitter
    # events:
    #    - 'open'   -- session is initialized, open and ready to be used
    #    - 'close'  -- session's connection is closed/terminated
    constructor: (@conn, @requested_limits) ->
        @start_time = misc.walltime()

    _init: (session_uuid, limits) ->
        @session_uuid = session_uuid
        @limits = limits
        @emit("open")

    walltime: () -> misc.walltime() - @start_time

    # If cb is given, it is called every time output for this particular code appears; 
    # No matter what, you can always still listen in with the 'output' even, and note
    # the uuid, which is returned from this function.
    execute_code: (code, cb=null, preparse=true) ->
        uuid = misc.uuid()
        if cb?
            @conn.execute_callbacks[uuid] = cb
        @conn.send(message.execute_code(id:uuid, code:code, session_uuid:@session_uuid, preparse:preparse))
        return uuid

    # default = SIGINT
    interrupt: () ->
        @conn.send(message.send_signal(session_uuid:@session_uuid, signal:2))
        
    kill: () ->
        @emit("close")
        @conn.send(message.send_signal(session_uuid:@session_uuid, signal:9))
        
    
class exports.Connection extends EventEmitter
    # Connection events:
    #    - 'connecting' -- trying to establish a connection
    #    - 'connected'  -- succesfully established a connection; data is the protocol as a string
    #    - 'error'      -- called when an error occurs 
    #    - 'output'     -- received some output for stateless execution (not in any session)
    #    - 'ping'       -- a pong is received back; data is the round trip ping time
    #    - 'message'    -- any message is received

    constructor: (@url) ->
        @emit("connecting")
        @_id_counter = 0
        @_sessions = {}
        @_new_sessions = {}
        @execute_callbacks = {}

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
            when "new_session"
                session = @_new_sessions[mesg.id]
                delete @_new_sessions[mesg.id]
                session._init(mesg.session_uuid, mesg.limits)
                @_sessions[mesg.session_uuid] = session
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
                session.emit("close")
            when "pong"
                @_last_pong = misc.walltime()
                @emit("ping", @_last_pong - @_last_ping)

    ping: () ->
        @_last_ping = misc.walltime()
        @send(message.ping())

    new_session: (limits={}) ->
        id = @_id_counter++
        session = new Session(this, limits)
        @_new_sessions[id] = session
        @send(message.start_session(id:id, limits:limits))
        return session

    execute_code: (code, cb=null, preparse=true) ->
        uuid = misc.uuid()
        if cb?
            @execute_callbacks[uuid] = cb
        @send(message.execute_code(id:uuid, code:code, preparse:preparse))
        return uuid
