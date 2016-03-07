###

SageMathCloud: Collaborative web-based SageMath, Jupyter, LaTeX and Terminals.
Copyright 2015, SageMath, Inc., GPL v3.

local_hub -- a node.js program that runs as a regular user, and
             coordinates and maintains the connections between
             the global hubs and *all* projects running as
             this particular user.

The local_hub is a bit like the "screen" program for Unix, except
that it simultaneously manages numerous sessions, since simultaneously
doing a lot of IO-based things is what Node.JS is good at.
###

path    = require('path')
async   = require('async')
fs      = require('fs')
os      = require('os')
net     = require('net')
uuid    = require('node-uuid')
winston = require('winston')

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

require('coffee-script/register')

message   = require('smc-util/message')
misc      = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')

{to_json, from_json, defaults, required}   = require('smc-util/misc')

# The raw http server
raw_server = require('./raw_server')

# Printing a file to pdf
print_to_pdf = require('./print_to_pdf')

# Generation of the secret token used to auth tcp connections
secret_token = require('./secret_token')

# Console sessions
console_session_manager = require('./console_session_manager')
console_sessions = new console_session_manager.ConsoleSessions()

# Ports for the various servers
port_manager = require('./port_manager')

# Reading and writing files to/from project and sending over socket
read_write_files = require('./read_write_files')

# Jupyter server
jupyter_manager = require('./jupyter_manager')

# Executing shell code
{exec_shell_code} = require('./exec_shell_code')

# Saving blobs to a hub
blobs = require('./blobs')

# Client for connecting back to a hub
{Client} = require('./client')

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

CONFPATH = exports.CONFPATH = misc_node.abspath(DATA)

common = require('./common')
json = common.json

INFO = undefined
init_info_json = (cb) ->
    winston.debug("writing info.json")
    filename = "#{SMC}/info.json"
    v = process.env.HOME.split('/')
    project_id = v[v.length-1]
    username   = project_id.replace(/-/g,'')
    if process.env.SMC_HOST?
        host = process.env.SMC_HOST
    else if os.hostname() == 'sagemathcloud'
        # special case for the VirtualBox VM
        host = 'localhost'
    else
        # what we want for the Google Compute engine deployment
        host = require('os').networkInterfaces().eth0?[0].address
    base_url = process.env.SMC_BASE_URL ? ''
    port     = 22
    INFO =
        project_id : project_id
        location   : {host:host, username:username, port:port, path:'.'}
        base_url   : base_url
    fs.writeFileSync(filename, misc.to_json(INFO))

init_info_json()

# Connecting to existing session or making a new one.
connect_to_session = (socket, mesg) ->
    winston.debug("connect_to_session -- type='#{mesg.type}'")
    switch mesg.type
        when 'console'
            console_sessions.connect(socket, mesg)
        else
            err = message.error(id:mesg.id, error:"Unsupported session type '#{mesg.type}'")
            socket.write_mesg('json', err)

# Kill an existing session.
terminate_session = (socket, mesg) ->
    cb = (err) ->
        if err
            mesg = message.error(id:mesg.id, error:err)
        socket.write_mesg('json', mesg)

    sid = mesg.session_uuid
    if console_sessions.session_exists(sid)
        console_sessions.terminate_session(sid, cb)
    else
        cb()

<<<<<<< HEAD
# Handle a message from the client (=hub)
=======
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

>>>>>>> master
handle_mesg = (socket, mesg, handler) ->
    dbg = (m) -> winston.debug("handle_mesg: #{m}")
    dbg("mesg=#{json(mesg)}")

    if hub_client.handle_mesg(mesg, socket)
        return

    switch mesg.event
        when 'connect_to_session', 'start_session'
            # These sessions completely take over this connection, so we stop listening
            # for further control messages on this connection.
            socket.removeListener('mesg', handler)
            connect_to_session(socket, mesg)
        when 'jupyter_port'
            # start jupyter server if necessary and send back a message with the port it is serving on
            jupyter_manager.jupyter_port(socket, mesg)
        when 'project_exec'
            exec_shell_code(socket, mesg)
        when 'read_file_from_project'
            read_write_files.read_file_from_project(socket, mesg)
        when 'write_file_to_project'
            read_write_files.write_file_to_project(socket, mesg)
        when 'print_to_pdf'
            print_to_pdf.print_to_pdf(socket, mesg)
        when 'send_signal'
            misc_node.process_kill(mesg.pid, mesg.signal)
            if mesg.id?
                # send back confirmation that a signal was sent
                socket.write_mesg('json', message.signal_sent(id:mesg.id))
        when 'terminate_session'
            terminate_session(socket, mesg)
        when 'save_blob'
            blobs.handle_save_blob_message(mesg)
        when 'error'
            winston.debug("ERROR from hub: #{mesg.error}")
        when 'hello'
            # No action -- this is used by the hub to send an initial control message that has no effect, so that
            # we know this socket will be used for control messages.
            winston.debug("hello from hub")
        else
            if mesg.id?
                err = message.error(id:mesg.id, error:"Local hub failed to handle mesg of type '#{mesg.event}'")
            socket.write_mesg('json', err)


###
Use explorts.client object below to work with the local_hub
interactively for debugging purposes when developing SMC in an SMC project.

1. Cd to the directory of the project, e.g.,
    /projects/45f4aab5-7698-4ac8-9f63-9fd307401ad7/smc/src/data/projects/f821cc2a-a6a2-4c3d-89a7-bcc6de780ebb
2. Setup the environment:
     export HOME=`pwd`; export SMC=$HOME/.smc/; export SMC_PROXY_HOST=0.0.0.0
3. Start coffees interpreter running
     coffee
4. Start the local_hub server:
     {client} = require('smc-project/local_hub')
5. Restart the hub, then get a directory listing of the project from the hub.

You have to restart the hub, since otherwise the hub will restart the
project, which will cause it to make another local_hub server, separate
from the one you just started running.
###

exports.client = hub_client = new Client(INFO.project_id)

start_tcp_server = (secret_token, cb) ->
    if not secret_token?
        cb("secret token must be defined")
        return

    winston.info("starting tcp server: project <--> hub...")
    server = net.createServer (socket) ->
        winston.debug("received new connection")

        misc_node.unlock_socket socket, secret_token, (err) ->
            if err
                winston.debug(err)
            else
                socket.id = uuid.v4()
                misc_node.enable_mesg(socket)

                socket.call_hub_callbacks = {}

                handler = (type, mesg) ->
                    if mesg.event not in ['connect_to_session', 'start_session']
                        # this is a control connection, so we can use it to call the hub later.
                        hub_client.active_socket(socket)
                    if type == "json"   # other types are handled elsewhere in event handling code.
                        winston.debug("received control mesg -- #{json(mesg)}")
                        handle_mesg(socket, mesg, handler)
                socket.on('mesg', handler)

                socket.on 'end', ->
                    for id, cb of socket.call_hub_callbacks
                        cb("socket closed")
                    socket.call_hub_callbacks = {}

    port_file = misc_node.abspath("#{DATA}/local_hub.port")
    server.listen undefined, '0.0.0.0', (err) ->
        if err
            winston.info("tcp_server failed to start -- #{err}")
            cb(err)
        else
            winston.info("tcp_server listening 0.0.0.0:#{server.address().port}")
            fs.writeFile(port_file, server.address().port, cb)

# Start listening for connections on the socket.
start_server = (cb) ->
    the_secret_token = undefined
    async.series([
        (cb) ->
            # This is also written by forever; however, by writing it directly it's also possible
            # to run the local_hub server in a console, which is useful for debugging and development.
            fs.writeFile(misc_node.abspath("#{DATA}/local_hub.pid"), "#{process.pid}", cb)
        (cb) ->
            secret_token.init_secret_token (err, token) ->
                if err
                    cb(err)
                else
                    the_secret_token = token
                    console_sessions.set_secret_token(token)
                    cb()
        (cb) ->
            start_tcp_server(the_secret_token, cb)
        (cb) ->
            raw_server.start_raw_server
                project_id : INFO.project_id
                base_url   : INFO.base_url
                host       : process.env.SMC_PROXY_HOST ? INFO.location.host
                data_path  : DATA
                home       : process.env.HOME
                cb         : cb
    ], (err) ->
        if err
            winston.debug("ERROR starting server -- #{err}")
        else
            winston.debug("Successfully started servers.")
        cb(err)
    )

process.addListener "uncaughtException", (err) ->
    winston.debug("BUG ****************************************************************************")
    winston.debug("Uncaught exception: " + err)
    winston.debug(err.stack)
    winston.debug("BUG ****************************************************************************")
    if console? and console.trace?
        console.trace()

start_server (err) ->
    if err
        process.exit(1)

