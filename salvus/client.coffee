###
# From NodeJS (coffeescript):
#

     c = require('client_node').connect("http://localhost:5000", () -> c.on("output", (mesg) -> console.log("output: #{mesg.stdout}")))
     c.execute_code("2+3")    
     
     s=null; c = require('client_node').connect("http://localhost:5000", () -> s = c.new_session())
     s.on("output", (mesg) -> console.log("#{mesg.stdout}#{if mesg.stderr? then '**'+mesg.stderr else ''}"))
     c.on("close", () -> console.log("connection closed"))
     s.on("close", () -> console.log("session closed"))
     s.execute_code("2+3")
     s.removeAllListeners("output")
#
# From the browser console with      <script type="text/javascript" src="/salvus.js"></script>
#
     c = require('client_browser').connect('https://localhost', function(){ s=c.new_session()} )
     s.on("output", function(mesg) { console.log("output: #{mesg}")} )
     c.on("close", function() { console.log("connection closed!"); })
     s.on("close", function() { console.log("session closed"); })
     s.execute_code("2+3")
     
# 
###

message = require("salvus_message")
misc    = require("misc")

to_json = misc.to_json
from_json = misc.from_json

{EventEmitter} = require('events')
    
class Session extends EventEmitter
    # events:
    #    - 'output' -- received some output
    #    - 'open'   -- session is initialized, open and ready to be used
    #    - 'close'  -- session's connection is closed/terminated
    #    - 'error'  -- called when an error occurs 
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
    #    - 'open' -- connection is initialized, open and ready to be used; called with sockjs protocol
    #    - 'close' -- connection has closed
    #    - 'error'  -- called when an error occurs 
    #    - 'output' -- received some output for stateless execution (not in any session)
    #    - 'ping' -- called when a pong is received back; data is the round trip ping time
    #    - 'message' -- called when message is received

    constructor: (@url) ->
        @_id_counter = 0
        @_sessions = {}
        @_new_sessions = {}
        @execute_callbacks = {}

        # IMPORTANT! Connection is an abstract base class.  Derived classes must
        # implement a method called _connect that takes a URL and a callback, and connects to
        # the SockJS server with that url, then creates the following event emitters:
        #      "open", "error", "close"
        # and returns a function to write raw data to the socket.

        @_write = @_connect(@url, (data) => @emit("message", from_json(data)))
        @on("message", @handle_message)

    send: (mesg) -> @_write(to_json(mesg))

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
