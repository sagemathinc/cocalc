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
# traces.
#
#         make_coffee && echo "require('local_hub').start_server()" | coffee
#
#  (c) William Stein, 2013
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
sync_obj       = require 'sync_obj'

diffsync       = require 'diffsync'

{to_json, from_json, defaults, required}   = require 'misc'

json = (out) -> misc.trunc(misc.to_json(out),512)


# Any non-absolute path is assumed to be relative to the user's home directory.
# This function converts such a path to an absolute path.
abspath = (path) ->
    if path.length == 0
        return process.env.HOME
    if path[0] == '/'
        return path  # already an absolute path
    return process.env.HOME + '/' + path

# Other path related functions...

# Make sure that that the directory containing the file indicated by
# the path exists and has the right permissions.
ensure_containing_directory_exists = (path, cb) ->   # cb(err)
    path = abspath(path)
    dir = misc.path_split(path).head  # containing path

    fs.exists dir, (exists) ->
        if exists
            cb()
        else
            async.series([
                (cb) ->
                    if dir != ''
                        # recursively make sure the entire chain of directories exists.
                        ensure_containing_directory_exists(dir, cb)
                    else
                        cb()
                (cb) ->
                    fs.mkdir(dir, 0o700, cb)
            ], cb)

#####################################################################
# Generate the "secret_token" file as
# $HOME/.sagemathcloud/data/secret_token if it does not already
# exist.  All connections to all local-to-the user services that
# SageMathClouds starts must be prefixed with this key.
#####################################################################

# WARNING -- the sage_server.py program can't get these definitions from
# here, since it is not written in node; if this path changes, it has
# to be change there as well.
CONFPATH = exports.CONFPATH = abspath('.sagemathcloud/data/')
secret_token_filename = exports.secret_token_filename = "#{CONFPATH}/secret_token"
secret_token = undefined

# We use an n-character cryptographic random token, where n is given
# below.  If you want to change this, changing only the following line
# should be safe.
secret_token_length = 128

init_confpath = () ->
    async.series([
        # Ensure the CONFPATH has maximally restrictive permissions, since
        # secret info will be stored there.
        (cb) ->
            winston.debug("restrict permissions")
            misc_node.execute_code
                command : "chmod"
                args    : ['u+rw,og-rwx', '-R', abspath('.sagemathcloud')]
                cb      : cb

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

        # Ensure restrictive permissions on the secret token file.  The
        # directory permissions already restrict anybody else from
        # looking at this file, but we do this as well, just in case.
        (cb) ->
            fs.chmod(secret_token_filename, 0o600, cb)
    ])


###############################################
# Console sessions
###############################################
ports = {}
get_port = (type, cb) ->   # cb(err, port number)
    if ports[type]?
        cb(false, ports[type])
    else
        fs.readFile abspath(".sagemathcloud/data/#{type}_server.port"), (err, content) ->
            if err
                cb(err)
            else
                try
                    ports[type] = parseInt(content)
                    cb(false, ports[type])
                catch e
                    cb("console_server port file corrupted")

forget_port = (type) ->
    if ports[type]?
        delete ports[type]


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
        session = @_sessions[mesg.session_uuid]
        if session? and session.status == 'running'
            client_socket.write_mesg('json', session.desc)
            client_socket.write(session.history)
            plug(client_socket, session.socket)
            session.clients.push(client_socket)
        else
            get_port 'console', (err, port) =>
                winston.debug("Got console server port = #{port}")
                if err
                    winston.debug("can't determine console server port; probably console server not running")
                    client_socket.write_mesg('json', message.error(id:mesg.id, error:"problem determining port of console server."))
                else
                    @_new_session(client_socket, mesg, port)

    _new_session: (client_socket, mesg, port) =>
        winston.debug("_new_session: defined by #{json(mesg)}")
        # Connect to port CONSOLE_PORT, send mesg, then hook sockets together.
        misc_node.connect_to_locked_socket
            port  : port
            token : secret_token
            cb : (err, console_socket) =>
                if err
                    forget_port('console')
                    client_socket.write_mesg('json', message.error(id:mesg.id, error:"local_hub -- Problem connecting to console server."))
                    winston.debug("_new_session: console server denied connection")
                    return
                # Request a Console session from console_server
                misc_node.enable_mesg(console_socket)
                console_socket.write_mesg('json', mesg)
                # Read one JSON message back, which describes the session
                console_socket.once 'mesg', (type, desc) =>
                    client_socket.write_mesg('json', desc)
                    # Disable JSON mesg protocol, since it isn't used further
                    misc_node.disable_mesg(console_socket)
                    misc_node.disable_mesg(client_socket)

                    session =
                        socket  : console_socket
                        desc    : desc,
                        status  : 'running',
                        clients : [client_socket],
                        history : new Buffer(0)
                        session_uuid : mesg.session_uuid
                        project_id   : mesg.project_id

                    # Connect the sockets together.
                    client_socket.on 'data', (data) ->
                        console_socket.write(data)

                    session.amount_of_data = 0
                    setInterval(( () -> session.amount_of_data = 0), 250)
                    console_socket.on 'data', (data) ->
                        if session.amount_of_data > 20000
                            # we are getting a massive burst of output
                            # (1) send control-c -- maybe it will help
                            console_socket.write(String.fromCharCode(3))
                            # (2) and ignore more data
                            client_socket.write('[Ctrl-C]')
                            return

                        session.history += data
                        session.amount_of_data += data.length
                        n = session.history.length
                        if n > 150000  # TODO: totally arbitrary; also have to change the same thing in hub.coffee
                            session.history = session.history.slice(100000)
                        client_socket.write(data)

                    @_sessions[mesg.session_uuid] = session

                console_socket.on 'end', () =>
                    session = @_sessions[mesg.session_uuid]
                    if session?
                        session.status = 'done'
                    # TODO: should we close client_socket here?

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
# Sage sessions
###############################################

plug = (s1, s2) ->
    # Connect the sockets together.
    s1.on 'data', (data) ->
        s2.write(data)
    s2.on 'data', (data) ->
        s1.write(data)


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

    # Connect to (if 'running'), restart (if 'dead'), or create (if
    # non-existing) the Sage session with mesg.session_uuid.
    connect: (client_socket, mesg) =>
        session = @_sessions[mesg.session_uuid]
        if session? and session.status == 'running'
            client_socket.write_mesg('json', session.desc)
            plug(client_socket, session.socket)
            session.clients.push(client_socket)
        else
            get_port 'sage', (err, port) =>
                winston.debug("Got sage server port = #{port}")
                if err
                    winston.debug("can't determine sage server port; probably sage server not running")
                    client_socket.write_mesg('json', message.error(id:mesg.id, error:"problem determining port of sage server."))
                else
                    @_new_session(client_socket, mesg, port)

    _new_session: (client_socket, mesg, port) =>
        winston.debug("new sage session")
        # Connect to port, send mesg, then hook sockets together.
        misc_node.connect_to_locked_socket
            port  : port
            token : secret_token
            cb    : (err, sage_socket) =>
                if err
                    forget_port('sage')
                    client_socket.write_mesg('json', message.error(id:mesg.id, error:"local_hub -- Problem connecting to Sage server. -- #{err}"))
                    winston.debug("_new_session: sage session denied connection: #{err}")
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
                    session = @_sessions[mesg.session_uuid]
                    # TODO: should we close client_socket here?
                    if session?
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
# Differentially-Synchronized CodeMirror editing sessions
#
# Here's a map                    YOU ARE HERE
#                                   |
#   [client]s.. ---> [hub] ---> [local hub] <--- [hub] <--- [client]s...
#                                   |
#                                  \|/
#                              [a file on disk]
#
#############################################################################

# The "live content" of DiffSyncFile_client is the actual file on disk.
# # TODO: when applying diffs, we could use that the file is random access.  This is not done yet!
class DiffSyncFile_server extends diffsync.DiffSync
    constructor:(@cm_session, cb)  ->
        @path = @cm_session.path
        @_backup_file = meta_file(@path, 'backup')
        # check for need to save a backup every this many milliseconds
        @_autosave = setInterval(@write_backup, 10000)

        # We prefer the backup file only if it both (1) exists, and
        # (2) is *newer* than the master file.  This is because some
        # other editing program could have edited the master, not
        # knowing about the backup, in which case it makes more sense
        # to just go with the master.

        fs.stat @path, (no_master,stats_path) =>
            fs.stat @_backup_file, (no_backup,stats_backup) =>
                if no_backup # no backup file -- always use master
                    file = @path
                else if no_master # no master file but there is a backup file -- use backup
                    file = @_backup_file
                else
                    # both master and backup exist
                    if stats_path.mtime.getTime() >= stats_backup.mtime.getTime()
                        # master is newer
                        file = @path
                    else
                        # backup is newer
                        file = @_backup_file
                fs.readFile file, (err, data) =>
                    if err
                        cb(err); return
                    @init(doc:data.toString(), id:"file_server")
                    # winston.debug("got new file contents = '#{@live}'")
                    @_start_watching_file()
                    cb(err, @live)

    kill: () =>
        if @_autosave?
            clearInterval(@_autosave)

    _watcher: (event) =>
        winston.debug("watch: file '#{@path}' modified.")
        if not @_do_watch
            winston.debug("watch: skipping read do to watching being turned off.")
            return
        @_stop_watching_file()
        fs.readFile @path, (err, data) =>
            if err
                @_start_watching_file()
            else
                @live = data.toString()
                @cm_session.sync_filesystem (err) =>
                    @_start_watching_file()

    _start_watching_file: () =>
        if @_do_watch?
            @_do_watch = true
            return
        @_do_watch = true
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

# The CodeMirrorDiffSyncHub class represents a global hub viewed as a
# remote client for this local hub.  There may be dozens of global
# hubs connected to this single local hub, and these are the only
# clients a local hub can have.  The local hub has no upstream server,
# except the on-disk file itself.
class CodeMirrorDiffSyncHub
    constructor : (@socket, @session_uuid) ->

    write_mesg: (event, obj) =>
        if not obj?
            obj = {}
        obj.session_uuid = @session_uuid
        @socket.write_mesg 'json', message['codemirror_' + event](obj)

    recv_edits : (edit_stack, last_version_ack, cb) =>
        @write_mesg 'diffsync',
            id               : @current_mesg_id
            edit_stack       : edit_stack
            last_version_ack : last_version_ack

    sync_ready: () =>
        @write_mesg('diffsync_ready')

meta_file = (path, ext) ->
    p = misc.path_split(path)
    path = p.head
    if p.head != ''
        path += '/'
    return path + "." + p.tail + ".sage-" + ext

class ChatRecorder
    constructor: (path, cb) ->
        @path = meta_file(path, 'chat')
        winston.debug("ChatRecorder '#{@path}'")
        @log = []
        fs.readFile @path, (err, data) =>
            if err
                cb(false, @)  #ok -- just start new log
            else
                # Take the lines that parse
                for line in data.toString().split('\n')
                    if line.length > 0
                        try
                            @log.push(misc.from_json(line))
                        catch e
                            # do nothing -- no worries.
                cb(false, @)

    save: (mesg) =>  # WARNING: this deletes the session_uuid!
        m =   # what is saved is also defined in local_hub.coffee in client_broadcast.
            name  : mesg.name
            color : mesg.color
            date  : mesg.date
            mesg  : mesg.mesg
        @log.push(m)
        @_save_to_file(m)

    _save_to_file: (mesg) =>
        if @_appending_to_file? and @_appending_to_file
            # Try again in 500ms....
            setTimeout( (() => @_save_to_file(mesg)), 500)
            return

        @_appending_to_file = true
        fs.appendFile @path, JSON.stringify(mesg)+'\n', () =>
            @_appending_to_file = false


class CodeMirrorSession
    constructor: (mesg, cb) ->
        @path = mesg.path
        @session_uuid = mesg.session_uuid

        # The downstream clients of this local hub -- these are global hubs
        @diffsync_clients = {}

        # The upstream version of this document -- the *actual* file on disk.
        @diffsync_fileserver = new DiffSyncFile_server @, (err, content) =>
            if err
                cb(err); return

            @content = content
            @diffsync_fileclient = new DiffSyncFile_client(@diffsync_fileserver)

            new ChatRecorder @path, (err, obj) =>
                if err
                    cb(err)
                else
                    @chat_recorder = obj
                    cb(false, @)

    chat_log: () =>
        return @chat_recorder.log

    kill: () =>
        # Put any cleanup here...
        winston.debug("Killing session #{@session_uuid}")
        @sync_filesystem () =>
            @diffsync_fileserver.kill()
            # TODO: Are any of these deletes needed?  I don't know.
            delete @content
            delete @diffsync_fileclient
            delete @diffsync_fileserver

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
        # one that just sent it to us.
        for id, ds_client of @diffsync_clients
            if socket.id != id
                winston.debug("BROADCAST: sending message from hub with socket.id=#{socket.id} to hub with socket.id = #{id}")
                ds_client.remote.socket.write_mesg('json', mesg)

        # If this is a chat message, save it.
        if mesg?.mesg.event == 'chat'
            @chat_recorder.save(mesg)

    client_diffsync: (socket, mesg) =>
        @is_active = true
        write_mesg = (event, obj) ->
            if not obj?
                obj = {}
            obj.id = mesg.id
            socket.write_mesg 'json', message['event'](obj)

        # Message from some client reporting new edits, thus initiating a sync.
        ds_client = @diffsync_clients[socket.id]
        if not ds_client?
            write_mesg('error', {error:"client #{socket.id} not registered for synchronization."})
            return

        before = @content
        ds_client.recv_edits    mesg.edit_stack, mesg.last_version_ack, (err) =>
            @set_content(ds_client.live)
            # Send back our own edits to the global hub.
            ds_client.remote.current_mesg_id = mesg.id  # used to tag the return message
            ds_client.push_edits (err) =>
                if err
                    winston.debug("CodeMirrorSession -- client push_edits returned -- #{err}")
                else
                    changed = (before != @content)
                    if changed
                        # We also suggest to other clients to update their state.
                        for id, ds_client of @diffsync_clients
                            if socket.id != id
                                ds_client.remote.sync_ready()


    sync_filesystem: (cb) =>
        @is_active = true
        before = @content
        if not @diffsync_fileclient?
            cb?("filesystem sync object (@diffsync_fileclient) no longer defined")
            return
        @diffsync_fileclient.sync (err) =>
            if err
                cb?("codemirror fileclient sync error -- '#{err}'")
                return
            if @diffsync_fileclient.live != @content
                @set_content(@diffsync_fileclient.live)
                # recommend all global hubs sync
                for id, ds_client of @diffsync_clients
                    ds_client.remote.sync_ready()
            cb?()

    add_client: (socket) =>
        @is_active = true
        ds_client = new diffsync.DiffSync(doc:@content)
        ds_client.connect(new CodeMirrorDiffSyncHub(socket, @session_uuid))
        @diffsync_clients[socket.id] = ds_client

        # Ensure we do not broadcast to a hub if it has already disconnected.
        socket.on 'end', () =>
            winston.debug("DISCONNECT: socket connection #{socket.id} from global hub disconected.")
            delete @diffsync_clients[socket.id]

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
            session.add_client(client_socket)
            client_socket.write_mesg 'json', message.codemirror_session
                id           : mesg.id,
                session_uuid : session.session_uuid
                path         : session.path
                content      : session.content
                chat         : session.chat_log()

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
        opt = defaults opts,
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
        winston.debug("codemirror.handle_mesg: '#{json(mesg)}'")
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
            winston.debug("Determine whether the path '#{path}' is a directory or file.")
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
                winston.debug("'#{path}' is a directory, so archive it to '#{target}', change path, and read that file")
                archive = mesg.archive
                if path[path.length-1] == '/'  # common nuisance with paths to directories
                    path = path.slice(0,path.length-1)
                split = misc.path_split(path)
                path = target
                winston.debug("tar #{misc.to_json(['jcf', target, split.tail, split.head])}...")
                child_process.execFile 'tar', ['jcf', target, split.tail], {cwd:split.head}, (err, stdout, stderr) ->
                    if err
                        winston.debug("Issue creating tarball: #{err}, #{stdout}, #{stderr}")
                        cb(err)
                    else
                        cb()
            else
                winston.debug("It is a file.")
                cb()

        (cb) ->
            winston.debug("Read the file into memory.")
            fs.readFile path, (err, _data) ->
                data = _data
                cb(err)

        (cb) ->
            winston.debug("Compute hash of file.")
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
            winston.debug("Finally, we send the file as a blob back to the hub.")
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
                    winston.debug('writing the file')
                    fs.writeFile(path, value.blob, cb)
            ], (err) ->
                if err
                    winston.debug("error writing file -- #{err}")
                    socket.write_mesg 'json', message.error(id:mesg.id, error:err)
                else
                    winston.debug("wrote file '#{path}' fine")
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
                    error : "Error executing code '#{mesg.command}, #{mesg.bash}' -- #{err}, #{out?.stdout}, #{out?.stderr}"
                socket.write_mesg('json', err_mesg)
            else
                winston.debug(json(out))
                socket.write_mesg 'json', message.project_exec_output
                    id        : mesg.id
                    stdout    : out.stdout
                    stderr    : out.stderr
                    exit_code : out.exit_code


###############################################
# Handle a message form the client
###############################################

handle_mesg = (socket, mesg) ->
    try
        winston.debug("Handling '#{json(mesg)}'")
        if mesg.event.split('_')[0] == 'codemirror'
            codemirror_sessions.handle_mesg(socket, mesg)
            return

        switch mesg.event
            when 'connect_to_session', 'start_session'
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
                switch mesg.signal
                    when 2
                        signal = 'SIGINT'
                    when 3
                        signal = 'SIGQUIT'
                    when 9
                        signal = 'SIGKILL'
                    else
                        throw("only signals 2 (SIGINT), 3 (SIGQUIT), and 9 (SIGKILL) are supported")
                process.kill(mesg.pid, signal)
                if mesg.id?
                    socket.write_mesg('json', message.signal_sent(id:mesg.id))
            when 'terminate_session'
                terminate_session(socket, mesg)
            else
                if mesg.id?
                    err = message.error(id:mesg.id, error:"Local hub received an invalid mesg type '#{mesg.event}'")
                socket.write_mesg('json', err)
    catch e
        winston.debug(new Error().stack)
        winston.error "ERROR: '#{e}' handling message '#{json(mesg)}'"

server = net.createServer (socket) ->
    winston.debug "PARENT: received connection"

    misc_node.unlock_socket socket, secret_token, (err) ->
        if err
            winston.debug(err)
        else
            socket.id = uuid.v4()
            misc_node.enable_mesg(socket)
            socket.on 'mesg', (type, mesg) ->
                if type == "json"   # other types are handled elsewhere in event code.
                    winston.debug "received control mesg #{json(mesg)}"
                    handle_mesg(socket, mesg)

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    init_confpath()
    server.listen program.port, '127.0.0.1', () ->
        winston.info "listening on port #{server.address().port}"
        fs.writeFile(abspath('.sagemathcloud/data/local_hub.port'), server.address().port)


# daemonize it

program = require('commander')
daemon  = require("start-stop-daemon")

program.usage('[start/stop/restart/status] [options]')
    .option('--pidfile [string]', 'store pid in this file', String, abspath(".sagemathcloud/data/local_hub.pid"))
    .option('--logfile [string]', 'write log to this file', String, abspath(".sagemathcloud/data/local_hub.log"))
    .parse(process.argv)

if program._name == 'local_hub.js'
    winston.debug "Running as a Daemon"
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    console.log("start daemon")
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)
    console.log("after daemon")
