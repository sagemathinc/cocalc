###
projects-on-k8s.coffee -- Run projects on k8s.
###

async       = require('async')
winston     = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})
misc        = require('smc-util/misc')
{defaults, required} = misc


exports.projects = (database) ->
    return new Projects(database)

class Projects
    constructor : (@database) ->
        @dbg("constructor")()

    dbg: (f) ->
        return (m...) -> winston.debug("Projects.#{f}:", m...)

    project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_project_cache ?= {}  # create cache if not created
        p = @_project_cache[opts.project_id] ?= new Project(@, opts.project_id)  # create or return from cache
        opts.cb(undefined, p)
        return p

{EventEmitter} = require('events')
class Project extends EventEmitter
    constructor: (@projects, @project_id) ->
        @dbg("constructor")()
        @_query = @projects.database.table('projects').get(@project_id)

    db: (opts) =>
        opts = defaults opts,
            set : undefined  # object -- set these fields for this project in db.
            get : undefined # array of fields to get about this project from db.
            cb  : required
        if not opts.set? and not opts.get?
            opts.cb()
            return

        x = undefined
        async.series([
            (cb) =>
                if opts.set?
                    @_query.update(opts.set).run(cb)
                else
                    cb()
            (cb) =>
                if opts.get?
                    @_query.pluck(opts.get).run (err, _x) =>
                        x = _x; cb(err)
                else
                    cb()
        ], (err) -> opts.cb(err, x))

    dbg: (f) =>
        return (m...) => winston.debug("Project('#{@project_id}').#{f}:", m...)

    free: () =>
        # Ensure that next time this project gets requested, a fresh one is created, rather than
        # this cached one, which has been free'd up, and will no longer work.
        delete @compute_server._project_cache[@project_id]
        # Make sure nothing else reacts to changes on this ProjectClient, since they won't happen.
        @removeAllListeners()

    state: (opts) =>
        opts = defaults opts,
            force  : false  # backward compat
            update : false  # backward compat
            cb     : required     # cb(err, {state:?, time:?, error:?})
        dbg = @dbg("state()"); dbg('todo')
        opts.cb()     #TODO

    # information about project (ports, state, etc. )
    status: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("status"); dbg('todo')
        opts.cb()     #TODO

    # COMMANDS:

    # open project files on some node.
    # A project is by definition opened on a host if @host is set.
    open: (opts) =>
        opts = defaults opts,
            host : undefined   # ignored
            cb   : required
        dbg = @dbg("open"); dbg('todo')
        opts.cb()     #TODO

    # start local_hub daemon running (must be opened somewhere)
    start: (opts) =>
        opts = defaults opts,
            set_quotas : undefined   # ignored
            cb         : required
        dbg = @dbg("start")
        @db
            set : {run : true}
            cb  : opts.cb

    # restart project -- must be opened or running
    restart: (opts) =>
        opts = defaults opts,
            set_quotas : undefined
            cb         : required
        dbg = @dbg("restart"); dbg('todo')
        opts.cb()     #TODO

    # kill everything and remove project from this compute
    # node  (must be opened somewhere)
    close: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("close()"); dbg('todo')
        opts.cb?()  #TODO

    ensure_opened_or_running: (opts) =>
        opts = defaults opts,
            cb : undefined  # cb(err, state='opened' or 'running')
        dbg = @dbg("ensure_opened_or_running"); dbg('todo')
        opts.cb?(undefined, 'opened')  #TODO

    ensure_running: (opts) =>
        opts = defaults opts,
            cb : undefined
        dbg = @dbg("ensure_running"); dbg('todo')
        opts.cb?() # TODO

    ensure_closed: (opts) =>
        opts = defaults opts,
            cb     : undefined
        dbg = @dbg("ensure_closed()"); dbg('todo')
        opts.cb?() # TODO


    # Determine whether or not a storage request is currently running for this project
    is_storage_request_running: () =>
        # Todo
        return false

    wait_storage_request_finish: (opts) =>
        opts = defaults opts,
            timeout : 60*30
            cb      : required
        dbg = @dbg("wait_storage_request_finish"); dbg('todo')
        opts.cb?() # TODO

    wait_stable_state: (opts) =>
        opts = defaults opts,
            timeout : 60*10  # 10 minutes
            cb      : required
        dbg = @dbg("wait_stable_state"); dbg('todo')
        opts.cb?() # TODO

    wait_for_a_state: (opts) =>
        opts = defaults opts,
            timeout : 60         # 1 minute
            states  : required
            cb      : required
        dbg = @dbg("wait_for_a_state"); dbg('todo')
        opts.cb?() # TODO

    # does nothing for k8s -- move meaninginless
    move: (opts) =>
        opts = defaults opts,
            target : undefined # ignored
            force  : false     # ignored
            cb     : required
        dbg = @dbg("move(target:'#{opts.target}')"); dbg('todo')
        opts.cb('not meaning for k8s')

    stop: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("stop"); dbg('todo')
        @db
            set : {run : false}
            cb  : opts.cb

    # no-op, since everything is always saved.
    save: (opts) =>
        opts = defaults opts,
            min_interval  : 5  # ignored
            cb            : undefined
        dbg = @dbg("save"); dbg('todo')
        opts.cb?()

    address: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("address"); dbg()
        host = undefined
        async.series([
            (cb) =>
                @db
                    get : ['kubernetes']
                    cb  : (err, x) =>
                        host = x?.ip
                        cb()
            (cb) =>
                if host?
                    cb()
                else
                    @start(cb:cb)  # TODO: maybe need to wait...
        ], (err) =>
            if err
                opts.cb(err)
            else
                if host?
                    opts.cb(undefined, {host:host, port:5000, secret_token:'foo'})  # TODO
                else
                    opts.cb('not ready yet')
        )

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
        dbg = @dbg("copy_path('#{opts.path}' to '#{opts.target_project_id}')")
        dbg('todo')
        opts.cb?('not implemented')  # TODO
        # HOW?  Could do via a service. Here we write request to database.
        # The service would consume that,
        # spinning up the relevant projects (if not running), then do the copy.
        # I made #v0 todo about this in k8s.tasks.

    directory_listing: (opts) =>
        opts = defaults opts,
            path      : ''
            hidden    : false
            time      : false        # sort by timestamp, with newest first?
            start     : 0
            limit     : -1
            cb        : required
        dbg = @dbg("directory_listing"); dbg('todo')
        # How? Similar to copy_path.
        opts.cb?("not implemented") # TODO

    read_file: (opts) =>
        opts = defaults opts,
            path    : required
            maxsize : 3000000    # maximum file size in bytes to read
            cb      : required   # cb(err, Buffer)
        dbg = @dbg("read_file(path:'#{opts.path}')"); dbg('todo')
        opts.cb?('not implemented')

    get_quotas: (opts) =>
        opts = defaults opts,
            cb           : required
        dbg = @dbg("get_quotas"); dbg()
        @projects.database.get_project_quotas
            project_id : @project_id
            cb         : opts.cb

    set_member_host: (opts) =>
        opts = defaults opts,
            member_host : required
            cb          : required
        opts.cb()  # NO-OP

    set_quotas: (opts) =>
        dbg = @dbg("set_quotas"); dbg('todo')
        opts.cb?()

    set_all_quotas: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("set_all_quotas"); dbg('todo')
        opts.cb?()