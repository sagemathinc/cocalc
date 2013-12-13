#################################################################
#
# snap -- a node.js program that snapshots user projects
#
# Server debugging:
#
#    coffee -o node_modules/ snap.coffee && echo "require('snap').start_server()" | coffee
#
# Client debugging:
#
#    coffee -o node_modules/ snap.coffee && echo "require('snap').test_client()" | coffee
#
#################################################################

DEFAULT_TIMEOUT   = 60*15   # time in seconds; max time we would ever wait to "bup index" or "bup save"

# The repo size cuttoff, so the repo won't be much bigger than this.
# 50GB -- typically takes <=2s max to do a listing, etc., on a commit,
# which is about as long as we want to wait.  Bigger is more efficient
# overall, because of much better de-duplication, but smaller means
# faster access.
REPO_SIZE_CUTOFF_BYTES=35000000

SALVUS_HOME=process.cwd()

# The following is an extra measure, just in case the user somehow gets around quotas.
# This is the max size of an individual snapshot; if exceeded, then project is black listed.
# This is for one single snapshot, not all of them in sum.
gigabyte = 1000*1000*1000
MAX_SNAPSHOT_SIZE = 10*gigabyte

secret_key_length             = 128
registration_interval_seconds = 15
snapshot_interval_seconds     = 10

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

# Set the log level to debug
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, level: 'debug')

# Run a bup command
bup = (opts) ->
    opts = defaults opts,
        args    : []
        timeout : DEFAULT_TIMEOUT
        bup_dir : required
        cb      : (err, output) ->
            if err
                winston.info("bup: error -- #{err}")
            else
                winston.info("bup: output -- #{misc.to_json(output)}")

    if typeof(opts.args) == "string"
        command = "/usr/bin/bup " + opts.args
        opts.args = []
    else
        command = "/usr/bin/bup"

    winston.debug("bup: bup_dir = '#{opts.bup_dir}'")
    misc_node.execute_code
        command : command
        args    : opts.args
        timeout : opts.timeout
        env     : {BUP_DIR : opts.bup_dir}
        err_on_exit : true
        cb      : opts.cb

##------------------------------------------
# This section contains functions for accessing the bup archive
# through fuse. At one point, we did this as much as possible because bup-fuse
# and the operating system *caches* the directory tree information.
# However, there are also major memory issues with doing this, which
# suggest that it is a bad idea.  Also, things are efficient and much
# faster if we just store a listing of all files at the time we make the
# snapshot.
#
# Past justifcation: If we try to use bup itself, every directory listing takes
# too much time.  Using bup-fuse instead, stores this
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
            if err
                opts.cb(err)
            else
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

    max_mounts = 10
    # Also, if there are more than max_mounts mounted paths with reference count <= 0,
    # clean them up (leaving most recent max_mounts).  This is so we don't end up with
    # a huge number of unused fuse mounts running (which wastes memory).
    n = _fuse_mountpath_cache.length
    if n > max_mounts
        for i in [0...n-max_mounts]
            j = n-max_mounts-1-i   # reverse order since deleting from list as we go, and don't want to mess up index.
            v = _fuse_mountpath_cache[j]
            if v[1] <= 0
                _fuse_mountpath_cache.splice(j,j) # remove j-th element from array
                _unmount_bup_archive
                    mountpoint : v[0]
                    rmdir      : true
                    cb         : (err) ->
                        if err # non-fatal
                            winston.info("Error unmounting bup archive -- #{err}.")

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



## ------------
# Provide listing of available snapshots/files in a project.
# Caching in the database is done by the client (hub, in this case).
snap_ls = (opts) ->
    opts = defaults opts,
        snapshot   : required
        repo_id    : required
        path       : '.'        # return list of files in this path
        cb         : required   # cb(err, list)
    bup
        args    : ['ls', '-a', "master/#{opts.snapshot}/#{opts.path}"]
        bup_dir : bup_dir + '/' + opts.repo_id
        timeout : 60
        cb      : (err, output) ->
            if err
                opts.cb(err)
            else
                v = output.stdout.trim().split('\n')
                opts.cb(false, v)


# Modify the array "files" in place by append a slash after each
# entry in the array that is a directory.   Call "cb(err)" when done.
append_slashes_after_directory_names = (path, files, cb) ->
    f = (i, cb) ->
        fs.stat "#{path}/#{files[i]}", (err, stats) ->
            if err
                # ignore -- can get errors from symbolic links, funny files, etc.
                cb()
            else
                if stats.isDirectory(stats)
                    files[i] += '/'
                cb()
    async.map([0...files.length], f, cb)


# List of all projects with at least one backup
_info_all_projects_with_a_backup = (cb) ->  # cb(err, list)
    database.select
        table     : 'snap_commits'
        where     : {server_id : server_id}
        columns   : ['project_id']
        objectify : false
        cb        : (err, results) =>
            if err
                cb(err)
            else
                obj = {}
                for r in results
                    obj[r[0]] = true
                cb(false, misc.keys(obj))

## OLD VERSION -- doesn't make sense with only one branch
#    bup
#        args    : ['ls']
#        timeout : 1800
#        cb      : (err, output) ->
#            if err
#                cb(err)
#            else
#                v = output.stdout.split('/\n')
#                cb(false, v)



# Restore the given project/snapshot/path to where that project is deployed, according
# to the database (if it is deployed somewhere).  Raises an error if the project isn't
# deployed, or we are unable to connect to the remote server.

snap_restore = (opts) ->
    opts = defaults opts,
        project_id      : required
        location        : undefined    # if undefined, queries the db for a default target (which must not be 'deploying' or undefined or '' in database!)
        snapshot        : required
        repo_id         : required
        path            : '.'
        compress        : false        # use compression when transferring data via rsync
        snapshot_first  : false        # ensure there is a new snapshot before restoring.
        backup          : '.trash'     # if defined, move any file that is about to be overwritten to here
        cb              : undefined    # cb(err)

    if opts.snapshot_first
        snapshot_project
            project_id : opts.project_id
            cb         : (err) ->
                if err
                    opts.cb(err)
                else
                    opts.snapshot_first = false
                    snap_restore(opts)
        return


    # canonicalize the path a little, so no /'s at end
    while opts.path.length > 0 and opts.path[opts.path.length-1] == '/'
        opts.path = opts.path.slice(0, opts.path.length-1)
    if opts.path.length == 0
        opts.path = '.'

    user   = undefined
    outdir = "#{tmp_dir}/#{uuid.v4()}"
    target = "master/#{opts.snapshot}/#{opts.path}"
    dest   = undefined
    escaped_dest = undefined
    location = undefined

    async.series([
        # Get remote project location from database
        (cb) ->
            if opts.location
                location = opts.location
                cb()
            else
                database.get_project_location
                    project_id : opts.project_id
                    cb         : (err, _location) ->
                        location = _location
                        cb(err)
        (cb) ->
            # TODO: support location.port != 22 and location.path != '.'   !!?
            if not location or not location.username? or not location.host?
                cb("unable to restore to location #{misc.to_json(location)}")
            else
                user = "#{location.username}@#{location.host}"
                cb()

        # Extract file or path to temporary location.
        (cb) ->
            t = misc.walltime()
            bup
               args    : ["restore", "--outdir=#{outdir}", target]
               bup_dir : bup_dir + '/' + opts.repo_id
               timeout : 2*3600   # 4 GB takes about 3 minutes...
               cb      : (err) ->
                   winston.info("restore time (#{target}) -- #{misc.walltime(t)}")
                   cb(err)

        # If target path is ., then remove .sagemathcloud*, since we *must* not restore it,
        # since it contains a bunch of invalid and out of data cache info, etc., which might
        # cause all kinds of trouble (not really that bad, but still).
        (cb) ->
            if opts.path != '.'
                cb(); return
            winston.debug("removing .sagemathcloud since target path is '.'")
            misc_node.execute_code
                command : "rm"
                args    : ["-rf", outdir + "/.sagemathcloud*"]   # use start since for SMCinSMC, we use .sagemathcloud-project_id.
                cb      : (err, output) ->
                    cb()

        (cb) ->
            # Determine destination path and ensure it exists.  Note that rsync seems like
            # it should do this automatically according to "man rsync", but it doesn't:
            #        http://stackoverflow.com/questions/13993236/why-rsync-uses-mkdir-without-p-option
            #
            # The opts.path possibilities:
            #    "salvus/conf" (directory), "salvus/conf/admin.py" (file in directory),
            #    ".", "conf" (a directory with no slash), "admin.py" (a file)
            t = misc.walltime()
            i = opts.path.lastIndexOf('/')
            if i == -1
                dest = ""
            else
                dest = opts.path.slice(0, i)

            if dest == ""
                escaped_dest = dest
                cb()
                return

            escaped_dest = dest.replace(/'/g, "'\\''")
            args = [user, "mkdir -p '#{escaped_dest}'"]
            winston.debug("ssh #{args.join(' ')}")
            misc_node.execute_code
                command : "ssh"
                # Note -- coffeescript escapes single quotes automatically.  See also
                # http://stackoverflow.com/questions/3668928/c-function-to-escape-string-for-shell-command-argument
                args    : args
                timeout : 15
                cb      : (err, output) ->
                    winston.info("mkdir time (#{target}) -- #{misc.walltime(t)} -- #{err}")
                    if err
                        winston.debug(misc.to_json(output))
                        cb("Error ensuring directory '#{dest}' exists when restoring a snapshot.")
                    else
                        cb()

        # rsync the file/path to replace the same file/path on the remote machine
        (cb) ->
            t = misc.walltime()

            args = ["-axH", "#{outdir}/", "#{user}:'#{escaped_dest}'"]

            if opts.compress
                args.unshift("-z")

            if opts.backup?
                args.unshift('--backup')
                args.unshift("--backup-dir='#{opts.backup}'")

            winston.info("rsync #{args.join(' ')}")

            misc_node.execute_code
                command : "rsync"
                args    : args
                timeout : 2*3600
                cb      : (err) ->
                    winston.info("rsync time (#{target}) -- #{misc.walltime(t)} -- #{err}")
                    cb(err)

        (cb) ->
            if not opts.snapshot_first
                # cause a snapshot to happen after the restore if we didn't cause one before.
                snapshot_project
                    project_id : opts.project_id
            cb()

    ], (err) ->
        opts.cb?(err)
        # Remove the temporary outdir (safe to do this after calling cb, so client can resume other stuff).
        misc_node.execute_code
            command : "rm"
            args    : ['-rf', outdir]
            timeout : 3600
            cb      : (err, output) ->
                winston.debug("finished removing temporary extraction directory")
    )


## -------
## ** PROBABLY BROKEN **
# Return a log of timestamps (commit names) that changed the file (or directory) at the
# given path, according to 'git log'.  For a discussion of using 'git log' with bup, see:
#    https://groups.google.com/forum/?fromgroups#!topic/bup-list/vwoSJ1j9JEg
## -------
snap_log = (opts) ->
    opts = defaults opts,
        project_id : required
        repo_id    : required
        path       : '.'
        cb         : required    # cb(err, array of time stamps)

    timestamps = []
    git_log = (path, cb) ->
        misc_node.execute_code
            command : "git"
            path    : bup_dir + "/" + repo_id
            args    : ["log", '--pretty="%b"', '--follow', opts.project_id, '--', path]
            timeout : 360
            cb      : (err, output) ->
                for x in output.stdout.split('\n')
                    m = x.match(/\'[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]\'/)
                    if m?
                        d = parseInt(m[0].slice(1,-1))
                        s = moment(new Date(d*1000)).format('YYYY-MM-DD-HHmmss')
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


##
# Getting and removing lock on the remote bup repo.  This is necessary
# because one cannot safely have to bup's simultaneously making a backup
# of a given remote path, as is discussed (a lot) on the mailing list.
# Also, for my purpose, that would be meaningless and undesirable for users.

exports.create_lock = create_lock = (opts) ->
    opts = defaults opts,
        location : required
        ttl      : DEFAULT_TIMEOUT   # time to live, in seconds
        lockfile : '.bup/lock'   # make customizable for other users
        cb       : required

    user = "#{opts.location.username}@#{opts.location.host}"   # TODO; port and path?
    async.series([
        (cb) ->
             winston.debug("create_lock: check if project is already locked")
             misc_node.execute_code
                 command     : 'ssh'
                 args        : [user, "cat '#{opts.lockfile}'"]
                 timeout     : 10
                 err_on_exit : false
                 max_output  : 2048  # in case some asshole makes .bup/lock a multi-gigabyte file.
                 cb          : (err, output) ->
                     if output.stderr.indexOf("such file") == -1
                         # There is a lock file
                         try
                             lock = misc.from_json(output.stdout)
                             if lock.expire > misc.walltime()
                                 mesg = "create_lock: project at #{user} is currently locked"
                                 winston.debug(mesg)
                                 cb(mesg)
                                 return
                         catch e
                             # corrupt lock file -- we take over
                     cb()
        (cb) ->
             # create the lock
             lock = misc.to_json
                    expire    : misc.walltime() + opts.ttl
                    server_id : server_id
             misc_node.execute_code
                 command : 'ssh'
                 args    : [user, "mkdir -p .bup; echo '#{lock}' > '#{opts.lockfile}'"]
                 timeout : 10
                 cb      : cb
    ], opts.cb)

exports.remove_lock = remove_lock = (opts) ->
    opts = defaults opts,
        location : required
        lockfile : ".bup/lock"
        cb       : required
    user = "#{opts.location.username}@#{opts.location.host}"   # TODO; port and path?
    misc_node.execute_code
        command : 'ssh'
        args    : [user, "rm -f '#{opts.lockfile}'"]
        cb      : (err) ->
            # err here is non-fatal; lock has a timeout, etc.
	    opts.cb()

##
# Rolling back problematic commits
get_rollback_info = (opts) ->
    opts = defaults opts,
        bup_dir : required
        cb      : required   # opts.cb(err, rollback_info)

    rollback_info = {bup_dir:opts.bup_dir}
    master = "#{opts.bup_dir}/refs/heads/master"
    async.series([
        (cb) ->
            fs.exists master, (exists) ->
                if not exists
                    cb(); return
                fs.readFile master, (err, data) ->
                    if err
                        cb(err)
                    else
                        rollback_info.master = data.toString()
                        cb()
        (cb) ->
            fs.readdir "#{opts.bup_dir}/objects/pack", (err, files) ->
                if err
                    cb(err)
                else
                    rollback_info.pack = files
                    cb()
    ], (err) ->
        opts.cb(err, rollback_info)
    )

rollback_last_save = (opts) ->
    opts = defaults opts,
        rollback_info : required
        cb            : required # opts.cb(err)

    info = opts.rollback_info

    winston.debug("rollback_last_save: rolling back last commit attempt in '#{info.bup_dir}'")

    async.series([
        (cb) ->
            winston.debug("rollback_last_save: restoring refs/heads/master")
            if info.master?
                fs.writeFile("#{info.bup_dir}/refs/heads/master", info.master, cb)
            else
                cb()
        (cb) ->
            winston.debug("rollback_last_save: removing newly created pack files")
            fs.readdir "#{info.bup_dir}/objects/pack", (err, files) ->
                if err
                    cb(err)
                else
                    f = (filename, c) ->
                        if filename not in info.pack
                            fs.unlink("#{info.bup_dir}/objects/pack/#{filename}", c)
                        else
                            c()
                    async.map(files, f, cb)
        (cb) ->
            winston.debug("rollback_last_save: removing refs/heads/master.lock if present")
            lock = "#{info.bup_dir}/refs/heads/master.lock"
            fs.exists lock, (exists) ->
                if exists
                    fs.unlink(lock, cb)
                else
                    cb()

        (cb) ->
            winston.debug("rollback_last_save: testing that bup ls works, so head commit is valid")
            bup
                args    : ['ls']
                bup_dir : info.bup_dir
                cb      : (err, output) ->
                    if not err # repo works fine
                        cb()
                    if err
                        # revert to the previously specified commit, as in the log.
                        fs.readFile "#{info.bup_dir}/logs/HEAD", (err, data) ->
                            if err
                                cb(err); return
                            v = data.toString().split('\n')
                            commit = v[v.length-1].split(' ')[0]
                            fs.writeFile("#{info.bup_dir}/refs/heads/master", commit, cb)

        (cb) ->
            winston.debug("rollback_last_save: test again that bup ls works, so head commit is valid and rollback worked")
            bup
                args    : ['ls']
                bup_dir : info.bup_dir
                cb      : cb
    ], opts.cb)


# Enqueue the given project to be snapshotted as soon as possible.
# cb(err) upon completion of snapshot, where cb is optional.
# It is safe to enqueue a project repeatedly -- it'll get snapshoted
# at most every snap_interval seconds.


snapshot_queue = []    # list of {project_id:?, cbs:[list of callback functions (or undefined)]}

snapshot_project = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : undefined
    winston.debug("snapshot_project(#{opts.project_id})")
    for x in snapshot_queue
        if x.project_id == opts.project_id
            winston.debug("project #{opts.project_id} already in snapshot queue -- adding callback")
            x.cbs.push(opts.cb)
            return
    winston.debug("adding #{opts.project_id} to queue")
    snapshot_queue.push({project_id:opts.project_id, cbs:[opts.cb]})



repository_is_corrupt = false

monitor_snapshot_queue_last_run = undefined

monitor_snapshot_queue = () ->
    monitor_snapshot_queue_last_run = misc.walltime()
    if snapshot_queue.length == 0
        # check again soon
        setTimeout(monitor_snapshot_queue, 3000)
        return

    if repository_is_corrupt  # TODO: I think this is never used anymore.
        winston.debug("monitor_snapshot_queue: repository is corrupt -- emptying snapshot queue and giving up.")
        while snapshot_queue.length > 0
            {project_id, cbs} = snapshot_queue.shift()
            for cb in cbs
                cb?("the repository is totally corrupt")
        return

    user = undefined
    winston.debug("monitor_snapshot_queue...")

    # the code below handles exactly one project that is currently in the snapshot queue.
    {project_id, cbs} = snapshot_queue.shift()

    location       = undefined
    user           = undefined
    timestamp      = undefined
    size_before    = undefined
    size_after     = undefined
    repo_id        = undefined
    bup_active     = undefined
    retry_later    = false
    nothing_to_do  = false
    rollback_info  = undefined
    rollback_file  = undefined
    modified_files = undefined
    utc_seconds_epoch = undefined

    async.series([
        (cb) ->
            winston.debug("monitor_snapshot_queue: checking if disabled for #{project_id}")
            database.select_one
                table   : 'projects'
                where   : {project_id: project_id}
                columns : ['snapshots_disabled']
                objectify : false
                cb      : (err, result) ->
                    if err
                        cb(err)
                    else
                        if result[0]
                            cb("snapshots disabled for #{project_id}")
                        else
                            cb()

        (cb) ->
            winston.debug("monitor_snapshot_queue: getting active path")
            active_path (err, path) ->
                if err
                    cb(err)
                else
                    repo_id = path.repo_id
                    bup_active = path.active_path
                    rollback_file = "#{bup_active}/rollback"
                    cb()

        # compute disk usage before save
        (cb) ->
            winston.debug("monitor_snapshot_queue: compute disk usage before save")
            misc_node.disk_usage bup_active, (err, usage) ->
                winston.debug("monitor_snapshot_queue: -- usage: err=#{err}, #{usage} bytes")
                size_before = usage
                cb(err)

        # if disk usage exceeds REPO_SIZE_CUTOFF_BYTES, then we remove the active file,
        # so that next time around we'll use a new repo.  We still need to use this one
        # this time, in case there is a rollback file to deal with (also, this makes
        # the logic simpler).
        (cb) ->
            winston.debug("monitor_snapshot_queue: comparing REPO_SIZE_CUTOFF_BYTES=#{REPO_SIZE_CUTOFF_BYTES} with usage")
            if size_before >= REPO_SIZE_CUTOFF_BYTES
                winston.debug("monitor_snapshot_queue: size exceed -- will switch to new active bup repo.")
                fs.unlink "#{bup_dir}/active", cb
            else
                cb()

        # check for a leftover rollback file; this will be left around when the
        # server is killed while making a backup.
        (cb) ->
            winston.debug("monitor_snapshot_queue: checking for leftover rollback file")
            fs.exists rollback_file, (exists) ->
                if exists
                    winston.debug("monitor_snapshot_queue: found rollback file")
                    fs.readFile rollback_file, (err, data) ->
                        if err
                            cb(err)  # no reason this should happen --  can't read a file that exists? -- or if it does, should be intermittent.
                        else
                            s = data.toString()
                            try
                                rollback_info = misc.from_json(s)
                                winston.debug("monitor_snapshot_queue: rollback info: '#{s}'")
                            catch
                                # Something went wrong parsing the rollback JSON file; maybe it is corrupt
                                # or empty.  This would be a good place to take more dramatic measures (?).
                                # If the rollback file is corrupt, then we probably didn't actually do anything though.
                                winston.debug("monitor_snapshot_queue: rollback file *corrupt* (not using); content='#{s}'")
                                rollback_info = undefined

                            if rollback_info?
                                winston.debug("monitor_snapshot_queue: doing rollback of last save")
                                rollback_last_save
                                    rollback_info : rollback_info
                                    cb            : (err) ->
                                        if err
                                            cb(err)
                                        else
                                            fs.unlink(rollback_file, cb)
                            else
                                cb()
                else
                    winston.debug("monitor_snapshot_queue: no rollback file")
                    cb()

        (cb) ->
            # In some very, very rare cases this file could get left around (probably impossible, but just in case...)
            winston.debug("monitor_snapshot_queue: checking for refs/heads/master.lock")
            lock = bup_active + 'refs/heads/master.lock'
            fs.exists lock, (exists) ->
                if exists
                    fs.unlink(lock, cb)
                else
                    cb()
        (cb) ->
            winston.debug("monitor_snapshot_queue: getting info in case we end up having to rollback this attempt")
            get_rollback_info
                bup_dir : bup_active
                cb      : (err, info) ->
                    rollback_info = info
                    cb(err)

        (cb) ->
            winston.debug("monitor_snapshot_queue: get deployed location of project (which can change at any time!)")
            database._get_project_location
                project_id : project_id
                cb         : (err, _location) ->
                    winston.debug("monitor_snapshot_queue: returned from get_project_location with result=#{err}, #{misc.to_json(_location)}")
                    if err
                        cb(err)
                    else
                        if not _location or not _location.username?
                            cb("monitor_snapshot_queue: can't snapshot #{project_id} since it is not deployed")
                            return
                        location = _location
                        user = "#{location.username}@#{location.host}"
                        # TODO: support location.port != 22 and location.path != '.'   !!?
                        cb()

        # get a lock on the deployed project
        (cb) ->
            winston.debug("monitor_snapshot_queue: trying to lock #{project_id} for snapshotting.")
            create_lock
                location : location
                cb       : (err) ->
                    if err
                        retry_later = true
                        winston.debug("monitor_snapshot_queue: couldn't lock #{project_id}, so put back in the queue to try again later (in 30 seconds)")
                        f = () ->
                            for c in cbs
                                snapshot_project(project_id:project_id, cb:c)
                        setTimeout(f, 30000)
                    cb(err)

        # create index
        (cb) ->
            winston.debug("monitor_snapshot_queue: creating index for #{project_id}")
            t = misc.walltime()
            bup
                args    : ['on', user, 'index', '--one-file-system', '.']        # --one-file-system option below so that sshfs-mounted filesystems (etc.) don't get sucked up.
                bup_dir : bup_active
                cb      : (err) ->
                    winston.debug("monitor_snapshot_queue: time to index #{project_id}: #{misc.walltime(t)} s")
                    cb(err)

        # List the interesting modified files.
        # This only makes sense because we just made the index above successfully.
        # Note that "modified" is global to *all* snap servers, so this is actually
        # a really sensible thing to do.  And if one snap server makes a snapshot,
        # then no other snapshot server will make exactly the same snapshot (by a different name),
        # which is what we want, since we will (eventually-when-i-implement-it!)
        # get redundancy by rsyncing them around.
        (cb) ->
            winston.debug("monitor_snapshot_queue: getting a list of the interesting modified files for #{project_id}")
            # We use the --one-file-system option below so that sshfs-mounted filesystems don't get sucked up into our snapshots,
            # as they could be huge and contain private information users don't want snapshotted.
            misc_node.execute_code
                command : "/usr/bin/bup on #{user} index --one-file-system -m . 2>&1 | grep -v ^./.forever |grep -v ^./.sagemathcloud|grep -v ^./.sage/temp | grep -v '^./$' | grep -v '^Warning: '"
                timeout : 30  # should be very fast no matter what.
                bash    : true
                env     : {BUP_DIR : bup_active}
                err_on_exit : false  # if a grep along the way above is empty -- i.e., no file changes, then get a 1 exit code.  STUPID, but yep.
                cb      : (err, output) ->
                    if err
                        winston.debug("monitor_snapshot_queue: SERIOUS BUG issue -- error determining number of modified files for #{project_id}: #{err}")
                        cb(err)
                    else
                        modified_files = (x.slice(2) for x in output.stdout.trim().split('\n'))
                        modified_files = (x for x in modified_files when (x != "" and x != ".sage/"))
                        n = modified_files.length
                        winston.debug("monitor_snapshot_queue: #{n} modified files for #{project_id}; modified files = #{misc.trunc(misc.to_json(modified_files),512)}")
                        if n == 0
                            nothing_to_do = true
                            # Record the time of this snapshot, so that we won't try again to snapshot this project for a
                            # few minutes; otherwise, we would index the whole thing every few seconds!
                            _last_snapshot_cache[project_id] = misc.walltime()
                            remove_lock
                                location : location
                                cb       : (err) -> cb(true)
                        else
                            cb()

        (cb) ->
            winston.debug("monitor_snapshot_queue: write rollback file")
            fs.writeFile(rollback_file, misc.to_json(rollback_info), cb)

        # save
        (cb) ->
            winston.debug("monitor_snapshot_queue: doing the actual bup save...")
            t = misc.walltime()
            utc_seconds_epoch = d = Math.ceil(misc.walltime())
            bup
                args    : ['on', user, 'save', '-d', d, '--strip', '-q', '-n', 'master', '.']
                bup_dir : bup_active
                cb      : (err) ->
                    winston.debug("monitor_snapshot_queue: time to save snapshot of #{project_id}: #{misc.walltime(t)} s")

                    if not err
                        # If bup is killed during save, then this doesn't get removed, and on next use of this repo,
                        # we use the rollback file to roll back.  Since the bup succeeded, we can remove the rollback.
                        fs.unlink("#{bup_active}/rollback")

                        # used below when creating database entry
                        timestamp = moment(new Date(d*1000)).format('YYYY-MM-DD-HHmmss')

                    winston.debug("monitor_snapshot_queue: snapshot name = #{timestamp} of #{project_id}")
                    # No matter what happens, we need to remove the lock we just made *now*.
                    remove_lock
                        location : location
                        cb       : (lock_err) ->
                            if lock_err
                                winston.debug("monitor_snapshot_queue: non fatal error removing snapshot lock (#{project_id}) -- #{lock_err}")
                            if err
                                rollback_last_save
                                    rollback_info:rollback_info
                                    cb : (rb_err) ->
                                        cb(err)  # err is the outer err from saving
                            else
                                cb(err) # err is the outer err from saving

        # Do a "bup ls", which causes the cache to be updated (so a user doesn't have to wait several seconds the
        # first time they do a view on a snapshot).  Also, if this fails for some reason, we do *NOT* want to
        # ever record this as a successful snapshot in the database.
        (cb) ->
            winston.debug("monitor_snapshot_queue: doing 'bup ls' to verify integrity of snapshot")
            t = misc.walltime()
            bup
                args    : ['ls', "master/#{timestamp}"]
                bup_dir : bup_active
                cb      : (err) ->
                    winston.debug("monitor_snapshot_queue: time to get ls of new snapshot #{timestamp}: #{misc.walltime(t)} s")
                    cb(err)

        # Compute disk usage after snapshot -- how much disk space was used by making this snapshot?
        # (The main reason for doing this is to protect against projects that have random data
        # files in them -- we can refuse to snapshot after a certain total amount of usage.)
        (cb) ->
            winston.debug("monitor_snapshot_queue: compute disk usage after snapshot")
            misc_node.disk_usage bup_active, (err, usage) ->
                size_after = usage
                winston.debug("monitor_snapshot_queue: disk usage = #{usage}")
                # Also, save total size of bup archive to global variable, so it can
                # be reported on next update the snap_servers table.
                size_of_bup_archive = size_after
                cb(err)

        (cb) ->
            winston.debug("monitor_snapshot_queue: record (in db) that we successfully made a snapshot, unless snapshot was too big.")
            size = size_after - size_before
            winston.debug("monitor_snapshot_queue: snapshot of #{project_id} increased archive by #{size} bytes")
            if size > MAX_SNAPSHOT_SIZE
                err = "monitor_snapshot_queue: *** snapshot size of #{project_id} exceeds max snapshot usage size of #{MAX_SNAPSHOT_SIZE}, so we are removing it, and turning off snapshots of this project in the database."
                winston.debug(err)

                database.update  # fire and forget this
                    table : "projects"
                    set   : {"snapshots_disabled":true}
                    where : {project_id : project_id}

                rollback_last_save
                    rollback_info : rollback_info
                    cb : (rb_err) ->
                        cb(err)
                return

            t = misc.walltime()
            _last_snapshot_cache[project_id] = t
            database.update
                table : 'snap_commits'
                set   : {size: size, repo_id:repo_id, modified_files:modified_files, utc_seconds_epoch:utc_seconds_epoch}
                json  : ['modified_files']
                where :
                    server_id  : server_id
                    project_id : project_id
                    timestamp  : timestamp
                cb    : (err) ->
                    if err
                        winston.debug("monitor_snapshot_queue: FAILED to record a commit to database: #{misc.walltime(t)}")
                    else
                        winston.debug("monitor_snapshot_queue: recorded commit to database: #{misc.walltime(t)}")
                        # Also add row to table for each modified file.  There could be (say) 50,000 files though,
                        # so this is slow, so we don't block on it.  TODO: do this in one transaction someday (?),
                        # or use collections...
                        f = (filename, cb) ->
                            database.update
                                table : 'snap_modified_files'
                                set   : {dummy: true}
                                where :
                                    project_id : project_id
                                    filename   : filename
                                    timestamp  : timestamp
                                cb : cb
                        t = misc.walltime()
                        async.map modified_files, f, (err) ->
                            winston.debug("monitor_snapshot_queue: finished recording snap_modified_files for project #{project_id}, time = #{misc.walltime(t)}")

                    cb(err)

            # Update the last_snapshot table at the same time -- not an error if this doesn't work for some reason,
            # so we don't bother with callback, etc.
            database.update
                table : 'last_snapshot'
                set   : {repo_id:repo_id, timestamp:timestamp, utc_seconds_epoch:utc_seconds_epoch}
                where :
                    server_id  : server_id
                    project_id : project_id


    ], (err) ->
        # wait random interval up to 15 seconds between snasphots, to ensure uniqueness of
        # time stamp, not be too aggressive checking locks, etc.
        setTimeout(monitor_snapshot_queue, misc.randint(3000,15000))
        if nothing_to_do
            err = undefined
        if not retry_later
            for cb in cbs
                cb?(err)
    )

# The monitor_snapshot_queue function above is really long -- if anything goes wrong with the callback chain, then
# the entire snapshot server stops making new snapshots.  So as a just in case measure, we check on it every
# 30 minutes.
ensure_snapshot_queue_working = () ->
    if monitor_snapshot_queue_last_run?
        if misc.walltime() - monitor_snapshot_queue_last_run > DEFAULT_TIMEOUT*1.2
            winston.debug("ensure_snapshot_queue_working: BUG/ERROR ** monitor_snapshot_queue has not been called in too long -- restarting, but you need to fix this. check logs!")
            winston.debug("ensure_snapshot_queue_working: connecting to database")
            connect_to_database (err) =>
                winston.debug("ensure_snapshot_queue_working: connect_to_databasegot back err=#{err}")
                monitor_snapshot_queue()

# snapshot all projects in the given input array, and call opts.cb on completion.
snapshot_projects = (opts) ->
    opts = defaults opts,
        project_ids : required
        cb          : undefined
    if opts.project_ids.length == 0  # easy case
        opts.cb?()
        return

    error = undefined
    winston.debug("snapshot_projects: #{misc.to_json(opts.project_ids)}")
    f = (p, cb) ->
        winston.debug("DEBUG -- #{p}")
        snapshot_project
            project_id : p
            cb         : (err) ->
                if err
                    m = [p, err]
                    if error?
                        error.push(m)
                    else
                        error = [m]

                # We don't do cb(err) here because we want to *try* to snapshot
                # all of the projects.  Some could fail due to network issues,
                # target .bup corruption, things being restarted, user killing
                # bup process in their account manually, etc.
                cb()
    async.map(opts.project_ids, f, ((err, results) -> opts.cb?(error)))



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
    all_projects = {}
    async.series([
        (cb) ->
             database.get_all_project_ids
                deleted : false
                cb      : (err, result) ->
                    project_ids = result
                    cb(err)
        (cb) ->
            _info_all_projects_with_a_backup (err, _all) ->
                for x in _all
                    all_projects[x] = true
                cb(err)
        (cb) ->
            snapshot_projects
                project_ids : (id for id in project_ids when not all_projects[id]?)
                cb          : cb
    ], cb)

##------------------------------------
# TCP server

handle_mesg = (socket, mesg) ->
    winston.info("TCP server: handling mesg -- #{misc.to_json(mesg)}")
    send = (resp) ->
        resp.id = mesg.id
        socket.write_mesg('json', resp)

    switch mesg.command
        when 'ls'
            snap_ls
                snapshot   : mesg.snapshot
                repo_id    : mesg.repo_id
                path       : mesg.path
                cb         : (err, files) ->
                    if err
                        send(message.error(error:err))
                    else
                        send(list:files)

        when 'restore'
            snap_restore
                project_id : mesg.project_id
                location   : mesg.location
                snapshot   : mesg.snapshot
                repo_id    : mesg.repo_id
                path       : mesg.path
                cb         : (err) ->
                    if err
                        send(message.error(error:err))
                    else
                        send(message.success())

        when 'log'
            # TODO -- this can't work with the new master/ only use of bup, which is
            # way more efficient.  Also, it would have to take into account all the repo_id's
            # which would be another issue!   So this is probably totally broken.
            snap_log
                project_id : mesg.project_id
                repo_id    : mesg.repo_id
                path       : mesg.path
                cb         : (err, commits) ->
                    if err
                        send(message.error(error:err))
                    else
                        send({list:commits})

        else
            send(message.error(error:"unknown command '#{mesg.command}'"))


handle_connection = (socket) ->
    winston.info("handling a new connection")
    misc_node.unlock_socket socket, secret_key, (err) ->
        if err
            winston.info(err)
        else
            misc_node.enable_mesg(socket, "connection from outside to a snap server")
            handler = (type, mesg) ->
                if type == "json"
                    handle_mesg(socket, mesg)
            socket.on 'mesg', handler

create_server = (cb) ->  # cb(err, randomly assigned port)
    server = net.createServer(handle_connection)
    if program._name == 'snap.js'
        port = 0  # randomly assigned
    else
        port = 5077 # for testing

    server.listen port, program.host, (err) ->
        port = server.address().port
        winston.debug("TCP server--      host:'#{program.host}', port:#{port}")
        cb(err, port)

##------------------------------------
## WARNING!  These tests below were used when writing this code, and surely are broken now that
## the code has been modified and used in production.  They should probably just be deleted.
##------------------------------------
# TCP client

exports.test_client = (opts={}) ->
    opts = defaults opts,
        host   : 'localhost'
        port   : 5077
        token : 'secret'

    console.log("Testing client.")
    socket = undefined
    project_id = undefined
    snapshot = undefined
    path = undefined
    async.series([
        (cb) ->
             console.log("Connecting to snap server.  host:#{opts.host}, port:#{opts.port}, token:#{opts.token}")
             exports.client_socket
                 host  : opts.host
                 port  : opts.port
                 token : opts.token
                 cb    : (err, _socket) ->
                     socket = _socket
                     cb(err)
        (cb) ->
             console.log("Requesting list of all projects.")
             exports.client_snap
                 command : 'ls'
                 socket  : socket
                 cb : (err, list) ->
                     console.log("Got err=#{err}, list=#{misc.to_json(list)}")
                     project_id = list[0]
                     #project_id = "f0c51934-9d09-4586-b8db-fd2e6f11e57e"
                     cb(err)

        (cb) ->
            console.log("Requesting list of snapshots of a particular project.")
            exports.client_snap
                command : 'ls'
                socket  : socket
                project_id : project_id
                cb : (err, list) ->
                     console.log("Got err=#{err}, list=#{misc.to_json(list)}")
                     snapshot = list[list.length-1]
                     cb(err)
        (cb) ->
            console.log("Requesting list of files in first snapshot of a particular project.")
            exports.client_snap
                command : 'ls'
                socket  : socket
                project_id : project_id
                snapshot : snapshot
                cb : (err, list) ->
                     console.log("Got err=#{err}, list=#{misc.to_json(list)}")
                     path = list[0]
                     #path = "a 2.txt"
                     cb(err)
        (cb) ->
            console.log("Requesting log of a path (=#{path}) in project")
            exports.client_snap
                command : 'log'
                socket  : socket
                project_id : project_id
                path     : path
                cb : (err, log) ->
                     console.log("Got err=#{err}, log=#{misc.to_json(log)}")
                     cb(err)

        (cb) ->
            console.log("Restoring earliest version of #{path}")
            exports.client_snap
                command : 'restore'
                socket  : socket
                project_id : project_id
                snapshot : snapshot
                path     : path
                cb : (err) ->
                     console.log("Got err=#{err}")
                     cb(err)


    ], (err) ->
        console.log("done; exit err=#{err}")
    )


exports.client_socket = (opts) ->
    opts = defaults opts,
        host    : required
        port    : required
        token  : required
        timeout : 15
        cb      : required    # cb(err, socket)
    socket = misc_node.connect_to_locked_socket
        host      : opts.host
        port      : opts.port
        timeout   : opts.timeout
        token     : opts.token
        cb   : (err) ->
            if err
                opts.cb(err)
            else
                misc_node.enable_mesg(socket, "client connection to a snap server")
                opts.cb(false, socket)

exports.client_snap = (opts) ->
    opts = defaults opts,
        socket     : required
        command    : required   # "ls", "restore", "log"
        project_id : undefined
        location   : undefined  # used by command='restore' to send files to some non-default location (the default is the project location in the database)
        snapshot   : undefined
        repo_id    : undefined
        path       : '.'
        timeout    : 60
        cb         : required   # cb(err, list of results when meaningful)

    if opts.command in ['restore', 'ls']
        if not opts.project_id?
            opts.cb("project_id must be defined to use the #{opts.command} command")
            return
        else if not opts.snapshot?
            opts.cb("snapshot must be defined when using the #{opts.command} command")
            return
        else if not opts.repo_id?
            opts.cb("repo_id must be defined when using the #{opts.command} command")
            return
    else if opts.command == 'log'
        if not opts.project_id?
            opts.cb("project_id must be defined to use the log command")
            return
        else if opts.snapshot?
            opts.cb("snapshot must *not* be defined when using the log command")
            return
    else
        opts.cb("unknown command '#{opts.command}'")
        return

    mesg = {id:uuid.v4(), command:opts.command, project_id: opts.project_id, snapshot:opts.snapshot, location:opts.location, path:opts.path, repo_id:opts.repo_id}
    list = undefined
    async.series([
        (cb) ->
            opts.socket.write_mesg('json', mesg, cb)
        (cb) ->
            opts.socket.recv_mesg
                type    : 'json'
                id      : mesg.id
                timeout : opts.timeout
                cb      : (resp) ->
                    if resp.event == 'error'
                        cb(resp.error)
                    else
                        list = resp.list
                        cb()
    ], (err) -> opts.cb(err, list))



##------------------------------------



snap_dir  = undefined
snap_corrupt_file = undefined
bup_dir   = undefined
tmp_dir   = undefined
uuid_file = undefined
initialize_snap_dir = (cb) ->
    snap_dir = program.snap_dir
    if snap_dir[0] != '/'
        snap_dir = process.cwd() + '/' + snap_dir

    bup_dir   = snap_dir + '/bup'

    snap_corrupt_file = snap_dir + '/CORRUPT.txt'
    if fs.existsSync(snap_corrupt_file)
        repository_is_corrupt = true

    tmp_dir   = snap_dir + '/tmp'
    uuid_file = snap_dir + '/server_uuid'
    winston.info("path=#{snap_dir} should exist")

    async.series([
        (cb) ->
            misc_node.ensure_containing_directory_exists uuid_file, cb
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
server_id = undefined
initialize_server_id = (cb) ->
    fs.exists uuid_file, (exists) ->
        if exists
            fs.readFile uuid_file, (err, data) ->
                server_id = data.toString()
                cb()
        else
            server_id = uuid.v4()
            fs.writeFile uuid_file, server_id, cb

# some functionality in this file is also used by the hub; and it needs to
# set the id for some of it (e.g., lock files).  This could be refactored
# into misc_node or somewhere else.
exports.set_server_id = (id) ->
    server_id = id

# Connect to the cassandra database server; sets the global database variable.
database = undefined
connect_to_database = (cb) ->
    fs.readFile "#{SALVUS_HOME}/data/secrets/cassandra/snap", (err, password) ->
        if err
            cb(err)
        else
            new cassandra.Salvus
                hosts    : program.database_nodes.split(',')
                keyspace : program.keyspace
                username : 'snap'
                consistency : 1   # for now; later switch to quorum
                password : password.toString().trim()
                cb       : (err, db) ->
                    database = db
                    cb(err)

# Generate the random secret key and save it in global variable
secret_key = undefined
generate_secret_key = (cb) ->
    if program._name != 'snap.js'
        # not running as daemon -- for testing
        secret_key = 'secret'
        cb()
        return

    require('crypto').randomBytes secret_key_length, (ex, buf) ->
        secret_key = buf.toString('base64')
        cb()

active_path = (cb) ->   # cb(err, {active_path:?, repo_id:?})
    active = "#{bup_dir}/active"
    fs.readFile active, (err, data) ->
        if not err
            # there's already a bup repository file.
            repo_id = data.toString().trim()
            cb(false, {active_path:"#{bup_dir}/#{repo_id}", repo_id:repo_id})
        else
            misc_node.ensure_containing_directory_exists active, (err) ->
                if err
                    cb(err); return
                # create new bup repository.
                u = uuid.v4()
                path = "#{bup_dir}/#{u}"
                fs.writeFile active, u, (err) ->
                    bup
                        args    : ['init']
                        bup_dir : path
                        cb      : (err) ->
                            cb(err, {active_path:path, repo_id:u})

# Write entry to the database periodicially (with ttl) that this
# snap server is up and running, and provide the key.
size_of_bup_archive = undefined
register_with_database = () ->
    database?.update
        table : 'snap_servers'
        where : {id : server_id, dummy:true}
        set   : {key:secret_key, host:program.host, port:listen_port, size:size_of_bup_archive}
        ttl   : 2*registration_interval_seconds
        cb    : (err) ->
            if err
                winston.info("error registering with database -- #{err}")
            else
                winston.info("successfully registered with database")


# For each commit in each project, re-enter a record in the database.

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

# Return the age (in seconds) of the most recent snapshot made of the given
# project during this session.  Returns a "very large number"
# in case that we have no backups of the given project yet
# during this session.
_last_snapshot_cache = {}
age_of_most_recent_snapshot_in_seconds = (id) ->
    last = _last_snapshot_cache[id]
    if not last?
        return 99999999999999
    return misc.walltime() - last

# Ensure that we maintain and update snapshots of projects, according to our rules.
snapshot_active_projects = (cb) ->
    project_ids = undefined
    winston.debug("checking for recently modified projects.")
    async.series([
        (cb) ->
            database.select
                table   : 'recently_modified_projects'
                columns : ['project_id']
                where   : {ttl:'short'}
                objectify : false
                cb : (err, results) =>
                    project_ids = (r[0] for r in results)
                    cb(err)
        (cb) ->
            winston.debug("recently modified projects: #{project_ids.length} of them")

            v = []
            for id in project_ids
                if age_of_most_recent_snapshot_in_seconds(id) >= program.snap_interval
                    v.push(id)
            winston.debug("projects needing snapshots (since snapshot age > #{program.snap_interval}): #{misc.to_json(v)}")
            snapshot_projects
                project_ids : v
                cb          : cb
    ], (err) ->
        if err
            winston.debug("Not all active projects snapshotted:  #{err}")
            # TODO: We need to trigger something more drastic somehow at some point...?

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
            initialize_server_id(cb)
        (cb) ->
            generate_secret_key(cb)
        (cb) ->
            # keep retrying until database is up and we succeed in connecting.
            misc.retry_until_success
                f           : connect_to_database
                start_delay : 1000
                max_delay   : 10000
                cb          : cb
        (cb) ->
            if program.resend_all_commits
                resend_all_commits(cb)
            else
                cb()
        (cb) ->
            monitor_snapshot_queue()
            setInterval(ensure_snapshot_queue_working, 60000)
            cb()
        (cb) ->
            setInterval(register_with_database, 1000*registration_interval_seconds)
            setInterval(snapshot_active_projects, 1000*snapshot_interval_seconds)
            cb()
        #(cb) ->
        #    ensure_all_projects_have_a_snapshot(cb)
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
    .option('--snap_interval [seconds]', 'each project is snapshoted at most this frequently by this server (default: 120 = 2 minutes)', Number, 120)
    .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
    .option('--resend_all_commits', 'on startup, scan through all commits in the local repo and save to db (default: false)', Boolean, false)
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "test")', String, 'test')
    .parse(process.argv)

# program.resend_all_commits = true

if program._name == 'snap.js'
    #    winston.info "snap daemon"

    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()

    conf = {pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}


    clean_up = () ->
        # TODO/bug/issue -- this is not actually called :-(
        winston.info("cleaning up on exit")
        fuse_remove_all_mounts()

    daemon(conf, start_server).on('stop', clean_up).on('exit', clean_up)



