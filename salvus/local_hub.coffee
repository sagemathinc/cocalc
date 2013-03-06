#################################################################
#
# local_hub
#
# For local debugging, run this way, since it gives better stack
# traces.
#
#         make_coffee && echo "require('local_hub').start_server()" | coffee
#
#################################################################

# TODO -- just for temporary testing
CONSOLE_PORT = 6020
SAGE_PORT    = 6021

async          = require 'async'
fs             = require 'fs'
net            = require 'net'
child_process  = require 'child_process'
message        = require 'message'
misc_node      = require 'misc_node'
winston        = require 'winston'

{to_json, from_json, defaults, required}   = require 'misc'


###############################################
# Minimal proof-of-concept console session
###############################################

console_socket = undefined
console_session_desc = undefined
history = new Buffer(0)

start_console_session = (client_socket, mesg) ->
    winston.debug("Starting a console session.")

    # TEST
    if console_socket?
        # connect to existing session
        client_socket.write_mesg('json', console_session_desc)
        misc_node.disable_mesg(client_socket)
        client_socket.write(history)
        client_socket.on 'data', (data) ->
            console_socket.write(data)
        console_socket.on 'data', (data) ->
            client_socket.write(data)
        return

    # Connect to port CONSOLE_PORT, send mesg, then hook sockets together.
    console_socket = net.connect {port:CONSOLE_PORT}, ()->
        # Request console from actual console server
        misc_node.enable_mesg(console_socket)
        console_socket.write_mesg('json', mesg)
        console_socket.once 'mesg', (type, resp) ->
            console_session_desc = resp
            client_socket.write_mesg('json', console_session_desc)

            # Disable JSON mesg protocol
            misc_node.disable_mesg(console_socket)
            misc_node.disable_mesg(client_socket)

            # Connect the sockets together.
            client_socket.on 'data', (data) ->
                console_socket.write(data)
            console_socket.on 'data', (data) ->
                history += data
                client_socket.write(data)




###############################################
# Minimal proof-of-concept sage session
###############################################

sage_socket = undefined
sage_session_desc = undefined

start_sage_session = (client_socket, mesg) ->
    winston.debug("Starting a sage session.")

    # TEST
    if sage_socket?
        # connect to existing session
        client_socket.write_mesg('json', sage_session_desc)
        misc_node.disable_mesg(client_socket)
        client_socket.on 'data', (data) ->
            sage_socket.write(data)
        sage_socket.on 'data', (data) ->
            client_socket.write(data)
        return

    # Connect to port SAGE_PORT, send mesg, then hook sockets together.
    sage_socket = net.connect {port:SAGE_PORT}, ()->
        # Request console from actual console server
        misc_node.enable_mesg(sage_socket)
        sage_socket.write_mesg('json', mesg)
        sage_socket.once 'mesg', (type, resp) ->
            sage_session_desc = resp
            client_socket.write_mesg('json', sage_session_desc)

            # Disable JSON mesg protocol
            misc_node.disable_mesg(sage_socket)
            misc_node.disable_mesg(client_socket)

            # Connect the sockets together.
            client_socket.on 'data', (data) ->
                sage_socket.write(data)
            sage_socket.on 'data', (data) ->
                client_socket.write(data)


###############################################

# TODO
connect_to_console_session = (socket, mesg) ->
#start_sage_session = (socket, mesg) ->
connect_to_sage_session = (socket, mesg) ->

start_session = (socket, mesg) ->
    winston.debug("start_session -- type='#{mesg.type}'")
    switch mesg.type
        when 'console'
            start_console_session(socket, mesg)
        when 'sage'
            start_sage_session(socket, mesg)
        else
            err = message.error(id:mesg.id, error:"Unsupported session type '#{mesg.type}'")
            socket.write_mesg('json', err)

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
                    err = message.error(id:mesg.id, error:"Session server received an invalid mesg type '#{mesg.event}'")
                socket.write_mesg('json', err)
    catch e
        winston.error "ERROR: '#{e}' handling message '#{to_json(mesg)}'"

server = net.createServer (socket) ->
    winston.debug "PARENT: received connection"

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
    .option('-p, --port <n>', 'port to listen on (default: 6000)', parseInt, 6000)
    .option('--pidfile [string]', 'store pid in this file (default: ".session_server.pid")', String, ".session_server.pid")
    .option('--logfile [string]', 'write log to this file (default: ".session_server.log")', String, ".session_server.log")
    .option('--host [string]', 'bind to only this host (default: "127.0.0.1")', String, "127.0.0.1")
    .parse(process.argv)

if program._name == 'session_server.js'
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)


