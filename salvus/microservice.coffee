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

DEFAULT_PORT        = 6000
SECRET_TOKEN_LENGTH = 128
DEFAULT_TIMEOUT     = 10


{EventEmitter} = require('events')

fs        = require("fs")
net       = require('net')
async     = require('async')
program   = require('commander')
daemon    = require('start-stop-daemon')
winston   = require('winston')
misc      = require('misc')
misc_node = require('misc_node')
message   = require('message')
uuid      = require('node-uuid')

{defaults, required} = misc
{EventEmitter} = require('events')

if not process.env.SALVUS_TOKENS?
    throw "Update and source salvus-env"

token_filename = (name) -> "#{process.env.SALVUS_TOKENS}/#{name}.token"


######################################################################
# CLIENT
######################################################################
exports.client = (opts) ->
    opts = defaults opts,
        cb         : required              # cb(err,  instance)
        port       : DEFAULT_PORT
        debug      : true
    new exports.Client(opts)

class exports.Client extends EventEmitter
    constructor : (opts) ->
        opts = defaults opts,
            port       : DEFAULT_PORT
            name       : 'microservice'
            debug      : false
            cb         : required

        if opts.debug
            winston.remove(winston.transports.Console)
            winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

        @token_file = token_filename(opts.name)
        @port = opts.port
        @name = opts.name
        misc.call_lock(obj:@)

        t = misc.mswalltime()
        async.series([
            (cb) =>
                misc.retry_until_success
                    f  : @read_token
                    cb : cb
            (cb) =>
                @connect(cb)
        ], (err) =>
            if err
                @dbg("constructor", "failed to create: #{err}") # should be impossible
                opts.cb(err)
            else
                @dbg("constructor", "connected Client in #{misc.mswalltime(t)}ms")
                opts.cb(undefined, @)
        )

    dbg: (f, m) =>
        winston.debug("#{@name}Client.#{f}: #{misc.trunc(misc.to_json(m),200)}")

    read_token: (cb) =>
        @dbg("read_token")
        fs.readFile @token_file, (err, buf) =>
            if err
                @dbg("read_token", "error = #{err}")
                cb(err)
            else
                @dbg("read_token", "got it")
                @secret_token = buf.toString('base64')
                cb()

    connect: (cb) =>
        @dbg("connect")
        f = (cb) =>
            misc.retry_until_success
                f  : @_connect
                cb : cb
        @_call_with_lock(f, cb)

    _connect: (cb) =>
        @dbg("_connect")
        @socket = undefined
        socket = misc_node.connect_to_locked_socket
            port    : @port
            token   : @secret_token
            timeout : 5
            cb      : (err) =>
                if err
                    @dbg("_connect", "error -- #{err}")
                    cb(err)
                else
                    @dbg("_connect", "success -- now adding listeners")
                    misc_node.enable_mesg(socket, 'connection_to_syncstring_server')
                    @socket = socket

                    socket.on 'mesg', (type, mesg) =>
                        if type == 'json'
                            @dbg("mesg", misc.trunc(misc.to_json(mesg),200))
                            @emit("mesg_#{mesg.event}", mesg)
                        else
                            @dbg("mesg", "mesg of unknown type #{type} ignored")

                    reconnect = () =>
                        socket.removeAllListeners()
                        @connect()

                    socket.on('end',   reconnect)
                    socket.on('close', reconnect)
                    socket.on('error', reconnect)

                    @on 'mesg_ping', (mesg) =>
                        @send_mesg
                            mesg   : message.pong(id:mesg.id)
                            call   : false

                    cb()

    send_mesg: (opts) =>
        opts = defaults opts,
            mesg    : required
            timeout : DEFAULT_TIMEOUT
            call    : false    # if true, tags mesg with id and waits for a response with the same id
            cb      : undefined
        if opts.call and not opts.mesg.id?
            opts.mesg.id = uuid.v4()
        @socket.write_mesg('json', opts.mesg)
        if opts.call
            @socket.recv_mesg
                type    : 'json'
                id      : opts.mesg.id
                timeout : opts.timeout
                cb      : (resp) =>
                    if resp.event == 'error'
                        opts.cb?(resp.error)
                    else
                        opts.cb?(undefined, resp)
        else
            opts.cb?()

    call: (opts) =>
        opts.call = true
        @send_mesg(opts)

    ping: (cb) =>
        t0 = misc.mswalltime()
        @call
            mesg : message.ping()
            cb   : (err, resp) =>
                if err
                    @dbg("ping", "error -- #{err}")
                    cb(err)
                else
                    @dbg("ping", "pong: #{misc.mswalltime(t0)}ms")
                    cb()

    test0: (cb) =>
        @call
            mesg : {event:'test0'}
            cb   : (err, resp) =>
                @dbg('test0', misc.to_json(resp))

    test1: (n, cb) =>
        b = new Buffer(n)
        b.fill('a')
        big = b.toString()
        t = misc.mswalltime()
        @call
            mesg : {event:'ping', big:big}
            cb   : (err, resp) =>
                @dbg('test1', "totat time: #{misc.mswalltime(t)}ms")

######################################################################
# Network SERVER
######################################################################
class exports.Server extends EventEmitter
    constructor : (opts) ->
        opts = defaults opts,
            port       : DEFAULT_PORT
            name       : 'microservice'
            cb         : undefined
        @dbg("constructor")
        @port = opts.port
        @name = opts.name
        @init_event_handlers()

        token_file = token_filename(opts.name)
        async.series([
            (cb) =>
                @dbg("constructor","reading token file")
                fs.exists token_file, (exists) =>
                    if not exists
                        cb(); return
                    fs.readFile token_file, (err, buf) =>
                        if err
                            cb() # will generate in next step
                        else
                            @secret_token = buf.toString('base64')
                            cb()
            (cb) =>
                if @secret_token?
                    cb()
                else
                    @dbg("constructor","generating token")
                    require('crypto').randomBytes SECRET_TOKEN_LENGTH, (ex, buf) =>
                        @secret_token = buf.toString('base64')
                        fs.writeFile(token_file, buf, cb)
            (cb) =>
                @dbg("constructor","starting tcp server")
                @start_tcp_server(cb)
        ], (err) =>
            if err
                @dbg("constructor","Failed to start server: #{err}")
                opts.cb?(err)
            else
                @dbg("constructor","Started server")
                opts.cb?(undefined, @)

        )

    init_event_handlers: () =>
        @on 'mesg_ping', (socket, mesg) =>
            @send_mesg
                socket : socket
                mesg   : message.pong(id:mesg.id)

        @on 'mesg_test0', (socket, mesg) =>
            @dbg("test0", "mesg_test0")
            @send_mesg
                socket : socket
                mesg   : message.pong(id:mesg.id)
            f = () =>
                @dbg("test0", "f")
                @send_mesg
                    socket : socket
                    mesg   : {event:'test0'}
            setTimeout(f, 1000)

            g = () =>
                @dbg("test0", "g")
                t0 = misc.mswalltime()
                @call
                    socket : socket
                    mesg   : message.ping()
                    cb     : (err, resp) =>
                        if err
                            @dbg("test0", "error -- #{err}")
                        else
                            @dbg("test0", "pong: #{misc.mswalltime(t0)}ms")

            setTimeout(g, 1000)


    dbg: (f, m) =>
        winston.debug("#{@name}Server.#{f}: #{misc.trunc(misc.to_json(m),200)}")


    start_tcp_server: (cb) =>
        server = net.createServer (socket) =>
            @dbg("tcp_server", "received connection")
            misc_node.unlock_socket socket, @secret_token, (err) =>
                if err
                    @dbg("tcp_server", "error unlocking socket -- #{err}")
                    winston.debug(err)
                else
                    socket.id = uuid.v4()
                    misc_node.enable_mesg(socket)
                    @dbg("tcp_server", "unlocked socket -- id=#{socket.id}")

                    socket.on 'mesg', (type, mesg) =>
                        if type == 'json'
                            @dbg("socket (id=#{socket.id})", misc.trunc(misc.to_json(mesg),200))
                            @emit("mesg_#{mesg.event}", socket, mesg)
                        else
                            @dbg("mesg", "mesg of unknown type #{type} ignored")

                    disconnect = () =>
                        @dbg("socket (id=#{socket.id})", "disconnect")
                        socket.removeAllListeners()
                    socket.on('end',   disconnect)
                    socket.on('close', disconnect)
                    socket.on('error', disconnect)

        try
            server.listen @port, 'localhost', () =>
                @dbg("tcp_server", "listening on port #{@port}")
            cb()
        catch err
            cb(err)

    send_mesg: (opts) =>
        opts = defaults opts,
            socket  : required
            mesg    : required
            timeout : DEFAULT_TIMEOUT
            call    : false             # if true, tags mesg with id and waits for a response with the same id
            cb      : undefined
        if opts.call and not opts.mesg.id?
            opts.mesg.id = uuid.v4()
        opts.socket.write_mesg('json', opts.mesg)
        if opts.call
            opts.socket.recv_mesg
                type    : 'json'
                id      : opts.mesg.id
                timeout : opts.timeout
                cb      : (resp) =>
                    if resp.event == 'error'
                        opts.cb?(resp.error)
                    else
                        opts.cb?(undefined, resp)
        else
            opts.cb?(undefined)

    call: (opts) =>
        opts.call = true
        @send_mesg(opts)


# Process command line arguments
exports.cli = (opts) ->
    opts = defaults opts,
        server_class : exports.Server
        default_port : DEFAULT_PORT

    program.usage('[start/stop/restart/status] [options]')
        .option('--port <n>', "port to listen on (default: #{opts.default_port})", parseInt)
        .option('--debug [string]', 'logging debug level (default: "debug"); "" for no debugging output)', String, 'debug')
        .option('--pidfile [string]', 'store pid in this file', String)
        .option('--logfile [string]', 'write log to this file (default: "data/logs/program._name.log")', String)
        .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
        .option('--keyspace [string]', 'Cassandra keyspace to use (default: "salvus")', String, 'salvus')
        .parse(process.argv)

    if program._name != 'undefined'
        if not program.port?
            program.port = opts.default_port
        if not program.pidfile?
            program.pidfile = "data/pids/#{program._name}.pid"
        if not program.logfile?
            program.logfile = "data/logs/#{program._name}.log"
        # run as a server/daemon (otherwise, imported as a library)
        if program.debug
            winston.remove(winston.transports.Console)
            winston.add(winston.transports.Console, {level: program.debug, timestamp:true, colorize:true})

        process.addListener "uncaughtException", (err) ->
            winston.debug("BUG ****************************************************************************")
            winston.debug("Uncaught exception: " + err)
            winston.debug(err.stack)
            winston.debug("BUG ****************************************************************************")

        console.log("#{program._name} #{program.args[0]} server on port #{program.port}...")
        daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile},
               () ->
                    winston.debug("start_server")
                    new opts.server_class(port : program.port)
              )


if not module.parent?
    exports.cli()
