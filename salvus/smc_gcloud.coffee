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
- [ ] change the name of a disk

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
            #winston.debug("onComplete #{misc.to_json(err)}, #{misc.to_json(metadata)}")
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

    delete: (opts={}) =>
        @_action('delete', opts.cb)

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

    attach_disk: (opts) =>
        opts = defaults opts,
            disk      : required
            read_only : false
            cb        : required
        dbg = @dbg("attach_disk")
        if not (opts.disk instanceof Disk)
            dbg("not Disk")
            if typeof(opts.disk) == 'string'
                dbg("is string so make disk")
                opts.disk = @gcloud.disk(name:opts.disk, zone:@zone)
            else
                opts.cb("disk must be an instance of Disk")
                return
        dbg("starting...")
        @_vm.attachDisk opts.disk._disk, {readOnly: opts.read_only}, (err, operation, apiResponse) =>
            handle_operation(err, operation, (->dbg("done")), opts.cb)

    detach_disk: (opts) =>
        opts = defaults opts,
            disk : required
            cb   : required
        dbg = @dbg("detach_disk")
        if not (opts.disk instanceof Disk)
            dbg("not Disk")
            if typeof(opts.disk) == 'string'
                dbg("is string so make disk")
                opts.disk = @gcloud.disk(name:opts.disk, zone:@zone)
            else
                opts.cb("disk must be an instance of Disk")
                return
        dbg("starting...")
        vm_data = disk_data = undefined
        async.series([
            (cb) =>
                dbg("getting disk and vm metadata in parallel")
                async.parallel([
                    (cb) =>
                        @get_metadata
                            cb : (err, x) =>
                                vm_data = x; cb(err)
                    (cb) =>
                        opts.disk.get_metadata
                            cb : (err, x) =>
                                disk_data = x; cb(err)
                ], cb)
            (cb) =>
                deviceName = undefined
                for x in vm_data.disks
                    if x.source == disk_data.selfLink
                        deviceName = x.deviceName
                        break
                dbg("determined that local deviceName is '#{deviceName}'")
                if not deviceName
                    dbg("already done -- disk not connected to this machine")
                    cb()
                    return
                # weird hack around what might be a bug in GCE code (NOT SURE YET)
                # It's strange we have to make the disk from the deviceName rather than
                # the actual disk name.  It seems like the node.js api authors got confused.
                disk = @gcloud._gce.zone(@zone).disk(deviceName)
                @_vm.detachDisk disk, (err, operation, apiResponse) =>
                    handle_operation(err, operation, (->dbg("done")), cb)
        ], (err) => opts.cb(err))

    get_serial_console: (opts) =>
        opts = defaults opts,
            cb   : required
        @_vm.getSerialPortOutput (err, output) => opts.cb(err, output)

    show_console: =>
        @get_serial_console
            cb : (err, output) =>
                if err
                    console.log("ERROR -- ", err)
                else
                    console.log(output)

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
                @gcloud.get_snapshots
                    filter : "sourceDiskId eq #{id}"
                    cb     : (err, snapshots) =>
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

    attach_to: (opts) =>
        opts = defaults opts,
            vm        : required
            read_only : false
            cb        : required
        if not (opts.vm instanceof VM)
            opts.cb("vm must be an instance of VM")
            return
        opts.vm.attach_disk
            disk      : @
            read_only : opts.read_only
            cb        : opts.cb

    detach: (opts) =>
        opts = defaults opts,
            vm : undefined   # if not given, detach from all users of this disk
            cb : required
        dbg = @dbg("detach")
        vms = undefined
        async.series([
            (cb) =>
                if opts.vm?
                    vms = [opts.vm]
                    cb()
                else
                    dbg("determine vm that disk is attached to")
                    @get_metadata
                        cb : (err, data) =>
                            if err
                                cb(err)
                            else
                                # all the users must be in the same zone as this disk
                                vms = (@gcloud.vm(name:misc.path_split(u).tail, zone:@zone) for u in data.users)
                                cb()
            (cb) =>
                dbg('actually detach disk from that vm')
                f = (vm, cb) =>
                    vm.detach_disk
                        disk : @
                        cb   : cb
                async.map(vms, f, cb)

            ], opts.cb)

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

    # create disk based on this snapshot
    create_disk: (opts) =>
        opts = defaults opts,
            name    : required
            size_GB : undefined
            type    : 'pd-standard'   # 'pd-standard' or 'pd-ssd'
            zone    : DEFAULT_ZONE
            cb      : undefined
        dbg = @dbg("create_disk(#{misc.to_json(opts)})")
        dbg("starting...")
        config =
            sourceSnapshot : "global/snapshots/#{@name}"
        config.sizeGb = opts.size_GB if opts.size_GB?
        config.type = opts.type if opts.type?
        @gcloud._gce.zone(@zone).createDisk opts.name, config, (err, disk, operation, apiResponse) =>
            handle_operation(err, operation, (->dbg('done')), (err) => opts.cb?(err))


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

    create_vm: (opts) =>
        opts = defaults opts,
            name         : required
            zone         : DEFAULT_ZONE
            disks        : undefined      # see disks[] at https://cloud.google.com/compute/docs/reference/latest/instances
                                          # can also pass in Disk objects in the array; or a single string which
                                          # will refer to the disk with that name in same zone.
            http         : undefined      # allow http
            https        : undefined      # allow https
            machine_type : undefined      # the instance type, e.g., 'n1-standard-1'
            os           : undefined      # see https://github.com/stephenplusplus/gce-images#accepted-os-names
            tags         : undefined      # array of strings
            preemptible  : false
            cb           : required
        dbg = @dbg("create_vm(name=#{opts.name})")
        config = {}
        config.http        = opts.http if opts.http?
        config.https       = opts.https if opts.https?
        config.machineType = opts.machine_type if opts.machine_type?
        config.os          = opts.os if opts.os?
        config.tags        = opts.tags if opts.tags?
        if opts.preemptible
            config.scheduling = {preemptible : true}
        if opts.disks?
            config.disks = []
            for disk in opts.disks
                if typeof(disk) == 'string'
                    disk = @disk(name:disk, zone:opts.zone)  # gets used immediately below!

                if disk instanceof Disk
                    # use existing disk read/write
                    config.disks.push({source:disk._disk.formattedName})
                else
                    # use object as specified at https://cloud.google.com/compute/docs/reference/latest/instances
                    config.disks.push(disk)
            # ensure at least one disk is a boot disk
            if config.disks.length > 0 and (x for x in config.disks when x.boot).length == 0
                config.disks[0].boot = true
        dbg("config=#{misc.to_json(config)}")
        @_gce.zone(opts.zone).createVM opts.name, config, (err, vm, operation, apiResponse) =>
            handle_operation(err, operation, (->dbg('done')), opts.cb)

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

    # return list of names of all snapshots
    get_snapshots: (opts) =>
        opts = defaults opts,
            filter : undefined
            cb     : required
        options = {maxResults:500}   # deal with pagers next year
        options.filter = opts.filter if opts.filter?
        dbg = @dbg("get_snapshots")
        dbg("options=#{misc.to_json(options)}")
        @_gce.getSnapshots options, (err, snapshots) =>
            dbg("done")
            if err
                opts.cb(err)
            else
                s = []
                for x in snapshots
                    i = x.metadata.sourceDisk.indexOf('/zones/')
                    s.push
                        name      : x.name
                        timestamp : new Date(x.metadata.creationTimestamp)
                        size_GB   : x.metadata.storageBytes / 1000 / 1000 / 1000
                        source    : x.metadata.sourceDisk.slice(i+7)
                opts.cb(undefined, s)

    get_vms: (opts) =>
        opts = defaults opts,
            cb  : required
        dbg = @dbg("get_vms")
        dbg('starting...')
        @_gce.getVMs (err, vms) =>
            dbg('done')
            if err
                opts.cb(err)
            else
                for x in vms
                    if x.zone?
                        delete x.zone
                opts.cb(undefined, vms)

    # Get all outstanding global not-completed operations
    get_operations: (opts) =>
        opts = defaults opts,
            cb  : required
        @dbg("get_operations")()
        @_gce.getOperations {filter:"status ne DONE", maxResults:500}, (err, operations) => opts.cb(err, operations)

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

