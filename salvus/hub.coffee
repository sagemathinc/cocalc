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
message = require("salvus_message")     # salvus message protocol
cass    = require("cassandra")

# third-party libraries
program = require('commander')          # command line arguments -- https://github.com/visionmedia/commander.js/
daemon  = require("start-stop-daemon")  # daemonize -- https://github.com/jiem/start-stop-daemon
winston = require('winston')            # logging -- https://github.com/flatiron/winston
sockjs  = require("sockjs")             # websockets (+legacy support) -- https://github.com/sockjs/sockjs-node


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
        conn.on("data", (mesg) ->
            mesg = JSON.parse(mesg)
            winston.info("conn=#{conn} received sockjs mesg: #{mesg}")
            # handle mesg
            if mesg.event == "execute_code"
                # stateless code execution
                f = stateless_sage_exec
                #f = stateless_sage_exec_fake
                #f = stateless_sage_exec_nocache
                f(mesg, (output_message) ->
                    winston.info("output_message = #{JSON.stringify(output_message)}")
                    conn.write(JSON.stringify(output_message))
                )
        )
        conn.on("close", ->
            winston.info("conn=#{conn} closed")
            # remove from array
        )
        
    )
    sockjs_server.installHandlers(http_server, {prefix:'/hub'})

###
# Sage Sessions
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
            sage_conn.send(message.start_session(20, 20)) # max_walltime=max_cputime=20 seconds
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
            output_message_callback(message.terminate_session('no Sage servers'))
            return
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

    
    






