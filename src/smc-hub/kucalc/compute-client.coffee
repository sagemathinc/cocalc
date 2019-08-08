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
        else if response.statusCode != 200
            cb("ERROR: statusCode #{response.statusCode}")
        else
            try
                cb(undefined, JSON.parse(body))
            catch e
                cb("ERROR: invalid JSON -- #{e} -- '#{body}'")
    return

exports.get_file = get_file = (url, cb) ->
    request.get url, {encoding: null}, (err, response, body) ->
        if err
            cb(err)
        else if response.statusCode != 200
            cb("ERROR: statusCode #{response.statusCode}")
        else
            cb(undefined, body)
    return

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
            # still need @logger? since it can get cleaned
            # up when Project is being freed.
            return (args...) => @logger?.debug("kucalc.Client.#{f}", args...)

    project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        dbg = @dbg("project('#{opts.project_id}')")
        P = project_cache[opts.project_id]
        if P?
            dbg('in cache')
            if P.is_ready
                P.active()
                opts.cb(undefined, P)
            else
                P.once 'ready', (err) ->
                    opts.cb(err, P)
            return
        dbg("not in cache, so creating")
        P = project_cache[opts.project_id] = new Project(@, opts.project_id, @logger, @database)
        P.once 'ready', ->
            opts.cb(undefined, P)

# NOTE: I think (and am assuming) that EventEmitter aspect of Project is NOT used in KuCalc by any
# client code.
class Project extends EventEmitter
    constructor: (client, project_id, logger, database) ->
        super()
        @client     = client
        @project_id = project_id
        @logger     = logger
        @database   = database
        dbg = @dbg('constructor')
        dbg("initializing")

        # We debounce the free function (which cleans everything up).
        # Every time we're doing something, we call @active();
        # once we DON'T call it for a few minutes, the project
        # is **then** freed, because that's how debounce works.
        @active = underscore.debounce(@free, 10*60*1000)
        @active()
        @database.synctable
            table          : 'projects'
            columns        : ['state', 'status', 'action_request']
            where          : {"project_id = $::UUID" : @project_id}
            where_function : (project_id) =>
                return project_id == @project_id  # fast easy test for matching
            cb             : (err, synctable) =>
                @active()
                if err
                    dbg("error creating synctable ", err)
                    @emit("ready", err)
                    @close()
                else
                    dbg("successfully created synctable; now ready")
                    @is_ready = true
                    @synctable = synctable
                    @host = @getIn(['state', 'ip'])
                    @synctable.on 'change', =>
                        @host = @getIn(['state', 'ip'])
                        @emit('change')
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
            # still need @logger? since it can get cleaned
            # up when Project is being freed.
            return (args...) => @logger?.debug("kucalc.Project('#{@project_id}').#{f}", args...)

    # free -- stop listening for status updates from the database and broadcasting
    # updates about this project.
    free: () =>
        @dbg('free')()
        delete @idle
        if @free_check?
            clearInterval(@free_check)
            delete @free_check
        # Ensure that next time this project gets requested, a fresh one is created, rather than
        # this cached one, which has been free'd up, and will no longer work.
        delete project_cache[@project_id]
        # Close the changefeed, so get no further data from database.
        @synctable?.close()
        delete @synctable
        delete @logger
        delete @project_id
        delete @compute_server
        delete @is_ready
        delete @host
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
            @active()
            @synctable.wait
                until   : () =>
                    @active()
                    return opts.goal(@get())
                timeout : opts.timeout_s
                cb      : (err) =>
                    @active()
                    dbg("done waiting for goal #{err}")
                    opts.cb?(err)
                    delete opts.cb

        dbg("request action to happen")
        @active()
        @_query
            jsonb_set :
                action_request :
                    action   : opts.action
                    time     : new Date()
                    started  : undefined
                    finished : undefined
            cb          : (err) =>
                @active()
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
            timeout           : undefined
            bwlimit           : undefined
            wait_until_done   : 'true'  # by default, wait until done. false only gives the ID to query the status later
            scheduled         : undefined # string, parseable by new Date()
            cb                : undefined

        dbg = @dbg("copy_path('#{opts.path}', id='#{copy_id}')")

        if not opts.target_project_id
            opts.target_project_id = @project_id

        if not opts.target_path
            opts.target_path = opts.path

        if opts.scheduled
            # we have to remove the timezone info!
            d = new Date(opts.scheduled)
            offset = d.getTimezoneOffset() / 60
            opts.scheduled = new Date(d.getTime() - offset)
            opts.wait_until_done = false
            dbg("opts.scheduled = #{opts.scheduled}")

        synctable = undefined
        copy_id = misc.uuid()
        dbg("copy a path using rsync from one project to another")
        @active()
        async.series([
            (cb) =>
                dbg("get synctable")
                @client.copy_paths_synctable (err, s) =>
                    synctable = s; cb(err)
            (cb) =>
                @active()
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
                        "scheduled         ::TIMESTAMP" : opts.scheduled
                    cb: cb
            (cb) =>
                @active()
                if synctable.getIn([copy_id, 'finished'])
                    dbg("copy instantly finished")
                    # no way this ever happens - the server can't be that fast.
                    # but just in case, logically we have to check this case.
                    cb()
                    return
                if opts.wait_until_done == 'true' or opts.wait_until_done == true
                    dbg('waiting for copy to finish...')
                    handle_change = =>
                        @active()
                        obj = synctable.get(copy_id)
                        if obj?.get('started')
                            dbg("copy started...")
                        if obj?.get('finished')
                            dbg("copy finished!")
                            synctable.removeListener('change', handle_change)
                            cb(obj.get('error'))
                    synctable.on('change', handle_change)
                else
                    dbg('NOT waiting for copy to finish...')
                    cb()
        ], (err) =>
            @active()
            dbg('done', err)
            opts.cb?(err, copy_id)
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
                url = "http://#{@host}:6001/#{@project_id}/raw/.smc/directory_listing/#{opts.path}"
                dbg("fetching listing from '#{url}'")
                if opts.hidden
                    url += '?hidden=true'
                misc.retry_until_success
                    f           : (cb) =>
                        @active()
                        get_json url, (err, x) =>
                            listing = x
                            cb(err)
                    max_time    : 30000
                    start_delay : 2000
                    max_delay   : 7000
                    cb          : cb
        ], (err) =>
            @active()
            opts.cb(err, listing)
        )

    read_file: (opts) =>
        opts = defaults opts,
            path    : required
            maxsize : 5000000    # maximum file size in bytes to read
            cb      : required   # cb(err, Buffer)
        dbg = @dbg("read_file(path:'#{opts.path}')")
        dbg("read a file from disk")
        content = undefined
        @active()
        async.series([
            (cb) =>
                # (this also starts the project)
                # TODO: get listing and confirm size
                # TODO - obviusly we should just stream... so there is much less of a limit... though
                # limits are good, as this frickin' costs!
                {dir, base} = require('path').parse(opts.path)
                if not base
                    cb("not a file -- '#{base}'")
                    return
                @directory_listing
                    path   : dir
                    hidden : true
                    cb     : (err, listing) =>
                        if err
                            cb(err)
                        else
                            for x in listing?.files ? []
                                if x.name == base
                                    if x.size <= opts.maxsize
                                        cb()
                                        return
                            cb('file too big or not found in listing')
            (cb) =>
                if not @host?
                    cb('project not running')
                    return
                url = "http://#{@host}:6001/#{@project_id}/raw/#{opts.path}"
                dbg("fetching file from '#{url}'")
                misc.retry_until_success
                    f           : (cb) =>
                        @active()
                        get_file url, (err, x) =>
                            content = x
                            cb(err)
                    max_time    : 30000
                    start_delay : 2000
                    max_delay   : 7000
                    cb          : cb
        ], (err) =>
            @active()
            opts.cb(err, content)
        )

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
        # 2. If quotas differ *AND* project is running, restarts project.
        @active()
        @database.get_project
            project_id : @project_id
            columns    : ['state', 'users', 'settings', 'run_quota']
            cb         : (err, x) =>
                @active()
                if err
                    dbg("error -- #{err}")
                    opts.cb(err)
                    return
                if x.state?.state not in ['running', 'starting', 'pending']
                    dbg("project not active")
                    opts.cb()
                    return
                cur = quota_compute.quota(x.settings, x.users)
                if underscore.isEqual(x.run_quota, cur)
                    dbg("running, but no quotas changed")
                    opts.cb()
                else
                    opts.cb()
                    dbg('running and a quota changed; restart')
                    # CRITICAL: do NOT wait on this before returning!  The set_all_quotas call must
                    # complete quickly (in an HTTP requrest), whereas restart can easily take 20s,
                    # and there is no reason to wait on this.
                    @restart()




