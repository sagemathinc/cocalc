###
Manage storage

###

async       = require('async')
winston     = require('winston')

misc_node   = require('smc-util-node/misc_node')

misc        = require('smc-util/misc')
{defaults, required} = misc

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

# A one-off function in compute-client.coffee that queries for some projects
# in the database that don't have storage set, and assigns them a given host,
# then copies their data to that host.

exports.migrate_projects = (opts) ->
    opts = defaults opts,
        db    : required
        lower : required
        upper : required
        host  : 'projects0'
        all   : false
        limit : undefined
        cb    : required
    dbg = (m) -> winston.debug("migrate_projects: #{m}")
    projects = undefined
    async.series([
        (cb) ->
            dbg("query database for projects with id between #{opts.lower} and #{opts.upper}")
            query = opts.db.table('projects').between(opts.lower, opts.upper)
            if not opts.all
                query = query.filter({storage:true}, {default:true})
            query = query.pluck('project_id')
            if opts.limit?
                query = query.limit(opts.limit)
            query.run (err, x) ->
                projects = x; cb(err)
        (cb) ->
            n = 0
            migrate_project = (project, cb) ->
                {project_id} = project
                dbg("#{n}/#{projects.length-1}: do rsync for #{project_id}")
                src = "/projects/#{project_id}/"
                n += 1
                if not fs.existsSync(src)
                    dbg('skipping #{src} since source not available')
                    cb()
                    return
                cmd = "sudo rsync -axH #{src}    /#{opts.host}/#{project_id}/"
                dbg(cmd)
                misc_node.execute_code
                    command     : cmd
                    timeout     : 3600
                    verbose     : true
                    err_on_exit : true
                    cb          : (err) ->
                        if err
                            cb(err)
                        else
                            dbg("it worked, set storage entry in database")
                            opts.db.table('projects').get(project_id).update(storage:{"#{opts.host}":new Date()}).run(cb)

            async.mapSeries(projects, migrate_project, cb)
    ], (err) ->
        opts.cb?(err)
    )




