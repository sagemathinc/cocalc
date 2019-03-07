###

CoCalc: Collaborative web-based SageMath, Jupyter, LaTeX and Terminals.
Copyright 2015, SageMath, Inc., GPL v3.

local_hub -- a node.js program that runs as a regular user, and
             coordinates and maintains the connections between
             the global hubs and *all* projects running as
             this particular user.

The local_hub is a bit like the "screen" program for Unix, except
that it simultaneously manages numerous sessions, since simultaneously
doing a lot of IO-based things is what Node.JS is good at.
###

require('ts-node').register(project:"#{__dirname}/tsconfig.json", cacheDirectory:'/tmp')

path    = require('path')
async   = require('async')
fs      = require('fs')
os      = require('os')
net     = require('net')
uuid    = require('uuid')
winston = require('winston')
request = require('request')
program = require('commander')          # command line arguments -- https://github.com/visionmedia/commander.js/

BUG_COUNTER = 0

process.addListener "uncaughtException", (err) ->
    winston.debug("BUG ****************************************************************************")
    winston.debug("Uncaught exception: " + err)
    winston.debug(err.stack)
    winston.debug("BUG ****************************************************************************")
    if console? and console.trace?
        console.trace()
    BUG_COUNTER += 1

exports.get_bugs_total = ->
    return BUG_COUNTER

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

require('coffeescript/register')

message     = require('smc-util/message')
misc        = require('smc-util/misc')
smc_version = require('smc-util/smc-version')
misc_node   = require('smc-util-node/misc_node')

memory      = require('smc-util-node/memory')
memory.init(winston.debug)

{to_json, from_json, defaults, required}   = require('smc-util/misc')

# Functionality special to the KuCalc environment.
kucalc = require('./kucalc')

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

# See https://github.com/sagemathinc/cocalc/issues/174 -- some stupid (?)
# code sometimes assumes this exists, and it's not so hard to just ensure
# it does, rather than fixing any such code.
SAGE = path.join(process.env.HOME, '.sage')

for directory in [SMC, DATA, SAGE]
    if not fs.existsSync(directory)
        fs.mkdirSync(directory)


CONFPATH = exports.CONFPATH = misc_node.abspath(DATA)

common = require('./common')
json = common.json

INFO = undefined
hub_client = undefined
init_info_json = (cb) ->  # NOTE: cb should only be required to guarantee info.json file written, not that INFO var is initialized.
    winston.debug("initializing INFO")
    filename = "#{SMC}/info.json"
    if kucalc.IN_KUCALC and process.env.COCALC_PROJECT_ID? and process.env.COCALC_USERNAME?
        project_id = process.env.COCALC_PROJECT_ID
        username   = process.env.COCALC_USERNAME
    else
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
        # earlier, there was eth0, but newer Ubuntu's on GCP have ens4
        nics = require('os').networkInterfaces()
        mynic = nics.eth0 ? nics.ens4
        host = mynic?[0].address
    base_url = process.env.SMC_BASE_URL ? ''
    port     = 22
    INFO =
        project_id : project_id
        location   : {host:host, username:username, port:port, path:'.'}
        base_url   : base_url
    exports.client = hub_client = new Client(INFO.project_id)
    fs.writeFile filename, misc.to_json(INFO), (err) ->
        if err
            winston.debug("Writing 'info.json' -- #{err}")
        else
            winston.debug("Wrote 'info.json'")
        cb?(err)

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

# Handle a message from the hub
handle_mesg = (socket, mesg, handler) ->
    #dbg = (m) -> winston.debug("handle_mesg: #{m}")
    #dbg("mesg=#{json(mesg)}")

    if hub_client.handle_mesg(mesg, socket)
        return

    switch mesg.event
        when 'heartbeat'
            winston.debug("received heartbeat on socket '#{socket.id}'")
            socket.heartbeat = new Date()
        when 'connect_to_session', 'start_session'
            # These sessions completely take over this connection, so we stop listening
            # for further control messages on this connection.
            socket.removeListener('mesg', handler)
            connect_to_session(socket, mesg)
        when 'jupyter_port'
            # start jupyter server if necessary and send back a message with the port it is serving on
            jupyter_manager.jupyter_port(socket, mesg)
        when 'project_exec'
            # this is no longer used by web browser clients; however it could be used by the HTTP api.
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
            winston.debug("hello from hub -- sending back our version = #{smc_version.version}")
            socket.write_mesg('json', message.version(version:smc_version.version))
        else
            if mesg.id?
                # only respond with error if there is an id -- otherwise response has no meaning.
                err = message.error(id:mesg.id, error:"Local hub failed to handle mesg of type '#{mesg.event}'")
                socket.write_mesg('json', err)
            else
                winston.debug("Dropping unknown mesg type '#{mesg.event}'")


###
Use exports.client object below to work with the local_hub
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

public_paths = require('./public-paths')
public_paths_monitor = undefined

start_tcp_server = (secret_token, port, cb) ->
    # port: either numeric or 'undefined'
    if not secret_token?
        cb("secret token must be defined")
        return

    winston.info("starting tcp server: project <--> hub...")
    server = net.createServer (socket) ->
        winston.debug("received new connection from #{socket.remoteAddress}")
        socket.on 'error', (err) ->
            winston.debug("socket '#{socket.remoteAddress}' error - #{err}")

        misc_node.unlock_socket socket, secret_token, (err) ->
            if err
                winston.debug(err)
            else
                socket.id = uuid.v4()
                socket.heartbeat = new Date()  # obviously working now
                misc_node.enable_mesg(socket)

                handler = (type, mesg) ->
                    if mesg.event not in ['connect_to_session', 'start_session']
                        # This is a control connection, so we can use it to call the hub later.
                        hub_client.active_socket(socket)
                    if type == "json"   # other types are handled elsewhere in event handling code.
                        #winston.debug("received control mesg -- #{json(mesg)}")
                        handle_mesg(socket, mesg, handler)

                socket.on('mesg', handler)

    port_file = misc_node.abspath("#{DATA}/local_hub.port")
    # https://nodejs.org/api/net.html#net_server_listen_port_hostname_backlog_callback ?
    server.listen port, '0.0.0.0', (err) ->
        if err
            winston.info("tcp_server failed to start -- #{err}")
            cb(err)
        else
            winston.info("tcp_server listening 0.0.0.0:#{server.address().port}")
            fs.writeFile(port_file, server.address().port, cb)

# Start listening for connections on the socket.
start_server = (tcp_port, raw_port, cb) ->
    the_secret_token = undefined
    if program.console_port
        console_sessions.set_port(program.console_port)
    # We run init_info_json to determine the INFO variable.
    # However, we do NOT wait for the cb of init_info_json to be called, since we don't care in this process that the file info.json was written.
    init_info_json()

    async.series([
        (cb) ->
            winston.debug("starting raw server...")
            raw_server.start_raw_server
                project_id : INFO.project_id
                base_url   : INFO.base_url
                host       : process.env.SMC_PROXY_HOST ? INFO.location.host ? 'localhost'
                data_path  : DATA
                home       : process.env.HOME
                port       : raw_port
                logger     : winston
                client     : exports.client
                cb         : cb
        (cb) ->
            if program.kucalc
                # not needed, since in kucalc supervisord manages processes.
                cb()
                return
            # This is also written by forever; however, by writing it directly it's also possible
            # to run the local_hub server in a console, which is useful for debugging and development.
            fs.writeFile(misc_node.abspath("#{DATA}/local_hub.pid"), "#{process.pid}", cb)
        (cb) ->
            winston.debug("initializing secret token...")
            secret_token.init_secret_token (err, token) ->
                if err
                    cb(err)
                else
                    the_secret_token = token
                    console_sessions.set_secret_token(token)
                    cb()
        (cb) ->
            winston.debug("starting tcp server...")
            start_tcp_server(the_secret_token, tcp_port, cb)
    ], (err) ->
        if err
            winston.debug("ERROR starting server -- #{err}")
        else
            public_paths_monitor = public_paths.monitor(hub_client) # monitor for changes to public paths
            winston.debug("Successfully started servers.")
        cb(err)
    )

program.usage('[?] [options]')
    .option('--tcp_port <n>', 'TCP server port to listen on (default: 0 = os assigned)', ((n)->parseInt(n)), 0)
    .option('--raw_port <n>', 'RAW server port to listen on (default: 0 = os assigned)', ((n)->parseInt(n)), 0)
    .option('--console_port <n>', 'port to find console server on (optional; uses port file if not given); if this is set we assume some other system is managing the console server and do not try to start it -- just assume it is listening on this port always', ((n)->parseInt(n)), 0)
    .option('--kucalc', "Running in the kucalc environment")
    .option('--test_firewall', 'Abort and exit w/ code 99 if internal GCE information is accessible')
    .parse(process.argv)

if program.kucalc
    winston.debug("running in kucalc")
    kucalc.IN_KUCALC = true
    # clean environment to get rid of nvm and other variables
    process.env.PATH = process.env.PATH.split(':').filter(((x) -> not x.startsWith('/cocalc/nvm'))).join(':')
    for name in ['NODE_PATH', 'NODE_ENV', 'NODE_VERSION', 'NVM_CD_FLAGS', 'NVM_DIR', 'NVM_BIN']
        delete process.env[name]

    if program.test_firewall
        kucalc.init_gce_firewall_test(winston)
else
    winston.debug("NOT running in kucalc")
    kucalc.IN_KUCALC = false


start_server program.tcp_port, program.raw_port, (err) ->
    if err
        process.exit(1)
