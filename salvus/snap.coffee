#################################################################
#
# snap -- a node.js program that snapshots user projects
#
#################################################################

secret_token_length        = 128
db_ping_interval_seconds   = 60

net       = require 'net'
winston   = require 'winston'

backup    = require('backup')
message   = require 'message'
misc      = require 'misc'
misc_node = require 'misc_node'

program   = require('commander')
daemon    = require("start-stop-daemon")
cassandra = require('cassandra')

secret_token = undefined

require('crypto').randomBytes secret_token_length, (ex, buf) ->
    secret_token = buf.toString('base64')
    f = () ->
        winston.debug("registering with database server...")
        # TODO
    setInterval(f, 1000*db_ping_interval_seconds)

handle_mesg = (socket, mesg) ->
    winston.debug("handling mesg")

server = net.createServer (socket) ->
    winston.debug("received connection")

    misc_node.unlock_socket socket, secret_token, (err) ->
        if err
            winston.debug(err)
        else
            misc_node.enable_mesg(socket)
            handler = (type, mesg) ->
                if type == "json"
                    winston.debug "received mesg #{json(mesg)}"
                    handle_mesg(socket, mesg)
            socket.on 'mesg', handler

exports.start_server = start_server = () ->
    server.listen program.port, '127.0.0.1', () ->
        winston.info "listening on port #{server.address().port}"

program.usage('[start/stop/restart/status] [options]')
    .option('--pidfile [string]', 'store pid in this file', String, "data/pids/snap.pid")
    .option('--logfile [string]', 'write log to this file', String, "data/logs/snap.log")
    .parse(process.argv)

if program._name == 'snap.js'
    winston.debug "Running Snap as a Daemon"
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    console.log("start daemon")
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)
    console.log("after daemon")