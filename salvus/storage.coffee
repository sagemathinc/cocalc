#################################################################
#
# storage -- a node.js program/library for interacting with
# the SageMath Cloud's ZFS-based replicated distributed snapshotted
# project storage system.
#
#################################################################

winston   = require 'winston'
HashRing  = require 'hashring'
rmdir     = require('rimraf')
fs        = require 'fs'
cassandra = require 'cassandra'
async     = require 'async'
misc      = require 'misc'
misc_node = require 'misc_node'
uuid      = require 'node-uuid'
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

exports.db = () -> database # TODO -- for testing

filesystem = (project_id) -> "projects/#{project_id}"

mountpoint = (project_id) -> "/projects/#{project_id}"

execute_on = (opts) ->
    opts = defaults opts,
        host    : required
        command : required
        err_on_exit : true
        timeout : 7200
        cb      : undefined
    t0 = misc.walltime()
    misc_node.execute_code
        command     : "ssh"
        args        : ["-o StrictHostKeyChecking=no", "storage@#{opts.host}", opts.command]
        timeout     : opts.timeout
        err_on_exit : opts.err_on_exit
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
                    if not result?
                        opts.cb(undefined, [])
                    else
                        v = result[0][opts.host]
                        if v?
                            v = JSON.parse(v)
                        else
                            v = []
                        opts.cb(undefined, v)
                else
                    ans = {}
                    for k, v of result[0]
                        ans[k] = JSON.parse(v)
                    opts.cb(undefined, ans)


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
    winston.debug("setting snapshots for #{opts.project_id} to #{misc.to_json(opts.snapshots)}")

    x = "locations['#{opts.host}']"

    if opts.snapshots.length == 0
        # deleting it
        database.delete
            thing : x
            table : 'projects'
            where : {project_id : opts.project_id}
            cb    : opts.cb
        return

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
        host       : undefined
        cb         : undefined
    if not opts.host?
        # repair on all hosts that are "reasonable", i.e., anything in the db now.
        hosts = undefined
        async.series([
            (cb) ->
                get_snapshots
                    project_id : opts.project_id
                    cb         : (err, snapshots) ->
                        if err
                            cb(err)
                        else
                            hosts = misc.keys(snapshots)
                            cb()
            (cb) ->
                f = (host, cb) ->
                    repair_snapshots
                        project_id : opts.project_id
                        host       : host
                        cb         : cb
                async.map(hosts, f, cb)
        ], (err) -> opts.cb?(err))
        return

    # other case -- a single host.

    snapshots = []
    f = filesystem(opts.project_id)
    async.series([
        (cb) ->
            # 1. get list of snapshots
            execute_on
                host    : opts.host
                command : "sudo zfs list -r -t snapshot -o name -s creation #{f}"
                cb      : (err, output) ->
                    winston.debug(err, output)
                    if err
                        if output.stderr.indexOf('not exist') != -1
                            # entire project deleted from this host.
                            winston.debug("filesystem was deleted from #{opts.host}")
                            cb()
                        else
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
                            err = undefined
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
        number     : 2         # number per data center to return

    return (ring.range(opts.project_id, opts.number) for dc, ring of hashrings)

# Replicate = attempt to make it so that the newest snapshot of the project
# is available on all copies of the filesystem.
# This code right now assumes all snapshots are of the form "timestamp[-tag]".
exports.replicate = replicate = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : undefined

    snaps   = undefined
    source  = undefined

    targets = locations(project_id:opts.project_id)
    num_replicas = targets[0].length

    snapshots = undefined

    versions = []   # will be list {host:?, version:?} of out-of-date objs, grouped by data center.

    async.series([
        (cb) ->
            # Determine information about all known snapshots
            # of this project, and also the best source for
            # replicating out (which might not be one of the
            # locations determined by the hash ring).
            tm = misc.walltime()
            get_snapshots
                project_id : opts.project_id
                cb         : (err, result) ->
                    if err
                        cb(err)
                    else
                        snapshots = result
                        snaps = ([s[0], h] for h, s of snapshots)
                        snaps.sort()
                        x = snaps[snaps.length - 1]
                        ver = x[0]
                        source = {version:ver, host:x[1]}
                        # determine version of each target
                        for k in targets
                            v = []
                            for host in k
                                v.push({version:snapshots[host]?[0], host:host})
                            if v.length > 0
                                versions.push(v)
                        winston.debug("replicate (time=#{misc.walltime(tm)})-- status: #{misc.to_json(versions)}")
                        cb()
       (cb) ->
            # STAGE 1: do inter-data center replications so each data center contains at least one up to date node
            f = (d, cb) ->
                # choose newest in the datacenter -- this one is easiest to get up to date
                dest = d[0]
                for i in [1...d.length]
                    if d[i].version > dest.version
                        dest = d[i]
                if source.version == dest.version
                    cb() # already done
                else
                    send
                        project_id : opts.project_id
                        source     : source
                        dest       : dest
                        cb         : (err) ->
                            if not err
                                # means that we succeeded in the version update; record this so that
                                # the code in STAGE 2 below works.
                                dest.version = source.version
                            cb(err)
            async.map(versions, f, cb)

       (cb) ->
            # STAGE 2: do intra-data center replications to get all data in each data center up to date.
            f = (d, cb) ->
                # choose last *newest* in the datacenter as source
                src = d[0]
                for i in [1...d.length]
                    if d[i].version > src.version
                        src = d[i]
                # crazy-looking nested async maps because we're writing this to handle
                # having more than 2 replicas per data center, though I have no plans
                # to actually do that.
                g = (dest, cb) ->
                    if src.version == dest.version
                        cb()
                    else
                        send
                            project_id : opts.project_id
                            source     : src
                            dest       : dest
                            cb         : cb
                async.map(d, g, cb)

            async.map(versions, f, cb)

    ], (err) -> opts.cb?(err))

exports.send = send = (opts) ->
    opts = defaults opts,
        project_id : required
        source     : required    # {host:ip_address, version:snapshot_name}
        dest       : required    # {host:ip_address, version:snapshot_name}
        force      : true
        cb         : undefined

    winston.info("** SEND **: #{misc.to_json(opts.source)} --> #{misc.to_json(opts.dest)}")

    if opts.source.version == opts.dest.version
        # trivial special case
        opts.cb()
        return

    tmp = "/home/storage/.storage-#{opts.project_id}-src-#{opts.source.host}-#{opts.source.version}-dest-#{opts.dest.host}-#{opts.dest.version}"
    f = filesystem(opts.project_id)
    clean_up = false
    async.series([
        (cb) ->
            # check for already-there dump file
            execute_on
                host    : opts.source.host
                command : "ls #{tmp}"
                err_on_exit : false
                cb      : (err, output) ->
                    if err
                        cb(err)
                    else if output.exit_code == 0
                        # file exists!
                        cb("file #{tmp} already exists on #{opts.source.host}")
                    else
                        # good to go
                        cb()
        (cb) ->
            # dump range of snapshots
            start = if opts.dest.version then "-i #{f}@#{opts.dest.version}" else ""
            clean_up = true
            execute_on
                host    : opts.source.host
                command : "sudo zfs send -RD #{start} #{f}@#{opts.source.version} | lz4c -  > #{tmp}"
                cb      : (err, output) ->
                    winston.debug(output)
                    if output.stderr
                        err = output.stderr
                    cb(err)
        (cb) ->
            # scp to destination
            execute_on
                host    : opts.source.host
                command : "scp -o StrictHostKeyChecking=no #{tmp} storage@#{opts.dest.host}:#{tmp}; echo ''>#{tmp}"
                cb      :  (err, output) ->
                    winston.debug(output)
                    cb(err)
        (cb) ->
            # receive on destination side
            force = if opts.force then '-F' else ''
            execute_on
                host    : opts.dest.host
                command : "cat #{tmp} | lz4c -d - | sudo zfs recv #{force} #{f}; rm #{tmp}"
                cb      : (err, output) ->
                    winston.debug(output)
                    if output.stderr
                        if output.stderr.indexOf('destination has snapshots') != -1
                            # this is likely caused by the database being stale regarding what snapshots are known,
                            # so we run a repair so that next time it will work.
                            repair_snapshots
                                project_id : opts.project_id
                                host       : opts.dest.host
                                cb         : (ignore) ->
                                    cb(err)
                            return
                        err = output.stderr
                    cb(err)
        (cb) ->
            # update database to reflect the new list of snapshots resulting from this recv
            # We use repair_snapshots to guarantee that this is correct.
            repair_snapshots
                project_id : opts.project_id
                host       : opts.dest.host
                cb         : cb
    ], (err) ->
        # remove the lock file
        if clean_up
            execute_on
                host    : opts.source.host
                command : "rm #{tmp}"
                cb      : (ignored) ->
                    opts.cb?(err)
        else
            # no need to clean up -- bailing due to another process lock
            opts.cb?(err)
    )

exports.destroy_project = destroy_project = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        cb         : undefined

    async.series([
        (cb) ->
            # 1. delete snapshot
            execute_on
                host    : opts.host
                command : "sudo zfs destroy #{filesystem(opts.project_id)}"
                cb      : (err, output) ->
                    if err
                        if output.stderr.indexOf('does not exist')
                            err = undefined
                    cb(err)
        (cb) ->
            # 2. success -- so record in database that project is no longer on this host.
            set_snapshots
                project_id : opts.project_id
                host       : opts.host
                snapshots  : []
                cb         : cb
    ], (err) -> opts.cb?(err))




###
# init
###

exports.init = init = (cb) ->
    async.series([
        connect_to_database
        init_hashrings
    ], cb)

# TODO
init (err) ->
    winston.debug("init -- #{err}")







