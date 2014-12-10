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

token_file = (name) -> "#{process.env.SALVUS_TOKENS}/#{name}.token"
SECRET_TOKEN_LENGTH = 128
DEFAULT_TOKEN_FILE  = token_file('microservice')
DEFAULT_PORT        = 6000

DEFAULT_TIMEOUT     = 10

######################################################################
# CLIENT
######################################################################
exports.client = (opts) ->
    opts = defaults opts,
        cb         : required              # cb(err,  instance)
        token_file : DEFAULT_TOKEN_FILE
        port       : DEFAULT_PORT
    # since client is used only for testing
    winston.remove(winston.transports.Console)
    winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})
    new Client(opts)

class Client extends EventEmitter
    constructor : (opts) ->
        opts = defaults opts,
            token_file : DEFAULT_TOKEN_FILE
            port       : DEFAULT_PORT
            name       : 'Abstract'
            cb         : required
        @token_file = opts.token_file
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
        winston.debug("#{@name}Client.#{f}: #{m}")

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
            call    : true     # if true, tags mesg with id and waits for a response with the same id
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

    ping: (cb) =>
        t0 = misc.mswalltime()
        @send_mesg
            mesg : message.ping()
            call : true
            cb   : (err, resp) =>
                if err
                    @dbg("ping", "error -- #{err}")
                    cb(err)
                else
                    @dbg("ping", "pong: #{misc.mswalltime(t0)}ms")
                    cb()

    test0: (cb) =>
        @send_mesg
            mesg : {event:'test0'}
            call : true
            cb   : (err, resp) =>
                @dbg('test0', misc.to_json(resp))


######################################################################
# Network SERVER
######################################################################
class Server extends EventEmitter
    constructor : (opts) ->
        opts = defaults opts,
            token_file : DEFAULT_TOKEN_FILE
            port       : DEFAULT_PORT
            name       : 'Abstract'
            cb         : undefined
        @dbg("constructor")
        @port = opts.port
        @name = opts.name
        @init_event_handlers()
        async.series([
            (cb) =>
                @dbg("constructor","reading token file")
                fs.exists opts.token_file, (exists) =>
                    if not exists
                        cb(); return
                    fs.readFile opts.token_file, (err, buf) =>
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
                        fs.writeFile(opts.token_file, buf, cb)
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
                call   : false

        @on 'mesg_test0', (socket, mesg) =>
            @dbg("test0", "mesg_test0")
            @send_mesg
                socket : socket
                mesg   : message.pong(id:mesg.id)
                call   : false
            f = () =>
                @dbg("test0", "f")
                @send_mesg
                    socket : socket
                    mesg   : {event:'test0'}
                    call   : false
            setTimeout(f, 1000)

            g = () =>
                @dbg("test0", "g")
                t0 = misc.mswalltime()
                @send_mesg
                    socket : socket
                    mesg   : message.ping()
                    call   : true
                    cb     : (err, resp) =>
                        if err
                            @dbg("test0", "error -- #{err}")
                        else
                            @dbg("test0", "pong: #{misc.mswalltime(t0)}ms")

            setTimeout(g, 1000)


    dbg: (f, m) =>
        winston.debug("#{@name}Server.#{f}: #{m}")


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
            call    : true              # if true, tags mesg with id and waits for a response with the same id
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


start_server = () ->
    winston.debug("start_server")
    new Server
        token_file : program.token
        port       : program.port


#############################################
# Process command line arguments -- copy something based
# on this into module that actually uses this.
#############################################
program.usage('[start/stop/restart/status] [options]')
    .option('--port <n>', 'port to listen on (default: #{DEFAULT_PORT})', parseInt, DEFAULT_PORT)
    .option('--debug [string]', 'logging debug level (default: "debug"); "" for no debugging output)', String, 'debug')
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/program._name.pid")', String, undefined)
    .option("--token [string]', 'store secret token in this file (default: '#{DEFAULT_TOKEN_FILE}')", String, DEFAULT_TOKEN_FILE)
    .option('--logfile [string]', 'write log to this file (default: "data/logs/program._name.log")', String, undefined)
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "salvus")', String, 'salvus')
    .parse(process.argv)

if program._name != 'undefined'
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

    console.log("Starting #{program._name} server...")
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

