###
# Run this by running ./node_server ...
#
# Dependencies:
# 
#    npm install commander start-stop-daemon winston sockjs helenus
#
# ** Be sure to add dependencies to the NODE_PACKAGES list in build.py **
#
###

# node builtin libraries 
http    = require('http')

# salvus libraries
sage    = require("sage")               # sage server
message = require("salvus_message")     # salvus message protocol
cass    = require("cassandra")

# third party libraries
program = require('commander')          # https://github.com/visionmedia/commander.js/
daemon  = require("start-stop-daemon")  # https://github.com/jiem/start-stop-daemon
winston = require('winston')            # https://github.com/flatiron/winston
sockjs  = require("sockjs")             # https://github.com/sockjs/sockjs-node

program
    .usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 5000)', parseInt, 5000)
    .option('-t, --tcp_port <n>', 'tcp port to listen on from other tornado servers (default: 5001)', parseInt, 5001)
    .option('-l, --log_level [level]', "log level (default: INFO) useful options include WARNING and DEBUG", String, "INFO")
    .option('-g, --debug [bool]', 'debug mode (default: false)', Boolean, false)
    .option('--address [string]', 'address of interface to bind to (default: "")', String, "")
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/node_server.pid")', String, "data/pids/node_server.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/node_server.log")', String, "data/logs/node_server.log")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, '')
    .parse(process.argv)


# module scope variables:

http_server = null
sockjs_connections = []
sockjs_server = null
cassandra = null


####

init_http_server = () -> 
    http_server = http.createServer((req, res) ->
        return res.end('') if req.url == '/alive'
        winston.info ("#{req.connection.remoteAddress} accessed #{req.url}")
        res.end('node server')
    )

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
                #f = stateless_sage_exec
                #f = stateless_sage_exec_fake
                f = stateless_sage_exec_nocache
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
    sockjs_server.installHandlers(http_server, {prefix:'/node'})

stateless_sage_exec = (input_mesg, output_message_callback) ->
    winston.info("(node_server.coffee) stateless_sage_exec #{JSON.stringify(input_mesg)}")
    cassandra.cache_get('stateless_exec', input_mesg.code, (output) ->
        if output
            winston.info("(node_server.coffee) -- using cache")        
            for mesg in cache
                mesg.id = input_mesg.id
                output_message_callback(mesg)
        else
            output_messages = []
            stateless_sage_exec_nocache(input_mesg, (mesg) ->
                if mesg.event = "output"  # save to record in database 
                    output_messages.push(mesg)
                output_message_callback(mesg)
            )
            winston.info("storing in db: #{JSON.stringify(input_mesg)} --> #{JSON.stringify(output_messages)}")
            cassandra.cache_put('stateless_exec', input_mesg.code, output_messages)
    )

stateless_sage_exec_fake = (input_mesg, output_message_callback) ->
    # test mode to eliminate all of the call to sage_server time/overhead
    output_message_callback({"stdout":eval(input_mesg.code),"done":true,"event":"output","id":input_mesg.id})

stateless_sage_exec_nocache = (input_mesg, output_message_callback) ->
    winston.info("(node_server.coffee) stateless_sage_exec_nocache #{JSON.stringify(input_mesg)}")
    sage_conn = new sage.Connection(
        host:'localhost'
        port:10000
        recv:(mesg) ->
            winston.info("(node_server.coffee) sage_conn -- received message #{JSON.stringify(mesg)}")
            output_message_callback(mesg)
        cb: ->
            winston.info("(node_server.coffee) sage_conn -- sage: connected.")
            sage_conn.send(message.start_session(20, 20)) # max_walltime=max_cputime=20 seconds
            winston.info("(node_server.coffee) sage_conn -- send: #{JSON.stringify(input_mesg)}")
            sage_conn.send(input_mesg)
            sage_conn.terminate_session()
    )
    
    
    
main = () ->
    # the order of init below is important
    init_http_server()
    cassandra = new cass.Cassandra(program.database_nodes.split(','))
    init_sockjs_server()
    http_server.listen(program.port)

winston.info("Started node_server. HTTP port #{program.port}; TCP port #{program.tcp_port}")
daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, main)

    
    






