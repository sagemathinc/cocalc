##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
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

###
This is the CoCalc Global HUB.  It runs as a daemon, sitting in the
middle of the action, connected to potentially thousands of clients,
many Sage sessions, and PostgreSQL database.  There are
many HUBs running.
###

require('coffee2-cache')

# Make loading typescript just work.
require('ts-node').register()

DEBUG = false

if not process.env.SMC_TEST
    if process.env.SMC_DEBUG or process.env.DEVEL
        DEBUG = true

# node.js -- builtin libraries
net            = require('net')
assert         = require('assert')
fs             = require('fs')
path_module    = require('path')
underscore     = require('underscore')
{EventEmitter} = require('events')
mime           = require('mime')
winston        = require('./winston-metrics').get_logger('hub')
memory         = require('smc-util-node/memory')

program = undefined  # defined below -- can't import with nodev6 at module level when hub.coffee used as a module.

# CoCalc path configurations (shared with webpack)
misc_node      = require('smc-util-node/misc_node')
SMC_ROOT       = misc_node.SMC_ROOT
SALVUS_HOME    = misc_node.SALVUS_HOME
OUTPUT_DIR     = misc_node.OUTPUT_DIR
STATIC_PATH    = path_module.join(SALVUS_HOME, OUTPUT_DIR)
WEBAPP_LIB     = misc_node.WEBAPP_LIB

underscore = require('underscore')

# CoCalc libraries
misc    = require('smc-util/misc')
{defaults, required} = misc
message    = require('smc-util/message')     # message protocol between front-end and back-end
client_lib = require('smc-util/client')
client     = require('./client')
sage       = require('./sage')               # sage server
auth       = require('./auth')
base_url   = require('./base-url')

local_hub_connection = require('./local_hub_connection')
hub_proxy            = require('./proxy')

MetricsRecorder = require('./metrics-recorder')

# express http server -- serves some static/dynamic endpoints
hub_http_server = require('./hub_http_server')

# registers the hub with the database periodically
hub_register = require('./hub_register')

# How frequently to register with the database that this hub is up and running,
# and also report number of connected clients
REGISTER_INTERVAL_S = 45   # every 45 seconds

init_smc_version = (db, cb) ->
    if db.is_standby
        cb()
        return
    server_settings = require('./server-settings')(db)
    server_settings.table.once('init', cb)
    # winston.debug("init smc_version: #{misc.to_json(smc_version.version)}")
    server_settings.table.on 'change', ->
        winston.debug("version changed -- sending updates to clients")
        for id, c of clients
            if c.smc_version < server_settings.version.version_recommended_browser
                c.push_version_update()

to_json = misc.to_json
from_json = misc.from_json

# third-party libraries: add any new nodejs dependencies to the NODEJS_PACKAGES list in build.py
async   = require("async")

Cookies = require('cookies')            # https://github.com/jed/cookies


# module scope variables:
database           = null

{init_support} = require('./support')

# the connected clients
clients = require('./clients').get_clients()

##############################
# File use tracking
##############################

normalize_path = (path) ->
    # Rules:
    # kdkd/tmp/.test.sagews.sage-chat --> kdkd/tmp/test.sagews, comment "chat"
    # foo/bar/.2014-11-01-175408.ipynb.syncdoc --> foo/bar/2014-11-01-175408.ipynb
    path = misc.trunc_middle(path, 2048)  # prevent potential attacks/mistakes involving a large path breaking things...
    ext = misc.filename_extension(path)
    action = 'edit'
    {head, tail} = misc.path_split(path)
    if ext == "sage-chat"
        action = 'chat'  # editing sage-chat gets the extra important chat action (instead of just edit)
        if tail?[0] == '.'
            # hidden sage-chat associated to a regular file, so notify about the regular file
            path = path.slice(0, path.length-'.sage-chat'.length)
            {head, tail} = misc.path_split(path)
            tail = tail.slice(1) # get rid of .
            if head
                path = head + '/' + tail
            else
                path = tail
    else if ext.slice(0,7) == 'syncdoc'   # for IPython, and possibly other things later
        path = path.slice(0, path.length - ext.length - 1)
        {head, tail} = misc.path_split(path)
        tail = tail.slice(1) # get rid of .
        if head
            path = head + '/' + tail
        else
            path = tail
    else if ext == "sage-history"
        path = undefined
    #else if ext == '.sagemathcloud.log'  # ignore for now
    #    path = undefined
    return {path:path, action:action}

##############################
# Create the Primus realtime socket server
##############################
primus_server = undefined
init_primus_server = (http_server) ->
    Primus = require('primus')
    # change also requires changing head.html
    opts =
        pathname    : path_module.join(BASE_URL, '/hub')
    primus_server = new Primus(http_server, opts)
    dbg = (args...) -> winston.debug('primus_server:', args...)
    dbg("listening on #{opts.pathname}")

    primus_server.on "connection", (conn) ->
        # Now handle the connection
        dbg("new connection from #{conn.address.ip} -- #{conn.id}")
        clients[conn.id] = new client.Client
            conn           : conn
            logger         : winston
            database       : database
            compute_server : compute_server
            host           : program.host
            port           : program.port
        dbg("num_clients=#{misc.len(clients)}")

#######################################################
# Pushing a message to clients; querying for clients.
# This is (or will be) subtle, due to having
# multiple HUBs running on different computers.
#######################################################

# get_client_ids -- given query parameters, returns a list of id's,
#   where the id is the connection id, which we assume is
#   globally unique across all of space and time.
get_client_ids = (opts) ->
    opts = defaults opts,
        account_id : undefined      # include connected clients logged in under this account
        project_id : undefined      # include connected clients that are a user of this project
        exclude    : undefined      # array of id's to exclude from results
        cb         : required
    result = []   # will have list of client id's in it

    # include a given client id in result, if it isn't in the exclude array
    include = (id) ->
        if id not in result
            if opts.exclude?
                if id in opts.exclude
                    return
            result.push(id)

    account_ids = {}   # account_id's to consider

    if opts.account_id?
        account_ids[opts.account_id] = true

    async.series([
        # If considering a given project, then get all the relevant account_id's.
        (cb) ->
            if opts.project_id?
                database.get_account_ids_using_project
                    project_id : opts.project_id
                    cb         : (err, result) ->
                        if err
                            cb(err); return
                        for r in result
                            account_ids[r] = true
                        cb()
            else
                cb()
        # Now get the corresponding connected client id's.
        (cb) ->
            for id, client of clients
                if account_ids[client.account_id]?
                    include(id)
            cb()
    ], (err) ->
        opts.cb(err, result)
    )


# Send a message to a bunch of clients connected to this hub.
# This does not send anything to other hubs or clients at other hubs; the only
# way for a message to go to a client at another hub is via some local hub.
# This design means that we do not have to track which hubs which
# clients are connected to in a database or registry, which wold be a nightmare
# especially due to synchronization issues (some TODO comments might refer to such
# a central design, because that *was* the non-implemented design at some point).
push_to_clients = (opts) ->
    opts = defaults opts,
        mesg     : required
        where    : undefined  # see the get_client_ids function
        to       : undefined
        cb       : undefined

    dest = []

    async.series([
        (cb) ->
            if opts.where?
                get_client_ids(misc.merge(opts.where, cb:(error, result) ->
                    if error
                        opts.cb?(true)
                        cb(true)
                    else
                        dest = dest.concat(result)
                        cb()
                ))
            else
                cb()

        (cb) ->
            # include all clients explicitly listed in "to"
            if opts.to?
                dest = dest.concat(opts.to)

            for id in dest
                client = clients[id]
                if client?
                    winston.debug("pushing a message to client #{id}")
                    client.push_to_client(opts.mesg)
                else
                    winston.debug("not pushing message to client #{id} since not actually connected")
            opts.cb?(false)
            cb()


    ])



reset_password = (email_address, cb) ->
    async.series([
        (cb) ->
            connect_to_database
                pool : 1
                cb   : cb
        (cb) ->
            database.reset_password
                email_address : email_address
                cb : cb
    ], (err) ->
        if err
            winston.debug("Error -- #{err}")
        else
            winston.debug("Password changed for #{email_address}")
        cb?()
    )


###
Connect to database
###
database = undefined

connect_to_database = (opts) ->
    opts = defaults opts,
        error : undefined   # ignored
        pool  : program.db_pool
        cb    : required
    dbg = (m) -> winston.debug("connect_to_database (PostgreSQL): #{m}")
    if database? # already did this
        dbg("already done")
        opts.cb(); return
    dbg("connecting...")
    database = require('./postgres').db
        host            : program.database_nodes.split(',')[0]  # postgres has only one master server
        database        : program.keyspace
        concurrent_warn : program.db_concurrent_warn
    database.connect(cb:opts.cb)

# client for compute servers
# The name "compute_server" below is CONFUSING; this is really a client for a
# remote server.
compute_server = undefined
init_compute_server = (cb) ->
    winston.debug("init_compute_server: creating compute_server client")
    f = (err, x) ->
        if not err
            winston.debug("compute server created")
        else
            winston.debug("FATAL ERROR creating compute server -- #{err}")
            cb?(err)
            return
        compute_server = x
        database.compute_server = compute_server
        # This is used by the database when handling certain writes to make sure
        # that the there is a connection to the corresponding project, so that
        # the project can respond.
        database.ensure_connection_to_project = (project_id, cb) ->
            winston.debug("ensure_connection_to_project -- project_id=#{project_id}")
            if database.is_standby
                cb?("using standby database; cannot connect to project")
                return
            local_hub_connection.connect_to_project(project_id, database, compute_server, cb)
        cb?()

    if program.kucalc
        f(undefined, require('./kucalc/compute-client').compute_client(database, winston))
    else
        require('./compute-client').compute_server
            database : database
            dev      : program.dev
            single   : program.single
            base_url : BASE_URL
            cb       : f

update_primus = (cb) ->
    misc_node.execute_code
        command : path_module.join(SMC_ROOT, WEBAPP_LIB, '/primus/update_primus')
        cb      : cb



# Delete expired data from the database.
delete_expired = (cb) ->
    async.series([
        (cb) ->
            connect_to_database(cb:cb)
        (cb) ->
            database.delete_expired
                count_only : false
                cb         : cb
    ], cb)

blob_maintenance = (cb) ->
    async.series([
        (cb) ->
            connect_to_database(error:99999, pool:5, cb:cb)
        (cb) ->
            database.blob_maintenance(cb:cb)
    ], cb)

update_stats = (cb) ->
    # This calculates and updates the statistics for the /stats endpoint.
    # It's important that we call this periodically, because otherwise the /stats data is outdated.
    async.series([
        (cb) ->
            connect_to_database(error:99999, pool:5, cb:cb)
        (cb) ->
            database.get_stats(cb:cb)
    ], cb)

stripe_sync = (dump_only, cb) ->
    dbg = (m) -> winston.debug("stripe_sync: #{m}")
    dbg()
    async.series([
        (cb) ->
            dbg("connect to the database")
            connect_to_database(error:99999, cb:cb)
        (cb) ->
            require('./stripe/sync').stripe_sync
                database  : database
                dump_only : dump_only
                logger    : winston
                cb        : cb
    ], cb)


#############################################
# Start everything running
#############################################
BASE_URL = ''
metric_blocked  = undefined
uncaught_exception_total = undefined

exports.start_server = start_server = (cb) ->
    winston.debug("start_server")

    winston.debug("dev = #{program.dev}")
    if program.dev
        # So cookies work over http, which dev mode can allow (e.g., on localhost).
        client.COOKIE_OPTIONS.secure = false
    else
        # Be very sure cookies do NOT work unless over https.  IMPORTANT.
        client.COOKIE_OPTIONS.secure = true

    BASE_URL = base_url.init(program.base_url)
    winston.debug("base_url='#{BASE_URL}'")

    fs.writeFileSync(path_module.join(SMC_ROOT, 'data', 'base_url'), BASE_URL)

    # the order of init below is important
    winston.debug("port = #{program.port}, proxy_port=#{program.proxy_port}, share_port=#{program.share_port}")
    winston.info("using database #{program.keyspace}")
    hosts = program.database_nodes.split(',')
    http_server = express_router = undefined

    # Log anything that blocks the CPU for more than 10ms -- see https://github.com/tj/node-blocked
    blocked = require('blocked')
    blocked (ms) ->
        if ms > 0
            metric_blocked?.inc(ms)
        # record that something blocked for over 10ms
        winston.debug("BLOCKED for #{ms}ms")

    # Log heap memory usage info
    memory.init(winston.debug)


    async.series([
        (cb) ->
            if not program.port
                cb(); return
            winston.debug("Initializing Metrics Recorder")
            MetricsRecorder.init(winston, (err, mr) ->
                if err?
                    cb(err)
                else
                    metric_blocked = MetricsRecorder.new_counter('blocked_ms_total', 'accumulates the "blocked" time in the hub [ms]')
                    uncaught_exception_total =  MetricsRecorder.new_counter('uncaught_exception_total', 'counts "BUG"s')
                    cb()
            )
        (cb) ->
            # this defines the global (to this file) database variable.
            winston.debug("Connecting to the database.")
            misc.retry_until_success
                f           : (cb) -> connect_to_database(cb:cb)
                start_delay : 1000
                max_delay   : 10000
                cb          : () ->
                    winston.debug("connected to database.")
                    cb()
        (cb) ->
            if not program.port
                cb(); return
            if not database.is_standby and (program.dev or program.update)
                winston.debug("updating the database schema...")
                database.update_schema(cb:cb)
            else
                cb()
        (cb) ->
            # This must happen *AFTER* update_schema above.
            init_smc_version(database, cb)
        (cb) ->
            if not program.port
                cb(); return
            require('./stripe/connect').init_stripe
                database : database
                logger   : winston
                cb       : cb
        (cb) ->
            if not program.port
                cb(); return
            init_support(cb)
        (cb) ->
            init_compute_server(cb)
        (cb) ->
            if not program.port
                cb(); return
            # proxy server and http server; Some of this working etc. *relies* on compute_server having been created.
            # However it can still serve many things without database.  TODO: Eventually it could inform user
            # that database isn't working.
            x = hub_http_server.init_express_http_server
                base_url       : BASE_URL
                dev            : program.dev
                compute_server : compute_server
                database       : database
                cookie_options : client.COOKIE_OPTIONS
            {http_server, express_router} = x
            winston.debug("starting express webserver listening on #{program.host}:#{program.port}")
            http_server.listen(program.port, program.host, cb)
        (cb) ->
            if not program.share_port
                cb(); return
            t0 = new Date()
            winston.debug("initializing the share server on port #{program.share_port}")
            winston.debug("...... (takes about 10 seconds) ......")
            x = require('./share/server').init
                database       : database
                base_url       : BASE_URL
                share_path     : program.share_path
                logger         : winston
            winston.debug("Time to initialize share server (jsdom, etc.): #{(new Date() - t0)/1000} seconds")
            winston.debug("starting share express webserver listening on #{program.share_host}:#{program.port}")
            x.http_server.listen(program.share_port, program.host, cb)
        (cb) ->
            if database.is_standby
                cb(); return
            if not program.port
                cb(); return
            async.parallel([
                (cb) ->
                    # init authentication via passport (requires database)
                    auth.init_passport
                        router   : express_router
                        database : database
                        base_url : BASE_URL
                        host     : program.host
                        cb       : cb
                (cb) ->
                    if (program.dev or program.update) and not program.kucalc
                        update_primus(cb)
                    else
                        cb()
            ], cb)
    ], (err) =>
        if err
            winston.error("Error starting hub services! err=#{err}")
        else
            # Synchronous initialize of other functionality, now that the database, etc., are working.
            winston.debug("base_url='#{BASE_URL}'")

            if program.port and not database.is_standby
                winston.debug("initializing primus websocket server")
                init_primus_server(http_server)

            if program.proxy_port
                winston.debug("initializing the http proxy server on port #{program.proxy_port}")
                hub_proxy.init_http_proxy_server
                    database       : database
                    compute_server : compute_server
                    base_url       : BASE_URL
                    port           : program.proxy_port
                    host           : program.host

            if program.port or program.share_port or program.proxy_port
                # Register periodically with the database.
                hub_register.start
                    database   : database
                    clients    : clients
                    host       : program.host
                    port       : program.port
                    interval_s : REGISTER_INTERVAL_S

                winston.info("Started hub. HTTP port #{program.port}; keyspace #{program.keyspace}")
        cb?(err)
    )

###
# Command line admin stuff -- should maybe be moved to another program?
###
add_user_to_project = (project_id, email_address, cb) ->
    account_id = undefined
    async.series([
        # ensure database object is initialized
        (cb) ->
            connect_to_database(cb:cb)
        # find account id corresponding to email address
        (cb) ->
            database.account_exists
                email_address : email_address
                cb            : (err, _account_id) ->
                    account_id = _account_id
                    cb(err)
        # add user to that project as a collaborator
        (cb) ->
            database.add_user_to_project
                project_id : project_id
                account_id : account_id
                group      : 'collaborator'
                cb         : cb
    ], cb)


#############################################
# Process command line arguments
#############################################

command_line = () ->
    program = require('commander')          # command line arguments -- https://github.com/visionmedia/commander.js/
    daemon  = require("start-stop-daemon")  # don't import unless in a script; otherwise breaks in node v6+
    default_db = process.env.PGHOST ? 'localhost'

    program.usage('[start/stop/restart/status/nodaemon] [options]')
        .option('--port <n>', 'port to listen on (default: 5000; 0 -- do not start)', ((n)->parseInt(n)), 5000)
        .option('--proxy_port <n>', 'port that the proxy server listens on (default: 0 -- do not start)', ((n)->parseInt(n)), 0)
        .option('--share_path [string]', 'path that the share server finds shared files at (default: "")', String, '')
        .option('--share_port <n>', 'port that the share server listens on (default: 0 -- do not start)', ((n)->parseInt(n)), 0)
        .option('--log_level [level]', "log level (default: debug) useful options include INFO, WARNING and DEBUG", String, "debug")
        .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
        .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', String, "data/pids/hub.pid")
        .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', String, "data/logs/hub.log")
        .option('--database_nodes <string,string,...>', "database address (default: '#{default_db}')", String, default_db)
        .option('--keyspace [string]', 'Database name to use (default: "smc")', String, 'smc')
        .option('--passwd [email_address]', 'Reset password of given user', String, '')
        .option('--update', 'Update schema and primus on startup (always true for --dev; otherwise, false)')
        .option('--stripe_sync', 'Sync stripe subscriptions to database for all users with stripe id', String, 'yes')
        .option('--stripe_dump', 'Dump stripe subscriptions info to ~/stripe/', String, 'yes')
        .option('--update_stats', 'Calculates the statistics for the /stats endpoint and stores them in the database', String, 'yes')
        .option('--delete_expired', 'Delete expired data from the database', String, 'yes')
        .option('--blob_maintenance', 'Do blob-related maintenance (dump to tarballs, offload to gcloud)', String, 'yes')
        .option('--add_user_to_project [project_id,email_address]', 'Add user with given email address to project with given ID', String, '')
        .option('--base_url [string]', 'Base url, so https://sitenamebase_url/', String, '')  # '' or string that starts with /
        .option('--local', 'If option is specified, then *all* projects run locally as the same user as the server and store state in .sagemathcloud-local instead of .sagemathcloud; also do not kill all processes on project restart -- for development use (default: false, since not given)', Boolean, false)
        .option('--foreground', 'If specified, do not run as a deamon')
        .option('--kucalc', 'if given, assume running in the KuCalc kubernetes environment')
        .option('--dev', 'if given, then run in VERY UNSAFE single-user local dev mode')
        .option('--single', 'if given, then run in LESS SAFE single-machine mode')
        .option('--db_pool <n>', 'number of db connections in pool (default: 1)', ((n)->parseInt(n)), 1)
        .option('--db_concurrent_warn <n>', 'be very unhappy if number of concurrent db requests exceeds this (default: 300)', ((n)->parseInt(n)), 300)
        .parse(process.argv)

        # NOTE: the --local option above may be what is used later for single user installs, i.e., the version included with Sage.

    if program._name.slice(0,3) == 'hub'
        # run as a server/daemon (otherwise, is being imported as a library)

        #if program.rawArgs[1] in ['start', 'restart']
        process.addListener "uncaughtException", (err) ->
            winston.debug("BUG ****************************************************************************")
            winston.debug("Uncaught exception: " + err)
            winston.debug(err.stack)
            winston.debug("BUG ****************************************************************************")
            database?.uncaught_exception(err)
            uncaught_exception_total?.inc(1)

        if program.passwd
            winston.debug("Resetting password")
            reset_password(program.passwd, (err) -> process.exit())
        else if program.stripe_sync
            winston.debug("Stripe sync")
            stripe_sync(false, (err) -> winston.debug("DONE", err); process.exit())
        else if program.stripe_dump
            winston.debug("Stripe dump")
            stripe_sync(true, (err) -> winston.debug("DONE", err); process.exit())
        else if program.delete_expired
            delete_expired (err) ->
                winston.debug("DONE", err)
                process.exit()
        else if program.blob_maintenance
            blob_maintenance (err) ->
                winston.debug("DONE", err)
                process.exit()
        else if program.update_stats
            update_stats (err) ->
                winston.debug("DONE", err)
                process.exit()
        else if program.add_user_to_project
            console.log("Adding user to project")
            v = program.add_user_to_project.split(',')
            add_user_to_project v[0], v[1], (err) ->
                if err
                     console.log("Failed to add user: #{err}")
                else
                     console.log("User added to project.")
                process.exit()
        else
            console.log("Running hub; pidfile=#{program.pidfile}, port=#{program.port}, proxy_port=#{program.proxy_port}, share_port=#{program.share_port}")
            # logFile = /dev/null to prevent huge duplicated output that is already in program.logfile
            if program.foreground
                start_server (err) ->
                    if err and program.dev
                        process.exit(1)
            else
                daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile, logFile:'/dev/null', max:30}, start_server)


if process.argv.length > 1
    command_line()

