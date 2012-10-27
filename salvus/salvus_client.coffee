###
# Persistent connection to a particular sage session
###
#

message = require("salvus_message")

exports.message = message

class exports.Session
    """
    EXAMPLES

        WebSocketClient = require("sockjs_test_client").WebSocketClient; Session = require("salvus_client").Session
        c = new Session('localhost', 5000, WebSocketClient, (m) -> console.log(m))
        
        message = require('salvus_message'); c.send(message.execute_code(0,'a=10')); c.send(message.execute_code(0,'a'))
        c.send(message.execute_code(0, 'factor(2^997-1)'))
        c.send(message.send_signal())        
    """
    constructor: (address, port, Client, cb) ->
        @cb = cb
        @c = new Client(address, port, (mesg) =>
            if mesg.event == "new_session"
                @session_uuid = mesg.session_uuid
            else
                @cb(mesg)
        )
        @c.send(message.start_session({walltime:60*5, cputime:60*5, numfiles:1000, vmem:2000}))
        
    send: (mesg) ->
        mesg.session_uuid = @session_uuid
        @c.send(mesg)

ifdef = (x, def) -> if x? then x else def

#sockjs = (address, port) ->
#    try
#        lib = require("sockjs-client-ws")
        
        


class exports.NodeClient
    """
    EXAMPLES:

        messages = []; message = require('salvus_message')
        c = new (require("sockjs_test_client").Client)('localhost', 5000, (m) -> messages.push(m); console.log(m))

        # stateless_exec of code:
        c.send(message.execute_code(0,'2+2'))

        # test output appearing in a sequence of messages:
        c.send(message.execute_code(0,'for i in [1..10]:\n   sleep(.2), i'))

        # create a new persistent sessions
        c.send(message.start_session({walltime:60*5, cputime:60*5, numfiles:1000, vmem:2000}))
        # ---> outputs something like this:
           { event: 'new_session', session_uuid: '286a470b-fbb8-4b8b-936d-968c977546bd',
             limits: { vmem: 2000, numfiles: 1000, cputime: 60, walltime: 60 } }
            
        m = messages[messages.length-1]; c.send(message.execute_code(0, '2+2', m.session_uuid))

        # test sending interrupt signal to persistent session:
        c.send(message.execute_code(0, 'sleep(100)', m.session_uuid))
        c.send(message.send_signal(m.session_uuid))
        
    """
    constructor: (address, port, recv) ->
        #@client = require("sockjs-client-ws").create("http://#{address}:#{port}/hub")  # https is not supported
        @client.on('connection', -> winston.info("connection established"))
        @client.on('error', (e) -> winston.error("error: #{e}"))
        @client.on('data', (mesg) -> recv(JSON.parse(mesg)))
        
    send: (mesg) ->
        #console.log("sending... #{JSON.stringify(mesg)}")
        @client.write(JSON.stringify(mesg))


class exports.BrowserClient
    constructor: (address, port, recv) ->
        @conn = new SockJS("https://#{address}:#{port}/hub")
        @conn.onmessage = (e) => recv(e.data)
        
    send: (mesg) ->
        #console.log("sending... #{JSON.stringify(mesg)}")
        @client.write(JSON.stringify(mesg))
