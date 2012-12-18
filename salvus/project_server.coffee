######################################################################
#
# project_server
#
# For local debugging, run this way, since it gives better stack traces.
#
#         make_coffee && echo "require('project_server').start_server()" | coffee
#
#######################################################################

child_process  = require 'child_process'
winston        = require 'winston'
program        = require 'commander'
daemon         = require 'start-stop-daemon'
net            = require 'net'

message        = require 'message'
misc_node      = require 'misc_node'
misc           = require 'misc'

# The child process objects are stored here.  The keys are 'sage_server', 'console_server', 'project_server', etc.
children = {}

server = net.createServer (socket) ->
    misc_node.enable_mesg(socket)
    socket.on 'mesg', (type, mesg) ->
        switch type
            when 'json'
                switch mesg.event
                    when 'extract_project'  # TODO!
                        null
                    else
                        socket.write(message.error("Unknown message event '#{mesg.event}'"))
            when 'blob'
                # TODO
                null

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    server.listen program.port, program.host, () -> winston.info "listening on port #{program.port}"

program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 6002)', parseInt, 6002)
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/project_server.pid")', String, "data/pids/project_server.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/project_server.log")', String, "data/logs/project_server.log")
    .option('--host [string]', 'bind to only this host (default: "127.0.0.1")', String, "127.0.0.1")   # important for security reasons to prevent user binding more specific host attack
    .parse(process.argv)

if program._name == 'project_server.js'
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)




