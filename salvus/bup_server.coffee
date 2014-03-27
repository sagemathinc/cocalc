#################################################################
#
# bup_server -- a node.js program that provides a TCP server
# that is used by the hubs to organize project storage
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
cql     = require("node-cassandra-cql")
{defaults, required} = misc

DEFAULT_PORT = 912

REGISTRATION_INTERVAL_S = 15       # register with the database every this many seconds
REGISTRATION_TTL_S      = 60       # ttl for registration record

TIMEOUT = 12*60*60  # very long for testing -- we *want* to know if anything ever locks


DATA = 'data'


###########################
## server-side: Storage server code
###########################

# Execute a command using the bup_storage script.
_bup_storage_no_queue = (opts) =>
    opts = defaults opts,
        args    : required
        timeout : TIMEOUT
        cb      : required
    winston.debug("_bup_storage_no_queue: running #{misc.to_json(opts.args)}")
    misc_node.execute_code
        command : "bup_storage.py"
        args    : opts.args
        timeout : opts.timeout
        cb      : (err, output) =>
            winston.debug("_bup_storage_no_queue: finished running #{misc.to_json(opts.args)} -- #{err}")
            if err
                if output?.stderr
                    opts.cb(output.stderr)
                else
                    opts.cb(err)
            else
                opts.cb(undefined, if output.stdout then misc.from_json(output.stdout) else undefined)

_bup_storage_queue = []
_bup_storage_queue_running = 0

bup_storage = (opts) =>
    opts = defaults opts,
        args    : required
        timeout : TIMEOUT
        cb      : required
    _bup_storage_queue.push(opts)
    process_bup_storage_queue()

process_bup_storage_queue = () ->
    winston.debug("process_bup_storage_queue: _bup_storage_queue_running=#{_bup_storage_queue_running}; _bup_storage_queue.length=#{_bup_storage_queue.length}")
    if _bup_storage_queue.length > 0
        opts = _bup_storage_queue.shift()
        _bup_storage_queue_running += 1
        cb = opts.cb
        opts.cb = (err, output) =>
            _bup_storage_queue_running -= 1
            process_bup_storage_queue()
            cb(err, output)
        _bup_storage_no_queue(opts)


# A project from the point of view of the storage server
class Project
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required
            verbose    : true

        @_action_queue   = []
        @project_id      = opts.project_id
        @verbose         = opts.verbose

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("Project(#{@project_id}).#{f}(#{misc.to_json(args)}): #{m}")

    exec: (opts) =>
        opts = defaults opts,
            args    : required
            timeout : TIMEOUT
            cb      : required

        args = []
        for a in opts.args
            args.push(a)
        args.push(@project_id)

        @dbg("exec", opts.args, "executing bup_storage.py script")
        bup_storage
            args    : args
            timeout : opts.timeout
            cb      : opts.cb

    action: (opts) =>
        cb = opts.cb
        start_time = cassandra.now()
        t = misc.walltime()
        @_enque_action(opts)

    _enque_action: (opts) =>
        if not opts?
            # doing that would be bad.
            return
        @_action_queue.push(opts)
        @_process_action_queue()

    _process_action_queue: () =>
        if @_action_queue_current?
            return
        if @_action_queue.length > 0
            opts = @_action_queue.shift()
            @_action_queue_current = opts
            cb = opts.cb
            opts.cb = (err,x,y,z) =>
                delete @_action_queue_current
                if err
                    # clear the queue
                    for o in @_action_queue
                        o.cb?("earlier action '#{o.action}' failed -- #{err}")
                    @_action_queue = []
                else
                    @_process_action_queue()
                cb?(err,x,y,z)
            @_action(opts)

    delete_queue: () =>  # DANGEROUS -- ignores anything "in progress"
        @_action_queue = []
        @_action_queue_running = 0
        delete @_action_queue_current

    _action: (opts) =>
        opts = defaults opts,
            action  : required    # 'sync', 'create', 'mount', 'save', 'snapshot', 'close'
            param   : undefined   # if given, should be an array or string
            timeout : TIMEOUT
            cb      : undefined   # cb?(err)
        dbg = (m) => @dbg("_action", opts, m)
        dbg()
        switch opts.action
            when "queue"
                q = {queue:({action:x.action, param:x.param} for x in @_action_queue) }
                if @_action_queue_current?
                    q.current = {action:@_action_queue_current.action, param:@_action_queue_current.param}
                dbg("returning the queue -- #{misc.to_json(q)}")
                opts.cb?(undefined, q)
            when "delete_queue"
                dbg("deleting the queue")
                @delete_queue()
                opts.cb?()
            else
                dbg("Doing action #{opts.action} that involves executing script")
                args = [opts.action]
                if opts.param?
                    if typeof opts.param == 'string'
                        opts.param = misc.split(opts.param)  # turn it into an array
                    args = args.concat(opts.param)
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
    id = mesg.id
    if mesg.event == 'storage'
        if mesg.action == 'compute_id'
            mesg.compute_id = server_compute_id
            socket.write_mesg('json', mesg)
        else
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
        socket.write_mesg('json', message.error(id:id, error:"unknown event type: '#{mesg.event}'"))

up_since = undefined
init_up_since = (cb) ->
    fs.readFile "/proc/uptime", (err, data) ->
        if err
            cb(err)
        else
            up_since = cassandra.seconds_ago(misc.split(data.toString())[0])
            cb()

server_compute_id = undefined

init_compute_id = (cb) ->
    # sudo zfs create storage/conf; sudo chown salvus. /storage/conf
    file = program.compute_id_file
    fs.exists file, (exists) ->
        if not exists
            server_compute_id = uuid.v4()
            fs.writeFile file, server_compute_id, (err) ->
                if err
                    winston.debug("Error writing compute_id file!")
                    cb(err)
                else
                    winston.debug("Wrote new compute_id =#{server_compute_id}")
                    cb()
        else
            fs.readFile file, (err, data) ->
                if err
                    cb(err)
                else
                    server_compute_id = data.toString()
                    cb()


bup_queue_len = () ->
    n = _bup_storage_queue.length + _bup_storage_queue_running
    #winston.debug("bup_queue_len = #{n} = #{_bup_storage_queue.length} + #{_bup_storage_queue_running} ")
    return n


start_tcp_server = (cb) ->
    winston.info("starting tcp server...")

    server = net.createServer (socket) ->
        winston.debug("received connection")
        socket.id = uuid.v4()
        misc_node.unlock_socket socket, secret_token, (err) ->
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

secret_token = undefined
read_secret_token = (cb) ->
    if secret_token?
        cb()
        return
    winston.debug("read_secret_token")

    async.series([
        # Read or create the file; after this step the variable secret_token
        # is set and the file exists.
        (cb) ->
            fs.exists program.secret_file, (exists) ->
                if exists
                    winston.debug("read '#{program.secret_file}'")
                    fs.readFile program.secret_file, (err, buf) ->
                        secret_token = buf.toString().trim()
                        cb()
                else
                    winston.debug("create '#{program.secret_file}'")
                    require('crypto').randomBytes  64, (ex, buf) ->
                        secret_token = buf.toString('base64')
                        fs.writeFile(program.secret_file, secret_token, cb)

        # Ensure restrictive permissions on the secret token file.
        (cb) ->
            fs.chmod(program.secret_file, 0o600, cb)
    ], cb)


start_server = () ->
    winston.debug("start_server")
    async.series [init_compute_id, init_up_since, read_secret_token, start_tcp_server], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")



###########################
## Client -- code below mainly sets up a connection to a given storage server
###########################


class Client
    constructor: (opts) ->
        opts = defaults opts,
            host : required
            port : required
            verbose : required
        @host = opts.host
        @port = opts.port
        @verbose = opts.verbose

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("storage Client(#{@host}:#{@port}).#{f}(#{misc.to_json(args)}): #{m}")

    connect: (cb) =>
        dbg = (m) => winston.debug("Storage client (#{@host}:#{@port}): #{m}")
        dbg()
        async.series([
            (cb) =>
                dbg("ensure secret_token")
                read_secret_token(cb)
            (cb) =>
                dbg("connect to locked socket")
                misc_node.connect_to_locked_socket
                    host    : @host
                    port    : @port
                    token   : secret_token
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
                    @connect (err) =>
                        if err
                            opts.cb?(err)
                            cb(err)
                        else
                            cb()
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
            action     : required
            param      : undefined
            project_id : undefined   # a single project id
            project_ids: undefined   # or a list of project ids -- in which case, do the actions in parallel with limit at once
            timeout    : TIMEOUT     # different defaults depending on the action
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

    project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        client_project
            client     : @
            project_id : opts.project_id
            cb         : opts.cb

client_cache = {}

exports.client = (opts) ->
    opts = defaults opts,
        host       : required
        port       : DEFAULT_PORT
        verbose    : true
    dbg = (m) -> winston.debug("client(#{opts.compute_id},#{opts.hostname}): #{m}")
    dbg()
    C = client_cache[opts.compute_id]
    if not C?
        C = client_cache[opts.compute_id] = new Client(host:opts.host, port:opts.port, verbose:opts.verbose)
    return C


class ClientProject
    constructor: (@client, @project_id) ->
        @dbg("constructor",[],"")

    dbg: (f, args, m) =>
        winston.debug("storage ClientProject(#{@project_id}).#{f}(#{misc.to_json(args)}): #{m}")

    action: (opts) =>
        opts = defaults opts,
            action     : required
            param      : undefined
            timeout    : TIMEOUT
            cb         : undefined
        opts.project_id = @project_id
        @client.action(opts)

    start: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'start'
        @action(opts)

    kill: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'kill'
        @action(opts)

    save: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'save'
        @action(opts)

    sync: (opts) =>
        opts = defaults opts,
            remote     : required
            timeout    : TIMEOUT
            destructive : false
            cb         : undefined
        if opts.destructive
            param = ' --destructive '
        else
            param = ' '
        @action
            action  : 'sync'
            param   : param + ' ' + opts.remote
            timeout : TIMEOUT
            cb      : opts.cb


client_project_cache = {}

client_project = (opts) ->
    opts = defaults opts,
        client     : required
        project_id : required
        cb         : required
    if not misc.is_valid_uuid_string(opts.project_id)
        opts.cb("invalid project id")
        return
    P = client_project_cache[opts.project_id]
    if not P?
        P = client_project_cache[opts.project_id] = new ClientProject(opts.client, opts.project_id)
    opts.cb(undefined, P)


###########################
## Command line interface
###########################

program.usage('[start/stop/restart/status] [options]')

    .option('--pidfile [string]', 'store pid in this file', String, "#{DATA}/logs/bup_server.pid")
    .option('--logfile [string]', 'write log to this file', String, "#{DATA}/logs/bup_server.log")
    .option('--portfile [string]', 'write port number to this file', String, "#{DATA}/logs/bup_server.port")
    .option('--compute_id_file [string]', 'write (or read) compute id to this file', String, "#{DATA}/logs/bup_compute_id")
    .option('--secret_file [string]', 'write secret token to this file', String, "#{DATA}/logs/bup_secret")

    .option('--debug [string]', 'logging debug level (default: "" -- no debugging output)', String, 'debug')
    .option('--replication [string]', 'replication factor (default: 2)', String, '2')

    .option('--port [integer]', "port to listen on (default: #{DEFAULT_PORT})", String, DEFAULT_PORT)
    .option('--address [string]', 'address to listen on (default: the tinc network or 127.0.0.1 if no tinc)', String, '')

    .parse(process.argv)

if not program.address
    program.address = require('os').networkInterfaces().tun0?[0].address
    if not program.address
        program.address = '127.0.0.1'

main = () ->
    if program.debug
        winston.remove(winston.transports.Console)
        winston.add(winston.transports.Console, level: program.debug)

    winston.debug "Running as a Daemon"
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error("Uncaught exception: #{err}")
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

if program._name == 'bup_server.js'
    main()


