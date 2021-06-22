#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# This is the CoCalc Global HUB.  It runs as a daemon, sitting in the
# middle of the action, connected to potentially thousands of clients,
# many Sage sessions, and PostgreSQL database.  There are
# many HUBs running.

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
winston        = require('./logger').getLogger('hub')
memory         = require('smc-util-node/memory')
port           = require('smc-util-node/port').default

program = undefined  # defined below -- can't import with nodev6 at module level when hub.coffee used as a module.

# CoCalc path configurations (shared with webpack)
misc_node      = require('smc-util-node/misc_node')
SMC_ROOT       = misc_node.SMC_ROOT
SALVUS_HOME    = misc_node.SALVUS_HOME

underscore = require('underscore')

# CoCalc libraries
misc    = require('smc-util/misc')
{defaults, required} = misc
message    = require('smc-util/message')     # message protocol between front-end and back-end
client     = require('./client')
sage       = require('./sage')               # sage server
auth       = require('./auth')
base_path   = require('smc-util-node/base-path').default
{migrate_account_token} = require('./postgres/migrate-account-token')
{init_start_always_running_projects} = require('./postgres/always-running')
healthchecks = require('./healthchecks')

{handle_mentions_loop} = require('./mentions/handle')

local_hub_connection = require('./local_hub_connection')
hub_proxy            = require('./proxy')

MetricsRecorder = require('./metrics-recorder')

# express http server -- serves some static/dynamic endpoints
hub_http_server = require('./hub_http_server')

try
    {LTIService} = require('./lti/lti')
catch
    # silly stub
    class LTIService
        start: =>
            throw new Error('NO LTI MODULE')


# registers the hub with the database periodically
hub_register = require('./hub_register')

# How frequently to register with the database that this hub is up and running,
# and also report number of connected clients
REGISTER_INTERVAL_S = 20

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
                cb   : cb
        (cb) ->
            database.reset_password
                email_address : email_address
                cb : cb
    ], (err) ->
        if err
            winston.info("Error -- #{err}")
        else
            winston.info("Password changed for #{email_address}")
        cb?()
    )


###
Connect to database
###
# database gets initialized below.
database = undefined

connect_to_database = (opts) ->
    opts = defaults opts,
        cb    : required
    opts.cb()

# client for compute servers
# The name "compute_server" below is CONFUSING; this is really a client for a
# remote server.
compute_server = undefined
init_compute_server = (cb) ->
    winston.info("init_compute_server: creating compute_server client")
    f = (err, x) ->
        if not err
            winston.info("compute server created")
        else
            winston.info("FATAL ERROR creating compute server -- #{err}")
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
            kubernetes : program.kubernetes
            cb       : f

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
            connect_to_database(cb:cb)
        (cb) ->
            database.blob_maintenance(cb:cb)
    ], cb)

start_lti_service = (cb) ->
    async.series([
        (cb) ->
            connect_to_database(cb:cb)
        (cb) ->
            init_compute_server(cb)
        (cb) ->
            lti_service = new LTIService(db:database, compute_server:compute_server)
            await lti_service.start()
    ])

start_landing_service = (cb) ->
    # This @cocalc/landing is a private npm package that is installed on https://cocalc.com only.
    {LandingServer} = require('@cocalc/landing')
    async.series([
        (cb) ->
            init_metrics(cb)
        (cb) ->
            connect_to_database(cb:cb)
        (cb) ->
            landing_server = new LandingServer(db:database)
            await landing_server.start()
    ])

update_stats = (cb) ->
    # This calculates and updates the statistics for the /stats endpoint.
    # It's important that we call this periodically, because otherwise the /stats data is outdated.
    async.series([
        (cb) ->
            connect_to_database(cb:cb)
        (cb) ->
            database.get_stats(cb:cb)
    ], (err) -> cb?(err))

init_update_stats = (cb) ->
    setInterval(update_stats, 30000)
    update_stats(cb)


# async function
update_site_license_usage_log = (cb) ->
    # This calculates and updates the site_license_usage_log
    # It's important that we call this periodically, if we want
    # to be able to monitor site license usage. This is enabled
    # by default only for dev mode (so for development).
    async.series([
        (cb) ->
            connect_to_database(cb:cb)
        (cb) ->
            try
                await database.update_site_license_usage_log()
                cb()
            catch err
                cb(err)
    ], (err) -> cb?(err))

init_update_site_license_usage_log = (cb) ->
    setInterval(update_site_license_usage_log, 30000)
    update_site_license_usage_log(cb)


stripe_sync = (cb) ->
    dbg = (m) -> winston.info("stripe_sync: #{m}")
    dbg()
    async.series([
        (cb) ->
            dbg("connect to the database")
            connect_to_database(error:99999, cb:cb)
        (cb) ->
            try
                await require('./stripe/sync').stripe_sync
                    database  : database
                    logger    : winston
                cb()
            catch err
                cb(err)
    ], cb)

init_metrics = (cb) ->
    winston.info("Initializing Metrics Recorder")
    MetricsRecorder.init(winston, (err, mr) ->
        if err?
            cb(err)
        else
            metric_blocked = MetricsRecorder.new_counter('blocked_ms_total', 'accumulates the "blocked" time in the hub [ms]')
            uncaught_exception_total =  MetricsRecorder.new_counter('uncaught_exception_total', 'counts "BUG"s')
            cb()
    )

#############################################
# Start everything running
#############################################
metric_blocked  = undefined
uncaught_exception_total = undefined

exports.start_server = start_server = (cb) ->
    winston.info("start_server")

    winston.info("dev = #{program.dev}")
    # Be very sure cookies do NOT work unless over https.  IMPORTANT.
    if not client.COOKIE_OPTIONS.secure
        throw Error("client cookie options are not secure")

    winston.info("base_path='#{base_path}'")

    # the order of init below is important
    winston.info("using database #{program.keyspace} and database-nodes=#{program.databaseNodes}")
    hosts = program.databaseNodes.split(',')
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
            if not program.websocketServer
                cb(); return
            init_metrics(cb)
        (cb) ->
            # this defines the global (to this file) database variable.
            winston.info("Connecting to the database.")
            misc.retry_until_success
                f           : (cb) -> connect_to_database(cb:cb)
                start_delay : 1000
                max_delay   : 10000
                cb          : () ->
                    winston.info("connected to database.")
                    cb()
        (cb) ->
            if not program.websocketServer
                cb(); return
            if not database.is_standby and (program.dev or program.update)
                winston.info("updating the database schema...")
                database.update_schema(cb:cb)
            else
                cb()
        (cb) ->
            # This must happen *AFTER* update_schema above.
            require('./servers/version').default()
            cb()
        (cb) ->
            # setting port must come before the hub_http_server.init_express_http_server below
            if program.agentPort
                healthchecks.set_agent_endpoint(program.agentPort, program.host)
            cb()
        (cb) ->
            try
                await migrate_account_token(database)
            catch err
                cb(err)
                return
            cb()
        (cb) ->
            winston.info("mentions=#{program.mentions}")
            if program.mentions
                winston.info("enabling handling of mentions...")
                handle_mentions_loop(database)
            else
                winston.info("not handling mentions");
            cb()
        (cb) ->
            if not program.websocketServer
                cb(); return
            try
                winston.info("initializing stripe support...")
                await require('./stripe').init_stripe(database, winston)
                cb()
            catch err
                cb(err)
        (cb) ->
            if not program.websocketServer
                cb(); return
            winston.info("initializing zendesk support...")
            init_support(cb)
        (cb) ->
            winston.info("initializing compute server...")
            init_compute_server(cb)
        (cb) ->
            if not program.dev or process.env.USER.length == 32
                # not in dev mode or in cocalc-docker, better not
                # kill everything, or we kill ourself!
                cb(); return
            # Whenever we start the dev server, we just assume
            # all projects are stopped, since assuming they are
            # running when they are not is bad.  Something similar
            # is done in cocalc-docker.
            winston.info("killing dev projects...")
            misc_node.execute_code  # in the scripts/ path...
                command : "cocalc_kill_all_dev_projects.py"

            async.series([
                (cb) =>
                    database._query
                        safety_check : false
                        query : """update projects set state='{"state":"opened"}'"""
                        cb    : cb
                (cb) =>
                    # For purposes of developing custom software images,
                    # we inject a couple of random entries into the table in the DB
                    database.insert_random_compute_images
                        cb     : cb
            ], (err) =>
                cb(err)
            )

        (cb) ->
            if program.dev or program.single
                init_update_stats(cb)
            else
                cb()
        (cb) ->
            if not program.dev
                cb(); return
            init_update_site_license_usage_log(cb)
        (cb) ->
            if not (program.dev or program.single or program.kubernetes)
                cb(); return
            init_start_always_running_projects(database)  # is async but runs forever, so don't wait for it!
            cb(); return
        (cb) ->
            # proxy server and http server; Some of this working etc. *relies* on compute_server having been created.
            # However it can still serve many things without database.  TODO: Eventually it could inform user
            # that database isn't working.
            x = await hub_http_server.init_express_http_server
                dev            : program.dev
                is_personal    : program.personal
                compute_server : compute_server
                database       : database
                cookie_options : client.COOKIE_OPTIONS
            {http_server, express_router} = x
            winston.info("starting express webserver listening on #{program.host}:#{port}")
            http_server.listen(port, program.host, cb)
        (cb) ->
            if not program.shareServer or program.dev  # TODO: right now dev gets its own share server
                cb(); return
            # TODO: we need to redo this like the dev server, so
            # it's just a different path on the same server, not
            # a separate server fighting for the port.
            t0 = new Date()
            winston.info("initializing the share server on port #{program.sharePort}")
            winston.info("...... (takes about 10 seconds) ......")
            x = await require('./share/server').init
                database       : database
                share_path     : program.sharePath
                logger         : winston
            winston.info("Time to initialize share server (jsdom, etc.): #{(new Date() - t0)/1000} seconds")
            winston.info("starting share express webserver listening on #{program.host}:#{port}")
            x.http_server.listen(port, program.host, cb)
        (cb) ->
            if database.is_standby
                cb(); return
            if not program.websocketServer
                cb(); return
            # init authentication via passport (requires database)
            auth.init_passport
                router   : express_router
                database : database
                host     : program.host
                cb       : cb
    ], (err) =>
        if err
            winston.error("Error starting hub services! err=#{err}")
        else
            # Synchronous initialize of other functionality, now that the database, etc., are working.
            winston.info("base_path='#{base_path}'")

            if program.websocketServer and not database.isStandby
                winston.info("initializing primus websocket server")
                require('./servers/primus').init
                    http_server : http_server
                    express_router : express_router
                    compute_server: compute_server
                    clients: clients
                    host: program.host
                    isPersonal: program.personal

            if program.proxyServer
                winston.info("initializing the http proxy server on port #{port}")
                # proxy's http server has its own minimal health check – we only enable the agent check
                hub_proxy.init_http_proxy_server
                    database       : database
                    compute_server : compute_server
                    host           : program.host
                    is_personal    : program.personal


            if program.websocketServer or program.proxyServer or program.shareServer
                winston.info("Starting registering periodically with the database and updating a health check...")

                if program.test
                    winston.info("setting up hub_register_cb for testing")
                    hub_register_cb = (err) ->
                        if err
                            winston.info("hub_register_cb err:", err)
                            process.exit(1)
                        else
                            process.exit(0)
                else
                    hub_register_cb = undefined

                hub_register.start
                    database   : database
                    clients    : clients
                    host       : program.host
                    port       : port
                    interval_s : REGISTER_INTERVAL_S
                    cb         : hub_register_cb

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


addErrorListeners = () ->
    process.addListener "uncaughtException", (err) ->
        winston.error("BUG ****************************************************************************")
        winston.error("Uncaught exception: " + err)
        winston.error(err.stack)
        winston.error("BUG ****************************************************************************")
        database?.uncaught_exception(err)
        uncaught_exception_total?.inc(1)

    process.on 'unhandledRejection', (reason, p) ->
        winston.error("BUG UNHANDLED REJECTION *********************************************************")
        winston.error('Unhandled Rejection at:', p, 'reason:', reason)
        winston.error("BUG UNHANDLED REJECTION *********************************************************")
        database?.uncaught_exception(p)
        uncaught_exception_total?.inc(1)


#############################################
# Process command line arguments
#############################################
program = {}

command_line = () ->
    { program } = require('commander')
    default_db = process.env.PGHOST ? 'localhost'

    program.option('--dev', 'if given, then run in VERY UNSAFE single-user dev mode; sets most servers enabled')
        .option('--websocket-server', 'run the websocket server')
        .option('--proxy-server', 'run the proxy server')
        .option('--share-server', 'run the share server')
        .option('--lti-server', 'just start the LTI service')
        .option('--landing-server', 'run the closed source landing pages server (requires @cocalc/landing installed)')
        .option('--share-path [string]', 'path that the share server finds shared files at (default: "")', '')
        .option('--agent-port <n>', 'port for HAProxy agent-check (default: 0 -- do not start)', ((n)->parseInt(n)), 0)
        .option('--log-level [level]', "log level (default: debug) useful options include INFO, WARNING and DEBUG", "debug")
        .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', "127.0.0.1")
        .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', "data/pids/hub.pid")
        .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', "data/logs/hub.log")
        .option('--database-nodes <string,string,...>', "database address (default: '#{default_db}')", default_db)
        .option('--keyspace [string]', 'Database name to use (default: "smc")', 'smc')
        .option('--passwd [email_address]', 'Reset password of given user', '')
        .option('--update', 'Update schema and primus on startup (always true for --dev; otherwise, false)')
        .option('--stripe-sync', 'Sync stripe subscriptions to database for all users with stripe id', 'yes')
        .option('--update-stats', 'Calculates the statistics for the /stats endpoint and stores them in the database', 'yes')
        .option('--delete-expired', 'Delete expired data from the database', 'yes')
        .option('--blob-maintenance', 'Do blob-related maintenance (dump to tarballs, offload to gcloud)', 'yes')
        .option('--add-user-to-project [project_id,email_address]', 'Add user with given email address to project with given ID', '')
        .option('--local', 'If option is specified, then *all* projects run locally as the same user as the server and store state in .sagemathcloud-local instead of .sagemathcloud; also do not kill all processes on project restart -- for development use (default: false, since not given)')
        .option('--kucalc', 'if given, assume running in the KuCalc kubernetes environment')
        .option('--mentions', 'if given, periodically handle mentions')
        .option('--test', 'terminate after setting up the hub -- used to test if it starts up properly')
        .option('--single', 'if given, then run in LESS SAFE single-machine mode')
        .option('--kubernetes', 'if given, then run in mode for cocalc-kubernetes (monolithic but in Kubernetes)')
        .option('--db-concurrent-warn <n>', 'be very unhappy if number of concurrent db requests exceeds this (default: 300)', ((n)->parseInt(n)), 300)
        .option('--personal', 'run in VERY UNSAFE personal mode; there is only one user and no authentication')
        .parse(process.argv)
    # Everywhere else in our code, we just refer to program.[options] since we
    # wrote this code against an ancient version of commander.
    program = program.opts()

    # Everything we do here requires the database to be initialized. Once
    # this is called, require('./postgres/database').default() is a valid db
    # instance that can be used.
    db = require('./servers/database')
    db.init
        host            : program.databaseNodes
        database        : program.keyspace
        concurrent_warn : program.dbConcurrentWarn
    database = db.database

    if program.dev
        # dev implies numerous other options
        program.websocketServer = true
        program.shareServer = true
        program.mentions = true


    if program.passwd
        winston.debug("Resetting password")
        reset_password(program.passwd, (err) -> process.exit())
    else if program.stripeSync
        winston.debug("Stripe sync")
        stripe_sync((err) -> winston.debug("DONE", err); process.exit())
    else if program.deleteExpired
        delete_expired (err) ->
            winston.debug("DONE", err)
            process.exit()
    else if program.blobMaintenance
        blob_maintenance (err) ->
            winston.debug("DONE", err)
            process.exit()
    else if program.updateStats
        update_stats (err) ->
            winston.debug("DONE", err)
            process.exit()
    else if program.addUserToProject
        console.log("Adding user to project")
        v = program.add_user_to_project.split(',')
        add_user_to_project v[0], v[1], (err) ->
            if err
                 console.log("Failed to add user: #{err}")
            else
                 console.log("User added to project.")
            process.exit()
    else if program.ltiServer
        console.log("LTI MODE")
        start_lti_service (err) ->
            if not err
                addErrorListeners()
    else if program.landing
        console.log("LANDING PAGE MODE")
        start_landing_service (err) ->
            if not err
                addErrorListeners()
    else
        console.log("Running hub; pidfile=#{program.pidfile}")
        # logFile = /dev/null to prevent huge duplicated output that is already in program.logfile
        start_server (err) ->
            if err and program.dev
                process.exit(1)
            else
                # successful startup -- now don't crash on routine errors.
                # We don't do this until startup, since we do want to crash on errors on startup.
                addErrorListeners()

command_line()
