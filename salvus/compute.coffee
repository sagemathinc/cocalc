###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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
# compute -- a node.js client/server that provides a TCP server
# that is used by the hubs to organize compute nodes that
# get their projects from Google Cloud storage and store and
# snapshot them using Btrfs.
#
#################################################################

async     = require('async')
winston   = require('winston')
program   = require('commander')
daemon    = require('start-stop-daemon')
net       = require('net')
fs        = require('fs')
message   = require('message')
misc      = require('misc')
misc_node = require('misc_node')
uuid      = require('node-uuid')
cassandra = require('cassandra')
cql       = require("cassandra-driver")

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

{defaults, required} = misc

TIMEOUT = 60*60

BTRFS   = if process.env.SMC_BTRFS? then process.env.SMC_BTRFS else 'projects'
BUCKET  = process.env.SMC_BUCKET
ARCHIVE = process.env.SMC_ARCHIVE


#################################################################
#
# Client code -- runs in hub
#
#################################################################

###
x={};require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s)
###
compute_server_cache = undefined
exports.compute_server = compute_server = (opts) ->
    opts = defaults opts,
        database : undefined
        keyspace : undefined
        cb       : required
    if compute_server_cache?
        opts.cb(undefined, compute_server_cache)
    else
        new ComputeServerClient(opts)

class ComputeServerClient
    constructor: (opts) ->
        opts = defaults opts,
            database : undefined
            keyspace : undefined
            cb       : required
        if opts.database?
            @database = opts.database
            compute_server_cache = @
            opts.cb(undefined, @)
        else if opts.keyspace?
            fs.readFile "#{process.cwd()}/data/secrets/cassandra/hub", (err, password) =>
                if err
                    winston.debug("warning: no password file -- will only work if there is no password set.")
                    password = ''
                @database = new cassandra.Salvus
                    hosts       : ['localhost']
                    keyspace    : opts.keyspace
                    username    : 'hub'
                    consistency : cql.types.consistencies.localQuorum
                    password    : password.toString().trim()
                    cb          : (err) =>
                        if err
                            opts.cb(err)
                        else
                            compute_server_cache = @
                            opts.cb(undefined, @)
        else
            opts.cb("database or keyspace must be specified")

    dbg: (method) =>
        (m) => winston.debug("ComputeServerClient.#{method}: #{m}")

    ###
    # get info about server and add to database
         require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);s.add_server(host:'localhost', cb:(e)->console.log("done",e)))
    ###
    add_server: (opts) =>
        opts = defaults opts,
            host         : required
            dc           : 0         # 0, 1, 2, .etc.
            experimental : false     # if true, don't allocate new projects here
            timeout      : 30
            cb           : undefined
        dbg = @dbg("add_server(#{opts.host})")
        dbg("adding compute server to the database by grabbing conf files, etc.")

        get_file = (path, cb) =>
            dbg("get_file: #{path}")
            misc_node.execute_code
                command : "ssh"
                path    : process.cwd()
                timeout : opts.timeout
                args    : ['-o', 'StrictHostKeyChecking=no', opts.host, "cat #{path}"]
                verbose : 0
                cb      : (err, output) =>
                    if err
                        cb(err)
                    else if output?.stderr and output.stderr.indexOf('No such file or directory') != -1
                        cb(output.stderr)
                    else
                        cb(undefined, output.stdout)

        set =
            dc           : opts.dc
            port         : undefined
            secret       : undefined
            experimental : opts.experimental

        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        get_file program.port_file, (err, port) =>
                            set.port = parseInt(port); cb(err)
                    (cb) =>
                        get_file program.secret_file, (err, secret) =>
                            set.secret = secret
                            cb(err)
                ], cb)
            (cb) =>
                dbg("update database")
                @database.update
                    table : 'compute_servers'
                    set   : set
                    where : {host:opts.host}
                    cb    : cb
        ], (err) => opts.cb?(err))

    # compute servers health/load info
    servers: (opts) =>
        opts = defaults opts,
            cb       : required

    # get a socket connection to a particular compute server
    socket: (opts) =>
        opts = defaults opts,
            host : required
            cb   : required
        dbg = @dbg("socket(#{opts.host})")

        if not @_socket_cache?
            @_socket_cache = {}
        socket = @_socket_cache[opts.host]
        if socket?
            opts.cb(undefined, socket)
            return
        info = undefined
        async.series([
            (cb) =>
                dbg("getting port and secret...")
                @database.select_one
                    table     : 'compute_servers'
                    columns   : ['port', 'secret']
                    where     : {host: opts.host}
                    objectify : true
                    cb        : (err, x) =>
                        info = x; cb(err)
            (cb) =>
                dbg("connecting to #{opts.host}:#{info.port}...")
                misc_node.connect_to_locked_socket
                    host    : opts.host
                    port    : info.port
                    token   : info.secret
                    timeout : 15
                    cb      : (err, socket) =>
                        if err
                            dbg("failed to connect: #{err}")
                            cb(err)
                        else
                            @_socket_cache[opts.host] = socket
                            misc_node.enable_mesg(socket)
                            socket.id = uuid.v4()
                            dbg("successfully connected -- socket #{socket.id}")
                            socket.on 'close', () =>
                                dbg("socket #{socket.id} closed")
                                if @_socket_cache[opts.host].id == socket.id
                                    delete @_socket_cache[opts.host]
                                socket.removeAllListeners()
                            cb()
        ], (err) =>
            opts.cb(err, @_socket_cache[opts.host])
        )

    ###
    Send message to a server and get back result:

    x={};require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s;x.s.call(host:'localhost',mesg:{event:'ping'},cb:console.log))
    ###
    call: (opts) =>
        opts = defaults opts,
            host    : required
            mesg    : undefined
            timeout : 15
            cb      : required

        dbg = @dbg("call(#{opts.host})")
        dbg("(hub --> compute) #{misc.to_safe_str(opts.mesg)}")
        socket = undefined
        resp = undefined
        if not opts.mesg.id?
            opts.mesg.id = uuid.v4()
        async.series([
            (cb) =>
                @socket
                    host : opts.host
                    cb   : (err, s) =>
                        socket = s; cb(err)
            (cb) =>
                socket.write_mesg 'json', opts.mesg, (err) =>
                    if err
                        cb("error writing to socket -- #{err}")
                    else
                        dbg("waiting to receive response")
                        socket.recv_mesg
                            type    : 'json'
                            id      : opts.mesg.id
                            timeout : opts.timeout
                            cb      : (mesg) =>
                                @dbg("got response -- #{misc.to_safe_str(mesg)}")
                                if mesg.event == 'error'
                                    cb(mesg.error)
                                else
                                    delete mesg.id
                                    resp = mesg
                                    cb()
        ], (err) => opts.cb(err, resp))

    ###
    Get a project:
        x={};require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s;x.s.project(project_id:'20257d4e-387c-4b94-a987-5d89a3149a00',cb:(e,p)->console.log(e);x.p=p))
    ###
    project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        if not @_project_cache?
            @_project_cache = {}
        p = @_project_cache[opts.project_id]
        if p?
            opts.cb(undefined, p)
        else
            new ProjectClient
                project_id     : opts.project_id
                compute_server : @
                cb             : (err, project) =>
                    if err
                        opts.cb(err)
                    else
                        @_project_cache[opts.project_id] = project
                        opts.cb(undefined, project)

class ProjectClient
    constructor: (opts) ->
        opts = defaults opts,
            project_id     : required
            compute_server : required
            cb             : required
        @project_id = opts.project_id
        @compute_server = opts.compute_server
        @host = 'localhost'  # todo
        @dbg('constructor')()
        opts.cb(undefined, @)

    dbg: (method) =>
        (m) => winston.debug("ProjectClient(#{@project_id},#{@host}).#{method}: #{m}")

    _action: (opts) =>
        opts = defaults opts,
            action  : required
            args    : undefined
            timeout : 15
            cb      : required
        dbg = @dbg("action")
        dbg("action=#{opts.action}; params=#{misc.to_safe_str(opts.params)}")
        @compute_server.call
            host : @host
            mesg :
                message.compute
                    project_id : @project_id
                    action     : opts.action
                    args       : opts.args
            timeout : opts.timeout
            cb      : opts.cb

    ###
       The state of the project, which is one of:
       closed, opened, running,
       opening, starting, restarting, stopping
       error

    x={};require('compute').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s;x.s.project(project_id:'20257d4e-387c-4b94-a987-5d89a3149a00',cb:(e,p)->console.log(e);x.p=p; x.p.state(cb:console.log)))


    ###

    state: (opts) =>
        opts = defaults opts,
            cb     : required
        @_action
            action : "state"
            cb     : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, resp.state)

    # open project files on some node
    open: (opts) =>
        opts = defaults opts,
            cb     : required

    # start local_hub daemon running (must be opened somewhere)
    start: (opts) =>
        opts = defaults opts,
            cb     : required

    # kill everything and remove project from this compute node  (must be opened somewhere)
    close: (opts) =>
        opts = defaults opts,
            force  : false
            nosave : false
            cb     : required

    # move project from one compute node to another one
    move: (opts) =>
        opts = defaults opts,
            target : required
            cb     : required

    # kill all processes, then start
    restart: (opts) =>
        opts = defaults opts,
            cb     : required

    # kill all processes
    stop: (opts) =>
        opts = defaults opts,
            cb     : required

    # create snapshot, save incrementals to cloud storage
    save: (opts) =>
        opts = defaults opts,
            cb     : required

    # project location and listening port
    address: (opts) =>
        opts = defaults opts,
            cb     : required

    # information about project (ports, state, etc.)
    status: (opts) =>
        opts = defaults opts,
            cb     : required


    # copy a path using rsync from one project to another
    copy_path: (opts) =>
        opts = defaults opts,
            target_project_id : required
            target_path       : ""        # path into project; if "", defaults to path above.
            overwrite_newer   : false     # if true, newer files in target are copied over (otherwise, uses rsync's --update)
            delete            : false     # if true, delete files in dest path not in source, **including** newer files
            timeout           : undefined
            bwlimit           : undefined
            cb                : required

    # read a file or directory from disk
    read_file: (opts) =>
        opts = defaults opts,
            path    : required
            maxsize : 3000000    # maximum file size in bytes to read
            cb      : required

    # set various quotas
    set_quotas: (opts) =>
        opts = defaults opts,
            disk_quota   : undefined
            cores        : undefined
            memory       : undefined
            cpu_shares   : undefined
            network      : undefined
            cb           : required


#################################################################
#
# Server code -- runs on the compute server
#
#################################################################

TIMEOUT = 60*60

smc_compute = (opts) =>
    opts = defaults opts,
        args    : required
        timeout : TIMEOUT
        cb      : required
    winston.debug("smc_compute: running #{misc.to_json(opts.args)}")
    misc_node.execute_code
        command : "sudo"
        args    : ["/usr/local/bin/smc_compute.py", "--btrfs", BTRFS, '--bucket', BUCKET, '--archive', ARCHIVE].concat(opts.args)
        timeout : opts.timeout
        bash    : false
        path    : process.cwd()
        cb      : (err, output) =>
            winston.debug("smc_compute: finished running #{misc.to_json(opts.args)} -- #{err}")
            if err
                if output?.stderr
                    opts.cb(output.stderr)
                else
                    opts.cb(err)
            else
                opts.cb(undefined, if output.stdout then misc.from_json(output.stdout) else undefined)


class ComputeServer
    constructor: () ->
        @projects = {}

    # run a command for a project
    project_command: (opts) =>
        opts = defaults opts,
            project_id : required
            action     : required
            args       : undefined
            cb         : required
        args = [opts.action]
        if opts.args?
            args = args.concat(opts.args)
        args.push(opts.project_id)
        smc_compute
            args : args
            cb   : opts.cb

    # get state of a project on this node
    project_state: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        smc_compute
            args : ['status', opts.project_id]
            cb   : (err, r) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, r['state'])

###########################
## Command line interface
###########################

CONF = BTRFS + '/conf'

program.usage('[start/stop/restart/status] [options]')

    .option('--pidfile [string]',        'store pid in this file', String, "#{CONF}/compute.pid")
    .option('--logfile [string]',        'write log to this file', String, "#{CONF}/compute.log")

    .option('--port_file [string]',      'write port number to this file', String, "#{CONF}/compute.port")
    .option('--secret_file [string]',    'write secret token to this file', String, "#{CONF}/compute.secret")

    .option('--debug [string]',          'logging debug level (default: "" -- no debugging output)', String, 'debug')

    .option('--port [integer]',          'port to listen on (default: assigned by OS)', String, 0)
    .option('--address [string]',        'address to listen on (default: the tinc network if there, or eth1 if there, or 127.0.0.1)', String, '')

    .parse(process.argv)

program.port = parseInt(program.port)

if not program.address
    program.address = require('os').networkInterfaces().tun0?[0].address
    if not program.address
        program.address = require('os').networkInterfaces().eth1?[0].address  # my laptop vm...
    if not program.address  # useless
        program.address = '127.0.0.1'

secret_token = undefined
read_secret_token = (cb) ->
    if secret_token?
        cb()
        return
    dbg = (m) -> winston.debug("read_secret_token: #{m}")

    async.series([
        # Read or create the file; after this step the variable secret_token
        # is set and the file exists.
        (cb) ->
            dbg("check if file exists")
            fs.exists program.secret_file, (exists) ->
                if exists
                    dbg("exists -- now reading '#{program.secret_file}'")
                    fs.readFile program.secret_file, (err, buf) ->
                        if err
                            dbg("error reading the file '#{program.secret_file}'")
                            cb(err)
                        else
                            secret_token = buf.toString().trim()
                            cb()
                else
                    dbg("creating '#{program.secret_file}'")
                    require('crypto').randomBytes 64, (ex, buf) ->
                        secret_token = buf.toString('base64')
                        fs.writeFile(program.secret_file, secret_token, cb)
        (cb) ->
            dbg("Ensure restrictive permissions on the secret token file.")
            fs.chmod(program.secret_file, 0o600, cb)
    ], cb)

compute_server = undefined
handle_mesg = (socket, mesg) ->
    dbg = (m) => winston.debug("handle_mesg: #{m}")
    dbg("(hub -> compute)': #{misc.to_safe_str(mesg)}'")

    f = (cb) ->
        switch mesg.event
            when 'compute'
                if mesg.action == 'state'
                    compute_server.project_state
                        project_id : mesg.project_id
                        cb         : (err, state) ->
                            if err
                                cb(message.error(error:err))
                            else
                                cb({state:state})
                else
                    compute_server.project_command
                        project_id : mesg.project_id
                        action     : mesg.action
                        args       : mesg.args
                        cb         : (err, resp) ->
                            if err
                                cb(message.error(error:err))
                            else
                                cb(resp)
            when 'ping'
                cb(message.pong())
            else
                cb(message.error(error:"unknown event type: '#{mesg.event}'"))
    f (resp) ->
        resp.id = mesg.id
        dbg("(hub -> compute)': #{misc.to_safe_str(resp)}'")
        socket.write_mesg('json', resp)

start_tcp_server = (cb) ->
    dbg = (m) -> winston.debug("tcp_server: #{m}")
    dbg("start")

    compute_server = new ComputeServer()

    server = net.createServer (socket) ->
        dbg("received connection")
        socket.id = uuid.v4()
        misc_node.unlock_socket socket, secret_token, (err) ->
            if err
                dbg("ERROR: unable to unlock socket -- #{err}")
            else
                dbg("unlocked connection")
                misc_node.enable_mesg(socket)
                socket.on 'mesg', (type, mesg) ->
                    if type == "json"   # other types ignored -- we only deal with json
                        dbg("received mesg #{misc.to_safe_str(mesg)}")
                        try
                            handle_mesg(socket, mesg)
                        catch e
                            dbg(new Error().stack)
                            winston.error("ERROR: '#{e}' handling message '#{misc.to_safe_str(mesg)}'")

    get_port = (c) ->
        if program.port
            c()
        else
            # attempt once to use the same port as in port file, if there is one
            fs.exists program.port_file, (exists) ->
                if not exists
                    program.port = 0
                    c()
                else
                    fs.readFile program.port_file, (err, data) ->
                        if err
                            program.port = 0
                            c()
                        else
                            program.port = data.toString()
                            c()
    listen = (c) ->
        dbg("trying port #{program.port}")
        server.listen program.port, program.address, () ->
            dbg("listening on #{program.address}:#{program.port}")
            program.port = server.address().port
            fs.writeFile(program.port_file, program.port, cb)
        server.on 'error', (e) ->
            dbg("error getting port -- #{e}; try again in one second (type 'netstat -tulpn |grep #{program.port}' to figure out what has the port)")
            try_again = () ->
                server.close()
                server.listen(program.port, program.address)
            setTimeout(try_again, 1000)

    get_port () ->
        listen(cb)


start_server = (cb) ->
    winston.debug("start_server")
    async.series [read_secret_token, start_tcp_server], (err) ->
        if err
            winston.debug("Error starting server -- #{err}")
        else
            winston.debug("Successfully started server.")
        cb?(err)


main = () ->
    if program.debug
        winston.remove(winston.transports.Console)
        winston.add(winston.transports.Console, {level: program.debug, timestamp:true, colorize:true})

    winston.debug("running as a deamon")
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.debug("BUG ****************************************************************************")
        winston.debug("Uncaught exception: " + err)
        winston.debug(err.stack)
        winston.debug("BUG ****************************************************************************")

    fs.exists CONF, (exists) ->
        if exists
            fs.chmod(CONF, 0o700)     # just in case...

    daemon({max:999, pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)

if program._name.split('.')[0] == 'compute'
    main()
