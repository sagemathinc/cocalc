###

g = require('./smc_gcloud.coffee').gcloud(db:require('rethink').rethinkdb(hosts:'db0', pool:1))

Rewrite this to use the official node.js driver, which is pretty good now, and seems an order
of magnitude faster than using the gcloud command line!

https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.25.1/compute/
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

misc = require('smc-util/misc')
{defaults, required} = misc

filename = (path) -> misc.path_split(path).tail

misc_node = require('smc-util-node/misc_node')

PROJECT = process.env.SMC_PROJECT ? 'sage-math-inc'
DEFAULT_ZONE = 'us-central1-c'

exports.gcloud = (opts) ->
    new GoogleCloud(opts)

# how long ago a time was, in hours
age_h = (time) -> (new Date() - time)/(3600*1000)
age_s = (time) -> (new Date() - time)/1000

onCompleteOpts =
    maxAttempts : 1200  # 3s * 1200 = 3600s = 1h

handle_operation = (err, operation, done, cb) ->
    if err
        done()
        cb?(err)
    else
        operation.onComplete onCompleteOpts, (err, metadata) ->
            done()
            #console.log("onComplete #{misc.to_json(err)}, #{misc.to_json(metadata)}")
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

    show: =>
        @get_metadata(cb:console.log)

    _action: (cmd, cb) =>
        dbg = @dbg(cmd)
        dbg('calling api...')
        start = misc.walltime()
        @_vm[cmd] (err, operation, apiResponse) ->
            handle_operation(err, operation, (->dbg("done -- took #{misc.walltime(start)}s")), cb)

    stop: (opts={}) =>
        @_action('stop', opts.cb)

    start: (opts={}) =>
        @_action('start', opts.cb)

    reset: (opts={}) =>
        @_action('reset', opts.cb)

    delete: (opts={}) =>
        opts = defaults opts,
            keep_disks : undefined
            cb         : undefined
        if opts.keep_disks
            # this option doesn't seem supported by the Node.js API so we have to use the command line!
            misc_node.execute_code
                command : 'gcloud'
                timeout : 3600
                args    : ['--quiet', 'compute', 'instances', 'delete', '--keep-disks', 'all', '--zone', @zone, @name]
                cb      : (err) => opts.cb?(err)
        else
            @_action('delete', opts.cb)

    get_metadata: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("metadata")
        dbg("starting")
        @_vm.getMetadata (err, metadata, apiResponse) =>
            dbg("done")
            opts.cb(err, metadata)

    disks: (opts) =>
        opts = defaults opts,
            cb : required
        @get_metadata
            cb : (err, data) =>
                if err
                    opts.cb(err)
                else
                    disks = (@gcloud.disk(zone:@zone, name:filename(x.source)) for x in data.disks)
                    opts.cb(undefined, disks)

    status: (opts) =>
        opts = defaults opts,
            cb : required
        @get_metadata
            cb : (err, x) =>
                opts.cb(err, x?.status)

    # create disk and attach to this instance
    create_disk: (opts) =>
        opts = defaults opts,
            name     : required
            size_GB  : undefined
            type     : 'pd-standard'   # 'pd-standard' or 'pd-ssd'
            snapshot : undefined # if given, base on snapshot
            cb       : undefined
        dbg = @dbg("create_disk(#{misc.to_json(misc.copy_without(opts, ['cb']))})")
        async.series([
            (cb) =>
                dbg("creating disk...")
                @gcloud.create_disk
                    name     : opts.name
                    size_GB  : opts.size_GB
                    type     : opts.type
                    snapshot : opts.snapshot
                    zone     : @zone
                    cb       : cb
            (cb) =>
                dbg("attaching to this instance")
                @gcloud.disk(name:opts.name, zone:@zone).attach_to
                    vm : @
                    cb : cb
        ], (err) => opts.cb?(err))

    attach_disk: (opts) =>
        opts = defaults opts,
            disk      : required
            read_only : false
            cb        : undefined
        dbg = @dbg("attach_disk")
        if not (opts.disk instanceof Disk)
            dbg("not Disk")
            if typeof(opts.disk) == 'string'
                dbg("is string so make disk")
                opts.disk = @gcloud.disk(name:opts.disk, zone:@zone)
            else
                opts.cb?("disk must be an instance of Disk")
                return
        dbg("starting...")
        options =
            readOnly   : opts.read_only
            deviceName : opts.disk.name   # critical to specify -- gcloud api default is BROKEN
        @_vm.attachDisk opts.disk._disk, options, (err, operation, apiResponse) =>
            handle_operation(err, operation, (->dbg("done")), opts.cb)

    detach_disk: (opts) =>
        opts = defaults opts,
            disk : required
            cb   : undefined
        dbg = @dbg("detach_disk")
        if not (opts.disk instanceof Disk)
            dbg("not Disk")
            if typeof(opts.disk) == 'string'
                dbg("is string so make disk")
                opts.disk = @gcloud.disk(name:opts.disk, zone:@zone)
            else
                opts.cb?("disk must be an instance of Disk")
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
                dbg("doing the detachDisk operation")
                @_vm.detachDisk disk, (err, operation, apiResponse) =>
                    handle_operation(err, operation, (->dbg("done")), cb)
        ], (err) => opts.cb?(err))

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
                    n = output.length
                    if n > 15000
                        output = output.slice(n - 15000)
                    console.log(output)

    # DIFFICULT change configuration of this VM
    # WARNING: this may be a possibly dangerous multi-step process that
    # could involve deleting and recreating the VM.
    ###
    1. [x] Determine if any changes need to be made.
    2. [x] Get configuration of machine so know how to recreate it; including if machine is on.
    3. [x] If so, ensure machine is off.
    4. [x] Delete machine (not deleting any attached disks)
    5. [ ] Move disks to new zone if zone changed
    6. [x] Create machine with new params, disks, starting if it was running initially (but not otherwise).
    ###
    change: (opts) =>
        opts = defaults opts,
            preemptible  : undefined    # whether or not VM is preemptible
            type         : undefined    # the VM machine type
            zone         : undefined    # which zone VM is located in
            storage      : undefined    # string; set to 'read_write' to provide access to google cloud storage; '' for no access
            boot_size_GB : undefined    # size in GB of boot disk
            start        : undefined    # leave machine started after change, even if it was off
            cb           : undefined
        dbg = @dbg("change(#{misc.to_json(misc.map_without_undefined(misc.copy_with(opts, ['cb'])))})")
        dbg()
        data = undefined
        changes = {}
        no_change = false
        external = undefined
        async.series([
            (cb) =>
                dbg('get vm metadata to see what needs to be changed')
                @get_metadata
                    cb : (err, x) =>
                        data = x; cb(err)
            (cb) =>
                external = data.networkInterfaces?[0]?.accessConfigs?[0]?.natIP
                if not external?
                    cb()
                else
                    dbg('get all static external ip addresses')
                    @gcloud.get_external_static_addresses
                        cb : (err, v) =>
                            if err
                                cb(err)
                            else
                                # is external address of a reserved static interface?
                                is_reserved = false
                                for x in v
                                    if x.metadata?.address == external
                                        # yes
                                        is_reserved = true
                                        break
                                if not is_reserved
                                    external = undefined
                                cb()
            (cb) =>
                if opts.preemptible? and data.scheduling.preemptible != opts.preemptible
                    changes.preemptible = opts.preemptible
                if opts.type? and filename(data.machineType) != opts.type
                    changes.type = opts.type
                if opts.zone? and filename(data.zone) != opts.zone
                    changes.zone = opts.zone
                if opts.storage? and @_storage(data) != opts.storage
                    changes.storage = opts.storage
                if not opts.boot_size_GB?
                    cb(); return
                boot_disk = undefined
                for x in data.disks
                    if x.boot
                        boot_disk = @gcloud.disk(name: filename(x.source))
                        break
                if not boot_disk?
                    cb(); return  # is this possible
                boot_disk.get_size_GB
                    cb : (err, size_GB) =>
                        if err
                            cb(err)
                        else
                            if size_GB != opts.boot_size_GB
                                changes.size_GB = opts.boot_size_GB
                            cb()
            (cb) =>
                dbg("determined changes=#{misc.to_json(changes)}")
                no_change = misc.len(changes) == 0
                if no_change
                    cb(); return
                dbg("data.status = '#{data.status}'")
                if data.status != 'TERMINATED'
                    dbg("Ensure machine is off.")
                    @stop(cb:cb)
                else
                    cb()
            (cb) =>
                if no_change
                    cb(); return
                dbg("delete machine (not deleting any attached disks)")
                @delete
                    keep_disks : true
                    cb         : cb
            (cb) =>
                if no_change
                    cb(); return
                if not changes.zone
                    cb(); return
                dbg("move disks to new zone")
                f = (disk, cb) =>
                    dbg("moving disk '#{disk}'")
                    d = @gcloud.disk(name:disk, zone:@zone)
                    async.series([
                        (cb) =>
                            d.copy
                                zone : changes.zone
                                cb   : cb
                        (cb) =>
                            d.delete
                                cb : cb
                    ], cb)
                async.map((filename(x.source) for x in data.disks), f, cb)
            (cb) =>
                if no_change
                    cb(); return
                dbg("Create machine with new params, disks, starting if it was running initially (but not otherwise).")
                @gcloud.create_vm
                    name        : @name
                    zone        : changes.zone ? @zone
                    disks       : (filename(x.source) for x in data.disks)
                    type        : changes.type ? filename(data.machineType)
                    tags        : data.tags.items
                    preemptible : changes.preemptible ? data.scheduling.preemptible
                    storage     : changes.storage ? @_storage(data)
                    external    : external
                    cb          : cb
            (cb) =>
                if no_change or data.status == 'RUNNING' or opts.start
                    cb(); return
                dbg("Stop machine")
                @stop(cb:cb)
        ], (err) =>
            opts.cb?(err)
        )

    # If data sets storage access, then this returns a string, e.g., 'read_write' if the
    # metadata indicates that google cloud storage is enabled in some way.  Otherwise, this
    # returns undefined.
    _storage: (data) =>
        {parse} = require('path')
        for x in data.serviceAccounts ? []
            for s in x.scopes
                p = parse(s)
                if p.name == 'devstorage'
                    return p.ext.slice(1)
        return undefined  # not currently set

    # Keep this instance running by checking on its status every interval_s seconds, and
    # if the status is TERMINATED, issue a start command.  The only way to stop this check
    # is to exit this process.
    keep_running: (opts={}) =>
        opts = defaults opts,
            interval_s : 30
        dbg = @dbg("keep_running(name='#{@name}', interval_s=#{opts.interval_s})")
        dbg()
        check = () =>
            dbg('check')
            @status
                cb: (err, status) =>
                    if status == 'TERMINATED'
                        dbg("attempting to start since status is TERMINATED")
                        @start
                            cb : (err) =>
                                dbg("result of start -- #{err}")
        setInterval(check, opts.interval_s*1000)

class Disk
    constructor: (@gcloud, @name, @zone=DEFAULT_ZONE) ->
        @_disk = @gcloud._gce.zone(@zone).disk(@name)

    dbg: (f) -> @gcloud.dbg("disk.#{f}")

    show: =>
        @get_metadata(cb:console.log)

    copy: (opts) =>
        opts = defaults opts,
            name      : @name
            zone      : @zone      # zone of target disk
            size_GB   : undefined  # if specified must be at least as large as existing disk
            type      : undefined  # 'pd-standard' or 'pd-ssd'; if not given same as current
            cb        : required
        dbg = @dbg("copy(name=#{misc.to_json(misc.copy_without(opts, ['cb']))})")
        dbg()
        if @name == opts.name and @zone == opts.zone
            dbg("nothing to do")
            opts.cb()
            return
        @_utility
            name    : opts.name
            size_GB : opts.size_GB
            type    : opts.type
            zone    : opts.zone
            delete  : false
            cb      : opts.cb

    # Change size or type of a disk.
    # Disk maybe attached to an instance.
    change: (opts) =>
        opts = defaults opts,
            size_GB   : undefined  # if specified must be at least as large as existing disk
            type      : undefined  # 'pd-standard' or 'pd-ssd'; if not given same as current
            zone      : undefined
            cb        : required
        dbg = @dbg("reconfigure(name=#{misc.to_json(misc.copy_without(opts, ['cb']))})")
        dbg()
        if not opts.size_GB? and not opts.type? and not opts.zone?
            dbg("nothing to do")
            opts.cb()
            return
        @_utility
            size_GB : opts.size_GB
            type    : opts.type
            zone    : opts.zone
            delete  : true
            cb      : opts.cb

    _utility: (opts) =>
        opts = defaults opts,
            name      : @name
            size_GB   : undefined  # if specified must be at least as large as existing disk
            type      : undefined  # 'pd-standard' or 'pd-ssd'; if not given same as current
            zone      : @zone      # zone of this disk
            delete    : false      # if true: deletes original disk after making snapshot successfully; also remounts if zone same
            cb        : undefined
        dbg = @dbg("_utility(name=#{misc.to_json(misc.copy_without(opts, ['cb']))})")
        dbg()
        vms = undefined  # vms that disk was attached to (if any)
        snapshot_name = undefined
        async.series([
            (cb) =>
                if not opts.size_GB?
                    cb()
                else
                    dbg("size consistency check")
                    if opts.size_GB < 10
                        cb("size_GB must be at least 10")
                        return
                    @get_size_GB
                        cb : (err, size_GB) =>
                            if err
                                cb(err)
                            else
                                if opts.size_GB < size_GB
                                    cb("Requested disk size cannot be smaller than the current size")
                                else
                                    cb()
            (cb) =>
                dbg("determine new disk type")
                if opts.type
                    cb()
                else
                    @get_type
                        cb : (err, type) =>
                            opts.type = type
                            cb(err)
            (cb) =>
                snapshot_name = "temp-#{@name}-#{misc.uuid()}"
                dbg("create snapshot with name #{snapshot_name}")
                @snapshot
                    name : snapshot_name
                    cb   : cb
            (cb) =>
                if not opts.delete
                    cb(); return
                dbg("detach disk from any vms")
                @detach
                    cb : (err, x) =>
                        vms = x
                        cb(err)
            (cb) =>
                if not opts.delete
                    cb(); return
                dbg("delete disk")
                @delete(cb : cb)
            (cb) =>
                dbg("make new disk from snapshot")
                @gcloud.snapshot(name:snapshot_name).create_disk
                    name    : opts.name
                    size_GB : opts.size_GB
                    type    : opts.type
                    zone    : opts.zone
                    cb      : cb
            (cb) =>
                if not vms? or vms.length == 0
                    cb(); return
                if opts.zone? and @zone != opts.zone # moved zones
                    cb(); return
                dbg("remount new disk on same vms")
                f = (vm, cb) =>
                    vm.attach_disk
                        disk      : opts.name
                        read_only : vms.length > 1  # if more than 1 must be read only  (kind of lame)
                        cb        : cb
                async.map(vms, f, cb)
            (cb) =>
                if not snapshot_name?
                    cb(); return
                dbg("clean up snapshot #{snapshot_name}")
                @gcloud.snapshot(name:snapshot_name).delete(cb : cb)
        ], (err) =>
            opts.cb?(err)
        )


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

    get_size_GB: (opts) =>
        opts = defaults opts,
            cb : required
        @get_metadata
            cb : (err, data) =>
                opts.cb(err, if data? then parseInt(data.sizeGb))

    get_type: (opts) =>
        opts = defaults opts,
            cb : required
        @get_metadata
            cb : (err, data) =>
                opts.cb(err, if data? then filename(data.type))

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
            keep_disks : undefined
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
            if typeof(opts.vm) == 'string'
                opts.vm = @gcloud.vm(name:opts.vm, zone:@zone)
            else
                opts.cb("vm must be an instance of VM")
                return
        opts.vm.attach_disk
            disk      : @
            read_only : opts.read_only
            cb        : opts.cb

    detach: (opts) =>
        opts = defaults opts,
            vm : undefined   # if not given, detach from all users of this disk
            cb : undefined   # (err, list_of_vms_that_we_detached_disk_from)
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
                                vms = (@gcloud.vm(name:filename(u), zone:@zone) for u in (data.users ? []))
                                cb()
            (cb) =>
                dbg('actually detach disk from that vm')
                f = (vm, cb) =>
                    vm.detach_disk
                        disk : @
                        cb   : cb
                async.map(vms, f, cb)

            ], (err) => opts.cb?(err, vms))

class Snapshot
    constructor: (@gcloud, @name) ->
        @_snapshot = @gcloud._gce.snapshot(@name)

    show: =>
        @get_metadata(cb:console.log)

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
        dbg = @dbg("create_disk(#{misc.to_json(misc.copy_without(opts, ['cb']))})")
        if opts.size_GB? and opts.size_GB < 10
            opts.cb?("size_GB must be at least 10")
            return
        opts.snapshot = @name
        @gcloud.create_disk(opts)

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

    get_external_static_addresses: (opts) =>
        opts = defaults opts,
            cb : required
        @_gce.getAddresses(opts.cb)

    create_vm: (opts) =>
        opts = defaults opts,
            name        : required
            zone        : DEFAULT_ZONE
            disks       : undefined      # see disks[] at https://cloud.google.com/compute/docs/reference/latest/instances
                                         # can also pass in Disk objects in the array; or a single string which
                                         # will refer to the disk with that name in same zone.
            http        : undefined      # allow http
            https       : undefined      # allow https
            type        : undefined      # the instance type, e.g., 'n1-standard-1'
            os          : undefined      # see https://github.com/stephenplusplus/gce-images#accepted-os-names
            tags        : undefined      # array of strings
            preemptible : false
            storage     : undefined      # string: e.g., 'read_write' provides read/write access to Google cloud storage; '' for no access
            external    : true           # true for ephemeral external address; name for a specific named external address (which must already exist for now) or actual reserved ip
            cb          : required
        dbg = @dbg("create_vm(name=#{opts.name})")
        config = {}
        config.http        = opts.http  if opts.http?
        config.https       = opts.https if opts.https?
        config.machineType = opts.type  if opts.type?
        config.os          = opts.os    if opts.os?
        config.tags        = opts.tags  if opts.tags?
        config.networkInterfaces = [{network: 'global/networks/default', accessConfigs:[]}]

        if opts.external
            # WARNING: code below recursively calls create_vm in one case
            # Also grant external network access (ephemeral by default)
            net =
                name: "External NAT"
                type: "ONE_TO_ONE_NAT"
            if typeof(opts.external) == 'string'
                if opts.external.indexOf('.') != -1
                    # It's an ip address
                    net.natIP = opts.external
                else
                    # name of a network interface
                    @get_external_static_addresses
                        cb : (err, v) =>
                            if err
                                opts.cb(err)
                            else
                                for x in v
                                    if x.name == opts.external
                                        opts.external = x.metadata.address  # the ip address
                                        @create_vm(opts)
                                        return
                                opts.cb("unknown static external interface '#{opts.external}'")
                    return
            config.networkInterfaces[0].accessConfigs.push(net)

        if opts.storage? and opts.storage != ''
            if typeof(opts.storage) != 'string'
                opts.cb("opts.storage=#{opts.storage}, typeof=#{typeof(opts.storage)}, must be a string")
                return
            config.serviceAccounts = [{email:'default', scopes:[]}]
            config.serviceAccounts[0].scopes.push("https://www.googleapis.com/auth/devstorage.#{opts.storage}")

        if opts.preemptible
            config.scheduling = {preemptible : true}
        else
            config.scheduling =
                onHostMaintenance: "MIGRATE"
                automaticRestart: true

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

    create_disk: (opts) =>
        opts = defaults opts,
            name     : required
            size_GB  : undefined
            type     : 'pd-standard'   # 'pd-standard' or 'pd-ssd'
            zone     : DEFAULT_ZONE
            snapshot : undefined
            cb       : undefined
        dbg = @dbg("create_disk(#{misc.to_json(misc.copy_without(opts, ['cb']))})")
        if opts.size_GB? and opts.size_GB < 10
            opts.cb?("size_GB must be at least 10")
            return

        dbg("starting...")
        config = {}
        if opts.snapshot?
            config.sourceSnapshot = "global/snapshots/#{opts.snapshot}"
        config.sizeGb = opts.size_GB if opts.size_GB?
        config.type   = "zones/#{opts.zone}/diskTypes/#{opts.type}"
        @_gce.zone(opts.zone).createDisk opts.name, config, (err, disk, operation, apiResponse) =>
            handle_operation(err, operation, (->dbg('done')), (err) => opts.cb?(err))

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
            match  : undefined   # only return results whose name contains match
            cb     : required
        options = {maxResults:500}   # deal with pagers next year
        options.filter = opts.filter if opts.filter?
        dbg = @dbg("get_snapshots")
        dbg("options=#{misc.to_json(options)}")
        if opts.match?
            opts.match = opts.match.toLowerCase()
        @_gce.getSnapshots options, (err, snapshots) =>
            dbg("done")
            if err
                opts.cb(err)
            else
                s = []
                for x in snapshots
                    i = x.metadata.sourceDisk.indexOf('/zones/')
                    if opts.match? and x.name.toLowerCase().indexOf(opts.match) == -1
                        continue
                    s.push
                        name      : x.name
                        timestamp : new Date(x.metadata.creationTimestamp)
                        size_GB   : x.metadata.storageBytes / 1000 / 1000 / 1000
                        source    : x.metadata.sourceDisk.slice(i+7)
                opts.cb(undefined, s)

    # return list of names of all snapshots
    get_disks: (opts) =>
        opts = defaults opts,
            filter : undefined
            match  : undefined   # only return results whose name contains match
            cb     : required
        options = {maxResults:500}   # deal with pagers next year
        options.filter = opts.filter if opts.filter?
        dbg = @dbg("get_disks")
        dbg("options=#{misc.to_json(options)}")
        if opts.match?
            opts.match = opts.match.toLowerCase()
        @_gce.getDisks options, (err, disks) =>
            dbg("done")
            if err
                opts.cb(err)
            else
                s = []
                for x in disks
                    if opts.match? and x.name.toLowerCase().indexOf(opts.match) == -1
                        continue
                    size_GB = parseInt(x.metadata.sizeGb)
                    type = filename(x.metadata.type)
                    switch type
                        when 'pd-standard'
                            cost = size_GB * 0.04
                        when 'pd-ssd'
                            cost = size_GB * 0.17
                        else
                            cost = size_GB * 0.21
                    s.push
                        name       : x.name
                        zone       : x.zone.name
                        size_GB    : size_GB
                        type       : type
                        cost_month : cost
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
        @_gce.getOperations {filter:"status ne 'DONE'", maxResults:500}, (err, operations) => opts.cb(err, operations)

    _check_db: (cb) =>
        if not @db
            cb?("database not defined")
            return true

    vm_manager: (opts) =>
        opts = defaults opts,
            interval_s : 15        # queries gce api for full current state of vm's every interval_s seconds
            all_m      : 10        # run all rules on all vm's every this many minutes
            manage     : true
        if not @db?
            throw "database not defined!"
        opts.gcloud = @
        return new VM_Manager(opts)

class VM_Manager
    constructor: (opts) ->
        opts = defaults opts,
            gcloud     : required
            interval_s : required
            all_m      : required
            manage     : required
        @_manage = opts.manage
        @_action_timeout_m             = 15  # assume actions that took this long failed
        @_switch_back_to_preemptible_m = 120  # minutes until we try to switch something that should be pre-empt back
        @gcloud = opts.gcloud
        dbg = @_dbg("start(interval_s:#{opts.interval_s}, all_m:#{opts.all_m})")
        @_init_instances_table()
        if @_manage
            dbg('starting vm manager monitoring')
            @_init_timers(opts)
        return

    close: () =>
        @_dbg('close')()
        if @_update_interval?
            clearInterval(@_update_interval)
            delete @_update_interval
        if @_update_all?
            clearInterval(@_update_all)
            delete @_update_all
        if @_instances_table?
            @_instances_table.close()
            delete @_instances_table

    request: (opts) =>
        opts = defaults opts,
            name        : required
            status      : undefined   # 'RUNNING', 'TERMINATED'
            preemptible : undefined # true or false
            cb          : undefined
        obj = {}
        if opts.status?
            if opts.status not in ['TERMINATED', 'RUNNING']
                err = "status must be 'TERMINATED' or 'RUNNING'"
                winston.debug(err)
                opts.cb?(err)
                return
            obj.requested_status = opts.status
        if opts.preemptible?
            obj.requested_preemptible = !! opts.preemptible
        if misc.len(obj) == 0
            opts.cb()
        else
            @gcloud.db.table('instances').get(opts.name).update(obj).run(opts.cb)

    get_data: (name) =>
        obj = @_instances_table?.get(name)?.toJS()
        if obj?
            return @_data(obj)

    # WARNING: stupid non-indexed query below; make fast when log gets big...
    get_log: (opts) =>
        opts = defaults opts,
            name  : undefined
            age_m : undefined
            cb    : required
        db = @gcloud.db
        query = db.table('instance_actions_log')
        if opts.name?
            query = query.filter(name:opts.name)
        if opts.age_m?
            query = query.filter(db.r.row('action')('finished').ge(misc.minutes_ago(opts.age_m)))
        query.run(opts.cb)

    show_log: (opts) =>
        opts = defaults opts,
            name  : undefined
            age_m : undefined
            cb    : undefined
        @get_log
            name : opts.name
            age_m : opts.age_m
            cb    : (err, log) =>
                if err
                    console.log("ERROR: ", err)
                else
                    log.sort (x,y) => misc.cmp(x.action?.started ? new Date(), y.action?.started ? new Date())
                    pad = (s) -> misc.pad_left(s ? '', 10)
                    for x in log
                        console.log "#{pad(x.name)}  #{pad(x.action?.type)}  #{pad(x.action?.action)}  #{x.action?.started?.toLocaleString()}  #{x.action?.finished?.toLocaleString()}  #{pad(misc.round1((x.action?.finished - x.action?.started)/1000/60))} minutes  '#{misc.to_json(x.action?.error ?  '')}'"
                opts.cb?(err)

    _init_timers: (opts) =>
        @_dbg("_init_timers")()
        @_update_interval = setInterval(@_update_db,  opts.interval_s * 1000)
        @_udpate_all      = setInterval(@_update_all, opts.all_m * 1000 * 60)
        async.series([((cb)=>@_update_db(cb:cb)), @_update_all])
        return

    _dbg: (f) ->
        return (m) -> winston.debug("VM_Manager.#{f}: #{m}")

    _update_all: () =>
        dbg = @_dbg("update_all")
        dbg()
        @_instances_table?.get().map (vm, key) =>
            if vm.get('requested_status')
                @_apply_rules(vm.toJS())
        return

    _update_db: (opts) =>
        opts = defaults opts,
            cb : undefined
        dbg = @_dbg("update_db")
        dbg()
        db_data  = {}
        gce_data = {}
        table = @gcloud.db.table('instances')
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        dbg("get info from Google Compute engine api about all VMs")
                        @gcloud.get_vms
                            cb : (err, data) =>
                                if err
                                    cb(err)
                                else
                                    for x in data
                                        gce_data[x.name] = x
                                    dbg("got gce api data about #{data.length} VMs")
                                    cb()
                    (cb) =>
                        dbg("get info from our database about all VMs")
                        table.pluck('name', 'gce_sha1').run (err, data) =>
                            if err
                                cb(err)
                            else
                                for x in data
                                    db_data[x.name] = x.gce_sha1
                                dbg("got database data about #{misc.len(db_data)} VMs")
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
                    dbg("nothing changed")
                    cb()
                else
                    dbg("#{objects.length} vms changed")
                    global.objects = objects
                    table.insert(objects, conflict:'update').run(cb)
        ], (err) =>
            opts.cb?(err)
        )

    _init_instances_table: () =>
        dbg = @_dbg("_init_instances_table")
        dbg()
        @gcloud.db.synctable
            query : @gcloud.db.table('instances')
            cb    : (err, t) =>
                if err
                    # this shouldn't happen...
                    dbg("ERROR: #{err}")
                else
                    dbg("initialized instances synctable")
                    @_instances_table = t
                    if @_manage
                        t.on 'change', (name) =>
                            @_apply_rules(t.get(name).toJS())

    _is_in_progress: (vm) =>
        if not vm.action?
            return false
        if vm.action.finished?
            return false
        if vm.action.started? and not vm.action.finished? and vm.action.started <= misc.minutes_ago(@_action_timeout_m)
            return false
        # at this point finished is not set and started was set recently
        return true

    _data: (vm) =>
        data =
            name                  : vm.name
            gce_status            : vm.gce.metadata.status
            gce_preemptible       : vm.gce.metadata.scheduling.preemptible
            gce_created           : new Date(vm.gce.metadata.creationTimestamp)
            requested_status      : vm.requested_status
            requested_preemptible : vm.requested_preemptible
            last_action           : vm.action
        return data

    _apply_rules: (vm) =>
        if not vm.requested_status   # only manage vm's with desired status set
            return
        if @_is_in_progress(vm)
            return
        if not vm.gce?.metadata?.scheduling?
            # nothing to be done
            return
        dbg = @_dbg("_apply_rules")

        data = @_data(vm)
        dbg(misc.to_json(data))

        if @_rule1(data)
            return
        if @_rule2(data)
            return
        if @_rule3(data)
            return

    _rule1: (data) =>
        if data.gce_status == 'TERMINATED' and data.requested_status == 'RUNNING'
            dbg = @_dbg("rule1('#{data.name}')")
            dbg("terminated VM should be running")
            if data.gce_preemptible and data.last_action?.started >= misc.minutes_ago(5) and data.last_action?.action == 'start'
                dbg("Pre-emptible right now and there was an attempt to start it recently, so switch to non-pre-empt.")
                @_action(data, 'non-preemptible', 'rule1')
            else
                # Just start the VM
                @_action(data, 'start', 'rule1')
            return true

    _rule2: (data) =>
        if data.gce_status == 'RUNNING' and data.requested_status == 'TERMINATED'
            dbg = @_dbg("rule2('#{data.name}')")
            dbg("running VM should be stopped")
            @_action(data, 'stop', 'rule2')
            return true

    _rule3: (data) =>
        if data.gce_status == 'RUNNING' and data.requested_status == 'RUNNING' and \
                  data.requested_preemptible and not data.gce_preemptible and data.gce_created <= misc.minutes_ago(@_switch_back_to_preemptible_m)
            dbg = @_dbg("rule3('#{data.name}')")
            dbg("switch running instance from non-pre-empt to preempt")
            @_action(data, 'preemptible', 'rule3')
            return true

    _action: (data, action, type, cb) =>
        db = @gcloud.db
        query = db.table('instances').get(data.name)
        dbg = @_dbg("_action(action='#{action}',host='#{data.name}')")
        dbg(misc.to_json(data))
        action_obj =
            action  : action
            started : new Date()
            type    : type
        log =
            id     : misc.uuid()
            name   : data.name
            action : action_obj
        async.series([
            (cb) =>
                dbg('set fact that action started in the database')
                query.update(action:db.r.literal(action_obj)).run(cb)
            (cb) =>
                dbg("set log entry to #{misc.to_json(log)}")
                db.table('instance_actions_log').insert(log).run(cb)
            (cb) =>
                vm = @gcloud.vm(name:data.name)
                start = data.requested_status == 'RUNNING'
                switch action
                    when 'start', 'stop'
                        vm[action](cb:cb)
                    when 'preemptible'
                        vm.change(preemptible:true, start:start, cb:cb)
                    when 'non-preemptible'
                        vm.change(preemptible:false, start:start, cb:cb)
                    else
                        cb("invalid action '#{action}'")
            (cb) =>
                dbg("update db view of GCE machine state, so we don't try to do action again right after finishing")
                @_update_db(cb:cb)
        ], (err) =>
            change = {finished:new Date()}
            if err
                change.error = err
            db.table('instances').get(data.name).update(action:change).run(cb)
            # update entry in the log
            db.table('instance_actions_log').get(log.id).update(action : misc.merge(action_obj, change)).run (err) =>
                if err
                    dbg("ERROR inserting log -- #{err}")
        )

###
One off code
###
exports.copy_projects_disks = (v) ->
    g = exports.gcloud()
    f = (n, cb) ->
        async.parallel([
            (cb) ->
                d = g.disk(name:"projects#{n}-base")
                d.copy(name:"storage#{n}",cb:cb)
            (cb) ->
                d = g.disk(name:"projects#{n}")
                d.copy(name:"storage#{n}-projects",cb:cb)
            (cb) ->
                d = g.disk(name:"projects#{n}-bup")
                d.copy(name:"storage#{n}-bups", size_GB:200, cb:cb)
        ], (err) ->
            if not err
                g.create_vm(name:"storage#{n}", disks:["storage#{n}", "storage#{n}-projects", "storage#{n}-bups"], tags:['storage','http'], preemptible:false, storage:'read_write', cb:cb)
            else
                cb(err)
        )

    async.map v, f, (err)->
        console.log("TOTOTALY DONE! -- #{err}")

