async   = require('async')
winston = require('winston')
program = require('commander')
daemon  = require('start-stop-daemon')
net     = require('net')
fs      = require('fs')
message = require('message')
misc    = require('misc')
misc_node = require('misc_node')
uuid    = require('node-uuid')
{defaults, required} = misc

DATA = 'data'

database = undefined  # defined during connect_to_database
password = undefined  # defined during connect_to_database

class Project
    constructor: (@project_id, cb) ->
        @mnt = "/mnt/#{project_id}"
        @streams = "#{program.stream_path}/#{project_id}"
        @verbose = true

        dbg = (m) -> @dbg("constructor",[],m)

        async.series([
            (cb) =>
                dbg("make sure the streams path #{@streams} exists")
                fs.exists @streams, (exists) =>
                    if exists
                        cb()
                    else
                        fs.mkdir(@streams, 0o700, cb)
            (cb) =>
                dbg("sync streams path with database")
                @sync(cb:cb)
            (cb) =>
                @create_if_new(cb:cb)
        ], cb)

    create_if_new: (opts) =>
        opts = defaults opts
            cb : required

        is_new = false
        async.series([
            (cb) =>
                # check if streams directory is empty
                fs.readdir @streams, (err, files) =>
                    if err
                        cb(err)
                    else
                        is_new = files.length == 0
                        cb()
            (cb) =>
                if is_new
                    misc_node.execute_code
                        command : "smc_storage.py"
                        args    : args.concat(['create', @project_id])
                        timeout : 120
                        cb      : cb
                else
                    cb()
        ], opts.cb)

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("Project(#{@project_id}).#{f}(#{misc.to_json(args)}): #{m}")

    sync: (cb) =>

    smc_storage: (opts) =>
        opts = defaults opts,
            args    : required
            timeout : 60
            cb      : required

        args = ["--pool", program.pool, "--mnt", @mnt, "--stream_path", program.stream_path]


        for a in opts.args
            args.push(a)
        args.push(@project_id)
        misc_node.execute_code
            command : "smc_storage.py"
            args    : args
            timeout : opts.timeout
            cb      : opts.cb

    open: (cb) =>
        @smc_storage
            args : [

    save: (cb) =>

    snapshot: (cb) =>

    close: (cb) =>



projects = {}
get_project = (project_id) ->
    if not projects[project_id]?
        projects[project_id] = new Project(project_id)
    return projects[project_id]

handle_mesg = (socket, mesg) ->
    winston.debug("Handling '#{misc.to_safe_str(mesg)}'")
    resp   = message.error(error:"unknown event type: '#{mesg.event}'")
    action = mesg.action

    if socket.authenticated
        if mesg.project_id?
            project = get_project(mesg.project_id)
            switch action
                when 'newest_snapshot'
                    project.newest_snapshot (err, name) ->
                        if err
                            resp = message.error(error:err)
                        else
                            resp = message.storage_newest_snapshot(name:name)
                else
                    project[action] (err) ->
                        if err
                            resp = message.error(error:err)
                        else
                            resp = message.success()

    else
        # authenticate
        if mesg.event != 'storage_sign_in'
            resp.error = message.error(error:"you must authenticate first")
        else
            if mesg.password == password
                socket.authenticated = true
                resp = message.success()
            else
                resp = message.error(error:"invalid password")

    resp.id = mesg.id
    socket.write_mesg('json', resp)

server = net.createServer (socket) ->
    winston.debug("PARENT: received connection")
    socket.id = uuid.v4()
    misc_node.enable_mesg(socket)
    socket.on 'mesg', (type, mesg) ->
        if type == "json"   # other types ignored -- we only deal with json
            winston.debug("received mesg #{misc.to_safe_str(mesg)}")
            try
                handle_mesg(socket, mesg)
            catch e
                winston.debug(new Error().stack)
                winston.error "ERROR: '#{e}' handling message '#{misc.to_safe_str(mesg)}'"


start_tcp_server = (cb) ->
    winston.info("starting tcp server...")
    server.listen program.port, program.address, () ->
        winston.info("listening on #{program.address}:#{server.address().port}")
        fs.writeFile(program.portfile, server.address().port, cb)

connect_to_database = (cb) ->
    fs.readFile "#{DATA}/secrets/storage/storage_server", (err, _password) ->
        if err
            cb(err)
        else
            password = _password.toString().trim()
            database = new exports.Salvus
                hosts       : program.database_nodes.split(',')
                keyspace    : program.keyspace
                username    : program.username
                consistency : program.consistency
                password    : password
                cb          : cb

exports.start_server = start_server = () ->
    async.series [start_tcp_server, connect_to_database], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")

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
    .option('--consistency [number]', 'Cassandra consistency level (default: 1)', String, '1')

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


