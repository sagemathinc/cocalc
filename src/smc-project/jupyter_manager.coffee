###
Manage Jupyter server
###

async     = require('async')
winston   = require('winston')
misc_node = require('smc-util-node/misc_node')
misc      = require('smc-util/misc')
message   = require('smc-util/message')

# Either give valid information about the port, etc., or cb(undefined, {status:'stopped'}).
# Never actually returns error as first output.
jupyter_status = (cb) ->
    misc_node.execute_code
        command     : "smc-jupyter"
        args        : ['status']
        err_on_exit : true
        bash        : false
        timeout     : 20
        ulimit_timeout : false   # very important -- so doesn't kill consoles after 60 seconds cputime!
        cb          : (err, out) ->
            if err
                cb(undefined, {"status": "stopped"})
            else
                try
                    cb(undefined, misc.from_json(out.stdout))
                catch e
                    cb(undefined, {"status": "stopped"})

jupyter_start = (cb) ->
    misc_node.execute_code
        command     : "smc-jupyter"
        args        : ['start']
        err_on_exit : true
        bash        : false
        timeout     : 60
        ulimit_timeout : false   # very important -- so doesn't kill consoles after 60 seconds cputime!
        cb          : (err, out) ->
            if not err
                # do some checks on the output to make sure things really worked.
                try
                    status = misc.from_json(out.stdout)
                    if not status?.port
                        err = "unable to start -- no port; status=#{misc.to_json(out)}"
                catch e
                    err = "error parsing smc-jupyter startup output -- #{e}, {misc.to_json(out)}"
            cb(err, status)

jupyter_port_queue = []
exports.jupyter_port = (socket, mesg) ->
    dbg = (m) -> winston.debug("jupyter_port: #{m}")
    dbg()
    jupyter_port_queue.push({socket:socket, mesg:mesg})
    if jupyter_port_queue.length > 1
        dbg("already #{jupyter_port_queue.length} requests -- return immediately")
        return
    status = undefined
    async.series([
        (cb) ->
            dbg("checking jupyter status")
            jupyter_status (err, _status) ->
                status = _status
                dbg("got status=#{misc.to_json(status)}")
                cb(err)
        (cb) ->
            if status?.port
                dbg("already running; nothing more to do")
                cb()
                return
            dbg("not running, so start it running")
            jupyter_start (err, _status) ->
                status = _status
                dbg("after starting, got status=#{misc.to_json(status)}")
                cb(err)
    ], (err) ->
        dbg("finished; (err=#{err}); now sending resp")
        for x in jupyter_port_queue
            if err
                resp  = message.error
                     id    : x.mesg.id
                     error : "error starting jupyter -- #{err}"
            else
                resp = message.jupyter_port
                    id   : x.mesg.id
                    port : status.port
            x.socket.write_mesg('json', resp)
        jupyter_port_queue = []
    )