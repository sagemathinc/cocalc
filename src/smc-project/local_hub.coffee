###

 SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.

    Copyright (C) 2014, William Stein

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

###


###

 local_hub -- a node.js program that runs as a regular user, and
              coordinates and maintains the connections between
              the global hubs and *all* projects running as
              this particular user.

 The local_hub is a bit like the "screen" program for Unix, except
 that it simultaneously manages numerous sessions, since simultaneously
 doing a lot of IO-based things is what Node.JS is good at.


 NOTE: For local debugging, run this way, since it gives better stack
 traces.CodeMirrorSession: _connect to file

         make_coffee && echo "require('local_hub').start_server()" | coffee

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

secret_token = require('./secret_token')

# Managing console sessions
console_session_manager = require('./console_session_manager')
console_sessions = new console_session_manager.ConsoleSessions()

# Manager file editing sessions
file_session_manager = require('./file_session_manager')

# Manages the ports for the various servers
port_manager = require('./port_manager')

# Reading and writing files to/from project and sending over socket
read_write_files = require('./read_write_files')

# Jupyter server
jupyter_manager = require('./jupyter_manager')

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
    fs.writeFile(filename, misc.to_json(INFO), cb)

###
Connecting to existing session or making a new one.
###

connect_to_session = (socket, mesg) ->
    winston.debug("connect_to_session -- type='#{mesg.type}'")
    switch mesg.type
        when 'console'
            console_sessions.connect(socket, mesg)
        else
            err = message.error(id:mesg.id, error:"Unsupported session type '#{mesg.type}'")
            socket.write_mesg('json', err)


###
Kill an existing session.
###
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

# File editing sessions
file_sessions = file_session_manager.file_sessions()

###
Execute a command line or block of BASH
###
project_exec = (socket, mesg) ->
    winston.debug("project_exec: #{misc.to_json(mesg)} in #{process.cwd()}")
    if mesg.command == "smc-jupyter"
        socket.write_mesg("json", message.error(id:mesg.id, error:"do not run smc-jupyter directly"))
        return
    misc_node.execute_code
        command     : mesg.command
        args        : mesg.args
        path        : misc_node.abspath(mesg.path)
        timeout     : mesg.timeout
        err_on_exit : mesg.err_on_exit
        max_output  : mesg.max_output
        bash        : mesg.bash
        cb          : (err, out) ->
            if err

                error = "Error executing command '#{mesg.command}' with args '#{mesg.args}' -- #{err}, #{out?.stdout}, #{out?.stderr}"
                if error.indexOf("Connection refused") != -1
                    error += "-- Email help@sagemath.com if you need external network access, which is disabled by default."
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

###
Saving blobs to hub
###
_save_blob_callbacks = {}
exports.receive_save_blob_message = (opts) ->  # temporarily used by file_session_manager
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

# Handle a message from the client (=hub)
handle_mesg = (socket, mesg, handler) ->
    dbg = (m) -> winston.debug("handle_mesg: #{m}")
    try
        dbg("mesg=#{json(mesg)}")
        if mesg.event.split('_')[0] == 'codemirror'
            dbg("codemirror")
            file_sessions.handle_mesg(socket, mesg)
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
                project_exec(socket, mesg)
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
                handle_save_blob_message(mesg)
            else
                if mesg.id?
                    err = message.error(id:mesg.id, error:"Local hub received an invalid mesg type '#{mesg.event}'")
                socket.write_mesg('json', err)
    catch e
        winston.debug(new Error().stack)
        winston.error("ERROR: '#{e}' handling message '#{json(mesg)}'")


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
                handler = (type, mesg) ->
                    if type == "json"   # other types are handled elsewhere in event handling code.
                        winston.debug("received control mesg -- #{json(mesg)}")
                        handle_mesg(socket, mesg, handler)
                socket.on 'mesg', handler

    server.listen undefined, '0.0.0.0', (err) ->
        if err
            winston.info("tcp_server failed to start -- #{err}")
            cb(err)
        else
            winston.info("tcp_server listening 0.0.0.0:#{server.address().port}")
            fs.writeFile(misc_node.abspath("#{DATA}/local_hub.port"), server.address().port, cb)

# Start listening for connections on the socket.
start_server = (cb) ->
    the_secret_token = undefined
    async.series([
        (cb) ->
            secret_token.init_secret_token (err, token) ->
                if err
                    cb(err)
                else
                    the_secret_token = token
                    console_sessions.set_secret_token(token)
                    cb()
        (cb) ->
            init_info_json(cb)
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

