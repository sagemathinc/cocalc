###
Backup -- Make a complete snapshotted dump of the system or individual projects to data/backup/
          Restore from this dump.

###


EXCLUDES=['.bup', '.sage/gap', '.sage/cache', '.sage/temp', '.sage/tmp', '.sagemathcloud', '.forever', '.cache', '.fontconfig', '.texmf-var', '.trash', '.npm', '.node-gyp']

async = require('async')
misc  = require('misc')

{defaults, required} = misc
misc_node = require('misc_node')
winston = require('winston')

cassandra = require('cassandra')

BACKUP_DIR  = process.env['SALVUS_BACKUP']
DB_DUMP_DIR = BACKUP_DIR + '/db_dump'

process.env['BUP_DIR'] = BACKUP_DIR + '/bup'

exec = require('child_process').exec
HOST = undefined
exec 'hostname', (err, stdout, stderr) ->
    HOST = stdout.trim()           # delete trailing newline
    console.log("'#{HOST}'")

bup = (opts) ->
    opts = defaults opts,
        args    : []
        timeout : 3600
        bup_dir : process.env['BUP_DIR']
        cb      : (err, output) ->
            if err
                winston.debug("Error -- #{err}")
            else
                winston.debug("bup output -- #{misc.to_json(output)}")

    if typeof(opts.args) == "string"
        command = "bup " + opts.args
        opts.args = []
    else
        command = "bup"

    misc_node.execute_code
        command : command
        args    : opts.args
        timeout : opts.timeout
        env     : {BUP_DIR : opts.bup_dir}
        cb      : opts.cb

##

exports.snapshot = (opts) ->
    opts = defaults opts,
        keyspace : 'test'
        hosts    : ['localhost']
        path     : ['/mnt/backup/cache/']
        cb       : required
    return new Snapshot(opts.keyspace, opts.hosts, opts.path, opts.cb)

class Snapshot
    constructor: (@keyspace, @hosts, @path, cb) ->
        @_projects = {}
        async.series([
            (cb) =>
                @db = new cassandra.Salvus(keyspace:@keyspace, hosts:@hosts, cb:cb)
            (cb) =>
                 misc_node.execute_code
                     command : "mkdir"
                     args    : ['-p', @path]
                     cb      : cb
        ], (err) =>
            if err
                cb(err)
            else
                cb(false, @)
        )

    project: (project_id, cb) =>
        p = @_projects[project_id]
        if p?
            cb(false, p)
        else
            new Project @, project_id, (err, p) =>
                if not err
                    @_projects[project_id] = p
                cb(err, p)

    user: (project_id, cb) =>
        @db.get_project_location
            project_id : project_id
            cb : (err, location) ->
                if err
                    cb(err)
                else
                    cb(false, "#{location.username}@#{location.host}")

class Project
    constructor: (@snapshot, @project_id, cb) ->
        # If necessary, initialize the local bup directory for this project
        @last_db_time = 0  # most recent timestamp of any pack file that we know is in the database.
        @bup_dir = @snapshot.path + '/' + @project_id
        @lock = undefined
        @bup
            args : ['init']
            cb   : (err) => cb(err, @)

    bup: (opts) =>
        opts.bup_dir = @bup_dir
        bup(opts)

    user: (cb) =>
        # do not cache, since it could change
        @snapshot.user(@project_id, cb)

    snapshot_compute_node: (cb) =>
        # Make a new bup snapshot of the remote compute node.
        args = undefined
        user = undefined
        @lock = 'snapshot'
        async.series([
            (cb) =>
                @user (err, _user) =>
                    if err
                        cb(err)
                    else
                        user = _user
                        args = ['on', user, 'index']
                        for path in EXCLUDES
                            args.push('--exclude')
                            args.push(path)
                        args.push('.')
                        cb()
            (cb) =>
                @bup
                    args    : args
                    cb      : cb
            (cb) =>
                @bup
                    args    : ['on', user, 'save', '--strip', '-n', 'master', '.']
                    cb      : cb
        ], (err) =>
            @lock = undefined
            cb(err)
        )


    snapshots: (cb) =>
        # Return list of dates of *all* snapshots of this project.
        @bup
            args : ['ls', 'master']
            cb   : (err, output) =>
                if err
                    cb(err)
                else
                    v = output.stdout.split('\n')
                    v = v.slice(0, -2)
                    cb(false, (x.slice(0,-1) for x in v))

    push_to_database: (cb) =>
        # Determine which local packfiles are newer than the last one we grabbed
        # or pushed to the database, and save each of them to the database.

    pull_from_database: (cb) =>
        # Get all pack files in the database that are newer than the last one we grabbed.
        # Set refs/heads/master.

    push_to_compute_node: (cb) =>
        # Rsync the newest snapshot to the user@hostname that the database says the project is deployed as;
        # or raise an error if not.
        if @last_db_time == 0 # nothing to do
            cb(); return

    ls: (opts) =>
        # Return list of names of files in the given path in the project; directories end in "/".
        opts = defaults opts,
            path     : '.'
            snapshot : 'latest'
            hidden   : false
            cb       : undefined








########################
########################


exports.backup = (opts) ->
    opts = defaults opts,
        keyspace : 'test'
        hosts    : ['localhost']
        cb       : required
    new Backup(opts.keyspace, opts.hosts, opts.cb)

class Backup
    constructor: (@keyspace, @hosts, cb) ->
        async.series([
            (cb) =>
                 misc_node.execute_code
                     command : "mkdir"
                     args    : ['-p', process.env['BUP_DIR']]
                     cb      : cb
            (cb) =>
                bup(args:'init', cb:cb)  # initialize bup dir, if necessary
            (cb) =>
                @db = new cassandra.Salvus(keyspace:@keyspace, hosts:@hosts, cb:cb)
        ], (err) =>
            if err
                cb(err)
            else
                cb(false, @)
        )

    backup_all_projects: (cb) =>
        # Backup all projects to the backup archive.  This creates a new commit
        # for each modified project.
        @projects (err, v) =>
            if err
                cb?(err)
            else
                start = v.length
                winston.debug("Backing up #{start} projects...")
                f = () =>
                    if v.length > 0
                        x = v.pop()
                        @backup_project x[0], x[1], (err) =>
                            winston.debug("#{v.length} of #{start} projects remain...")
                            if err
                                cb?(err)
                            else
                                # do another
                                f()
                    else
                        cb?() # all done successfully
                f() # start it going.

    projects: (cb) =>    # cb(err, list_of_pairs))
        # Query database for list of all (project_id, location) pairs.
        @db.select
            table     : 'projects'
            json      : ['location']
            columns   : ['project_id', 'location']
            objectify : false
            cb        : (error, results) ->
                if error
                    cb(error)
                else
                    cb(false, results)


    backup_project: (project_id, location, cb) =>   # cb(err)
        # Backup the project with given id at the given location, if anything has changed
        # since the last backup.
        if not location? or not location.username? or location.username.length != 8
            winston.debug("skip snapshot of #{misc.to_json(location)}; only for devel/testing")
            cb?()
            return

        user = "#{location.username}@#{location.host}"
        winston.debug("backing up project at #{user}")

        # First make the index on the remote machine
        args = ['on', user, 'index']
        for path in EXCLUDES
            args.push('--exclude')
            args.push(path)
        args.push('.')
        bup
            args    : args
            timeout : 3600
            cb      : (err, out) =>
                if err
                    # Error making the index
                    cb?(err)
                else
                    # Make index, now create the backup.
                    bup
                        args    : ['on', user, 'save', '-9', '--strip', '-n', project_id, '.']
                        timeout : 3600  # data could take a while to transfer (?)
                        cb      : ( err, out) =>
                            cb?(err)


    snapshots: (opts) =>
        # Return snapshots times and locations of a given project.
        opts = defaults opts,
            project_id   : required
            limit        : undefined
            cb           : required
                      # cb(err, sorted -- starting with newest -- list of pairs [time, host])

        where = {project_id: opts.project_id}
        @db.select
            table     : 'project_snapshots'
            where     : where
            limit     : opts.limit
            columns   : ['time', 'host']
            objectify : false
            order_by  : 'time'
            cb        : opts.cb

    # ssh into host (unless 'localhost') and restore newest snapshot of project to location.
    _restore_project_from_host: (opts) =>
        opts = defaults opts,
            project_id : required
            location   : required  # target of restore
            host       : required  # source of restore
            timeout    : 30
            cb         : undefined # cb(err)

        misc_node.execute_code
            command : 'ssh'
            args    : [opts.host, 'salvus/salvus/scripts/restore_project',
                       '--project_id=' + opts.project_id,
                       '--username=' + opts.location.username,
                       '--host=' + opts.location.host,
                       '--port=' + opts.location.port,
                       '--path=' + opts.location.path]
            cb      : (err, output) =>
                winston.debug("output : #{misc.to_json(output)}")
                opts.cb?(err)

    restore_project: (opts) =>
        opts = defaults opts,
            project_id   : required
            location     : required   # location to restore *to*
            host         : undefined  # if given, just attempt to restore latest version from this host
            cb           : undefined  # cb(err, {time:? host:?})
            # TODO:
            # time         : undefined  # choose global backup with timestamp closest to this.

        if opts.host?
            @_restore_project_from_host(opts)
            return

        snapshots = undefined
        attempted = {}
        time      = undefined
        host      = undefined
        async.series([
            (cb) =>
                if opts.host?
                    cb(); return
                # Find best-match backup on a host not in the exclude_host list.
                # TODO: I'm just going to write a quick db query that gets all backups
                # and find the right one.  Later, this can be made more scalable and faster.
                @snapshots
                    project_id : opts.project_id
                    cb         : (err, results) =>
                        if err
                            cb(err)
                        else
                            snapshots = results
                            cb()
            (cb) =>
                f = () =>
                    if snapshots.length == 0
                        cb("Unable to restore backup -- no available working snapshots of project.")
                        return
                    [time, host] = snapshots.pop()
                    if attempted[host]?
                        f()  # try again with next snapshot
                        # TODO: rewrite this somehow to not use recursion
                        return
                    attempted[host] = true
                    @restore_project
                        project_id : opts.project_id
                        location   : opts.location
                        host       : host
                        cb         : (err, result) =>
                            if err
                                # Try again
                                f()
                            else
                                # Success!
                                cb()
                # Start trying
                f()
        ], (err) =>
            if err
                opts.cb?(err)
            else
                opts.cb?(false, {time:time, host:host})
        )

    dump_keyspace: (cb) =>
        # Dump all contents of database to data/backup/db/keyspace/ (which is first deleted),
        # then saves this directory to the bup archive (to "cassandra-"keyspace
        # branch with the commit the current timestamp).
        target = undefined
        async.series([
            (cb) =>
                @dump_keyspace_to_filesystem (err, _target) =>
                    target = _target
                    cb(err)
            (cb) =>
                bup
                    args : ['index', target]
                    timeout : 3600
                    cb : cb
            (cb) =>
                bup
                    args : ['save', '--strip', '-9', '-n', 'db-' + @keyspace, target]
                    timeout : 1000000 # could be large
                    cb : cb
        ], cb)

    dump_keyspace_to_filesystem: (cb) =>
        target = DB_DUMP_DIR + '/' + @keyspace
        tables = undefined
        async.series([
            (cb) =>
                 misc_node.execute_code
                    command : "mkdir"
                    args    : ['-p', target]
                    cb      : cb
            (cb) =>
                @db.select
                    table   : 'system.schema_columnfamilies'
                    columns : ['columnfamily_name']
                    cb      : (err, _tables) =>
                        if err
                            cb(err)
                        else
                            tables = (x[0] for x in _tables)
                            cb()
            (cb) =>
                winston.debug("Dumping tables #{misc.to_json(tables)}")
                f = () =>
                    if tables.length == 0
                        cb()  # done successfully; move on
                    else
                        table = tables.pop()
                        cmd = "echo \"copy #{table} to '#{target}/#{table}' with HEADER=true;\" | cqlsh -3 -k #{@keyspace}"
                        winston.debug(cmd)
                        misc_node.execute_code
                            command : cmd
                            timeout : 10000000 # it could take a very long time! -- effectively infinite
                            cb      : (err, output) =>
                                console.log(err, misc.to_json(output))
                                f() # do the next one (ignore errors)
                f() # start it
        ], (err) -> cb?(err, target))


    dump_table: (table) =>
        # Dump all contents of the given table to data/backup/db/keyspace/table

    restore_keyspace: (keyspace, commit) =>
        # 1. Restore the given keyspace (and commit, if given) from the bup archive
        # to the directory data/backup/db/keyspace
        # 2. Copy all data from the given backup into the current keyspace of the
        # database @keyspace.  If you want the result to be exactly what was backed up
        # in data/backup/db/keyspace call init_database first.

    init_keyspace: () =>
        # Delete everything from @keyspace, then initialize all tables
        # using the current db_schema file.

    snapshot_active_projects: (opts={}) =>
        opts = defaults opts,
            # For each project we consider, if our snapshot of it is older than max_snapshot_age, we make a snapshot
            max_snapshot_age : 60*5
            # cb(err, list of project ids where we made a snapshot)
            cb : undefined

        @db.select
            table   : 'recently_modified_projects'
            columns : ['project_id', 'location']
            json    : ['location']
            objectify : true
            cb : (err, projects) =>
                if err
                    opts.cb?(err); return
                @db.select
                    table     : 'project_snapshots'
                    columns   : ['project_id']
                    where     : {host:HOST, time:{'>=':cassandra.seconds_ago(opts.max_snapshot_age)}}
                    objectify : false
                    cb        : (err, results) =>
                        if err
                            opts.cb?(err); return
                        winston.debug("results = #{misc.to_json(results)}")
                        done = {}
                        for x in results
                            done[x[0]] = true
                        winston.debug("done = #{misc.to_json(done)}")
                        # We launch all the snapshots in parallel, since most of the work is on the VM
                        # hosts that make the indexes, which happens elsewhere.  Also, bup seems to work
                        # just fine with making multiple snapshots at the same time (of different things).
                        do_backup = (proj) =>
                            winston.debug("Backing up #{misc.to_json(proj)}")
                            @backup_project proj.project_id, proj.location, (err) =>
                                if not err
                                    # record in database that we successfully made a backup
                                    @db.update
                                        table : 'project_snapshots'
                                        set   : {host: HOST}
                                        where : {project_id:proj.project_id, time:cassandra.now()}
                                else
                                    winston.debug("FAIL making backup of #{misc.to_json(proj)} -- #{err}")

                        for proj in projects
                            if not done[proj.project_id]?
                                do_backup(proj)

                        opts.cb?()

    start_project_snapshotter: (opts={}) =>
        opts = defaults opts,
            interval : 5*60   # every this many *seconds*, wake up, query database, and make snapshots

        f = () =>
            @snapshot_active_projects(max_snapshot_age:opts.interval)

        setInterval(f, opts.interval*1000)
