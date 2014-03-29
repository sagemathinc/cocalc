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
cql       = require("node-cassandra-cql")
HashRing  = require 'hashring'

{defaults, required} = misc

REGISTRATION_INTERVAL_S = 15       # register with the database every this many seconds
REGISTRATION_TTL_S      = 60       # ttl for registration record

TIMEOUT = 12*60*60  # very long for testing -- we *want* to know if anything ever locks

CONF = "/storage/conf"
fs.chmod(CONF, 0o700)     # just in case...

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
        command : "sudo"
        args    : ["/usr/local/bin/bup_storage.py"].concat(opts.args)
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
        if mesg.action == 'server_id'
            mesg.server_id = server_id
            socket.write_mesg('json', mesg)
        else
            t = misc.walltime()
            if mesg.action == 'sync'
                if not mesg.param?
                    mesg.param = []
                mesg.param.push(program.server_id)
                mesg.param.push(program.servers_file)
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

server_id = undefined

init_server_id = (cb) ->
    # sudo zfs create storage/conf; sudo chown salvus. /storage/conf
    file = program.server_id_file
    fs.exists file, (exists) ->
        if not exists
            server_id = uuid.v4()
            fs.writeFile file, server_id, (err) ->
                if err
                    winston.debug("Error writing server_id file!")
                    cb(err)
                else
                    winston.debug("Wrote new server_id =#{server_id}")
                    cb()
        else
            fs.readFile file, (err, data) ->
                if err
                    cb(err)
                else
                    server_id = data.toString()
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

    get_port = (c) ->
        if program.port
            c()
        else
            # attempt once to use the same port as in port file, if there is one
            fs.exists program.portfile, (exists) ->
                if not exists
                    program.port = 0
                    c()
                else
                    fs.readFile program.portfile, (err, data) ->
                        if err
                            program.port = 0
                            c()
                        else
                            program.port = data.toString()
                            c()
    listen = (c) ->
        winston.debug("trying port #{program.port}")
        server.listen program.port, program.address, (err) ->
            if err
                winston.debug("failed to listen to #{program.port} -- #{err}")
                c(err)
            else
                program.port = server.address().port
                fs.writeFile(program.portfile, program.port, cb)
                winston.debug("listening on #{program.address}:#{program.port}")
                c()
    get_port () ->
        listen (err) ->
            if err
                winston.debug("fail so let OS assign port...")
                program.port = 0
                listen()


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
                    require('crypto').randomBytes 64, (ex, buf) ->
                        secret_token = buf.toString('base64')
                        fs.writeFile(program.secret_file, secret_token, cb)

        # Ensure restrictive permissions on the secret token file.
        (cb) ->
            fs.chmod(program.secret_file, 0o600, cb)
    ], cb)


start_server = () ->
    winston.debug("start_server")
    async.series [init_server_id, init_up_since, read_secret_token, start_tcp_server], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")


###########################
## GlobalClient -- client for working with *all* storage/compute servers
###########################

VNODES = 128 # hard coded -- do not change

class GlobalClient
    constructor: (opts) ->
        opts = defaults opts,
            database : required   # connection to cassandra database
            replication_factor : 2
            cb       : required   # cb(err) -- called when initialized
        @database = opts.database
        @replication_factor = opts.replication_factor
        @_update(opts.cb)
        setInterval(@_update, 1000*60*3)  # update every few minutes

    _update: (cb) =>
        @database.select
            table     : 'storage_servers'
            columns   : ['server_id', 'host', 'port', 'dc', 'health', 'secret']
            objectify : true
            where     : {dummy:true}
            cb        : (err, results) =>
                if err
                    cb?(err); return
                @servers = {}
                x = {}
                for r in results
                    @servers[x.server_id] = r
                    if not x[r.dc]?
                        x[r.dc] = {}
                    v = x[r.dc]
                    v[r.server_id] = {vnodes:VNODES}
                for dc, obj of x
                    @hashrings[dc] = new HashRing(obj)

    score: (opts) =>
        opts = defaults opts,
            healthy   : undefined     # list of server_ids we have found to be healthy
            unhealthy : undefined     # list of server_ids we have found to be unhealthy
            cb        : undefined     # cb(err)
        s = []
        if opts.healthy?
            s = s.extend(opts.healthy)
        else
            opts.healthy = []
        if opts.unhealthy?
            s = s.extend(opts.unhealthy)
        else
            opts.unhealthy = []
        if s.length == 0
            opts.cb?(); return
        @database.select
            table     : 'storage_servers'
            columns   : ['server_id', 'health']
            objectify : true
            where     : {dummy:true, server_id:{'in':s}}
            cb        : (err, results) =>
                f = (result, cb) =>
                    # TODO: replace formula before by what's done in gossip/cassandra, which is provably sensible.
                    # There is definitely a potential for "race conditions" below, but it doesn't matter -- it is just health.
                    if result.server_id in opts.healthy
                        if not result.health?
                            result.health = 1
                        else
                            result.health = (result.health + 1)/2.0
                    else if result.server_id in opts.unhealthy
                        if not result.health?
                            result.health = 0
                        else
                            result.health = (result.health + 0)/2.0
                    @database.update
                        table : 'storage_servers'
                        set   : {health:result.health}
                        where : {dummy:true, server_id:result.server_id}
                        cb    : cb
                async.map(results, f, (err) => opts.cb?(err))


    replicas: (opts) =>
        opts = defaults opts,
            project_id         : required
            replication_factor : undefined
        if not opts.replication_factor?
            opts.replication_factor = @replication_factor
        if typeof(opts.replication_factor) == 'number'
            rep = (opts.replication_factor for i in [0...@datacenters.length])
        else
            rep = opts.replication_factor
        v = []
        for dc, hr of @hashrings
            for id in hr.range(opts.project_id, rep[i])
                v.push(id)
        return v

    create_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required   # cb(err, Project client connection on some host)
        dbg = (m) => winston.debug("GlobalClient.project(#{opts.project_id}): #{m}")


    storage_server: (opts) =>
        opts = defaults opts,
            server_id : required
            cb        : required
        if not @servers[opts.server_id]?
            opts.cb("server #{opts.server_id} unknown")
            return
        s = @servers[opts.server_id]
        if not s.host?
            opts.cb("no hostname known for #{opts.server_id}")
            return
        if not s.port?
            opts.cb("no port known for #{opts.server_id}")
            return
        if not s.secret?
            opts.cb("no secret token known for #{opts.server_id}")
            return
        opts.cb(undefined, exports.storage_server_client(host:s.host, port:s.port, secret:s.secret))

    project: (opts) =>
        opts = defaults opts,
            project_id : required
            server_id  : undefined  # if undefined gets best working client pre-started; if defined connect if possible but don't start anything
            replication_factor : undefined
            cb         : required   # cb(err, Project client connection on some host)
        dbg = (m) => winston.debug("GlobalClient.project(#{opts.project_id}): #{m}")
        dbg()

        if opts.server_id?
            dbg("open on a specified client")
            @storage_server
                server_id : opts.server_id
                cb        : (err, s) =>
                    if err
                        opts.cb(err); return
                    s.project
                        project_id : opts.project_id
                        cb         : opts.cb
            return

        bup_location = undefined
        project      = undefined
        works        = undefined
        status       = undefined
        errors       = {}
        async.series([
            (cb) =>
                dbg("get current bup location in database")
                @database.select_one
                    table     : 'projects'
                    where     : {project_id : opts.project_id}
                    columns   : ['bup_location']
                    objectify : false
                    cb        : (err, result) =>
                        if err
                            cb(err)
                        else
                            bup_location = result[0]
                            cb()
            (cb) =>
                if not bup_location?
                    dbg("no current location")
                    cb()
                else
                    dbg("there is current location (=#{bup_location}) and project is working at current location, use it")
                    @project
                        project_id : opts.project_id
                        server_id  : bup_location
                        cb         : (err, _project) =>
                            if not err
                                project = _project
                            cb()
            (cb) =>
                if not project?
                    dbg("no accessible project currently started...")
                    cb()
                else
                    dbg("if project will start at current location, use it")
                    project.works (err, _works) =>
                        if err
                            project = undefined
                            cb()
                        else
                            works = works
            (cb) =>
                if works
                    cb(); return
                dbg("try harder: get list of all replicas (except current) and ask in parallel about status of each")
                @project_status
                    project_id         : opts.project_id
                    replication_factor : opts.replication_factor
                    cb                 : (err, _status) =>
                        if err
                            cb(err)
                        else
                            status = _status
                            cb()
            (cb) =>
                if works
                    cb(); return
                dbg("until success, choose one that responded with best status and try to start there")
                # remove those with error getting status
                for x in status
                    if x.error
                        errors[x.replica_id] = x.error
                    else if x.status?.bup != 'working'
                        errors[x.replica_id] = 'bup not working'
                status = (x.replica_id for x in status when not x.error and x.status?.bup == 'working')
                f = (replica_id, cb) =>
                    if works
                        cb(); return
                    @project
                        project_id : opts.project_id
                        server_id  : replica_id
                        cb         : (err, _project) =>
                            if err
                                dbg("error trying to open project on #{replica_id} -- #{err}")
                                cb(); return # skip to next
                            _project.restart
                                cb : (err) =>
                                    if not err
                                        project = _project
                                        bup_location = replica_id
                                        works = true
                                    else
                                        errors[replica_id] = err
                                        dbg("error trying to start project on #{replica_id} -- #{err}")
                                    cb()
                async.series(status, f, (err) => cb())
            (cb) =>
                if works and project? and bup_location?
                    dbg("succeeded at opening the project at #{bup_location} -- now recording this in DB")
                    @database.update
                        table : 'projects'
                        where : {project_id   : opts.project_id}
                        set   : {bup_location : bup_location}
                        cb    : cb
                else
                    cb("unable to open project anywhere")
        ], (err) =>
            if err
                opts.cb("unable to deploy project anywhere -- #{err}, #{misc.to_json(errors)}")
            else
                opts.cb(undefined, project)
        )

    project_status : (opts) =>
        opts = defaults opts,
            project_id         : required
            replication_factor : undefined
            timeout            : 20   # seconds
            cb                 : required    # cb(err, sorted list of status objects)
        status = []
        f = (replica, cb) =>
            s = {replica_id:replica}
            status.push(s)
            @project
                project_id : opts.project_id
                server_id  : replica
                cb         : (err, project) =>
                    if err
                        s.error = err
                        cb()
                    else
                        project.status
                            timeout : opts.timeout
                            cb      : (err, status) =>
                                if err
                                    @score(unhealthy : [replica])
                                    opts.cb(err, project)
                                    s.error = err
                                    cb()
                                else
                                    @score(healthy   : [replica])
                                    s.status = status
                                    cb()
        async.map @replica(project_id:opts.project_id), f, (err) =>
            status.sort (a,b) =>
                if a.error? and not b.error
                    # b is better
                    return 1
                if b.error? and not a.error?
                    # a is better
                    return -1
                # sort of arbitrary -- mainly care about newest snapshot being newer = better = -1
                if a.newest_snapshot?
                    if not b.newest_snapshot?
                        # a is better
                        return -1
                    else if a.newest_snapshot > b.newest_snapshot
                        # a is better
                        return -1
                    else if a.newest_snapshot < b.newest_snapshot
                        # b is better
                        return 1
                else
                    if b.newest_snapshot?
                        # b is better
                        return 1
                # Next compare health of server
                health_a = @servers[a.replica_id]?.health
                health_b = @servers[b.replica_id]?.health
                if health_a? and health_b?
                    health_a = Math.round(5*health_a)
                    health_b = Math.round(5*health_b)
                    if health_a < health_b
                        # b is better
                        return 1
                    else if health_a > health_b
                        # a is better
                        return -1
                # no error, so load must be defined
                # smaller load is better -- later take into account free RAM, etc...
                if a.load[0] < b.load[0]
                    return -1
                else if a.load[0] > b.load[0]
                    return 1

                return 0

            opts.cb(undefined, status)







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

exports.storage_sever_client = (opts) ->
    opts = defaults opts,
        host    : required
        port    : required
        secret  : required
        verbose : true
    dbg = (m) -> winston.debug("storage_server_client(#{opts.host}:#{opts.port}): #{m}")
    dbg()
    C = client_cache[opts.host]
    if C?
        if C.port != opts.port
            C.port = opts.port   # port changed
            C.socket = undefined
    else
        C = client_cache[opts.host] = new Client(host:opts.host, port:opts.port, verbose:opts.verbose)
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

    status: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : required
        opts.action = 'status'
        @action(opts)

    stop: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'stop'
        @action(opts)


    restart: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'restart'
        @action(opts)

    save: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'save'
        @action(opts)

    init: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : undefined
        opts.action = 'init'
        @action(opts)

    snapshots: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            cb         : required
        opts.action = 'snapshots'
        @action(opts)

    replicas: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            add        : undefined   # string or array of server id's
            remove     : undefined   # string or array of server ids
            cb         : undefined   # cb(err, array of server ids)
        param = []
        for x in ['add', 'remove']
            if opts[x]?
                param.push("--#{x}")
                if typeof opts[x] == 'string'
                    param.push(opts[x])
                else
                    param.push(opts[x].join(','))

        @action
            timeout : opts.timeout
            action  : 'replicas'
            param   : param
            cb      : opts.cb


    account_settings: (opts) =>
        opts = defaults opts,
            timeout    : TIMEOUT
            memory     : undefined
            cpu_shares : undefined
            cores      : undefined
            disk       : undefined
            inode      : undefined
            login_shell: undefined
            cb         : undefined

        param = []
        for x in ['memory', 'cpu_shares', 'cores', 'disk', 'inode', 'login_shell']
            if opts[x]?
                param.push("--#{x}")
                param.push(opts[x])
        @action
            timeout : opts.timeout
            action  : 'account_settings'
            param   : param
            cb      : opts.cb

    sync: (opts) =>
        opts = defaults opts,
            timeout            : TIMEOUT
            destructive        : false
            replication_factor : 2    # number of replicas per datacenter; alternatively, given [2,1,3] would mean "2" in dc0, 1 in dc1, etc
            cb                 : undefined
        params = ['--replication_factor', opts.replication_factor]
        if opts.destructive
            params.push('--destructive')
        @action
            action  : 'sync'
            param   : params
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
    .option('--server_id_file [string]', 'file in which server_id is stored', String, "#{CONF}/bup_server_id")
    .option('--servers_file [string]', 'contains JSON mapping {uuid:hostname,...} for all servers', String, "#{CONF}/bup_servers")
    .option('--secret_file [string]', 'write secret token to this file', String, "#{CONF}/bup_server.secret")

    .option('--debug [string]', 'logging debug level (default: "" -- no debugging output)', String, 'debug')
    .option('--replication [string]', 'replication factor (default: 2)', String, '2')

    .option('--port [integer]', "port to listen on (default: assigned by OS)", String, 0)
    .option('--address [string]', 'address to listen on (default: the tinc network or 127.0.0.1 if no tinc)', String, '')

    .parse(process.argv)

program.port = parseInt(program.port)

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


