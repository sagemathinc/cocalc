###
# Run this by running ./hub ...
#
# Dependencies:
# 
#    npm install commander start-stop-daemon winston sockjs helenus
#
# ** Add any new dependencies to the NODEJS_PACKAGES list in build.py **
#
###

# node.js -- builtin libraries 
http    = require('http')

# salvus libraries
sage    = require("sage")               # sage server
misc    = require("misc")
message = require("salvus_message")     # salvus message protocol
cass    = require("cassandra")

# third-party libraries
program = require('commander')          # command line arguments -- https://github.com/visionmedia/commander.js/
daemon  = require("start-stop-daemon")  # daemonize -- https://github.com/jiem/start-stop-daemon
winston = require('winston')            # logging -- https://github.com/flatiron/winston
sockjs  = require("sockjs")             # websockets (+legacy support) -- https://github.com/sockjs/sockjs-node
uuid    = require('node-uuid')

# module scope variables:
http_server = null
sockjs_connections = []
cassandra = null

###
# HTTP Server
###

init_http_server = () -> 
    http_server = http.createServer((req, res) ->
        return res.end('') if req.url == '/alive'
        winston.info ("#{req.connection.remoteAddress} accessed #{req.url}")
        res.end('hub server')
    )

###
# SockJS Server
###
init_sockjs_server = () ->
    sockjs_server = sockjs.createServer()
    sockjs_server.on("connection", (conn) ->
        sockjs_connections.push(conn)
        winston.info ("new sockjs connection #{conn}; all connections #{sockjs_connections}")
        # install event handlers on this particular connection

        push_to_client = (msg) -> conn.write(JSON.stringify(msg))
        
        conn.on("data", (mesg) ->
            mesg = JSON.parse(mesg)
            winston.debug("conn=#{conn} received sockjs mesg: #{JSON.stringify(mesg)}")

            ###
            # handle message
            ###
            switch mesg.event
                when "execute_code"
                    if mesg.session_uuid?
                        send_to_persistent_sage_session(mesg)
                    else
                        stateless_sage_exec(mesg, push_to_client)
                when "start_session"  # create a new persistent session
                    create_persistent_sage_session(mesg, push_to_client)
                when "send_signal"
                    send_to_persistent_sage_session(mesg)
                
        )
        conn.on("close", ->
            winston.info("conn=#{conn} closed")
            # remove from array
        )
        
    )
    sockjs_server.installHandlers(http_server, {prefix:'/hub'})

###
# Persistent Sage Sessions
###
persistent_sage_sessions = {}


SAGE_SESSION_LIMITS = {cputime:30, walltime:5*60, vmem:2000, numfiles:1000, quota:128}

create_persistent_sage_session = (mesg, push_to_client) ->
    winston.log('creating persistent sage session')
    # generate a uuid
    session_uuid = uuid.v4()
    # cap limits
    misc.min_object(mesg.limits, SAGE_SESSION_LIMITS)  # TODO
    cassandra.random_sage_server( (sage_server) ->
        sage_conn = new sage.Connection(
            host:sage_server.host
            port:sage_server.port
            recv:(m) ->
                winston.info("(hub) persistent_sage_conn (#{session_uuid})-- recv(#{JSON.stringify(m)})")
                switch m.event
                    when "output", "terminate_session"
                        m.session_uuid = session_uuid  # tag with session uuid
                        push_to_client(m)
                    when "session_description"
                        persistent_sage_sessions[session_uuid].pid = m.pid  # record for later use for signals
                        push_to_client(message.new_session(mesg.id, session_uuid, m.limits))
                    else
                        winston.error("(hub) persistent_sage_conn -- unhandled message event = '#{m.event}'")
            cb: ->
                winston.info("(hub) persistent_sage_conn -- connected.")
                # send message to server requesting parameters for this session
                sage_conn.send(mesg)
        )
        # Save sage_conn object so that when the user requests evaluation of
        # code in the session with this id, we use this.
        persistent_sage_sessions[session_uuid] = {conn:sage_conn}
        
        winston.info("(hub) added #{session_uuid} to persistent sessions")
    )

send_to_persistent_sage_session = (mesg) ->
    winston.debug("send_to_persistent_sage_session(#{JSON.stringify(mesg)})")

    session_uuid = mesg.session_uuid
    session = persistent_sage_sessions[session_uuid]
    
    if not session?
        winston.error("TOOD -- session #{session_uuid} does not exist")
        return

    # modify the message so that it can be interpretted by sage server
    switch mesg.event
        when "send_signal"
            mesg.pid = session.pid

    if mesg.event == 'send_signal'   # other control messages would go here too
        # TODO: this function is a DOS vector, so we need to secure/limit it
        # Also, need to ensure that user is really allowed to do this action, whatever it is.
        conn = new sage.Connection(
            host:session.conn.host
            port:session.conn.port
            cb: ->
                conn.send(mesg)
                conn.terminate_session()
        )
    else
        session.conn.send(mesg)


###
# Stateless Sage Sessions
###
stateless_exec_cache = null

init_stateless_exec = () ->
    stateless_exec_cache = cassandra.key_value_store('stateless_exec')

stateless_sage_exec = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec #{JSON.stringify(input_mesg)}")
    stateless_exec_cache.get(input_mesg.code, (output) ->
        if output?
            winston.info("(hub) -- using cache")        
            for mesg in output
                mesg.id = input_mesg.id
                output_message_callback(mesg)
        else
            output_messages = []
            stateless_sage_exec_nocache(input_mesg, (mesg) ->
                if mesg.event == "output"
                    output_messages.push(mesg)
                output_message_callback(mesg)
                if mesg.done
                    winston.info("caching result")
                    stateless_exec_cache.set(input_mesg.code, output_messages)
            )
    )

stateless_sage_exec_fake = (input_mesg, output_message_callback) ->
    # test mode to eliminate all of the calls to sage_server time/overhead
    output_message_callback({"stdout":eval(input_mesg.code),"done":true,"event":"output","id":input_mesg.id})

stateless_exec_using_server = (input_mesg, output_message_callback, host, port) -> 
    sage_conn = new sage.Connection(
        host:host
        port:port
        recv:(mesg) ->
            winston.info("(hub) sage_conn -- received message #{JSON.stringify(mesg)}")
            output_message_callback(mesg)
        cb: ->
            winston.info("(hub) sage_conn -- sage: connected.")
            sage_conn.send(message.start_session({walltime:20, cputime:20, numfiles:1000, vmem:2048}))
            winston.info("(hub) sage_conn -- send: #{JSON.stringify(input_mesg)}")
            sage_conn.send(input_mesg)
            sage_conn.terminate_session()
    )

stateless_sage_exec_nocache = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec_nocache #{JSON.stringify(input_mesg)}")
    cassandra.random_sage_server( (sage_server) ->
        if sage_server
            stateless_exec_using_server(input_mesg, output_message_callback, sage_server.address, sage_server.port)
        else
            winston.error("(hub) no sage servers!")
            output_message_callback(message.terminate_session('no Sage servers'))
    )
    
    
###
# Start everything running
###    
start_server = () ->
    # the order of init below is important
    init_http_server()
    cassandra = new cass.Cassandra(program.database_nodes.split(','))
    init_sockjs_server()
    init_stateless_exec()
    http_server.listen(program.port)
    winston.info("Started hub. HTTP port #{program.port}; TCP port #{program.tcp_port}")

###
# Process command line arguments
###
program
    .usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 5000)', parseInt, 5000)
    .option('-t, --tcp_port <n>', 'tcp port to listen on from other tornado servers (default: 5001)', parseInt, 5001)
    .option('-l, --log_level [level]', "log level (default: INFO) useful options include WARNING and DEBUG", String, "INFO")
    .option('--address [string]', 'address of interface to bind to (default: "")', String, "")
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', String, "data/pids/hub.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', String, "data/logs/hub.log")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, '')
    .parse(process.argv)
 
daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

    
    






