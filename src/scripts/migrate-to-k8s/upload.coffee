child_process = require('child_process')
async = require('async')

log = (m...) ->
    console.log("#{(new Date()).toISOString()}:",  m...)

run = (s, cb) ->
    log("running '#{s}'")
    child_process.exec s, (err, stdout, stderr) ->
        #log("output of '#{s}' -- ", stdout, stderr)
        cb?(err, stdout + stderr)

shards = '0123456789abcdef'
shards = (shards[i] for i in [0...shards.length])

limit = undefined
f = (shard, cb) ->
    run("mkdir -p out; time ./upload_project.py #{limit} #{shard} > out/#{shard}", cb)

exports.run = (_limit) ->
    limit = _limit
    async.map shards, f, (err) ->
        log("DONE!")
        log("err=",err)
