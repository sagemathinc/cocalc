###
Rewrite this to use the official node.js driver, which is pretty good now, and seems an order
of magnitude faster than using the gcloud command line!

https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.23.0/compute/snapshot
https://github.com/GoogleCloudPlatform/gcloud-node

npm install --save gcloud
gcloud = require('gcloud')(projectId: 'sage-math-inc')
gce=gcloud.compute()
snapshot = gce.snapshot('test')
snapshot.getMetadata((err, metadata, apiResponse) -> console.log(err, metadata, apiResponse))
zone = gce.zone('us-central1-c')
vm = zone.vm('test')
vm.getMetadata((err, metadata, apiResponse) -> console.log(err, metadata, apiResponse))
vm.stop((err, op, apiResponse) -> console.log(err, op, apiResponse);global.op=op)
op.onComplete(->console.log("DONE"))
###



###
For now the only rules we care about are:

1. If an instance is TERMINATED, but the desired state is RUNNING and preempt is true, then:
     if it was TERMINATED within 5 minutes create it as non-preempt and start it
     if it was TERMINATED > 5 minutes ago create it as preempt and start it.

2. If an instance has been RUNNING for 12 hours and is not preempt, but the desired state
   is RUNNING and preempt is true, then:
     stop the instance and recreate and start it as prempt.

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

json_output_cb = (cb) ->
    (err, output) ->
        if not err
            cb(undefined, misc.from_json(output.stdout))
        else
            cb(err)

class Instance
    constructor: (@gcloud, @name, @zone=DEFAULT_ZONE) ->

    dbg: (f) -> @gcloud("instance.#{f}")

    _command : (opts) =>
        opts = defaults opts,
            category : 'instances'
            action   : required   # 'start', 'stop', 'reset', etc.
            args     : []
            cb       : undefined
        @gcloud._command(misc.merge(opts, {name:@name, zone:@zone}))

    stop : (opts={}) =>
        @_command(misc.merge(opts, {action:'stop'}))

    start: (opts={}) =>
        @_command(misc.merge(opts, {action:'start'}))

    reset: (opts={}) =>
        @_command(misc.merge(opts, {action:'reset'}))

    describe: (opts) =>
        opts.cb = json_output_cb(opts.cb)
        @_command(misc.merge(opts, {action:'describe', args:['--format', 'json']}))

class Disk
    constructor: (@gcloud, @name, @zone=DEFAULT_ZONE) ->

    dbg: (f) -> @gcloud("disk.#{f}")

    _command : (opts) =>
        opts = defaults opts,
            category : 'disks'
            action   : required
            args     : []
            cb       : undefined
        @gcloud._command(misc.merge(opts, {name:@name, zone:@zone}))

    snapshot : (opts) =>
        opts = defaults opts,
            name : required
            cb   : undefined
        @_command
            action : 'snapshot'
            args   : ['--snapshot-names', opts.name]

class Snapshot
    constructor: (@gcloud, @name) ->

    dbg: (f) -> @gcloud("snapshot.#{f}")

    describe: (opts) =>
        opts = defaults opts,
            cb : required
        @gcloud._gcloud
            args : ['snapshots', 'describe', @name, '--format', json]
            cb   : json_output_cb(opts.cb)


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

    _gcloud: (opts) =>
        opts = defaults opts,
            timeout : 180
            args    : required
            verbose : @_debug
            cb      : undefined

        dbg = @dbg("gcloud")
        dbg("args=#{misc.to_json(opts.args)}")
        start = misc.walltime()
        misc_node.execute_code
            command : 'gcloud'
            args    : ['compute', '--project', PROJECT].concat(opts.args)
            timeout : opts.timeout
            verbose : opts.verbose
            cb      : (err, output) =>
                elapsed = misc.walltime(start)
                dbg("elapsed time: #{elapsed}s")
                if err
                    dbg("fail: #{err}")
                else
                    dbg("success")
                opts.cb?(err, output)

    _command: (opts) =>
        opts = defaults opts,
            category : required   # 'instances', 'disks', etc.
            action   : required   # 'start', 'stop', 'reset', etc.
            name     : required
            zone     : DEFAULT_ZONE
            args     : []
            cb       : undefined
        dbg = @dbg("_action(category=#{opts.category}, action=#{opts.action},name=#{opts.name},args=#{misc.to_json(opts.args)})")
        dbg()
        @_gcloud
            args : [opts.category, opts.action, opts.name, '--zone', opts.zone].concat(opts.args)
            cb   : opts.cb

    instance: (opts) =>
        opts = defaults opts,
            name : required
            zone : DEFAULT_ZONE
        key = "#{opts.name}-#{opts.zone}"
        # create cache if not already created
        @_instance_cache ?= {}
        # set value for key if not already set; return it
        return (@_instance_cache[key] ?= new Instance(@, opts.name, opts.zone))

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

    get_instances: (opts) =>
        opts = defaults opts,
            cb  : required
        d = new Date()
        @_gcloud
            args    : ['instances', 'list', '--format=json']
            verbose : @_debug
            cb      : (err, output) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, JSON.parse(output.stdout))

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
                        winston.debug("get info from Google Compute engine api about all instances")
                        @get_instances
                            cb : (err, data) =>
                                if err
                                    cb(err)
                                else
                                    for x in data
                                        gce_data[x.name] = x
                                    winston.debug("got gce api data about #{misc.len(gce_data)} instances")
                                    cb()
                    (cb) =>
                        winston.debug("get info from our database about all instances")
                        table.pluck('name', 'gce_sha1').run (err, data) =>
                            if err
                                cb(err)
                            else
                                for x in data
                                    db_data[x.name] = x.gce_sha1
                                winston.debug("got database data about #{misc.len(db_data)} instances")
                                cb()
                ], cb)
            (cb) =>
                objects = []
                for name, x of gce_data
                    new_sha1 = JSON.stringify(x)
                    sha1 = db_data[name]
                    if new_sha1 != sha1
                        objects.push(name:name, gce:x, gce_sha1:new_sha1)
                if objects.length == 0
                    winston.debug("nothing changed")
                    cb()
                else
                    winston.debug("#{objects.length} instances changes")
                    table.insert(objects, conflict:'update').run(cb)
        ], (err) =>
            opts.cb?(err)
        )

    watch_instances: (opts) =>
        opts = defaults opts,
            cb : required
        return if @_check_db(opts.cb)
        query = @db.table('instances')
        query.run (err, instances) =>
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
                        delete instances[change.old_val.name]
                    if change.new_val?
                        instances[change.new_val.name] = change.new_val
                    @_rule1(new_val, old_val)
                    @_rule2(new_val, old_val)

    _rule1: (new_val, old_val) =>
        if new_val.gce?.STATUS == 'TERMINATED' and new_val.desired_status == 'RUNNING'
            winston.debug("rule1: start terminated instance")

    _rule2: (new_val, old_val) =>
        if new_val.gce?.STATUS == 'RUNNING' and new_val.desired_status == 'RUNNING' \
                 and new_val.preempt and age_h(new_val.started) >= 12
            winston.debug("rule2: switch instance back to preempt")

