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

program = require('commander')          # https://github.com/visionmedia/commander.js/
daemon  = require("start-stop-daemon")  # https://github.com/jiem/start-stop-daemon
winston = require('winston')            # https://github.com/flatiron/winston
sockjs  = require("sockjs")             # https://github.com/sockjs/sockjs-node
helenus = require("helenus")            # https://github.com/simplereach/node-thrift
sage    = require("sage")               # sage server

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

main = () ->

    ###########################
    # web server
    ###########################
    http = require('http')
    http_server = http.createServer((req, res) ->
        winston.info ("#{req.connection.remoteAddress} accessed #{req.url}")

        # TESTING: see if cql connection works.
        tm = (new Date()).getTime()
        cassandra.cql("SELECT * FROM sage_servers", [],
            (err, results) -> res.end("#{(new Date()).getTime() - tm}\n#{err} #{results}"))
    )

    ###########################
    # sockjs websocket server
    ###########################
    sockjs_connections = []
    sockjs_server = sockjs.createServer()
    sockjs_server.on("connection", (conn) ->
        winston.info ("new sockjs connection #{conn}")
        sockjs_connections.push(conn)
    )
    sockjs_server.installHandlers(http_server, {prefix:'/node'})

    ###########################
    # cassandra database pool
    ###########################
    cassandra = new helenus.ConnectionPool(
         hosts: program.database_nodes.split(',')
         keyspace:'salvus'
         timeout: 3000
         cqlVersion: '3.0.0'
    )
    cassandra.on('error', (err) -> winston.error(err.name, err.message))
    cassandra.connect( (err,keyspace) -> winston.error(err) if err)

    sage_conn = new sage.Connection(
        host:'localhost'
        port:10000
        recv:(mesg) -> console.log("sage: received message #{mesg}")
        cb: ->
            sage_conn.send(sage.Message.start_session())
            sage_conn.send(sage.Message.execute_code(0,"factor(2012)"))
    )
                    
    # start the webserver...
    http_server.listen(program.port)

winston.info("Started node_server. HTTP port #{program.port}; TCP port #{program.tcp_port}")
daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, main)

    
    
        

    

