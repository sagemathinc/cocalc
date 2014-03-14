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


REGISTRATION_INTERVAL_S = 20       # register with the database every 20 seconds
REGISTRATION_TTL_S      = 30       # ttl for registration record

TIMEOUT = 12*3600

DATA = 'data'

database = undefined  # defined during connect_to_database
password = undefined  # defined during connect_to_database


# TEMPORARY -- for migration
# TODO: DELETE this whole select thing once we finish migration!
is_project_new = (project_id, cb) ->   #  cb(err, true if project should be run using the new storage system)
    database.select
        table   : 'project_new'
        columns : ['new']
        where   : {project_id : project_id}
        cb      : (err, results) ->
            if err
                cb(err)
            else
                cb(undefined, results.length > 0 and results[0][0])




###########################
## server-side: Storage server code
###########################

# A project from the point of view of the storage server
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
            timeout : TIMEOUT
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
            timestamp : undefined
            cb     : undefined

        if not opts.timestamp?
            opts.timestamp = cassandra.now()

        async.series([
            (cb) =>
                if opts.error?
                    cb(); return
                set = undefined
                switch opts.action
                    when 'sync_streams', 'recv_streams', 'send_streams', 'import_pool', 'snapshot_pool', 'scrub_pool'
                        set = {}
                        set[opts.action] = opts.timestamp
                    when 'export_pool'
                        set = {import_pool: undefined}
                    when 'destroy_image_fs'
                        set = {recv_streams: undefined, import_pool: undefined}
                    when 'destroy_streams'
                        set = {sync_streams: undefined}
                    when 'destroy'
                        set ={recv_streams: undefined, import_pool: undefined, sync_streams: undefined}
                if set?
                    database.update
                        table : 'project_state'
                        set   : set
                        where : {project_id : @project_id, compute_id : compute_id}
                        cb    : cb
                else
                    cb()
            (cb) =>
                database.update
                    table : 'storage_log'
                    set   :
                        action     : opts.action
                        param      : opts.param
                        error      : opts.error
                        time_s     : opts.time_s
                        host       : program.address
                        compute_id : compute_id
                    where :
                        id        : @project_id
                        timestamp : opts.timestamp
                    json  : ['param', 'error']
                    cb    : cb
        ], (err) => opts.cb?(err))


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
            columns   : ['timestamp', 'action', 'param', 'time_s', 'error', 'host', 'compute_id']
            where     : where
            json      : ['param', 'error']
            objectify : true
            cb        : opts.cb

    action: (opts) =>
        cb = opts.cb
        start_time = cassandra.now()
        t = misc.walltime()
        opts.cb = (err, result) =>
            if opts.action not in ['log']   # actions to not log
                @log_action
                    action    : opts.action
                    param     : opts.param
                    error     : err
                    timestamp : start_time
                    time_s    : misc.walltime(t)
            cb?(err, result)
        @_action(opts)

    _action: (opts) =>
        opts = defaults opts,
            action  : required    # 'sync', 'create', 'mount', 'save', 'snapshot', 'close'
            param   : undefined   # if given, should be an array or string
            timeout : TIMEOUT
            cb      : undefined   # cb?(err)
        @dbg("_action", opts, "doing an action...")
        switch opts.action
            when "migrate_delete"  # temporary -- during migration only!
                @migrate_delete(cb:opts.cb, destroy:opts.param)
            when "delete_from_database"  # VERY DANGEROUS -- deletes from the database
                @delete_from_database(opts.cb)
            when 'sync_put_delete'
                # TODO: disable this action once migration is done -- very dangerous
                @sync_put_delete(opts.cb)

            when 'sync_streams'
                @sync_streams(opts.cb)

            when 'log'
                @log
                    max_age_m : opts.param
                    cb        : opts.cb
            else
                args = [opts.action]
                if opts.param?
                    if typeof opts.param == 'string'
                        opts.param = misc.split(opts.param)  # turn it into an array
                    args = args.concat(opts.param)
                @exec
                    args    : args
                    timeout : opts.timeout
                    cb      : opts.cb

    migrate_delete: (cb, destroy) =>
        dbg = (m) => @dbg('destructive_migration',[],m)
        streams = undefined
        async.series([
            (cb) =>
                if destroy
                    dbg("destroying everything first -- start with a clean slate!")
                    @action
                        action : 'destroy'
                        cb     : cb
                else
                    dbg("syncing with the database first")
                    @sync(cb)
            (cb) =>
                dbg("doing the migration")
                @action
                    action : "migrate"
                    cb     : cb
            (cb) =>
                dbg("migration succeeded -- saving result to database (deleting anything old)")
                @sync_put_delete(cb)
        ], (err) => cb(err))

    delete_from_database: (cb) =>
        @dbg('delete_from_database',[],"")
        @chunked_storage.delete_everything(cb:cb)

    sync_put_delete: (cb) =>
        @chunked_storage.sync_put
            delete : true
            path   : @stream_path
            cb     : cb

    sync_streams: (cb) =>
        # Find the chain of streams with newest end time, either locally or in the database,
        # and make sure it is present in both.
        dbg = (m) => @dbg('sync',[],m)
        dbg()
        put          = undefined
        remote_files = undefined
        local_files  = undefined

        start_sync = cassandra.now()
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
                        local_files = (x for x in files when x.slice(x.length-4) != '.tmp')
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
                    local_times = (x.split('--')[1] for x in local_files when x.length == 40)
                    local_times.sort()
                    remote_times = (x.split('--')[1] for x in remote_files when x.length == 40)
                    remote_times.sort()
                    # put = true if local is newer.
                    put = local_times[local_times.length-1] > remote_times[remote_times.length-1]
                    cb()
            (cb) =>
                if put
                    to_put = (a for a in optimal_stream(local_files) when a not in remote_files)
                    dbg("put: from local to database: #{misc.to_json(to_put)}")
                    f = (name, cb) =>
                        @chunked_storage.put
                            name     : name
                            filename : @stream_path + '/' + name
                            cb       : cb
                    async.mapLimit(to_put, 3, f, cb)
                else
                    to_get = (a for a in optimal_stream(remote_files) when a not in local_files)
                    dbg("get: from database to local: #{misc.to_json(to_get)}")
                    f = (name, cb) =>
                        @chunked_storage.get
                            name     : name
                            filename : @stream_path + '/' + name
                            cb       : cb
                    async.mapLimit(to_get, 3, f, cb)
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
        is_project_new mesg.project_id, (err, is_new) ->
            if err
                socket.write_mesg('json', message.error(error:err, id:id))
                return

            project = get_project(mesg.project_id)

            if is_new
                project.mnt = "/projects/#{mesg.project_id}"

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

exports.database = () ->
    return database

up_since = undefined
init_up_since = (cb) ->
    fs.readFile "/proc/uptime", (err, data) ->
        if err
            cb(err)
        else
            up_since = cassandra.seconds_ago(misc.split(data.toString())[0])
            cb()

compute_id = undefined

init_compute_id = (cb) ->
    # sudo zfs create storage/conf; sudo chown salvus. /storage/conf
    file = "/storage/conf/compute_id"
    fs.exists file, (exists) ->
        if not exists
            compute_id = uuid.v4()
            fs.writeFile file, compute_id, (err) ->
                if err
                    winston.debug("Error writing compute_id file!")
                    cb(err)
                else
                    # this also ensures /storage/conf/ is mounted...
                    winston.debug("Wrote new compute_id =#{compute_id}")
                    cb()
        else
            fs.readFile file, (err, data) ->
                if err
                    cb(err)
                else
                    compute_id = data.toString()
                    cb()

update_register_with_database = () ->
    database.update
        table : 'compute_hosts'
        set   : {port : program.port, up_since:up_since}
        where : {dummy:true, compute_id:compute_id}
        ttl   : REGISTRATION_TTL_S
        cb    : (err) ->
            return  # not needed and too verbose
            if err
                winston.debug("error registering storage server with database: #{err}")
            else
                winston.debug("registered with database")

register_with_database = (cb) ->
    database.update
        table : 'compute_hosts'
        set   : {host:program.address}
        where : {dummy:true, compute_id:compute_id}
        cb    : (err) ->
            if err
                winston.debug("error registering storage server #{compute_id} with database: #{err}")
            else
                winston.debug("registered storage server #{compute_id} with database")
                update_register_with_database()
                setInterval(update_register_with_database, REGISTRATION_INTERVAL_S*1000)
            cb(err)

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
        fs.writeFile(program.portfile, program.port, cb)
        winston.debug("listening on #{program.address}:#{program.port}")
        misc.retry_until_success
            f         : register_with_database
            max_tries : 100
            max_delay : 5000

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

exports.connect_to_database = connect_to_database = (cb) ->
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
    async.series [init_compute_id, init_up_since, read_password, connect_to_database, start_tcp_server], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")



###########################
## Client -- code below mainly sets up a connection to a given storage server
###########################

get_host_and_port = (compute_id, cb) ->
    winston.debug("getting host and port for server #{compute_id}...")
    async.series [read_password, connect_to_database], (err) ->
        if err
            cb(err)
        else
            database.select_one
                table     : 'compute_hosts'
                where     : {dummy:true, compute_id:compute_id}
                columns   : ['port', 'host']
                objectify : true
                cb        : (err, result) ->
                    if err or not result.port?
                        winston.debug("#{compute_id} is not running right now")
                        cb(err)
                    else
                        result.host = cassandra.inet_to_str(result.host)
                        console.log("result=",result)
                        winston.debug("got location of #{compute_id} --   #{result.host}:#{result.port}")
                        cb(undefined, result)


class Client
    constructor: (@compute_id, @verbose) ->

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("storage Client(#{@host}:#{@port}).#{f}(#{misc.to_json(args)}): #{m}")

    connect: (cb) =>
        dbg = (m) => winston.debug("Storage client (#{@host}:#{@port}): #{m}")
        async.series([
            (cb) =>
                if not @port?
                    dbg("get host and port")
                    get_host_and_port @compute_id, (err, host_and_port) =>
                        if err
                            cb(err)
                        else
                            @host = host_and_port.host
                            @port = host_and_port.port
                            cb()
                else
                    cb()
            (cb) =>
                dbg("ensure password")
                read_password(cb)
            (cb) =>
                dbg("connect to locked socket")
                misc_node.connect_to_locked_socket
                    host    : @host
                    port    : @port
                    token   : password
                    timeout : 20
                    cb      : (err, socket) =>
                        if err
                            dbg("failed to connect: #{err}")
                            @socket = undefined
                            cb(err)
                        else
                            dbg("successfully connected")
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
            timeout : 300
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
                        mesg.project_id = opts.mesg.project_id
                        if mesg.event == 'error'
                            opts.cb?(mesg.error)
                        else
                            delete mesg.id
                            opts.cb?(undefined, mesg)

    action: (opts) =>
        opts = defaults opts,
            action     : required    # 'sync', 'create', 'mount', 'save', 'snapshot', 'close'
            param      : undefined
            project_id : undefined   # a single project id
            project_ids: undefined   # or a list of project ids -- in which case, do the actions in parallel with limit at once
            timeout    : TIMEOUT   # different defaults depending on the action
            limit      : 3
            cb         : undefined

        errors = {}
        f = (project_id, cb) =>
            @call
                mesg    : @mesg(project_id, opts.action, opts.param)
                timeout : opts.timeout
                cb      : (err, result) =>
                    if err
                        errors[project_id] = err
                    cb(undefined, result)

        if opts.project_id?
            f(opts.project_id, (ignore, result) => opts.cb?(errors[opts.project_id], result))

        if opts.project_ids?
            async.mapLimit opts.project_ids, opts.limit, f, (ignore, results) =>
                if misc.len(errors) == 0
                    errors = undefined
                opts.cb?(errors, results)

get_available_compute_host = (opts) ->
    opts = defaults opts,
        host : undefined
        cb   : required
    # choose an optimal available host.
    x = undefined
    async.series([
        (cb) ->
            read_password(cb)
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            where = {dummy:true}
            if opts.host?
                where.host = opts.host
            database.select
                table     : 'compute_hosts'
                columns   : ['compute_id', 'host', 'port', 'up_since', 'health']
                where     : where
                objectify : true
                cb        : (err, results) ->
                    if err
                        cb(err)
                    else
                        r = ([x.health, x] for x in results when x.port? and x.host? and x.up_since?)
                        r.sort()
                        if r.length == 0
                            cb("no available hosts")
                        else
                            # TODO: currently just ignoring health...  Can't just take the healthiest either
                            # since that one would get quickly overloaded, so be careful!
                            x = misc.random_choice(r)[1]
                            winston.debug("got host with compute_id=#{x.compute_id}")
                            cb(undefined)
    ], (err) -> opts.cb(err, x))


client_cache = {}

exports.client = (opts) ->
    opts = defaults opts,
        compute_id : undefined
        host       : undefined
        verbose    : true
        cb         : required
    dbg = (m) -> winston.debug("client(#{opts.compute_id},#{opts.hostname}): #{m}")
    dbg()
    C = undefined
    async.series([
        (cb) ->
            if opts.compute_id?
                cb()
            else
                dbg("determine a compute_id....")
                get_available_compute_host
                    host : opts.host
                    cb   : (err, result) ->
                        if err
                            cb(err)
                        else
                            dbg("got compute_id = #{result.compute_id}")
                            opts.compute_id = result.compute_id
                            cb()
        (cb) ->
            C = client_cache[opts.compute_id]
            if not C?
                C = client_cache[opts.compute_id] = new Client(opts.compute_id, opts.verbose)
            cb()
    ], (err) -> opts.cb(err, C))


###########################
## Client-side view of a project
###########################

class ClientProject
    constructor: (@project_id) ->


program.usage('[start/stop/restart/status] [options]')

    .option('--pidfile [string]', 'store pid in this file', String, "#{DATA}/logs/storage_server.pid")
    .option('--logfile [string]', 'write log to this file', String, "#{DATA}/logs/storage_server.log")
    .option('--portfile [string]', 'write port number to this file', String, "#{DATA}/logs/storage_server.port")

    .option('--debug [string]', 'logging debug level (default: "" -- no debugging output)', String, 'debug')

    .option('--port [integer]', 'port to listen on (default: OS-assigned)', String, '0')
    .option('--address [string]', 'address to listen on (default: the tinc network)', String, '')

    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster (default: hard coded)', String, '')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "storage")', String, 'storage')
    .option('--username [string]', 'Cassandra username to use (default: "storage_server")', String, 'storage_server')
    .option('--consistency [number]', 'Cassandra consistency level (default: 2)', String, '2')

    .option('--stream_path [string]', 'Path where streams are stored (default: /storage/streams)', String, '/storage/streams')
    .option('--pool [string]', 'Storage pool used for images (default: storage)', String, 'storage')
    .parse(process.argv)

if not program.address
    program.address = require('os').networkInterfaces().tun0[0].address
    if not program.address
        console.log("No tinc network: you must specify --address")
        return

if not program.database_nodes
    v = program.address.split('.')
    a = parseInt(v[1]); b = parseInt(v[3])
    if a == 1 and b>=1 and b<=7
        program.database_nodes = ("10.1.#{i}.1" for i in [1..7]).join(',')
    else if a == 1 and b>=10 and b<=21
        program.database_nodes = ("10.1.#{i}.1" for i in [10..21]).join(',')
    else if a == 3
        # for now, until the new data center's nodes are spun up:
        program.database_nodes = ("10.1.#{i}.1" for i in [1..7]).join(',')
        # once the new cassandra nodes at Google are up to date:
        #program.database_nodes = ("10.3.#{i}.1" for i in [1..4])

main = () ->
    if program.debug
        winston.remove(winston.transports.Console)
        winston.add(winston.transports.Console, level: program.debug)


    winston.debug "Running as a Daemon"
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error("Uncaught exception: #{err}")
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

if program._name == 'storage_server.js'
    main()


