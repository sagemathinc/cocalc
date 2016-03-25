###
Manage Jupyter server
###

winston        = require('winston')
misc_node      = require('smc-util-node/misc_node')
misc           = require('smc-util/misc')
message        = require('smc-util/message')

jupyter_port_queue = []
exports.jupyter_port = (socket, mesg) ->
    winston.debug("jupyter_port")
    jupyter_port_queue.push({socket:socket, mesg:mesg})
    if jupyter_port_queue.length > 1
        return
    misc_node.execute_code
        command     : "smc-jupyter"
        args        : ['start']
        err_on_exit : true
        bash        : false
        timeout     : 60
        ulimit_timeout : false   # very important -- so doesn't kill consoles after 60 seconds cputime!
        cb          : (err, out) ->
            if not err
                try
                    info = misc.from_json(out.stdout)
                    port = info?.port
                    if not port?
                        err = "unable to start -- no port; info=#{misc.to_json(out)}"
                    else
                catch e
                    err = "error parsing smc-jupyter startup output -- #{e}, {misc.to_json(out)}"
            if err
                error = "error starting Jupyter -- #{err}"
                for x in jupyter_port_queue
                    err_mesg = message.error
                        id    : x.mesg.id
                        error : error
                    x.socket.write_mesg('json', err_mesg)
            else
                for x in jupyter_port_queue
                    resp = message.jupyter_port
                        port : port
                        id   : x.mesg.id
                    x.socket.write_mesg('json', resp)
            jupyter_port_queue = []
