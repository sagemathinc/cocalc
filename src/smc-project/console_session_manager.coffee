###
Manage console sessions and the console server

This runs as part of the local hub.

NOTE: This code is complicated mainly because it supports multiple users
connecting (or reconnecting) to the **same** session, and also handles bursts
of output.
###

fs        = require('fs')
async     = require('async')
winston   = require('winston')

message   = require('smc-util/message')
misc      = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')

port_manager = require('./port_manager')

# try to restart the console server and get port where it is listening
CONSOLE_SERVER_MAX_STARTUP_TIME_S = 10   # 10 seconds

_restarting_console_server = false
_restarted_console_server  = 0   # time when we last restarted it
restart_console_server = (cb) ->   # cb(err)
    dbg = (m) -> winston.debug("restart_console_server: #{misc.to_json(m)}")
    dbg()

    if _restarting_console_server
        dbg("hit lock -- already restarting console server")
        cb("already restarting console server")
        return

    t = new Date() - _restarted_console_server
    if t <= CONSOLE_SERVER_MAX_STARTUP_TIME_S*1000
        err = "restarted console server #{t}ms ago -- still waiting for it to start"
        dbg(err)
        cb(err)
        return

    _restarting_console_server = true
    dbg("restarting daemon")

    port_file = misc_node.abspath(port_manager.port_file('console'))
    port = undefined
    async.series([
        (cb) ->
            dbg("remove port_file=#{port_file}")
            fs.unlink port_file, (err) ->
                cb() # ignore error, e.g., if file not there.
        (cb) ->
            dbg("restart console server")
            cmd = "smc-console-server"
            misc_node.execute_code
                command        : "#{cmd} stop; #{cmd} start"
                timeout        : 15
                ulimit_timeout : false   # very important -- so doesn't kill consoles after 15 seconds!
                err_on_exit    : true
                bash           : true
                verbose        : true
                cb             : cb
        (cb) ->
            dbg("wait a little to see if #{port_file} appears, and if so read it and return port")
            f = (cb) ->
                fs.exists port_file, (exists) ->
                    if not exists
                        cb(true)
                    else
                        fs.readFile port_file, (err, data) ->
                            if err
                                cb(err)
                            else
                                s = data.toString()
                                #try
                                port = parseInt(s)
                                cb()
                                #    cb("console port_file(='#{port_file}') corrupt -- contents='#{s}' -- #{error}")
            misc.retry_until_success
                f        : f
                max_time : 7000
                cb       : cb
    ], (err) =>
        _restarting_console_server = false
        _restarted_console_server = new Date()
        dbg("finished trying to restart console_server")
        if err
            dbg("ERROR: #{err}")
        cb(err, port)
    )


class ConsoleSessions
    constructor: () ->
        @_sessions = {}
        @_get_session_cbs = {}

    set_secret_token: (secret_token) =>
        @_secret_token = secret_token

    session_exists: (session_uuid) =>
        return @_sessions[session_uuid]?

    terminate_session: (session_uuid, cb) =>
        session = @_sessions[session_uuid]
        if not session?
            cb?()
        else
            winston.debug("terminate console session '#{session_uuid}'")
            if session.status == 'running'
                session.socket.end()
                session.status = 'done'
                cb?()
            else
                cb?()

    terminate_all_sessions: () =>
        for session_uuid, session of @_sessions[session_uuid]
            try
                session.socket.end()
            catch e
                session.status = 'done'

    # Connect to (if 'running'), restart (if 'dead'), or create (if
    # non-existing) the console session with mesg.session_uuid.
    connect: (client_socket, mesg, cb) =>
        if not mesg.session_uuid?
            mesg.session_uuid = misc.uuid()
        client_socket.on 'end', () =>
            winston.debug("a console session client socket ended -- session_uuid=#{mesg.session_uuid}")
            #client_socket.destroy()
        @get_session mesg, (err, session) =>
            if err
                client_socket.write_mesg('json', message.error(id:mesg.id, error:err))
                cb?(err)
            else
                client_socket.write_mesg('json', {desc:session.desc, history:session.history.toString()})
                misc_node.plug(client_socket, session.socket, 20000)  # 20000 = max burst to client every few ms.
                session.clients.push(client_socket)
                cb?()

    # Get or create session with given uuid.
    # Can be safely called several times at once without creating multiple sessions...
    get_session: (mesg, cb) =>
        # NOTE: must be robust against multiple clients opening same session_id at once, which
        # would be likely to happen on network reconnect.
        winston.debug("get_session: console session #{mesg.session_uuid}")
        session = @_sessions[mesg.session_uuid]
        if session? and session.status == 'running'
            winston.debug("console session: done -- it's already there and working")
            cb(undefined, session)
            return

        if not @_get_session_cbs[mesg.session_uuid]?
            winston.debug("console session not yet created -- put on stack")
            @_get_session_cbs[mesg.session_uuid] = [cb]
        else
            winston.debug("console session already being created -- just push cb onto stack and return")
            @_get_session_cbs[mesg.session_uuid].push(cb)
            return

        port    = undefined
        history = undefined
        async.series([
            (cb) =>
                if session?
                    history = session.history # maintain history
                winston.debug("console session does not exist or is not running, so we make a new session")
                session = undefined
                port_manager.get_port 'console', (err, _port) =>
                    if err
                        cb() # will try to restart console server in next step
                    else
                        port = _port
                        winston.debug("got console server port = #{port}")
                        cb()
            (cb) =>
                if port?
                    cb()
                else
                    winston.debug("couldn't determine console server port; probably console server not running -- try restarting it")
                    @terminate_all_sessions()
                    restart_console_server (err, _port) =>
                        if err
                            cb(err)
                        else
                            port = _port
                            winston.debug("restarted console server, then got port = #{port}")
                            cb()
            (cb) =>
                winston.debug("console: Got port -- now create the new session")
                @_new_session mesg, port, (err, _session) =>
                    if err
                        cb(err)
                    else
                        session = _session
                        if history?  # we restarted session; maintain history
                            session.history = history
                        cb()
        ], (err) =>
            # call all the callbacks that were waiting on this session.
            for cb in @_get_session_cbs[mesg.session_uuid]
                cb(err, session)
            delete @_get_session_cbs[mesg.session_uuid]
        )

    _get_console_server_socket: (port, cb) =>
        socket = undefined
        f = (cb) =>
            misc_node.connect_to_locked_socket
                port  : port
                token : @_secret_token
                cb    : (err, _socket) =>
                    if err
                        cb(err)
                    else
                        socket = _socket
                        cb()
        async.series([
            (cb) =>
                misc.retry_until_success
                    f           : f
                    start_delay : 50
                    factor      : 1.7
                    max_delay   : 2000
                    max_time    : 5000
                    cb          : (err) =>
                        cb()  # ignore err on purpose -- no err sets socket
            (cb) =>
                if socket?
                    cb(); return
                port_manager.forget_port('console')
                @terminate_all_sessions()
                restart_console_server (err, _port) =>
                    if err
                        cb(err)
                    else
                        port = _port
                        cb()
            (cb) =>
                if socket?
                    cb(); return
                misc.retry_until_success
                    f        : f
                    max_time : 5000
                    cb       : cb
        ], (err) =>
            if err
                cb(err)
            else
                cb(undefined, socket)
        )

    _new_session: (mesg, port, cb) =>  # cb(err, session)
        winston.debug("_new_session: defined by #{misc.to_json(mesg)}")
        # Connect to port CONSOLE_PORT, send mesg, then hook sockets together.
        @_get_console_server_socket port, (err, console_socket) =>
            if err
                cb("_new_session: console server failed to connect -- #{err}")
                return
            # Request a Console session from console_server
            misc_node.enable_mesg(console_socket)
            console_socket.write_mesg('json', mesg)

            # Below we wait for one message to come back from the console_socket.
            # However, if 5s elapses with no response -- which could happen! --
            # we give up, and return an error.  We then set cb undefined in case
            # the session does actually work.
            no_response = =>
                if cb?
                    cb("no response")
                    console_socket.destroy()
                    cb = undefined  # make sure doesn't get used below
            no_response_timeout = setTimeout(no_response, 5000)

            # Read one JSON message back, which describes the session
            console_socket.once 'mesg', (type, desc) =>
                clearTimeout(no_response_timeout)
                if not cb?  # already failed
                    return
                # in future, history could be read from a file
                # Disable JSON mesg protocol, since it isn't used further
                misc_node.disable_mesg(console_socket)

                session =
                    socket       : console_socket
                    desc         : desc
                    status       : 'running'
                    clients      : []
                    history      : ''    # TODO: this could come from something stored in a file
                    session_uuid : mesg.session_uuid
                    project_id   : mesg.project_id

                session.amount_of_data = 0
                session.last_data = misc.mswalltime()

                console_socket.on 'data', (data) ->
                    #winston.debug("receive #{data.length} of data from the pty: data='#{data.toString()}'")
                    # every 2 ms we reset the burst data watcher.
                    tm = misc.mswalltime()
                    if tm - session.last_data >= 2
                        session.amount_of_data = 0
                    session.last_data = tm

                    if session.amount_of_data > 50000
                        # We just got more than 50000 characters of output in <= 2 ms, so truncate it.
                        # I had a control-c here, but it was EVIL (and useless), so do *not* enable this.
                        #      console_socket.write(String.fromCharCode(3))
                        data = '[...]'

                    session.history += data
                    session.amount_of_data += data.length
                    n = session.history.length
                    if n > 150000
                        session.history = session.history.slice(session.history.length - 100000)

                @_sessions[mesg.session_uuid] = session
                cb(undefined, session)

            console_socket.on 'end', () =>
                winston.debug("console session #{mesg.session_uuid} ended")
                session = @_sessions[mesg.session_uuid]
                if session?
                    session.status = 'done'
                    for client in session.clients
                        # close all of these connections
                        client.end()

    # Return object that describes status of all Console sessions
    info: (project_id) =>
        obj = {}
        for id, session of @_sessions
            if session.project_id == project_id
                obj[id] =
                    desc           : session.desc
                    status         : session.status
                    history_length : session.history.length
        return obj

exports.ConsoleSessions = ConsoleSessions