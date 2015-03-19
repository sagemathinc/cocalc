
async          = require('async')
fs             = require('fs')
child_process  = require('child_process')

hosts = ("cloud#{i}.math.washington.edu" for i in [10..21])

#hosts = ["cloud10.math.washington.edu"]
#hosts = ("cloud#{i}.math.washington.edu" for i in [10,11,12])

THREADS = hosts.length

OLDEST = fs.readFileSync('date').toString('ascii').trim()

split = (s) ->
    r = s.match(/\S+/g)
    if r
        return r
    else
        return []

cmd = (s, cb) ->
    console.log(s)
    t0 = new Date() - 0
    child_process.exec s, (err, stdout, stderr) ->
        #console.log("stdout='#{stdout}'")
        #console.log("stderr='#{stderr}'")
        if err
           console.log("ERROR running s='#{s}': #{err}")
        console.log("DONE with #{s}: time=#{(new Date() - t0)/1000}s")
        cb?()

update_project_times_from_host = (host, cb) ->
    # ssh root@cloud10.math.washington.edu -p 2222 "ls -lt --time-style=full-iso /bup/bups |grep -v ^total " > t
    cmd("ssh root@#{host} -o StrictHostKeyChecking=no -p 2222 'ls -lt --time-style=full-iso /bup/bups |grep -v ^total' > bup/bups/ls-lt/#{host}", cb)

update_project_times = (cb) ->
    console.log "Fetching project timestamp information..."
    async.map(hosts, update_project_times_from_host, cb)

num_to_get = undefined
num = 0
start = new Date() - 0
f = (x, cb) ->
    date = x[0]; host=x[1]; project_id = x[2]; j = x[3]
    num += 1
    elapsed = (new Date() - start)/1000.0
    per = elapsed / num
    remaining = ((num_to_get-num) * per)/60.0/60.0
    console.log("#{date}: Syncing #{num}/#{num_to_get} -- (from #{host}) -- elapsed=#{elapsed/60/60}h; remaining=#{remaining}h or #{remaining*60}m ...")
    s = "time rsync -axvH -e 'ssh -o StrictHostKeyChecking=no -p 2222' --delete --exclude /bup/bups/#{project_id}/cache/ root@#{host}:/bup/bups/#{project_id}/ bup/bups/#{host}/#{project_id}/ > /dev/null 2>/dev/null"
    cmd(s, cb)

g = (cb) ->
    to_get = []
    j = 0
    for host in hosts
        for x in fs.readFileSync("bup/bups/ls-lt/#{host}").toString().split('\n')
            v = split(x)
            #console.log(x); console.log(v)
            if v.length < 9
                continue
            if v[5] < OLDEST
                console.log("Halting scan of #{host} at '#{x}'.")
                break
            j += 1
            to_get.push([v[5],host,v[8],j])

    num_to_get = to_get.length
    to_get.sort (a,b) ->
        a_key = "#{a[0]}-#{a[2]}"
        b_key = "#{b[0]}-#{b[2]}"
        if a_key < b_key
            return 1
        else
            return -1
    console.log("to_get length = #{to_get.length}")
    async.mapLimit(to_get, THREADS, f, (err) -> cb?(err))
    cb?()


async.series([
    (cb) ->
       update_project_times(cb)
    (cb) ->
       start = new Date() - 0
       g(cb)
], (err) ->
    console.log("Done updating backups: err=#{err}")
)

