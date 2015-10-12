###

g = require('./smc_gcloud.coffee').gcloud(db:require('rethink').rethinkdb(hosts:'db0', pool:1))

Rewrite this to use the official node.js driver, which is pretty good now, and seems an order
of magnitude faster than using the gcloud command line!

https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.23.0/compute/
https://github.com/GoogleCloudPlatform/gcloud-node

npm install --save gcloud

TODO:

- [ ] increase the boot disk size of a vm
- [ ] change the machine type of a vm
- [ ] switch a vm between being pre-empt or not
- [ ] increase the size of a disk image that is attached to a VM

Rules we care about are:

1. If a VM is TERMINATED, but the desired state is RUNNING and preempt is true, then:
     if it was TERMINATED within 5 minutes create it as non-preempt and start it
     if it was TERMINATED > 5 minutes ago create it as preempt and start it.

2. If a VM has been RUNNING for 12 hours and is not preempt, but the desired state
   is RUNNING and preempt is true, then:
     stop the VM and recreate and start it as prempt.

###
winston     = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

async = require('async')

misc = require('misc')
{defaults, required} = misc
misc_node = require('misc_node')

PROJECT = process.env.SMC_PROJECT ? 'sage-math-inc'
DEFAULT_ZONE = 'us-central1-c'

exports.gcloud = (opts) -> new GoogleCloud(opts)

# how long ago a time was, in hours
age_h = (time) -> (new Date() - time)/(3600*1000)
age_s = (time) -> (new Date() - time)/1000

onCompleteOpts =
    maxAttempts : 30

handle_operation = (err, operation, done, cb) ->
    if err
        done()
        cb?(err)
    else
        operation.onComplete onCompleteOpts, (err, metadata) ->
            done()
            if err
                cb?(err)
            else if metadata.error
                cb?(metadata.error)
            else
                cb?()

class VM
    constructor: (@gcloud, @name, @zone=DEFAULT_ZONE) ->
        @_vm = @gcloud._gce.zone(@zone).vm(@name)

    dbg: (f) -> @gcloud.dbg("vm.#{f}")

    _action: (cmd, cb) =>
        dbg = @dbg(cmd)
        dbg('calling api...')
        start = misc.walltime()
        @_vm[cmd] (err, operation, apiResponse) ->
            handle_operation(err, operation, (->dbg("done -- took #{misc.walltime(start)}s")), cb)

    stop : (opts={}) =>
        @_action('stop', opts.cb)

    start: (opts={}) =>
        @_action('start', opts.cb)

    reset: (opts={}) =>
        @_action('reset', opts.cb)

    get_metadata: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("metadata")
        dbg("starting")
        @_vm.getMetadata (err, metadata, apiResponse) =>
            dbg("done")
            opts.cb(err, metadata)

    status : (opts) =>
        opts = defaults opts,
            cb : required
        @describe
            cb : (err, x) =>
                opts.cb(err, x?.status)

class Disk
    constructor: (@gcloud, @name, @zone=DEFAULT_ZONE) ->
        @_disk = @gcloud._gce.zone(@zone).disk(@name)

    dbg: (f) -> @gcloud.dbg("disk.#{f}")

    #createSnapshot, delete, getMetadata

    snapshot: (opts) =>
        opts = defaults opts,
            name : required
            cb   : undefined
        dbg = @dbg('snapshot')
        dbg('calling api')
        start = misc.walltime()
        done = -> dbg("done  -- took #{misc.walltime(start)}s")
        @_disk.createSnapshot opts.name, (err, snapshot, operation, apiResponse) =>
            handle_operation(err, operation, done, opts.cb)

    get_metadata: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("metadata")
        dbg("starting")
        @_disk.getMetadata (err, metadata, apiResponse) =>
            dbg("done")
            opts.cb(err, metadata)

    # return the snapshots of this disk
    get_snapshots: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("get_snapshots")
        id = undefined
        s = undefined
        async.series([
            (cb) =>
                dbg("determining id of disk")
                @get_metadata
                    cb : (err, data) =>
                        id = data?.id; cb(err)
            (cb) =>
                dbg("get all snapshots with given id as source")
                @gcloud._gce.getSnapshots {filter:"sourceDiskId eq #{id}", maxResults:500}, (err, snapshots) =>
                    if err
                        cb(err)
                    else
                        s = (@gcloud.snapshot(name:x.name) for x in snapshots)
                        cb()
        ], (err) =>
            opts.cb(err, s)
        )

    delete: (opts) =>
        opts = defaults opts,
            cb : undefined
        dbg = @dbg("delete")
        dbg("starting")
        @_disk.delete (err, operation, apiResponse) =>
            handle_operation(err, operation, (->dbg('done')), opts.cb)

class Snapshot
    constructor: (@gcloud, @name) ->
        @_snapshot = @gcloud._gce.snapshot(@name)

    dbg: (f) -> @gcloud.dbg("snapshot.#{f}")

    delete: (opts) =>
        opts = defaults opts,
            cb : undefined
        dbg = @dbg("delete")
        dbg("starting")
        @_snapshot.delete (err, operation, apiResponse) =>
            handle_operation(err, operation, (->dbg('done')), opts.cb)

    get_metadata: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("metadata")
        dbg("starting")
        @_snapshot.getMetadata (err, metadata, apiResponse) =>
            dbg("done")
            opts.cb(err, metadata)

    get_size_GB: (opts) =>
        opts = defaults opts,
            cb : required
        if @_snapshot.metadata.storageBytes
            opts.cb(undefined, @_snapshot.metadata.storageBytes / 1000 / 1000 / 1000)
        else
            @get_metadata
                cb : (err, data) =>
                    if err
                        opts.cb(err)
                    else
                        opts.cb(undefined, data.storageBytes / 1000 / 1000 / 1000)

class GoogleCloud
    constructor: (opts={}) ->
        opts = defaults opts,
            debug : true
            db    : undefined
        @db = opts.db
        @_debug = opts.debug
        if @_debug
            @dbg = (f) -> ((m) -> winston.debug("gcloud.#{f}: #{m}"))
        else
            @dbg = (f) -> (->)

        @_gcloud = require('gcloud')(projectId: PROJECT)
        @_gce    = @_gcloud.compute()

    vm: (opts) =>
        opts = defaults opts,
            name : required
            zone : DEFAULT_ZONE
        key = "#{opts.name}-#{opts.zone}"
        # create cache if not already created
        @_vm_cache ?= {}
        # set value for key if not already set; return it
        return (@_vm_cache[key] ?= new VM(@, opts.name, opts.zone))

    disk: (opts) =>
        opts = defaults opts,
            name : required
            zone : DEFAULT_ZONE
        key = "#{opts.name}-#{opts.zone}"
        @_disk_cache ?= {}
        return (@_disk_cache[key] ?= new Disk(@, opts.name, opts.zone))

    snapshot: (opts) =>
        opts = defaults opts,
            name : required
        key = opts.name
        @_snapshot_cache ?= {}
        return (@_snapshot_cache[key] ?= new Snapshot(@, opts.name))

    get_vms: (opts) =>
        opts = defaults opts,
            cb  : required
        @dbg("get_vms")()
        @_gce.getVMs (err, vms) =>
            if err
                opts.cb(err)
            else
                for x in vms
                    if x.zone?
                        delete x.zone
                opts.cb(undefined, vms)

    _check_db: (cb) =>
        if not @db
            cb?("database not defined")
            return true

    update_db: (opts={}) =>
        opts = defaults opts,
            cb : undefined
        return if @_check_db(opts.cb)
        db_data  = {}
        gce_data = {}
        table = @db.table('instances')
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        winston.debug("get info from Google Compute engine api about all VMs")
                        @get_vms
                            cb : (err, data) =>
                                if err
                                    cb(err)
                                else
                                    for x in data
                                        gce_data[x.name] = x
                                    winston.debug("got gce api data about #{data.length} VMs")
                                    cb()
                    (cb) =>
                        winston.debug("get info from our database about all VMs")
                        table.pluck('name', 'gce_sha1').run (err, data) =>
                            if err
                                cb(err)
                            else
                                for x in data
                                    db_data[x.name] = x.gce_sha1
                                winston.debug("got database data about #{misc.len(db_data)} VMs")
                                cb()
                ], cb)
            (cb) =>
                objects = []
                for name, x of gce_data
                    new_sha1 = misc_node.sha1(JSON.stringify(x))
                    sha1 = db_data[name]
                    if new_sha1 != sha1
                        objects.push(name:name, gce:x, gce_sha1:new_sha1)
                if objects.length == 0
                    winston.debug("nothing changed")
                    cb()
                else
                    winston.debug("#{objects.length} vms changed")
                    global.objects = objects
                    table.insert(objects, conflict:'update').run(cb)
        ], (err) =>
            opts.cb?(err)
        )

    watch_vms: (opts) =>
        opts = defaults opts,
            cb : required
        return if @_check_db(opts.cb)
        query = @db.table('instances')
        query.run (err, vms) =>
            if err
                opts.cb(err)
                return
            @db.table('instances').changes().run (err, feed) =>
                if err
                    opts.cb(err)
                    return
                feed.each (err, change) =>
                    if err
                        opts.cb(err)
                        return
                    if change.old_val?
                        delete vms[change.old_val.name]
                    if change.new_val?
                        vms[change.new_val.name] = change.new_val
                    @_rule1(new_val, old_val)
                    @_rule2(new_val, old_val)

    _rule1: (new_val, old_val) =>
        if new_val.gce?.STATUS == 'TERMINATED' and new_val.desired_status == 'RUNNING'
            winston.debug("rule1: start terminated instance")

    _rule2: (new_val, old_val) =>
        if new_val.gce?.STATUS == 'RUNNING' and new_val.desired_status == 'RUNNING' \
                 and new_val.preempt and age_h(new_val.started) >= 12
            winston.debug("rule2: switch instance back to preempt")

