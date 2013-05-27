#################################################################
#
# snap -- a node.js program that snapshots user projects
#
#    coffee -o node_modules/ snap.coffee && echo "require('snap').start_server()" | coffee
#
#################################################################

secret_key_length             = 128
registration_interval_seconds = 15

net       = require 'net'
winston   = require 'winston'
fs        = require 'fs'

uuid      = require 'node-uuid'
async     = require 'async'
moment    = require 'moment'

message   = require 'message'
misc      = require 'misc'
misc_node = require 'misc_node'

program   = require 'commander'
daemon    = require 'start-stop-daemon'
cassandra = require 'cassandra'

{defaults, required} = misc

# Run a bup command
bup = (opts) ->
    opts = defaults opts,
        args    : []
        timeout : 3600   # default timeout of 1 hour -- could backup around 30-40 GB...?
        bup_dir : bup_dir  # defined below when initializing snap_dir
        cb      : (err, output) ->
            if err
                winston.info("error -- #{err}")
            else
                winston.info("bup output -- #{misc.to_json(output)}")

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


##------------------------------------------
# This section contains functions for accessing the bup archive
# through fuse. We do this as much as possible because bup-fuse
# and the operating system *caches* the directory tree information.
# If we try to use bup itself, every directory listing takes
# a huge amount of time.  Using bup-fuse instead, stores this
# work in memory, and we only have this slowness on the *first* read.

# Use the functions that start with "fuse_" below.

# Unfortunately, modifying the bup archive by adding new content
# does not change the fuse archive, hence the reference counting
# and other complexity below.

# Mount the bup archive somewhere.  This is a static view of the
# archive at mount time and will not reflect updates and new snapshots.
# You can mount the archive multiple times at once at *different*
# mount points.
_mount_bup_archive = (opts) ->
    opts = defaults opts,
        mountpoint : undefined
        cb         : required    # (err, mountpoint)
    if not opts.mountpoint?
        opts.mountpoint = snap_dir + '/fuse/' + uuid.v4() + '/'

    misc_node.ensure_containing_directory_exists opts.mountpoint, (err) ->
        if err
            opts.cb(err)
        else
            bup
                args : ['fuse', opts.mountpoint]
                cb   : (err) ->
                    opts.cb(err, opts.mountpoint)

# Unmount the bup archive
_unmount_bup_archive = (opts) ->
    opts = defaults opts,
        mountpoint : required
        rmdir      : false
        cb         : undefined

    misc_node.execute_code
        command : "fusermount"
        args    : ["-uz", opts.mountpoint]
        cb       : (err) ->
            fs.rmdir(opts.mountpoint, opts.cb)

# Increase the reference count on the mountpath and return absolute path to it.
# If there are no fuse mount paths, one is created.
_fuse_mountpath_cache = []   # array of pairs [path, reference count], with last pair the newest.

fuse_get_newest_mountpath = (cb) ->
    n = _fuse_mountpath_cache.length
    if n == 0
        fuse_create_new_mountpath(cb)
    else
        v = _fuse_mountpath_cache[n-1]
        v[1] += 1
        cb(false, v[0])

# If the newest mounted fuse path contains path, then return it.
# Otherwise mount the most up-to-date archive using fuse, and again
# test of the path exists; returns an error if not.
#
#     cb(err, fuse_path) with fuse_path reference count incremented
#
fuse_get_mountpath_containing = (path, cb) ->
    fuse_path = undefined
    new_mount = undefined
    async.series([
       (cb) ->
           fuse_get_newest_mountpath (err, _path) ->  # this adds a lock to the path on success
               fuse_path = _path
               cb(err)
       (cb) ->
           fs.exists "#{fuse_path}/#{path}/", (exists) ->
               new_mount = not exists
               cb()
       (cb) ->
           if not new_mount
               cb()
           else
               fuse_free_mountpath(fuse_path)
               fuse_path = undefined
               fuse_create_new_mountpath (err, _path) ->
                   fuse_path = _path
                   cb(err)
       (cb) ->
           fs.exists "#{fuse_path}/#{path}/", (exists) ->
               if not exists
                   fuse_free_mountpath(fuse_path)
                   cb("path '#{path}' does not exist in this snap repository")
               else
                   cb()
    ], (err) -> cb(err, fuse_path))



# Create a new mountpath, increment reference count, and return it.
fuse_create_new_mountpath = (cb) ->
    _mount_bup_archive
        cb: (err, mountpoint) ->
            if not err
                _fuse_mountpath_cache.push([mountpoint, 1])
            cb(err, mountpoint)

    # Also, if there are more than 10 mounted paths with reference count <= 0,
    # clean them up (leaving most recent 10).  This is so we don't end up with
    # a huge number of unused fuse mounts running (which wastes memory).
    n = _fuse_mountpath_cache.length
    if n > 10
        for i in [0...n-10]
            v = _fuse_mountpath_cache[i]
            if v[1] <= 0
                _fuse_mountpath_cache.splice(i,i) # remove i-th element from array
                _unmount_bup_archive
                    mountpoint : v[0]
                    rmdir      : true
                    cb         : (err) ->
                        if err # non-fatal
                            winston.info("Error unmounting bup archive -- #{err}.")
                        cb()

# Decrease reference count on the mountpath
fuse_free_mountpath = (mountpath) ->
    if not mountpath?
        return
    for i in [0..._fuse_mountpath_cache.length]
        v = _fuse_mountpath_cache[i]
        if v[0] == mountpath
            v[1] -= 1
            return

fuse_remove_all_mounts = (cb) ->
    winston.debug("removing all fuse mounts...")
    fs.readdir snap_dir + '/fuse/', (err, files) ->
        if err
            cb()  # ok, maybe doesn't exist; nothing we can do
            return
        f = (file, cb) ->
            mountpoint = "#{snap_dir}/fuse/#{file}"
            _unmount_bup_archive
                mountpoint : mountpoint
                rmdir      : true
                cb         : (err) ->
                    if err # non-fatal
                        winston.info("Error unmounting bup archive -- #{err}.")
                    cb()
        async.map(files, f, cb)


# Initialize local_snapshots, which is a map with domain the uuid's of projects
# that are snapshotted locally and values the array of snapshot timestamps
# for that project. This array is defined at startup, and all code in this
# file is expected to properly update this map upon making additional snapshots,
# so we never have to consult the filesystem to know what snapshots we own.
local_snapshots = undefined
initialize_local_snapshots = (cb) ->
    mountpoint = undefined
    async.series([
        (cb) ->
            fuse_get_newest_mountpath (err, _mountpoint) ->
                mountpoint = _mountpoint
                cb(err)
        (cb) ->
            fs.readdir mountpoint, (err, files) ->
                if err
                    cb(err)
                else
                    local_snapshots = {}
                    for f in files
                        if f[0] != '.'
                            local_snapshots[f] = []
                    cb()
        (cb) ->
            f = (project_id, cb) ->
                fs.readdir mountpoint + '/' + project_id, (err, files) ->
                    n = files.indexOf('latest')
                    if n != -1
                        files.splice(n, 1)
                    local_snapshots[project_id] = files
                    cb()
            async.map(misc.keys(local_snapshots), f, cb)
    ], (err) ->
        if mountpoint?
            fuse_free_mountpath(mountpoint)
        cb?(err)
    )


## ------------
# Provide listing of  available snapshots, projects, files, etc.,
# (Uses some behind-the-scenes caching via bup to make things faster.)
snap_ls = (opts) ->
    opts = defaults opts,
        project_id : undefined  # if not given, then return list of project_id's of all projects
                                # that have at least one snapshot; if given, return snapshots for that project... or
        snapshot   : undefined  # if given, project_id must be also given; then return directory listing for this snapshot
        path       : '.'        # return list of files in this path (if snapshot is defined)
        cb         : required   # cb(err, list)
    if not opts.project_id?
        opts.cb(false, _info_project_list())
    else if not opts.snapshot?
        opts.cb(false, _info_snapshot_list(opts.project_id))
    else
        _info_directory_list(opts.project_id, opts.snapshot, opts.path, opts.cb)

# Array of project_id's of all projects for which we have at least one snapshot.
# It is safe to modify the returned object.
_info_project_list = () ->
    return (project_id for project_id, snaps of local_snapshots when snaps.length > 0)

# Array of snapshots for the given project.  Safe to modify.
# Array is empty if we do not have any snapshots for the given project (yet).
_info_snapshot_list = (project_id) ->
    snaps = local_snapshots[project_id]
    if not snaps?
        return []
    return snaps.slice(0)   # make copy

# Modify the array "files" in place by append a slash after each
# entry in the array that is a directory.   Call "cb(err)" when done.
append_slashes_after_directory_names = (path, files, cb) ->
    f = (i, cb) ->
        fs.stat "#{path}/#{files[i]}", (err, stats) ->
            if err
                cb(err)
            else
                if stats.isDirectory(stats)
                    files[i] += '/'
                cb()
    async.map([0...files.length], f, cb)

# Get list of all files inside a given directory; in the list, directories have a "/" appended.
_info_directory_list = (project_id, snapshot, path, cb) ->  # cb(err, file list)
    snaps = local_snapshots[project_id]
    if not snaps?
        cb("no project -- #{project_id}")
        return
    if not snapshot in snaps
        cb("no snapshot #{snapshot} in project #{project_id}")
        return

    # 1. Get the newest mounted fuse path (which will create a mount if there aren't any).
    # 2. Check to see if the requested project_id/snapshot/path is available in path.
    # 3. If so, done -- use it, then unlock it; done.
    # 4. If not (hence it is a very new snapshot), request creation of new fuse path.
    # 5. If project_id/snapshot/path does not exist, return []

    fuse_path       = undefined
    target_snapshot = undefined
    target_path     = undefined
    new_mount       = undefined
    files           = undefined

    async.series([
       (cb) ->
           p = "#{project_id}/#{snapshot}"
           fuse_get_mountpath_containing p, (err,_fuse) ->
               if err
                   cb(err)
               else
                   fuse_path = _fuse
                   target_snapshot = _fuse + '/' + p
                   cb()
       (cb) ->
           target_path = "#{target_snapshot}/#{path}"
           fs.readdir target_path, (err, _files) ->
                files = _files
                cb(err)  # if path doesn't exist, get this err
       (cb) ->
           append_slashes_after_directory_names(target_path, files, cb)
    ], (err) ->
        fuse_free_mountpath(fuse_path)
        cb(err, files)
    )


test1 = () ->
    snap_ls
        project_id : 'f0c51934-9d09-4586-b8db-fd2e6f11e57e'
        snapshot   : '2013-05-26-140204' # '2013-05-23-184921'
        path       : 'salvus/salvus'
        cb         : (err, result) ->
            console.log("RESULT of test = ", err, misc.to_json(result))

## ------------


# Restore the given project/snapshot/path to where that project is deployed, according
# to the database (if it is deployed somewhere).  Raises an error if the project isn't
# deployed, or we are unable to connect to the remote server.

# !! For safety, always ensure there is a brand new snapshot of the target before !!
# !! running restore, unless this is an initial deployment.                       !!

snap_restore = (opts) ->
    opts = defaults opts,
        project_id : required
        snapshot   : required
        path       : '.'
        compress   : false        # use compression when transferring data via rsync
        cb         : undefined    # cb(err)

    snaps = local_snapshots[opts.project_id]

    if not snaps? or snaps.length == 0
        opts.cb?("There are no snapshots at all of project #{opts.project_id} stored on this snap server.")
        return

    if opts.snapshot not in snaps
        opts.cb?("There is no snapshot '#{opts.snapshot}' of project #{opts.project_id} on this snap server.")
        return

    # canonicalize the path a little, so no /'s at end
    while opts.path.length > 0 and opts.path[opts.path.length-1] == '/'
        opts.path = opts.path.slice(0, opts.path.length-1)
    if opts.path.length == 0
        opts.path = '.'

    user   = undefined
    outdir = "#{tmp_dir}/#{uuid.v4()}"
    target = "#{opts.project_id}/#{opts.snapshot}/#{opts.path}"

    async.series([
        # Get remote project location from database
        (cb) ->
            database.get_project_location
                project_id : opts.project_id
                cb         : (err, location) ->
                    if err
                        cb(err)
                    else
                        # TODO: support location.port != 22 and location.path != '.'   !!?
                        user = "#{location.username}@#{location.host}"
                        cb()
        # Extract file or path to temporary location.
        (cb) ->
            t = misc.walltime()
            bup
               args    : ["restore", "--outdir=#{outdir}", target]
               timeout : 2*3600   # 4 GB takes about 3 minutes...
               cb      : (err) ->
                   winston.info("restore time (#{target}) -- #{misc.walltime(t)}")
                   cb(err)

        # rsync the file/path to replace the same file/path on the remote machine
        (cb) ->
            # opts.path possibilities:
            #    "salvus/conf" (directory), "salvus/conf/admin.py" (file in directory),
            #    ".", "conf" (a directory with no slash), "admin.py" (a file)
            t = misc.walltime()
            i = opts.path.lastIndexOf('/')
            if i == -1
                dest = ""
            else
                dest = opts.path.slice(0, i)

            args = ["-axH", "#{outdir}/", "#{user}:#{dest}"]
            if opts.compress
                args.unshift("-z")

            misc_node.execute_code
                command : "rsync"
                args    : args
                timeout : 2*3600
                cb      : (err) ->
                    winston.info("rsync time (#{target}) -- #{misc.walltime(t)}")
                    cb(err)

    ], (err) ->
        opts.cb?(err)
        # Remove the temporary outdir (safe to do this after calling cb, so client can resume other stuff).
        misc_node.execute_code
            command : "rm"
            args    : ['-rf', outdir]
            timeout : 3600
    )


test2 = () ->
    t = misc.walltime()
    console.log("doing snap_restore test")
    snap_restore
        project_id : 'f0c51934-9d09-4586-b8db-fd2e6f11e57e'
        snapshot   : '2013-05-26-140204' # '2013-05-23-184921'
        path       : 'a 2.txt'           # '.', 'salvus/notes/'
        cb         : (err) ->
            console.log("restore test returned after #{misc.walltime(t)} seconds -- #{err}")

## -------
# Return a log of timestamps (commit names) that changed the file (or directory) at the
# given path, according to 'git log'.  For a discussion of using 'git log' with bup, see:
#    https://groups.google.com/forum/?fromgroups#!topic/bup-list/vwoSJ1j9JEg
## -------
snap_log = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : '.'
        cb         : required    # cb(err, array of time stamps)

    timestamps = []
    git_log = (path, cb) ->
        misc_node.execute_code
            command : "git"
            path    : bup_dir
            args    : ["log", '--pretty="%b"', '--follow', opts.project_id, '--', path]
            timeout : 360
            cb      : (err, output) ->
                console.log(output.stdout)
                for x in output.stdout.split('\n')
                    m = x.match(/\'[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]\'/)
                    if m?
                        s = parseInt(m[0].slice(1,-1))
                        s = moment(new Date(s*1000)).format('YYYY-MM-DD-HHmmss')
                        if s not in timestamps
                            timestamps.push(s)
                cb(err)

    async.parallel([
        (cb) ->
            git_log(opts.path, cb)
        (cb) ->
            git_log(opts.path + ".bup", cb)
    ], (err) ->
        timestamps.sort()
        timestamps.reverse()
        opts.cb(err, timestamps)
    )

test3 = () ->
    t = misc.walltime()
    console.log("doing snap_log test")
    snap_log
        project_id : 'f0c51934-9d09-4586-b8db-fd2e6f11e57e'
        path       : 'output-buffering.sagews'  #'a 2.txt'  # '.', 'salvus/notes/'
        cb         : (err, timestamps) ->
            console.log("timestamps = ", timestamps)
            console.log("log test returned after #{misc.walltime(t)} seconds -- #{err}")
            


# Enqueue the given project to be snapshotted as soon as possible.
# cb(err) upon completion of snapshot, where cb is optional.
# It is safe to enqueue a project repeatedly -- it'll get snapshoted
# at most every snap_interval seconds.

snapshot_queue = []

snapshot_project = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : undefined
    winston.info("enqueuing project #{opts.project_id} for snapshot")

    if opts.project_id == "6a63fd69-c1c7-4960-9299-54cb96523966"
        # special case -- my own local dev server account shouldn't backup into itself
        opts.cb?()
        return
    snapshot_queue.push(opts)

monitor_snapshot_queue = () ->
    if snapshot_queue.length > 0
        user = undefined
        {project_id, cb} = snapshot_queue.shift()
        winston.info("making a snapshot of project #{project_id}")
        async.series([
            # get deployed location of project (which can change at any time!)
            (cb) ->
                database.get_project_location
                    project_id : project_id
                    cb         : (err, location) ->
                        if err
                            cb(err)
                        else
                            user = "#{location.username}@#{location.host}"
                            # TODO: support location.port != 22 and location.path != '.'   !!?
                            cb()
            # create index
            (cb) ->
                t = misc.walltime()
                bup
                    args : ['on', user, 'index', '.']
                    cb   : (err) ->
                        winston.info("time to index #{project_id}: #{misc.walltime(t)} s")
                        cb(err)
            # save
            (cb) ->
                t = misc.walltime()
                d = Math.ceil(misc.walltime())
                bup
                    args : ['on', user, 'save', '-d', d, '--strip', '-q', '-n', project_id, '.']
                    cb   : (err) ->
                        winston.info("time to save snapshot of #{project_id}: #{misc.walltime(t)} s")
                        if not err
                            timestamp = moment(new Date(d*1000)).format('YYYY-MM-DD-HHmmss')
                            if not local_snapshots[project_id]?
                                local_snapshots[project_id] = [timestamp]
                            else
                                local_snapshots[project_id].push(timestamp)
                        cb(err)
            # update checksums in case of bitrot
            (cb) ->
                t = misc.walltime()
                bup
                    args : ['fsck', '--quick', '-g']
                    cb   : (err) ->
                        winston.info("time to update checksums: #{misc.walltime(t)} s")
                        cb(err)

        ], (err) ->
            cb?(err)
            setTimeout(monitor_snapshot_queue, 50)
        )
    else
        # check again in a second
        setTimeout(monitor_snapshot_queue, 1000)

# snapshot all projects in the given input array, and call opts.cb on completion.
snapshot_projects = (opts) ->
    opts = defaults opts,
        project_ids : required
        cb          : undefined
    if opts.project_ids.length == 0  # easy case
        opts.cb?()
        return
    async.map(opts.project_ids, ((p,cb) -> snapshot_project(project_id:p, cb:cb)), ((err, results) -> opts.cb?(err)))

##--

# Ensure that every project has at least one local snapshot.
# TODO: scalability plan -- we will divide projects into snapshot
# zones based on the first digit of the project_id (say).
ensure_all_projects_have_a_snapshot = (cb) ->   # cb(err)
    # Query the database for a list of all project_id's (at least those
    # not deleted), then
    # for each one, check if we have a backup.  If we don't,
    # queue that project for backing up.  Then drain that queue.

    winston.info("ensuring all projects have a snapshot")
    project_ids = undefined
    async.series([
        (cb) ->
             database.get_all_project_ids
                deleted : false
                cb      : (err, result) ->
                    project_ids = result
                    cb(err)
        (cb) ->
            snapshot_projects
                project_ids : (id for id in project_ids when not local_snapshots[id]?)
                cb          : cb
    ], cb)

##------------------------------------

handle_mesg = (socket, mesg) ->
    winston.info("handling mesg")

handle_connection = (socket) ->
    winston.info("handling a new connection")
    misc_node.unlock_socket socket, secret_key, (err) ->
        if err
            winston.info(err)
        else
            misc_node.enable_mesg(socket)
            handler = (type, mesg) ->
                if type == "json"
                    winston.info "received mesg #{json(mesg)}"
                    handle_mesg(socket, mesg)
            socket.on 'mesg', handler

create_server = (cb) ->  # cb(err, randomly assigned port)
    server = net.createServer(handle_connection)
    server.listen 0, program.host, (err) ->
        cb(err, server.address().port)

snap_dir  = undefined
bup_dir   = undefined
tmp_dir   = undefined
uuid_file = undefined
initialize_snap_dir = (cb) ->
    snap_dir = program.snap_dir
    if snap_dir[0] != '/'
        snap_dir = process.cwd() + '/' + snap_dir

    bup_dir   = snap_dir + '/bup'
    tmp_dir   = snap_dir + '/tmp'
    uuid_file = snap_dir + '/server_uuid'
    winston.info("path=#{snap_dir} should exist")

    async.series([
        (cb) ->
            misc_node.ensure_containing_directory_exists uuid_file, (err) ->
                if err
                    cb(err)
                else
                    bup(args:['init'])
                    cb()
        (cb) ->
            fuse_remove_all_mounts(cb)
        (cb) ->
            winston.debug("deleting temporary directory...")
            misc_node.execute_code
                command : "rm"
                args    : ['-rf', tmp_dir]
                timeout : 3600
                cb      : cb
        (cb) ->
            fs.mkdir(tmp_dir, cb)
    ], cb)
    # TODO: we could do some significant checks at this point, e.g.,
    # ensure "fsck -g" works on the archive, delete tmp files, etc.




# Generate or read uuid of this server, which is the longterm identification
# of this entire backup set.  This is needed because we may move where
# the backup sets is hosted -- in fact, the port (part of the location) changes
# whenever the server restarts.
snap_server_uuid = undefined
initialize_server_uuid = (cb) ->
    fs.exists uuid_file, (exists) ->
        if exists
            fs.readFile uuid_file, (err, data) ->
                snap_server_uuid = data.toString()
                cb()
        else
            snap_server_uuid = uuid.v4()
            fs.writeFile uuid_file, snap_server_uuid, cb

# Connect to the cassandra database server; sets the global database variable.
database = undefined
connect_to_database = (cb) ->
    new cassandra.Salvus
        hosts    : program.database_nodes.split(',')
        keyspace : program.keyspace
        cb       : (err, db) ->
            database = db
            cb(err)

# Generate the random secret key and save it in global variable
secret_key = undefined
generate_secret_key = (cb) ->
    require('crypto').randomBytes secret_key_length, (ex, buf) ->
        secret_key = buf.toString('base64')
        cb()

# Write entry to the database periodicially (with ttl) that this
# snap server is up and running, and provide the key.
register_with_database = (cb) ->
    winston.info("registering with database server...")
    host = "#{program.host}:#{listen_port}"
    database.update
        table : 'snap_servers'
        where : {id : snap_server_uuid}
        set   : {key:secret_key, host:host}
        ttl   : 2*registration_interval_seconds
        cb    : (err) ->
            setTimeout(register_with_database, 1000*registration_interval_seconds)
            cb?()

# Convert a bup timestamp to a Javascript Date object
#   '2013-05-21-124848' --> Tue May 21 2013 12:48:48 GMT-0700 (PDT)
to_int = (s) ->  # s is a 2-digit string that might be 0 padded.
    if s[0] == 0
        return parseInt(s[1])
    return parseInt(s)

bup_to_Date = (s) ->
    v = s.split('-')
    year  = parseInt(v[0])
    month = to_int(v[1]) - 1   # month is 0-based
    day   = to_int(v[2])
    hours = to_int(v[3].slice(0,2))
    minutes = to_int(v[3].slice(2,4))
    seconds = to_int(v[3].slice(4,6))
    return new Date(year, month, day, hours, minutes, seconds, 0)

# Return the age (in seconds) of the most recent snapshot, computed using our in memory
# cache of data about our local bup repo.  Returns a "very large number"
# in case that we have no backups of the given project yet.
age_of_most_recent_snapshot_in_seconds = (id) ->
    snaps = local_snapshots[id]
    if not snaps? or snaps.length == 0
        return 99999999999999
    last_time = bup_to_Date(snaps[snaps.length-1])
    now = new Date()
    return Math.floor((now - last_time) / 1000.0)

# Ensure that we maintain and update snapshots of projects, according to our rules.
snapshot_active_projects = (cb) ->
    project_ids = undefined
    winston.info("snapshot_active_projects...")
    async.series([
        (cb) ->
            database.select
                table   : 'recently_modified_projects'
                columns : ['project_id']
                objectify : false
                cb : (err, results) =>
                    project_ids = (r[0] for r in results)
                    cb(err)
        (cb) ->
            winston.info("recently modified projects: #{misc.to_json(project_ids)}")

            v = []
            for id in project_ids
                if age_of_most_recent_snapshot_in_seconds(id) >= program.snap_interval
                    v.push(id)
            winston.info("projects needing snapshots: #{misc.to_json(v)}")
            snapshot_projects
                project_ids : v
                cb          : cb
    ], (err) ->
        if err
            winston.info("Error snapshoting active projects -- #{err}")
            # TODO: We need to trigger something more drastic somehow at some point...?

        setTimeout(snapshot_active_projects, 10000)  # check every 10 seconds

        cb?()
    )





# Start the network server on a random port, connect to database,
# start registering, and start snapshoting.
listen_port = undefined
exports.start_server = start_server = () ->
    winston.info "starting server..."
    async.series([
        (cb) ->
            create_server (err,port) ->
                listen_port = port
                cb(err)
        (cb) ->
            initialize_snap_dir(cb)
        (cb) ->
            initialize_local_snapshots(cb)
        (cb) ->
            initialize_server_uuid(cb)
        (cb) ->
            generate_secret_key(cb)
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            register_with_database(cb)
        (cb) ->
            monitor_snapshot_queue()
            cb()
        (cb) ->
            ensure_all_projects_have_a_snapshot(cb)
        (cb) ->
            snapshot_active_projects(cb)
        #(cb) ->
        #    test3()
        #    cb()
    ], (err) ->
        if err
            winston.info("ERROR starting snap server: '#{err}'")
    )

program.usage('[start/stop/restart/status] [options]')
    .option('--pidfile [string]', 'store pid in this file', String, "data/pids/snap.pid")
    .option('--logfile [string]', 'write log to this file', String, "data/logs/snap.log")
    .option('--snap_dir [string]', 'all database files are stored here', String, "data/snap")
    .option('--snap_interval [seconds]', 'each project is snapshoted at most this frequently (default: 120 = 2 minutes)', Number, 10)
    .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "test")', String, 'test')
    .parse(process.argv)

if program._name == 'snap.js'
    #    winston.info "snap daemon"

    conf = {pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}

    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()

    clean_up = () ->
        # TODO/bug/issue -- this is not actually called :-(
        winston.info("cleaning up on exit")
        fuse_remove_all_mounts()

    daemon(conf, start_server).on('stop', clean_up).on('exit', clean_up)



