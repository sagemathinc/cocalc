###
Start the Sage server and also get a new socket connection to it.
###

async     = require('async')
winston   = require('winston')

misc      = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')
message   = require('smc-util/message')

port_manager = require('./port_manager')

common = require('./common')

###############################################
# Direct Sage socket session -- used internally in local hub, e.g., to assist CodeMirror editors...
###############################################

# Wait up to this long for the Sage server to start responding
# connection requests, after we restart it.  It can
# take a while, since it pre-imports the sage library
# at startup, before forking.
SAGE_SERVER_MAX_STARTUP_TIME_S = 30   # 30 seconds

_restarting_sage_server = false
_restarted_sage_server  = 0   # time when we last restarted it
restart_sage_server = (cb) ->
    dbg = (m) -> winston.debug("restart_sage_server: #{misc.to_json(m)}")
    if _restarting_sage_server
        dbg("hit lock")
        cb("already restarting sage server")
        return
    t = new Date() - _restarted_sage_server
    if t <= SAGE_SERVER_MAX_STARTUP_TIME_S*1000
        err = "restarted sage server #{t}ms ago -- still waiting for it to start"
        dbg(err)
        cb(err)
        return

    _restarting_sage_server = true
    dbg("restarting the daemon")
    misc_node.execute_code
        command        : "smc-sage-server stop; smc-sage-server start"
        timeout        : 45
        ulimit_timeout : false   # very important -- so doesn't kill consoles after 30 seconds of cpu!
        err_on_exit    : true
        bash           : true
        cb             : (err) ->
            _restarting_sage_server = false
            _restarted_sage_server = new Date()
            cb(err)

# Get a new connection to the Sage server.  If the server
# isn't running, e.g., it was killed due to running out of memory,
# then attempt to restart it and try to connect.
exports.get_sage_socket = (cb) ->   # cb(err, socket)
    socket = undefined
    try_to_connect = (cb) ->
        _get_sage_socket (err, _socket) ->
            if not err
                socket = _socket
                cb()
            else
                # Failed for some reason: try to restart one time, then try again.
                # We do this because the Sage server can easily get killed due to out of memory conditions.
                # But we don't constantly try to restart the server, since it can easily fail to start if
                # there is something wrong with a local Sage install.
                # Note that restarting the sage server doesn't impact currently running worksheets (they
                # have their own process that isn't killed).
                restart_sage_server (err) ->  # won't actually try to restart if called recently.
                    # we ignore the returned err -- error does not matter, since we didn't connect
                    cb(true)

    misc.retry_until_success
        f           : try_to_connect
        start_delay : 2000
        max_delay   : 6000
        factor      : 1.5
        max_time    : SAGE_SERVER_MAX_STARTUP_TIME_S*1000
        log         : (m) -> winston.debug("get_sage_socket: #{m}")
        cb          : (err) ->
            cb(err, socket)

_get_sage_socket = (cb) ->  # cb(err, socket that is ready to use)
    sage_socket = undefined
    port = undefined
    async.series([
        (cb) =>
            winston.debug("get sage server port")
            port_manager.get_port 'sage', (err, _port) =>
                if err
                    cb(err); return
                else
                    port = _port
                    cb()
        (cb) =>
            winston.debug("get and unlock socket")
            misc_node.connect_to_locked_socket
                port  : port
                token : common.secret_token()
                cb    : (err, _socket) =>
                    if err
                        port_manager.forget_port('sage')
                        winston.debug("unlock socket: _new_session: sage session denied connection: #{err}")
                        cb("_new_session: sage session denied connection: #{err}")
                        return
                    sage_socket = _socket
                    winston.debug("Successfully unlocked a sage session connection.")
                    cb()

        (cb) =>
            winston.debug("request sage session from server.")
            misc_node.enable_mesg(sage_socket)
            sage_socket.write_mesg('json', message.start_session(type:'sage'))
            winston.debug("Waiting to read one JSON message back, which will describe the session....")
            # TODO: couldn't this just hang forever :-(
            sage_socket.once 'mesg', (type, desc) =>
                winston.debug("Got message back from Sage server: #{common.json(desc)}")
                sage_socket.pid = desc.pid
                cb()

    ], (err) -> cb(err, sage_socket))
