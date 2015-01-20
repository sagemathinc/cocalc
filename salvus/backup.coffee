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


###
Backup -- Make a complete snapshotted dump of the system or individual projects to data/backup/
          Restore from this dump.

###


EXCLUDES=['.bup', '.sage/gap', '.sage/cache', '.sage/temp', '.sage/tmp', '.sagemathcloud', '.forever', '.cache', '.fontconfig', '.texmf-var', '.trash', '.npm', '.node-gyp']

MAX_BLOB_SIZE = 4000000

fs    = require('fs')

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
        @lock = 'init'
        # If necessary, initialize the local bup directory for this project
        @bup_dir   = @snapshot.path + '/' + @project_id
        @pack_dir  = @bup_dir + '/objects/pack'
        @head_file = @bup_dir + '/refs/heads/master'
        @last_time_file = @bup_dir + '/last_db_time'
        async.series([
            (cb) =>
                fs.exists @last_time_file, (exists) =>
                    if not exists
                        @last_db_time = '1969-12-31T16:00:00'
                        cb()
                    else
                        fs.readFile @last_time_file, (err, value) =>
                            @last_db_time = value.toString()
                            cb(err)
            (cb) =>
                @bup(args : ['init'], cb:cb)
        ], (err) =>
            @lock = undefined
            cb(err, @)
        )

    bup: (opts) =>
        opts.bup_dir = @bup_dir
        bup(opts)

    user: (cb) =>
        # do not cache, since it could change
        @snapshot.user(@project_id, cb)

    snapshot_compute_node: (cb) =>
        # Make a new bup snapshot of the remote compute node.
        if @lock?
            cb("locked"); return
        args = undefined
        user = undefined
        head = undefined
        before = undefined
        @lock = 'snapshot'
        async.series([
            (cb) =>
                # Create index command.
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
                # Run the index command (on the remote compute machine)
                @bup
                    args    : args
                    cb      : cb

            (cb) =>
                fs.readdir @pack_dir, (err, _before) =>
                    before = (x for x in _before when misc.filename_extension(x) == 'pack')
                    cb(err)

            (cb) =>
                # Save new data to local bup repo (master branch).
                @bup
                    args    : ['on', user, 'save', '-c', '--strip', '-q', '-n', 'master', '.']
                    cb      : (err, output) =>
                        if err
                            cb(err)
                        else
                            v = output.stderr.trim().split('\n')
                            head = v[v.length - 1]  # last line of stderr
                            cb()
            (cb) =>
                # Create file containing the newly created head hash value.
                fs.readdir @pack_dir, (err, after) =>
                    x = (v for v in after when misc.filename_extension(v) == 'pack' and v not in before)
                    if x.length != 1
                        cb("there should be exactly one new pack file")
                    else
                        head_file = @pack_dir + '/' + x[0].slice(0,-4) + 'head'
                        fs.writeFile(head_file, head, cb)

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

    ls: (opts) =>
        # Return list of names of files in the given path in the project; directories end in "/".
        opts = defaults opts,
            path     : '.'
            snapshot : 'latest'
            hidden   : false
            cb       : required
        args = ['ls', "master/#{opts.snapshot}/#{opts.path}"]
        if opts.hidden
            args.push('-a')
        @bup
            args : args
            cb   : (err, output) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(false, output.stdout.split('\n').slice(0,-1))

    push_to_database: (cb) =>
        # Determine which local packfiles are newer than the last one we grabbed
        # or pushed to the database, and save each of them to the database.
        if @lock?
            cb("locked"); return
        @lock = "push"
        to_save = undefined
        files   = undefined
        shas_in_db = undefined
        async.series([
            (cb) =>
                fs.readdir @pack_dir, (err, _files) =>
                    if err
                        cb(err)
                    else
                        files = _files
                        cb()
            (cb) =>
                @snapshot.db.select
                    table     : 'project_bups'
                    columns   : ['sha1']
                    objectify : false
                    where     : {project_id:@project_id}
                    cb        : (err, results) =>
                        if err
                            cb(err); return
                        shas_in_db = (x[0] for x in results)
                        cb()

            (cb) =>
                needs_to_be_saved = (file, cb) =>
                    if misc.filename_extension(file) not in ['pack']
                        # not a pack file
                        cb(false); return
                    if file.slice(5,-5) in shas_in_db
                        # already in database
                        cb(false); return
                    fs.stat @pack_dir + '/' + file, (err, stats) =>
                        if err
                            winston.debug("ERROR getting file timestamp for '#{file}' -- '#{err}'")
                            cb(false)
                        else
                            cb(misc.to_iso(stats.mtime) >= @last_db_time)
                async.filter files, needs_to_be_saved, (results) =>
                    to_save = results
                    cb()

            (cb) =>
                async.mapSeries(to_save, @_save_to_database, (err, results) => cb(err))

        ], (err) =>
            @lock = undefined
            cb(err)
        )

    _save_to_database: (file, cb) =>
        # Read the pack file, the idx file, and the head file (pointer into idx), and save them to the database.
        sha1      = file.slice(5,-5)
        pack_file = @pack_dir + '/' + file
        idx_file  = pack_file.slice(0,-4) + 'idx'
        head_file = pack_file.slice(0,-4) + 'head'
        time      = undefined
        async.series([
            (cb) =>
                fs.stat pack_file, (err, stats) =>
                    if err
                        cb(err)
                    else
                        time = misc.to_iso(stats.mtime)
                        cb()
            (cb) =>
                async.map [pack_file, idx_file, head_file], fs.readFile, (err, results) =>
                    if err
                        cb(err); return

                    pack = results[0]
                    idx  = results[1].toString('hex')
                    head = results[2].toString()
                    num_chunks = Math.ceil(pack.length / MAX_BLOB_SIZE)
                    console.log("num_chunks = ", num_chunks)

                    f = (number, cb) =>
                        console.log("handling chunk", number)
                        set =
                            sha1       : sha1
                            pack       : pack.slice(number*MAX_BLOB_SIZE, (number+1)*MAX_BLOB_SIZE).toString('hex')
                            num_chunks : num_chunks

                        if number == 0
                            set.idx  = idx
                            set.head = head

                        console.log("starting call to cassandra...")
                        @snapshot.db.update
                            table : 'project_bups'
                            set   : set
                            where :
                                project_id : @project_id
                                time       : time
                                number     : number
                            cb    : (err) =>
                                console.log("cassandra call returned")
                                cb(err)


                    # We do these in *series* since the whole point is to save memory; logically
                    # we could do them in parallel, but that would use too much memory, defeating the purpose.
                    async.eachSeries([0...num_chunks], f, cb)

        ], (err) =>
            if not err
                @last_db_time = cassandra.now()
                fs.writeFile(@last_time_file, @last_db_time, cb)
            else
                cb(err)
        )

    _write_to_disk: (commit, cb) =>   # commit = entry from the database as JSON object
        prefix = @pack_dir + '/pack-' + commit.sha1 + '.'
        async.parallel([
            (cb) => fs.writeFile(prefix + 'pack', commit.pack, cb)
            (cb) => fs.writeFile(prefix + 'idx',  commit.idx,  cb)
            (cb) => fs.writeFile(prefix + 'head', commit.head, cb)
            (cb) =>
                @last_db_time = misc.to_iso(commit.time)
                fs.writeFile(@last_time_file, @last_db_time, cb)
        ], cb)

    pull_from_database: (cb) =>
        # Get all pack files in the database that are newer than the last one we grabbed.
        # If we get anything, set refs/heads/master.
        if @lock?
            cb("locked"); return
        @lock   = 'pull'
        commits = []
        async.series([
            (cb) =>
                @snapshot.db.select
                    table     : 'project_bups'
                    columns   : ['sha1', 'pack', 'idx', 'head', 'number', 'num_chunks', 'time']
                    objectify : true
                    where     : {time:{'>':@last_db_time}, project_id:@project_id}
                    cb        : (err, results) =>
                        if err
                            cb(err); return
                        if results.length == 0
                            cb(); return

                        commits    = []
                        commit     = undefined
                        packs      = []
                        num_chunks = 0
                        pack_len  = 0

                        assemble_pack_file_for_last_commit = () ->
                            if num_chunks != packs.length
                                return "wrong number of chunks in database for #{commit.sha1}; got #{packs.length} but expected #{num_chunks}"
                            commit.pack = new Buffer(pack_len)
                            pos = 0
                            for p in packs
                                p.copy(commit.pack, pos)
                                pos += p.length
                            commits.push(commit)
                            return false

                        for chunk in results
                            if chunk.number == 0
                                if commit?
                                    err = assemble_pack_file_for_last_commit()
                                    if err
                                        cb(err); return
                                pack_len = 0
                                packs    = []
                                commit   = {time:chunk.time, sha1:chunk.sha1, idx:chunk.idx, head:chunk.head}
                                num_chunks = chunk.num_chunks

                            packs.push(chunk.pack)
                            pack_len += chunk.pack.length

                        cb(assemble_pack_file_for_last_commit())

            (cb) =>
                 async.mapSeries(commits, @_write_to_disk, (err, results) => cb(err))

            (cb) =>
                 # schema ensures that data is stored and returned in date order in the database, so last is newest.
                 if commits.length > 0
                    fs.writeFile(@head_file, commits[commits.length-1].head, cb)
                 else
                    cb()

        ], (err) =>
            @lock = undefined
            cb(err)
        )

    restore: (opts) =>
        opts = defaults opts,
            path   : '.'
            commit : 'latest'
            cb     : required
       # Restore the given path in the given commit to the deployed project.
       # If the project has no current location (username@host), raise an error.
       # If commit is anything except 'latest', then the path will be restored
       # but with the commit name post-pended to name.




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
                        args    : ['on', user, 'save', '--strip', '-n', project_id, '.']
                        timeout : 7200  # data could take a while to transfer (?)
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
                    args : ['save', '--strip', '-n', 'db-' + @keyspace, target]
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
