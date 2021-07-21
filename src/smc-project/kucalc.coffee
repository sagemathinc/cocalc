#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Some code specific to running a project in the KuCalc environment.
###

fs = require('fs')
async = require('async')

misc      = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')

path       = require('path')
{execSync} = require('child_process')
{defaults} = misc = require('smc-util/misc')

# global variable
PROJECT_ID = undefined
PREFIX = 'cocalc_project_'

# Prometheus client setup -- https://github.com/siimon/prom-client
prom_client = require('prom-client')

# additionally, record GC statistics
# https://www.npmjs.com/package/prometheus-gc-stats
## I'm commenting this out because the package prometheus-gc-stats
## on npm very explicitly says it does not support prom-client
## version 13, which is what we have installed everywhere.  That
## version is a significant breaking change from version 12, so
## I'm also not comfortable reverting back.  Harald I think force
## upgraded prom-client to version 13 in this commit: b31e087ea2c640f494db15b652d9d0f86e7bd8a5
# require('prometheus-gc-stats')()()

# collect some recommended default metrics every 10 seconds
prom_client.collectDefaultMetrics(timeout: 10 * 1000)

# --- end prometheus setup


# This gets **changed** to true in local_hub.coffee, if a certain
# command line flag is passed in.
exports.IN_KUCALC = false

# static values for monitoring and project information
# uniquely identifies this instance of the local hub
session_id = misc.uuid()
# record when this instance started
start_ts   = (new Date()).getTime()
# status information
current_status = {}

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
                if not err
                    current_status = s
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
    status =
        time      : (new Date()).getTime()
        memory    : {rss: 0}
        disk_MB   : 0
        cpu       : {}
        start_ts  : start_ts
        processes : {}
    async.parallel([
        (cb) ->
            compute_status_disk(status, cb)
        (cb) ->
            cgroup_stats(status, cb)
        (cb) ->
            processes_info(status, cb)
        (cb) ->
            compute_status_tmp(status, cb)
    ], (err) ->
        cb(err, status)
    )

compute_status_disk = (status, cb) ->
    disk_usage "$HOME", (err, x) ->
        status.disk_MB = x
        cb(err)

processes_info = (status, cb) ->
    cols = ['pid','lstart','time','rss','args']
    misc_node.execute_code
        command : 'ps'
        args    : ['--no-header', '-o', cols.join(','), '-u', 'user']
        bash    : false
        cb      : (err, out) ->
            if err or out.exit_code != 0
                cb(err)
            else
                cnt = -1  # no need to account for the ps process itself!
                # TODO parsing anything out of ps is really hard :-(
                # but we want to know how many sage, jupyter, console, etc. instances are running.
                for line in out.stdout.split('\n')
                    if line.length > 0
                        cnt += 1
                status.processes.count = cnt
                cb()

# NOTE: we use tmpfs for /tmp, so RAM usage is the **sum** of /tmp and what
# processes use.
compute_status_tmp = (status, cb) ->
    disk_usage "/tmp", (err, x) ->
        status.memory.rss += 1000*x
        cb(err)

# this grabs the memory stats directly from the sysfs cgroup files
# the actual usage is the sum of the rss values plus cache, but we leave cache aside
cgroup_stats = (status, cb) ->
    async.parallel({
        memory : (cb) ->
            fs.readFile '/sys/fs/cgroup/memory/memory.stat', 'utf8', (err, data) ->
                if err
                    cb(err)
                    return
                stats = {}
                for line in data.split('\n')
                    [key, value] = line.split(' ')
                    try
                        stats[key] = parseInt(value)
                cb(null, stats)

        cpu : (cb) ->
            fs.readFile '/sys/fs/cgroup/cpu,cpuacct/cpuacct.usage', 'utf8', (err, data) ->
                if err
                    cb(err)
                    return
                try
                    cb(null, parseFloat(data) / Math.pow(10, 9))
                catch
                    cb(null, 0.0)

        oom : (cb) ->
            fs.readFile '/sys/fs/cgroup/memory/memory.oom_control', 'utf8', (err, data) ->
                if err
                    cb(err)
                    return
                try
                    for line in data.split('\n')
                        # search string includes a trailing space, otherwise it matches 'oom_kill_disable'!
                        if misc.startswith(line, 'oom_kill ')
                            cb(null, parseInt(line.split(' ')[1]))
                            return
                cb(null, 0)

    }, (err, res) ->
        kib = 1024 # convert to kibibyte
        # total_rss includes total_rss_huge
        # Ref: https://www.kernel.org/doc/Documentation/cgroup-v1/memory.txt
        status.memory.rss  += (res.memory.total_rss ? 0) / kib
        status.memory.cache = (res.memory.total_cache ? 0) / kib
        status.memory.limit = (res.memory.hierarchical_memory_limit ? 0) / kib
        status.cpu.usage    = res.cpu
        status.oom_kills    = res.oom
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
# If we receive some information, exit with status code 99.
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

exports.prometheus_metrics = (project_id) ->
    {get_bugs_total} = require('./local_hub')
    labels = "project_id=\"#{project_id}\",session_id=\"#{session_id}\""
    """
    # HELP cocalc_project_bugs_total The total number of caught bugs.
    # TYPE cocalc_project_bugs_total counter
    cocalc_project_bugs_total{#{labels}} #{get_bugs_total()}
    # HELP cocalc_project_start_time when the project/session started
    # TYPE cocalc_project_start_time counter
    cocalc_project_start_time{#{labels}} #{start_ts}
    # HELP cocalc_project_cpu_usage_seconds
    # TYPE cocalc_project_cpu_usage_seconds counter
    cocalc_project_cpu_usage_seconds{#{labels}} #{current_status.cpu?.usage ? 0.0}
    # HELP cocalc_project_disk_usage_mb
    # TYPE cocalc_project_disk_usage_mb gauge
    cocalc_project_disk_usage_mb{#{labels}} #{current_status.disk_MB ? 0.0}
    # HELP cocalc_project_memory_usage_ki
    # TYPE cocalc_project_memory_usage_ki gauge
    cocalc_project_memory_usage_ki{#{labels}} #{current_status.memory?.rss ? 0.0}
    # HELP cocalc_project_memory_limit_ki
    # TYPE cocalc_project_memory_limit_ki gauge
    cocalc_project_memory_limit_ki{#{labels}} #{current_status.memory?.limit ? 0.0}
    # HELP cocalc_project_running_processes_total
    # TYPE cocalc_project_running_processes_total gauge
    cocalc_project_running_processes_total{#{labels}} #{current_status.processes?.count ? 0}
    # HELP cocalc_project_oom_kills_total
    # TYPE cocalc_project_oom_kills_total counter
    cocalc_project_oom_kills_total{#{labels}} #{current_status.oom_kills ? 0}
    """ + '\n'  # makes sure the response ends with a newline!

# called inside raw_server
exports.init_health_metrics = (raw_server, project_id) ->
    return if not exports.IN_KUCALC
    PROJECT_ID = project_id

    # Setup health and metrics (no url base prefix needed)
    raw_server.use '/health', (req, res) ->
        res.setHeader("Content-Type", "text/plain")
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        res.send('OK')

    # prometheus text format -- https://prometheus.io/docs/instrumenting/exposition_formats/#text-format-details
    raw_server.use '/metrics', (req, res) ->
        res.setHeader("Content-Type", "text/plain; version=0.0.4")
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        part1 = exports.prometheus_metrics(project_id)
        res.send(part1 + '\n' + (await prom_client.register.metrics()) + '\n')
