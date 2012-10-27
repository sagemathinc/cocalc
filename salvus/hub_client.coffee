message = require("salvus_message")
sjsc = require("sockjs-client-ws")
winston = require("winston")


class exports.Client
    """
    EXAMPLES:

        messages = []; message = require('salvus_message')
        c = new (require("hub_client").Client)('localhost', 5000, (m) -> messages.push(m); console.log(m))

        # stateless_exec of code:
        c.send(message.execute_code(0,'2+2'))

        # test output appearing in a sequence of messages:
        c.send(message.execute_code(0,'for i in [1..10]:\n   sleep(.2), i'))

        # create a new persistent sessions
        c.send(message.start_session({walltime:60*5, cputime:60*5, numfiles:1000, vmem:2000}))
        # ---> outputs something like this:
           { event: 'new_session', session_uuid: '286a470b-fbb8-4b8b-936d-968c977546bd',
             limits: { vmem: 2000, numfiles: 1000, cputime: 60, walltime: 60 } }
            
        m = messages[messages.length-1]
        c.send(message.execute_code(0, '2+2', m.session_uuid))
        
    """
    constructor: (address, port, data_cb) ->
        @client = sjsc.create("http://#{address}:#{port}/hub")  # https is not supported
        @client.on('connection', -> winston.info("connection established"))
        @client.on('error', (e) -> winston.error("error: #{e}"))
        @client.on('data', (mesg) -> data_cb(JSON.parse(mesg)))
        
    send: (mesg) ->
        @client.write(JSON.stringify(mesg))






#########################################################################

# BELOW -- some crap to delete:
    
        
###
#client = sjsc.create("https://localhost/node")  # doesn't work -- don't know why

#client = sjsc.create("http://localhost:5000/node")

#client = sjsc.create("http://10.1.1.3:5000/node")

walltime = -> (new Date()).getTime()
tm = 0
n = 0

client.on('connection', ->
    console.log("connection established")
    tm = walltime()
    client.write(JSON.stringify(message.execute_code(0,'2+2')))
    )

client.on('data', (msg) ->
    t = walltime() - tm
    n = n + 1
    console.log("#{n}: #{Math.floor(n/t*1000)} tps, #{t} ms -- received some data #{msg}")
    if n == 100
        n = 0
        tm = walltime() # start over
    console.log(msg)
    if JSON.parse(msg).done
        console.log("sending 2+2...")
        client.write(JSON.stringify(message.execute_code(n,'2+2')))
)

client.on('error', (e) -> console.log("something went wrong #{e}"))
###