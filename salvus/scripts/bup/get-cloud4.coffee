
# This is a backup script that I use on my laptop to efficiently pull backups from cloud4 to offsite. 

async          = require('async')
fs             = require('fs')
child_process  = require('child_process')

OLDEST = '2014-12-01'

cmd = (s, cb) ->
    console.log(s)
    child_process.exec s, (err, stdout, stderr) ->
        console.log("stdout='#{stdout}'")
        console.log("stderr='#{stderr}'")
        cb?(err)

update_project_times = (cb) -> 
    console.log "Fetching project timestamp information..."
    cmd("time rsync -axvH --delete salvus@cloud4.math.washington.edu:/home/salvus/vm/images/bup/bups/ls-lt/ bup/bups/ls-lt/", cb)

num_to_get = undefined
f = (x, cb) ->
    i=x[0]; project_id = x[1]; j = x[2]
    console.log("Syncing #{j}/#{num_to_get} from 10.1.#{i}.5...")
    cmd("time rsync -axvH --delete salvus@cloud4.math.washington.edu:/home/salvus/vm/images/bup/bups/10.1.#{i}.5/#{project_id}/ bup/bups/10.1.#{i}.5/#{project_id}/", cb)

g = (i, cb) ->
    to_get = []
    j = 0
    for x in fs.readFileSync("bup/bups/ls-lt/10.1.#{i}.5").toString().split('\n')
        # drwx------ 10 salvus salvus 15 2014-12-01 18:03:31.174363687 +0000 4a23c55e-fd3b-4695-a4d7-de088ebce6ca
        v = x.split(' ')
        if v.length < 9
            continue
        if v[5] < OLDEST
            break
        j += 1
        to_get.push([i,v[8],j])

    num_to_get = to_get.length
    console.log "Syncing #{num_to_get} projects from 10.1.#{i}.5"
    async.mapLimit(to_get, 10, f, (err) -> cb?(err))
    
sync_db = (cb) ->
    console.log("Syncing database backup")
    cmd("time rsync -axvH --delete salvus@cloud4.math.washington.edu:/home/salvus/vm/images/bup/cassandra-dc1/ bup/cassandra-dc1/")

async.series([
    (cb) -> 
       update_project_times(cb)
    (cb) -> 
       async.mapSeries([1..7], g, (err) -> cb(err))
    #(cb) ->
    #   sync_db(cb)
], (err) -> 
    console.log("Done updating backups: err=#{err}")
)

