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

require('coffee-cache')

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
message = require('smc-util/message')     # message protocol between front-end and back-end
client_lib = require('smc-util/client')
{Client} = require('./client')

sage    = require('./sage')               # sage server
{send_email} = require('./email')

auth   = require('./auth')

base_url = require('./base-url')

local_hub_connection = require('./local_hub_connection')
hub_proxy            = require('./proxy')

# express http server -- serves some static/dynamic endpoints
hub_http_server = require('./hub_http_server')

# registers the hub with the database periodically
hub_register = require('./hub_register')

# How frequently to register with the database that this hub is up and running,
# and also report number of connected clients
REGISTER_INTERVAL_S = 45   # every 45 seconds

smc_version = {}
init_smc_version = () ->
    smc_version = require('./hub-version')
    # winston.debug("init smc_version: #{misc.to_json(smc_version.version)}")
    smc_version.on 'change', (version) ->
        winston.debug("smc_version changed -- sending updates to clients")
        for id, c of clients
            if c.smc_version < version.version
                c.push_version_update()

to_json = misc.to_json
from_json = misc.from_json

# third-party libraries: add any new nodejs dependencies to the NODEJS_PACKAGES list in build.py
async   = require("async")

Cookies = require('cookies')            # https://github.com/jed/cookies

winston = require('winston')            # logging -- https://github.com/flatiron/winston

# Set the log level
winston.remove(winston.transports.Console)
if not process.env.SMC_TEST
    winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

# module scope variables:
database           = null

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

path_activity_cache = {}
path_activity = (opts) ->
    opts = defaults opts,
        account_id : required
        project_id : required
        path       : required
        client     : required
        cb         : undefined

    {path, action} = normalize_path(opts.path)
    winston.debug("path_activity(#{opts.account_id},#{opts.project_id},#{path}): #{action}")
    if not path?
        opts.cb?()
        return

    opts.client.touch
        project_id : opts.project_id
        path       : path
        action     : action
        force      : action == 'chat'
        cb         : opts.cb

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
    winston.debug("primus_server: listening on #{opts.pathname}")

    primus_server.on "connection", (conn) ->
        # Now handle the connection
        winston.debug("primus_server: new connection from #{conn.address.ip} -- #{conn.id}")
        primus_conn_sent_data = false
        f = (data) ->
            primus_conn_sent_data = true
            id = data.toString()
            winston.debug("primus_server: got id='#{id}'")
            conn.removeListener('data',f)
            C = clients[id]
            #winston.debug("primus client ids=#{misc.to_json(misc.keys(clients))}")
            if C?
                if C.closed
                    winston.debug("primus_server: '#{id}' matches expired Client -- deleting")
                    delete clients[id]
                    C = undefined
                else
                    winston.debug("primus_server: '#{id}' matches existing Client -- re-using")

                    # In case the connection hadn't been officially ended yet the changefeeds might
                    # have been left open sending messages that won't get through. So ensure the client
                    # must recreate them all before continuing.
                    C.query_cancel_all_changefeeds()

                    cookies = new Cookies(conn.request)
                    if C._remember_me_value == cookies.get(BASE_URL + 'remember_me')
                        old_id = C.conn.id
                        C.conn.removeAllListeners()
                        C.conn.end()
                        C.conn = conn
                        conn.id = id
                        conn.write(conn.id)
                        C.install_conn_handlers()
                    else
                        winston.debug("primus_server: '#{id}' matches but cookies do not match, so not re-using")
                        C = undefined
            if not C?
                winston.debug("primus_server: '#{id}' unknown, so making a new Client with id #{conn.id}")
                conn.write(conn.id)
                clients[conn.id] = new Client
                    conn           : conn
                    logger         : winston
                    database       : database
                    compute_server : compute_server
                    host           : program.host
                    port           : program.port

        conn.on("data",f)

        # Given the client up to 15s to send info about itself.  If get nothing, just
        # end the connection.
        no_data = ->
            if conn? and not primus_conn_sent_data
                winston.debug("primus_server: #{conn.id} sent no data after 15s, so closing")
                conn.end()
        setTimeout(no_data, 15000)


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
    read = require('read')
    passwd0 = passwd1 = undefined
    account_id = undefined
    async.series([
        (cb) ->
            connect_to_database
                pool : 1
                cb   : cb
        (cb) ->
            database.get_account
                email_address : email_address
                columns       : ['account_id']
                cb            : (err, data) ->
                    if err
                        cb(err)
                    else
                        account_id = data.account_id
                        cb()
        (cb) ->
            read {prompt:'Password: ', silent:true}, (err, passwd) ->
                passwd0 = passwd; cb(err)
        (cb) ->
            read {prompt:'Retype password: ', silent:true}, (err, passwd) ->
                if err
                    cb(err)
                else
                    passwd1 = passwd
                    if passwd1 != passwd0
                        cb("Passwords do not match.")
                    else
                        cb()
        (cb) ->
            # change the user's password in the database.
            database.change_password
                account_id    : account_id
                password_hash : auth.password_hash(passwd0)
                cb            : cb
    ], (err) ->
        if err
            winston.debug("Error -- #{err}")
        else
            winston.debug("Password changed for #{email_address}")
        cb?()
    )

change_password = (mesg, client_ip_address, push_to_client) ->
    account = null
    mesg.email_address = misc.lower_email_address(mesg.email_address)
    async.series([
        (cb) ->
            if not mesg.email_address?
                # There are no guarantees about incoming messages
                cb("email_address must be specified")
                return
            # get account and validate the password
            database.get_account
              email_address : mesg.email_address
              columns       : ['password_hash', 'account_id']
              cb : (error, result) ->
                if error
                    cb({other:error})
                    return
                account = result
                auth.is_password_correct
                    database             : database
                    account_id           : result.account_id
                    password             : mesg.old_password
                    password_hash        : account.password_hash
                    allow_empty_password : true
                    cb                   : (err, is_correct) ->
                        if err
                            cb(err)
                        else
                            if not is_correct
                                err = "invalid old password"
                                database.log
                                    event : 'change_password'
                                    value : {email_address:mesg.email_address, client_ip_address:client_ip_address, message:err}
                                cb(err)
                            else
                                cb()
        (cb) ->
            # check that new password is valid
            [valid, reason] = is_valid_password(mesg.new_password)
            if not valid
                cb({new_password:reason})
            else
                cb()

        (cb) ->
            # record current password hash (just in case?) and that we are changing password and set new password
            database.log
                event : "change_password"
                value :
                    account_id : account.account_id
                    client_ip_address : client_ip_address
                    previous_password_hash : account.password_hash

            database.change_password
                account_id    : account.account_id
                password_hash : auth.password_hash(mesg.new_password),
                cb            : cb
    ], (err) ->
        push_to_client(message.changed_password(id:mesg.id, error:err))
    )

change_email_address = (mesg, client_ip_address, push_to_client) ->

    dbg = (m) -> winston.debug("change_email_address(mesg.account_id, mesg.old_email_address, mesg.new_email_address): #{m}")
    dbg()

    mesg.old_email_address = misc.lower_email_address(mesg.old_email_address)
    mesg.new_email_address = misc.lower_email_address(mesg.new_email_address)

    if mesg.old_email_address == mesg.new_email_address  # easy case
        dbg("easy case -- no change")
        push_to_client(message.changed_email_address(id:mesg.id))
        return

    if not misc.is_valid_email_address(mesg.new_email_address)
        dbg("invalid email address")
        push_to_client(message.changed_email_address(id:mesg.id, error:'email_invalid'))
        return

    async.series([
        (cb) ->
            auth.is_password_correct
                database             : database
                account_id           : mesg.account_id
                password             : mesg.password
                allow_empty_password : true  # in case account created using a linked passport only
                cb                   : (err, is_correct) ->
                    if err
                        cb("Error checking password -- please try again in a minute -- #{err}.")
                    else if not is_correct
                        cb("invalid_password")
                    else
                        cb()

        (cb) ->
            # Record current email address (just in case?) and that we are
            # changing email address to the new one.  This will make it
            # easy to implement a "change your email address back" feature
            # if I need to at some point.
            dbg("log change to db")
            database.log
                event : 'change_email_address'
                value :
                    client_ip_address : client_ip_address
                    old_email_address : mesg.old_email_address
                    new_email_address : mesg.new_email_address
            #################################################
            # TODO: At this point, maybe we should send an email to
            # old_email_address with a temporary hash-code that can be used
            # to undo the change to the email address?
            #################################################
            dbg("actually make change in db")
            database.change_email_address
                account_id    : mesg.account_id
                email_address : mesg.new_email_address
                cb : cb
        (cb) ->
            # If they just changed email to an address that has some actions, carry those out...
            # TODO: move to hook this only after validation of the email address?
            database.do_account_creation_actions
                email_address : mesg.new_email_address
                account_id    : mesg.account_id
                cb            : cb
    ], (err) ->
        push_to_client(message.changed_email_address(id:mesg.id, error:err))
    )

#############################################################################
# Send an email message to the given email address with a code that
# can be used to reset the password for a certain account.
#
# Anti-spam/DOS throttling policies:
#   * a given email address can be sent at most 30 password resets per hour
#   * a given ip address can send at most 100 password reset request per minute
#   * a given ip can send at most 250 per hour
#############################################################################
forgot_password = (mesg, client_ip_address, push_to_client) ->
    if mesg.event != 'forgot_password'
        push_to_client(message.error(id:mesg.id, error:"Incorrect message event type: #{mesg.event}"))
        return

    # This is an easy check to save work and also avoid empty email_address, which causes trouble below
    if not misc.is_valid_email_address(mesg.email_address)
        push_to_client(message.error(id:mesg.id, error:"Invalid email address."))
        return

    mesg.email_address = misc.lower_email_address(mesg.email_address)

    id = null
    async.series([
        (cb) ->
            # Record this password reset attempt in our database
            database.record_password_reset_attempt
                email_address : mesg.email_address
                ip_address    : client_ip_address
                cb            : cb
        (cb) ->
            # POLICY 1: We limit the number of password resets that an email address can receive
            database.count_password_reset_attempts
                email_address : mesg.email_address
                age_s         : 60*60  # 1 hour
                cb            : (err, count) ->
                    if err
                        cb(err)
                    else if count >= 31
                        cb("Too many password resets for this email per hour; try again later.")
                    else
                        cb()

        (cb) ->
            # POLICY 2: a given ip address can send at most 10 password reset requests per minute
            database.count_password_reset_attempts
                ip_address : client_ip_address
                age_s      : 60  # 1 minute
                cb         : (err, count) ->
                    if err
                        cb(err)
                    else if count > 10
                        cb("Too many password resets per minute; try again later.")
                    else
                        cb()
        (cb) ->
            # POLICY 3: a given ip can send at most 60 per hour
            database.count_password_reset_attempts
                ip_address : client_ip_address
                age_s      : 60*60  # 1 hour
                cb         : (err, count) ->
                    if err
                        cb(err)
                    else if count > 60
                        cb("Too many password resets per hour; try again later.")
                    else
                        cb()
        (cb) ->
            database.account_exists
                email_address : mesg.email_address
                cb : (err, exists) ->
                    if err
                        cb(err)
                    else if not exists
                        cb("No account with e-mail address #{mesg.email_address}")
                    else
                        cb()
        (cb) ->
            # We now know that there is an account with this email address.
            # put entry in the password_reset uuid:value table with ttl of
            # 1 hour, and send an email
            database.set_password_reset
                email_address : mesg.email_address
                ttl           : 60*60
                cb            : (err, _id) ->
                    id = _id; cb(err)
        (cb) ->
            # send an email to mesg.email_address that has a password reset link
            {DOMAIN_NAME, HELP_EMAIL, SITE_NAME} = require('smc-util/theme')
            body = """
                <div>Hello,</div>
                <div>&nbsp;</div>
                <div>
                Somebody just requested to change the password of your #{SITE_NAME} account.
                If you requested this password change, please click this link:</div>
                <div>&nbsp;</div>
                <div style="text-align: center;">
                <span style="font-size:12px;"><b>
                  <a href="#{DOMAIN_NAME}/app#forgot-#{id}">#{DOMAIN_NAME}/app#forgot-#{id}</a>
                </b></span>
                </div>
                <div>&nbsp;</div>
                <div>If you don't want to change your password, ignore this message.</div>
                <div>&nbsp;</div>
                <div>In case of problems, email
                <a href="mailto:#{HELP_EMAIL}">#{HELP_EMAIL}</a> immediately
                (or just reply to this email).
                <div>&nbsp;</div>
                """

            send_email
                subject : "#{SITE_NAME} Password Reset"
                body    : body
                from    : "SageMath Help <#{HELP_EMAIL}>"
                to      : mesg.email_address
                category: "password_reset"
                cb      : cb
    ], (err) ->
        if err
            push_to_client(message.forgot_password_response(id:mesg.id, error:err))
        else
            push_to_client(message.forgot_password_response(id:mesg.id))
    )



reset_forgot_password = (mesg, client_ip_address, push_to_client) ->
    if mesg.event != 'reset_forgot_password'
        push_to_client(message.error(id:mesg.id, error:"incorrect message event type: #{mesg.event}"))
        return

    email_address = account_id = db = null

    async.series([
        (cb) ->
            # Verify password is valid and compute its hash.
            [valid, reason] = is_valid_password(mesg.new_password)
            if not valid
                cb(reason); return
            # Check that request is still valid
            database.get_password_reset
                id : mesg.reset_code
                cb   : (err, x) ->
                    if err
                        cb(err)
                    else if not x
                        cb("Password reset request is no longer valid.")
                    else
                        email_address = x
                        cb()
        (cb) ->
            # Get the account_id.
            database.get_account
                email_address : email_address
                columns       : ['account_id']
                cb            : (err, account) ->
                    account_id = account?.account_id; cb(err)
        (cb) ->
            # Make the change
            database.change_password
                account_id    : account_id
                password_hash : auth.password_hash(mesg.new_password)
                cb            : (err, account) ->
                    if err
                        cb(err)
                    else
                        # only allow successful use of this reset token once
                        database.delete_password_reset
                            id : mesg.reset_code
                            cb : cb
    ], (err) ->
        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:err))
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
        host     : program.database_nodes.split(',')[0]  # postgres has only one master server
        database : program.keyspace
        concurrent_warn : program.db_concurrent_warn
    database.connect(cb:opts.cb)

# client for compute servers
compute_server = undefined
init_compute_server = (cb) ->
    winston.debug("init_compute_server: creating compute_server client")
    require('./compute-client.coffee').compute_server
        database : database
        dev      : program.dev
        single   : program.single
        base_url : BASE_URL
        cb       : (err, x) ->
            if not err
                winston.debug("compute server created")
            else
                winston.debug("FATAL ERROR creating compute server -- #{err}")
            compute_server = x
            database.compute_server = compute_server
            # This is used by the database when handling certain writes to make sure
            # that the there is a connection to the corresponding project, so that
            # the project can respond.
            database.ensure_connection_to_project = (project_id) ->
                local_hub_connection.connect_to_project(project_id, database, compute_server)

            cb?(err)


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

# real-time reporting of hub metrics

MetricsRecorder = require('./metrics-recorder')
metricsRecorder = null

init_metrics = (cb) ->
    if program.statsfile?
        # make it absolute, with defaults it will sit next to the hub.log file
        if program.statsfile[0] != '/'
            STATS_FN = path_module.join(SMC_ROOT, program.statsfile)
        # make sure the directory exists
        dir = require('path').dirname(STATS_FN)
        if not fs.existsSync(dir)
            fs.mkdirSync(dir)
    else
        STATS_FN = null
    dbg = (msg) -> winston.info("MetricsRecorder: #{msg}")
    {number_of_clients} = require('./hub_register')
    collect = () ->
        try
            record_metric('nb_clients', number_of_clients(), MetricsRecorder.TYPE.CONT)
        catch err

    metricsRecorder = new MetricsRecorder.MetricsRecorder(STATS_FN, dbg, collect, cb)

# use record_metric to update its state

exports.record_metric = record_metric = (key, value, type) ->
    metricsRecorder?.record(key, value, type)

# Support Tickets

support = undefined
init_support = (cb) ->
    {Support} = require('./support')
    support = new Support cb: (err, s) =>
        support = s
        cb(err)


#############################################
# Start everything running
#############################################
BASE_URL = ''

exports.start_server = start_server = (cb) ->
    winston.debug("start_server")

    winston.debug("dev = #{program.dev}")

    BASE_URL = base_url.init(program.base_url)
    winston.debug("base_url='#{BASE_URL}'")

    fs.writeFileSync(path_module.join(SMC_ROOT, 'data', 'base_url'), BASE_URL)

    # the order of init below is important
    winston.debug("port = #{program.port}, proxy_port=#{program.proxy_port}")
    winston.info("using database #{program.keyspace}")
    hosts = program.database_nodes.split(',')
    http_server = express_router = undefined

    # Log anything that blocks the CPU for more than 10ms -- see https://github.com/tj/node-blocked
    blocked = require('blocked')
    blocked (ms) ->
        # filter values > 100 ms
        if ms > 100
            record_metric('blocked', ms, type=MetricsRecorder.TYPE.DISC)
        # record that something blocked for over 10ms
        winston.debug("BLOCKED for #{ms}ms")

    init_smc_version()

    async.series([
        (cb) ->
            if not program.port
                cb(); return
            init_metrics(cb)
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
            if program.dev or program.update
                winston.debug("updating the database schema...")
                database.update_schema(cb:cb)
            else
                cb()
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
            # proxy server and http server; this working etc. *relies* on compute_server having been created
            # However it can still serve many things without database.  TODO: Eventually it could inform user
            # that database isn't working.
            x = hub_http_server.init_express_http_server
                base_url       : BASE_URL
                dev            : program.dev
                compute_server : compute_server
                database       : database
                metricsRecorder: metricsRecorder
            {http_server, express_router} = x
            winston.debug("starting express webserver listening on #{program.host}:#{program.port}")
            http_server.listen(program.port, program.host, cb)
        (cb) ->
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
                    if program.dev or program.update
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

            if program.port
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

            if program.port
                # Start updating stats cache every so often -- note: this is cached in the database, so it isn't
                # too big a problem if we call it too frequently.
                # Randomized start to balance between all hubs.
                # It's important that we call this periodically, or stats will only get stored to the
                # database when somebody happens to visit /stats
                d = 5000 + 60 * 1000 * Math.random()
                setTimeout((-> database.get_stats(); setInterval(database.get_stats, 120*1000)), d)

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
        .option('--log_level [level]', "log level (default: debug) useful options include INFO, WARNING and DEBUG", String, "debug")
        .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
        .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', String, "data/pids/hub.pid")
        .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', String, "data/logs/hub.log")
        .option('--statsfile [string]', 'if set, this file contains periodically updated metrics (default: null, suggest value: "data/logs/stats.json")', String, null)
        .option('--database_nodes <string,string,...>', "database address (default: '#{default_db}')", String, default_db)
        .option('--keyspace [string]', 'Database name to use (default: "smc")', String, 'smc')
        .option('--passwd [email_address]', 'Reset password of given user', String, '')
        .option('--update', 'Update schema and primus on startup (always true for --dev; otherwise, false)')
        .option('--stripe_sync', 'Sync stripe subscriptions to database for all users with stripe id', String, 'yes')
        .option('--stripe_dump', 'Dump stripe subscriptions info to ~/stripe/', String, 'yes')
        .option('--delete_expired', 'Delete expired data from the database', String, 'yes')
        .option('--blob_maintenance', 'Do blob-related maintenance (dump to tarballs, offload to gcloud)', String, 'yes')
        .option('--add_user_to_project [project_id,email_address]', 'Add user with given email address to project with given ID', String, '')
        .option('--base_url [string]', 'Base url, so https://sitenamebase_url/', String, '')  # '' or string that starts with /
        .option('--local', 'If option is specified, then *all* projects run locally as the same user as the server and store state in .sagemathcloud-local instead of .sagemathcloud; also do not kill all processes on project restart -- for development use (default: false, since not given)', Boolean, false)
        .option('--foreground', 'If specified, do not run as a deamon')
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
            console.log("Running hub; pidfile=#{program.pidfile}, port=#{program.port}, proxy_port=#{program.proxy_port}")
            # logFile = /dev/null to prevent huge duplicated output that is already in program.logfile
            if program.foreground
                start_server (err) ->
                    if err and program.dev
                        process.exit(1)
            else
                daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile, logFile:'/dev/null', max:30}, start_server)


if process.argv.length > 1
    command_line()
