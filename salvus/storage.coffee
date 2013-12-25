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
_         = require 'underscore'
{defaults, required} = misc

# Set the log level to debug
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, level: 'debug')

SALVUS_HOME=process.cwd()
STORAGE_USER = 'storage'
STORAGE_TMP = '/home/storage/'
TIMEOUT = 7200  # 2 hours

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
username   = (project_id) -> project_id.replace(/-/g,'')

execute_on = (opts) ->
    opts = defaults opts,
        host        : required
        command     : required
        err_on_exit : true
        err_on_stderr : true     # if anything appears in stderr then set err=output.stderr, even if the exit code is 0.
        timeout     : TIMEOUT
        user        : STORAGE_USER
        cb          : undefined
    t0 = misc.walltime()
    misc_node.execute_code
        command     : "ssh"
        args        : ["-o StrictHostKeyChecking=no", "#{opts.user}@#{opts.host}", opts.command]
        timeout     : opts.timeout
        err_on_exit : opts.err_on_exit
        cb          : (err, output) ->
            if not err? and opts.err_on_stderr and output.stderr
                err = output.stderr
            winston.debug("#{misc.walltime(t0)} seconds to execute '#{opts.command}' on #{opts.host}")
            opts.cb?(err, output)


######################
# Health/status
######################
###
# healthy and up  = "zpool list -H projects" responds like this within 5 seconds?
# projects        508G    227G    281G    44%     2.22x   ONLINE  -
# Or maybe check that "zpool import" isn't a running process?
salvus@compute11a:~$ ps ax |grep zpool
 1445 ?        S      0:00 sh -c zpool import -Nf projects; mkdir -p /projects; chmod a+rx /projects
 1446 ?        D      0:00 zpool import -Nf projects

or this since we don't need "sudo zpool":

    storage@compute11a:~$ sudo zfs list projects
    NAME       USED  AVAIL  REFER  MOUNTPOINT
    projects   148G   361G  4.92M  /projects
    salvus@cloud1:~$ sudo zfs list projects
    [sudo] password for salvus:
    cannot open 'projects': dataset does not exist

###

######################
# Running Projects
######################


# if user doesn't exist, create them
exports.create_user = create_user = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        action     : 'create'   # 'create', 'kill' (kill all proceses), 'skel' (copy over skeleton)
        cb         : undefined
    winston.info("creating user for #{opts.project_id} on #{opts.host}")
    execute_on
        host    : opts.host
        command : "sudo /usr/local/bin/create_project_user.py --#{opts.action} #{opts.project_id}"
        timeout : 30
        cb      : opts.cb


# Open project on the given host.  This mounts the project, ensures the appropriate
# user exists and that ssh-based login to that user works.
exports.open_project = open_project = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        cb         : required
    winston.info("opening project #{opts.project_id} on #{opts.host}")
    dbg = (m) -> winston.debug("open_project(#{opts.project_id},#{opts.host}): #{m}")

    async.series([
        (cb) ->
            dbg("mount filesystem")
            execute_on
                host    : opts.host
                timeout : 30
                command : "sudo zfs set mountpoint=#{mountpoint(opts.project_id)} #{filesystem(opts.project_id)}&&sudo zfs mount #{filesystem(opts.project_id)}"
                cb      : (err, output) ->
                    if err
                        if err.indexOf('filesystem already mounted') != -1  or err.indexOf('cannot unmount') # non-fatal: to be expected if fs mounted/busy already
                            err = undefined
                    cb(err)
        (cb) ->
            dbg("create user")
            create_user
                project_id : opts.project_id
                action     : 'create'
                host       : opts.host
                cb         : cb
        (cb) ->
            dbg("test login")
            execute_on
                host    : opts.host
                timeout : 10
                user    : username(opts.project_id)
                command : "pwd"
                cb      : (err, output) ->
                    if err
                        cb(err)
                    else if output.stdout.indexOf(mountpoint(opts.project_id)) == -1
                        cb("failed to properly mount project")
                    else
                        cb()
    ], opts.cb)


exports.close_project = close_project = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        cb         : required
    winston.info("close project #{opts.project_id} on #{opts.host}")
    dbg = (m) -> winston.debug("close_project(#{opts.project_id},#{opts.host}): #{m}")

    user = username(opts.project_id)
    async.series([
        (cb) ->
            dbg("killing all processes")
            create_user
                project_id : opts.project_id
                host       : opts.host
                action     : 'kill'
                cb         : cb
        (cb) ->
            dbg("unmount filesystem")
            execute_on
                host    : opts.host
                timeout : 30
                command : "sudo zfs set mountpoint=none #{filesystem(opts.project_id)}&&sudo zfs umount #{filesystem(opts.project_id)}"
                cb      : (err, output) ->
                    if err
                        if err.indexOf('not currently mounted') != -1    # non-fatal: to be expected (due to using both mountpoint setting and umount)
                            err = undefined
                    cb(err)
    ], opts.cb)


# Creates project with given id on exactly one (random) available host, and
# returns that host.  This also snapshots the projects, which puts it in the
# database.  It does not replicate the project out to all hosts. 
exports.create_project = create_project = (opts) ->
    opts = defaults opts,
        project_id : required
        quota      : '5G'
        cb         : required    # cb(err, host)   where host=ip address of a machine that has the project.

    winston.info("create project #{opts.project_id}")
    dbg = (m) -> winston.debug("create_project(#{opts.project_id}): #{m}")

    dbg("check if the project filesystem already exists somewhere")
    get_hosts
        project_id : opts.project_id
        cb         : (err, hosts) ->
            if err
                opts.cb(err); return
            if hosts.length > 0
                opts.cb(undefined, [hosts[0]]); return

            # according to DB, the project filesystem doesn't exist anywhere, so let's make it somewhere...
            locs = _.flatten(locations(project_id:opts.project_id))

            # try each host in locs (in random order) until one works
            done = false
            fs = filesystem(opts.project_id)
            host = undefined
            errors = []
            f = (i, cb) ->
                if done
                    cb(); return
                dbg("try to allocate project (attempt #{i+1})")
                host = misc.random_choice(locs)
                misc.remove(locs, host)
                async.series([
                    (c) ->
                        dbg("creating ZFS filesystem")
                        execute_on
                            host    : host
                            command : "sudo zfs create #{fs} && sudo zfs set snapdir=hidden #{fs} && sudo zfs set quota=#{opts.quota} #{fs}"
                            timeout : 15
                            cb      : c
                    (c) ->
                        dbg("created fs successfully; now create user")
                        create_user
                            project_id : opts.project_id
                            host       : host
                            action     : 'create'
                            cb         : c
                    (c) ->
                        dbg("now open the project (so it's mounted)")
                        open_project
                            project_id : opts.project_id
                            host       : host
                            cb         : c
                    (c) ->
                        dbg("copy over the template files, e.g., .sagemathcloud")
                        create_user
                            project_id : opts.project_id
                            action     : 'skel'
                            host       : host
                            cb         : c
                    (c) ->
                        dbg("close the project ")
                        close_project
                            project_id : opts.project_id
                            host       : host
                            cb         : c
                    (c) ->
                        dbg("snapshot the project")
                        snapshot
                            project_id : opts.project_id
                            host       : host
                            cb         : c
                ], (err) ->
                    if not err
                        done = true
                    else
                        dbg("error #{host} -- #{err}")
                        errors.push(err)
                    cb()
                )
            async.mapSeries [0...locs.length], f, () ->
                if done
                    opts.cb(undefined, host)
                else
                    opts.cb(errors)






######################
# Managing Projects
######################


exports.quota = quota = (opts) ->
    opts = defaults opts,
        project_id : required
        size       : undefined    # if given, first sets the quota
        host       : undefined    # if given, only operate on the given host; otherwise operating on all hosts of the project (and save in database if setting)
        cb         : undefined    # cb(err, quota in bytes)
    winston.info("quota -- #{misc.to_json(opts)}")

    dbg = (m) -> winston.debug("quota (#{opts.project_id}): #{m}")

    if not opts.host?
        hosts   = undefined
        results = undefined
        size    = undefined
        async.series([
            (cb) ->
                dbg("get list of hosts")
                get_hosts
                    project_id : opts.project_id
                    cb         : (err, h) ->
                        hosts = h
                        if not err and hosts.length == 0
                            err = 'no hosts -- quota not defined'
                        cb(err)
            (cb) ->
                dbg("#{if opts.size then 'set' else 'compute'} quota on all hosts: #{misc.to_json(hosts)}")
                f = (host, c) ->
                    quota
                        project_id : opts.project_id
                        size       : opts.size
                        host       : host
                        cb         : c
                async.map hosts, f, (err, r) ->
                    results = r
                    cb(err)
            (cb) ->
                if opts.size?
                    size = opts.size
                    cb()
                    return
                dbg("checking that all quotas consistent...")
                size = misc.max(results)
                if misc.min(results) == size
                    cb()
                else
                    winston.info("quota (#{opts.project_id}): self heal -- quota discrepancy, now self healing to max size (=#{size})")
                    f = (i, c) ->
                        host = hosts[i]
                        if results[i] >= size
                            # already maximal, so no need to set it
                            c()
                        else
                            quota
                                project_id : opts.project_id
                                size       : size
                                host       : host
                                cb         : c
                    async.map([0...hosts.length], f, cb)
            (cb) ->
                dbg("saving in database")
                database.update
                    table : 'projects'
                    where : {project_id : opts.project_id}
                    set   : {'quota_zfs':"#{size}"}
                    cb    : cb
        ], (err) ->
            opts.cb?(err, size)
        )
        return

    if not opts.size?
        dbg("getting quota on #{opts.host}")
        execute_on
            host       : opts.host
            command    : "sudo zfs get -pH -o value quota #{filesystem(opts.project_id)}"
            cb         : (err, output) ->
                if not err
                    size = output.stdout
                    size = parseInt(size)
                opts.cb?(err, size)
    else
        dbg("setting quota on #{opts.host} to #{opts.size}")
        execute_on
            host       : opts.host
            command    : "sudo zfs set quota=#{opts.size} #{filesystem(opts.project_id)}"
            cb         : (err, output) ->
                opts.cb?(err, opts.size)

# Find a host for this project that has the most recent snapshot
exports.updated_host = updated_host = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required   # cb(err, hostname)

    get_snapshots
        project_id : opts.project_id
        cb         : (err, snapshots) ->
            if not err and snapshots.length == 0
                err = "project doesn't have any data"
            if err
                opts.cb(err)
                return
            v = ([val[0],host] for host, val of snapshots)
            v.sort()
            host = v[v.length-1][1]
            opts.cb(undefined, host)


exports.get_usage = get_usage = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : undefined  # if not given, choos any node with newest snapshot
        cb         : required   # cb(err, {avail:?, used:?, usedsnap:?})  # ? are strings like '17M' or '13G' as output by zfs.  NOT bytes.
                                # on success, the quota field in the database for the project is set as well
    usage = undefined
    dbg = (m) -> winston.debug("get_usage (#{opts.project_id}): #{m}")

    async.series([
        (cb) ->
            if opts.host?
                cb()
            else
                dbg("determine host")
                updated_host
                    project_id : opts.project_id
                    cb         : (err, host) ->
                        opts.host = host
                        cb(err)
        (cb) ->
            dbg("getting usage on #{opts.host}")
            execute_on
                host    : opts.host
                command : "sudo zfs list -H -o avail,used,usedsnap #{filesystem(opts.project_id)}"
                cb      : (err, output) ->
                    if err
                        cb(err)
                    else
                        v = output.stdout.split('\t')
                        usage = {avail:v[0].trim(), used:v[1].trim(), usedsnap:v[2].trim()}
                        cb()
        (cb) ->
            dbg("updating database with usage = #{usage}")
            database.update
                table : 'projects'
                where : {project_id : opts.project_id}
                set   : {'usage_zfs':usage}
                json  : ['usage_zfs']
                cb    : cb
    ], (err) -> opts.cb?(err, usage))





######################
# Snapshotting
######################

# Make a snapshot of a given project on a given host and record
# this in the database.
exports.snapshot = snapshot = (opts) ->
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
                timeout : 300
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
        database.select
            table   : 'projects'
            columns : ['locations']
            where   : {project_id : opts.project_id}
            cb      : (err, result) ->
                if err
                    opts.cb(err)
                    return
                if result.length == 0 # no record of this project, so no hosts; not an error
                    opts.cb(undefined, [])
                    return
                else
                    result = result[0]
                if opts.host?
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

# Compute list of all hosts that actually have some version of the project.
# WARNING: returns an empty list if the project doesn't exist in the database!  *NOT* an error.
exports.get_hosts = get_hosts = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required  # cb(err, [list of hosts])
    get_snapshots
        project_id : opts.project_id
        cb         : (err, snapshots) ->
            if err
                opts.cb(err)
            else
                opts.cb(undefined, (host for host, snaps of snapshots when snaps?.length > 0))

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
        host       : undefined   # use "all" for **all** possible hosts on the whole cluster
        cb         : undefined
    if not opts.host? or opts.host == 'all'
        hosts = undefined
        async.series([
            (cb) ->
                if opts.host == 'all'
                    hosts = all_hosts
                    cb()
                else
                    # repair on all hosts that are "reasonable", i.e., anything in the db now.
                    get_hosts
                        project_id : opts.project_id
                        cb         : (err, r) ->
                            hosts = r
                            cb(err)
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
                timeout : 600
                cb      : (err, output) ->
                    winston.debug(err, output)
                    if err
                        if output?.stderr? and output.stderr.indexOf('not exist') != -1
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
                timeout : 600
                cb      : (err, output) ->
                    if err
                        if output?.stderr? and output.stderr.indexOf('could not find any snapshots to destroy')
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
ZFS_CHANGES={'-':'removed', '+':'created', 'M':'modified', 'R':'renamed'}
ZFS_FILE_TYPES={'B':'block device', 'C':'character device', '/':'directory',
                '>':'door', '|':'named pipe', '@':'symbolic link',
                'P':'event port', '=':'socket', 'F':'regular file'}
exports.diff = diff = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        snapshot   : required
        snapshot2  : undefined   # if undefined, compares with filesystem
###



######################
# Replication
######################

hashrings = undefined
topology = undefined
all_hosts = []
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
                all_hosts.push(host)
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

    new_project = false
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
                        if not result? or misc.len(result) == 0
                            # project doesn't have any snapshots at all or location.
                            # this could happen for a new project with no data, or one not migrated.
                            winston.debug("WARNING: project #{opts.project_id} has no snapshots")
                            new_project = true
                            cb(true)
                            return

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

    ], (err) ->
        if new_project
            opts.cb?()
        else
            opts.cb?(err)
    )

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

    tmp = "#{STORAGE_TMP}/.storage-#{opts.project_id}-src-#{opts.source.host}-#{opts.source.version}-dest-#{opts.dest.host}-#{opts.dest.version}.lz4"
    f = filesystem(opts.project_id)
    clean_up = false
    async.series([
        (cb) ->
            # check for already-there dump file
            execute_on
                host    : opts.source.host
                command : "ls #{tmp}"
                timeout : 120
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
                    cb(err)
        (cb) ->
            # scp to destination
            execute_on
                host    : opts.source.host
                command : "scp -o StrictHostKeyChecking=no #{tmp} #{STORAGE_USER}@#{opts.dest.host}:#{tmp}; echo ''>#{tmp}"
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
                    if output?.stderr?
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
                timeout : 120
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
            # 1. delete dataset
            execute_on
                host    : opts.host
                command : "sudo zfs destroy -r #{filesystem(opts.project_id)}"
                cb      : (err, output) ->
                    if err
                        if output?.stderr? and output.stderr.indexOf('does not exist') != -1
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

# Query database for *all* project's, sort them in alphabetical order,
# then run replicate on every single one.
# At the end, all projects should be replicated out to all their locations.
# Since the actual work happens all over the cluster (none on the machine
# running this, if it is a web machine), it is reasonable safe to run
# with a higher limit... maybe.
exports.replicate_all = replicate_all = (opts) ->
    opts = defaults opts,
        limit : 3   # no more than this many projects will be replicated simultaneously
        start : undefined  # if given, only takes projects.slice(start, stop) -- useful for debugging
        stop  : undefined
        cb    : undefined  # cb(err, {project_id:error when replicating that project})

    projects = undefined
    errors = {}
    done = 0
    todo = undefined
    async.series([
        (cb) ->
            database.select
                table   : 'projects'
                columns : ['project_id']
                limit   : if opts.stop? then opts.stop else 1000000       # TODO: change to use paging...
                cb      : (err, result) ->
                    if result?
                        projects = (x[0] for x in result)
                        projects.sort()
                        if opts.start? and opts.stop?
                            projects = projects.slice(opts.start, opts.stop)
                        todo = projects.length
                    cb(err)
        (cb) ->
            f = (project_id, cb) ->
                winston.debug("replicate_all -- #{project_id}")
                replicate
                    project_id : project_id
                    cb         : (err) ->
                        done += 1
                        winston.info("REPLICATE_ALL STATUS: finished #{done}/#{todo}")
                        if err
                            errors[project_id] = err
                        cb()
            async.mapLimit(projects, opts.limit, f, cb)
    ], (err) -> opts.cb?(err, errors))





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







