###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


#################################################################
#
# local_hub -- a node.js program that runs as a regular user, and
#              coordinates and maintains the connections between
#              the global hubs and *all* projects running as
#              this particular user.
#
# The local_hub is a bit like the "screen" program for Unix, except
# that it simultaneously manages numerous sessions, since simultaneously
# doing a lot of IO-based things is what Node.JS is good at.
#
#
# NOTE: For local debugging, run this way, since it gives better stack
# traces.CodeMirrorSession: _connect to file
#
#         make_coffee && echo "require('local_hub').start_server()" | coffee
#
#  (c) William Stein, 2013, 2014
#
#################################################################

path           = require('path')
async          = require('async')
fs             = require('fs')
os             = require('os')
net            = require('net')
child_process  = require('child_process')
uuid           = require('node-uuid')
winston        = require('winston')
temp           = require('temp')

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

require('coffee-script/register')

message        = require('smc-util/message')
misc           = require('smc-util/misc')
misc_node      = require('smc-util-node/misc_node')
diffsync       = require('smc-util/diffsync')

{to_json, from_json, defaults, required}   = require('smc-util/misc')

json = (out) -> misc.trunc(misc.to_json(out),512)

{ensure_containing_directory_exists, abspath} = misc_node

expire_time = (ttl) -> if ttl then new Date((new Date() - 0) + ttl*1000)

# We make it an error for a client to try to edit a file larger than MAX_FILE_SIZE.
# I decided on this, because attempts to open a much larger file leads
# to disaster.  Opening a 10MB file works but is a just a little slow.
MAX_FILE_SIZE = 10000000   # 10MB
check_file_size = (size) ->
    if size? and size > MAX_FILE_SIZE
        e = "Attempt to open large file of size #{Math.round(size/1000000)}MB; the maximum allowed size is #{Math.round(MAX_FILE_SIZE/1000000)}MB. Use vim, emacs, or pico from a terminal instead."
        winston.debug(e)
        return e

###
# Revision tracking misc.
###

# Save the revision_tracking info for a file to disk *at most* this frequently.
# NOTE: failing to save to disk would only mean missing a patch but should
# otherwise *NOT* corrupt the history.
REVISION_TRACKING_SAVE_INTERVAL = 45000   # 45 seconds

# Filename of revision tracking file associated to a given file
revision_tracking_path = (path) ->
    s = misc.path_split(path)
    return "#{s.head}/.#{s.tail}.sage-history"

#####################################################################
# Generate the "secret_token" file as
# $SAGEMATHCLOUD/data/secret_token if it does not already
# exist.  All connections to all local-to-the user services that
# SageMathClouds starts must be prefixed with this key.
#####################################################################

# WARNING -- the sage_server.py program can't get these definitions from
# here, since it is not written in node; if this path changes, it has
# to be change there as well (it will use the SMC environ
# variable though).

if process.env.SMC_LOCAL_HUB_HOME?
    process.env.HOME = process.env.SMC_LOCAL_HUB_HOME

if not process.env.SMC?
    process.env.SMC = path.join(process.env.HOME, '.smc')

SMC = process.env.SMC

process.chdir(process.env.HOME)

DATA = path.join(SMC, 'local_hub')

if not fs.existsSync(SMC)
    fs.mkdirSync(SMC)
if not fs.existsSync(DATA)
    fs.mkdirSync(DATA)

CONFPATH = exports.CONFPATH = abspath(DATA)
secret_token = undefined

{secret_token_filename} = require('./common.coffee')

# We use an n-character cryptographic random token, where n is given
# below.  If you want to change this, changing only the following line
# should be safe.
secret_token_length = 128

init_confpath = () ->
    async.series([

        # Read or create the file; after this step the variable secret_token
        # is set and the file exists.
        (cb) ->
            fs.exists secret_token_filename, (exists) ->
                if exists
                    winston.debug("read '#{secret_token_filename}'")
                    fs.readFile secret_token_filename, (err, buf) ->
                        secret_token = buf.toString()
                        cb()
                else
                    winston.debug("create '#{secret_token_filename}'")
                    require('crypto').randomBytes  secret_token_length, (ex, buf) ->
                        secret_token = buf.toString('base64')
                        fs.writeFile(secret_token_filename, secret_token, cb)

        # Ensure restrictive permissions on the secret token file.
        (cb) ->
            fs.chmod(secret_token_filename, 0o600, cb)
    ])

INFO = undefined
init_info_json = () ->
    winston.debug("writing info.json")
    filename = "#{SMC}/info.json"
    v = process.env['HOME'].split('/')
    project_id = v[v.length-1]
    username   = project_id.replace(/-/g,'')
    # TODO: The stuff below would have to be made more general for general use...
    if os.hostname() == 'sagemathcloud'
        # special case for the VirtualbBox VM
        host = 'localhost'
    else
        # what we want for the Google Compute engine deployment
        host       = require('os').networkInterfaces().eth0?[0].address
    base_url   = ''
    port       = 22
    INFO =
        project_id : project_id
        location   : {host:host, username:username, port:port, path:'.'}
        base_url   : base_url
    fs.writeFileSync(filename, misc.to_json(INFO))

###############################################
# Console sessions
###############################################
ports = {}
get_port = (type, cb) ->   # cb(err, port number)
    if ports[type]?
        cb(false, ports[type])
    else
        fs.readFile abspath("#{SMC}/#{type}_server/#{type}_server.port"), (err, content) ->
            if err
                cb(err)
            else
                try
                    ports[type] = parseInt(content)
                    cb(false, ports[type])
                catch e
                    cb("#{type}_server port file corrupted")

forget_port = (type) ->
    if ports[type]?
        delete ports[type]

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

    dbg("killing all existing console sockets")
    console_sessions.terminate_all_sessions()

    port_file = abspath("#{SMC}/console_server/console_server.port")
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
                                try
                                    port = parseInt(data.toString())
                                    cb()
                                catch error
                                    cb('reading port corrupt')
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
                plug(client_socket, session.socket, 20000)  # 20000 = max burst to client every few ms.
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
                get_port 'console', (err, _port) =>
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
                token : secret_token
                cb    : (err, _socket) =>
                    if err
                        cb(err)
                    else
                        socket = _socket
                        cb()
        async.series([
            (cb) =>
                misc.retry_until_success
                    f        : f
                    max_time : 5000
                    cb       : (err) =>
                        cb()  # ignore err on purpose -- no err sets socket
            (cb) =>
                if socket?
                    cb(); return
                forget_port('console')
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
        winston.debug("_new_session: defined by #{json(mesg)}")
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
                if not history?
                    history = new Buffer(0)
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
                    if n > 200000
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

console_sessions = new ConsoleSessions()


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
exports.restart_sage_server = restart_sage_server = (cb) ->
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
get_sage_socket = (cb) ->
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
            get_port 'sage', (err, _port) =>
                if err
                    cb(err); return
                else
                    port = _port
                    cb()
        (cb) =>
            winston.debug("get and unlock socket")
            misc_node.connect_to_locked_socket
                port  : port
                token : secret_token
                cb    : (err, _socket) =>
                    if err
                        forget_port('sage')
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
                winston.debug("Got message back from Sage server: #{json(desc)}")
                sage_socket.pid = desc.pid
                cb()

    ], (err) -> cb(err, sage_socket))

# Connect to sockets together.  This is used mainly
# for the console server.
plug = (s1, s2, max_burst) ->   # s1 = hub; s2 = console server
    last_tm = misc.mswalltime()
    last_data = ''
    amount  = 0
    # Connect the sockets together.
    s1_data = (data) ->
        activity()
        # record incoming activity  (don't do this in other direction, since that shouldn't keep session alive)
        if not s2.writable
            s1.removeListener('data', s1_data)
        else
            s2.write(data)
    s2_data = (data) ->
        if not s1.writable
            s2.removeListener('data', s2_data)
        else
            if max_burst?
                tm = misc.mswalltime()
                if tm - last_tm >= 20
                    if amount < 0 # was truncating
                        try
                            x = last_data.slice(Math.max(0, last_data.length - Math.floor(max_burst/4)))
                        catch e
                            # I don't know why the above sometimes causes an exception, but it *does* in
                            # Buffer.slice, which is a serious problem.   Best to ignore that data.
                            x = ''
                        data = "]" + x + data
                    #console.log("max_burst: reset")
                    amount = 0
                last_tm = tm
                #console.log("max_burst: amount=#{amount}")
                if amount >= max_burst
                    last_data = data
                    data = data.slice(0,Math.floor(max_burst/4)) + "[..."
                    amount = -1 # so do only once every 20ms.
                    setTimeout((()=>s2_data('')), 25)  # write nothing in 25ms just to make sure ...] appears.
                else if amount < 0
                    last_data += data
                    setTimeout((()=>s2_data('')), 25)  # write nothing in 25ms just to make sure ...] appears.
                else
                    amount += data.length
                # Never push more than max_burst characters at once to hub, since that could overwhelm
            s1.write(data)
    s1.on('data', s1_data)
    s2.on('data', s2_data)


###############################################
# Sage sessions
###############################################

## WARNING!  I think this is no longer used!  It was used for my first (few)
## approaches to worksheets.

class SageSessions
    constructor: () ->
        @_sessions = {}

    session_exists: (session_uuid) =>
        return @_sessions[session_uuid]?

    terminate_session: (session_uuid, cb) =>
        S = @_sessions[session_uuid]
        if not S?
            cb()
        else
            winston.debug("terminate sage session -- STUB!")
            cb()

    update_session_status: (session) =>
        # Check if the process corresponding to the given session is
        # *actually* running/healthy (?).  Just because the socket hasn't sent
        # an "end" doesn't mean anything.
        try
            process.kill(session.desc.pid, 0)
            # process is running -- leave status as is.
        catch e
            # process is not running
            session.status = 'done'


    get_session: (uuid) =>
        session = @_sessions[uuid]
        if session?
            @update_session_status(session)
        return session

    # Connect to (if 'running'), restart (if 'dead'), or create (if
    # non-existing) the Sage session with mesg.session_uuid.
    connect: (client_socket, mesg) =>
        session = @get_session mesg.session_uuid
        if session? and session.status == 'running'
            winston.debug("sage sessions: connect to the running session with id #{mesg.session_uuid}")
            client_socket.write_mesg('json', session.desc)
            plug(client_socket, session.socket)
            session.clients.push(client_socket)
        else
            winston.debug("make a connection to a new sage session.")
            get_port 'sage', (err, port) =>
                winston.debug("Got sage server port = #{port}")
                if err
                    winston.debug("can't determine sage server port; probably sage server not running")
                    client_socket.write_mesg('json', message.error(id:mesg.id, error:"problem determining port of sage server."))
                else
                    @_new_session(client_socket, mesg, port)

    _new_session: (client_socket, mesg, port, retries) =>
        winston.debug("_new_session: creating new sage session (retries=#{retries})")
        # Connect to port, send mesg, then hook sockets together.
        misc_node.connect_to_locked_socket
            port  : port
            token : secret_token
            cb    : (err, sage_socket) =>
                if err
                    winston.debug("_new_session: sage session denied connection: #{err}")
                    forget_port('sage')
                    if not retries? or retries <= 5
                        if not retries?
                            retries = 1
                        else
                            retries += 1
                        try_again = () =>
                            @_new_session(client_socket, mesg, port, retries)
                        setTimeout(try_again, 1000)
                    else
                        # give up.
                        client_socket.write_mesg('json', message.error(id:mesg.id, error:"local_hub -- Problem connecting to Sage server. -- #{err}"))
                    return
                else
                    winston.debug("Successfully unlocked a sage session connection.")

                winston.debug("Next, request a Sage session from sage_server.")

                misc_node.enable_mesg(sage_socket)
                sage_socket.write_mesg('json', message.start_session(type:'sage'))

                winston.debug("Waiting to read one JSON message back, which will describe the session.")
                sage_socket.once 'mesg', (type, desc) =>
                    winston.debug("Got message back from Sage server: #{json(desc)}")
                    client_socket.write_mesg('json', desc)
                    plug(client_socket, sage_socket)
                    # Finally, this socket is now connected to a sage server and ready to execute code.
                    @_sessions[mesg.session_uuid] =
                        socket     : sage_socket
                        desc       : desc
                        status     : 'running'
                        clients    : [client_socket]
                        project_id : mesg.project_id

                sage_socket.on 'end', () =>
                    # this is *NOT* dependable, since a segfaulted process -- and sage does that -- might
                    # not send a FIN.
                    winston.debug("sage_socket: session #{mesg.session_uuid} terminated.")
                    session = @_sessions[mesg.session_uuid]
                    # TODO: should we close client_socket here?
                    if session?
                        winston.debug("sage_socket: setting status of session #{mesg.session_uuid} to terminated.")
                        session.status = 'done'

    # Return object that describes status of all Sage sessions
    info: (project_id) =>
        obj = {}
        for id, session of @_sessions
            if session.project_id == project_id
                obj[id] =
                    desc    : session.desc
                    status  : session.status
        return obj

sage_sessions = new SageSessions()



############################################################################
#
# Differentially-Synchronized document editing sessions
#
# Here's a map                 YOU ARE HERE
#                                   |
#   [client]s.. ---> [hub] ---> [local hub] <--- [hub] <--- [client]s...
#                                   |
#                                  \|/
#                              [a file on disk]
#
#############################################################################

# The "live upstream content" of DiffSyncFile_client is the actual file on disk.
# # TODO: when applying diffs, we could use that the file is random access.  This is not done yet!
class DiffSyncFile_server extends diffsync.DiffSync
    constructor:(@cm_session, cb)  ->
        @path = @cm_session.path

        no_master    = undefined
        stats_path   = undefined
        stats        = undefined
        file         = undefined

        async.series([
            (cb) =>
                fs.stat @path, (_no_master, _stats_path) =>
                    no_master = _no_master
                    stats_path = _stats_path
                    cb()
            (cb) =>
                if no_master
                    # create
                    file = @path
                    misc_node.ensure_containing_directory_exists @path, (err) =>
                        if err
                            cb(err)
                        else
                            fs.open file, 'w', (err, fd) =>
                                if err
                                    cb(err)
                                else
                                    fs.close fd, cb
                else
                    # master exists
                    file = @path
                    stats = stats_path
                    cb()
            (cb) =>
                e = check_file_size(stats?.size)
                if e
                    cb(e)
                    return
                fs.readFile file, (err, data) =>
                    if err
                        cb(err); return
                    # NOTE: we immediately delete \r's since the client editor (Codemirror) immediately deletes them
                    # on editor creation; if we don't delete them, all sync attempts fail and hell is unleashed.
                    @init(doc:data.toString().replace(/\r/g,''), id:"file_server")
                    # winston.debug("got new file contents = '#{@live}'")
                    @_start_watching_file()
                    cb(err)

        ], (err) => cb(err, @live))

    kill: () =>
        if @_autosave?
            clearInterval(@_autosave)

        # be sure to clean this up, or -- after 11 times -- it will suddenly be impossible for
        # the user to open a file without restarting their project server! (NOT GOOD)
        fs.unwatchFile(@path, @_watcher)

    _watcher: (event) =>
        winston.debug("watch: file '#{@path}' modified.")
        if not @_do_watch
            winston.debug("watch: skipping read because watching is off.")
            return
        @_stop_watching_file()
        async.series([
            (cb) =>
                fs.stat @path, (err, stats) =>
                    if err
                        cb(err)
                    else
                        cb(check_file_size(stats.size))
            (cb) =>
                fs.readFile @path, (err, data) =>
                    if err
                        cb(err)
                    else
                        @live = data.toString().replace(/\r/g,'')  # NOTE: we immediately delete \r's (see above).
                        @cm_session.sync_filesystem(cb)
        ], (err) =>
            if err
                winston.debug("watch: file '#{@path}' error -- #{err}")
            @_start_watching_file()
        )

    _start_watching_file: () =>
        if @_do_watch?
            @_do_watch = true
            return
        @_do_watch = true
        winston.debug("watching #{@path}")
        fs.watchFile(@path, @_watcher)

    _stop_watching_file: () =>
        @_do_watch = false

    # NOTE: I tried using fs.watch as below, but *DAMN* -- even on
    # Linux 12.10 -- fs.watch in Node.JS totally SUCKS.  It led to
    # file corruption, weird flakiness and errors, etc.  fs.watchFile
    # above, on the other hand, is great for my needs (which are not
    # for immediate sync).
    # _start_watching_file0: () =>
    #     winston.debug("(re)start watching...")
    #     if @_fs_watcher?
    #         @_stop_watching_file()
    #     try
    #         @_fs_watcher = fs.watch(@path, @_watcher)
    #     catch e
    #         setInterval(@_start_watching_file, 15000)
    #         winston.debug("WARNING: failed to start watching '#{@path}' -- will try later -- #{e}")

    # _stop_watching_file0: () =>
    #     if @_fs_watcher?
    #         @_fs_watcher.close()
    #         delete @_fs_watcher

    snapshot: (cb) =>  # cb(err, snapshot of live document)
        cb(false, @live)

    _apply_edits_to_live: (edits, cb) =>
        if edits.length == 0
            cb(); return
        @_apply_edits edits, @live, (err, result) =>
            if err
                cb(err)
            else
                if result == @live
                    cb()  # nothing to do
                else
                    @live = result
                    @write_to_disk(cb)

    write_to_disk: (cb) =>
        @_stop_watching_file()
        ensure_containing_directory_exists @path, (err) =>
            if err
                cb?(err); return
            fs.writeFile @path, @live, (err) =>
                @_start_watching_file()
                cb?(err)


# The live content of DiffSyncFile_client is our in-memory buffer.
class DiffSyncFile_client extends diffsync.DiffSync
    constructor:(@server) ->
        super(doc:@server.live, id:"file_client")
        # Connect the two together
        @connect(@server)
        @server.connect(@)

# The CodeMirrorDiffSyncHub class represents a downstream
# remote client for this local hub.  There may be dozens of these.
# The local hub has no upstream server, except the on-disk file itself.
#
# NOTE: These have *nothing* a priori to do with CodeMirror -- the name is
# historical and should be changed. TODO.
#
class CodeMirrorDiffSyncHub
    constructor : (@socket, @session_uuid, @client_id) ->

    write_mesg: (event, obj) =>
        if not obj?
            obj = {}
        obj.session_uuid = @session_uuid
        mesg = message['codemirror_' + event](obj)
        mesg.client_id = @client_id
        @socket.write_mesg 'json', mesg

    recv_edits : (edit_stack, last_version_ack, cb) =>
        @write_mesg 'diffsync',
            id               : @current_mesg_id
            edit_stack       : edit_stack
            last_version_ack : last_version_ack
        cb?()

    sync_ready: () =>
        @write_mesg('diffsync_ready')


class CodeMirrorSession
    constructor: (mesg, cb) ->
        @path = mesg.path
        @session_uuid = mesg.session_uuid
        dbg = @dbg("constructor(path='#{@path}',session_uuid='#{@session_uuid}')")
        dbg("creating session defined by #{misc.to_json(mesg)}")
        @_sage_output_cb = {}
        @_sage_output_to_input_id = {}

        # The downstream clients of this local hub -- these are global hubs that proxy requests on to browser clients
        @diffsync_clients = {}
        dbg("working directory: #{process.cwd()}")

        async.series([
            (cb) =>
                dbg("if file doesn't exist, try to create it.")
                fs.exists @path, (exists) =>
                    if exists
                        dbg("file exists")
                        cb()
                    else
                        dbg("try to create file")
                        fs.open @path,'w', (err, fd) =>
                            if err
                                cb(err)
                            else
                                fs.close(fd, cb)
            (cb) =>
                if @path.indexOf('.snapshots/') != -1
                    dbg("in snapshots path, so setting to readonly")
                    @readonly = true
                    cb()
                else
                    dbg("check if file is readonly")
                    misc_node.is_file_readonly
                        path : @path
                        cb   : (err, readonly) =>
                            dbg("readonly got: #{err}, #{readonly}")
                            @readonly = readonly
                            cb(err)
            (cb) =>
                # If this is a non-readonly sagews file, create corresponding sage session.
                if not @readonly and misc.filename_extension_notilde(@path) == 'sagews'
                    @process_new_content = @sage_update
                    @sage_socket(cb)
                else
                    cb()
            (cb) =>
                # The *actual* file on disk.  It's important to create this
                # after successfully getting the sage socket, since if we fail to
                # get the sage socket we end up creating too many fs.watch's on this file...
                @diffsync_fileserver = new DiffSyncFile_server @, (err, content) =>
                    if err
                        cb(err); return
                    @content = content
                    @diffsync_fileclient = new DiffSyncFile_client(@diffsync_fileserver)

                    # worksheet freshly loaded from disk -- now ensure no cells appear to be running
                    # except for the auto cells that we spin up running.
                    @sage_update(kill:true, auto:true)
                    @_set_content_and_sync()

                    cb()
        ], (err) => cb?(err, @))

    dbg: (f) ->
        return (m) -> winston.debug("CodeMirrorSession.#{f}: #{m}")

    ##############################
    # Sage execution related code
    ##############################
    sage_socket: (cb) =>  # cb(err, socket)
        if @_sage_socket?
            try
                process.kill(@_sage_socket.pid, 0)
                # process is still running fine
                cb(false, @_sage_socket)
                return
            catch e
                # sage process is dead.
                @_sage_socket = undefined

        winston.debug("sage_socket: initalize the newly started sage process")

        # If we've already loaded the worksheet, then ensure
        # that no cells appear to be running.  This is important
        # because the worksheet file that we just loaded could have had some
        # markup that cells are running.
        if @diffsync_fileclient?
            @sage_update(kill:true)

        winston.debug("sage_socket: connecting to the local Sage server....")
        get_sage_socket (err, socket) =>
            if err
                winston.debug("sage_socket: fail -- #{err}.")
                cb(err)
            else
                winston.debug("sage_socket: successfully opened a Sage session for worksheet '#{@path}'")
                @_sage_socket = socket

                # Set path to be the same as the file.
                mesg = message.execute_code
                    id       : misc.uuid()
                    code     : "os.chdir(salvus.data['path']);__file__=salvus.data['file']"
                    data     : {path: misc.path_split(@path).head, file:abspath(@path)}
                    preparse : false
                socket.write_mesg('json', mesg)

                socket.on 'end', () =>
                    @_sage_socket = undefined
                    winston.debug("codemirror session #{@session_uuid} sage socket terminated.")

                socket.on 'mesg', (type, mesg) =>
                    #winston.debug("sage session: received message #{type}, #{misc.to_json(mesg)}")
                    switch type
                        when 'blob'
                            sha1 = mesg.uuid
                            if @diffsync_clients.length == 0
                                error = 'no global hubs are connected to the local hub, so nowhere to send file'
                                winston.debug("codemirror session: got blob from sage session -- #{error}")
                                resp =  message.save_blob
                                    error  : error
                                    sha1   : sha1
                                socket.write_mesg('json', resp)
                            else
                                winston.debug("codemirror session: got blob from sage session -- forwarding to a random hub")
                                hub = misc.random_choice_from_obj(@diffsync_clients)
                                client_id = hub[0]; ds_client = hub[1]
                                mesg.client_id = client_id
                                ds_client.remote.socket.write_mesg('blob', mesg)

                                receive_save_blob_message
                                    sha1 : sha1
                                    cb   : (resp) -> socket.write_mesg('json', resp)

                                ## DEBUG -- for testing purposes -- simulate the response message
                                ## handle_save_blob_message(message.save_blob(sha1:sha1,ttl:1000))


                        when 'json'
                            # First check for callbacks (e.g., used in interact and things where the
                            # browser directly asks to evaluate code in this session).
                            c = @_sage_output_cb[mesg.id]
                            if c?
                                c(mesg)
                                if mesg.done
                                    delete @_sage_output_cb[mesg.id]
                                return

                            # Handle code execution in browser messages
                            if mesg.event == 'execute_javascript'
                                # winston.debug("got execute_javascript message from sage session #{json(mesg)}")
                                # Wrap and forward it on as a broadcast message.
                                mesg.session_uuid = @session_uuid
                                bcast = message.codemirror_bcast
                                    session_uuid : @session_uuid
                                    mesg         : mesg
                                @client_bcast(undefined, bcast)
                                return

                            # Finally, handle output messages
                            m = {}
                            for x, y of mesg
                                if x != 'id' and x != 'event'  # the event is always "output"
                                    if x == 'done'   # don't bother with done=false
                                        if y
                                            m[x] = y
                                    else
                                        m[x] = y

                            #winston.debug("sage --> local_hub: '#{json(mesg)}'")

                            before = @content
                            @sage_output_mesg(mesg.id, m)
                            if before != @content
                                @_set_content_and_sync()

                # If we've already loaded the worksheet, submit all auto cells to be evaluated.
                if @diffsync_fileclient?
                    @sage_update(auto:true)

                cb(false, @_sage_socket)

    _set_content_and_sync: () =>
        if @set_content(@content)
            # Content actually changed, so suggest to all connected clients to sync.
            for id, ds_client of @diffsync_clients
                ds_client.remote.sync_ready()

    sage_execute_cell: (id) =>
        winston.debug("exec request for cell with id: '#{id}'")
        @sage_remove_cell_flag(id, diffsync.FLAGS.execute)
        {code, output_id} = @sage_initialize_cell_for_execute(id)
        winston.debug("exec code '#{code}'; output id='#{output_id}'")

        #if diffsync.FLAGS.auto in @sage_get_cell_flagstring(id) and 'auto' not in code
        #@sage_remove_cell_flag(id, diffsync.FLAGS.auto)

        @set_content(@content)
        if code != ""
            @_sage_output_to_input_id[output_id] = id
            winston.debug("start running -- #{id}")

            # Change the cell to "running" mode - this doesn't generate output, so we must explicit force clients
            # to sync.
            @sage_set_cell_flag(id, diffsync.FLAGS.running)
            @sage_set_cell_flag(id, diffsync.FLAGS.this_session)
            @_set_content_and_sync()

            @sage_socket (err, socket) =>
                if err
                    winston.debug("Error getting sage socket: #{err}")
                    @sage_output_mesg(output_id, {stderr: "Error getting sage socket (unable to execute code): #{err}"})
                    @sage_remove_cell_flag(id, diffsync.FLAGS.running)
                    return
                winston.debug("Sending execute message to sage socket.")
                socket.write_mesg 'json',
                    message.execute_code
                        id       : output_id
                        cell_id  : id         # extra info -- which cell is running
                        code     : code
                        preparse : true

    # Execute code in the Sage session associated to this sync'd editor session
    sage_execute_code: (client_socket, mesg) =>
        #winston.debug("sage_execute_code '#{misc.to_json(mesg)}")
        client_id = mesg.client_id

        if mesg.output_uuid?
            output_line = diffsync.MARKERS.output
            append_message = (resp) =>
                i = @content.indexOf(diffsync.MARKERS.output + mesg.output_uuid)
                #winston.debug("sage_execute_code: append_message i=#{i}, thing='#{diffsync.MARKERS.output+mesg.output_uuid}', @content='#{@content}'")
                if i == -1  # no cell anymore
                    return
                i = i + 37
                n = @content.indexOf('\n', i)
                #winston.debug("sage_execute_code: append_message n=#{n}")
                if n == -1   # corrupted
                    return
                output_line += misc.to_json(misc.copy_without(resp, ['id', 'client_id', 'event'])) + diffsync.MARKERS.output
                #winston.debug("sage_execute_code: i=#{i}, n=#{n}, output_line.length=#{output_line.length}, output_line='#{output_line}'")
                if output_line.length > n - i
                    #winston.debug("sage_execute_code: initiating client didn't maintain sync promptly. fixing")
                    x = @content.slice(0, i)
                    @content = x + output_line + @content.slice(n)
                    if resp.done
                        j = x.lastIndexOf(diffsync.MARKERS.cell)
                        if j != -1
                            j = x.lastIndexOf('\n', j)
                            cell_id = x.slice(j+2, j+38)
                            @sage_remove_cell_flag(cell_id, diffsync.FLAGS.running)
                    @_set_content_and_sync()

        @_sage_output_cb[mesg.id] = (resp) =>
            #winston.debug("sage_execute_code -- got output: #{misc.to_json(resp)}")
            if mesg.output_uuid?
                setTimeout((=>append_message(resp)), 5000)
            # tag response for the client who requested it
            resp.client_id = client_id
            # send response
            client_socket.write_mesg('json', resp)

        @sage_socket (err, socket) =>
            #winston.debug("sage_execute_code: #{misc.to_json(err)}, #{socket}")
            if err
                #winston.debug("Error getting sage socket: #{err}")
                resp = message.output(stderr: "Error getting sage socket (unable to execute code): #{err}", done:true)
                client_socket.write_mesg('json', resp)
            else
                #winston.debug("sage_execute_code: writing request message -- #{misc.to_json(mesg)}")
                mesg.event = 'execute_code'   # event that sage session understands
                socket.write_mesg('json', mesg)

    sage_raw_input: (client_socket, mesg) =>
        winston.debug("sage_raw_input '#{misc.to_json(mesg)}")
        @sage_socket (err, socket) =>
            if err
                winston.debug("sage_raw_input: error getting sage socket -- #{err}")
            else
                socket.write_mesg('json', mesg)

    sage_call: (opts) =>
        opts = defaults opts,
            mesg : required
            cb   : undefined

        f = (resp) =>
            opts.cb?(false, resp)
            delete @_sage_output_cb[opts.mesg.id]   # exactly one response

        @sage_socket (err, socket) =>
            if err
                opts.cb?("error getting sage socket -- #{err}")
            else
                @_sage_output_cb[opts.mesg.id] = f
                socket.write_mesg('json', opts.mesg)

    sage_introspect: (client_socket, mesg) =>
        mesg.event = 'introspect' # event that sage session understand
        @sage_call
            mesg : mesg
            cb : (err, resp) =>
                if err
                    resp = message.error(error:"Error getting sage socket (unable to introspect): #{err}")
                    client_socket.write_mesg('json', resp)
                else
                    client_socket.write_mesg('json', resp)

    send_signal_to_sage_session: (client_socket, mesg) =>
        if @_sage_socket?
            process_kill(@_sage_socket.pid, mesg.signal)
        if mesg.id? and client_socket?
            client_socket.write_mesg('json', message.signal_sent(id:mesg.id))

    restart: (client_socket, mesg) =>
        winston.debug("sage_session.restart")
        if @_sage_socket?
            winston.debug("sage_session.restart: killing old process")
            process_kill(@_sage_socket.pid, 0)
            delete @_sage_socket
        winston.debug("sage_session.restart: getting new socket")
        @sage_socket (err) =>
            if err
                winston.debug("sage_session.restart: got it but err -- #{err}")
                client_socket.write_mesg('json', message.error(id:mesg.id, error:err))
            else
                winston.debug("sage_session.restart: got it success")
                client_socket.write_mesg('json', message.success(id:mesg.id))

    sage_update: (opts={}) =>
        opts = defaults opts,
            kill : false    # if true, remove all running flags and all this_session flags
            auto : false    # if true, run all cells that have the auto flag set
        if not @content?  # document not initialized
            return
        # Here we:
        #    - scan the string @content for execution requests.
        #    - also, if we see a cell UUID that we've seen already, we randomly generate
        #      a new cell UUID; clients can annoyingly generate non-unique UUID's (e.g., via
        #      cut and paste) so we fix that.
        winston.debug("sage_update")#: opts=#{misc.to_json(opts)}")
        i = 0
        prev_ids = {}
        z = 0
        while true
            z += 1
            if z > 5000
                winston.debug("sage_update: ERROR -- hit a possible infinite loop; opts=#{misc.to_json(opts)}")
                break
            i = @content.indexOf(diffsync.MARKERS.cell, i)
            if i == -1
                break
            j = @content.indexOf(diffsync.MARKERS.cell, i+1)
            if j == -1
                break  # corrupt and is the last one, so not a problem.
            id  = @content.slice(i+1,i+37)
            if misc.is_valid_uuid_string(id)

                # if id isn't valid -- due to document corruption or a bug, just skip it rather than get into all kinds of trouble.
                # TODO: repair.

                if prev_ids[id]?
                    # oops, repeated "unique" id, so fix it.
                    id = uuid.v4()
                    @content = @content.slice(0,i+1) + id + @content.slice(i+37)
                    # Also, if 'r' in the flags for this cell, remove it since it
                    # can't possibly be already running (given the repeat).
                    flags = @content.slice(i+37, j)
                    if diffsync.FLAGS.running in flags
                        new_flags = ''
                        for t in flags
                            if t != diffsync.FLAGS.running
                                new_flags += t
                        @content = @content.slice(0,i+37) + new_flags + @content.slice(j)

                prev_ids[id] = true
                flags = @content.slice(i+37, j)
                if opts.kill or opts.auto
                    if opts.kill
                        # worksheet process just killed, so clear certain flags.
                        new_flags = ''
                        for t in flags
                            if t != diffsync.FLAGS.running and t != diffsync.FLAGS.this_session
                                new_flags += t
                        #winston.debug("sage_update: kill=true, so changing flags from '#{flags}' to '#{new_flags}'")
                        if flags != new_flags
                            @content = @content.slice(0,i+37) + new_flags + @content.slice(j)
                    if opts.auto and diffsync.FLAGS.auto in flags
                        # worksheet process being restarted, so run auto cells
                        @sage_remove_cell_flag(id, diffsync.FLAGS.auto)
                        @sage_execute_cell(id)
                else if diffsync.FLAGS.execute in flags
                    # normal execute
                    @sage_execute_cell(id)

            # set i to next position after end of line that contained flag we just considered;
            # above code may have added flags to this line (but won't have added anything before this line).
            i = @content.indexOf('\n',j + 1)
            if i == -1
                break


    sage_output_mesg: (output_id, mesg) =>
        cell_id = @_sage_output_to_input_id[output_id]
        #winston.debug("output_id=#{output_id}; cell_id=#{cell_id}; map=#{misc.to_json(@_sage_output_to_input_id)}")

        if mesg.hide?
            # Hide a single component (also, do not record the message itself in the
            # document, just its impact).
            flag = undefined
            if mesg.hide == 'input'
                flag = diffsync.FLAGS.hide_input
            else if mesg.hide == 'output'
                flag = diffsync.FLAGS.hide_output
            if flag?
                @sage_set_cell_flag(cell_id, flag)
            else
                winston.debug("invalid hide component: '#{mesg.hide}'")
            delete mesg.hide

        if mesg.show?
            # Show a single component of cell.
            flag = undefined
            if mesg.show == 'input'
                flag = diffsync.FLAGS.hide_input
            else if mesg.show == 'output'
                flag = diffsync.FLAGS.hide_output
            if flag?
                @sage_remove_cell_flag(cell_id, flag)
            else
                winston.debug("invalid hide component: '#{mesg.hide}'")
            delete mesg.show

        if mesg.auto?
            # set or unset whether or not cell is automatically executed on startup of worksheet
            if mesg.auto
                @sage_set_cell_flag(cell_id, diffsync.FLAGS.auto)
            else
                @sage_remove_cell_flag(cell_id, diffsync.FLAGS.auto)

        if mesg.done? and mesg.done and cell_id?
            @sage_remove_cell_flag(cell_id, diffsync.FLAGS.running)
            delete @_sage_output_to_input_id[output_id]
            delete mesg.done # not needed
            if /^\s\s*/.test(mesg.stdout)   # final whitespace not needed for proper display
                delete mesg.stdout
            if /^\s\s*/.test(mesg.stderr)
                delete mesg.stderr

        if misc.is_empty_object(mesg)
            return

        if mesg.once? and mesg.once
            # only javascript is define  once=True
            if mesg.javascript?
                msg = message.execute_javascript
                    session_uuid : @session_uuid
                    code         : mesg.javascript.code
                    coffeescript : mesg.javascript.coffeescript
                    obj          : mesg.obj
                    cell_id      : cell_id
                bcast = message.codemirror_bcast
                    session_uuid : @session_uuid
                    mesg         : msg
                @client_bcast(undefined, bcast)
                return  # once = do *not* want to record this message in the output stream.

        i = @content.indexOf(diffsync.MARKERS.output + output_id)
        if i == -1
            # no such output cell anymore -- ignore (?) -- or we could make such a cell...?
            winston.debug("WORKSHEET: no such output cell (ignoring) -- #{output_id}")
            return
        n = @content.indexOf('\n', i)
        if n == -1
            winston.debug("WORKSHEET: output cell corrupted (ignoring) -- #{output_id}")
            return

        if mesg.clear?
            # delete all output server side
            k = i + (diffsync.MARKERS.output + output_id).length + 1
            @content = @content.slice(0, k) + @content.slice(n)
            return

        if mesg.delete_last?
            k = @content.lastIndexOf(diffsync.MARKERS.output, n-2)
            @content = @content.slice(0, k+1) + @content.slice(n)
            return

        @content = @content.slice(0,n) + JSON.stringify(mesg) + diffsync.MARKERS.output + @content.slice(n)

    sage_find_cell_meta: (id, start) =>
        i = @content.indexOf(diffsync.MARKERS.cell + id, start)
        j = @content.indexOf(diffsync.MARKERS.cell, i+1)
        if j == -1
            return undefined
        return {start:i, end:j}

    sage_get_cell_flagstring: (id) =>
        pos = @sage_find_cell_meta(id)
        return @content.slice(pos.start+37, pos.end)

    sage_set_cell_flagstring: (id, flags) =>
        pos = @sage_find_cell_meta(id)
        if pos?
            @content = @content.slice(0, pos.start+37) + flags + @content.slice(pos.end)

    sage_set_cell_flag: (id, flag) =>
        s = @sage_get_cell_flagstring(id)
        if flag not in s
            @sage_set_cell_flagstring(id, flag + s)

    sage_remove_cell_flag: (id, flag) =>
        s = @sage_get_cell_flagstring(id)
        if flag in s
            s = s.replace(new RegExp(flag, "g"), "")
            @sage_set_cell_flagstring(id, s)

    sage_initialize_cell_for_execute: (id, start) =>   # start is optional, but can speed finding cell
        # Initialize the line of the document for output for the cell with given id.
        # We do this by finding where that cell starts, then searching for the start
        # of the next cell, deleting any output lines in between, and placing one new line
        # for output.  This function returns
        #   - output_id: a newly created id that identifies the new output line.
        #   - code: the string of code that will be executed by Sage.
        # Or, it returns undefined if there is no cell with this id.
        cell_start = @content.indexOf(diffsync.MARKERS.cell + id, start)
        if cell_start == -1
            # there is now no cell with this id.
            return

        code_start = @content.indexOf(diffsync.MARKERS.cell, cell_start+1)
        if code_start == -1
            # TODO: cell is mangled: would need to fix...?
            return

        newline = @content.indexOf('\n', cell_start)  # next newline after cell_start
        next_cell = @content.indexOf(diffsync.MARKERS.cell, code_start+1)
        if newline == -1
            # At end of document: append a newline to end of document; this is where the output will go.
            # This is a very common special case; it's what we would get typing "2+2[shift-enter]"
            # into a blank worksheet.
            output_start = @content.length # position where the output will start
            # Put some extra newlines in, since it is hard to put input at the bottom of the screen.
            @content += '\n\n\n\n\n'
            winston.debug("Add a new input cell at the very end (which will be after the output).")
        else
            while true
                next_cell_start = @content.indexOf(diffsync.MARKERS.cell, newline)
                if next_cell_start == -1
                    # This is the last cell, so we end the cell after the last line with no whitespace.
                    next_cell_start = @content.search(/\s+$/)
                    if next_cell_start == -1
                        next_cell_start = @content.length+1
                        @content += '\n\n\n\n\n'
                    else
                        while next_cell_start < @content.length and @content[next_cell_start]!='\n'
                            next_cell_start += 1
                        if @content[next_cell_start]!='\n'
                            @content += '\n\n\n\n\n'
                        next_cell_start += 1
                output = @content.indexOf(diffsync.MARKERS.output, newline)
                if output == -1 or output > next_cell_start
                    # no more output lines to delete
                    output_start = next_cell_start  # this is where the output line will start
                    break
                else
                    # delete the line of output we just found
                    output_end = @content.indexOf('\n', output+1)
                    @content = @content.slice(0, output) + @content.slice(output_end+1)
        code = @content.slice(code_start+1, output_start)
        output_id = uuid.v4()
        if output_start > 0 and @content[output_start-1] != '\n'
            output_insert = '\n'
        else
            output_insert = ''
        output_insert += diffsync.MARKERS.output + output_id + diffsync.MARKERS.output + '\n'
        if next_cell == -1
            # There is no next cell.
            output_insert += diffsync.MARKERS.cell + uuid.v4() + diffsync.MARKERS.cell + '\n'
        @content = @content.slice(0, output_start) + output_insert + @content.slice(output_start)
        return {code:code.trim(), output_id:output_id}


    ##############################

    kill: () =>
        # Put any cleanup here...
        winston.debug("Killing session #{@session_uuid}")
        @sync_filesystem () =>
            @diffsync_fileserver.kill()
            # TODO: Are any of these deletes needed?  I don't know.
            delete @content
            delete @diffsync_fileclient
            delete @diffsync_fileserver
        if @_sage_socket?
            # send FIN packet so that Sage process may terminate naturally
            @_sage_socket.end()
            # ... then, brutally kill it if need be (a few seconds later). :-)
            if @_sage_socket.pid?
                setTimeout( (() => process_kill(@_sage_socket.pid, 9)), 3000 )

    set_content: (value) =>
        @is_active = true
        changed = false
        if @content != value
            @content = value
            changed = true

        if @diffsync_fileclient.live != value
            @diffsync_fileclient.live = value
            changed = true
        for id, ds_client of @diffsync_clients
            if ds_client.live != value
                changed = true
                ds_client.live = value
        return changed

    client_bcast: (socket, mesg) =>
        @is_active = true
        winston.debug("client_bcast: #{json(mesg)}")

        # Forward this message on to all global hubs except the
        # one that just sent it to us...
        client_id = mesg.client_id
        for id, ds_client of @diffsync_clients
            if client_id != id
                mesg.client_id = id
                #winston.debug("BROADCAST: sending message from hub with socket.id=#{socket?.id} to hub with socket.id = #{id}")
                ds_client.remote.socket.write_mesg('json', mesg)

    client_diffsync: (socket, mesg) =>
        @is_active = true

        write_mesg = (event, obj) ->
            if not obj?
                obj = {}
            obj.id = mesg.id
            socket.write_mesg 'json', message[event](obj)

        # Message from some client reporting new edits, thus initiating a sync.
        ds_client = @diffsync_clients[mesg.client_id]

        if not ds_client?
            write_mesg('error', {error:"client #{mesg.client_id} not registered for synchronization"})
            return

        if @_client_sync_lock # or Math.random() <= .5 # (for testing)
            winston.debug("client_diffsync hit a click_sync_lock -- send retry message back")
            write_mesg('error', {error:"retry"})
            return

        if @_filesystem_sync_lock
            if @_filesystem_sync_lock < new Date()
                @_filesystem_sync_lock = false
            else
                winston.debug("client_diffsync hit a filesystem_sync_lock -- send retry message back")
                write_mesg('error', {error:"retry"})
                return

        @_client_sync_lock = true
        before = @content
        ds_client.recv_edits    mesg.edit_stack, mesg.last_version_ack, (err) =>  # TODO: why is this err ignored?
            @set_content(ds_client.live)
            @_client_sync_lock = false
            @process_new_content?()
            # Send back our own edits to the global hub.
            ds_client.remote.current_mesg_id = mesg.id  # used to tag the return message
            ds_client.push_edits (err) =>
                if err
                    winston.debug("CodeMirrorSession -- client push_edits returned -- #{err}")
                else
                    changed = (before != @content)
                    if changed
                        # We also suggest to other clients to update their state.
                        @tell_clients_to_update(mesg.client_id)
                        @update_revision_tracking()

    tell_clients_to_update: (exclude) =>
        for id, ds_client of @diffsync_clients
            if exclude != id
                ds_client.remote.sync_ready()

    sync_filesystem: (cb) =>
        @is_active = true

        if @_client_sync_lock # or Math.random() <= .5 # (for testing)
            winston.debug("sync_filesystem -- hit client sync lock")
            cb?("cannot sync with filesystem while syncing with clients")
            return
        if @_filesystem_sync_lock
            if @_filesystem_sync_lock < new Date()
                @_filesystem_sync_lock = false
            else
                winston.debug("sync_filesystem -- hit filesystem sync lock")
                cb?("cannot sync with filesystem; already syncing")
                return


        before = @content
        if not @diffsync_fileclient?
            cb?("filesystem sync object (@diffsync_fileclient) no longer defined")
            return

        @_filesystem_sync_lock = expire_time(10)  # lock expires in 10 seconds no matter what -- uncaught exception could require this
        @diffsync_fileclient.sync (err) =>
            if err
                # Example error: 'reset -- checksum mismatch (29089 != 28959)'
                winston.debug("@diffsync_fileclient.sync -- returned an error -- #{err}")
                @diffsync_fileserver.kill() # stop autosaving and watching files
                # Completely recreate diffsync file connection and try to sync once more.
                @diffsync_fileserver = new DiffSyncFile_server @, (err, ignore_content) =>
                    if err
                        winston.debug("@diffsync_fileclient.sync -- making new server failed: #{err}")
                        @_filesystem_sync_lock = false
                        cb?(err); return
                    @diffsync_fileclient = new DiffSyncFile_client(@diffsync_fileserver)
                    @diffsync_fileclient.live = @content
                    @diffsync_fileclient.sync (err) =>
                        if err
                            winston.debug("@diffsync_fileclient.sync -- making server worked but re-sync failed -- #{err}")
                            @_filesystem_sync_lock = false
                            cb?("codemirror fileclient sync error -- '#{err}'")
                        else
                            @_filesystem_sync_lock = false
                            cb?()
                return

            if @diffsync_fileclient.live != @content
                @set_content(@diffsync_fileclient.live)
                # recommend all clients sync
                for id, ds_client of @diffsync_clients
                    ds_client.remote.sync_ready()
            @_filesystem_sync_lock = false
            cb?()

    add_client: (socket, client_id) =>
        @is_active = true
        ds_client = new diffsync.DiffSync(doc:@content)
        ds_client.connect(new CodeMirrorDiffSyncHub(socket, @session_uuid, client_id))
        @diffsync_clients[client_id] = ds_client

        winston.debug("CodeMirrorSession(#{@path}).add_client(client_id=#{client_id}) -- now we have #{misc.len(@diffsync_clients)} clients.")

        # Ensure we do not broadcast to a hub if it has already disconnected.
        socket.on 'end', () =>
            winston.debug("DISCONNECT: socket connection #{socket.id} from global hub disconected.")
            delete @diffsync_clients[client_id]

    remove_client: (socket, client_id) =>
        delete @diffsync_clients[client_id]

    write_to_disk: (socket, mesg) =>
        @is_active = true
        winston.debug("write_to_disk: #{json(mesg)} -- calling sync_filesystem")
        @sync_filesystem (err) =>
            if err
                resp = message.error(id:mesg.id, error:"Error writing file '#{@path}' to disk -- #{err}")
            else
                resp = message.codemirror_wrote_to_disk(id:mesg.id, hash:misc.hash_string(@content))
            socket.write_mesg('json', resp)

    read_from_disk: (socket, mesg) =>
        async.series([
            (cb) =>
                fs.stat (err, stats) =>
                    if err
                        cb(err)
                    else
                        cb(check_file_size(stats.size))
            (cb) =>
                fs.readFile @path, (err, data) =>
                    if err
                        cb("Error reading file '#{@path}' from disk -- #{err}")
                    else
                        value = data.toString()
                        if value != @content
                            @set_content(value)
                            # Tell the global hubs that now might be a good time to do a sync.
                            for id, ds of @diffsync_clients
                                ds.remote.sync_ready()
                        cb()

        ], (err) =>
            if err
                socket.write_mesg('json', message.error(id:mesg.id, error:err))
            else
                socket.write_mesg('json', message.success(id:mesg.id))
        )

    get_content: (socket, mesg) =>
        @is_active = true
        socket.write_mesg('json', message.codemirror_content(id:mesg.id, content:@content))

    # enable or disable tracking all revisions of the document
    revision_tracking: (socket, mesg) =>
        winston.debug("revision_tracking for #{@path}: #{mesg.enable}")
        d = (m) -> winston.debug("revision_tracking for #{@path}: #{m}")
        if mesg.enable
            d("enable it")
            if @revision_tracking_doc?
                d("already enabled")
                # already enabled
                socket.write_mesg('json', message.success(id:mesg.id))
            else
                if @readonly
                    # nothing to do -- silently don't enable (is this a good choice?)
                    socket.write_mesg('json', message.success(id:mesg.id))
                    return
                # need to enable
                d("need to enable")
                codemirror_sessions.connect
                    mesg :
                        path       : revision_tracking_path(@path)
                        project_id : INFO.project_id      # todo -- won't need in long run
                    cb   : (err, session) =>
                        d("got response -- #{err}")
                        if err
                            socket.write_mesg('json', message.error(id:mesg.id, error:err))
                        else
                            @revision_tracking_doc = session
                            socket.write_mesg('json', message.success(id:mesg.id))
                            @update_revision_tracking()

        else
            d("disable it")
            delete @revision_tracking_doc
            socket.write_mesg('json', message.success(id:mesg.id))

    # If we are tracking the revision history of this file, add a new entry in that history.
    # TODO: add user responsibile for this change as input to this function and as
    # a field in the entry object below.   NOTE: Be sure to include "changing the file on disk"
    # as one of the users, which is *NOT* defined by an account_id.
    update_revision_tracking: () =>
        if not @revision_tracking_doc?
            return
        winston.debug("update revision tracking data - #{@path}")

        # @revision_tracking_doc.HEAD is the last version of the document we're tracking, as a string.
        # In particular, it is NOT in JSON format.

        if not @revision_tracking_doc.HEAD?

            # Initialize HEAD from the file

            if @revision_tracking_doc.content.length == 0
                # brand new -- first time.
                @revision_tracking_doc.HEAD = @content
                @revision_tracking_doc.content = misc.to_json(@content)
            else
                # we have tracked this file before.
                i = @revision_tracking_doc.content.indexOf('\n')
                if i == -1
                    # weird special case: there's no history yet -- just the initial version
                    @revision_tracking_doc.HEAD = misc.from_json(@revision_tracking_doc.content)
                else
                    # there is a potential longer history; this initial version is the first line:
                    @revision_tracking_doc.HEAD = misc.from_json(@revision_tracking_doc.content.slice(0,i))

        if @revision_tracking_doc.HEAD != @content
            # compute diff that transforms @revision_tracking_doc.HEAD to @content
            patch = diffsync.dmp.patch_make(@content, @revision_tracking_doc.HEAD)
            @revision_tracking_doc.HEAD = @content

            # replace the file by new version that has first line equal to JSON version of HEAD,
            # and rest all the patches, with our one new patch inserted at the front.
            # TODO: redo without doing a split for efficiency.
            i = @revision_tracking_doc.content.indexOf('\n')
            entry = {patch:diffsync.compress_patch(patch), time:new Date() - 0}
            @revision_tracking_doc.content = misc.to_json(@content) + '\n' + \
                        misc.to_json(entry) + \
                        (if i != -1 then @revision_tracking_doc.content.slice(i) else "")

        # now tell everybody
        @revision_tracking_doc._set_content_and_sync()

        # save the revision tracking file to disk (but not too frequently)
        if not @revision_tracking_save_timer?
            f = () =>
                delete @revision_tracking_save_timer
                @revision_tracking_doc.sync_filesystem()
            @revision_tracking_save_timer = setInterval(f, REVISION_TRACKING_SAVE_INTERVAL)

# Collection of all CodeMirror sessions hosted by this local_hub.

class CodeMirrorSessions
    constructor: () ->
        @_sessions = {by_uuid:{}, by_path:{}, by_project:{}}

    dbg: (f) =>
        return (m) -> winston.debug("CodeMirrorSessions.#{f}: #{m}")

    connect: (opts) =>
        opts = defaults opts,
            client_socket : undefined
            mesg          : required    # event of type codemirror_get_session
            cb            : undefined   # cb?(err, session)
        dbg = @dbg("connect")
        mesg = opts.mesg
        dbg(misc.to_json(mesg))
        finish = (session) ->
            if not opts.client_socket?
                return
            session.add_client(opts.client_socket, mesg.client_id)
            opts.client_socket.write_mesg 'json', message.codemirror_session
                id           : mesg.id,
                session_uuid : session.session_uuid
                path         : session.path
                content      : session.content
                readonly     : session.readonly

        if mesg.session_uuid?
            dbg("getting session using session_uuid")
            session = @_sessions.by_uuid[mesg.session_uuid]
            if session?
                finish(session)
                opts.cb?(undefined, session)
                return

        if mesg.path?
            dbg("getting session using path")
            session = @_sessions.by_path[mesg.path]
            if session?
                finish(session)
                opts.cb?(undefined, session)
                return

        mesg.session_uuid = uuid.v4()
        new CodeMirrorSession mesg, (err, session) =>
            if err
                opts.client_socket?.write_mesg('json', message.error(id:mesg.id, error:err))
                opts.cb?(err)
            else
                @add_session_to_cache
                    session    : session
                    project_id : mesg.project_id
                    timeout    : 3600   # time in seconds (or undefined to not use timer)
                finish(session)
                opts.cb?(undefined, session)

    add_session_to_cache: (opts) =>
        opts = defaults opts,
            session    : required
            project_id : undefined
            timeout    : undefined   # or a time in seconds
        winston.debug("Adding session #{opts.session.session_uuid} (of project #{opts.project_id}) to cache.")
        @_sessions.by_uuid[opts.session.session_uuid] = opts.session
        @_sessions.by_path[opts.session.path] = opts.session
        if opts.project_id?
            if not @_sessions.by_project[opts.project_id]?
                @_sessions.by_project[opts.project_id] = {}
            @_sessions.by_project[opts.project_id][opts.session.path] = opts.session

        destroy = () =>
            opts.session.kill()
            delete @_sessions.by_uuid[opts.session.session_uuid]
            delete @_sessions.by_path[opts.session.path]
            x =  @_sessions.by_project[opts.project_id]
            if x?
                delete x[opts.session.path]

        if opts.timeout?
            destroy_if_inactive = () =>
                if not (opts.session.is_active? and opts.session.is_active)
                    winston.debug("Session #{opts.session.session_uuid} is inactive for #{opts.timeout} seconds; killing.")
                    destroy()
                else
                    opts.session.is_active = false  # it must be changed by the session before the next timer.
                    # We use setTimeout instead of setInterval, because we want to *ensure* that the
                    # checks are spaced out over at *least* opts.timeout time.
                    winston.debug("Starting a new activity check timer for session #{opts.session.session_uuid}.")
                    setTimeout(destroy_if_inactive, opts.timeout*1000)

            setTimeout(destroy_if_inactive, opts.timeout*1000)

    # Return object that describes status of CodeMirror sessions for a given project
    info: (project_id) =>
        obj = {}
        X = @_sessions.by_project[project_id]
        if X?
            for path, session of X
                obj[session.session_uuid] = {path : session.path}
        return obj

    handle_mesg: (client_socket, mesg) =>
        dbg = @dbg('handle_mesg')
        dbg("#{json(mesg)}")
        if mesg.event == 'codemirror_get_session'
            @connect
                client_socket : client_socket
                mesg          : mesg
            return

        # all other message types identify the session only by the uuid.
        session = @_sessions.by_uuid[mesg.session_uuid]
        if not session?
            winston.debug("codemirror.handle_mesg -- Unknown CodeMirror session: #{mesg.session_uuid}.")
            client_socket.write_mesg('json', message.error(id:mesg.id, error:"Unknown CodeMirror session: #{mesg.session_uuid}."))
            return
        switch mesg.event
            when 'codemirror_diffsync'
                session.client_diffsync(client_socket, mesg)
            when 'codemirror_bcast'
                session.client_bcast(client_socket, mesg)
            when 'codemirror_write_to_disk'
                session.write_to_disk(client_socket, mesg)
            when 'codemirror_read_from_disk'
                session.read_from_disk(client_socket, mesg)
            when 'codemirror_get_content'
                session.get_content(client_socket, mesg)
            when 'codemirror_revision_tracking'  # enable/disable revision_tracking
                session.revision_tracking(client_socket, mesg)
            when 'codemirror_execute_code'
                session.sage_execute_code(client_socket, mesg)
            when 'codemirror_introspect'
                session.sage_introspect(client_socket, mesg)
            when 'codemirror_send_signal'
                session.send_signal_to_sage_session(client_socket, mesg)
            when 'codemirror_restart'
                session.restart(client_socket, mesg)
            when 'codemirror_disconnect'
                session.remove_client(client_socket, mesg.client_id)
                client_socket.write_mesg('json', message.success(id:mesg.id))
            when 'codemirror_sage_raw_input'
                session.sage_raw_input(client_socket, mesg)
            else
                client_socket.write_mesg('json', message.error(id:mesg.id, error:"unknown CodeMirror session event: #{mesg.event}."))

codemirror_sessions = new CodeMirrorSessions()



###############################################
# Connecting to existing session or making a
# new one.
###############################################

connect_to_session = (socket, mesg) ->
    winston.debug("connect_to_session -- type='#{mesg.type}'")
    switch mesg.type
        when 'console'
            console_sessions.connect(socket, mesg)
        when 'sage'
            sage_sessions.connect(socket, mesg)
        else
            err = message.error(id:mesg.id, error:"Unsupported session type '#{mesg.type}'")
            socket.write_mesg('json', err)


###############################################
# Kill an existing session.
###############################################

terminate_session = (socket, mesg) ->
    cb = (err) ->
        if err
            mesg = message.error(id:mesg.id, error:err)
        socket.write_mesg('json', mesg)

    sid = mesg.session_uuid
    if console_sessions.session_exists(sid)
        console_sessions.terminate_session(sid, cb)
    else if sage_sessions.session_exists(sid)
        sage_sessions.terminate_session(sid, cb)
    else
        cb()

###############################################
# Read and write individual files
###############################################

# Read a file located in the given project.  This will result in an
# error if the readFile function fails, e.g., if the file doesn't
# exist or the project is not open.  We then send the resulting file
# over the socket as a blob message.
#
# Directories get sent as a ".tar.bz2" file.
# TODO: should support -- 'tar', 'tar.bz2', 'tar.gz', 'zip', '7z'. and mesg.archive option!!!
#
read_file_from_project = (socket, mesg) ->
    data    = undefined
    path    = abspath(mesg.path)
    is_dir  = undefined
    id      = undefined
    archive = undefined
    stats   = undefined
    async.series([
        (cb) ->
            #winston.debug("Determine whether the path '#{path}' is a directory or file.")
            fs.stat path, (err, _stats) ->
                if err
                    cb(err)
                else
                    stats = _stats
                    is_dir = stats.isDirectory()
                    cb()
        (cb) ->
            # make sure the file isn't too large
            cb(check_file_size(stats.size))
        (cb) ->
            if is_dir
                if mesg.archive != 'tar.bz2'
                    cb("The only supported directory archive format is tar.bz2")
                    return
                target  = temp.path(suffix:'.' + mesg.archive)
                #winston.debug("'#{path}' is a directory, so archive it to '#{target}', change path, and read that file")
                archive = mesg.archive
                if path[path.length-1] == '/'  # common nuisance with paths to directories
                    path = path.slice(0,path.length-1)
                split = misc.path_split(path)
                path = target
                # same patterns also in project.coffee (TODO)
                args = ["--exclude=.sagemathcloud*", '--exclude=.forever', '--exclude=.node*', '--exclude=.npm', '--exclude=.sage', '-jcf', target, split.tail]
                #winston.debug("tar #{args.join(' ')}")
                child_process.execFile 'tar', args, {cwd:split.head}, (err, stdout, stderr) ->
                    if err
                        winston.debug("Issue creating tarball: #{err}, #{stdout}, #{stderr}")
                        cb(err)
                    else
                        cb()
            else
                #winston.debug("It is a file.")
                cb()

        (cb) ->
            #winston.debug("Read the file into memory.")
            fs.readFile path, (err, _data) ->
                data = _data
                cb(err)

        (cb) ->
            #winston.debug("Compute hash of file.")
            id = misc_node.uuidsha1(data)
            winston.debug("Hash = #{id}")
            cb()

        # TODO
        # (cb) ->
        #     winston.debug("Send hash of file to hub to see whether or not we really need to send the file itself; it might already be known.")
        #     cb()

        # (cb) ->
        #     winston.debug("Get message back from hub -- do we send file or not?")
        #     cb()

        (cb) ->
            #winston.debug("Finally, we send the file as a blob back to the hub.")
            socket.write_mesg 'json', message.file_read_from_project(id:mesg.id, data_uuid:id, archive:archive)
            socket.write_mesg 'blob', {uuid:id, blob:data}
            cb()
    ], (err) ->
        if err and err != 'file already known'
            socket.write_mesg 'json', message.error(id:mesg.id, error:err)
        if is_dir
            fs.exists path, (exists) ->
                if exists
                    winston.debug("It was a directory, so remove the temporary archive '#{path}'.")
                    fs.unlink(path)
    )

write_file_to_project = (socket, mesg) ->
    data_uuid = mesg.data_uuid
    path = abspath(mesg.path)

    # Listen for the blob containing the actual content that we will write.
    write_file = (type, value) ->
        if type == 'blob' and value.uuid == data_uuid
            socket.removeListener 'mesg', write_file
            async.series([
                (cb) ->
                    ensure_containing_directory_exists(path, cb)
                (cb) ->
                    #winston.debug('writing the file')
                    fs.writeFile(path, value.blob, cb)
            ], (err) ->
                if err
                    #winston.debug("error writing file -- #{err}")
                    socket.write_mesg 'json', message.error(id:mesg.id, error:err)
                else
                    #winston.debug("wrote file '#{path}' fine")
                    socket.write_mesg 'json', message.file_written_to_project(id:mesg.id)
            )
    socket.on 'mesg', write_file

###############################################
# Printing an individual file to pdf
###############################################
print_sagews = (opts) ->
    opts = defaults opts,
        path       : required
        outfile    : required
        title      : required
        author     : required
        date       : required
        contents   : required
        extra_data : undefined   # extra data that is useful for displaying certain things in the worksheet.
        timeout    : 90
        cb         : required

    extra_data_file = undefined
    args = [opts.path, '--outfile', opts.outfile, '--title', opts.title, '--author', opts.author,'--date', opts.date, '--contents', opts.contents]
    async.series([
        (cb) ->
            if not opts.extra_data?
                cb(); return
            extra_data_file = temp.path() + '.json'
            args.push('--extra_data_file')
            args.push(extra_data_file)
            # NOTE: extra_data is a string that is *already* in JSON format.
            fs.writeFile(extra_data_file, opts.extra_data, cb)
        (cb) ->
            # run the converter script
            misc_node.execute_code
                command     : "smc-sagews2pdf"
                args        : args
                err_on_exit : false
                bash        : false
                timeout     : opts.timeout
                cb          : cb

        ], (err) =>
            if extra_data_file?
                fs.unlink(extra_data_file)  # no need to wait for completion before calling opts.cb
            opts.cb(err)
        )

print_to_pdf = (socket, mesg) ->
    ext  = misc.filename_extension(mesg.path)
    if ext
        pdf = "#{mesg.path.slice(0,mesg.path.length-ext.length)}pdf"
    else
        pdf = mesg.path + '.pdf'

    async.series([
        (cb) ->
            switch ext
                when 'sagews'
                    print_sagews
                        path       : mesg.path
                        outfile    : pdf
                        title      : mesg.options.title
                        author     : mesg.options.author
                        date       : mesg.options.date
                        contents   : mesg.options.contents
                        extra_data : mesg.options.extra_data
                        timeout    : mesg.options.timeout
                        cb         : cb
                else
                    cb("unable to print file of type '#{ext}'")
    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        else
            socket.write_mesg('json', message.printed_to_pdf(id:mesg.id, path:pdf))
    )

###############################################
# Info
###############################################
session_info = (project_id) ->
    return {
        'sage_sessions'     : sage_sessions.info(project_id)
        'console_sessions'  : console_sessions.info(project_id)
        'file_sessions'     : codemirror_sessions.info(project_id)
    }


###############################################
# Manage Jupyter server
###############################################
jupyter_port_queue = []
jupyter_port = (socket, mesg) ->
    winston.debug("jupyter_port: mesg=#{misc.to_json(mesg)}")
    jupyter_port_queue.push({socket:socket, mesg:mesg})
    if jupyter_port_queue.length > 1
        return
    # fallback during upgrade (TODO remove this)
    mathjax = mesg.mathjax_url ? "/static/mathjax/MathJax.js"
    misc_node.execute_code
        command     : "smc-jupyter"
        args        : ['start', mathjax]
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
                        winston.debug("jupyter_port: smc-jupyter executed → port=#{port}")
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


###############################################
# Execute a command line or block of BASH
###############################################
project_exec = (socket, mesg) ->
    winston.debug("project_exec: #{misc.to_json(mesg)} in #{process.cwd()}")
    if mesg.command == "smc-jupyter"
        socket.write_mesg("json", message.error(id:mesg.id, error:"do not run smc-jupyter directly"))
        return
    misc_node.execute_code
        command     : mesg.command
        args        : mesg.args
        path        : abspath(mesg.path)
        timeout     : mesg.timeout
        err_on_exit : mesg.err_on_exit
        max_output  : mesg.max_output
        bash        : mesg.bash
        cb          : (err, out) ->
            if err

                error = "Error executing command '#{mesg.command}' with args '#{mesg.args}' -- #{err}, #{out?.stdout}, #{out?.stderr}"
                if error.indexOf("Connection refused") != -1
                    error += "-- Email help@sagemath.com if you need full internet access, which is disabled by default."
                if error.indexOf("=") != -1
                    error += "-- This is a BASH terminal, not a Sage worksheet.  For Sage, use +New and create a Sage worksheet."
                err_mesg = message.error
                    id    : mesg.id
                    error : error
                socket.write_mesg('json', err_mesg)
            else
                #winston.debug(json(out))
                socket.write_mesg 'json', message.project_exec_output
                    id        : mesg.id
                    stdout    : out.stdout
                    stderr    : out.stderr
                    exit_code : out.exit_code

_save_blob_callbacks = {}
receive_save_blob_message = (opts) ->
    opts = defaults opts,
        sha1    : required
        cb      : required
        timeout : 30  # maximum time in seconds to wait for response message

    sha1 = opts.sha1
    id = misc.uuid()
    if not _save_blob_callbacks[sha1]?
        _save_blob_callbacks[sha1] = [[opts.cb, id]]
    else
        _save_blob_callbacks[sha1].push([opts.cb, id])

    # Timeout functionality -- send a response after opts.timeout seconds,
    # in case no hub responded.
    f = () ->
        v = _save_blob_callbacks[sha1]
        if v?
            mesg = message.save_blob
                sha1  : sha1
                error : "timed out after local hub waited for #{opts.timeout} seconds"

            w = []
            for x in v   # this is O(n) instead of O(1), but who cares since n is usually 1.
                if x[1] == id
                    x[0](mesg)
                else
                    w.push(x)

            if w.length == 0
                delete _save_blob_callbacks[sha1]
            else
                _save_blob_callbacks[sha1] = w

    if opts.timeout
        setTimeout(f, opts.timeout*1000)


handle_save_blob_message = (mesg) ->
    v = _save_blob_callbacks[mesg.sha1]
    if v?
        for x in v
            x[0](mesg)
        delete _save_blob_callbacks[mesg.sha1]

###############################################
# Handle a message from the client
###############################################

handle_mesg = (socket, mesg, handler) ->
    activity()  # record that there was some activity so process doesn't killall
    dbg = (m) -> winston.debug("handle_mesg: #{m}")
    try
        dbg("mesg=#{json(mesg)}")
        if mesg.event.split('_')[0] == 'codemirror'
            dbg("codemirror")
            codemirror_sessions.handle_mesg(socket, mesg)
            return

        switch mesg.event
            when 'connect_to_session', 'start_session'
                # These sessions completely take over this connection, so we better stop listening
                # for further control messages on this connection.
                socket.removeListener 'mesg', handler
                connect_to_session(socket, mesg)
            when 'project_session_info'
                resp = message.project_session_info
                    id         : mesg.id
                    project_id : mesg.project_id
                    info       : session_info(mesg.project_id)
                socket.write_mesg('json', resp)
            when 'jupyter_port'
                jupyter_port(socket, mesg)
            when 'project_exec'
                project_exec(socket, mesg)
            when 'read_file_from_project'
                read_file_from_project(socket, mesg)
            when 'write_file_to_project'
                write_file_to_project(socket, mesg)
            when 'print_to_pdf'
                print_to_pdf(socket, mesg)
            when 'send_signal'
                process_kill(mesg.pid, mesg.signal)
                if mesg.id?
                    socket.write_mesg('json', message.signal_sent(id:mesg.id))
            when 'terminate_session'
                terminate_session(socket, mesg)
            when 'save_blob'
                handle_save_blob_message(mesg)
            else
                if mesg.id?
                    err = message.error(id:mesg.id, error:"Local hub received an invalid mesg type '#{mesg.event}'")
                socket.write_mesg('json', err)
    catch e
        winston.debug(new Error().stack)
        winston.error "ERROR: '#{e}' handling message '#{json(mesg)}'"

process_kill = (pid, signal) ->
    switch signal
        when 2
            signal = 'SIGINT'
        when 3
            signal = 'SIGQUIT'
        when 9
            signal = 'SIGKILL'
        else
            winston.debug("BUG -- process_kill: only signals 2 (SIGINT), 3 (SIGQUIT), and 9 (SIGKILL) are supported")
            return
    try
        process.kill(pid, signal)
    catch e
        # it's normal to get an exception when sending a signal... to a process that doesn't exist.


server = net.createServer (socket) ->
    winston.debug "PARENT: received connection"

    misc_node.unlock_socket socket, secret_token, (err) ->
        if err
            winston.debug(err)
        else
            socket.id = uuid.v4()
            misc_node.enable_mesg(socket)
            handler = (type, mesg) ->
                if type == "json"   # other types are handled elsewhere in event code.
                    winston.debug "received control mesg #{json(mesg)}"
                    handle_mesg(socket, mesg, handler)
            socket.on 'mesg', handler


start_tcp_server = (cb) ->
    winston.info("starting tcp server: project <--> hub...")
    server.listen undefined, '0.0.0.0', (err) ->
        if err
            winston.info("tcp_server failed to start -- #{err}")
            cb(err)
        else
            winston.info("tcp_server listening on port #{server.address().port}")
            fs.writeFile(abspath("#{DATA}/local_hub.port"), server.address().port, cb)

start_raw_server = (cb) ->
    winston.info("starting raw http server...")
    info = INFO
    winston.debug("info = #{misc.to_json(info)}")

    raw_port_file  = abspath("#{DATA}/raw.port")
    express        = require('express')
    express_index  = require('serve-index')
    raw_server     = express()

    project_id = info.project_id
    port = undefined

    async.series([
        (cb) ->
            misc_node.free_port (err, _port) ->
                port = _port; cb(err)
        (cb) ->
            fs.writeFile(raw_port_file, port, cb)
        (cb) ->
            base = "#{info.base_url}/#{project_id}/raw/"
            winston.info("raw server (port=#{port}), host='#{info.location.host}', base='#{base}'")

            raw_server.use(base, express_index(process.env.HOME, {hidden:true, icons:true}))
            raw_server.use(base, express.static(process.env.HOME, {hidden:true}))

            # NOTE: It is critical to only listen on the host interface (not localhost), since otherwise other users
            # on the same VM could listen in.   We firewall connections from the other VM hosts above
            # port 1024, so this is safe without authentication.  TODO: should we add some sort of auth (?) just in case?
            raw_server.listen(port, info.location.host, cb)
    ], (err) ->
        if err
            winston.debug("error starting raw_server: err = #{misc.to_json(err)}")
        cb(err)
    )

last_activity = undefined
# Call this function to signal that there is activity.
activity = () ->
    last_activity = misc.mswalltime()

# Start listening for connections on the socket.
start_server = () ->
    async.parallel [start_tcp_server, start_raw_server], (err) ->
        if err
            winston.debug("Error starting a server -- #{err}")
        else
            winston.debug("Successfully started servers.")

process.addListener "uncaughtException", (err) ->
    winston.debug("BUG ****************************************************************************")
    winston.debug("Uncaught exception: " + err)
    winston.debug(err.stack)
    winston.debug("BUG ****************************************************************************")
    if console? and console.trace?
        console.trace()

console.log("setting up conf path")
init_confpath()
init_info_json()
start_server()
