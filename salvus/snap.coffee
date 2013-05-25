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

backup    = require 'backup'
message   = require 'message'
misc      = require 'misc'
misc_node = require 'misc_node'

program   = require 'commander'
daemon    = require 'start-stop-daemon'
cassandra = require 'cassandra'

{defaults, required} = misc

########################################
# Run a bup command
bup = (opts) ->
    opts = defaults opts,
        args    : []
        timeout : 2*3600   # default timeout of 2 hours (!)
        bup_dir : bup_dir  # defined below when initializing snap_dir
        cb      : (err, output) ->
            if err
                winston.debug("error -- #{err}")
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


########################################

# Mount the bup archive somewhere.  This is a static view of the
# archive at mount time and will not reflect updates and new snapshots.
# You can mount the archive multiple times at once at *different*
# mount points.
mount_bup_archive = (opts) ->
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
unmount_bup_archive = (opts) ->
    opts = defaults opts,
        mountpoint : required
        cb         : undefined

    misc_node.execute_code
        command : "fusermount"
        args    : ["-u", opts.mountpoint]
        cb       : opts.cb

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
            mount_bup_archive
                cb:(err, _mountpoint) ->
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
            async.series([
                (cb) ->
                    unmount_bup_archive(mountpoint: mountpoint, cb:cb)
                (cb) ->
                    fs.unlink(mountpoint, cb)
            ])
        #winston.debug("local_snapshots = #{misc.to_json(local_snapshots)}")
        cb?(err)
    )


# Enqueue the given project to be snapshotted as soon as possible.
# cb(err) upon completion of snapshot, where cb is optional.
# It is safe to enqueue a project repeatedly -- it'll get snapshoted
# at most every snap_interval seconds.

snapshot_queue = []

snapshot_project = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : undefined
    winston.debug("enqueuing project #{opts.project_id} for snapshot")

    if opts.project_id == "6a63fd69-c1c7-4960-9299-54cb96523966"
        # special case -- my own local dev server account shouldn't backup into itself
        opts.cb?()
        return
    snapshot_queue.push(opts)

monitor_snapshot_queue = () ->
    if snapshot_queue.length > 0
        user = undefined
        {project_id, cb} = snapshot_queue.shift()
        winston.debug("making a snapshot of project #{project_id}")
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
                bup
                    args : ['on', user, 'index', '.']
                    cb   : cb
            # save
            (cb) ->
                d = Math.ceil(misc.walltime())
                bup
                    args : ['on', user, 'save', '-d', d, '--strip', '-q', '-n', project_id, '.']
                    cb   : (err) ->
                        if not err
                            timestamp = moment(new Date(d*1000)).format('YYYY-MM-DD-HHmmss')
                            local_snapshots[project_id].push(timestamp)
                        cb(err)
            # update checksums in case of bitrot
            (cb) ->
                bup
                    args : ['fsck', '--quick', '-g']
                    cb   : cb

        ], (err) ->
            cb?(err)
            setTimeout(monitor_snapshot_queue, 50)
        )
    else
        # check again in a second
        setTimeout(monitor_snapshot_queue, 1000)

monitor_snapshot_queue()  # start it going.

# snapshot all projects in the given input array, and call opts.cb on completion.
snapshot_projects = (opts) ->
    opts = defaults opts,
        project_ids : required
        cb          : undefined
    if opts.project_ids.length == 0  # easy case
        opts.cb?()
        return
    async.map(opts.project_ids, ((p,cb) -> snapshot_project(project_id:p, cb:cb)), ((err, results) -> opts.cb?(err)))

########################################

# Ensure that every project has at least one local snapshot.
# TODO: scalability plan -- we will divide projects into snapshot
# zones based on the first digit of the project_id (say).
ensure_all_projects_have_a_snapshot = (cb) ->   # cb(err)
    # Query the database for a list of all project_id's (at least those
    # not deleted), then
    # for each one, check if we have a backup.  If we don't,
    # queue that project for backing up.  Then drain that queue.

    winston.debug("ensuring all projects have a snapshot")
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

########################################

handle_mesg = (socket, mesg) ->
    winston.debug("handling mesg")

handle_connection = (socket) ->
    winston.debug("handling a new connection")
    misc_node.unlock_socket socket, secret_key, (err) ->
        if err
            winston.debug(err)
        else
            misc_node.enable_mesg(socket)
            handler = (type, mesg) ->
                if type == "json"
                    winston.debug "received mesg #{json(mesg)}"
                    handle_mesg(socket, mesg)
            socket.on 'mesg', handler

create_server = (cb) ->  # cb(err, randomly assigned port)
    server = net.createServer(handle_connection)
    server.listen 0, program.host, (err) ->
        cb(err, server.address().port)

snap_dir  = undefined
bup_dir   = undefined
uuid_file = undefined
initialize_snap_dir = (cb) ->
    snap_dir = program.snap_dir
    if snap_dir[0] != '/'
        snap_dir = process.cwd() + '/' + snap_dir
    bup_dir  = snap_dir + '/bup'
    uuid_file = snap_dir + '/server_uuid'
    winston.debug("path=#{snap_dir} should exist")
    misc_node.ensure_containing_directory_exists uuid_file, (err) ->
        if err
            cb(err)
        else
            bup(args:['init'])
            cb()
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
    winston.debug("registering with database server...")
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
    winston.debug("snapshot_active_projects...")
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
            winston.debug("recently modified projects: #{misc.to_json(project_ids)}")

            v = (id for id in project_ids when age_of_most_recent_snapshot_in_seconds(id) >= program.snap_interval)
            winston.debug("needing snapshot: #{misc.to_json(v)}")
            snapshot_projects
                project_ids : v
                cb          : cb
    ], (err) ->
        if err
            winston.debug("Error snapshoting active projects -- #{err}")
            # TODO: We need to trigger something more drastic somehow at some point...?

        setTimeout(snapshot_active_projects, 10000)  # check every 10 seconds
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
            ensure_all_projects_have_a_snapshot(cb)
        (cb) ->
            snapshot_active_projects(cb)
    ], (err) ->
        if err
            winston.debug("ERROR starting snap server: '#{err}'")
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
    winston.debug "snap daemon"

    conf =
        pidFile:program.pidfile
        outFile:program.logfile
        errFile:program.logfile

    daemon(conf, start_server)

    #process.addListener "uncaughtException", (err) ->
    #    winston.error "Uncaught exception: " + err
    #    if console? and console.trace?
    #        console.trace()


