###
# From NodeJS (coffeescript):
# 
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
misc = require("misc")

{EventEmitter} = require('events')
    
class Session extends EventEmitter
    # events:
    #    - 'output' -- received some output
    #    - 'open'   -- session is initialized, open and ready to be used
    #    - 'close'  -- session's connection is closed/terminated
    #    - 'error'  -- called when an error occurs 
    _init: (session_uuid, limits) ->
        @session_uuid = session_uuid
        @limits = limits
        @is_open = true
        @emit("open")
        @on("close", () => @is_open=false)

    constructor: (@conn, @requested_limits) ->
        @is_open = false
        @start_time = misc.walltime()

    walltime: () -> misc.walltime() - @start_time

    execute_code: (code, uuid=null, preparse=true) ->
        if not @is_open
            @emit("error", "trying to execute code in closed session")
            return
        uuid = if uuid? then uuid else misc.uuid()
        @conn.send(message.execute_code(uuid, code, @session_uuid, preparse))
        return uuid

    # default = SIGINT
    interrupt: () ->
        @conn.send(message.send_signal(@session_uuid, null, 2))
        
    kill: () ->
        @emit("close")
        @conn.send(message.send_signal(@session_uuid, null, 9))
        
    
class exports.Connection extends EventEmitter
    # events:
    #    - 'open' -- connection is initialized, open and ready to be used
    #    - 'close' -- connection has closed
    constructor: (opts) ->
        @_id_counter = 0
        @_sessions = {}
        @_new_sessions = {}
        @_send = opts.send
        opts.set_onmessage(@onmessage)
        opts.set_onerror(@onerror)
        @on("close", () ->
            for uuid, session of @_sessions
                session.emit("close")
        )
        
    send: (mesg) => @_send(JSON.stringify(mesg))
    
    onmessage: (data) =>
        console.log("onmessage(#{data})")
        mesg = JSON.parse(data)
        switch mesg.event
            when "new_session"
                session = @_new_sessions[mesg.id]
                delete @_new_sessions[mesg.id]
                session._init(mesg.session_uuid, mesg.limits)
                @_sessions[mesg.session_uuid] = session
            when "output"
                session = @_sessions[mesg.session_uuid]
                session.emit("output", mesg)
            when "terminate_session"
                session = @_sessions[mesg.session_uuid]
                session.emit("close")
        console.log("message: #{data}")

    onerror: (data) =>
        console.log("ERROR: #{data}")

    new_session: (limits={}) ->
        id = @_id_counter++
        session = new Session(this, limits)
        @_new_sessions[id] = session
        @send(message.start_session(id, limits))
        return session

