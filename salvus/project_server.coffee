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


######################################################
# Creating and working with project repositories
#    --> See message.coffee for how projects work. <--
######################################################

# The first step in opening in opening a project is waiting for all of
# the bundle blobs.
open_project = (socket, mesg) ->
    n = misc.len(mesg.bundles)
    if n == 0
        open_project2(socket, mesg)
    else
        recv_bundles = (type, m) ->
            if type == 'blob' and mesg.bundles[m.uuid]?
                mesg.bundles[mesg.uuid] = m.blob
                n -= 1
                if n <= 0
                    socket.removeListener 'mesg', recv_bundles
                    open_project2(socket, mesg)
        socket.on 'mesg', recv_bundles

# Now that we have the bundle blobs, we extract the project.
open_project2 = (socket, mesg) ->
    # Choose a random unused uid for this project:
    uid = new_uid()
    # Create home directory:   '/home/uid/project_uuid'
    path = create_home_directory(uid)
    # Populate the home directory using the bundles
    #extra_bundles_to

save_project = (socket, mesg) ->

close_project = (socket, mesg) ->


server = net.createServer (socket) ->
    misc_node.enable_mesg(socket)
    socket.on 'mesg', (type, mesg) ->
        if type == 'json' # other types are handled elsewhere
            switch mesg.event
                when 'open_project'
                    open_project(socket, mesg)
                when 'save_project'
                    save_project(socket, mesg)
                when 'close_project'
                    close_project(socket, mesg)
                else
                    socket.write(message.error("Unknown message event '#{mesg.event}'"))

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




