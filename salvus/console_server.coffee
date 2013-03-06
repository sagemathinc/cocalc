#################################################################
#
# console_server -- a node.js tty console server
#
#   * the server, which runs as a command-line daemon (or can
#     be used as a library)
#
#   * the client, which e.g. gets imported by hub and used
#     for communication between hub and the server daemon.
#
# For local debugging, run this way, since it gives better stack traces.
#
#         make_coffee && echo "require('console_server').start_server()" | coffee
#
#################################################################

child_process  = require 'child_process'
async          = require 'async'
fs             = require 'fs'
net            = require 'net'
child_process  = require 'child_process'
message        = require 'message'
misc_node      = require 'misc_node'
winston        = require 'winston'

{to_json, from_json, defaults, required}   = require 'misc'


# TODO -- this is no longer used
makedirs = (path, uid, gid, cb) ->
    # TODO: this should split the path and make sure everything is
    # made along the way like in Python, but I'm going to wait on
    # implementing, since with internet maybe find that already in a
    # library.
    async.series([
        (c) -> fs.exists path, (exists) ->
            if exists # done
                cb(); c(true)
            else
                c()
        (c) -> fs.mkdir path, (err) ->
            if err
                cb(err); c(true)
            else
                c()
        (c) ->
            if not uid? or not gid?
                cb(); c()
            else
                fs.chown path, uid, gid, (err) ->
                    if err
                        cb(err); c(true)
                    else
                        cb(); c()
    ])

# NOTE: This getuid is like a function of the same name in
# project_server; however, we cannot cache results here, since
# the project_server could allocate/unallocate the project and
# change the uid.
getuid = (user, cb) ->
    child_process.exec "id -u #{user}", (err, id, stderr) ->
        if err
            cb(err)
        else
            cb(false, parseInt(id))

start_session = (socket, mesg) ->
    if not mesg.limits? or not mesg.limits.walltime?
        socket.write_mesg('json', message.error(id:mesg.id, error:"mesg.limits.walltime *must* be defined (though 0 is allowed for unlimited)"))
        return

    winston.info "start_session #{to_json(mesg)}"

    opts = defaults mesg.params,
        rows    : 24
        cols    : 80
        command : undefined
        args    : []
        ps1     : undefined
        path    : undefined
        cwd     : undefined          # starting PATH (need not be home directory)
        home    : undefined

    if process.env['USER'] == 'root'
        if not mesg.project_id? or mesg.project_id.length != 36
            winston.debug("suspicious project_id (=#{mesg.project_id}) -- bailing")
            return

    if mesg.project_id?
        username = mesg.project_id.slice(0,8)
        if not opts.ps1?
            opts.ps1 = '\\w\\$ '
        if not opts.path?
            opts.path = process.env.PATH

    opts.cputime  = mesg.limits.cputime
    opts.vmem     = mesg.limits.vmem
    opts.numfiles = mesg.limits.numfiles

    if username? and not opts.home?
        opts.home = "/home/#{username}"

    if not opts.cwd? and username?
        opts.cwd = "/home/#{username}"

    winston.debug "start_session opts = #{to_json(opts)}"

    # Ensure that the given user exists.  If not, send an error.  The
    # hub should always ensure the user exists before starting a session.
    async.series([
        (cb) ->
            if not username?
                cb()
                return
            getuid username, (err, uid) ->
                if err
                    cb(err)
                else
                    winston.debug("Starting console session for user #{username} with uid #{uid}")
                    opts.uid = uid
                    opts.gid = uid
                    cb()
        (cb) ->
            # Fork off a child process that drops privileges (if opts.uid is set) and does
            # all further work to handle a connection.
            child = child_process.fork(__dirname + '/console_server_child.js', [])

            # Send the pid of the child to the client (the connected hub)
            socket.write_mesg('json', message.session_description({pid:child.pid, limits:mesg.limits}))

            # Disable use of the socket for sending/receiving messages, since
            # it will be only used for raw xterm stuff hence.
            misc_node.disable_mesg(socket)

            # Give the socket to the child, along with the options.
            child.send(opts, socket)

            # Set a timer to kill the spawned child
            if mesg.limits.walltime
                setTimeout((() -> child.kill('SIGKILL')), mesg.limits.walltime*1000)
            winston.info "PARENT: forked off child to handle it"

            cb()
    ], (err) ->
        if err
            # TODO: change protocol to allow for checking for an error message.
            winston.debug("ERROR - #{err}")
    )

handle_client = (socket, mesg) ->
    try
        switch mesg.event
            when 'start_session'
                start_session(socket, mesg)
            when 'send_signal'
                switch mesg.signal
                    when 2
                        signal = 'SIGINT'
                    when 3
                        signal = 'SIGQUIT'
                    when 9
                        signal = 'SIGKILL'
                    else
                        throw("only signals 2 (SIGINT), 3 (SIGQUIT), and 9 (SIGKILL) are supported")
                process.kill(mesg.pid, signal)
                if mesg.id?
                    socket.write_mesg('json', message.signal_sent(id:mesg.id))
            else
                if mesg.id?
                    err = message.error(id:mesg.id, error:"Console server received an invalid mesg type '#{mesg.event}'")
                socket.write_mesg('json', err)
    catch e
        winston.error "ERROR: '#{e}' handling message '#{to_json(mesg)}'"

server = net.createServer (socket) ->
    winston.debug "PARENT: received connection"
    # Receive a single message:
    misc_node.enable_mesg(socket)
    socket.on 'mesg', (type, mesg) ->
        winston.debug "received control mesg #{to_json(mesg)}"
        handle_client(socket, mesg)

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    server.listen program.port, program.host, () -> winston.info "listening on port #{program.port}"

# daemonize it

program = require('commander')
daemon  = require("start-stop-daemon")

program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 6001)', parseInt, 6001)
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/console_server.pid")', String, "data/pids/console_server.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/console_server.log")', String, "data/logs/console_server.log")
    .option('--host [string]', 'bind to only this host (default: "127.0.0.1")', String, "127.0.0.1")   # important for security reasons to prevent user binding more specific host attack
    .parse(process.argv)

if program._name == 'console_server.js'
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)


