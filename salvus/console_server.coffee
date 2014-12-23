###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


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

async          = require 'async'
fs             = require 'fs'
net            = require 'net'
child_process  = require 'child_process'
message        = require 'message'
misc_node      = require 'misc_node'
winston        = require 'winston'
local_hub      = require 'local_hub'

{to_json, from_json, defaults, required}   = require 'misc'

assert         = require('assert')

abspath = (path) ->
    if path.length == 0
        return process.env.HOME
    if path[0] == '/'
        return path  # already an absolute path
    return process.env.HOME + '/' + path

DATA = process.env['SAGEMATHCLOUD'] + '/data'

##################################################################
# Read the secret token file.
#
# This file is created by the local_hub process, which is started at
# the same time as the console_server. So, we try for up to 5 seconds
# until this file appears.
##################################################################

fname = local_hub.secret_token_filename
secret_token = undefined
read_token = () ->
    fs.exists fname, (exists) ->
        if exists
            try
                secret_token = fs.readFileSync(fname).toString()
                winston.debug("Read the secret_token file.")
            catch e
                setTimeout(read_token, 250)
        else
            # try again in 250ms.
            setTimeout(read_token, 250)

##################################################################
start_session = (socket, mesg) ->
    winston.info "start_session #{to_json(mesg)}"

    if not mesg.params?  # for connecting to an existing session.
        mesg.params = {}
    opts = defaults mesg.params,
        rows    : 24
        cols    : 80
        command : 'bash'
        args    : []
        path    : undefined

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
    if not secret_token?
        winston.debug("ignoring incoming connection, since we do not have the secret_token yet.")
        socket.write('n')
        socket.write("Unable to accept connection, since console server doesn't yet know the secret token.")
        socket.end()
        return

    misc_node.unlock_socket socket, secret_token, (err) ->
        if not err
            # Receive a single message:
            misc_node.enable_mesg(socket)
            socket.on 'mesg', (type, mesg) ->
                winston.debug "received control mesg #{to_json(mesg)}"
                handle_client(socket, mesg)

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    read_token()
    server.listen program.port, program.host, () ->
        winston.info "listening on port #{server.address().port}"
        fs.writeFile(abspath("#{DATA}/console_server.port"), server.address().port)


# daemonize it

program = require('commander')
daemon  = require("start-stop-daemon")

program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 0 = automatically allocated; saved to $SAGEMATHCLOUD/data/console_server.port)', parseInt, 0)
    .option('--pidfile [string]', 'store pid in this file (default: "$SAGEMATHCLOUD/data/console_server.pid")', String,
    abspath("#{DATA}/console_server.pid"))
    .option('--logfile [string]', 'write log to this file (default: "$SAGEMATHCLOUD/data/console_server.log")', String,
    abspath("#{DATA}/console_server.log"))
    .option('--forever_logfile [string]', 'write forever log to this file', String, abspath("#{DATA}/forever_console_server.log"))
    .option('--host [string]', 'bind to this interface (default: 127.0.0.1)', String, "127.0.0.1")
    .parse(process.argv)

if program._name.split('.')[0] == 'console_server'
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.debug("BUG ****************************************************************************")
        winston.debug("Uncaught exception: " + err)
        winston.debug(err.stack)
        winston.debug("BUG ****************************************************************************")
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile, logFile:program.forever_logfile, max:1}, start_server)


