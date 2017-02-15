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
blobs  = require('./blobs')


{required, defaults} = misc

###############################################
# Direct Sage socket session -- used internally in local hub, e.g., to assist CodeMirror editors...
###############################################

# Wait up to this long for the Sage server to start responding
# connection requests, after we restart it.  It can
# take a while, since it pre-imports the sage library
# at startup, before forking.
SAGE_SERVER_MAX_STARTUP_TIME_S = 30

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
        command        : "smc-sage-server restart"
        timeout        : 45
        ulimit_timeout : false   # very important -- so doesn't kill after 30 seconds of cpu!
        err_on_exit    : true
        bash           : true
        cb             : (err, output) ->
            if err
                dbg("failed to restart sage server daemon -- #{err}")
            else
                dbg("successfully restarted sage server daemon -- '#{JSON.stringify(output)}'")
            _restarting_sage_server = false
            _restarted_sage_server = new Date()
            cb(err)

# Get a new connection to the Sage server.  If the server
# isn't running, e.g., it was killed due to running out of memory,
# so attempt to restart it and try to connect.
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
                    if err
                        cb(err)
                        return
                    # success at restarting sage server: *IMMEDIATELY* try to connect
                    _get_sage_socket (err, _socket) ->
                        socket = _socket
                        cb(err)

    misc.retry_until_success
        f           : try_to_connect
        start_delay : 50
        max_delay   : 5000
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


cache = {}
exports.sage_session = (opts) ->
    opts = defaults opts,
        client : required
        path   : required   # the path to the *worksheet* file
    # compute and cache if not cached; otherwise, get from cache:
    return cache[opts.path] ?= new SageSession(opts)

###
Sage Session object

Until you actually try to call it no socket need
###
class SageSession
    constructor: (opts) ->
        opts = defaults opts,
            client : required
            path   : required   # the path to the *worksheet* file
        @_path = opts.path
        @_client = opts.client
        @_output_cb = {}

    dbg: (f) =>
        return (m) => winston.debug("SageSession(path='#{@_path}').#{f}: #{m}")

    close: () =>
        if @_socket?
            misc_node.process_kill(@_socket.pid, 9)
        @_socket?.end()
        delete @_socket
        for id, cb of @_output_cb
            cb({done:true, error:"killed"})
        @_output_cb = {}
        delete cache[@_path]

    # return true if there is a socket connection to a sage server process
    is_running: () =>
        return @_socket?

    _init_socket: (cb) =>
        dbg = @dbg('_init_socket()')
        dbg()
        exports.get_sage_socket (err, socket) =>
            if err
                dbg("fail -- #{err}.")
                cb(err)
                return

            dbg("successfully opened a sage session")
            @_socket = socket

            socket.on 'end', () =>
                delete @_socket
                dbg("codemirror session terminated")

            # CRITICAL: we must define this handler before @_init_path below,
            # or @_init_path can't possibly work... since it would wait for
            # this handler to get the response message!
            socket.on 'mesg', (type, mesg) =>
                dbg("sage session: received message #{type}")
                @["_handle_mesg_#{type}"]?(mesg)

            @_init_path(cb)

    _init_path: (cb) =>
        dbg = @dbg("_init_path()")
        dbg()
        err = undefined
        @call
            input :
                event : 'execute_code'
                code  : "os.chdir(salvus.data['path']);__file__=salvus.data['file']"
                data  :
                    path : misc_node.abspath(misc.path_split(@_path).head)
                    file : misc_node.abspath(@_path)
                preparse : false
            cb    : (resp) =>
                if resp.stderr
                    err = resp.stderr
                    dbg("error '#{err}'")
                if resp.done
                    cb?(err)

    call: (opts) =>
        opts = defaults opts,
            input : required
            cb    : undefined   # cb(resp) or cb(resp1), cb(resp2), etc. -- posssibly called multiple times when message is execute or 0 times
        dbg = @dbg("call")
        dbg("input='#{misc.trunc(misc.to_json(opts.input), 300)}'")
        switch opts.input.event
            when 'ping'
                opts.cb?({pong:true})
            when 'status'
                opts.cb?({running:@is_running()})
            when 'signal'
                if @_socket?
                    dbg("sending signal #{opts.input.signal} to process #{@_socket.pid}")
                    misc_node.process_kill(@_socket.pid, opts.input.signal)
                opts.cb?({})
            when 'restart'
                dbg("restarting sage session")
                if @_socket?
                    @close()
                @_init_socket (err) =>
                    if err
                        opts.cb?({error:err})
                    else
                        opts.cb?({})
            when 'raw_input'
                dbg("sending sage_raw_input event")
                @_socket?.write_mesg('json', {event:'sage_raw_input', value:opts.input.value})
            else
                # send message over socket and get responses
                async.series([
                    (cb) =>
                        if @_socket?
                            cb()
                        else
                            @_init_socket(cb)
                    (cb) =>
                        if not opts.input.id?
                            opts.input.id = misc.uuid()
                            dbg("generated new random uuid for input: '#{opts.input.id}' ")
                        @_socket.write_mesg('json', opts.input)
                        if opts.cb?
                            @_output_cb[opts.input.id] = opts.cb  # this is when opts.cb will get called...
                        cb()
                ], (err) =>
                    if err
                        opts.cb?({done:true, error:err})
                )
    _handle_mesg_blob: (mesg) =>
        sha1 = mesg.uuid
        dbg = @dbg("_handle_mesg_blob(sha1='#{sha1}')")
        dbg()
        hub = @_client.get_hub_socket()
        if not hub?
            error = 'no global hubs are connected to the local hub, so nowhere to send file'
            dbg(error)
            resp =  message.save_blob
                error  : error
                sha1   : sha1
            @_socket?.write_mesg('json', resp)
            return
        dbg("forwarding blob to hub")
        hub.write_mesg('blob', mesg)
        blobs.receive_save_blob_message
            sha1 : sha1
            cb   : (resp) =>
                @_socket?.write_mesg('json', resp)

    _handle_mesg_json: (mesg) =>
        dbg = @dbg('_handle_mesg_json')
        dbg("mesg='#{misc.trunc_middle(misc.to_json(mesg),400)}'")
        c = @_output_cb[mesg?.id]
        if c?
            # Must do this check first since it uses done:false.
            if mesg.done or not mesg.done?
                delete @_output_cb[mesg.id]
                mesg.done = true
            if mesg.done? and not mesg.done
                # waste of space to include done part of mesg if just false for everything else...
                delete mesg.done
            c(mesg)

