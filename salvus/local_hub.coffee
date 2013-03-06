#################################################################
#
# local_hub
#
# For local debugging, run this way, since it gives better stack
# traces.
#
#         make_coffee && echo "require('local_hub').start_server()" | coffee
#
#################################################################

# TODO -- just for temporary testing
CONSOLE_PORT = 6020
SAGE_PORT    = 6021

async          = require 'async'
fs             = require 'fs'
net            = require 'net'
child_process  = require 'child_process'
message        = require 'message'
misc_node      = require 'misc_node'
winston        = require 'winston'
temp           = require 'temp'

{to_json, from_json, defaults, required}   = require 'misc'


###############################################
# Minimal proof-of-concept console session
###############################################

console_socket = undefined
console_session_desc = undefined
history = new Buffer(0)

start_console_session = (client_socket, mesg) ->
    winston.debug("Starting a console session.")

    # TEST
    if console_socket?
        # connect to existing session
        client_socket.write_mesg('json', console_session_desc)
        misc_node.disable_mesg(client_socket)
        client_socket.write(history)
        client_socket.on 'data', (data) ->
            console_socket.write(data)
        console_socket.on 'data', (data) ->
            client_socket.write(data)
        return

    # Connect to port CONSOLE_PORT, send mesg, then hook sockets together.
    console_socket = net.connect {port:CONSOLE_PORT}, ()->
        # Request console from actual console server
        misc_node.enable_mesg(console_socket)
        console_socket.write_mesg('json', mesg)
        console_socket.once 'mesg', (type, resp) ->
            console_session_desc = resp
            client_socket.write_mesg('json', console_session_desc)

            # Disable JSON mesg protocol
            misc_node.disable_mesg(console_socket)
            misc_node.disable_mesg(client_socket)

            # Connect the sockets together.
            client_socket.on 'data', (data) ->
                console_socket.write(data)
            console_socket.on 'data', (data) ->
                history += data
                client_socket.write(data)


###############################################
# Minimal proof-of-concept sage session
###############################################

sage_socket = undefined
sage_session_desc = undefined

start_sage_session = (client_socket, mesg) ->
    winston.debug("Starting a sage session.")

    # TEST
    if sage_socket?
        # connect to existing session
        client_socket.write_mesg('json', sage_session_desc)
        misc_node.disable_mesg(client_socket)
        client_socket.on 'data', (data) ->
            sage_socket.write(data)
        sage_socket.on 'data', (data) ->
            client_socket.write(data)
        return

    # Connect to port SAGE_PORT, send mesg, then hook sockets together.
    sage_socket = net.connect {port:SAGE_PORT}, ()->
        # Request console from actual console server
        misc_node.enable_mesg(sage_socket)
        sage_socket.write_mesg('json', mesg)
        sage_socket.once 'mesg', (type, resp) ->
            sage_session_desc = resp
            client_socket.write_mesg('json', sage_session_desc)

            # Disable JSON mesg protocol
            misc_node.disable_mesg(sage_socket)
            misc_node.disable_mesg(client_socket)

            # Connect the sockets together.
            client_socket.on 'data', (data) ->
                sage_socket.write(data)
            sage_socket.on 'data', (data) ->
                client_socket.write(data)


###############################################
# TODO
connect_to_console_session = (socket, mesg) ->
#start_sage_session = (socket, mesg) ->
connect_to_sage_session = (socket, mesg) ->

start_session = (socket, mesg) ->
    winston.debug("start_session -- type='#{mesg.type}'")
    switch mesg.type
        when 'console'
            start_console_session(socket, mesg)
        when 'sage'
            start_sage_session(socket, mesg)
        else
            err = message.error(id:mesg.id, error:"Unsupported session type '#{mesg.type}'")
            socket.write_mesg('json', err)

###############################################
# Execute a command line or block of BASH
###############################################
project_exec = (socket, mesg) ->
    winston.debug("project_exec")
    misc_node.execute_code
        command     : mesg.command
        args        : mesg.args
        path        : mesg.path
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
# Read and write individual files
###############################################

# Read a file located in the given project.  This will result in an
# error if the readFile function fails, e.g., if the file doesn't
# exist or the project is not open.  We then send the resulting file
# over the socket as a blob message.
#
# Directories get sent as a ".tar.bz2" file.
#
read_file_from_project = (socket, mesg) ->
    data   = undefined
    path   = mesg.path
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

    # Listen for the blob containg the actual content that we will write.
    write_file = (type, value) ->
        if type == 'blob' and value.uuid == data_uuid
            socket.removeListener 'mesg', write_file
            winston.debug("mesg --> #{misc.to_json(mesg)}, path=#{path}")
            async.series([
                (cb) ->
                    ensure_containing_directory_exists(mesg.path, cb)
                (cb) ->
                    fs.writeFile(mesg.path, value.blob, cb)
            ], (err) ->
                if err
                    socket.write_mesg 'json', message.error(id:mesg.id, error:err)
                else
                    socket.write_mesg 'json', message.file_written_to_project(id:mesg.id)
            )

    socket.on 'mesg', write_file


# Make sure that that the directory containing the file indicated by
# the path exists and has the right permissions.
ensure_containing_directory_exists = (path, cb) ->   # cb(err)
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


###############################################
# Handle a message form the client
###############################################

handle_client = (socket, mesg) ->
    try
        switch mesg.event
            when 'start_session'
                start_session(socket, mesg)
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
                    err = message.error(id:mesg.id, error:"Session server received an invalid mesg type '#{mesg.event}'")
                socket.write_mesg('json', err)
    catch e
        winston.error "ERROR: '#{e}' handling message '#{to_json(mesg)}'"

server = net.createServer (socket) ->
    winston.debug "PARENT: received connection"

    misc_node.enable_mesg(socket)
    socket.on 'mesg', (type, mesg) ->
        winston.debug "received control mesg #{to_json(mesg)}"
        handle_client(socket, mesg)

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    server.listen program.port, program.host, () -> winston.info "listening on port #{program.port}"

# daemonize it

program = require('commander')
daemon  = require("start-stop-daemon")

program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 6000)', parseInt, 6000)
    .option('--pidfile [string]', 'store pid in this file (default: ".session_server.pid")', String, ".session_server.pid")
    .option('--logfile [string]', 'write log to this file (default: ".session_server.log")', String, ".session_server.log")
    .option('--host [string]', 'bind to only this host (default: "127.0.0.1")', String, "127.0.0.1")
    .parse(process.argv)

if program._name == 'session_server.js'
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()
    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)


