###
projects-on-k8s.coffee -- Run projects on k8s.
###

async       = require('async')
winston     = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})
misc        = require('smc-util/misc')
{defaults, required} = misc

LOCAL_HUB_PORT = 6000  # TODO...

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
            cb         : undefined
        @_project_cache ?= {}  # create cache if not created
        p = @_project_cache[opts.project_id] ?= new Project(@, opts.project_id)  # create or return from cache
        opts.cb?(undefined, p)
        return p

{EventEmitter} = require('events')
class Project extends EventEmitter
    constructor: (@projects, @project_id) ->
        @dbg("constructor")()
        @_query = @projects.database.table('projects').get(@project_id)

    db: (opts) =>
        opts = defaults opts,
            set            : undefined  # object -- set these fields for this project in db.
            get            : undefined # array of fields to get about this project from db.
            wait           : undefined # if given, call db_wait with these inputs after finishing query
            wait_available : undefined # if given, call db_wait to wait until kubernetes.available is this number (undefined = 0).
            cb             : required
        if opts.wait_available?
            if opts.wait?
                opts.cb("do not define both wait and wait_available"); return
            opts.wait =
                pluck     : [kubernetes:{available:true}]  # pluck out kubernetes.available from object
                until     : (obj) -> (obj.kubernetes?.available ? 0) == opts.wait_available
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
            (cb) =>
                if opts.wait?
                    opts.wait.cb = cb
                    @db_wait(opts.wait)
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
    # CHANGE: now a synonym for start
    open: (opts) =>
        opts = defaults opts,
            host : undefined   # ignored
            cb   : required
        dbg = @dbg("open"); dbg()
        @start(cb:opts.cb)

    # start local_hub daemon running (must be opened somewhere)
    start: (opts) =>
        opts = defaults opts,
            set_quotas : undefined   # ignored
            cb         : required
        dbg = @dbg("start")
        @db
            set            : {run : true}
            wait_available : 1
            cb             : opts.cb

    # restart project -- must be opened or running
    restart: (opts) =>
        opts = defaults opts,
            set_quotas : undefined
            cb         : required
        dbg = @dbg("restart"); dbg()
        @db
            set  : {restart : true}
            wait :
                pluck : ['restart']
                until : (obj) -> not obj.restart
            cb   : opts.cb

    # kill everything and remove project from this compute
    # node  (must be opened somewhere)
    close: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("close()");
        dbg('close (=same as stop)')
        @stop(cb:opts.cb)

    ensure_opened_or_running: (opts) =>
        opts = defaults opts,
            cb : undefined  # cb(err, state='opened' or 'running')
        dbg = @dbg("ensure_opened_or_running"); dbg()
        @start(cb:opts.cb) # now the same thing as just starting project

    ensure_running: (opts) =>
        opts = defaults opts,
            cb : undefined
        dbg = @dbg("ensure_running"); dbg()
        @start(cb:opts.cb) # now the same thing as just starting project

    ensure_closed: (opts) =>
        opts = defaults opts,
            cb     : undefined
        dbg = @dbg("ensure_closed()"); dbg()
        @stop(cb:opts.cb) # now the same thing as stop

    # does nothing for k8s -- move meaningless
    move: (opts) =>
        opts = defaults opts,
            target : undefined # ignored
            force  : false     # ignored
            cb     : required
        dbg = @dbg("move(target:'#{opts.target}')"); dbg()
        opts.cb('move has no meaning for k8s')

    db_wait: (opts) =>
        opts = defaults opts,
            pluck     : required  # array of field names (strings) or objects (passed as inputs to RethinkDB pluck command)
            until     : required  # function -- waits until evaluates to true
            timeout_s : 5*60      # fail with error after this many seconds
            cb        : required
        dbg = @dbg("db_wait(#{misc.to_json(opts.pluck)})"); dbg()
        q = @projects.database.table('projects').getAll(@project_id)
        q.pluck(opts.pluck...).changes(includeInitial:true, includeStates:false).run (err, cursor) =>
            if err
                opts.cb(err)
                return
            done = (err) =>
                if opts.cb?
                    clearTimeout(timeout)
                    cursor.close()
                    opts.cb(err)
                    delete opts.cb
            timeout = setTimeout((()=>done('timeout')), 1000*opts.timeout_s)
            cursor.each (err, x) =>
                if err
                    done(err)
                else if opts.until(x.new_val)
                    done()

    stop: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("stop"); dbg()
        @db
            set            : {run : false}
            wait_available : 0
            cb             : opts.cb

    # no-op, since everything is always saved.
    save: (opts) =>
        opts = defaults opts,
            min_interval  : 5  # ignored
            cb            : undefined
        dbg = @dbg("save"); dbg("save no-op")
        opts.cb?()

    address: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("address"); dbg()
        host = secret_token = undefined
        get_host = (cb) =>
            @db
                get : ['kubernetes', 'secret_token']
                cb  : (err, x) =>
                    if err or not x?
                        cb(err)
                        return
                    if x.kubernetes?.available == 0
                        cb()
                        return
                    host = x.kubernetes?.ip
                    secret_token = x.secret_token
                    cb()

        async.series([
            (cb) =>
                get_host(cb)
            (cb) =>
                if host
                    cb()
                else
                    @start(cb:cb)
            (cb) =>
                if host
                    cb()
                else
                    # try again
                    get_host(cb)
        ], (err) =>
            if err
                opts.cb(err)
            else
                if host?
                    address = {host:host, port:LOCAL_HUB_PORT, secret_token:secret_token}
                    dbg("address is ", address)
                    opts.cb(undefined, address)  # TODO
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