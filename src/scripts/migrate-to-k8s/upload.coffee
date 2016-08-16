child_process = require('child_process')
async = require('async')
start = new Date()

log = (m...) ->
    console.log("#{(new Date() - start)/1000}:",  m...)

run = (s, cb) ->
    log("running '#{s}'")
    child_process.exec s, (err, stdout, stderr) ->
        #log("output of '#{s}' -- ", stdout, stderr)
        cb?(err, stdout + stderr)

###
Shard version
###
shards = '0123456789abcdef'
shards = (shards[i] for i in [0...shards.length])

limit = undefined
f = (shard, cb) ->
    run("mkdir -p out; time ./upload_project.py #{limit} #{shard} >> out/#{shard}", cb)

exports.run_sharded = (_limit) ->
    start = new Date()
    limit = _limit
    async.map shards, f, (err) ->
        log("DONE!")
        log("err=",err)


###
Non-shard version
###

exports.run = (limit=10, nthreads=1) ->
    rethinkdb = require('rethinkdb')
    conn      = x = undefined
    start = new Date()
    async.series([
        (cb) ->
            authKey   = fs.readFileSync( '/home/salvus/secrets/rethinkdb/rethinkdb').toString().trim()
            rethinkdb.connect {authKey:authKey, host:"db0", timeout:15}, (err, _conn) ->
                conn = _conn; cb(err)
        (cb) ->
            query = rethinkdb.db('smc').table('projects').filter(~rethinkdb.row.hasFields('last_backup_to_gcloud').not())
            query = query.pluck(['project_id', 'storage']).limit(limit)
            query.run conn, (err, _x) ->
                x = _x; cb(err)
        (cb) ->
            x.toArray (err, _x) ->
                x = _x; cb(err)
        (cb) ->
            log("x = ", x)
            f = (z, cb) ->
                log("z=", z)
                run("./upload_project.py #{z.project_id} >> log", cb)
            async.mapLimit(x, nthreads, f, cb)
    ], (err) ->
        log("DONE! -- time per = ", (new Date() - start)/limit/1000, " seconds")
        log('err=',err) if err
    )





