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

async          = require 'async'
fs             = require 'fs'
net            = require 'net'
child_process  = require 'child_process'
uuid           = require 'node-uuid'

message        = require 'message'
misc           = require 'misc'
misc_node      = require 'misc_node'
winston        = require 'winston'
temp           = require 'temp'

diffsync       = require 'diffsync'

{to_json, from_json, defaults, required}   = require 'misc'

json = (out) -> misc.trunc(misc.to_json(out),512)

{ensure_containing_directory_exists, abspath} = misc_node

#####################################################################
# Generate the "secret_token" file as
# $SAGEMATHCLOUD/data/secret_token if it does not already
# exist.  All connections to all local-to-the user services that
# SageMathClouds starts must be prefixed with this key.
#####################################################################

# WARNING -- the sage_server.py program can't get these definitions from
# here, since it is not written in node; if this path changes, it has
# to be change there as well (it will use the SAGEMATHCLOUD environ
# variable though).

DATA = process.env['SAGEMATHCLOUD'] + '/data'

CONFPATH = exports.CONFPATH = abspath(DATA)
secret_token_filename = exports.secret_token_filename = "#{CONFPATH}/secret_token"
secret_token = undefined

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
    filename = "#{process.env['SAGEMATHCLOUD']}/info.json"
    v = process.env['HOME'].split('/')
    project_id = v[v.length-1]
    username   = project_id.replace(/-/g,'')
    host       = require('os').networkInterfaces().tun0?[0].address
    if not host?  # some testing setup not on the vpn
        host = require('os').networkInterfaces().eth1?[0].address
        if not host?
            host = 'localhost'
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
        fs.readFile abspath("#{DATA}/#{type}_server.port"), (err, content) ->
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
restart_console_server = (cb) ->   # cb(err)
    port_file = abspath("#{DATA}/console_server.port")
    dbg = (m) -> winston.debug("restart_console_server: #{m}")
    port = undefined
    async.series([
        (cb) ->
            dbg("remove port_file=#{port_file}")
            fs.unlink port_file, (err) ->
                cb() # ignore error, e.g., if file not there.
        (cb) ->
            dbg("restart console server")
            misc_node.execute_code
                command     : "console_server restart"
                timeout     : 10
                err_on_exit : true
                bash        : true
                cb          : cb
        (cb) ->
            dbg("wait a little to see if #{port_file} appears, and if so read it and return port")
            t = misc.walltime()
            f = (cb) ->
                if misc.walltime() - t > 5  # give up
                    cb(); return
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
                f  : f
                cb : cb
    ], (err) =>
        cb(err, port)
    )


class ConsoleSessions
    constructor: () ->
        @_sessions = {}

    session_exists: (session_uuid) =>
        return @_sessions[session_uuid]?

    terminate_session: (session_uuid, cb) =>
        session = @_sessions[session_uuid]
        if not session?
            cb()
        else
            winston.debug("terminate console session '#{session_uuid}'")
            if session.status == 'running'
                session.socket.end()
                cb()
            else
                cb()

    # Connect to (if 'running'), restart (if 'dead'), or create (if
    # non-existing) the console session with mesg.session_uuid.
    connect: (client_socket, mesg) =>
        winston.debug("connect to console session #{mesg.session_uuid}")
        session = @_sessions[mesg.session_uuid]
        if session? and session.status == 'running'
            winston.debug("console session exists and is running")
            client_socket.write_mesg('json', {desc:session.desc, history:session.history.toString()})
            plug(client_socket, session.socket)
            session.clients.push(client_socket)
        else
            winston.debug("console session does not exist or is not running, so we make a new session")
            get_port 'console', (err, port) =>
                winston.debug("got console server port = #{port}")
                if err
                    winston.debug("can't determine console server port; probably console server not running -- try restarting it")
                    restart_console_server (err, port) =>
                        if err
                            client_socket.write_mesg('json', message.error(id:mesg.id, error:"problem determining port of console server."))
                        else
                            @_new_session(client_socket, mesg, port, session?.history)
                else
                    @_new_session(client_socket, mesg, port, session?.history)

    _new_session: (client_socket, mesg, port, history, cnt) =>
        if not cnt?
            cnt = 0
        winston.debug("_new_session: defined by #{json(mesg)}")
        # Connect to port CONSOLE_PORT, send mesg, then hook sockets together.
        misc_node.connect_to_locked_socket
            port  : port
            token : secret_token
            cb : (err, console_socket) =>
                if err
                    winston.debug("_new_session - error connecting to locked console socket -- #{err}")
                    forget_port('console')
                    if cnt >= 3
                        # too many tries -- give up
                        client_socket.write_mesg('json', message.error(id:mesg.id, error:"local_hub -- TOO MANY problems connecting to console server."))
                        winston.debug("_new_session: console server denied connection too many times")
                        return
                    winston.debug("_new_session -- not too many (=#{cnt}) tries -- try to restart console server and try again.")
                    restart_console_server (err, port) =>
                        if err or not port?
                            # even restarting console server failed
                            client_socket.write_mesg('json', message.error(id:mesg.id, error:"local_hub -- Problem connecting to console server."))
                            winston.debug("_new_session: console server denied connection")
                        else
                            @_new_session(client_socket, mesg, port, history, cnt+1)
                        return
                # Request a Console session from console_server
                misc_node.enable_mesg(console_socket)
                console_socket.write_mesg('json', mesg)
                # Read one JSON message back, which describes the session
                console_socket.once 'mesg', (type, desc) =>
                    if not history?
                        history = new Buffer(0)
                    client_socket.write_mesg('json', {desc:desc, history:history.toString()})  # in future, history could be read from a file
                    # Disable JSON mesg protocol, since it isn't used further
                    misc_node.disable_mesg(console_socket)
                    misc_node.disable_mesg(client_socket)

                    session =
                        socket  : console_socket
                        desc    : desc,
                        status  : 'running',
                        clients : [client_socket],
                        history : history
                        session_uuid : mesg.session_uuid
                        project_id   : mesg.project_id

                    # Connect the sockets together.

                    # receive data from the user (typing at their keyboard)
                    client_socket.on 'data', (data) ->
                        activity()
                        console_socket.write(data)

                    session.amount_of_data = 0
                    session.last_data = misc.mswalltime()

                    # receive data from the pty, which we push out to the user (via global hub)
                    console_socket.on 'data', (data) ->

                        # every 2 ms we reset the burst data watcher.
                        tm = misc.mswalltime()
                        if tm - session.last_data >= 2
                            session.amount_of_data = 0
                        session.last_data = tm

                        if session.amount_of_data > 200000
                            # We just got more than 200000 characters of output in <= 2 ms, so truncate it.
                            # I had a control-c here, but it was EVIL (and useless), so do *not* enable this.
                            #      console_socket.write(String.fromCharCode(3))
                            # client_socket.write('[...]')
                            data = '[...]'

                        session.history += data
                        session.amount_of_data += data.length
                        n = session.history.length
                        if n > 400000  # TODO: totally arbitrary; also have to change the same thing in hub.coffee
                            session.history = session.history.slice(session.history.length - 300000)

                        # Never push more than 20000 characters at once to client hub, since that could overwhelm...
                        if data.length > 20000
                            data = "[...]"+data.slice(data.length-20000)

                        client_socket.write(data)

                    @_sessions[mesg.session_uuid] = session

                console_socket.on 'end', () =>
                    winston.debug("console session #{mesg.session_uuid} ended")
                    session = @_sessions[mesg.session_uuid]
                    if session?
                        session.status = 'done'
                    client_socket.end()

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

restart_sage_server = (cb) ->
    misc_node.execute_code
        command     : "sage_server stop; sage_server start"
        timeout     : 30
        err_on_exit : true
        bash        : true
        cb          : cb

get_sage_socket = (cb) ->
    _get_sage_socket (err, socket) ->
        if not err
            cb(undefined, socket)
        else
            # Failed for some reason: try to restart one time, then try again.
            # We do this because the Sage server can easily get killed due to out of memory conditions.
            # But we don't constantly try to restart the server, since it can easily fail to start if
            # there is something wrong with a local Sage install.
            # Note that restarting the sage server doesn't impact currently running worksheets (they
            # have their own process that isn't killed).
            restart_sage_server (err) ->
                if err
                    cb(err)
                else
                    _get_sage_socket(cb)


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

###############################################
# Sage sessions
###############################################

plug = (s1, s2) ->
    # Connect the sockets together.
    s1.on 'data', (data) ->
        activity()   # record incoming activity  (don't do this in other direction, since that shouldn't keep session alive)
        s2.write(data)
    s2.on 'data', (data) ->
        s1.write(data)

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
# Here's a map                    YOU ARE HERE
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
        @_backup_file = misc.meta_file(@path, 'backup')
        # check for need to save a backup every this many milliseconds
        @_autosave = setInterval(@write_backup, 10000)

        # We prefer the backup file only if it both (1) exists, and
        # (2) is *newer* than the master file.  This is because some
        # other editing program could have edited the master, not
        # knowing about the backup, in which case it makes more sense
        # to just go with the master.

        no_master = undefined
        stats_path = undefined
        no_backup = undefined
        stats_backup = undefined
        file = undefined

        async.series([
            (cb) =>
                fs.stat @path, (_no_master, _stats_path) =>
                    no_master = _no_master
                    stats_path = _stats_path
                    cb()
            (cb) =>
                fs.stat @_backup_file, (_no_backup, _stats_backup) =>
                    no_backup = _no_backup
                    stats_backup = _stats_backup
                    cb()
            (cb) =>
                if no_backup and no_master
                    # neither exist -- create
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
                else if no_backup # no backup file -- always use master
                    file = @path
                    cb()
                else if no_master # no master file but there is a backup file -- use backup
                    file = @_backup_file
                    cb()
                else
                    # both master and backup exist
                    if stats_path.mtime.getTime() >= stats_backup.mtime.getTime()
                        # master is newer
                        file = @path
                    else
                        # backup is newer
                        file = @_backup_file
                    cb()
            (cb) =>
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
        fs.readFile @path, (err, data) =>
            if err
                @_start_watching_file()
            else
                @live = data.toString().replace(/\r/g,'')  # NOTE: we immediately delete \r's (see above).
                @cm_session.sync_filesystem (err) =>
                    @_start_watching_file()

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
                if not err
                    fs.exists @_backup_file, (exists) =>
                        fs.unlink(@_backup_file)
                cb?(err)

    write_backup: (cb) =>
        if @cm_session.content != @_last_backup
            x = @cm_session.content
            fs.writeFile @_backup_file, x, (err) =>
                if not err
                    @_last_backup = x
                cb?(err)

# The live content of DiffSyncFile_client is our in-memory buffer.
class DiffSyncFile_client extends diffsync.DiffSync
    constructor:(@server) ->
        super(doc:@server.live, id:"file_client")
        # Connect the two together
        @connect(@server)
        @server.connect(@)

# The CodeMirrorDiffSyncHub class represents a
# downstream remote client for this local hub.  There may be dozens of thes.
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


# TODO:
class CodeMirrorSession
    constructor: (mesg, cb) ->
        @path = mesg.path
        @session_uuid = mesg.session_uuid
        @_sage_output_cb = {}
        @_sage_output_to_input_id = {}

        # The downstream clients of this local hub -- these are global hubs that proxy requests on to browser clients
        @diffsync_clients = {}

        async.series([
            (cb) =>
                # if File doesn't exist, try to create it.
                fs.exists @path, (exists) =>
                    if exists
                        cb()
                    else
                        fs.open @path,'w', (err, fd) =>
                            if err
                                cb(err)
                            else
                                fs.close(fd, cb)
            (cb) =>
                if @path.indexOf('.snapshots/') != -1
                    @readonly = true
                    cb()
                else
                    misc_node.is_file_readonly
                        path : @path
                        cb   : (err, readonly) =>
                            @readonly = readonly
                            cb(err)
            (cb) =>
                # If this is a non-readonly sagews file, create corresponding sage session.
                if not @readonly and misc.filename_extension(@path) == 'sagews'
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
                    cb()
        ], (err) => cb?(err, @))

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
                @sage_update(kill:true)

        winston.debug("sage_socket: Opening a Sage session.")

        # Ensure that no cells appear to be running.  This is important
        # because the worksheet file that we just loaded could have had some
        # markup that cells are running.
        @sage_update(kill:true)

        # Connect to the local Sage server.
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

                # Submit all auto cells to be evaluated.
                @sage_update(auto:true)

                cb(false, @_sage_socket)

    _set_content_and_sync: () =>
        @set_content(@content)
        # Suggest to all connected clients to sync.
        for id, ds_client of @diffsync_clients
            ds_client.remote.sync_ready()


    sage_execute_cell: (id) =>
        winston.debug("exec request for cell with id #{id}")
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
            @_set_content_and_sync()

            @sage_socket (err, socket) =>
                if err
                    winston.debug("Error getting sage socket: #{err}")
                    @sage_output_mesg(output_id, {stderr: "Error getting sage socket (unable to execute code): #{err}"})
                    @sage_remove_cell_flag(id, diffsync.FLAGS.running)
                    return
                winston.debug("Sending execute message to sage socket.")
                socket.write_mesg('json',
                    message.execute_code
                        id       : output_id
                        cell_id  : id         # extra info -- which cell is running
                        code     : code
                        preparse : true
                )

    # Execute code in the Sage session associated to this sync'd editor session
    sage_execute_code: (client_socket, mesg) =>
        #winston.debug("sage_execute_code '#{misc.to_json(mesg)}")
        client_id = mesg.client_id
        @_sage_output_cb[mesg.id] = (resp) =>
            resp.client_id = client_id
            #winston.debug("sage_execute_code -- got output: #{misc.to_json(resp)}")
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

    sage_introspect:(client_socket, mesg) =>
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

    sage_update: (opts={}) =>
        opts = defaults opts,
            kill : false    # if true, just remove all running flags.
            auto : false    # if true, run all cells that have the auto flag set
        if not @content?  # document not initialized
            return
        # Here we:
        #    - scan the string @content for execution requests.
        #    - also, if we see a cell UUID that we've seen already, we randomly generate
        #      a new cell UUID; clients can annoyingly generate non-unique UUID's (e.g., via
        #      cut and paste) so we fix that.
        winston.debug("sage_update: opts=#{misc.to_json(opts)}")
        i = 0
        prev_ids = {}
        while true
            i = @content.indexOf(diffsync.MARKERS.cell, i)
            if i == -1
                break
            j = @content.indexOf(diffsync.MARKERS.cell, i+1)
            if j == -1
                break  # corrupt and is the last one, so not a problem.
            id  = @content.slice(i+1,i+37)
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
            if opts.kill
                new_flags = ''
                for t in flags
                    if t != diffsync.FLAGS.running
                        new_flags += t
                @content = @content.slice(0,i+37) + new_flags + @content.slice(j)
            else
                if diffsync.FLAGS.execute in flags
                    @sage_execute_cell(id)
                else if opts.auto and diffsync.FLAGS.auto in flags
                    @sage_remove_cell_flag(id, diffsync.FLAGS.auto)
                    @sage_execute_cell(id)

            i = j + 1


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
        @content = value
        @diffsync_fileclient.live = @content
        for id, ds_client of @diffsync_clients
            ds_client.live = @content

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
            winston.debug("client_diffsync hit a filesystem_sync_lock -- send retry message back")
            write_mesg('error', {error:"retry"})
            return

        @_client_sync_lock = true
        before = @content
        ds_client.recv_edits    mesg.edit_stack, mesg.last_version_ack, (err) =>
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
            winston.debug("sync_filesystem -- hit filesystem sync lock")
            cb?("cannot sync with filesystem; already syncing")
            return


        before = @content
        if not @diffsync_fileclient?
            cb?("filesystem sync object (@diffsync_fileclient) no longer defined")
            return

        @_filesystem_sync_lock = true
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

    write_to_disk: (socket, mesg) =>
        @is_active = true
        winston.debug("write_to_disk: #{json(mesg)} -- calling sync_filesystem")
        @sync_filesystem (err) =>
            if err
                resp = message.error(id:mesg.id, error:"Error writing file '#{@path}' to disk -- #{err}")
            else
                resp = message.success(id:mesg.id)
            socket.write_mesg('json', resp)

    read_from_disk: (socket, mesg) =>
        fs.readFile @path, (err, data) =>
            if err
                socket.write_mesg('json', message.error(id:mesg.id, error:"Error reading file '#{@path}' to disk"))
            else
                value = data.toString()
                if value == @content
                    # nothing to do -- so do not do anything!
                    socket.write_mesg('json', message.success(id:mesg.id))
                    return
                @set_content(value)
                # Tell the global hubs that now might be a good time to do a sync.
                for id, ds of @diffsync_clients
                    ds.remote.sync_ready()

    get_content: (socket, mesg) =>
        @is_active = true
        socket.write_mesg('json', message.codemirror_content(id:mesg.id, content:@content))

# Collection of all CodeMirror sessions hosted by this local_hub.

class CodeMirrorSessions
    constructor: () ->
        @_sessions = {by_uuid:{}, by_path:{}, by_project:{}}

    connect: (client_socket, mesg) =>
        finish = (session) ->
            session.add_client(client_socket, mesg.client_id)
            client_socket.write_mesg 'json', message.codemirror_session
                id           : mesg.id,
                session_uuid : session.session_uuid
                path         : session.path
                content      : session.content
                readonly     : session.readonly

        if mesg.session_uuid?
            session = @_sessions.by_uuid[mesg.session_uuid]
            if session?
                finish(session)
                return

        if mesg.path?
            session = @_sessions.by_path[mesg.path]
            if session?
                finish(session)
                return

        mesg.session_uuid = uuid.v4()
        new CodeMirrorSession mesg, (err, session) =>
            if err
                client_socket.write_mesg('json', message.error(id:mesg.id, error:err))
            else
                @add_session_to_cache
                    session    : session
                    project_id : mesg.project_id
                    timeout    : 3600   # time in seconds (or undefined to not use timer)
                finish(session)

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
        winston.debug("CodeMirrorSessions.handle_mesg: '#{json(mesg)}'")
        if mesg.event == 'codemirror_get_session'
            @connect(client_socket, mesg)
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
            when 'codemirror_execute_code'
                session.sage_execute_code(client_socket, mesg)
            when 'codemirror_introspect'
                session.sage_introspect(client_socket, mesg)
            when 'codemirror_send_signal'
                session.send_signal_to_sage_session(client_socket, mesg)
            else
                client_socket.write_mesg('json', message.error(id:mesg.id, error:"Unknown CodeMirror session event: #{mesg.event}."))

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
    data   = undefined
    path   = abspath(mesg.path)
    is_dir = undefined
    id     = undefined
    archive = undefined
    async.series([
        (cb) ->
            #winston.debug("Determine whether the path '#{path}' is a directory or file.")
            fs.stat path, (err, stats) ->
                if err
                    cb(err)
                else
                    is_dir = stats.isDirectory()
                    cb()
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
# Info
###############################################
session_info = (project_id) ->
    return {
        'sage_sessions'     : sage_sessions.info(project_id)
        'console_sessions'  : console_sessions.info(project_id)
        'file_sessions'     : codemirror_sessions.info(project_id)
    }


###############################################
# Execute a command line or block of BASH
###############################################
project_exec = (socket, mesg) ->
    winston.debug("project_exec")
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
                err_mesg = message.error
                    id    : mesg.id
                    error : "Error executing code command:#{mesg.command}, args:#{mesg.args}, bash:#{mesg.bash}' -- #{err}, #{out?.stdout}, #{out?.stderr}"
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
                error : 'timed out after local hub waited for #{opts.timeout} seconds'

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
    try
        winston.debug("Handling '#{json(mesg)}'")
        if mesg.event.split('_')[0] == 'codemirror'
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
            when 'project_exec'
                project_exec(socket, mesg)
            when 'read_file_from_project'
                read_file_from_project(socket, mesg)
            when 'write_file_to_project'
                write_file_to_project(socket, mesg)
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
    winston.info("starting tcp server...")
    server.listen program.port, '0.0.0.0', () ->
        winston.info("listening on port #{server.address().port}")
        fs.writeFile(abspath("#{DATA}/local_hub.port"), server.address().port, cb)

# use of domain inspired by http://stackoverflow.com/questions/17940895/handle-uncaughtexception-in-express-and-restify
# This addresses an issue where the raw server fails to startup, maybe due to race condition with misc_node.free_port;
# and... in any case if anything uncaught goes wrong starting the raw server or running, this will ensure
# that it gets fixed automatically.
raw_server_domain = require('domain').create()

raw_server_domain.on 'error', (err) ->
    winston.debug("got an exception in raw server, so restarting.")
    start_raw_server( () -> winston.debug("restarted raw http server") )

start_raw_server = (cb) ->
    raw_server_domain.run () ->
        winston.info("starting raw server...")
        info = INFO
        winston.debug("info = #{misc.to_json(info)}")

        express = require('express')
        raw_server = express()
        project_id = info.project_id
        misc_node.free_port (err, port) ->
            if err
                winston.debug("error starting raw server: #{err}")
                cb(err); return
            fs.writeFile(abspath("#{DATA}/raw.port"), port, cb)
            base = "#{info.base_url}/#{project_id}/raw/"
            winston.info("raw server (port=#{port}), host='#{info.location.host}', base='#{base}'")

            raw_server.configure () ->
                raw_server.use(base, express.directory(process.env.HOME, {hidden:true, icons:true}))
                raw_server.use(base, express.static(process.env.HOME, {hidden:true}))

            # NOTE: It is critical to only listen on the host interface (not localhost), since otherwise other users
            # on the same VM could listen in.   We firewall connections from the other VM hosts above
            # port 1024, so this is safe without authentication.  That said, I plan to add some sort of auth (?) just in case.
            raw_server.listen port, info.location.host, (err) ->
                winston.info("err = #{err}")
                if err
                    cb(err); return
                fs.writeFile(abspath("#{DATA}/raw.port"), port, cb)

last_activity = undefined
# Call this function to signal that there is activity.
activity = () ->
    last_activity = misc.mswalltime()

start_kill_monitor = (cb) ->
    # Start a monitor that periodically checks for some sort of client-initiated hub activity.
    # If there is none for program.timeout seconds, then all processes running as this user
    # are killed (including this local hub, of course).
    if not program.timeout or process.env['USER'].length != 32   # 32 = length of SMC accounts...
        winston.info("Not setting kill monitor")
        cb()
        return

    timeout = program.timeout*1000
    winston.debug("Creating kill monitor to kill if idle for #{program.timeout} seconds")
    activity()
    kill_if_inactive = () ->
        age = misc.mswalltime() - last_activity
        winston.debug("kill_if_inactive: last activity #{age/1000} seconds ago")
        if age >= timeout
            # game over -- kill everything...
            mesg = "Activity timeout hit: killing everything!"
            console.log(mesg)
            winston.debug(mesg)
            misc_node.execute_code
                command : "pkill"
                args    : ['-9', '-u', process.env['USER']]
                cb      : (err) ->
                    # shouldn't get hit, since *everything* including this process, gets killed

    # check every 30 seconds
    setInterval(kill_if_inactive, 30000)
    cb()

# Truncate the ~/.sagemathcloud.log if it exceeds a certain length threshhold.
SAGEMATHCLOUD_LOG_THRESH = 5000 # log grows to at most 50% more than this
SAGEMATHCLOUD_LOG_FILE = process.env['HOME'] + '/.sagemathcloud.log'
log_truncate = (cb) ->
    data = undefined
    winston.info("log_truncate: checking that logfile isn't too long")
    exists = undefined
    async.series([
        (cb) ->
            fs.exists SAGEMATHCLOUD_LOG_FILE, (_exists) ->
                exists = _exists
                cb()
        (cb) ->
            if not exists
                cb(); return
            # read the log file
            fs.readFile SAGEMATHCLOUD_LOG_FILE, (err, _data) ->
                data = _data.toString()
                cb(err)
        (cb) ->
            if not exists
                cb(); return
            # if number of lines exceeds 50% more than MAX_LINES
            n = misc.count(data, '\n')
            if n  >= SAGEMATHCLOUD_LOG_THRESH * 1.5
                winston.debug("log_truncate: truncating log file to #{SAGEMATHCLOUD_LOG_THRESH} lines")
                v = data.split('\n')  # the -1 below is since last entry is a blank line
                new_data = v.slice(n - SAGEMATHCLOUD_LOG_THRESH, v.length-1).join('\n')
                fs.writeFile(SAGEMATHCLOUD_LOG_FILE, new_data, cb)
            else
                cb()
    ], cb)

start_log_truncate = (cb) ->
    winston.info("start_log_truncate")
    f = (c) ->
        winston.debug("calling log_truncate")
        log_truncate (err) ->
            if err
                winston.debug("ERROR: problem truncating log -- #{err}")
            c()
    setInterval(f, 1000*3600*12)   # once every 12 hours
    f(cb)

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    async.series [start_log_truncate, start_kill_monitor, start_tcp_server, start_raw_server], (err) ->
        if err
            winston.debug("Error starting a server -- #{err}")
        else
            winston.debug("Successfully started servers.")

# daemonize it

program = require('commander')
daemon  = require("start-stop-daemon")

program.usage('[start/stop/restart/status] [options]')
    .option('--pidfile [string]', 'store pid in this file', String, abspath("#{DATA}/local_hub.pid"))
    .option('--logfile [string]', 'write log to this file', String, abspath("#{DATA}/local_hub.log"))
    .option('--forever_logfile [string]', 'write forever log to this file', String, abspath("#{DATA}/forever_local_hub.log"))
    .option('--debug [string]', 'logging debug level (default: "" -- no debugging output)', String, 'debug')
    .option('--timeout [number]', 'kill all processes if there is no activity for this many *seconds* (use 0 to disable, which is the default)', Number, 0)
    .parse(process.argv)

if program._name.split('.')[0] == 'local_hub'
    if program.debug
        winston.remove(winston.transports.Console)
        winston.add(winston.transports.Console, level: program.debug)

    winston.debug "Running as a Daemon"
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    console.log("setting up conf path")
    init_confpath()
    init_info_json()

    # empty the forever logfile -- it doesn't get reset on startup and easily gets huge.
    fs.writeFileSync(program.forever_logfile, '')

    console.log("start daemon")
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile, logFile:program.forever_logfile, max:1}, start_server)
    console.log("after daemon")


