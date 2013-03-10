#################################################################
#
# local_hub -- runs as a regular user, and coordinates and maintains
#              the connections between the global hubs and a
#              specific project.
#
# The local_hub is a bit like the "screen" program for Unix.
#
#
# NOTE: For local debugging, run this way, since it gives better stack
# traces.
#
#         make_coffee && echo "require('local_hub').start_server()" | coffee
#
#################################################################

async          = require 'async'
fs             = require 'fs'
net            = require 'net'
child_process  = require 'child_process'
message        = require 'message'
misc           = require 'misc'
misc_node      = require 'misc_node'
winston        = require 'winston'
temp           = require 'temp'

{to_json, from_json, defaults, required}   = require 'misc'

###################################################
# The root path for the project is the directory
# in which local_hub is started.
###################################################

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
                        # recurssively make sure the entire chain of directories exists.
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
# SMC starts must be prefixed with this key.
#####################################################################

# WARNING -- the sage_server.py program can't get these definitions from
# here, since it is not written in node, so if this changes, it has
# to change there as well.
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
        winston.debug("_new_session: defined by #{misc.to_json(mesg)}")
        # Connect to port CONSOLE_PORT, send mesg, then hook sockets together.
        console_socket = misc_node.connect_to_locked_socket  port,secret_token, (err) =>
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

                # Connect the sockets together.
                client_socket.on 'data', (data) ->
                    console_socket.write(data)
                console_socket.on 'data', (data) ->
                    session.history += data
                    client_socket.write(data)

                @_sessions[mesg.session_uuid] = session

            console_socket.on 'end', () =>
                session = @_sessions[mesg.session_uuid]
                if session?
                    session.status = 'done'
                # TODO: should we close client_socket here?

    # Return object that describes status of all Console sessions
    info: () =>
        obj = {}
        for id, info of @_sessions
            obj[id] = {desc:info.desc, status:info.status, history_length:info.history.length}
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
        sage_socket = misc_node.connect_to_locked_socket port, secret_token, (err) =>
            if err
                forget_port('sage')
                client_socket.write_mesg('json', message.error(id:mesg.id, error:"local_hub -- Problem connecting to Sage server. -- #{err}"))
                winston.debug("_new_session: sage session denied connection: #{err}")
                return
            else
                winston.debug("successfully got a sage session connection.")
            # Request a Sage session from sage_server
            misc_node.enable_mesg(sage_socket)
            sage_socket.write_mesg('json', message.start_session(type:'sage'))
            # Read one JSON message back, which describes the session
            sage_socket.once 'mesg', (type, desc) =>
                client_socket.write_mesg('json', desc)
                plug(client_socket, sage_socket)
                @_sessions[mesg.session_uuid] = {socket:sage_socket, desc:desc, status:'running', clients:[client_socket]}
            sage_socket.on 'end', () =>
                session = @_sessions[mesg.session_uuid]
                # TODO: should we close client_socket here?
                if session?
                    session.status = 'done'

    # Return object that describes status of all Sage sessions
    info: () =>
        obj = {}
        for id, info of @_sessions
            obj[id] = {desc:info.desc, status:info.status}
        return obj

sage_sessions = new SageSessions()

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
    async.series([
        (cb) ->
            winston.debug("Determine whether the path is a directory or file.")
            fs.stat path, (err, stats) ->
                if err
                    cb(err)
                else
                    is_dir = stats.isDirectory()
                    cb()
        (cb) ->
            if is_dir
                winston.debug("It is a directory, so archive it to /tmp/, change path, and read that file")
                target = temp.path(suffix:'.tar.bz2')
                child_process.execFile 'tar', ['jcvf', target, path], (err, stdout, stderr) ->
                    if err
                        cb(err)
                    else
                        path = target
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
            socket.write_mesg 'json', message.file_read_from_project(id:mesg.id, data_uuid:id)
            socket.write_mesg 'blob', {uuid:id, blob:data}
            cb()
    ], (err) ->
        winston.debug("Error: #{err}")
        if err and err != 'file already known'
            socket.write_mesg 'json', message.error(id:mesg.id, error:err)
        if is_dir
            fs.exists path, (exists) ->
                if exists
                    winston.debug("It was a directory, so remove the temporary archive '#{path}'.")
                    fs.unlink(path, cb)
    )

write_file_to_project = (socket, mesg) ->
    data_uuid = mesg.data_uuid
    path = abspath(mesg.path)

    # Listen for the blob containg the actual content that we will write.
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
session_info = () ->
    return {'sage_sessions':sage_sessions.info(), 'console_sessions':console_sessions.info()}




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
        err_on_exit : true
        max_output  : mesg.max_output
        bash        : mesg.bash
        cb          : (err, out) ->
            if err
                err_mesg = message.error
                    id    : mesg.id
                    error : "Error executing code '#{mesg.command}, #{mesg.bash}' -- #{err}"
                socket.write_mesg('json', err_mesg)
            else
                winston.debug(misc.trunc(misc.to_json(out),512))
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
        switch mesg.event
            when 'connect_to_session', 'start_session'
                connect_to_session(socket, mesg)
            when 'project_session_info'
                resp = message.project_session_info
                    id         : mesg.id
                    project_id : mesg.project_id
                    info       : session_info()
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
            else
                if mesg.id?
                    err = message.error(id:mesg.id, error:"Local hub received an invalid mesg type '#{mesg.event}'")
                socket.write_mesg('json', err)
    catch e
        winston.error "ERROR: '#{e}' handling message '#{to_json(mesg)}'"

server = net.createServer (socket) ->
    winston.debug "PARENT: received connection"

    misc_node.unlock_socket socket, secret_token, (err) ->
        if err
            winston.debug(err)
        else
            misc_node.enable_mesg(socket)
            socket.on 'mesg', (type, mesg) ->
                if type == "json"   # other types are handled elsewhere in event code.
                    winston.debug "received control mesg #{to_json(mesg)}"
                    handle_mesg(socket, mesg)

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    init_confpath()
    server.listen program.port, '127.0.0.1', () ->
        winston.info "listening on port #{server.address().port}"
        fs.writeFile('.sagemathcloud/data/local_hub.port', server.address().port)


# daemonize it

program = require('commander')
daemon  = require("start-stop-daemon")

program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 0 = automatically allocated; saved to ~/.sagemathcloud/data/local_hub.port)', parseInt, 0)
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
