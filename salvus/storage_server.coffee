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
cql     = require("node-cassandra-cql")
{defaults, required} = misc

STATE_CONSISTENCY = cql.types.consistencies.two

REGISTRATION_INTERVAL_S = 15       # register with the database every this many seconds
REGISTRATION_TTL_S      = 60       # ttl for registration record

#TIMEOUT = 30*60   # default timeout on all locking zvol_storage operations (most use ZFS).

TIMEOUT = 12*60*60  # very long for testing -- we *want* to know if anything ever locks


ZVOL_EXTENSION = '.zvol.lz4'

DATA = 'data'

database = undefined  # defined during connect_to_database
password = undefined  # defined during connect_to_database


# TEMPORARY -- for migration
# TODO: DELETE this whole select thing once we finish migration!
is_project_new = exports.is_project_new = (project_id, cb) ->   #  cb(err, true if project should be run using the new storage system)
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

# We limit the maximum number of simultaneous zvol_storage.py calls to allow at once, since
# this allows us to control ZFS contention, deadlocking, etc.
# This is *CRITICAL*.  For better or worse, ZFS is incredibly broken when you try to do
# multiple operations on a pool at once.  It's really sad.

# But one at a time definitely works fine (extensively tested.)
ZVOL_STORAGE_LIMIT = 1

# I'm going to do some testing with bigger values while doing the migration just to see what happens.
# It's good to know before we go to production.
# tried this and pretty quickly got massive slowdown... in throughput.
#ZVOL_STORAGE_LIMIT = 9999

# Execute a command using the zvol_storage script.
_zvol_storage_no_queue = (opts) =>
    opts = defaults opts,
        args    : required
        timeout : TIMEOUT
        cb      : required
    winston.debug("_zvol_storage_no_queue: running #{misc.to_json(opts.args)}")
    misc_node.execute_code
        command : "zvol_storage.py"
        args    : opts.args
        timeout : opts.timeout
        cb      : (err, output) =>
            winston.debug("_zvol_storage_no_queue: finished running #{misc.to_json(opts.args)} -- #{err}")
            if err
                if output?.stderr
                    opts.cb(output.stderr)
                else
                    opts.cb(err)
            else
                opts.cb()

_zvol_storage_queue = []
_zvol_storage_queue_running = 0

zvol_storage = (opts) =>
    opts = defaults opts,
        args    : required
        timeout : TIMEOUT
        cb      : required
    _zvol_storage_queue.push(opts)
    process_zvol_storage_queue()

process_zvol_storage_queue = () ->
    winston.debug("process_zvol_storage_queue: _zvol_storage_queue_running=#{_zvol_storage_queue_running}; _zvol_storage_queue.length=#{_zvol_storage_queue.length}")
    if _zvol_storage_queue_running >= ZVOL_STORAGE_LIMIT
        return
    if _zvol_storage_queue.length > 0
        opts = _zvol_storage_queue.shift()
        _zvol_storage_queue_running += 1
        update_register_with_database()   # important that queue length is accurate in db, so load balancing is better.
        cb = opts.cb
        opts.cb = (err, output) =>
            _zvol_storage_queue_running -= 1
            process_zvol_storage_queue()
            cb(err, output)
        _zvol_storage_no_queue(opts)


# A project from the point of view of the storage server
class Project
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required
            verbose    : true

        @_action_queue   = []
        @project_id      = opts.project_id
        @verbose         = opts.verbose
        @mnt             = "/projects/#{@project_id}"
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

        @dbg("exec", opts.args, "executing zvol_storage.py script")
        zvol_storage
            args    : args
            timeout : opts.timeout
            cb      : opts.cb

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
                        set = {broken:undefined}  # successful completion of action = not broken anymore, since it worked to do something.
                        set[opts.action] = opts.timestamp
                    when 'export_pool'
                        set = {import_pool: undefined}
                    when 'destroy_image_fs'
                        set = {recv_streams: undefined, import_pool: undefined}
                    when 'destroy_streams'
                        set = {sync_streams: undefined}
                    when 'destroy'
                        set ={recv_streams: undefined, send_streams:undefined, import_pool: undefined, sync_streams: undefined}
                if set?
                    database.update
                        table : 'project_state'
                        set   : set
                        consistency : STATE_CONSISTENCY
                        where : {project_id : @project_id, compute_id : server_compute_id}
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
                        compute_id : server_compute_id
                    where :
                        id        : @project_id
                        timestamp : opts.timestamp
                    json  : ['param', 'error']
                    cb    : cb
        ], (err) => opts.cb?(err))

    action: (opts) =>
        cb = opts.cb
        start_time = cassandra.now()
        t = misc.walltime()
        opts.cb = (err, result) =>
            if opts.action not in ['queue', 'delete_queue']   # actions to not log
                @log_action
                    action    : opts.action
                    param     : opts.param
                    error     : err
                    timestamp : start_time
                    time_s    : misc.walltime(t)
            cb?(err, result)
        if opts.action in ['queue', 'delete_queue', 'open', 'save', 'migrate', 'migrate_clean']   # put at least anything here that is implemented via other calls to action -- or we get a recursive deadlock.
            @_action(opts)
        else
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
            when "migrate"  # temporary -- during migration only!
                dbg("migrating project")
                @migrate(opts.cb)
            when "migrate_clean"  # temporary -- during migration only!
                dbg("migrating project from SCRATCH")
                @migrate_clean(opts.cb)
            when "open"
                dbg("opening project")
                @open(opts.cb)
            when "save"
                dbg("saving project")
                @save(opts.cb)
            when "delete_from_database"  # VERY DANGEROUS -- deletes from the database
                dbg("deleting project from database -- DANGEROUS")
                @delete_from_database(opts.cb)
            when 'sync_put_delete'
                # TODO: disable this action once migration is done -- very dangerous
                dbg("syncing by pushing local -- DANGEROUS")
                @sync_put_delete(opts.cb)
            when 'sync_streams'
                dbg("syncing streams")
                @sync_streams(opts.cb)
            when 'log'
                dbg("getting the log")
                @log
                    max_age_m : opts.param
                    cb        : opts.cb
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

    migrate: (cb) =>
        dbg = (m) => @dbg('migrate',[],m)
        f = (action, cb) =>
            @action
                action : action
                cb     :cb
        steps = ['export_pool', 'sync_streams', 'recv_streams', 'import_pool', 'migrate_snapshots', 'export_pool', 'send_streams', 'sync_put_delete']
        async.map(steps, f, cb)

    migrate_clean: (cb) =>
        @dbg('migrate_clean')
        f = (action, cb) =>
            @action
                action : action
                cb     :cb
        steps = ['destroy', 'create', 'import_pool', 'migrate_snapshots', 'export_pool', 'send_streams', 'sync_put_delete']
        async.map(steps, f, cb)

    open: (cb) =>
        @dbg('open')
        if @_opening?
            @_opening.push(cb)
            return
        @_opening = [cb]
        f = (action, cb) =>
            @action
                action : action
                cb     : cb
        steps = ['sync_streams', 'recv_streams', 'import_pool']
        async.map steps, f, (err, result) =>
            for cb in @_opening
                cb(err, result)
            delete @_opening

    save: (cb) =>
        @dbg('save')
        if @_saving?
            @_saving.push(cb)
            return
        @_saving = [cb]

        f = (action, cb) =>
            @action
                action : action
                cb     : cb
        steps = ['send_streams', 'sync_streams']
        async.map steps, f, (err, result) =>
            for cb in @_saving
                cb(err, result)
            delete @_saving

    delete_from_database: (cb) =>
        @dbg('delete_from_database')
        @chunked_storage.delete_everything(cb:cb)

    sync_put_delete: (cb) =>
        @dbg('sync_put_delete')
        @chunked_storage.sync_put
            delete : true
            path   : @stream_path
            cb     : cb

    sync_streams: (cb) =>
        # Find the optimal sequence of streams with newest end time, either locally or in the database,
        # and make sure it is present in both.
        dbg = (m) => @dbg('sync_streams',[],m)
        dbg()
        put          = undefined
        remote_files = undefined
        local_files  = undefined

        start_sync = cassandra.now()
        async.series([
            (cb) =>
                dbg("get listing of files from database")
                @chunked_storage.ls
                    cb   : (err, files) =>
                        if err
                            cb(err)
                        else
                            remote_files = (f.name for f in files when misc.endswith(f.name, ZVOL_EXTENSION))
                            dbg("remote_files=#{misc.to_json(remote_files)}")
                            cb()
            (cb) =>
                dbg("check for #{@stream_path} and make directory if not there")
                fs.exists @stream_path, (exists) =>
                    if not exists
                        fs.mkdir(@stream_path, 0o700, cb)
                    else
                        cb()
            (cb) =>
                dbg("get files from filesystem")
                fs.readdir @stream_path, (err, files) =>
                    if err
                        cb(err)
                    else
                        local_files = (x for x in files when misc.endswith(x, ZVOL_EXTENSION))
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
                    local_times = (x.slice(0,40).split('--')[1] for x in local_files when misc.endswith(x, ZVOL_EXTENSION))
                    local_times.sort()
                    remote_times = (x.slice(0,40).split('--')[1] for x in remote_files when misc.endswith(x, ZVOL_EXTENSION))
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


exports.optimal_stream = optimal_stream = (v) ->
    # given a array of stream filenames that represent date ranges, of this form:
    #     [UTC date]--[UTC date]ZVOL_EXTENSION
    # find the optimal sequence, i.e., the linear subarray that ends with the newest date,
    # and starts with an empty interval.
    if v.length == 0
        return v
    # get rid of extension
    v = (x.slice(0,40) for x in v)
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
            return (f+ZVOL_EXTENSION for f in w)
        v.shift()  # delete first element -- it's not the end of a valid sequence.


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

server_compute_id = undefined

init_compute_id = (cb) ->
    # sudo zfs create storage/conf; sudo chown salvus. /storage/conf
    file = "/storage/conf/compute_id"
    fs.exists file, (exists) ->
        if not exists
            server_compute_id = uuid.v4()
            fs.writeFile file, server_compute_id, (err) ->
                if err
                    winston.debug("Error writing compute_id file!")
                    cb(err)
                else
                    # this also ensures /storage/conf/ is mounted...
                    winston.debug("Wrote new compute_id =#{server_compute_id}")
                    cb()
        else
            fs.readFile file, (err, data) ->
                if err
                    cb(err)
                else
                    server_compute_id = data.toString()
                    cb()

zfs_queue_len = () ->
    n = _zvol_storage_queue.length + _zvol_storage_queue_running
    #winston.debug("zfs_queue_len = #{n} = #{_zvol_storage_queue.length} + #{_zvol_storage_queue_running} ")
    return n

update_register_with_database = () ->
    database.update
        table : 'compute_hosts'
        set   : {port : program.port, up_since:up_since, zfs_queue_len:zfs_queue_len()}
        where : {dummy:true, compute_id:server_compute_id}
        ttl   : REGISTRATION_TTL_S
        cb    : (err) ->
            if err
                winston.debug("error registering storage server with database: #{err}")
            #else
                #winston.debug("registered with database")

register_with_database = (cb) ->
    database.update
        table : 'compute_hosts'
        set   : {host:program.address}
        where : {dummy:true, compute_id:server_compute_id}
        cb    : (err) ->
            if err
                winston.debug("error registering storage server #{server_compute_id} with database: #{err}")
            else
                winston.debug("registered storage server #{server_compute_id} with database")
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

exports.get_database = get_database = (cb) ->
    async.series([read_password, connect_to_database], (err) -> cb(err, database))

# compute_id = string or array of strings
exports.compute_id_to_host = compute_id_to_host = (compute_id, cb) ->
    if typeof compute_id == 'string'
        v = [compute_id]
    else
        v = compute_id
    get_database (err, db) ->
        if err
            cb(err)
        else
            db.select
                table   : 'compute_hosts'
                where   : {compute_id : {'in':v}, dummy:true}
                columns : ['compute_id','host']
                cb      : (err, result) ->
                    if err
                        cb(err)
                    else
                        w = ([r[0],cassandra.inet_to_str(r[1])] for r in result)
                        if typeof compute_id == 'string'
                            if w.length == 0
                                cb("no compute server with id #{compute_id}")
                            else
                                cb(undefined, w[0][1])
                        else
                            z = {}
                            for r in w
                                z[r[0]] = r[1]
                            cb(undefined, (z[c] for c in compute_id))

exports.host_to_compute_id = host_to_compute_id = (host, cb) ->
    get_available_compute_host
        host : host
        cb   : (err, result) ->
            if err
                cb(err)
            else
                cb(undefined, result.compute_id)


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
                    if err
                        cb(err)
                    else if not result.port?
                        cb("#{compute_id} is not running right now")
                    else
                        result.host = cassandra.inet_to_str(result.host)
                        winston.debug("got location of #{compute_id} --   #{result.host}:#{result.port}")
                        cb(undefined, result)


class Client
    constructor: (@compute_id, @verbose) ->

    dbg: (f, args, m) =>
        if @verbose
            winston.debug("storage Client(#{@host}:#{@port}).#{f}(#{misc.to_json(args)}): #{m}")

    connect: (cb) =>
        dbg = (m) => winston.debug("Storage client (#{@host}:#{@port}): #{m}")
        dbg()
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
                columns   : ['compute_id', 'host', 'port', 'up_since', 'health', 'zfs_queue_len']
                where     : where
                objectify : true
                cb        : (err, results) ->
                    if err
                        cb(err)
                    else
                        # randomize amongst servers with the same health and queue length
                        r = ([x.health, x.zfs_queue_len, Math.random(), x] for x in results when x.port? and x.host? and x.up_since?)
                        r.sort()
                        if r.length == 0
                            cb("no available hosts")
                        else
                            # TODO: currently just ignoring health...  Can't just take the healthiest either
                            # since that one would get quickly overloaded, so be careful!
                            z = r[0]
                            x = z[z.length-1]
                            winston.debug("got host with compute_id=#{x.compute_id}")
                            cb(undefined)
    ], (err) -> opts.cb(err, x))


client_cache = {}

exports.client = (opts) ->
    opts = defaults opts,
        compute_id : undefined     # uuid;  can also give an ip address instead
        host       : undefined
        verbose    : true
        cb         : required
    dbg = (m) -> winston.debug("client(#{opts.compute_id},#{opts.hostname}): #{m}")
    dbg()
    C = undefined

    # allow a hostname for compute_id
    if opts.compute_id? and not misc.is_valid_uuid_string(opts.compute_id)
        opts.cb("invalid compute_id=#{opts.compute_id}")
        return
    async.series([
        (cb) ->
            if opts.compute_id?
                cb()
            else
                exports.host_to_compute_id opts.host, (err, compute_id) ->
                    if err
                        cb(err)
                    else
                        opts.compute_id = compute_id
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
        @dbg("constructor",[],"initializing...")

    _update_compute_id: (cb) =>
        @state cb: (err, state) =>
            if err
                cb(err); return
            v = ([x.import_pool, x] for x in state when x.import_pool? and not x.broken)
            v.sort()
            @dbg('constructor',[],"number of hosts where pool is imported: #{v.length}")
            if v.length > 0
                @compute_id = v[v.length-1][1].compute_id
                if v.length > 1
                    @dbg('constructor','',"should never have more than one pool -- repair")
                    for y in v.slice(0,v.length-1)
                        @action
                            compute_id : y[1].compute_id
                            action     : 'export_pool'
            else
                @compute_id = undefined  # means no zpool currently imported
            cb()

    location: (opts) =>
        opts = defaults opts,
            cb : required      # (err, {host:inet address, compute_id:uuid} of best compute host)
        @dbg('location', '', "")
        compute_id = undefined
        async.series([
            (cb) =>
                @_update_compute_id (err) =>
                    if err
                        cb(err)
                    else
                        compute_id = @compute_id
                        cb()
            (cb) =>
                if compute_id?
                    cb(); return
                @state cb: (err, state) =>
                    if err
                        cb(err); return
                    v = ([x.sync_streams, x] for x in state when x.sync_streams?)
                    v.sort()
                    @dbg('location','',"number of hosts where project is at least partly cached: #{v.length}")
                    if v.length > 0
                        compute_id = v[v.length-1][1].compute_id
                        cb()
                    else
                        exports.client
                            cb : (err, client) =>
                                if err
                                    cb(err)
                                else
                                    compute_id = client.compute_id
                                    cb()
        ], (err) =>
            if err
                opts.cb(err)
            else
                compute_id_to_host compute_id, (err, host) =>
                    opts.cb(err, {compute_id:compute_id, host:host, is_open:@compute_id?})
        )

    dbg: (f, args, m) =>
        winston.debug("storage ClientProject(#{@project_id}).#{f}(#{misc.to_json(args)}): #{m}")

    action: (opts) =>
        opts = defaults opts,
            compute_id : undefined
            action     : required
            param      : undefined
            timeout    : TIMEOUT
            limit      : 3
            cb         : undefined

        @dbg('action', opts)

        f = (cb) =>
            if opts.compute_id?
                cb()
            else
                @location
                    cb : (err, loc) =>
                        if err
                            cb(err)
                        else
                            opts.compute_id = loc.compute_id
                            cb()

        f (err) =>
            if err
                opts.cb?(err)
            else
                exports.client
                    compute_id : opts.compute_id
                    cb         : (err, client) =>
                        if err
                            opts.cb?(err)
                            return
                        client.action
                            project_id : @project_id
                            action     : opts.action
                            param      : opts.param
                            timeout    : opts.timeout
                            limit      : opts.limit
                            cb         : opts.cb


    queue: (opts) =>
        opts = defaults opts,
            compute_id : undefined
            cb         : required
        @action
            compute_id : opts.compute_id
            action     : 'queue'
            cb         : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, resp.result)

    delete_queue: (opts) =>
        opts = defaults opts,
            compute_id : undefined
            cb         : required
        @action
            compute_id : opts.compute_id
            action     : 'delete_queue'
            cb         : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, resp.result)


    log: (opts) =>
        opts = defaults opts,
            compute_id : undefined
            host       : undefined
            action     : undefined
            max_age_m  : 60*24      # integer -- if given, only return log entries that are at most this old, in minutes.
            cb         : required
        if opts.max_age_m?
            where = {timestamp:{'>=':cassandra.minutes_ago(opts.max_age_m)}}
        else
            where = {}
        @dbg("log",where,"getting log...")
        where.id = @project_id

        get_database (err) =>
            if err
                opts.cb(err)
            else
                database.select
                    table     : 'storage_log'
                    columns   : ['timestamp', 'action', 'param', 'time_s', 'error', 'host', 'compute_id']
                    where     : where
                    json      : ['param', 'error']
                    objectify : true
                    order_by  : 'timestamp'
                    cb        : (err, results) =>
                        if err
                            opts.cb(err); return
                        # client-side filtering
                        if opts.compute_id?
                            results = (x for x in results when x.compute_id == opts.compute_id)
                        if opts.host?
                            results = (x for x in results when x.host == opts.host)
                        if opts.action?
                            results = (x for x in results when x.action == opts.action)
                        for x in results
                            x.timestamp = new Date(x.timestamp)
                        opts.cb(undefined, results)

    state: (opts) =>
        opts = defaults opts,
            host : false            # if true, look up hostname for each compute_id -- mainly for interactive convenience
            include_broken : false  # if true, also include broken hosts in result
            cb   : required
        @dbg('state', '', "getting state")
        result = undefined
        async.series([
            (cb) =>
                get_database(cb)
            (cb) =>
                database.select
                    table     : 'project_state'
                    consistency : STATE_CONSISTENCY
                    where     : {project_id : @project_id}
                    columns   : ['compute_id', 'sync_streams', 'recv_streams', 'send_streams', 'import_pool', 'snapshot_pool', 'scrub_pool', 'broken']
                    objectify : true
                    cb        : (err, _result) =>
                        if err
                            cb(err)
                        else
                            v = ([r.import_pool, r.sync_streams, r] for r in _result)
                            v.sort()
                            v.reverse()
                            result = (x[x.length-1] for x in v)
                            if not opts.include_broken
                                result = (x for x in result when not x.broken)
                            cb()
            (cb) =>
                if not opts.host
                    cb(); return
                compute_id_to_host (r.compute_id for r in result), (err, hosts) =>
                    if err
                        cb(err)
                    else
                        i = 0
                        for r in result
                            r.host = hosts[i]
                            i += 1
                        cb()
        ], (err) => opts.cb(err, result))

    close: (opts) =>
        opts = defaults opts,
            cb : undefined
        @dbg('close', '', "")
        @_update_compute_id (err) =>
            if err
                opts.cb(err); return
            if not @compute_id?
                opts.cb?(); return
            async.series([
                (cb) =>
                    @save(cb:cb)
                (cb) =>
                    @action
                        compute_id : @compute_id
                        action     : 'export_pool'
                        cb         : cb
            ], (err) =>
                if err
                    opts.cb?(err)
                else
                    @compute_id = undefined
                    opts.cb?()
            )

    save: (opts) =>
        opts = defaults opts,
            cb   : undefined
        @dbg('save', '', "")
        @_update_compute_id (err) =>
            if err
                opts.cb?(err); return
            if not @compute_id?
                opts.cb?(); return
            @action
                compute_id : @compute_id
                action     : 'save'
                cb         : opts.cb

    # Increase the quota of the project.
    increase_quota: (opts) =>
        opts = defaults opts,
            amount : '1G'
            cb     : undefined
        @dbg("increase_quota",{amount:opts.amount},"")
        @_update_compute_id (err) =>
            if err
                opts.cb(err); return
            if not @compute_id?  # not opened
                opts.cb?("cannot increase quota unless project is opened somewhere"); return
            async.series([
                (cb) =>
                    @action
                        compute_id : @compute_id
                        action     : 'increase_quota'
                        param      : ['--amount',opts.amount]
                        cb         : cb
                (cb) =>
                    @save(cb:cb)
            ], (err) => opts.cb?(err))

    snapshot: (opts) =>
        opts = defaults opts,
            name : undefined
            cb   : undefined
        @dbg('snapshot', '', "")
        @_update_compute_id (err) =>
            if err
                opts.cb(err); return
            if not @compute_id?
                opts.cb?("not opened"); return
            z =
                compute_id : @compute_id
                action     : 'snapshot_pool'
                cb         : opts.cb
            if opts.name?
                z.param = ['--name', opts.name]
            @action(z)

    destroy_snapshot: (opts) =>
        opts = defaults opts,
            name : required
            cb   : undefined
        @dbg('destroy_snapshot', opts.name, "")
        @_update_compute_id (err) =>
            if err
                opts.cb(err); return
            if not @compute_id?
                opts.cb?("not opened"); return
            @action
                compute_id : @compute_id
                action     : 'destroy_snapshot_of_pool'
                param      : ['--name', opts.name]
                cb         : opts.cb

    last_snapshot: (opts) =>
        opts = defaults opts,
            cb         : required    # (err, UTC ISO timestamp of most recent snapshot) -- undefined if not known
        @dbg('last_snapshot', '', "getting most recent snapshot time")
        get_database (err) =>
            if err
                opts.cb(err)
            else
                database.select
                    table     : 'project_state'
                    where     : {project_id : @project_id}
                    columns   : ['snapshot_pool']
                    consistency : STATE_CONSISTENCY
                    objectify : false
                    cb        : (err, result) =>
                        if err
                            opts.cb(err)
                        else
                            v = (r[0] for r in result when r[0]?)
                            v.sort()
                            if v.length == 0
                                opts.cb(undefined, undefined)
                            else
                                opts.cb(undefined, misc.to_iso(new Date(v[v.length-1])))

    open: (opts) =>
        opts = defaults opts,
            compute_id : undefined  # if given, try to open on this machine
            host       : undefined  # if given use this machine
            cb         : undefined    # (err, {compute_id:compute_id of host, host:ip address})
        @dbg('open', '', "")
        @_update_compute_id (err) =>
            if err
                opts.cb?(err); return
            if @compute_id?  # already opened
                if opts.compute_id? and @compute_id != opts.compute_id
                    opts.cb?("already opened on a different host (#{@compute_id})")
                    return
                # already opened according to database -- ensure that it is *really* open
                @action
                    compute_id : compute_id
                    action     : 'import_pool'
                    cb         : (err) =>
                        if err
                            opts.cb?(err)
                        else
                            compute_id_to_host @compute_id, (err, host) =>
                                opts.cb?(err, {compute_id:@compute_id, host:host})
                return

            compute_id = undefined
            async.series([
                (cb) =>
                    if opts.host? and not opts.compute_id?
                        host_to_compute_id opts.host, (err, compute_id) =>
                            if err
                                cb(err)
                            else
                                opts.compute_id = compute_id
                                cb()
                    else
                        cb()
                (cb) =>
                    if opts.compute_id?
                        compute_id = opts.compute_id
                        cb()
                    else
                        @state cb: (err, state) =>
                            if err
                                cb(err); return
                            v = ([x.sync_streams, x] for x in state when x.sync_streams?)
                            v.sort()
                            @dbg('open','',"number of hosts where project is at least partly cached: #{v.length}")
                            if v.length > 0
                                compute_id = v[v.length-1][1].compute_id
                                cb()
                            else
                                exports.client
                                    cb : (err, client) =>
                                        if err
                                            cb(err)
                                        else
                                            compute_id = client.compute_id
                                            cb(err)
                (cb) =>
                    @action
                        compute_id : compute_id
                        action     : 'open'
                        cb         : cb
            ], (err) =>
                if err
                    opts.cb?(err)
                else
                    @compute_id = compute_id
                    compute_id_to_host @compute_id, (err, host) =>
                        opts.cb?(err, {compute_id:@compute_id, host:host})
            )


    sync_streams: (opts) =>
        opts = defaults opts,
            compute_id   : undefined  # if given, update streams on this host; if not, update on all hosts where project isn't opened
            recv_streams : false      # also ensure that image filesystems of the copies are already recv'd
            cb           : undefined
        @dbg('cache', opts, "")
        @state cb: (err, state) =>
            if err
                cb(err); return
            sync = (compute_id, cb) =>
                @action
                    compute_id : compute_id
                    action     : 'sync_streams'
                    cb         : (err) =>
                        if err or not opts.recv_streams
                            cb(err); return
                        @action
                            compute_id : x.compute_id
                            action     : 'recv_streams'
                            cb         : cb
            if opts.compute_id?
                sync(opts.compute_id, opts.cb)
            else
                v = (x.compute_id for x in state when not x.import_pool?)
                async.map(v, sync, (err) => opts.cb?(err))

    # destroy all traces of this project on the given compute host
    destroy: (opts) =>
        opts = defaults opts,
            compute_id : undefined
            cb         : undefined
        @dbg('destroy', opts.compute_id)
        @action
            compute_id : opts.compute_id
            action     : 'destroy'
            cb         : opts.cb

    # destroy the image filesystem, leaving the stream cache
    destroy_image_fs: (opts) =>
        opts = defaults opts,
            compute_id : undefined
            cb         : undefined
        @dbg('destroy_image_fs', opts.compute_id)
        @action
            compute_id : opts.compute_id
            action     : 'destroy_image_fs'
            cb         : opts.cb


    # temporarily mark a particular compute host for this project as broken, so it won't be opened.
    mark_broken: (opts) =>
        opts = defaults opts,
            compute_id : undefined
            ttl        : 60*15      # marks host with given compute_id as bad for this many seconds (default "15 minutes")
            cb         : undefined
        @dbg('broken', opts.compute_id)
        async.series([
            (cb) =>
                if opts.compute_id?
                    cb()
                else
                    @location
                        cb : (err, loc) =>
                            if err
                                cb(err)
                            else
                                opts.compute_id = loc.compute_id
                                cb()
            (cb) =>
                database.update
                    table     : 'project_state'
                    consistency : STATE_CONSISTENCY
                    set       : {broken : true}
                    where     : {project_id : @project_id, compute_id:opts.compute_id}
                    ttl       : opts.ttl
                    cb        : cb
        ], (err) => opts.cb?(err))

    chunked_storage: (opts) =>
        opts = defaults opts,
            cb         : required
        get_database (err) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, database.chunked_storage(id:@project_id))

    streams: (opts) =>
        opts = defaults opts,
            cb : required
        @dbg('streams', opts.compute_id)
        @chunked_storage
            cb: (err, cs) =>
                if err
                    opts.cb(err)
                else
                    cs.ls(cb:opts.cb)

    # how much space this project uses in the database
    size: (opts) =>
        opts = defaults opts,
            cb : required       # cb(err, total size in *bytes* occupied by streams in database)
        @dbg('size', opts.compute_id)
        @streams
            cb : (err, streams) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, (x.size for x in streams).reduce (t,s) -> t+s)


    delete_nonoptimal_streams: (opts) =>
        opts = defaults opts,
            cb         : undefined
        @dbg('delete_nonoptimal_streams', opts.compute_id)
        cs        = undefined
        to_remove = undefined
        async.series([
            (cb) =>
                @chunked_storage
                    cb: (err, _cs) =>
                        cs=_cs; cb(err)
            (cb) =>
                cs.ls
                    cb: (err, files) =>
                        if err
                            cb(err)
                        else
                            to_keep = {}
                            for f in optimal_stream((a.name for a in files))
                                to_keep[f] = true
                            to_remove = (f.name for f in files when not to_keep[f.name])
                            @dbg("delete_nonoptimal_streams: removing #{misc.to_json(to_remove)}")
                            cb()
            (cb) =>
                f = (name, c) =>
                    cs.delete
                        name : name
                        cb   : c
                async.map(to_remove, f, cb)
        ], (err) => opts.cb?(err))

    migrate_from: (opts) =>
        opts = defaults opts,
            host : required
            cb   : undefined
        @dbg('migrate_from', opts.host, "")
        async.series([
            (cb) =>
                @open
                    host : opts.host
                    cb         : cb
            (cb) =>
                @action
                    compute_id : @compute_id
                    action     : 'migrate_from'
                    param      : ['--host', opts.host]
                    cb         : cb
        ], opts.cb)


client_project_cache = {}

exports.client_project = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : undefined
    if not misc.is_valid_uuid_string(opts.project_id)
        opts.cb?("invalid project id")
        return "invalid project_id"
    P = client_project_cache[opts.project_id]
    if not P?
        P = client_project_cache[opts.project_id] = new ClientProject(opts.project_id)
    opts.cb?(undefined, P)
    return P





###########################
## Command line interface
###########################

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
    .option('--consistency [number]', 'Cassandra consistency level (default: two)', String, 'two')

    .option('--stream_path [string]', 'Path where streams are stored (default: /storage/streams)', String, '/storage/streams')
    .option('--pool [string]', 'Storage pool used for images (default: storage)', String, 'storage')
    .parse(process.argv)

program.consistency = cql.types.consistencies[program.consistency]
if not program.consistency?
    winston.debug("consistency options: #{misc.to_json(misc.keys(cql.types.consistencies))}")

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
        program.database_nodes = ("10.3.#{i}.1" for i in [1..4])

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


