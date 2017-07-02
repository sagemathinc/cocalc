###
Compute client for use in Kubernetes cluster by the hub.

The hub uses this module to get information about a project.  This is meant
to be used as part of kucalc, and replaces the other variants
of compute-client.coffee.

The name 'compute-client' probably isn't the best.  Really this is a module
that gets information about and controls projects.

What this modules should acomplish:

- Modify database in response to requests to start/stop/etc project.
- Provide the project secret token to the hub

###

LOCAL_HUB_PORT = 6000
RAW_PORT       = 6001

{EventEmitter} = require('events')

misc = require('smc-util/misc')
{defaults, required} = misc

exports.compute_server = (db) ->
    return new Client(db)

class Dbg extends EventEmitter
    dbg: (f) =>
        if not @logger?
            return ->
        else
            return (args...) => @logger.debug("ComputeServer.#{f}", args...)

class Client extends Dbg
    constructor: (@database, @logger) ->

    project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        opts.cb(undefined, new Project(@, opts.project_id, @logger))

class Project extends Dbg
    constructor: (@compute_server, @project_id, @logger) ->
        @host = "project-#{@project_id}"

    free: () =>

    state: (opts) =>
        opts = defaults opts,
            force  : false
            update : false
            cb     : required     # cb(err, {state:?, time:?, error:?})
        dbg = @dbg("state")
        dbg()
        opts.cb(undefined, {state:'running', time:new Date()})

    status: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("status")
        dbg()
        status =
            "sage_server.pid"     : false
            "secret_token"        : 'secret'  # TODO
            "local_hub.port"      : LOCAL_HUB_PORT
            "raw.port"            : RAW_PORT
            "sage_server.port"    : false
            "local_hub.pid"       : 5     # TODO
            "console_server.pid"  : false
            "console_server.port" : false
        status.quotas = {}
        status.host = status.ssh = 'host'
        opts.cb(undefined, status)

    open: (opts) =>
        opts = defaults opts,
            cb   : required
        dbg = @dbg("open")
        dbg()
        opts.cb()

    start: (opts) =>
        opts = defaults opts,
            set_quotas : true   # if true, also sets all quotas
            cb         : required
        dbg = @dbg("start")
        dbg()
        opts.cb()

    restart: (opts) =>
        opts = defaults opts,
            set_quotas : true
            cb         : required
        dbg = @dbg("restart")
        dbg()
        opts.cb()

    ensure_running: (opts) =>
        opts = defaults opts,
            cb : undefined
        dbg = @dbg("ensure_running")
        dbg()
        opts.cb()

    ensure_closed: (opts) =>
        opts = defaults opts,
            cb     : undefined
        dbg = @dbg("ensure_closed")
        dbg()
        opts.cb?("ensure_closed -- not implemented")

    move: (opts) =>
        opts = defaults opts,
            target : undefined # hostname of a compute server; if not given, one (diff than current) will be chosen by load balancing
            force  : false     # ignored for now
            cb     : required
        opts.cb("move make no sense for Kubernetes")

    stop: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("stop")
        dbg()
        opts.cb()

    save: (opts) =>
        opts = defaults opts,
            min_interval  : 5  # fail if already saved less than this many MINUTES (use 0 to disable) ago
            cb            : undefined
        dbg = @dbg("save(min_interval:#{opts.min_interval})")
        dbg()
        opts.cb()

    address: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("address")
        dbg()
        address =
            host         : @host
            port         : LOCAL_HUB_PORT
            secret_token : 'secret'   # TODO
        opts.cb(undefined, address)

    copy_path: (opts) =>
        opts = defaults opts,
            path              : ""
            target_project_id : ""
            target_path       : ""        # path into project; if "", defaults to path above.
            overwrite_newer   : false     # if true, newer files in target are copied over (otherwise, uses rsync's --update)
            delete_missing    : false     # if true, delete files in dest path not in source, **including** newer files
            backup            : false     # make backup files
            exclude_history   : false
            timeout           : 5*60
            bwlimit           : undefined
            cb                : required
        dbg = @dbg("copy_path(#{opts.path} to #{opts.target_project_id})")
        dbg("copy a path using rsync from one project to another")
        if not opts.target_project_id
            opts.target_project_id = @project_id
        if not opts.target_path
            opts.target_path = opts.path
        opts.cb?("copy_path -- not implemented")

    directory_listing: (opts) =>
        opts = defaults opts,
            path      : ''
            hidden    : false
            time      : false        # sort by timestamp, with newest first?
            start     : 0
            limit     : -1
            cb        : required
        dbg = @dbg("directory_listing")
        dbg()
        opts.cb?("directory_listing -- not implemented")

    read_file: (opts) =>
        opts = defaults opts,
            path    : required
            maxsize : 3000000    # maximum file size in bytes to read
            cb      : required   # cb(err, Buffer)
        dbg = @dbg("read_file(path:'#{opts.path}')")
        dbg("read a file or directory from disk")  # directories get zip'd
        opts.cb?("read_file -- not implemented")

    get_quotas: (opts) =>
        opts = defaults opts,
            cb           : required
        dbg = @dbg("get_quotas")
        dbg("lookup project quotas in the database")
        @compute_server.database.get_project_quotas
            project_id : @project_id
            cb         : opts.cb

    set_member_host: (opts) =>
        opts = defaults opts,
            member_host : required
            cb          : required
        # Ensure that member_host is a boolean for below; it is an integer -- 0 or >= 1 -- elsewhere.  But below
        # we very explicitly assume it is boolean (due to coffeescript not doing coercion).
        opts.member_host =  opts.member_host > 0
        dbg = @dbg("set_member_host(member_host=#{opts.member_host})")
        dbg()
        opts.cb() # TODO

    set_quotas: (opts) =>
        opts = misc.copy_with(opts, ['disk_quota', 'cores', 'memory', 'cpu_shares', 'network',
                                     'mintime', 'member_host', 'cb'])
        dbg = @dbg("set_quotas")
        dbg()
        opts.cb() # TODO

    set_all_quotas: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("set_all_quotas")
        dbg()
        opts.cb() # TODO




