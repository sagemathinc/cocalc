#################################################################
#
# storage -- a node.js program/library for interacting with
# the SageMath Cloud's ZFS-based replicated distributed snapshotted
# project storage system.
#
#################################################################

winston   = require 'winston'
HashRing  = require 'hashring'
fs        = require 'fs'
cassandra = require 'cassandra'
async     = require 'async'
misc      = require 'misc'
misc_node = require 'misc_node'
{defaults, required} = misc

# Set the log level to debug
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, level: 'debug')

SALVUS_HOME=process.cwd()

# Connect to the cassandra database server; sets the global database variable.
database = undefined
connect_to_database = (cb) ->
    fs.readFile "#{SALVUS_HOME}/data/secrets/cassandra/hub", (err, password) ->
        if err
            cb(err)
        else
            new cassandra.Salvus
                hosts    : ['10.1.3.2']  # TODO
                keyspace : 'salvus'                  # TODO
                username : 'hub'
                consistency : 1
                password : password.toString().trim()
                cb       : (err, db) ->
                    database = db
                    cb(err)
# TODO
connect_to_database (err) ->
    if err
        winston.info("Error connecting to database -- ", err)
    else
        winston.info("Connected to database")
exports.db = () -> database # TODO -- for testing

filesystem = (project_id) -> "projects/#{project_id}"
mountpoint = (project_id) -> "/projects/#{project_id}"

execute_on = (opts) ->
    opts = defaults opts,
        host    : required
        command : required
        cb      : undefined

    t0 = misc.walltime()
    misc_node.execute_code
        command     : "ssh"
        args        : ["-o StrictHostKeyChecking=no", "storage@#{opts.host}", opts.command]
        err_on_exit : true
        cb          : (err, output) ->
            winston.debug("#{misc.walltime(t0)} seconds to execute '#{opts.command}' on #{opts.host}")
            opts.cb?(err, output)

###
# Snapshotting
###

# Make a snapshot of a given project on a given host and record
# this in the database.
exports.snapshot = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        tag        : undefined
        cb         : undefined

    winston.debug("snapshotting #{opts.project_id} on #{opts.host}")

    if opts.tag?
        tag = '-' + opts.tag
    else
        tag = ''
    now = misc.to_iso(new Date())
    name = filesystem(opts.project_id) + '@' + now + tag
    async.series([
        (cb) ->
            # 1. make snapshot
            execute_on
                host    : opts.host
                command : "sudo zfs snapshot #{name}"
                cb      : cb
        (cb) ->
            # 2. record in database that snapshot was made
            record_snapshot
                project_id : opts.project_id
                host       : opts.host
                name       : now + tag
                cb         : cb
        (cb) ->
            # 3. record that project needs to be replicated
            project_needs_replication
                project_id : opts.project_id
                cb         : cb
    ], (err) -> opts.cb?(err))

exports.get_snapshots = get_snapshots = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : undefined
        cb         : required
    if opts.hosts?
        # snapshots on a particular host.
        return
    else
        database.select_one
            table   : 'projects'
            columns : ['locations']
            where   : {project_id : opts.project_id}
            cb      : (err, result) ->
                if err
                    opts.cb(err)
                else if opts.host?
                    v = result[0][opts.host]
                    if v?
                        v = JSON.parse(v)
                    else
                        v = []
                    opts.cb(false, v)
                else
                    ans = {}
                    for k, v of result[0]
                        ans[k] = JSON.parse(v)
                    opts.cb(false, ans)


exports.record_snapshot = record_snapshot = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        name       : required
        remove     : false
        cb         : undefined

    new_snap_list = undefined
    async.series([
        (cb) ->
            get_snapshots
                project_id : opts.project_id
                host       : opts.host
                cb         : (err, v) ->
                    if err
                        cb(err)
                    else
                        if opts.remove
                            try
                                misc.remove(v, opts.name)
                            catch
                                # snapshot not in db anymore; nothing to do.
                                return
                        else
                            v.unshift(opts.name)
                        new_snap_list = v
                        cb()
        (cb) ->
            if not new_snap_list?
                cb(); return
            set_snapshots
                project_id : opts.project_id
                host       : opts.host
                snapshots  : new_snap_list
                cb         : cb
    ], (err) -> opts.cb?(err))

# Set the list of snapshots for a given project.  The
# input list is assumed sorted in reverse order (so newest first).
set_snapshots = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        snapshots  : required
        cb         : undefined

    x = "locations['#{opts.host}']"
    v = {}
    v[x] = JSON.stringify(opts.snapshots)
    database.update
        table : 'projects'
        where : {project_id : opts.project_id}
        set   : v
        cb    : opts.cb

# Connect to host, find out the snapshots, and put the definitely
# correct ordered (newest first) list in the database.
exports.repair_snapshots = repair_snapshots = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        cb         : undefined
    snapshots = []
    f = filesystem(opts.project_id)
    async.series([
        (cb) ->
            # 1. get list of snapshots
            execute_on
                host    : opts.host
                command : "sudo zfs list -r -t snapshot -o name -s creation #{f}"
                cb      : (err, output) ->
                    if err
                        cb(err)
                    else
                        n = f.length
                        for x in output.stdout.split('\n')
                            x = x.slice(n+1)
                            if x
                                snapshots.unshift(x)
                        cb()
        (cb) ->
            # 2. put in database
            set_snapshots
                project_id : opts.project_id
                host       : opts.host
                snapshots  : snapshots
                cb         : cb
    ], (err) -> opts.cb?(err))




project_needs_replication = (opts) ->
    # TODO: not sure if I'm going to do anything with this...
    opts.cb?()


# Destroy snapshot of a given project on one or all hosts that have that snapshot,
# according to the database.  Updates the database to reflect success.
exports.destroy_snapshot = destroy_snapshot = (opts) ->
    opts = defaults opts,
        project_id : required
        name       : required      # typically 'timestamp[-tag]' but could be anything... BUT DON'T!
        host       : undefined     # if not given, attempts to delete snapshot on all hosts
        cb         : undefined

    if not opts.host?
        get_snapshots
            project_id : opts.project_id
            cb         : (err, snapshots) ->
                if err
                    opts.cb?(err)
                else
                    f = (host, cb) ->
                        destroy_snapshot
                            project_id : opts.project_id
                            name       : opts.name
                            host       : host
                            cb         : cb
                    v = (k for k, s of snapshots when s.indexOf(opts.name) != -1)
                    async.each(v, f, (err) -> opts.cb?(err))
        return

    async.series([
        (cb) ->
            # 1. delete snapshot
            execute_on
                host    : opts.host
                command : "sudo zfs destroy #{filesystem(opts.project_id)}@#{opts.name}"
                cb      : (err, output) ->
                    if err
                        if output.stderr.indexOf('could not find any snapshots to destroy')
                            cb()
                        else
                            cb(err)
        (cb) ->
            # 2. success -- so record in database that snapshot was *deleted*
            record_snapshot
                project_id : opts.project_id
                host       : opts.host
                name       : opts.name
                remove     : true
                cb         : cb
    ], (err) -> opts.cb?(err))


###
# Replication
###

hashrings = undefined
topology = undefined
exports.init_hashrings = init_hashrings = (cb) ->
    database.select
        table   : 'storage_topology'
        columns : ['data_center', 'host', 'vnodes']
        cb      : (err, results) ->
            if err
                cb(err); return
            topology = {}
            for r in results
                datacenter = r[0]; host = r[1]; vnodes = r[2]
                if not topology[datacenter]?
                    topology[datacenter] = {}
                topology[datacenter][host] = {vnodes:vnodes}
            winston.debug(misc.to_json(topology))
            hashrings = {}
            for dc, obj of topology
                hashrings[dc] = new HashRing(obj)
            cb?()


exports.locations = locations = (opts) ->
    opts = defaults opts,
        project_id : required
        number     : 4         # number per data center to return
        cb         : undefined

# Replicate = attempt to make it so that the newest snapshot of the project
# is available on all copies of the filesystem.
# This code right now assumes all snapshots are of the form "timestamp[-tag]".
exports.replicate = replicate = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : undefined

    snaps = undefined
    goal = undefined
    locs = locations(project_id:opts.project_id)
    async.series([
        (cb) ->
            get_snapshots
                project_id : opts.project_id
                cb         : (err, snapshots) ->
                    if err
                        cb(err)
                    else
                        snaps = ([s[0], h] for h, s of snapshots)
                        snaps.sort()
                        goal = snaps[snaps.length-1][0]
                        cb()
       (cb) ->
            if not goal? or not snap?
                cb("goal or snap didn't get defined")
                return

    ], (err) -> opts.cb?(err))











