winston = require('winston')
program = require('commander')
daemon  = require('start-stop-daemon')
net     = require('net')
message = require('message')
misc    = require('misc')
misc_node = require('misc_node')
uuid     = require 'node-uuid'

DATA = 'data'


server = net.createServer (socket) ->
    winston.debug("PARENT: received connection")
    socket.id = uuid.v4()
    misc_node.enable_mesg(socket)
    handler = (type, mesg) ->
        if type == "json"   # other types are handled elsewhere in event code.
            winston.debug "received control mesg #{json(mesg)}"
            handle_mesg(socket, mesg, handler)
    socket.on 'mesg', handler

start_server = (cb) ->
    winston.info("starting tcp server...")
    server.listen program.port, '127.0.0.1', () ->
        winston.info("listening on port #{server.address().port}")
        fs.writeFile(abspath("#{DATA}/local_hub.port"), server.address().port, cb)




program.usage('[start/stop/restart/status] [options]')
    .option('--pidfile [string]', 'store pid in this file', String, "#{DATA}/logs/storage_server.pid")
    .option('--logfile [string]', 'write log to this file', String, "#{DATA}/logs/storage_server.log")
    .option('--debug [string]', 'logging debug level (default: "" -- no debugging output)', String, 'debug')
    .option('--port [integer]', 'port to listen on (default: 8389 )', String, 'debug')
    .parse(process.argv)

if program._name == 'storage_server.js'
    if program.debug
        winston.remove(winston.transports.Console)
        winston.add(winston.transports.Console, level: program.debug)

    winston.debug "Running as a Daemon"
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)


