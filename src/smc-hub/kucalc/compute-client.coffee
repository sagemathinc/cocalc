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

LOCAL_HUB_PORT      = 6000
RAW_PORT            = 6001
SAGE_SERVER_PORT    = 6002
CONSOLE_SERVER_PORT = 6003

{EventEmitter} = require('events')

request = require('request')
async = require('async')
underscore = require('underscore')

misc = require('smc-util/misc')
{defaults, required} = misc

exports.get_json = get_json = (url, cb) ->
    request.get url, (err, response, body) ->
        if err
            cb(err)
        else if response.statusCode == 200
            cb("ERROR: statusCode #{response.statusCode}")
        else
            try
                cb(undefined, JSON.parse(body))
            catch e
                cb("ERROR: invalid JSON -- #{e} -- '#{body}'")

exports.compute_client = (db, logger) ->
    return new Client(db, logger)

class Dbg extends EventEmitter

project_cache = {}

quota_compute = require('./quota')

class Client
    constructor: (@database, @logger) ->
        @dbg("constructor")()
        if not @database?
            throw Error("database must be defined")

    copy_paths_synctable: (cb) =>
        if @_synctable
            cb(undefined, @_synctable)
            return
        if @_synctable_cbs?
            @_synctable_cbs.push(cb)
            return
        @_synctable_cbs = [cb]
        @database.synctable
            table    : 'copy_paths'
            columns  : ['id', 'started', 'error', 'finished']
            where    :
                "time > $::TIMESTAMP": new Date()
            where_function : ->
                # Whenever anything *changes* in this table, we are interested in it, so no need
                # to do a query to decide.
                return true
            cb       : (err, synctable) =>
                for cb in @_synctable_cbs
                    if err
                        cb(err)
                    else
                        cb(undefined, synctable)
                @_synctable = synctable
                delete @_synctable_cbs

    dbg: (f) =>
        if not @logger?
            return ->
        else
            return (args...) => @logger.debug("kucalc.Client.#{f}", args...)

    project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        dbg = @dbg("project('#{opts.project_id}')")
        P = project_cache[opts.project_id]
        if P?
            dbg('in cache')
            if P.is_ready
                opts.cb(undefined, P)
            else
                P.once 'ready', (err) ->
                    opts.cb(err, P)
            return
        dbg("not in cache, so creating")
        P = project_cache[opts.project_id] = new Project(@, opts.project_id, @logger, @database)
        P.once 'ready', ->
            opts.cb(undefined, P)

class Project extends EventEmitter
    constructor: (@client, @project_id, @logger, @database) ->
        @host = "project-#{@project_id}"
        dbg = @dbg('constructor')
        dbg("initializing")

        # It's *critical* that idle_timeout_s be used below, since I haven't
        # come up with any good way to "garbage collect" ProjectClient objects,
        # due to the async complexity of everything.
        # ** TODO: IMPORTANT - idle_timeout_s is NOT IMPLEMENTED in postgres-synctable yet! **
        @database.synctable
            idle_timeout_s : 60*10    # 10 minutes -- should be long enough for any single operation;
                                      # but short enough that connections get freed up.
            table          : 'projects'
            columns        : ['state', 'status', 'action_request']
            where          : {"project_id = $::UUID" : @project_id}
            where_function : (project_id) =>
                return project_id == @project_id  # fast easy test for matching
            cb             : (err, synctable) =>
                if err
                    dbg("error creating synctable ", err)
                    @emit("ready", err)
                    @close()
                else
                    dbg("successfully created synctable; now ready")
                    @is_ready = true
                    @synctable = synctable
                    @synctable.on 'change', => @emit('change')
                    @emit("ready")

    # Get the current data about the project from the database.
    get: (field) =>
        t = @synctable.get(@project_id)
        if field?
            return t?.get(field)
        else
            return t

    getIn: (v) =>
        return @get()?.getIn(v)

    _action_request: =>
        x = @get('action_request')?.toJS()
        if x.started?
            x.started = new Date(x.started)
        if x.finished?
            x.finished = new Date(x.finished)
        return x

    dbg: (f) =>
        if not @logger?
            return ->
        else
            return (args...) => @logger.debug("kucalc.Project('#{@project_id}').#{f}", args...)

    # free -- stop listening for status updates from the database and broadcasting
    # updates about this project.
    # NOTE: as of writing this line, this free is never called by hub, and idle_timeout_s
    # is used instead below (of course, free could be used by maintenance operations).
    free: () =>
        # Ensure that next time this project gets requested, a fresh one is created, rather than
        # this cached one, which has been free'd up, and will no longer work.
        delete project_cache[@project_id]
        # Close the changefeed, so get no further data from database.
        @synctable?.close()
        delete @synctable
        delete @logger
        delete @project_id
        delete @compute_server
        delete @host
        delete @is_ready
        # Make sure nothing else reacts to changes on this ProjectClient, since they won't happen.
        @removeAllListeners()

    state: (opts) =>
        opts = defaults opts,
            force  : false  # ignored
            update : false  # ignored
            cb     : required     # cb(err, {state:?, time:?, error:?})
        dbg = @dbg("state")
        dbg()
        opts.cb(undefined, @get('state')?.toJS())

    status: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("status")
        dbg()
        status = @get('status')?.toJS() ? {}
        misc.merge status,  # merge in canonical information
            "local_hub.port"      : LOCAL_HUB_PORT
            "raw.port"            : RAW_PORT
            "sage_server.port"    : SAGE_SERVER_PORT
            "console_server.port" : CONSOLE_SERVER_PORT
        opts.cb(undefined, status)

    _action: (opts) =>
        opts = defaults opts,
            action    : required    # action to do
            goal      : required    # wait until goal(project) is true, where project is immutable js obj
            timeout_s : 300         # timeout in seconds (only used for wait)
            cb        : undefined
        dbg = @dbg("_action('#{opts.action}')")
        if opts.goal(@get())
            dbg("condition already holds; nothing to do.")
            opts.cb?()
            return

        if opts.goal?
            dbg("start waiting for goal to be satisfied")
            @synctable.wait
                until   : () =>
                    return opts.goal(@get())
                timeout : opts.timeout_s
                cb      : (err) =>
                    dbg("done waiting for goal #{err}")
                    opts.cb?(err)
                    delete opts.cb

        dbg("request action to happen")
        @_query
            jsonb_set :
                action_request :
                    action   : opts.action
                    time     : new Date()
                    started  : undefined
                    finished : undefined
            cb          : (err) =>
                if err
                    dbg('action request failed')
                    opts.cb?(err)
                    delete opts.cb
                else
                    dbg("action requested")

    _query: (opts) =>
        opts.query = 'UPDATE projects'
        opts.where = {'project_id  = $::UUID' : @project_id}
        @client.database._query(opts)

    open: (opts) =>
        opts = defaults opts,
            cb   : undefined
        dbg = @dbg("open")
        dbg()
        @_action
            action : 'open'
            goal   : (project) => (project?.getIn(['state', 'state']) ? 'closed') != 'closed'
            cb     : opts.cb

    start: (opts) =>
        opts = defaults opts,
            set_quotas : true    # ignored
            cb         : undefined
        dbg = @dbg("start")
        dbg()
        @_action
            action : 'start'
            goal   : (project) -> project?.getIn(['state', 'state']) == 'running'
            cb     : opts.cb

    stop: (opts) =>
        opts = defaults opts,
            cb     : undefined
        dbg = @dbg("stop")
        dbg()
        @_action
            action : 'stop'
            goal   : (project) -> project?.getIn(['state', 'state']) in ['opened', 'closed']
            cb     : opts.cb

    restart: (opts) =>
        opts = defaults opts,
            set_quotas : true    # ignored
            cb         : undefined
        dbg = @dbg("restart")
        dbg()
        async.series([
            (cb) =>
                @stop(cb:cb)
            (cb) =>
                @start(cb:cb)
        ], (err) => opts.cb?(err))

    ensure_running: (opts) =>
        @start(opts)  # it's just the same

    ensure_closed: (opts) =>
        opts = defaults opts,
            cb     : undefined
        dbg = @dbg("ensure_closed")
        dbg()
        @_action
            action : 'close'
            goal   : (project) -> project?.getIn(['state', 'state']) == 'closed'
            cb     : opts.cb

    move: (opts) =>
        opts = defaults opts,
            target : undefined # ignored
            force  : false     # ignored for now
            cb     : required
        opts.cb("move makes no sense for Kubernetes")

    address: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("address")
        dbg('first ensure is running')
        @ensure_running
            cb : (err) =>
                if err
                    dbg('error starting it up')
                    opts.cb(err)
                    return
                dbg('it is running')
                address =
                    host         : @host
                    port         : LOCAL_HUB_PORT
                    secret_token : @getIn(['status', 'secret_token'])
                if not address.secret_token
                    err = 'BUG -- running, but no secret_token!'
                    dbg(err)
                    opts.cb(err)
                else
                    opts.cb(undefined, address)

    # this is a no-op for Kubernetes; this was only used for serving
    # some static websites, e.g., wstein.org, so may evolve into that...
    save: (opts) =>
        opts = defaults opts,
            min_interval  : undefined # ignored
            cb            : undefined # ignored
        dbg = @dbg("save(min_interval:#{opts.min_interval})")
        dbg()
        opts.cb?()

    copy_path: (opts) =>
        opts = defaults opts,
            path              : ""
            target_project_id : ""
            target_path       : ""        # path into project; if "", defaults to path above.
            overwrite_newer   : undefined # if true, newer files in target are copied over (otherwise, uses rsync's --update)
            delete_missing    : undefined # if true, delete files in dest path not in source, **including** newer files
            backup            : undefined # make backup files
            exclude_history   : undefined
            timeout           : 5*60
            bwlimit           : '5MB'
            cb                : undefined
        if not opts.target_project_id
            opts.target_project_id = @project_id
        if not opts.target_path
            opts.target_path = opts.path
        synctable = undefined
        copy_id = misc.uuid()
        dbg = @dbg("copy_path('#{opts.path}', id='#{copy_id}')")
        dbg("copy a path using rsync from one project to another")
        async.series([
            (cb) =>
                dbg("get synctable")
                @client.copy_paths_synctable (err, s) =>
                    synctable = s; cb(err)
            (cb) =>
                dbg('write query requesting the copy to the database')
                @database._query
                    query  : "INSERT INTO copy_paths"
                    values :
                        "id                ::UUID"      : copy_id
                        "time              ::TIMESTAMP" : new Date()
                        "source_project_id ::UUID"      : @project_id
                        "source_path       ::TEXT"      : opts.path
                        "target_project_id ::UUID"      : opts.target_project_id
                        "target_path       ::TEXT"      : opts.target_path
                        "overwrite_newer   ::BOOLEAN"   : opts.overwrite_newer
                        "delete_missing    ::BOOLEAN"   : opts.delete_missing
                        "backup            ::BOOLEAN"   : opts.backup
                        "bwlimit           ::TEXT"      : opts.bwlimit
                        "timeout           ::NUMERIC"   : opts.timeout
                    cb: cb
            (cb) =>
                if synctable.getIn([copy_id, 'finished'])
                    dbg("copy instantly finished")
                    # no way this ever happens - the server can't be that fast.
                    # but just in case, logically we have to check this case.
                    cb()
                    return
                dbg('waiting for copy to finish...')
                handle_change = =>
                    obj = synctable.get(copy_id)
                    if obj?.get('started')
                        dbg("copy started...")
                    if obj?.get('finished')
                        dbg("copy finished!")
                        synctable.removeListener('change', handle_change)
                        cb(obj.get('error'))
                synctable.on('change', handle_change)
        ], (err) ->
            dbg('done', err)
            opts.cb?(err)
        )

    directory_listing: (opts) =>
        opts = defaults opts,
            path   : ''
            hidden : false        # used
            time   : undefined    # ignored/deprecated
            start  : undefined    # ignored/deprecated
            limit  : undefined    # ignored/deprecated
            cb     : required
        dbg = @dbg("directory_listing")
        dbg()
        listing = undefined
        async.series([
            (cb) =>
                dbg("starting project if necessary...")
                @start(cb:cb)
            (cb) =>
                # TODO: This URL is obviously very specific to KuCalc -- hardcoded port and base url.
                url = "http://project-#{@project_id}:6001/#{@project_id}/raw/.smc/directory_listing/#{opts.path}"
                dbg("fetching listing from '#{url}'")
                if opts.hidden
                    url += '?hidden=true'
                misc.retry_until_success
                    f           : (cb) =>
                        get_json url, (err, x) =>
                            dbg('fetch returned ', err, x)
                            listing = x
                            cb(err)
                    max_time    : 30000
                    start_delay : 2000
                    max_delay   : 7000
        ], (err) =>
            opts.cb(err, listing)
        )

    read_file: (opts) =>
        opts = defaults opts,
            path    : required
            maxsize : 3000000    # maximum file size in bytes to read
            cb      : required   # cb(err, Buffer)
        dbg = @dbg("read_file(path:'#{opts.path}')")
        dbg("read a file or directory from disk")
        opts.cb?("read_file -- not implemented")

    ###
    set_all_quotas ensures that if the project is running and the quotas
    (except idle_timeout) have changed, then the project is restarted.
    ###
    set_all_quotas: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("set_all_quotas")
        dbg()
        # 1. Get data about project from the database, namely:
        #     - is project currently running (if not, nothing to do)
        #     - if running, what quotas it was started with and what its quotas are now
        # 2. If quotas differ, restarts project.
        @database.get_project
            project_id : @project_id
            columns    : ['state', 'users', 'settings', 'run_quota']
            cb         : (err, x) =>
                if err
                    dbg("error -- #{err}")
                    opts.cb(err)
                    return
                if x.state.state not in ['running', 'starting']
                    dbg("not running")
                    opts.cb()
                    return
                cur = quota_compute.quota(x.settings, x.users)
                if underscore.isEqual(x.run_quota, cur)
                    dbg("running, but no quotas changed")
                    opts.cb()
                else
                    dbg('running and a quota changed; restart')
                    @restart(cb:opts.cb)




