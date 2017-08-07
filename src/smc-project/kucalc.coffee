###
Some code specific to running a project in the KuCalc environment.
###

async = require('async')

misc_node = require('smc-util-node/misc_node')

exports.IN_KUCALC = process.env.COCALC_USERNAME == 'user'

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
