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

async          = require 'async'

message        = require 'message'
misc_node      = require 'misc_node'
misc           = require 'misc'

######################################################
# Creating and working with project repositories
#    --> See message.coffee for how projects work. <--
######################################################

# Choose a random unused unix UID, where unused means by definition
# that /home/UID does not exist.  We then create that directory and
# call cb with it.  There is once in a billion years possibility of a
# race condition, so we do not worry about it.  Our uid is a random
# number between 1100 and 2^32-2=4294967294.

create_user = (cb) ->
    uid = misc.randint(1100, 4294967294)
    fs.exists("/home/#{uid}", (exists) ->
        if exists
            create_user(cb)  # This recursion won't blow stack, since
                             # it is highly unlikely to ever happen.
        else
            cmd = "useradd -U -m #{project_uuid}"
#            fs.mkdir(, , () ->
#                fs.chown(
#`    child_process.exec("useradd -U -m #{project_uuid}", (error, stdout, stderr) ->cb())

delete_user = (project_uuid, cb) ->
    async.series([
        (c) -> child_process.exec("deluser --remove-all-files #{project_uuid}", (error, stdout, stderr) -> c())
        (c) -> child_process.exec("delgroup #{project_uuid}", ((error, stdout, stderr) -> cb(); c()))
    ])

extract_bundles = (bundles, path, cb) ->


# The first step in opening a project is waiting to receive all of
# the bundle blobs.
open_project = (socket, mesg) ->
    n = misc.len(mesg.bundles)
    if n == 0
        open_project2(socket, mesg)
    else
        recv_bundles = (type, m) ->
            if type == 'blob' and mesg.bundles[m.uuid]?
                mesg.bundles[m.uuid] = m.blob
                n -= 1
                if n <= 0
                    socket.removeListener 'mesg', recv_bundles
                    open_project2(socket, mesg)
        socket.on 'mesg', recv_bundles

# Now that we have the bundle blobs, we extract the project.
open_project2 = (socket, mesg) ->
    user_id = null
    async.series([
        # Create a user with username the project_uuid and random user id.
        (cb) -> create_user(mesg.project_uuid, cb)
        # Extract the bundles into the home directory.
        (cb) -> extract_bundles(mesg.bundles, "/home/#{mesg.project_uuid}", cb)
        # Send message back to hub that project is opened and ready to go.
        TODO
    ])

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




