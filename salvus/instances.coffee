winston     = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

async = require('async')

misc = require('misc')
{defaults, required} = misc
misc_node = require('misc_node')

PROJECT = process.env.SMC_PROJECT ? 'sage-math-inc'


exports.gcloud = gcloud = (opts) ->
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

exports.gcloud_instances = gcloud_instances = (opts) ->
    opts = defaults opts,
        cb  : required
    d = new Date()
    gcloud
        args : ['instances', 'list', '--format=json']
        cb   : (err, output) ->
            if err
                opts.cb(err)
            else
                opts.cb(undefined, JSON.parse(output.stdout))

exports.update_db = (opts={}) ->
    opts = defaults opts,
        db : required
        cb : undefined
    db_data  = {}
    gce_data = {}
    now = new Date()
    table = opts.db.table('instances')
    async.series([
        (cb) ->
            async.parallel([
                (cb) ->
                    winston.debug("get info from Google Compute engine api about all instances")
                    gcloud_instances
                        cb : (err, data) ->
                            if err
                                cb(err)
                            else
                                for x in data
                                    gce_data[x.name] = x
                                winston.debug("got gce api data about #{misc.len(gce_data)} instances")
                                cb()
                (cb) ->
                    winston.debug("get info from our database about all instances")
                    table.pluck('name', 'gce_sha1').run (err, data) ->
                        if err
                            cb(err)
                        else
                            for x in data
                                db_data[x.name] = x.gce_sha1
                            winston.debug("got database data about #{misc.len(db_data)} instances")
                            cb()
            ], cb)
        (cb) ->
            objects = []
            for name, x of gce_data
                new_sha1 = JSON.stringify(x)
                sha1 = db_data[name]
                if new_sha1 != sha1
                    x.timestamp = now
                    objects.push(name:name, gce:x, gce_sha1:new_sha1)
            if objects.length == 0
                winston.debug("nothing changed")
                cb()
            else
                winston.debug("#{objects.length} instances changes")
                table.insert(objects, conflict:'update').run(cb)
    ], (err) ->
        opts.cb?(err)
    )



