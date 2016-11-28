###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
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
#################################################################

path           = require('path')
async          = require('async')
fs             = require('fs')
net            = require('net')
child_process  = require('child_process')
winston        = require('winston')
assert         = require('assert')

message        = require('smc-util/message')
misc_node      = require('smc-util-node/misc_node')
{secret_token_filename} = require('./common.coffee')

port_manager = require('./port_manager')
misc = require('smc-util/misc')
{to_json, from_json, defaults, required} = misc

abspath = (path) ->
    if path.length == 0
        return process.env.HOME
    if path[0] == '/'
        return path  # already an absolute path
    return process.env.HOME + '/' + path

if not process.env.SMC?
    process.env.SMC = path.join(process.env.HOME, '.smc')

DATA = path.join(process.env['SMC'], 'console_server')

if not fs.existsSync(process.env['SMC'])
    fs.mkdirSync(process.env['SMC'])
if not fs.existsSync(DATA)
    fs.mkdirSync(DATA)

##################################################################
# Read the secret token file.
#
# This file is created by the local_hub process, which is started at
# the same time as the console_server. So, we try for up to 5 seconds
# until this file appears.
##################################################################

misc = require('smc-util/misc')


secret_token = undefined

read_token = (cb) ->
    f = (cb) ->
        fs.exists secret_token_filename, (exists) ->
            if not exists
                cb("secret token file does not exist")
            else
                secret_token = fs.readFileSync(secret_token_filename).toString()
                cb()
    misc.retry_until_success
        f        : f
        max_time : 30000
        cb       : cb

start_session = (socket, mesg) ->
    winston.info "start_session #{to_json(mesg)}"

    if not mesg.params?  # for connecting to an existing session.
        mesg.params = {}

    opts = defaults mesg.params,
        rows     : 24
        cols     : 80
        command  : 'bash'
        args     : []
        path     : required
        filename : required

    opts.path     = abspath(opts.path)  # important since console server is started in some random location
    opts.filename = abspath(opts.filename)

    init_fn = misc.console_init_filename(opts.filename)
    if fs.existsSync(init_fn) and opts.command == 'bash'
        opts.args = ['--init-file', "#{init_fn}"]

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
            child = child_process.fork(__dirname + '/console_server_child.coffee', [])

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
start_server = (cb) ->
    async.series([
        (cb) ->
            # read the secret token
            read_token(cb)
        (cb) ->
            # start listening for incoming connections
            server.listen(0, '127.0.0.1', cb)
        (cb) ->
            # write port that we are listening on to port file
            fs.writeFile(port_manager.port_file('console'), server.address().port, cb)
    ], (err) ->
        if err
            cb(err)
        else
            winston.info("listening on port #{server.address().port}")
            cb()
    )

start_server (err) ->
    if err
        winston.debug("failed to start console server")
