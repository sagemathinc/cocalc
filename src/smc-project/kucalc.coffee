###
Some code specific to running a project in the KuCalc environment.
###

async = require('async')

misc_node = require('smc-util-node/misc_node')

exports.IN_KUCALC = process.env.COCALC_USERNAME == 'user'

exports.status = (cb) ->
    status = {}
    async.parallel([
        (cb) ->
            status_disk(status, cb)
        (cb) ->
            status_memory(status, cb)
    ], (err) ->
        cb(err, status)
    )

status_disk = (status, cb) ->
    misc_node.execute_code
        command : "df -BM $HOME | tail -1 | awk '{gsub(\"M\",\"\");print $3}'"
        bash    : true
        cb      : (err, out) ->
            if err
                cb(err)
            else:
                status.disk_MB = parseInt(out.stdout)
                cb()

status_memory = (status, cb) ->
    misc_node.execute_code
        command : "smem -nu | tail -1 | awk '{print $6}'"
        bash    : true
        cb      : (err, out) ->
            if err
                cb(err)
            else:
                status.memory = {rss:parseInt(out.stdout)}
                cb()
