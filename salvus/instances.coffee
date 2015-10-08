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

exports.manager = (opts) -> new InstanceManager(opts)

# how long ago a time was, in hours
age_h = (time) -> (new Date() - time)/(3600*1000)
age_s = (time) -> (new Date() - time)/1000

class InstanceManager
    constructor: (opts) ->
        opts = defaults opts,
            db : required
        @db = opts.db

    gcloud: (opts) =>
        opts = defaults opts,
            timeout : 30
            args    : required
            cb      : required

        misc_node.execute_code
            command : 'gcloud'
            args    : ['compute', '--project', PROJECT].concat(opts.args)
            timeout : opts.timeout
            verbose : false
            cb      : opts.cb

    gcloud_instances: (opts) =>
        opts = defaults opts,
            cb  : required
        d = new Date()
        @gcloud
            args : ['instances', 'list', '--format=json']
            cb   : (err, output) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, JSON.parse(output.stdout))

    update_db: (opts={}) =>
        opts = defaults opts,
            cb : undefined
        db_data  = {}
        gce_data = {}
        table = @db.table('instances')
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        winston.debug("get info from Google Compute engine api about all instances")
                        @gcloud_instances
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

