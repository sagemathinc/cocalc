###
# From NodeJS (coffeescript):
# 
#     c = require('client_node').connect("http://localhost:5000"); s = c.new_session()
#
# From the browser console with      <script type="text/javascript" src="/salvus.js"></script>
#
#     c = salvus.connect("https://localhost"); s = c.new_session()
# 
###

message = require("salvus_message")
misc = require("misc")

{EventEmitter} = require('events')
    
class Session extends EventEmitter
    constructor: (conn, @requested_limits) ->
        @_conn = conn
        @start_time = misc.walltime()

    walltime: () -> misc.walltime() - @start_time

    _init: (session_uuid, limits) ->
        @session_uuid = session_uuid
        @limits = limits
    
class exports.Connection
    constructor: (opts) ->
        @_id_counter = 0
        @_sessions = {}
        @_new_sessions = {}
        @_send = opts.send
        opts.set_onmessage(@onmessage)
        opts.set_onerror(@onerror)
        
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
                
        console.log("message: #{data}")

    onerror: (data) =>
        console.log("ERROR: #{data}")

    new_session: (limits={}) ->
        id = @_id_counter++
        session = new Session(this, limits)
        @_new_sessions[id] = session
        @send(message.start_session(id, limits))
        return session

