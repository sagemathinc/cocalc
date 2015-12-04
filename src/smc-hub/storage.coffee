###
Manage storage

###

{join}      = require('path')

async       = require('async')
winston     = require('winston')

misc_node   = require('smc-util-node/misc_node')

misc        = require('smc-util/misc')
{defaults, required} = misc

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

exclude = () ->
    return ("--exclude=#{x}" for x in misc.split('.sage/cache .sage/temp .trash .Trash .sagemathcloud .smc .node-gyp .cache .forever .snapshots *.sage-backup'))

# Low level function that save all changed files from a compute VM to a local path.
# This must be run as root.
copy_project_from_compute_to_storage = (opts) ->
    opts = defaults opts,
        project_id : required    # uuid
        host       : required    # hostname of computer, e.g., compute2-us
        path       : required    # target path, e.g., /projects0
        max_size_G : 50
        delete     : true
        cb         : required
    dbg = (m) -> winston.debug("copy_project_from_compute_to_storage(project_id='#{opts.project_id}'): #{m}")
    dbg("host='#{opts.host}', path='#{opts.path}'")
    args = ['rsync', '-axH', "--max-size=#{opts.max_size_G}G", "--ignore-errors"]
    if opts.delete
        args = args.concat(["--delete", "--delete-excluded"])
    else
        args.push('--update')
    args = args.concat(exclude())
    args = args.concat(['-e', 'ssh -T -c arcfour -o Compression=no -x  -o StrictHostKeyChecking=no'])
    source = "#{opts.host}:/projects/#{opts.project_id}/"
    target = "#{opts.path}/#{opts.project_id}/"
    args = args.concat([source, target])
    dbg("starting rsync...")
    start = misc.walltime()
    misc_node.execute_code
        command     : 'sudo'
        args        : args
        timeout     : 10000
        verbose     : true
        err_on_exit : true
        cb          : (err, output) ->
            if err and output?.exit_code == 24 or output?.exit_code == 23
                # exit code 24 = partial transfer due to vanishing files
                # exit code 23 = didn't finish due to permissions; this happens due to fuse mounts
                err = undefined
            dbg("...finished rsync -- time=#{misc.walltime(start)}s")#; #{misc.to_json(output)}")
            opts.cb(err)

# copy_project_from_storage_to_compute NEVER TESTED!
copy_project_from_storage_to_compute = (opts) ->
    opts = defaults opts,
        project_id : required    # uuid
        host       : required    # hostname of computer, e.g., compute2-us
        path       : required    # local source path, e.g., /projects0
        cb         : required
    dbg = (m) -> winston.debug("copy_project_from_storage_to_compute(project_id='#{opts.project_id}'): #{m}")
    dbg("host='#{opts.host}', path='#{opts.path}'")
    args = ['rsync', '-axH']
    args = args.concat(['-e', 'ssh -T -c arcfour -o Compression=no -x  -o StrictHostKeyChecking=no'])
    source = "#{opts.path}/#{opts.project_id}/"
    target = "#{opts.host}:/projects/#{opts.project_id}/"
    args = args.concat([source, target])
    dbg("starting rsync...")
    start = misc.walltime()
    misc_node.execute_code
        command     : 'sudo'
        args        : args
        timeout     : 10000
        verbose     : true
        err_on_exit : true
        cb          : (out...) ->
            dbg("finished rsync -- time=#{misc.walltime(start)}s")
            opts.cb(out...)

get_host_and_storage = (project_id, database, cb) ->
    dbg = (m) -> winston.debug("get_host_and_storage(project_id='#{project_id}'): #{m}")
    host = undefined
    storage = undefined
    async.series([
        (cb) ->
            dbg("determine project location info")
            database.table('projects').get(project_id).pluck(['storage', 'host']).run (err, x) ->
                if err
                    cb(err)
                else if not x?
                    cb("no such project")
                else
                    host    = x.host?.host
                    storage = x.storage?.host
                    if not host?
                        cb("project not currently open on a compute host")
                    else
                        cb()
        (cb) ->
            if storage?
                cb()
                return
            dbg("allocate storage host")
            database.table('storage_servers').pluck('host').run (err, x) ->
                if err
                    cb(err)
                else if not x? or x.length == 0
                    cb("no storage servers in storage_server table")
                else
                    # TODO: could choose based on free disk space
                    storage = misc.random_choice((a.host for a in x))
                    database.set_project_storage
                        project_id : project_id
                        host       : storage
                        cb         : cb
    ], (err) ->
        cb(err, {host:host, storage:storage})
    )


# Save project from compute VM to its assigned storage server.  Error if project
# not opened on a compute VM.
exports.save_project = save_project = (opts) ->
    opts = defaults opts,
        database   : required
        project_id : required    # uuid
        max_size_G : 50
        cb         : required
    dbg = (m) -> winston.debug("save_project(project_id='#{opts.project_id}'): #{m}")
    host = undefined
    storage = undefined
    async.series([
        (cb) ->
            get_host_and_storage opts.project_id, opts.database, (err, x) ->
                if err
                    cb(err)
                else
                    {host, storage} = x
                    cb()
        (cb) ->
            dbg("do the save")
            copy_project_from_compute_to_storage
                project_id : opts.project_id
                host       : host
                path       : "/" + storage   # TODO: right now all on same computer...
                cb         : cb
        (cb) ->
            dbg("save succeeded -- record in database")
            opts.database.update_project_storage_save
                project_id : opts.project_id
                cb         : cb
    ], (err) -> opts.cb(err))

get_local_volumes = (opts) ->
    opts = defaults opts,
        prefix : 'projects'
        cb     : required
    v = []
    misc_node.execute_code
        command : 'df'
        args    : ['--output=source']
        cb      : (err, output) ->
            if err
                opts.cb(err)
            else
                i = opts.prefix.length
                opts.cb(undefined, (path for path in misc.split(output.stdout).slice(1) when path.slice(0,i) == opts.prefix))

# Save all projects that have been modified in the last age_m minutes
# which are stored on this machine.
# If there are errors, then will get cb({project_id:'error...', ...})
exports.save_recent_projects = (opts) ->
    opts = defaults opts,
        database : required
        age_m    : required  # save all projects with last_edited at most this long ago in minutes
        threads  : 5         # number of saves to do at once.
        cb       : required
    dbg = (m) -> winston.debug("save_all_projects(last_edited_m:#{opts.age_m}): #{m}")
    dbg()

    errors        = {}
    local_volumes = {}
    projects      = undefined
    async.series([
        (cb) ->
            dbg("determine local volumes")
            get_local_volumes
                prefix : 'projects'
                cb     : (err, v) ->
                    if err
                        cb(err)
                    else
                        for path in v
                            local_volumes[path] = true
                        dbg("local volumes are #{misc.to_json(misc.keys(local_volumes))}")
                        cb()
        (cb) ->
            dbg("get all recently modified projects from the database")
            opts.database.recent_projects
                age_m : opts.age_m
                pluck : ['project_id', 'storage']
                cb    : (err, v) ->
                    if err
                        cb(err)
                    else
                        dbg("got #{v.length} recently modified projects")
                        # we could do this filtering on the server, but for little gain
                        projects = (x.project_id for x in v when local_volumes[x.storage?.host])
                        dbg("got #{projects.length} projects stored here")
                        cb()
        (cb) ->
            dbg("save each modified project")
            n = 0
            f = (project_id, cb) ->
                n += 1
                m = n
                dbg("#{m}/#{projects.length}: START")
                save_project
                    project_id : project_id
                    database   : opts.database
                    cb         : (err) ->
                        dbg("#{m}/#{projects.length}: DONE  -- #{err}")
                        if err
                            errors[project_id] = err
                        cb()
            async.mapLimit(projects, opts.threads, f, cb)
        ], (err) ->
            opts.cb(if misc.len(errors) > 0 then errors)
    )

# NEVER TESTED!
# Open project on a given compute server (so copy from storage to compute server).
# Error if project is already open on a server.
exports.open_project = open_project = (opts) ->
    opts = defaults opts,
        database   : required
        project_id : required
        cb         : required
    dbg = (m) -> winston.debug("open_project(project_id='#{opts.project_id}'): #{m}")
    host = undefined
    storage = undefined
    async.series([
        (cb) ->
            dbg('make sure project is not already opened somewhere')
            opts.database.get_project_host
                project_id : opts.project_id
                cb         : (err, x) ->
                    if err
                        cb(err)
                    else
                        if x?.host?
                            cb("project already opened")
                        else
                            cb()
        (cb) ->
            get_host_and_storage opts.project_id, opts.database, (err, x) ->
                if err
                    cb(err)
                else
                    {host, storage} = x
                    cb()
        (cb) ->
            dbg("do the open")
            copy_project_from_storage_to_compute
                project_id : opts.project_id
                host       : host
                path       : "/" + storage   # TODO: right now all on same computer...
                cb         : cb
        (cb) ->
            dbg("open succeeded -- record in database")
            opts.database.set_project_host
                project_id : opts.project_id
                host       : host
                cb         : cb
    ], opts.cb)


###
Snapshoting projects using bup
###

# Make snapshot of project using bup to local cache, then
# rsync that repo to google cloud storage.  Records successful
# save in the database.  Must be run as root.
exports.backup_project = (opts) ->
    opts = defaults opts,
        database   : required
        project_id : required
        bucket     : undefined   # e.g., 'smc-projects-bup' -- if given, will upload there using gsutil rsync
        cb         : required
    dbg = (m) -> winston.debug("backup_project(project_id='#{opts.project_id}'): #{m}")
    dbg()
    projects_path = undefined
    bup = bup1 = undefined
    async.series([
        (cb) ->
            dbg("determine volume containing project")
            get_host_and_storage opts.project_id, opts.database, (err, x) ->
                if err
                    cb(err)
                else
                    {host, storage} = x
                    projects_path = "/" + storage
                    cb()
        (cb) ->
            dbg("saving project to local bup repo")
            bup_save_project
                projects_path : projects_path
                project_id    : opts.project_id
                cb            : (err, _bup) ->
                    if err
                        cb(err)
                    else
                        bup = _bup           # probably "/bup/#{project_id}/{timestamp}"
                        i = bup.indexOf(opts.project_id)
                        if i == -1
                            cb("bup path must contain project_id")
                        else
                            bup1 = bup.slice(i)  # "#{project_id}/{timestamp}"
                            cb()
        (cb) ->
            if not opts.bucket
                cb(); return
            async.parallel([
                (cb) ->
                    dbg("rsync'ing pack files")
                    # Upload new pack file objects -- don't use -c, since it would be very (!!) slow on these
                    # huge files, and isn't needed, since time stamps are enough.  We also don't save the
                    # midx and bloom files, since they also can be recreated from the pack files.
                    misc_node.execute_code
                        timeout : 2*3600
                        command : 'gsutil'
                        args    : ['-m', 'rsync', '-x', '.*\.bloom|.*\.midx', '-r', bup+'/objects/', "gs://#{opts.bucket}/#{bup1}/objects/"]
                        cb      : cb
                (cb) ->
                    dbg("rsync'ing refs files")
                    # upload refs; using -c below is critical, since filenames don't change.
                    misc_node.execute_code
                        timeout : 2*3600
                        command : 'gsutil'
                        args    : ['-m', 'rsync', '-c', '-r', bup+'/refs/', "gs://#{opts.bucket}/#{bup1}/refs/"]
                        cb      : cb
                    # NOTE: we don't save HEAD, since it is always "ref: refs/heads/master"
            ], cb)
        (cb) ->
            dbg("recording successful backup in database")
            opts.database.table('projects').get(opts.project_id).update(last_backup: new Date()).run(cb)
    ], (err) -> opts.cb(err))


# this must be run as root.
bup_save_project = (opts) ->
    opts = defaults opts,
        projects_path : required   # e.g., '/projects3'
        project_id    : required
        cb            : required   # opts.cb(err, BUP_DIR)
    dbg = (m) -> winston.debug("bup_save_project(project_id='#{opts.project_id}'): #{m}")
    dbg()
    dir = "/bup/#{opts.project_id}"
    bup = undefined # will be set below to abs path of newest bup repo
    source = join(opts.projects_path, opts.project_id)
    async.series([
        (cb) ->
            dbg("create target bup repo")
            fs.exists dir, (exists) ->
                if exists
                    cb()
                else
                    fs.mkdir(dir, 0o700, cb)
        (cb) ->
            dbg('ensure there is a bup repo')
            fs.readdir dir, (err, files) ->
                if err
                    cb(err)
                else
                    files = files.sort()
                    if files.length > 0
                        bup = join(dir, files[files.length-1])
                    cb()
        (cb) ->
            if bup?
                cb(); return
            dbg("must create bup repo")
            bup = join(dir, misc.date_to_snapshot_format(new Date()))
            fs.mkdir(bup, cb)
        (cb) ->
            dbg("init bup repo")
            misc_node.execute_code
                command : 'bup'
                args    : ['init']
                timeout : 120
                env     : {BUP_DIR:bup}
                cb      : cb
        (cb) ->
            dbg("index the project")
            misc_node.execute_code
                command : 'bup'
                args    : ['index', source]
                timeout : 60*30   # 30 minutes
                env     : {BUP_DIR:bup}
                cb      : cb
        (cb) ->
            dbg("save the bup snapshot")
            misc_node.execute_code
                command : 'bup'
                args    : ['save', source, '-n', 'master', '--strip']
                timeout : 60*60*2  # 2 hours
                env     : {BUP_DIR:bup}
                cb      : cb
    ], (err) -> opts.cb(err, bup))

# Copy most recent bup archive of project to local bup cache, put the HEAD file in,
# then restore the most recent snapshot in the archive to the local projects path.
exports.restore_project = (opts) ->
    opts = defaults opts,
        database   : required
        project_id : required
        bucket     : required  # e.g., 'smc-projects-bup'
        cb         : required
    dbg = (m) -> winston.debug("restore_project(project_id='#{opts.project_id}'): #{m}")
    dbg()
    opts.cb("not implemented")



exports.update_storage = () ->
    # This should be run from the command line.
    # It checks that it isn't already running.  If not, it then
    # writes a pid file, copies everything over that was modified
    # since last time the pid file was written, then updates
    # all snapshots and exits.
    fs = require('fs')
    path = require('path')
    PID_FILE = path.join(process.env.HOME, '.update_storage.pid')
    dbg = (m) -> winston.debug("update_storage: #{m}")
    last_pid = undefined
    last_run = undefined
    database = undefined
    async.series([
        (cb) ->
            dbg("read pid file #{PID_FILE}")
            fs.readFile PID_FILE, (err, data) ->
                if not err
                    last_pid = data.toString()
                cb()
        (cb) ->
            if last_pid?
                try
                    process.kill(last_pid, 0)
                    cb("previous process still running")
                catch e
                    dbg("good -- process not running")
                    cb()
            else
                cb()
        (cb) ->
            if last_pid?
                fs.stat PID_FILE, (err, stats) ->
                    if err
                        cb(err)
                    else
                        last_run = stats.mtime
                        cb()
            else
                last_run = misc.days_ago(1) # go back one day the first time
                cb()
        (cb) ->
            dbg("last run: #{last_run}")
            dbg("create new pid file")
            fs.writeFile(PID_FILE, "#{process.pid}", cb)
        (cb) ->
            # TODO: clearly this is hardcoded!
            require('smc-hub/rethink').rethinkdb
                hosts : ['db0']
                pool  : 1
                cb    : (err, db) ->
                    database = db
                    cb(err)
        (cb) ->
            exports.save_recent_projects
                database : database
                age_m    : (new Date() - last_run)/1000/60
                threads  : 20
                cb       : (err) ->
                    dbg("save_all_projects returned errors=#{misc.to_json(err)}")
                    cb()
        (cb) ->
            {update_snapshots} = require('./rolling_snapshots')
            f = (n, cb) ->
                update_snapshots
                    filesystem : "projects#{n}"
                    cb         : cb
            async.map([0,1,2,3,4,5], f, cb)
    ], (err) ->
        dbg("finished -- err=#{err}")
        if err
            process.exit(1)
        else
            process.exit(0)
    )

###
Everything below is one-off code -- has no value, except as examples.
###


# Slow one-off function that goes through database, reads each storage field for project,
# and writes it in a different format: {host:host, assigned:assigned}.
exports.update_storage_field = (opts) ->
    opts = defaults opts,
        db      : required
        lower   : required
        upper   : required
        limit   : undefined
        threads : 1
        cb      : required
    dbg = (m) -> winston.debug("update_storage_field: #{m}")
    dbg("query database for projects with id between #{opts.lower} and #{opts.upper}")
    query = opts.db.table('projects').between(opts.lower, opts.upper)
    query = query.pluck('project_id', 'storage')
    if opts.limit?
        query = query.limit(opts.limit)
    query.run (err, x) ->
        if err
            opts.cb(err)
        else
            dbg("got #{x.length} results")
            n = 0
            f = (project, cb) ->
                n += 1
                dbg("#{n}/#{x.length}: #{misc.to_json(project)}")
                if project.storage? and not project.storage?.host?
                    y = undefined
                    for host, assigned of project.storage
                        y = {host:host, assigned:assigned}
                    if y?
                        dbg(misc.to_json(y))
                        opts.db.table('projects').get(project.project_id).update(storage:opts.db.r.literal(y)).run(cb)
                    else
                        cb()
                else
                    cb()
            async.mapLimit(x, opts.threads, f, (err)=>opts.cb(err))




# A one-off function that queries for some projects
# in the database that don't have storage set, and assigns them a given host,
# then copies their data to that host.

exports.migrate_projects = (opts) ->
    opts = defaults opts,
        db      : required
        lower   : required
        upper   : required
        host    : 'projects0'
        all     : false
        limit   : undefined
        threads : 1
        cb      : required
    dbg = (m) -> winston.debug("migrate_projects: #{m}")
    projects = undefined
    async.series([
        (cb) ->
            dbg("query database for projects with id between #{opts.lower} and #{opts.upper}")
            query = opts.db.table('projects').between(opts.lower, opts.upper)
            if not opts.all
                query = query.filter({storage:true}, {default:true})
            query = query.pluck('project_id')
            if opts.limit?
                query = query.limit(opts.limit)
            query.run (err, x) ->
                projects = x; cb(err)
        (cb) ->
            n = 0
            migrate_project = (project, cb) ->
                {project_id} = project
                m = n
                dbg("#{m}/#{projects.length-1}: do rsync for #{project_id}")
                src = "/projects/#{project_id}/"
                n += 1
                fs.exists src, (exists) ->
                    if not exists
                        dbg("#{m}/#{projects.length-1}: #{src} -- source not available -- setting storage to empty map")
                        opts.db.table('projects').get(project_id).update(storage:{}).run(cb)
                    else
                        cmd = "sudo rsync -axH --exclude .sage #{src}    /#{opts.host}/#{project_id}/"
                        dbg("#{m}/#{projects.length-1}: " + cmd)
                        misc_node.execute_code
                            command     : cmd
                            timeout     : 10000
                            verbose     : true
                            err_on_exit : true
                            cb          : (err) ->
                                if err
                                    cb(err)
                                else
                                    dbg("it worked, set storage entry in database")
                                    opts.db.table('projects').get(project_id).update(storage:{"#{opts.host}":new Date()}).run(cb)

            async.mapLimit(projects, opts.threads, migrate_project, cb)

    ], (err) ->
        opts.cb?(err)
    )




