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
local_hub      = require 'local_hub'
{to_json, from_json, defaults, required}   = require 'misc'


##################################################################
# Read the secret token file.
#
# This file is created by the local_hub process, which is started at
# the same time as the console_server. So, we try for up to 5 seconds
# until this file appears.
##################################################################
secret_token = fs.readFileSync(local_hub.secret_token_filename).toString()


##################################################################
start_session = (socket, mesg) ->
    winston.info "start_session #{to_json(mesg)}"

    opts = defaults mesg.params,
        rows    : 24
        cols    : 80
        command : undefined
        args    : []
        path    : undefined
        cwd     : undefined          # starting PATH (need not be home directory)

    if process.env['USER'] == 'root'
        if not mesg.project_id? or mesg.project_id.length != 36
            winston.debug("suspicious project_id (=#{mesg.project_id}) -- bailing")
            return

    winston.debug "start_session opts = #{to_json(opts)}"

    # Ensure that the given user exists.  If not, send an error.  The
    # hub should always ensure the user exists before starting a session.
    async.series([
        (cb) ->
            # Fork off a child process that does all further work to
            # handle a connection.
            child = child_process.fork(__dirname + '/console_server_child.js', [])

            # Send the pid of the child to the client (the connected hub)
            socket.write_mesg('json', message.session_description(pid:child.pid))

            # Disable use of the socket for sending/receiving messages, since
            # it will be only used for raw xterm stuff hence.
            misc_node.disable_mesg(socket)

            # Give the socket to the child, along with the options.
            child.send(opts, socket)

            cb()
    ], (err) ->
        if err
            # TODO: change protocol to allow for checking for an error message.
            winston.debug("ERROR - #{err}")
    )

handle_client = (socket, mesg) ->
    try
        switch mesg.event
            when 'start_session', 'connect_to_session'
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
    misc_node.unlock_socket socket, secret_token, (err) ->
        if not err
            # Receive a single message:
            misc_node.enable_mesg(socket)
            socket.on 'mesg', (type, mesg) ->
                winston.debug "received control mesg #{to_json(mesg)}"
                handle_client(socket, mesg)

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    server.listen program.port, program.host, () ->
        winston.info "listening on port #{program.port}"
        fs.writeFile('.sagemathcloud/console_server.port', server.address().port)


# daemonize it

program = require('commander')
daemon  = require("start-stop-daemon")

program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 0 = automatically allocated; saved to .sagemathcloud/console_server.port)', parseInt, 0)
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/console_server.pid")', String, ".sagemathcloud/console_server.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/console_server.log")', String, ".sagemathcloud/console_server.log")
    .option('--host [string]', 'bind to only this host (default: "127.0.0.1")', String, "127.0.0.1")   # important for security reasons to prevent user binding more specific host attack
    .parse(process.argv)

if program._name == 'console_server.js'
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)


