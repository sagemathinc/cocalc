#################################################################
#
# storage_server -- a node.js program that provides a TCP server
# that is used by the hubs to organize project storage, which involves
# pulling streams from the database, mounting them, exporting them, etc.
#
#  (c) William Stein, 2014
#
#  NOT released under any open source license.
#
#################################################################

async     = require('async')
winston   = require('winston')
program   = require('commander')
daemon    = require('start-stop-daemon')
net       = require('net')
fs        = require('fs')
message   = require('message')
misc      = require('misc')
misc_node = require('misc_node')
uuid      = require('node-uuid')
cassandra = require('cassandra')

{defaults, required} = misc

TIMEOUTS =
    sync     : 3600
    create   : 120
    mount    : 300
    save     : 900
    snapshot : 120
    close    : 900

REGISTRATION_INTERVAL = 20*1000      # register with the database every 20 seconds
REGISTRATION_TTL      = 30*1000      # ttl for registration record

DATA = 'data'

database = undefined  # defined during connect_to_database
password = undefined  # defined during connect_to_database

class Project
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required
            verbose    : true

        @project_id      = opts.project_id
        @verbose         = opts.verbose
        @mnt             = "/mnt/#{@project_id}"
        @streams         = "#{program.stream_path}/#{@project_id}"
        @chunked_storage = database.chunked_storage(id:@project_id, verbose:@verbose)

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("Project(#{@project_id}).#{f}(#{misc.to_json(args)}): #{m}")

    exec: (opts) =>
        opts = defaults opts,
            args    : required
            timeout : 3600
            cb      : required

        args = ["--pool", program.pool, "--mnt", @mnt, "--stream_path", program.stream_path]

        for a in opts.args
            args.push(a)
        args.push(@project_id)

        @dbg("exec", opts.args, args)

        misc_node.execute_code
            command : "smc_storage.py"
            args    : args
            timeout : opts.timeout
            cb      : (err, output) =>
                if err or output.stderr
                    opts.cb(output.stderr)
                else
                    opts.cb()

    action: (opts) =>
        opts = defaults opts,
            action  : required    # 'sync', 'create', 'mount', 'save', 'snapshot', 'close'
            params  : undefined   # if given, should be an array
            timeout : undefined   # different defaults depending on the action
            cb      : undefined
        if not opts.timeout?
            opts.timeout = TIMEOUTS[opts.action]
        if opts.action == 'sync'
            @chunked_storage.sync(path: @streams, cb:opts.cb)
        else
            args = [opts.action]
            if opts.params?
                args = args.extend(opts.params)
            @exec
                args    : args
                timeout : opts.timeout
                cb      : opts.cb

projects = {}
get_project = (project_id) ->
    if not projects[project_id]?
        projects[project_id] = new Project(project_id: project_id)
    return projects[project_id]

handle_mesg = (socket, mesg) ->
    winston.debug("storage_server: handling '#{misc.to_safe_str(mesg)}'")
    if mesg.event == 'storage'
        project = get_project(mesg.project_id)
        project.action
            action : mesg.action
            params : mesg.params
            cb     : (err) ->
                if err
                    resp = message.error(error:err)
                else
                    resp = message.success()
    else
        resp   = message.error(error:"unknown event type: '#{mesg.event}'")
    resp.id = mesg.id
    winston.debug("storage_server: sending response to #{misc.to_safe_str(mesg)}: #{misc.to_safe_str(resp)}")
    socket.write_mesg('json', resp)

register_with_database = () ->
    @database.update
        set   : {port : program.port}
        where : {dummy:true, hostname:program.address}
        ttl   : REGISTRATION_TTL
        cb    : (err) ->
            if err
                winston.debug("error registering storage server with database: #{err}")
            else
                winston.debug("registered with database")

start_tcp_server = (cb) ->
    winston.info("starting tcp server...")

    server = net.createServer (socket) ->
        winston.debug("received connection")
        socket.id = uuid.v4()
        misc_node.unlock_socket socket, password, (err) ->
            if err
                winston.debug("ERROR: unable to unlock socket -- #{err}")
            else
                misc_node.enable_mesg(socket)
                socket.on 'mesg', (type, mesg) ->
                    if type == "json"   # other types ignored -- we only deal with json
                        winston.debug("received mesg #{misc.to_safe_str(mesg)}")
                        try
                            handle_mesg(socket, mesg)
                        catch e
                            winston.debug(new Error().stack)
                            winston.error "ERROR: '#{e}' handling message '#{misc.to_safe_str(mesg)}'"

    server.listen program.port, program.address, () ->
        program.port = server.address().port
        winston.info("listening on #{program.address}:#{program.port}")
        setInterval(register_with_database, REGISTRATION_INTERVAL)
        fs.writeFile(program.portfile, program.port, cb)

read_password = (cb) ->
    if password?
        return
    fs.readFile "#{DATA}/secrets/storage/storage_server", (err, _password) ->
        if err
            cb(err)
        else
            password = _password.toString().trim()
            cb()

connect_to_database = (cb) ->
    if database?
        cb()
        return
    database = new exports.Salvus
        hosts       : program.database_nodes.split(',')
        keyspace    : program.keyspace
        username    : program.username
        consistency : program.consistency
        password    : password
        cb          : cb

start_server = () ->
    async.series [read_password, connect_to_database, start_tcp_server], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")

class Client
    constructor: (@hostname, @port, timeout, cb) ->
        dbg = (m) -> winston.debug("Storage client (#{@hostname}:#{@port}): #{m}")
        async.series([
            (cb) =>
                dbg("ensure password")
                read_password(cb)
            (cb) =>
                timer = undefined
                timed_out = () ->
                    cb("timed out trying to connect to locked socket on port #{port}")
                    @socket.end()
                    @socket = undefined
                    timer = undefined
                timer  = setTimeout(timed_out, timeout*1000)
                @socket = net.connect {host:@hostname, port:@port}, () =>
                    listener = (data) =>
                        dbg("got back response: #{data}")
                        @socket.removeListener('data', listener)
                        if data.toString() == 'y'
                            if timer?
                                clearTimeout(timer)
                                cb(false)
                        else
                            @socket.destroy()
                            @socket = undefined
                            if timer?
                                clearTimeout(timer)
                                cb("Permission denied (invalid secret token) when connecting to the local hub.")
                    dbg("connected, now sending secret")
                    @socket.write(password)
                # This is called in case there is an error trying to make the connection, e.g., "connection refused".
                @socket.on "error", (err) =>
                    if timer?
                        clearTimeout(timer)
                    cb(err)
        ], opts.cb)

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("storage Client(#{@host}:#{@port}).#{f}(#{misc.to_json(args)}): #{m}")

    mesg: (project_id, action, param) =>
        mesg = message.storage
            id         : uuid.v4()
            project_id : project_id
            action     : action
            param      : param
        return mesg

    call: (opts) =>
        opts = defaults opts,
            mesg    : required
            timeout : 60
            cb      : undefined
        @socket.write_mesg 'json', opts.mesg, (err) =>
            if err
                opts.cb?(err)
            else
                @socket.recv_mesg
                    type : 'json'
                    id   : opts.mesg.id
                    timeout : opts.timeout
                    cb      : opts.cb

    action: (opts) =>
        opts = defaults opts,
            action     : required    # 'sync', 'create', 'mount', 'save', 'snapshot', 'close'
            project_id : required
            timeout    : undefined   # different defaults depending on the action
            cb         : undefined

        if not opts.timeout?
            opts.timeout = TIMEOUTS[opts.action]
        @call
            mesg    : @mesg(opts.project_id, opts.action)
            timeout : opts.timeout
            cb      : opts.cb

exports.client = (opts) ->
    opts = defaults opts,
        hostname : required
        port     : required
        timeout  : 30
        cb       : required

    c = new Client opts.hostname, opts.port, opts.timeout, (err) ->
        if err
            opts.cb(err)
        else
            opts.cb(undefined, c)

program.usage('[start/stop/restart/status] [options]')

    .option('--pidfile [string]', 'store pid in this file', String, "#{DATA}/logs/storage_server.pid")
    .option('--logfile [string]', 'write log to this file', String, "#{DATA}/logs/storage_server.log")
    .option('--portfile [string]', 'write port number to this file', String, "#{DATA}/logs/storage_server.port")

    .option('--debug [string]', 'logging debug level (default: "" -- no debugging output)', String, 'debug')

    .option('--port [integer]', 'port to listen on (default: OS-assigned)', String, '0')
    .option('--address [string]', 'address to listen on (default: the tinc network)', String, '')

    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, '10.1.1.1,10.1.7.1,10.1.10.1,10.1.21.1')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "storage")', String, 'storage')
    .option('--username [string]', 'Cassandra username to use (default: "storage_server")', String, 'storage_server')
    .option('--consistency [number]', 'Cassandra consistency level (default: 2)', String, '2')

    .option('--stream_path [string]', 'Path where streams are stored (default: /storage/streams)', String, '/storage/streams')
    .option('--pool [string]', 'Storage pool used for images (default: storage)', String, 'storage')
    .parse(process.argv)

main = () ->
    if program.debug
        winston.remove(winston.transports.Console)
        winston.add(winston.transports.Console, level: program.debug)

    if not program.address
        program.address = require('os').networkInterfaces().tun0[0].address
        if not program.address
            console.log("No tinc network: you must specify --address")
            return

    winston.debug "Running as a Daemon"
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

if program._name == 'storage_server.js'
    main()


