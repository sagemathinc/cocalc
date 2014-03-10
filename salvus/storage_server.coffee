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
    mount    : 3600
    save     : 3600
    snapshot : 300
    close    : 3600
    migrate  : 60*60*24
    migrate_snapshots  : 60*60*24

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
        @stream_path     = "#{program.stream_path}/#{@project_id}"
        @chunked_storage = database.chunked_storage(id:@project_id, verbose:@verbose)

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("Project(#{@project_id}).#{f}(#{misc.to_json(args)}): #{m}")

    exec: (opts) =>
        opts = defaults opts,
            args    : required
            timeout : 3600
            cb      : required

        args = ["--pool", program.pool, "--mnt", @mnt, "--stream_path", @stream_path]

        for a in opts.args
            args.push(a)
        args.push(@project_id)

        @dbg("exec", opts.args, args)
        misc_node.execute_code
            command : "smc_storage.py"
            args    : args
            timeout : opts.timeout
            cb      : (err, output) =>
                if err
                    opts.cb(output.stderr)
                else
                    opts.cb()

    # write to database log for this project
    log_action: (opts) =>
        opts = defaults opts,
            action : required    # 'sync', 'create', 'mount', 'save', 'snapshot', 'close', etc.
            param  : undefined   # if given, should be an array
            error  : undefined
            time_s : undefined
            cb     : undefined

        database.update
            table : 'storage_log'
            set   :
                action : opts.action
                param  : opts.param
                error  : opts.error
                time_s : opts.time_s
            where :
                id        : @project_id
                timestamp : cassandra.now()
            json  : ['param', 'error']
            cb    : (err) => opts.cb?(err)

    # get action log for this project from the database
    log: (opts) =>
        opts = defaults opts,
            max_age_m : undefined     # integer -- if given, only return log entries that are at most this old, in minutes.
            cb        : required
        if opts.max_age_m?
            where = {timestamp:{'>=':cassandra.minutes_ago(opts.max_age_m)}}
        else
            where = {}
        @dbg("log",where,"getting log...")
        where.id = @project_id
        database.select
            table     : 'storage_log'
            columns   : ['timestamp', 'action', 'param', 'time_s', 'error']
            where     : where
            json      : ['param', 'error']
            objectify : true
            cb        : opts.cb

    action: (opts) =>
        cb = opts.cb
        t = misc.walltime()
        opts.cb = (err, result) =>
            if opts.action not in ['log']   # actions to not log
                @log_action
                    action : opts.action
                    param  : opts.param
                    error  : err
                    time_s : misc.walltime(t)
            cb?(err, result)
        @_action(opts)

    _action: (opts) =>
        opts = defaults opts,
            action  : required    # 'sync', 'create', 'mount', 'save', 'snapshot', 'close'
            param   : undefined   # if given, should be an array
            timeout : undefined   # different defaults depending on the action
            cb      : undefined   # cb?(err)
        @dbg("_action", opts, "doing an action...")
        if not opts.timeout?
            opts.timeout = TIMEOUTS[opts.action]
        switch opts.action
            when "migrate_delete"  # temporary -- during migration only!
                @migrate_delete(opts.cb)
            when 'sync'
                @sync(opts.cb)
            when 'sync_put_delete'
                # TODO: disable this action once migration is done -- very dangerous
                @sync_put_delete(opts.cb)
            when 'log'
                @log
                    max_age_m : opts.param
                    cb        : opts.cb
            else
                args = [opts.action]
                if opts.param?
                    args = args.extend(opts.param)
                @exec
                    args    : args
                    timeout : opts.timeout
                    cb      : opts.cb

    migrate_delete: (cb) =>
        dbg = (m) => @dbg('destructive_migration',[],m)
        streams = undefined
        async.series([
            (cb) =>
                dbg("syncing with the database")
                @sync(cb)
            (cb) =>
                dbg("doing the migration")
                @action
                    action : "migrate"
                    cb     : cb
            (cb) =>
                dbg("migration succeeded -- saving result to database (deleting anything old)")
                @sync_put_delete(cb)
        ], cb)

    sync_put_delete: (cb) =>
        @chunked_storage.sync_put
            delete : true
            path   : @stream_path
            cb     : cb

    sync: (cb) =>
        # Find the chain of streams with newest end time, either locally or in the database,
        # and make sure it is present in both.
        dbg = (m) => @dbg('sync',[],m)
        dbg()
        put          = undefined
        remote_files = undefined
        local_files  = undefined

        async.series([
            (cb) =>
                @chunked_storage.ls
                    cb   : (err, files) =>
                        if err
                            cb(err)
                        else
                            remote_files = (f.name for f in files)
                            dbg("remote_files=#{misc.to_json(remote_files)}")
                            cb()
            (cb) =>
                fs.exists @stream_path, (exists) =>
                    if not exists
                        fs.mkdir(@stream_path, 0o700, cb)
                    else
                        cb()
            (cb) =>
                fs.readdir @stream_path, (err, files) =>
                    if err
                        cb(err)
                    else
                        local_files = files
                        dbg("local_files=#{misc.to_json(local_files)}")
                        cb()
            (cb) =>
                # streams are of this form:  2014-03-02T05:34:21--2014-03-09T01:41:47    (40 characters, with --).
                if local_files.length == 0
                    # nothing locally: get data from database
                    put = false
                    cb()
                else if remote_files.length == 0
                    # nothing in db: put local data in database
                    put = true
                    cb()
                else
                    local_times = (x.split('--')[1] for x in local_files)
                    local_times.sort()
                    remote_times = (x.split('--')[1] for x in remote_files)
                    remote_times.sort()
                    # put = true if local is newer.
                    put = local_times[local_times.length-1] > remote_times[remote_times.length-1]
                    cb()
            (cb) =>
                if put
                    dbg("put: from local to database")
                    f = (name, cb) =>
                        @chunked_storage.put
                            name     : name
                            filename : @stream_path + '/' + name
                            cb       : cb
                    async.mapLimit((a for a in optimal_stream(local_files) when a not in remote_files), 3, f, cb)
                else
                    dbg("get: from database to local")
                    f = (name, cb) =>
                        @chunked_storage.get
                            name     : name
                            filename : @stream_path + '/' + name
                            cb       : cb
                    async.mapLimit((a for a in optimal_stream(remote_files) when a not in local_files), 3, f, cb)
        ], cb)


optimal_stream = (v) ->
    # given a array of stream filenames that represent date ranges, of this form:
    #     [UTC date]--[UTC date]
    # find the optimal sequence, i.e., the linear subarray that ends with the newest date,
    # and starts with an empty interval.
    if v.length == 0
        return v
    v = v.slice(0) # make a copy
    v.sort (a,b) ->
        a = a.split('--')
        b = b.split('--')
        if a[1] > b[1]
            # newest ending is earliest
            return -1
        else if a[1] < b[1]
            # newest ending is earliest
            return +1
        else
            # both have same ending; take the one with longest interval, i.e., earlier start, as before
            if a[0] < b[0]
                return -1
            else if a[0] > b[0]
                return +1
            else
                return 0
    while true
        if v.length ==0
            return []
        w = []
        i = 0
        while i < v.length
            x = v[i]
            w.push(x)
            # now move i forward to find an element of v whose end equals the start of x
            start = x.split('--')[0]
            i += 1
            while i < v.length
                if v[i].split('--')[1] == start
                    break
                i += 1
        # Did we end with a an interval of length 0, i.e., a valid sequence?
        x = w[w.length-1].split('--')
        if x[0] == x[1]
            return w
        v = v.shift()  # delete first element -- it's not the end of a valid sequence.


projects = {}
get_project = (project_id) ->
    if not projects[project_id]?
        projects[project_id] = new Project(project_id: project_id)
    return projects[project_id]

handle_mesg = (socket, mesg) ->
    winston.debug("storage_server: handling '#{misc.to_safe_str(mesg)}'")
    id = mesg.id
    if mesg.event == 'storage'
        t = misc.walltime()
        project = get_project(mesg.project_id)
        project.action
            action : mesg.action
            param  : mesg.param
            cb     : (err, result) ->
                if err
                    resp = message.error(error:err, id:id)
                else
                    resp = message.success(id:id)
                if result?
                    resp.result = result
                resp.time_s = misc.walltime(t)
                socket.write_mesg('json', resp)
    else
        socket.write_mesg('json', message.error(id:id,error:"unknown event type: '#{mesg.event}'"))

register_with_database = () ->
    database.update
        table : 'storage_servers'
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
                winston.debug("unlocked connection")
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
        winston.debug("listening on #{program.address}:#{program.port}")
        register_with_database()
        setInterval(register_with_database, REGISTRATION_INTERVAL)
        fs.writeFile(program.portfile, program.port, cb)

read_password = (cb) ->
    winston.debug("read_password")
    if password?
        cb()
        return
    fs.readFile "#{DATA}/secrets/storage/storage_server", (err, _password) ->
        if err
            cb(err)
        else
            password = _password.toString().trim()
            cb()

connect_to_database = (cb) ->
    winston.debug("connect_to_database")
    if database?
        cb?()
        return
    database = new cassandra.Salvus
        hosts       : program.database_nodes.split(',')
        keyspace    : program.keyspace
        username    : program.username
        consistency : program.consistency
        password    : password
        cb          : cb

start_server = () ->
    winston.debug("start_server")
    async.series [read_password, connect_to_database, start_tcp_server], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")

get_port = (hostname, cb) ->
    winston.debug("getting port for server at #{hostname}...")
    async.series [read_password, connect_to_database], (err) ->
        if err
            cb(err)
        else
            database.select_one
                table : 'storage_servers'
                where : {dummy:true, hostname:hostname}
                columns : ['port']
                objectify : true
                cb        : (err, result) ->
                    if err
                        winston.debug("no server running at #{hostname} right now")
                        cb(err)
                    else
                        winston.debug("got port of #{hostname}: #{result.port}")
                        cb(undefined, result.port)

class Client
    constructor: (@hostname, @port, @verbose, cb) ->
        @connect (err) =>
            cb?(err, @)

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("storage Client(#{@host}:#{@port}).#{f}(#{misc.to_json(args)}): #{m}")

    connect: (cb) =>
        dbg = (m) -> winston.debug("Storage client (#{@hostname}:#{@port}): #{m}")
        async.series([
            (cb) =>
                if not @port?
                    dbg("get port")
                    get_port @hostname, (err, port) =>
                        @port = port
                        cb(err)
                else
                    cb()
            (cb) =>
                dbg("ensure password")
                read_password(cb)
            (cb) =>
                dbg("connect to locked socket")
                misc_node.connect_to_locked_socket
                    host    : @hostname
                    port    : @port
                    token   : password
                    timeout : 60
                    cb      : (err, socket) =>
                        if err
                            @socket = undefined
                            cb(err)
                        else
                            @socket = socket
                            misc_node.enable_mesg(@socket)
                            cb()
        ], cb)


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
        async.series([
            (cb) =>
                if not @socket?
                    @port = undefined                    
                    @connect(cb)
                else
                    cb()
            (cb) =>
                @_call(opts)
                cb()
        ])

    _call: (opts) =>
        opts = defaults opts,
            mesg    : required
            timeout : 60
            cb      : undefined
        @dbg("call", opts, "start call")
        @socket.write_mesg 'json', opts.mesg, (err) =>
            @dbg("call", opts, "got response from socket write mesg: #{err}")
            if err
                if not @socket?   # extra messages but socket already gone -- already being handled below
                    return
                if err == "socket not writable"
                    @socket = undefined
                    @dbg("call",opts,"socket closed: reconnect and try again...")
                    @port = undefined
                    @connect (err) =>
                        if err
                            opts.cb?(err)
                        else
                            @call
                                mesg    : opts.mesg
                                timeout : opts.timeout
                                cb      : opts.cb
                else
                    opts.cb?(err)
            else
                @dbg("call",opts,"waiting to receive response")
                @socket.recv_mesg
                    type    : 'json'
                    id      : opts.mesg.id
                    timeout : opts.timeout
                    cb      : (mesg) =>
                        @dbg("call",opts,"got response -- #{misc.to_json(mesg)}")
                        if mesg.event == 'error'
                            opts.cb?(mesg.error)
                        else
                            opts.cb?(undefined, {time_s:mesg.time_s, result:mesg.result})

    action: (opts) =>
        opts = defaults opts,
            action     : required    # 'sync', 'create', 'mount', 'save', 'snapshot', 'close'
            param      : undefined
            project_id : required
            timeout    : undefined   # different defaults depending on the action
            cb         : undefined

        if not opts.timeout?
            opts.timeout = TIMEOUTS[opts.action]
        @call
            mesg    : @mesg(opts.project_id, opts.action, opts.param)
            timeout : opts.timeout
            cb      : opts.cb

exports.client = (opts) ->
    opts = defaults opts,
        hostname : required
        port     : undefined
        verbose  : true
        cb       : required

    C = new Client(opts.hostname, opts.port, opts.verbose, opts.cb)
    return


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
        winston.error("Uncaught exception: #{err}")
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

if program._name == 'storage_server.js'
    main()


