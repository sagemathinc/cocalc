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
message = require("message")     # salvus message protocol
cass    = require("cassandra")

to_json = misc.to_json
from_json = misc.from_json

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
        # TODO: This sockjs_connections data structure is not currently used; it also just
        # grows without every having anything removed, so it would leak memory.   !!!
        sockjs_connections.push(conn)
        winston.info ("new sockjs connection #{conn}")
        # install event handlers on this particular connection

        push_to_client = (mesg) ->
            console.log(to_json(mesg)) if mesg.event != 'pong'
            conn.write(to_json(mesg))
        
        conn.on("data", (mesg) ->
            try
                mesg = from_json(mesg)
            catch error
                winston.error("error parsing incoming mesg (invalid JSON): #{mesg}")
                return

            if mesg.event != 'ping'
                winston.debug("conn=#{conn} received sockjs mesg: #{to_json(mesg)}")

            ###
            # handle message
            ###
            switch mesg.event
                # session/code execution
                when "execute_code"
                    if mesg.session_uuid?
                        send_to_persistent_sage_session(mesg)
                    else
                        stateless_sage_exec(mesg, push_to_client)
                when "start_session"  # create a new persistent session
                    create_persistent_sage_session(mesg, push_to_client)
                when "send_signal"
                    send_to_persistent_sage_session(mesg)

                # ping/pong
                when "ping"
                    push_to_client(message.pong(id:mesg.id))

                # account management
                when "create_account"
                    create_account(mesg, push_to_client)
        )
        conn.on("close", ->
            winston.info("conn=#{conn} closed")
            # remove from array
        )
        
    )
    sockjs_server.installHandlers(http_server, {prefix:'/hub'})


########################################
# Account Management 
########################################

create_account = (mesg, push_to_client) ->
    id = mesg.id
    if not mesg.agreed_to_terms
        push_to_client(message.account_creation_failed(id:id, reason:'You must agree to the Salvus Terms of Service'))
        return









    
    

########################################
# Persistent Sage Sessions
########################################
persistent_sage_sessions = {}


SAGE_SESSION_LIMITS = {cputime:60, walltime:15*60, vmem:2000, numfiles:1000, quota:128}

create_persistent_sage_session = (mesg, push_to_client) ->
    winston.log('creating persistent sage session')
    # generate a uuid
    session_uuid = uuid.v4()
    # cap limits
    misc.min_object(mesg.limits, SAGE_SESSION_LIMITS)  # TODO
    cassandra.random_sage_server( cb:(error, sage_server) ->
        # TODO: deal with case when there are no sage servers -- or when error is set !
        sage_conn = new sage.Connection(
            host:sage_server.host
            port:sage_server.port
            recv:(m) ->
                winston.info("(hub) persistent_sage_conn (#{session_uuid})-- recv(#{to_json(m)})")
                switch m.event
                    when "output", "terminate_session"
                        m.session_uuid = session_uuid  # tag with session uuid
                        push_to_client(m)
                    when "session_description"
                        persistent_sage_sessions[session_uuid].pid = m.pid  # record for later use for signals
                        push_to_client(message.new_session(id:mesg.id, session_uuid:session_uuid, limits:m.limits))
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
    winston.debug("send_to_persistent_sage_session(#{to_json(mesg)})")

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
    stateless_exec_cache = cassandra.key_value_store(name:'stateless_exec')

stateless_sage_exec = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec #{to_json(input_mesg)}")
    exec_nocache = () -> 
        output_messages = []
        stateless_sage_exec_nocache(input_mesg,
            (mesg) ->
                if mesg.event == "output"
                    output_messages.push(mesg)
                output_message_callback(mesg)
                if mesg.done and input_mesg.allow_cache
                    winston.info("caching result")
                    stateless_exec_cache.set(key:input_mesg.code, value:output_messages)
        )
    if not input_mesg.allow_cache
        exec_nocache()
        return
    stateless_exec_cache.get(key:input_mesg.code, cb:(err, output) ->
        if output?
            winston.info("(hub) -- using cache")        
            for mesg in output
                mesg.id = input_mesg.id
                output_message_callback(mesg)
        else
            exec_nocache()
    )

stateless_sage_exec_fake = (input_mesg, output_message_callback) ->
    # test mode to eliminate all of the calls to sage_server time/overhead
    output_message_callback({"stdout":eval(input_mesg.code),"done":true,"event":"output","id":input_mesg.id})

stateless_exec_using_server = (input_mesg, output_message_callback, host, port) -> 
    sage_conn = new sage.Connection(
        host:host
        port:port
        recv:(mesg) ->
            winston.info("(hub) sage_conn -- received message #{to_json(mesg)}")
            output_message_callback(mesg)
        cb: ->
            winston.info("(hub) sage_conn -- sage: connected.")
            sage_conn.send(message.start_session(limits:{walltime:20, cputime:20, numfiles:1000, vmem:2048}))
            winston.info("(hub) sage_conn -- send: #{to_json(input_mesg)}")
            sage_conn.send(input_mesg)
            sage_conn.terminate_session()
    )

stateless_sage_exec_nocache = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec_nocache #{to_json(input_mesg)}")
    cassandra.random_sage_server( cb:(err, sage_server) ->
        if sage_server?
            stateless_exec_using_server(input_mesg, output_message_callback, sage_server.address, sage_server.port)
        else
            winston.error("(hub) no sage servers!")
            output_message_callback(message.terminate_session(reason:'no Sage servers'))
    )
    
    
###
# Start everything running
###    
start_server = () ->
    # the order of init below is important
    init_http_server()
    winston.info("Using Cassandra keyspace #{program.keyspace}")
    cassandra = new cass.Salvus(hosts:program.database_nodes.split(','), keyspace:program.keyspace)
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
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "salvus")', String, 'salvus')    
    .parse(process.argv)
 
daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

    
    






