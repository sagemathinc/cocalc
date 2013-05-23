#################################################################
#
# snap -- a node.js program that snapshots user projects
#
#    coffee -o node_modules/ snap.coffee && echo "require('snap').start_server()" | coffee
#
#################################################################

secret_key_length           = 128
registration_interval_seconds = 5

net       = require 'net'
winston   = require 'winston'
fs        = require 'fs'


uuid      = require 'node-uuid'
async     = require 'async'

backup    = require('backup')
message   = require 'message'
misc      = require 'misc'
misc_node = require 'misc_node'

program   = require('commander')
daemon    = require("start-stop-daemon")
cassandra = require('cassandra')

handle_mesg = (socket, mesg) ->
    winston.debug("handling mesg")

handle_connection = (socket) ->
    winston.debug("handling a new connection")
    misc_node.unlock_socket socket, secret_key, (err) ->
        if err
            winston.debug(err)
        else
            misc_node.enable_mesg(socket)
            handler = (type, mesg) ->
                if type == "json"
                    winston.debug "received mesg #{json(mesg)}"
                    handle_mesg(socket, mesg)
            socket.on 'mesg', handler

create_server = (cb) ->  # cb(err, randomly assigned port)
    server = net.createServer(handle_connection)
    server.listen 0, program.host, (err) ->
        cb(err, server.address().port)

snap_dir  = undefined
bup_dir   = undefined
uuid_file = undefined
initialize_snap_dir = (cb) ->
    snap_dir = program.snap_dir
    if snap_dir[0] != '/'
        snap_dir = process.cwd() + '/' + snap_dir
    bup_dir  = snap_dir + '/bup'
    uuid_file = snap_dir + '/server_uuid'
    winston.debug("path=#{snap_dir} should exist")
    misc_node.ensure_containing_directory_exists(uuid_file, cb)
    # TODO: we could do some significant checks at this point, e.g.,
    # ensure "fsck -g" works on the archive, delete tmp files, etc.


# Generate or read uuid of this server, which is the longterm identification
# of this entire backup set.  This is needed because we may move where
# the backup sets is hosted -- in fact, the port (part of the location) changes
# whenever the server restarts.
snap_server_uuid = undefined
initialize_server_uuid = (cb) ->
    fs.exists uuid_file, (exists) ->
        if exists
            fs.readFile uuid_file, (err, data) ->
                snap_server_uuid = data.toString()
                cb()
        else
            snap_server_uuid = uuid.v4()
            fs.writeFile uuid_file, snap_server_uuid, cb

# Connect to the cassandra database server; sets the global database variable.
database = undefined
connect_to_database = (cb) ->
    new cassandra.Salvus
        hosts    : program.database_nodes.split(',')
        keyspace : program.keyspace
        cb       : (err, db) ->
            database = db
            cb(err)

# Generate the random secret key and save it in global variable
secret_key = undefined
generate_secret_key = (cb) ->
    require('crypto').randomBytes secret_key_length, (ex, buf) ->
        secret_key = buf.toString('base64')
        cb()

# Write entry to the database periodicially (with ttl) that this
# snap server is up and running, and provide the key.
register_with_database = (cb) ->
    winston.debug("registering with database server...")
    host = "#{program.host}:#{listen_port}"
    database.update
        table : 'snap_servers'
        where : {id : snap_server_uuid}
        set   : {key:secret_key, host:host}
        ttl   : 2*registration_interval_seconds
        cb    : (err) ->
            setInterval(register_with_database, 1000*registration_interval_seconds)
            cb?()

# Ensure that we maintain and update snapshots of projects, according to our rules.
snapshot_projects = (cb) ->

# Start the network server on a random port, connect to database,
# start registering, and start snapshoting.
listen_port = undefined
exports.start_server = start_server = () ->
    winston.info "starting server..."
    async.series([
        (cb) ->
            create_server (err,port) ->
                listen_port = port
                cb(err)
        (cb) ->
            initialize_snap_dir(cb)
        (cb) ->
            initialize_server_uuid(cb)
        (cb) ->
            generate_secret_key(cb)
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            register_with_database(cb)
        (cb) ->
            snapshot_projects(cb)
    ])

program.usage('[start/stop/restart/status] [options]')
    .option('--pidfile [string]', 'store pid in this file', String, "data/pids/snap.pid")
    .option('--logfile [string]', 'write log to this file', String, "data/logs/snap.log")
    .option('--snap_dir [string]', 'all database files are stored here', String, "data/snap")
    .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "test")', String, 'test')
    .parse(process.argv)

if program._name == 'snap.js'
    winston.debug "snap daemon"

    conf =
        pidFile:program.pidfile
        outFile:program.logfile
        errFile:program.logfile

    daemon(conf, start_server)

    #process.addListener "uncaughtException", (err) ->
    #    winston.error "Uncaught exception: " + err
    #    if console? and console.trace?
    #        console.trace()


