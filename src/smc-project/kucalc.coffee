###
Some code specific to running a project in the KuCalc environment.
###

fs = require('fs')
async = require('async')

misc      = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')

# This gets **changed** to true in local_hub.coffee, if a certain
# command line flag is passed in.
exports.IN_KUCALC = false

exports.init = (client) ->
    # update project status every 30s
    # TODO: could switch to faster when it's changing and slower when it isn't.
    f = -> update_project_status(client)
    f()
    setInterval(f, 30000)

update_project_status = (client, cb) ->
    dbg = client.dbg("update_status")
    dbg()
    status = undefined
    async.series([
        (cb) ->
            compute_status (err, s) ->
                status = s
                cb(err)
        (cb) ->
            client.query
                query   :
                    projects : {project_id:client.client_id(), status: status}
                cb      : cb
    ], (err) ->
        cb?(err)
    )

exports.compute_status = compute_status = (cb) ->
    status = {memory:{rss:0}, disk_MB:0}
    async.parallel([
        (cb) ->
            compute_status_disk(status, cb)
        (cb) ->
            #compute_status_memory(status, cb)
            cgroup_memstats(status, cb)
        (cb) ->
            compute_status_tmp(status, cb)
    ], (err) ->
        cb(err, status)
    )

compute_status_disk = (status, cb) ->
    disk_usage "$HOME", (err, x) ->
        status.disk_MB = x
        cb(err)

# NOTE: we use tmpfs for /tmp, so RAM usage is the **sum** of /tmp and what
# processes use.
compute_status_tmp = (status, cb) ->
    disk_usage "/tmp", (err, x) ->
        status.memory.rss += 1000*x
        cb(err)

compute_status_memory = (status, cb) ->
    misc_node.execute_code
        command : "smem -nu | tail -1 | awk '{print $6}'"
        bash    : true
        cb      : (err, out) ->
            if err
                cb(err)
            else
                status.memory.rss += parseInt(out.stdout)
                cb()

# this grabs the memory stats directly from the sysfs cgroup files
# the usage is compensated by the cache usage in the stat file ...
cgroup_memstats = (status, cb) ->
    async.parallel({

        cache : (cb) ->
            fs.readFile '/sys/fs/cgroup/memory/memory.stat', 'utf8', (err, data) ->
                if err
                    cb(err, 0)
                    return
                for line in data.split('\n')
                    [key, value] = line.split(' ')
                    if key == 'cache'
                        cb(null, parseInt(value))
                        return
                    cb('entry "cache" not found', 0)

        limit : (cb) ->
            fs.readFile '/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8', (err, data) ->
                if err
                    cb(err, 0)
                else
                    value = parseInt(data.split('\n')[0])
                    cb(null, value)

        usage : (cb) ->
            fs.readFile '/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8', (err, data) ->
                if err
                    cb(err, 0)
                else
                    value = parseInt(data.split('\n')[0])
                    cb(null, value)

    }, (err, res) ->
        if err
            cb(err)
        else
            status.memory.rss += (res.usage - res.cache) / 1024
            status.memory.limit = res.limit / 1024
            cb()
    )


disk_usage = (path, cb) ->
    misc_node.execute_code
        command : "df -BM #{path} | tail -1 | awk '{gsub(\"M\",\"\");print $3}'"
        bash    : true
        cb      : (err, out) ->
            if err
                cb(err)
            else
                cb(undefined, parseInt(out.stdout))


# Every 60s, check if we can reach google's internal network -- in kucalc on GCE, this must be blocked.
# If we recieve some information, exit with status code 99.
exports.init_gce_firewall_test = (logger, interval_ms=60*1000) ->
    return # temporarily disabled
    if not exports.IN_KUCALC
        logger?.warn("not running firewall test -- not in kucalc")
        return
    URI = 'http://metadata.google.internal/computeMetadata/v1/'
    test_firewall = ->
        logger?.log("test_firewall")
        request = require('request')
        request(
            timeout : 3000
            headers :
              'Metadata-Flavor' : 'Google'
            uri: URI
            method: 'GET'
        , (err, res, body) ->
            if err?.code == 'ETIMEDOUT'
                logger?.log('test_firewall: timeout -> no action')
            else
                logger?.warn('test_firewall', res)
                logger?.warn('test_firewall', body)
                if res? or body?
                    logger?.warn('test_firewall: request went through and got a response -> exiting with code 99')
                    process.exit(99)
                else
                    logger?.warn('test_firewall: request went through with no response -> no action')
        )
    test_firewall()
    setInterval(test_firewall, interval_ms)
    return

# called inside raw_server
exports.init_health_metrics = (raw_server, project_id) ->
    return if not exports.IN_KUCALC
    # uniquely identifies this instance of the local hub
    session_id = misc.uuid()
    # record when this instance started
    start_ts   = (new Date()).getTime()

    # Setup health and metrics (no url base prefix needed)
    raw_server.use '/health', (req, res) ->
        res.setHeader("Content-Type", "text/plain")
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate')
        res.send('OK')

    # prometheus text format -- https://prometheus.io/docs/instrumenting/exposition_formats/#text-format-details
    raw_server.use '/metrics', (req, res) ->
        res.setHeader("Content-Type", "text/plain; version=0.0.4")
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate')
        {get_bugs_total} = require('./local_hub')
        labels = "project_id=\"#{project_id}\",session_id=\"#{session_id}\""
        res.send("""
        # HELP kucalc_project_bugs_total The total number of caught bugs.
        # TYPE kucalc_project_bugs_total counter
        kucalc_project_bugs_total{#{labels}} #{get_bugs_total()}
        # HELP kucalc_project_start_time when the project/session started
        # TYPE kucalc_project_start_time counter
        kucalc_project_start_time{#{labels}} #{start_ts}
        """)
