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
exports.compute_server = (opts) ->
    opts = defaults opts,
        database : undefined
        keyspace : undefined
        cb       : required
    new ComputeServerClient(opts)

class ComputeServerClient
    constructor: (opts) ->
        opts = defaults opts,
            database : undefined
            keyspace : undefined
            cb       : required
        if opts.database?
            @database = opts.database
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
                            opts.cb(undefined, @)
        else
            opts.cb("database or keyspace must be specified")

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
        dbg = (m) => winston.debug("GlobalClient.register_server(#{opts.host}, #{opts.dc}): #{m}")
        dbg("adding compute server to the database by grabbing server_id files, etc.")

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
            host         : opts.host
            dc           : opts.dc
            port         : undefined
            secret       : undefined
            experimental : opts.experimental

        where =
            server_id : undefined

        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        get_file program.port_file, (err, port) =>
                            set.port = parseInt(port); cb(err)
                    (cb) =>
                        get_file program.server_id_file, (err, server_id) =>
                            where.server_id = server_id
                            cb(err)
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
                    where : where
                    cb    : cb
        ], (err) => opts.cb?(err))


    # compute server id's and health/load info
    servers: (opts) =>
        opts = defaults opts,
            cb       : required

    # send message to a server and get back result
    call: (opts) =>
        opts = defaults opts,
            server_id : required
            mesg      : undefined
            cb        : required


client_project_cache = {}
exports.client_project = (project_id) ->
    if not client_project_cache[project_id]?
        client_project_cache[project_id] = new ProjectClient(project_id:project_id)
    return client_project_cache[project_id]

class ProjectClient
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required

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

    # the state of the project, which is one of:
    #   closed, opened, running,
    #   opening, starting, restarting, stopping
    #   error
    state: (opts) =>
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
class ComputeServer
    constructor: () ->
        @projects = {}

    # run a command for a project (error if not allowed now due to state)
    project_command: (opts) =>
        opts = defaults opts,
            project_id : required
            command    : required
            args       : required
            cb         : required

    # get state of a project on this node
    project_state: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required


###########################
## Command line interface
###########################

CONF = BTRFS + '/conf'

program.usage('[start/stop/restart/status] [options]')

    .option('--pidfile [string]',        'store pid in this file', String, "#{CONF}/compute.pid")
    .option('--logfile [string]',        'write log to this file', String, "#{CONF}/compute.log")

    .option('--port_file [string]',      'write port number to this file', String, "#{CONF}/compute.port")
    .option('--server_id_file [string]', 'file in which server_id is stored', String, "#{CONF}/compute.id")
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

SERVER_ID = undefined

init_server_id = (cb) ->
    dbg = (m) -> winston.debug("init_server_id: #{m}")
    dbg()
    file = program.server_id_file
    fs.exists file, (exists) ->
        if not exists
            dbg("file '#{file}' does not exist, writing...")
            SERVER_ID = uuid.v4()
            fs.writeFile file, SERVER_ID, (err) ->
                if err
                    dbg("Error writing server_id file!")
                    cb(err)
                else
                    dbg("Wrote new SERVER_ID =#{SERVER_ID}")
                    cb()
        else
            dbg("file '#{file}' exists, reading...")
            fs.readFile file, (err, data) ->
                if err
                    dbg("error reading #{err}")
                    cb(err)
                else
                    dbg("read file")
                    SERVER_ID = data.toString()
                    cb()

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

handle_mesg = (socket, mesg) ->
    dbg = (m) => winston.debug("handle_mesg: #{m}")
    dbg("handling '#{misc.to_safe_str(mesg)}'")
    id = mesg.id
    #switch mesg.event
    #    else
    socket.write_mesg('json', message.error(id:id, error:"unknown event type: '#{mesg.event}'"))

start_tcp_server = (cb) ->
    dbg = (m) -> winston.debug("tcp_server: #{m}")
    dbg("start")

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
    async.series [init_server_id, read_secret_token, start_tcp_server], (err) ->
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
