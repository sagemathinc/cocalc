###
Some code specific to running a project in the KuCalc environment.
###

async = require('async')

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

compute_status = (cb) ->
    status = {memory:{rss:0}, disk_MB:0}
    async.parallel([
        (cb) ->
            compute_status_disk(status, cb)
        (cb) ->
            compute_status_memory(status, cb)
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
exports.init_health_metrics = (raw_server) ->
    return if not exports.IN_KUCALC

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
        res.send("kucalc_project_bugs_total #{get_bugs_total()}\n")
