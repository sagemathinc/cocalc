###
# Run this by running ./node_server ...
#
# Dependencies:
#    npm install commander start-stop-daemon winston
#
###

program = require('commander')          # https://github.com/visionmedia/commander.js/
daemon = require("start-stop-daemon")   # https://github.com/jiem/start-stop-daemon
winston = require('winston')            # https://github.com/flatiron/winston

program
    .usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 5000)', parseInt, 5000)
    .option('-t, --tcp_port <n>', 'tcp port to listen on from other tornado servers (default: 5001)', parseInt, 5001)
    .option('-l, --log_level [level]', "log level (default: INFO) useful options include WARNING and DEBUG", String, "INFO")
    .option('-g, --debug [bool]', 'debug mode (default: false)', Boolean, false)
    .option('--address [string]', 'address of interface to bind to (default: "")', String, "")
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/node_server.pid")', String, "data/pids/node_server.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/node_server.log")', String, "data/logs/node_server.log")
    .option('--database_nodes <string,string,...>', 'list of ip addresses of all database nodes in the cluster (required)', String)
    .parse(process.argv)

main = () ->
    http = require('http')
    http.createServer((req, res) ->
        winston.info (req.connection.remoteAddress + " accessed " + req.url)
        res.end("node server")
    ).listen (program.port)

winston.info("Started node_server. HTTP port #{program.port}; TCP port #{program.tcp_port}")
daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, main)

    
    
        

    

