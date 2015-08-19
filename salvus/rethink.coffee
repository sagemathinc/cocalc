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

fs = require('fs')
async = require('async')
underscore = require('underscore')
moment  = require('moment')
uuid = require('node-uuid')

# NOTE: we use rethinkdbdash, which is a *MUCH* better connectionpool and api for rethinkdb.
rethinkdbdash = require('rethinkdbdash')

winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

misc_node = require('misc_node')
{defaults} = misc = require('misc')
required = defaults.required

# todo -- these should be in an admin settings table in the database (and maybe be more sophisticated...)
DEFAULT_QUOTAS =
    disk_quota : 3000
    cores      : 1
    memory     : 1000
    cpu_shares : 256
    mintime    : 3600   # hour
    network    : false

###
NOTES:

# Sharding

To automate sharding/replication of all the tables (depends on deployment).  E.g.,
if there are 3 nodes, do this to reconfigure *all* tables:

    db = require('rethink').rethinkdb(hosts:['db0'])
	db.db.reconfigure(replicas:3, shards:3).run(console.log)

###

SCHEMA = require('schema').SCHEMA

table_options = (table) ->
    t = SCHEMA[table]
    options =
        primaryKey : t.primary_key ? 'id'
    return options

# these fields are arrays of account id's, which
# we need indexed:

PROJECT_GROUPS = misc.PROJECT_GROUPS

exports.PUBLIC_PROJECT_COLUMNS = ['project_id',  'last_edited', 'title', 'description', 'deleted',  'created']
exports.PROJECT_COLUMNS = PROJECT_COLUMNS = ['users'].concat(exports.PUBLIC_PROJECT_COLUMNS)


# convert a ttl in seconds to an expiration time; otherwise undefined
exports.expire_time = expire_time = (ttl) -> if ttl then new Date((new Date() - 0) + ttl*1000)

rethinkdb_password_filename = ->
    return (process.env.SALVUS_ROOT ? '.') + '/data/secrets/rethinkdb'

default_hosts = ['localhost']

exports.set_default_hosts = (hosts) ->
    default_hosts = hosts

# Setting password:
#
#  db=require('rethink').rethinkdb()
#  db.set_random_password(cb: console.log)
#
class RethinkDB
    constructor : (opts={}) ->
        opts = defaults opts,
            hosts    : default_hosts
            database : 'smc'
            password : undefined
            debug    : true
            driver   : 'native'    # dash or native ; **Native is not done!**
            num_connections : 100
            cb       : undefined
        dbg = @dbg('constructor')
        @_debug = opts.debug
        @_database = opts.database
        @_num_connections = opts.num_connections
        if typeof(opts.hosts) == 'string' then opts.hosts = [opts.hosts]
        @_hosts = {}
        for h in opts.hosts
            @_hosts[h] = true
        async.series([
            (cb) =>
                if opts.password?
                    @_password = opts.password
                    cb()
                else
                    dbg("loading password from disk")
                    password_file = rethinkdb_password_filename()
                    fs.exists password_file, (exists) =>
                        if exists
                            fs.readFile password_file, (err, data) =>
                                if err
                                    cb(err)
                                else
                                    dbg("read password from '#{password_file}'")
                                    @_password = data.toString().trim()
                                    cb()
                        else
                            cb()
            (cb) =>
                switch opts.driver
                    when 'dash'
                        dbg("initializing dash driver")
                        @_init_dash(cb)
                    when 'native'
                        dbg("initializing native driver")
                        @_init_native(cb)
                    else
                        cb("unknown driver '#{opts.driver}'")
        ], (err) =>
            if err
                winston.debug("error initializing database -- #{misc.to_json(err)}")
            else
                winston.debug("successfully initialized database")
                @db = @r.db(@_database)
            opts.cb?(err, @)
        )

    _init_dash: (cb) =>
        #discovery   : true  # this option conflicts with password auth -- https://github.com/neumino/rethinkdbdash/issues/133
        opts =
            maxExponent : 4    # 15 seconds?
            timeout     : 10
            buffer      : 100
            max         : 5000  # max = simultaneous queries -- the default of 1000 is *way* too low; 200 people logging in hits this and everythign hangs up.
            servers     : ({host:h, authKey:@_password} for h in misc.keys(@_hosts))
        @r = rethinkdbdash(opts)
        cb()

    _connect: (cb) =>
        #dbg = @dbg("_connect")
        hosts = misc.keys(@_hosts)
        host = misc.random_choice(hosts)
        #dbg("connecting to #{host}...")
        @r.connect {authKey:@_password,  host:host}, (err, conn) =>
            if err
                #dbg("error connecting to #{host} -- #{misc.to_json(err)}")
                cb(err)
            else
                #dbg("successfully connected to #{host}")
                @_conn ?= {}  # initialize if not defined
                @_conn[misc.uuid()] = conn  # save connection
                cb()

                ##@r.db('rethinkdb').table('server_status').run_native conn, (err, servers) =>
                ##    if not err
                ##        servers.toArray (err, s) =>
                ##            if not err
                ##                for server in s
                ##                    @_hosts[server.network.hostname] = true
                ##                dbg("got complete server list from server_status table: #{misc.to_json(misc.keys(@_hosts))}")
                ##                cb()
                ##            else
                ##                dbg("error converting server list to array")
                ##                cb() # non fatal  -- just means we don't know all hosts
                ##    else
                ##        dbg("error getting complete server list -- #{misc.to_json(err)}")
                ##        cb()  # non fatal -- just means we don't know all hosts

    _init_native: (cb) =>
        @r = require('rethinkdb')
        @_monkey_patch_run()
        winston.debug("creating #{@_num_connections} connections")
        g = (i, cb) =>
            if i%50 == 0
                winston.debug("created #{i} connections so far")
            misc.retry_until_success
                f : @_connect
                cb : cb
        async.map misc.range(@_num_connections), g, (err) =>
            cb(err)

    _monkey_patch_run: () =>
        # We monkey patch run to have similar semantics to rethinkdbdash, so that we don't have to change
        # any of our code to switch between the drivers (and rethinkdbdash has nice semantics).
        # See http://stackoverflow.com/questions/26287983/javascript-monkey-patch-the-rethinkdb-run
        # for how to monkey patch run.
        that = @ # needed to reconnect if connection dies
        TermBase = @r.expr(1).constructor.__super__.constructor.__super__
        if not TermBase.run_native?  # only do this once!
            TermBase.run_native = TermBase.run
            TermBase.run = (opts, cb) ->
                if not cb?
                    cb = opts
                    opts = undefined
                that2 = @  # needed to call run_native properly on the object below.
                error = result = undefined
                f = (cb) ->
                    start = new Date()

                    warning_thresh = 15
                    warning = ->
                        winston.debug("rethink: query time WARNING (#{id}) is taking over #{warning_thresh}s!")
                    warning_timer = setTimeout(warning, warning_thresh*1000)

                    # choose a random connection
                    id = misc.random_choice(misc.keys(that._conn))
                    conn = that._conn[id]
                    winston.debug("rethink: query using connection #{id}")
                    g = (err, x) ->
                        clearTimeout(warning_timer)
                        tm = new Date() - start
                        @_stats ?= {sum:0, n:0}
                        @_stats.sum += tm
                        @_stats.n += 1
                        winston.debug("rethink: query time using (#{id}) took #{tm}ms; averge=#{@_stats.sum/@_stats.n}")
                        if err
                            if err.message == 'Connection is closed.'  # we depend on this error message not changing at all. **WORRY**
                                delete that._conn[id]  # delete existing connection so won't get re-used
                                # make another one (adding to pool)
                                that._connect () ->
                                    cb(true)
                            else
                                # Success in that we did the call with a valid connection.
                                # Now pass the error back to the code that called run.
                                error = err
                                cb()
                        else
                            if "#{x}" == "[object Cursor]"
                                # It's a cursor, so we convert it to an array, which is more convenient to work with, and is OK
                                # by default, given the size of our data (typically very small -- all one pickle to client usually).
                                x.toArray (err, x) ->   # converting to an array gets result as callback
                                    if err
                                        # a normal error to report
                                        error = err
                                    else
                                        # it worked
                                        result = x
                                    cb()
                            else
                                # Not a cursor -- just keep as is.  It will be either a single javascript object or a changefeed.
                                result = x
                                cb()
                    if opts?
                        that2.run_native(conn, opts, g)
                    else
                        that2.run_native(conn, g)
                # 'success' means that we got a connection to the database and made a query using it.
                # It could still have returned an error.
                misc.retry_until_success
                    f         : f
                    max_delay : 10000
                    factor    : 1.3
                    cb        : -> cb(error, result)

    table: (name) => @db.table(name)

    # Compute the sha1 hash (in hex) of the input arguments, which are
    # converted to strings (via json) if they are not strings, then concatenated.
    # This is used for computing compound primary keys in a way that is relatively
    # safe, and in situations where if there were a highly unlikely collision, it
    # wouldn't be the end of the world.  There is a similar client-only slower version
    # of this function (in schema.coffee), so don't change it willy nilly.
    sha1: (args...) ->
        v = (if typeof(x) == 'string' then x else JSON.stringify(x) for x in args)
        return misc_node.sha1(args.join(''))

    # This will change the database so that a random password is required.  It will
    # then write the random password to the given file.
    set_random_password: (opts={}) =>
        opts = defaults opts,
            bytes    : 32
            filename : undefined   # defaults to rethinkd_password_filename()
            cb       : undefined
        if not opts.filename
            opts.filename = rethinkdb_password_filename()
        dbg = @dbg("set_random_password")
        dbg("setting a random password from #{opts.bytes} bytes")
        require('mkdirp').mkdirp(misc.path_split(opts.filename).head, 0o700)
        password = require('crypto').randomBytes(opts.bytes).toString('hex')
        async.series([
            (cb) =>
                @r.db('rethinkdb').table('cluster_config').get('auth').update({auth_key: password}).run(cb)
            (cb) =>
                dbg("Writing password to '#{opts.filename}'.  You must copy this file to all clients!  Be sure to mkdir data/secrets; chmod 700 data/secrets;")
                fs.writeFile(opts.filename, password, cb)
            (cb) =>
                dbg("Setting permissions of '#{opts.filename}'. ")
                fs.chmod(opts.filename, 0o700, cb)
            ], (err) =>
                if err
                    winston.debug("error setting password -- #{misc.to_json(err)}")
                else
                    @r.getPoolMaster().drain()
                    @_init(password)
                opts.cb?(err)
        )


    dbg: (f) =>
        if @_debug
            return (m) => winston.debug("RethinkDB.#{f}: #{m}")
        else
            return () ->

    update_schema: (opts={}) =>
        opts = defaults opts,
            replication : true   # update sharding/replication settings
            cb : undefined
        dbg = @dbg("update_schema"); dbg()
        num_nodes = undefined
        async.series([
            (cb) =>
                #dbg("get list of known db's")
                @r.dbList().run (err, x) =>
                    if err or @_database in x
                        cb(err)
                    else
                        dbg("create db")
                        @r.dbCreate(@_database).run(cb)
            (cb) =>
                @db.tableList().run (err, x) =>
                    if err
                        cb(err)
                    tables = (t for t,s of SCHEMA when t not in x and not s.virtual)
                    if tables.length > 0
                        dbg("creating #{tables.length} tables: #{tables.join(', ')}")
                    async.map(tables, ((table, cb) => @db.tableCreate(table, table_options(table)).run(cb)), cb)
            (cb) =>
                f = (name, cb) =>
                    indexes = misc.deep_copy(SCHEMA[name].indexes)  # sutff gets deleted out of indexes below!
                    if not indexes or SCHEMA[name].virtual
                        cb(); return
                    table = @table(name)
                    create_index = (n, cb) =>
                        w = (x for x in indexes[n])
                        for i in [0...w.length]
                            if typeof(w[i]) == 'string'
                                that = @
                                w[i] = eval(w[i])
                        table.indexCreate(n, w...).run (err) =>
                            if err
                                cb(err)
                            else
                                table.indexWait().run(cb)
                    delete_index = (n, cb) =>
                        table.indexDrop(n).run(cb)

                    table.indexList().run (err, known) =>
                        if err
                            cb(err)
                        else
                            to_delete = []
                            for n in known
                                if not indexes[n]?
                                    # index is NOT in schema, so will delete it.
                                    to_delete.push(n)
                                delete indexes[n]
                            x = misc.keys(indexes)
                            if x.length > 0
                                dbg("indexing #{name}: #{misc.to_json(x)}")
                            async.map x, create_index, (err) =>
                                if err or to_delete.length == 0
                                    cb(err)
                                else
                                    # delete some indexes
                                    async.map(to_delete, delete_index, cb)

                async.map(misc.keys(SCHEMA), f, cb)
            (cb) =>
                if not opts.replication
                    cb(); return
                dbg("getting number of servers")
                @r.db('rethinkdb').table('server_config').count().run (err, x) =>
                    num_nodes = x; cb(err)
            (cb) =>
                if not opts.replication
                    cb(); return
                if num_nodes > 1
                    dbg("ensuring there are #{num_nodes} replicas and #{num_nodes} shard of every table")
                    @db.reconfigure(replicas:num_nodes, shards:num_nodes).run(cb)
                else
                    dbg("single-node server, so not changing replicas")
                    cb()
        ], (err) => opts.cb?(err))

    _confirm_delete: (opts) =>
        opts = defaults opts,
            confirm : 'no'
            cb      : required
        dbg = @dbg("confirm")
        if opts.confirm != 'yes'
            err = "Really delete all data? -- you must explicitly pass in confirm='yes' (but confirm:'#{opts.confirm}')"
            dbg(err)
            opts.cb(err)
            return false
        else
            return true

    # Deletes *everything*.
    delete_entire_database: (opts) =>
        if not @_confirm_delete(opts)
            return
        @r.dbList().run (err, x) =>
            if err or @_database not in x
                opts.cb(err); return
            else
                @r.dbDrop(@_database).run(opts.cb)

    # Deletes all the contents of the tables in the database.  It doesn't
    # delete indexes or or tables.
    delete_all: (opts) =>
        if not @_confirm_delete(opts)
            return
        @r.dbList().run (err, x) =>
            if err or @_database not in x
                opts.cb(err); return
            @db.tableList().run (err, tables) =>
                if err
                    opts.cb(err); return
                async.map(tables, ((name, cb) => @table(name).delete().run(cb)), opts.cb)

    # Go through every table in the schema with an index called "expire", and
    # delete every entry where expire is <= right now.  This saves disk space, etc.
    delete_expired: (opts) =>
        opts = defaults opts,
            cb  : required
        f = (table, cb) =>
            @table(table).between(new Date(0),new Date(), index:'expire').delete().run(cb)
        async.map((k for k, v of SCHEMA when v.indexes?.expire?), f, opts.cb)

    ###
    # Tables for loging things that happen
    ###
    log: (opts) =>
        opts = defaults opts,
            event : required    # string
            value : required    # object (will be JSON'd)
            cb    : undefined
        @table('central_log').insert({event:opts.event, value:opts.value, time:new Date()}).run((err)=>opts.cb?(err))

    _process_time_range: (opts) =>
        if opts.start? or opts.end?
            # impose an interval of time constraint
            if not opts.start?
                opts.start = new Date(0)
            if not opts.end?
                opts.end = new Date()

    get_log: (opts={}) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            event : undefined
            log   : 'central_log'
            cb    : required
        query = @table(opts.log)
        @_process_time_range(opts)
        if opts.start? or opts.end?
            query = query.between(opts.start, opts.end, {index:'time'})
        if opts.event?  # restrict to only the given event
            query = query.filter(@r.row("event").eq(opts.event))
        query.run(opts.cb)

    log_client_error: (opts) =>
        opts = defaults opts,
            event      : required
            error      : required
            account_id : undefined
            cb         : undefined
        @table('client_error_log').insert(
            {event:opts.event, error:opts.error, account_id:opts.account_id, time:new Date()}
        ).run((err)=>opts.cb?(err))

    get_client_error_log: (opts={}) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            event : undefined
            cb    : required
        opts.log = 'client_error_log'
        @get_log(opts)

    ###
    # Server settings
    ###
    set_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            value : required
            cb    : required
        @table("server_settings").insert(
            {name:opts.name, value:opts.value}, conflict:"replace").run(opts.cb)

    get_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            cb    : required
        @table('server_settings').get(opts.name).run (err, x) =>
            opts.cb(err, if x then x.value)

    ###
    # Passport settings
    ###
    set_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            conf     : required
            cb       : required
        @table('passport_settings').insert({strategy:opts.strategy, conf:opts.conf}, conflict:'update').run(opts.cb)

    get_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            cb       : required
        @table('passport_settings').get(opts.strategy).run (err, x) =>
            opts.cb(err, if x then x.conf)

    ###
    # Account creation, deletion, existence
    ###
    create_account: (opts={}) ->
        opts = defaults opts,
            first_name        : required
            last_name         : required

            created_by        : undefined  #  ip address of computer creating this account

            email_address     : undefined
            password_hash     : undefined

            passport_strategy : undefined
            passport_id       : undefined
            passport_profile  : undefined
            cb                : required       # cb(err, account_id)

        dbg = @dbg("create_account(#{opts.first_name}, #{opts.last_name} #{opts.email_address}, #{opts.passport_strategy}, #{opts.passport_id})")
        dbg()

        if opts.email_address? # canonicalize the email address, if given
            opts.email_address = misc.lower_email_address(opts.email_address)

        if not opts.email_address? and not opts.passport_strategy?
            opts.cb("email_address or passport must be given")
            return

        account_id = undefined # will be generated by db

        async.series([
            (cb) =>
                # Verify in parallel that there's no account already with the
                # requested email or passport.  This should never fail, except
                # in case of some sort of rare bug or race condition where a
                # person tries to sign up several times at once.
                async.parallel([
                    (cb) =>
                        if not opts.email_address?
                            cb(); return
                        dbg("verify that no account with the given email (='#{opts.email_address}') already exists")
                        @account_exists
                            email_address : opts.email_address
                            cb : (err, account_id) =>
                                if err
                                    cb(err)
                                else if account_id
                                    cb("account with email address '#{opts.email_address}' already exists")
                                else
                                    cb()
                    (cb) =>
                        if not opts.passport_strategy?
                            cb(); return
                        dbg("verify that no account with passport strategy (='#{opts.passport_strategy}') already exists")
                        @passport_exists
                            strategy : opts.passport_strategy
                            id       : opts.passport_id
                            cb       : (err, account_id) ->
                                if err
                                    cb(err)
                                else if account_id
                                    cb("account with email passport strategy '#{opts.passport_strategy}' and id '#{opts.passport_id}' already exists")
                                else
                                    cb()
                ], cb)

            (cb) =>
                dbg("create the actual account")
                account =
                    first_name    : opts.first_name
                    last_name     : opts.last_name
                    email_address : opts.email_address
                    password_hash : opts.password_hash
                    created       : new Date()
                    created_by    : opts.created_by
                @table('accounts').insert(account).run (err, x) =>
                    if err
                        cb(err)
                    else
                        account_id = x.generated_keys[0]
                        cb()
            (cb) =>
                if opts.passport_strategy?
                    dbg("add passport authentication strategy")
                    @create_passport
                        account_id : account_id
                        strategy   : opts.passport_strategy
                        id         : opts.passport_id
                        profile    : opts.passport_profile
                        cb         : cb
                else
                    cb()
        ], (err) =>
            if err
                dbg("error creating account -- #{err}")
                opts.cb(err)
            else
                dbg("successfully created account")
                opts.cb(undefined, account_id)
        )

    count_accounts_created_by: (opts) =>
        opts = defaults opts,
            ip_address : required
            age_s      : required
            cb         : required
        @table('accounts').between(
            [opts.ip_address, new Date(new Date() - opts.age_s*1000)],
            [opts.ip_address, new Date()],
            {index:'created_by'}).count().run(opts.cb)

    delete_account: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        @table('accounts').get(opts.account_id).delete().run(opts.cb)

    account_exists: (opts) =>
        opts = defaults opts,
            email_address : required
            cb            : required   # cb(err, account_id or false) -- true if account exists; err = problem with db connection...
        @table('accounts').getAll(opts.email_address, {index:'email_address'}).count().run (err, n) =>
            opts.cb(err, n>0)

    account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            action        : undefined # if given, adds this action
            ttl           : 60*60*24*14 # add action with this ttl in seconds (default: 2 weeks)
            cb            : required  # if ttl not given cb(err, [array of actions])
        t = @table('account_creation_actions')
        if opts.action?
            # add action
            t.insert({email_address:opts.email_address, action:opts.action, expire:expire_time(opts.ttl)}).run(opts.cb)
        else
            # query for actions
            t.between([opts.email_address, new Date()],
                      [opts.email_address, new Date(1e13)], index:'email_address'
                     ).pluck('action').run (err, x) =>
                opts.cb(err, if x then (y.action for y in x))

    account_creation_actions_success: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        @table('accounts').get(opts.account_id).update(creation_actions_done:true).run(opts.cb)

    ###
    # Stripe support for accounts
    ###
    # Set the stripe id in our database of this user.
    set_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            customer_id : required
            cb          : required
        @table('accounts').get(opts.account_id).update(stripe_customer_id : opts.customer_id).run(opts.cb)

    # Get the stripe id in our database of this user.
    get_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            cb          : required
        @table('accounts').get(opts.account_id).pluck('stripe_customer_id').run (err, x) =>
            opts.cb(err, if x then x.stripe_customer_id)

    # Get all info about the given account from stripe and put it in our own local database.
    # Call it with force right after the user does some action that will change their
    # account info status.  This will never touch stripe if the user doesn't have
    # a stripe_customer_id.
    # Get connection to stripe as follows:
    #   db = require('rethink').rethinkdb(cb:->db.get_server_setting(name : 'stripe_secret_key', cb:(e,s)->global.stripe = require("stripe")(s)))
    #
    stripe_update_customer: (opts) =>
        opts = defaults opts,
            account_id  : required   # user's account_id
            stripe      : undefined  # api connection to stripe
            customer_id : undefined  # will be looked up computed if not known
            cb          : undefined
        customer = undefined
        dbg = @dbg("stripe_update_customer(account_id='#{opts.account_id}')")
        async.series([
            (cb) =>
                if opts.customer_id?
                    cb(); return
                dbg("get_stripe_customer_id")
                @get_stripe_customer_id
                    account_id : opts.account_id
                    cb         : (err, x) =>
                        dbg("their stripe id is #{x}")
                        opts.customer_id = x; cb(err)
            (cb) =>
                if opts.customer_id? and not opts.stripe?
                    @get_server_setting
                        name : 'stripe_secret_key'
                        cb   : (err, secret) =>
                            if err
                                cb(err)
                            else
                                opts.stripe = require("stripe")(secret)
                                cb()
                else
                    cb()
            (cb) =>
                if opts.customer_id?
                    opts.stripe.customers.retrieve opts.customer_id, (err, x) =>
                        dbg("got stripe info -- #{err}")
                        customer = x; cb(err)
                else
                    cb()
            (cb) =>
                if opts.customer_id?
                    @table('accounts').get(opts.account_id).update(stripe_customer : customer).run(cb)
                else
                    cb()
        ], opts.cb)


    ###
    # Querying for searchable information about accounts.
    ###

    account_ids_to_usernames: (opts) =>
        opts = defaults opts,
            account_ids : required
            cb          : required # (err, mapping {account_id:{first_name:?, last_name:?}})
        if not @_validate_opts(opts) then return
        if opts.account_ids.length == 0 # easy special case -- don't waste time on a db query
            opts.cb(false, [])
            return
        @table('accounts').getAll(opts.account_ids...).pluck("first_name", "last_name", "account_id").run (err, x) =>
            if err
                opts.cb?(err)
            else
                v = misc.dict(([r.account_id, {first_name:r.first_name, last_name:r.last_name}] for r in x))
                # fill in unknown users (should never be hit...)
                for id in opts.account_ids
                    if not v[id]
                        v[id] = {first_name:undefined, last_name:undefined}
                opts.cb(err, v)

    get_usernames: (opts) =>
        opts = defaults opts,
            account_ids  : required
            use_cache    : true
            cache_time_s : 60*60        # one hour
            cb           : required     # cb(err, map from account_id to object (user name))
        if not @_validate_opts(opts) then return
        usernames = {}
        for account_id in opts.account_ids
            usernames[account_id] = false
        if opts.use_cache
            if not @_account_username_cache?
                @_account_username_cache = {}
            for account_id, done of usernames
                if not done and @_account_username_cache[account_id]?
                    usernames[account_id] = @_account_username_cache[account_id]
        @account_ids_to_usernames
            account_ids : (account_id for account_id,done of usernames when not done)
            cb          : (err, results) =>
                if err
                    opts.cb(err)
                else
                    # use a closure so that the cache clear timeout below works
                    # with the correct account_id!
                    f = (account_id, username) =>
                        usernames[account_id] = username
                        @_account_username_cache[account_id] = username
                        setTimeout((()=>delete @_account_username_cache[account_id]),
                                   1000*opts.cache_time_s)
                    for account_id, username of results
                        f(account_id, username)
                    opts.cb(undefined, usernames)


    # all_users: cb(err, array of {first_name:?, last_name:?, account_id:?, search:'lower case names to search'})
    #
    # This is safe to call many times since it caches the result.  It dumps the database once, and
    # uses a changefeed to update itself after that.  It keeps the data sorted by last_name, then first_name.
    #
    all_users: (cb) =>
        if @_all_users?.length > 0
            cb(false, @_all_users); return
        if @_all_users_computing?
            @_all_users_computing.push(cb)
            return
        @_all_users_computing = [cb]
        f = (cb) =>
            process = (user) =>
                if not user.first_name?
                    user.first_name = ''
                if not user.last_name?
                    user.last_name = ''
                user.search = (user.last_name.slice(0,20) + ' ' + user.first_name.slice(0,20)).toLowerCase()
                return user
            sort = =>
                @_all_users.sort (a,b) -> misc.cmp(a.search, b.search)
            query = @table('accounts').pluck("first_name", "last_name", "account_id")
            query.run (err, v) =>
                if err
                    cb(err); return
                for user in v
                    process(user)
                @_all_users = v
                sort()
                query.changes().run (err, feed) =>
                    if err
                        # make array empty so next client call will requery and update change feed
                        @_all_users.splice(0, @_all_users.length)
                        cb(err)
                    else
                        feed.each (err, change) =>
                            if err
                                delete @_all_users
                            else
                                if change.old_val?
                                    # delete/replace a user
                                    account_id = change.old_val.account_id
                                    for user,i in @_all_users
                                        if user.account_id == account_id
                                            if change.new_val?
                                                # replace
                                                user.first_name = change.new_val.first_name
                                                user.last_name = change.new_val.last_name
                                                process(user)
                                                sort()
                                            else
                                                @_all_users.splice(i,1)  # delete entry
                                            break
                                else
                                    # add a new name
                                    process(change.new_val)
                                    @_all_users.push(change.new_val)
                                    sort()
                        cb()
        f (err) =>
            for cb in @_all_users_computing
                cb(err, @_all_users)
            delete @_all_users_computing

    user_search: (opts) =>
        opts = defaults opts,
            query : required     # comma separated list of email addresses or strings such as 'foo bar' (find everything where foo and bar are in the name)
            limit : undefined    # limit on string queries; email query always returns 0 or 1 result per email address
            cb    : required     # cb(err, list of {id:?, first_name:?, last_name:?, email_address:?}), where the
                                 # email_address *only* occurs in search queries that are by email_address -- we do not reveal
                                 # email addresses of users queried by name.
        {string_queries, email_queries} = misc.parse_user_search(opts.query)
        results = []
        dbg = @dbg("user_search")
        async.parallel([
            (cb) =>
                if email_queries.length == 0
                    cb(); return
                dbg("do email queries -- with exactly two targeted db queries (even if there are hundreds of addresses)")
                @table('accounts').getAll(email_queries..., {index:'email_address'}).pluck('account_id', 'first_name', 'last_name', 'email_address').run (err, r) =>
                    if err
                        cb(err)
                    else
                        results.push(r...)
                        cb()
            (cb) =>
                dbg("do all string queries")
                if string_queries.length == 0 or (opts.limit? and results.length >= opts.limit)
                    # nothing to do
                    cb(); return
                @all_users (err, users) =>
                    if err
                        cb(err); return
                    match = (search) ->
                        for query in string_queries
                            matches = true
                            for q in query
                                if search.indexOf(q) == -1
                                    matches = false
                                    break
                            if matches
                                return true
                        return false
                    # SCALABILITY WARNING: In the worst case, this is a non-indexed linear search through all
                    # names which completely locks the server.  That said, it would take about
                    # 500,000 users before this blocks the server for *1 second*...
                    # TODO: we should limit the number of search requests per user per minute, since this
                    # is a DOS vector.
                    # TODO: another approach might be to write everything to a file and use grep and a subprocess.
                    # Grep is crazy fast and that wouldn't block.
                    for x in users
                        if match(x.search)
                            results.push(misc.copy_without(x,'search'))
                            if opts.limit? and results.length >= opts.limit
                                break
                    cb()
            ], (err) => opts.cb(err, results))

    ###
    # Information about a specific account
    ###
    _account: (opts) =>
        query = @table('accounts')
        if opts.account_id?
            return query.getAll(opts.account_id)
        else if opts.email_address?
            return query.getAll(opts.email_address, {index:'email_address'})
        else
            throw Error("_account: opts must have account_id or email_address field")

    get_account: (opts={}) =>
        opts = defaults opts,
            cb            : required
            email_address : undefined     # provide either email or account_id (not both)
            account_id    : undefined
            columns       : ['account_id',
                             'password_hash',
                             'password_is_set',  # true or false, depending on whether a password is set (since don't send password_hash to user!)
                             'first_name', 'last_name',
                             'email_address',
                             'evaluate_key', 'autosave', 'terminal', 'editor_settings', 'other_settings',
                             'groups',
                             'passports'
                            ]
        if not @_validate_opts(opts) then return
        @_account(opts).pluck(opts.columns...).run (err, x) =>
            if err
                opts.cb(err)
            else if x.length == 0
                opts.cb("no such account")
            else
                if 'password_is_set' in opts.columns
                    x[0]['password_is_set'] = !!x[0].password_hash
                opts.cb(undefined, x[0])

    # check whether or not a user is banned
    is_banned_user: (opts) =>
        opts = defaults opts,
            email_address : undefined
            account_id    : undefined
            cb            : required    # cb(err, true if banned; false if not banned)
        if not @_validate_opts(opts) then return
        @_account(opts).pluck('banned').run (err, x) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, x.length > 0 and !!x[0].banned)

    ban_user: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : required
        if not @_validate_opts(opts) then return
        @_account(opts).update(banned:true).run(opts.cb)

    unban_user: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : required
        if not @_validate_opts(opts) then return
        @_account(opts).update(banned:false).run(opts.cb)

    ###
    # Passports -- accounts linked to Google/Dropbox/Facebook/Github, etc.
    # The Schema is slightly redundant, but indexed properly:
    #    {passports:['google-id', 'facebook-id'],  passport_profiles:{'google-id':'...', 'facebook-id':'...'}}
    ###
    _passport_key: (opts) => "#{opts.strategy}-#{opts.id}"

    create_passport: (opts) =>
        opts= defaults opts,
            account_id : required
            strategy   : required
            id         : required
            profile    : required
            cb         : required   # cb(err)
        @_account(opts).update(passports:{"#{@_passport_key(opts)}": opts.profile}).run(opts.cb)

    delete_passport: (opts) =>
        opts= defaults opts,
            account_id : required
            strategy   : required
            id         : required
            cb         : required
        @_account(opts).replace(@r.row.without(passports:{"#{@_passport_key(opts)}":true})).run(opts.cb)

    passport_exists: (opts) =>
        opts = defaults opts,
            strategy : required
            id       : required
            cb       : required   # cb(err, account_id or undefined)
        @table('accounts').getAll(@_passport_key(opts), {index:'passports'}).pluck('account_id').run (err, x) =>
            opts.cb(err, if x.length > 0 then x[0].account_id)

    ###
    # Account settings
    ###
    update_account_settings: (opts={}) =>
        opts = defaults opts,
            account_id : required
            set        : required
            cb         : required
        if opts.set.email_address?
            email_address = opts.set.email_address
            delete opts.set.email_address
        if not @_validate_opts(opts) then return
        async.parallel([
            (cb) =>
                # treat email separately, since email must be globally unique.
                if email_address?
                    @change_email_address
                        account_id    : opts.account_id
                        email_address : email_address
                        cb            : cb
                else
                    cb()
            (cb) =>
                # make all the non-email changes
                @_account(opts).update(opts.set).run(cb)
        ], opts.cb)

    # Indicate activity by a user, possibly on a specific project, and
    # then possibly on a specific path in that project.
    touch: (opts) =>
        opts = defaults opts,
            account_id : required
            project_id : undefined
            path       : undefined
            action     : 'edit'
            cb         : undefined
        async.parallel([
            (cb) =>
                # touch accounts table
                @table('accounts').get(opts.account_id).update(last_active:new Date()).run(cb)
            (cb) =>
                if not opts.project_id?
                    cb(); return
                # touch projects table
                @table('projects').get(opts.project_id).update(last_active:{"#{opts.account_id}":new Date()}).run(cb)
            (cb) =>
                if not opts.path? or not opts.project_id?
                    cb(); return
                # touch file_use table
                @record_file_use(project_id:opts.project_id, path:opts.path, account_id:opts.account_id, action:opts.action, cb:cb)
        ], (err)->opts.cb?(err))

    ###
    # Remember-me functions
    ###

    # Save remember me info in the database
    save_remember_me: (opts) =>
        opts = defaults opts,
            account_id : required
            hash       : required
            value      : required
            ttl        : required
            cb         : required
        if not @_validate_opts(opts) then return
        @table('remember_me').insert(hash:opts.hash.slice(0,127), value:opts.value, expire:expire_time(opts.ttl), account_id:opts.account_id).run(opts.cb)

    # Invalidate all outstanding remember me cookies for the given account by
    # deleting them from the remember_me key:value store.
    invalidate_all_remember_me: (opts) =>
        opts = defaults opts,
            account_id    : required
            cb            : required
        @table('remember_me').getAll(opts.account_id, {index:'account_id'}).delete().run(opts.cb)

    # Get remember me cookie with given hash.  If it has expired,
    # get back undefined instead.  (Actually deleting expired)
    get_remember_me: (opts) =>
        opts = defaults opts,
            hash       : required
            cb         : required   # cb(err, signed_in_message)
        @table('remember_me').get(opts.hash.slice(0,127)).run (err, x) =>
            if err or not x
                opts.cb(err); return
            if new Date() >= x.expire  # expired, so async delete
                x = undefined
                @delete_remember_me(hash:opts.hash)
            opts.cb(undefined, x.value)

    delete_remember_me: (opts) =>
        opts = defaults opts,
            hash : required
            cb   : undefined
        @table('remember_me').get(opts.hash.slice(0,127)).delete().run((err) => opts.cb?(err))


    ###
    # Changing password/email, etc. sensitive info about a user
    ###

    # Change the password for the given account.
    change_password: (opts={}) =>
        opts = defaults opts,
            account_id             : required
            password_hash          : required
            invalidate_remember_me : true
            cb                     : required
        if not @_validate_opts(opts) then return
        async.series([  # don't do in parallel -- don't kill remember_me if password failed!
            (cb) =>
                @_account(opts).update(password_hash:opts.password_hash).run(cb)
            (cb) =>
                if opts.invalidate_remember_me
                    @invalidate_all_remember_me
                        account_id : opts.account_id
                        cb         : cb
                else
                    cb()
        ], opts.cb)

    # Change the email address, unless the email_address we're changing to is already taken.
    change_email_address: (opts={}) =>
        opts = defaults opts,
            account_id    : required
            email_address : required
            cb            : required
        if not @_validate_opts(opts) then return
        @account_exists
            email_address : opts.email_address
            cb            : (err, exists) =>
                if err
                    opts.cb(err)
                else if exists
                    opts.cb("email_already_taken")
                else
                    @_account(account_id:opts.account_id).update(email_address:opts.email_address).run(opts.cb)

    ###
    # Password reset
    ###
    set_password_reset: (opts) =>
        opts = defaults opts,
            email_address : required
            ttl           : required
            cb            : required   # cb(err, uuid)
        @table('password_reset').insert({
            email_address:opts.email_address, expire:expire_time(opts.ttl)}).run (err, x) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, x.generated_keys[0])

    get_password_reset: (opts) =>
        opts = defaults opts,
            id : required
            cb : required   # cb(err, true if allowed and false if not)
        @table('password_reset').get(opts.id).run (err, x) =>
            opts.cb(err, if x and x.expire > new Date() then x.email_address)

    delete_password_reset: (opts) =>
        opts = defaults opts,
            id : required
            cb : required   # cb(err, true if allowed and false if not)
        @table('password_reset').get(opts.id).delete().run(opts.cb)

    record_password_reset_attempt: (opts) =>
        opts = defaults opts,
            email_address : required
            ip_address    : required
            cb            : required   # cb(err)
        @table("password_reset_attempts").insert({
            email_address:opts.email_address, ip_address:opts.ip_address, time:new Date()
            }).run(opts.cb)

    count_password_reset_attempts: (opts) =>
        opts = defaults opts,
            email_address : undefined  # must give one of email_address or ip_address
            ip_address    : undefined
            age_s         : required
            cb            : required   # cb(err)
        query = @table('password_reset_attempts')
        start = new Date(new Date() - opts.age_s*1000); end = new Date()
        if opts.email_address?
            query = query.between([opts.email_address, start], [opts.email_address, end], {index:'email_address'})
        else if opts.ip_address?
            query = query.between([opts.ip_address, start], [opts.ip_address, end], {index:'ip_address'})
        else
            query = query.between(start, end, {index:'time'})
        query.count().run(opts.cb)

    #############
    # Tracking file access
    ############
    log_file_access: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            filename   : required
            cb         : undefined
        if not @_validate_opts(opts) then return
        entry =
            project_id : opts.project_id
            account_id : opts.account_id
            filename   : opts.filename
            time       : new Date()
        @table('file_access_log').insert(entry).run((err)=>opts.cb?(err))

    # Get all files accessed in all projects in given time range
    get_file_access: (opts) =>
        opts = defaults opts,
            start  : undefined   # start time
            end    : undefined   # end time
            cb     : required
        query = @table('file_access_log')
        @_process_time_range(opts)
        if opts.start? or opts.end?
            query = query.between(opts.start, opts.end, {index:'time'})
        query.run(opts.cb)

    #############
    # Projects
    ############
    create_project: (opts) =>
        opts = defaults opts,
            account_id  : required    # initial owner
            title       : undefined
            description : undefined
            cb          : required    # cb(err, project_id)
        if not @_validate_opts(opts) then return
        project =
            title       : opts.title
            description : opts.description
            created     : new Date()
            last_edited : new Date()
            users       : {}
        project.users[opts.account_id] = {group:'owner'}
        @table('projects').insert(project).run (err, x) =>
            opts.cb(err, x?.generated_keys[0])

    get_project: (opts) =>
        opts = defaults opts,
            project_id : required   # an array of id's
            columns    : PROJECT_COLUMNS
            cb         : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).pluck(opts.columns).run(opts.cb)

    update_project_data: (opts) =>
        opts = defaults opts,
            project_id : required
            data       : required
            cb         : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).update(opts.data).run(opts.cb)

    get_project_data: (opts) =>
        opts = defaults opts,
            project_id  : required
            columns     : PROJECT_COLUMNS
            cb          : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).pluck(opts.columns...).run(opts.cb)

    _validate_opts: (opts) =>
        for k, v of opts
            if k.slice(k.length-2) == 'id'
                if v? and not misc.is_valid_uuid_string(v)
                    opts.cb?("invalid #{k} -- #{v}")
                    return false
            if k.slice(k.length-3) == 'ids'
                for w in v
                    if not misc.is_valid_uuid_string(w)
                        opts.cb?("invalid uuid #{w} in #{k} -- #{misc.to_json(v)}")
                        return false
            if k == 'group' and v not in misc.PROJECT_GROUPS
                opts.cb?("unknown project group '#{v}'"); return false
            if k == 'groups'
                for w in v
                    if w not in misc.PROJECT_GROUPS
                        opts.cb?("unknown project group '#{w}' in groups"); return false

        return true

    add_user_to_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            group      : required  # see PROJECT_GROUPS above
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).update(users:{"#{opts.account_id}":{group:opts.group}}).run(opts.cb)

    remove_collaborator_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        p = @table('projects').get(opts.project_id)
        p.pluck("users").run (err, x) =>
            if err
                opts.cb(err)
            else if not x.users[opts.account_id]?  # easy case -- not on project anymore anyways
                opts.cb()
            else if x.users[opts.account_id].group == 'owner'
                opts.cb("can't remove owner")
            else
                p.replace(@r.row.without(users:{"#{opts.account_id}":true})).run(opts.cb)

    get_collaborator_ids: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        dbg = @dbg("get_collaborator_ids")
        collabs = {}
        @table('projects').getAll(opts.account_id, index:'users').run (err, x) =>
            if err
                opts.cb(err)
            else
                for project in x
                    for account_id, data of project.users ? {}
                        if data.group in ['collaborator', 'owner']
                            collabs[account_id] = true
                opts.cb(undefined, misc.keys(collabs))

    get_project_users: (opts) =>
        opts = defaults opts,
            project_id : required
            groups     : PROJECT_GROUPS
            cb         : required    # cb(err, {group:[{account_id:?,first_name:?,last_name:?}], ...})
        if not @_validate_opts(opts) then return
        groups = undefined
        async.series([
            (cb) =>
                # get account_id's of all users of the project
                @get_project_data
                    project_id : opts.project_id
                    columns    : ['users']
                    cb         : (err, x) =>
                        if err
                            cb(err)
                        else
                            users = x.users
                            groups = {}
                            for account_id, x of users
                                g = groups[x.group]
                                if not g?
                                    groups[x.group] = [account_id]
                                else
                                    g.push(account_id)
                            cb()
            (cb) =>
                # get names of users
                @account_ids_to_usernames
                    account_ids : underscore.flatten((v for k,v of groups))
                    cb          : (err, names) =>
                        for group, v of groups
                            for i in [0...v.length]
                                account_id = v[i]
                                x = names[account_id]
                                v[i] = {account_id:account_id, first_name:x.first_name, last_name:x.last_name}
                        cb(err)
        ], (err) => opts.cb(err, groups))

    # return list of paths that are public (and not disabled)
    get_public_paths: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_opts(opts) then return
        # TODO: filter disabled on server not on client!
        query = @table('public_paths').getAll(opts.project_id, index:'project_id')
        query.filter(@r.row("disabled").eq(false).default(true)).pluck('path').run (err, v) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, (x.path for x in v))

    has_public_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required    # cb(err, has_public_path)
        query = @table('public_paths').getAll(opts.project_id, index:'project_id')
        query.filter(@r.row("disabled").eq(false).default(true)).count().run (err, n) =>
            opts.cb(err, n>0)

    path_is_public: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : required
        # Get all public paths for the given project_id, then check if path is "in" one according
        # to the definition in misc.
        # TODO: implement caching + changefeeds so that we only do the get once.
        @get_public_paths
            project_id : opts.project_id
            cb         : (err, public_paths) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, misc.path_is_in_public_paths(opts.path, public_paths))

    filter_public_paths: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            listing    : required   # files in path [{name:..., isdir:boolean, ....}, ...]
            cb         : required
        # Get all public paths for the given project_id, then check if path is "in" one according
        # to the definition in misc.
        # TODO: implement caching + changefeeds so that we only do the get once.
        @get_public_paths
            project_id : opts.project_id
            cb         : (err, public_paths) =>
                # winston.debug("filtering public paths: orig listing = #{misc.to_json(opts.listing)}")
                if err
                    opts.cb(err)
                    return
                if misc.path_is_in_public_paths(opts.path, public_paths)
                    # nothing to do -- containing path is public
                    listing = opts.listing
                else
                    listing = misc.deep_copy(opts.listing) # don't mututate input on general principle
                    # some files in the listing might not be public, since the containing path isn't public, so we filter
                    # WARNING: this is kind of stupid since misc.path_is_in_public_paths is badly implemented, especially
                    # for this sort of iteration.  TODO: make this faster.  This could matter since is done on server.
                    listing.files = (x for x in listing.files when misc.path_is_in_public_paths(misc.path_to_file(opts.path, x.name), public_paths))
                # winston.debug("filtering public paths: new listing #{misc.to_json(listing)}")
                opts.cb(undefined, listing)

    # Set last_edited for this project to right now, and possibly update its size.
    # It is safe and efficient to call this function very frequently since it will
    # actually hit the database at most once every 30s (per project).  In particular,
    # once called, it ignores subsequent calls for the same project for 30s.
    touch_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : undefined
        if not @_validate_opts(opts) then return
        if not @_touch_project_cache?
            @_touch_project_cache = {}
        tm = @_touch_project_cache[opts.project_id]
        if tm? and misc.walltime(tm) < 30
            opts.cb?()
            return
        @_touch_project_cache[opts.project_id] = misc.walltime()
        now = new Date()
        @table('projects').get(opts.project_id).update(last_edited:now).run((err) => opts.cb?(err))

    recently_modified_projects: (opts) =>
        opts = defaults opts,
            max_age_s : required
            cb        : required
        start = new Date(new Date() - opts.max_age_s*1000)
        @table('projects').between(start, new Date(), {index:'last_edited'}).pluck('project_id').run (err, x) =>
            opts.cb(err, if x? then (z.project_id for z in x))

    # cb(err, true if user is in one of the groups for the project)
    user_is_in_project_group: (opts) =>
        opts = defaults opts,
            project_id  : required
            account_id  : undefined
            groups      : required  # array of elts of PROJECT_GROUPS above
            cb          : required  # cb(err, true if in group)
        if not opts.account_id?
            # clearly user -- who isn't even signed in -- is not in the group
            opts.cb(undefined, false)
            return
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id)('users')(opts.account_id)('group').run (err, group) =>
            if err?
                if err.name == "ReqlRuntimeError"
                    # indicates that there's no opts.account_id key in the table (or users key) -- error is different
                    # (i.e., ReqlDriverError) when caused by connection being down.
                    # one more chance -- admin?
                    @is_admin(opts.account_id, opts.cb)
                else
                    opts.cb(err)
            else
                opts.cb(undefined, group in opts.groups)

    # all id's of projects having anything to do with the given account (ignores
    # hidden projects unless opts.hidden is true).
    get_project_ids_with_user: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required      # opts.cb(err, [project_id, project_id, project_id, ...])
        if not @_validate_opts(opts) then return
        @table('projects').getAll(opts.account_id, index:'users').pluck('project_id').run (err, x) =>
            opts.cb(err, if x? then (y.project_id for y in x))

    # Gets all projects that the given account_id is a user on (owner,
    # collaborator, or viewer); gets columns data about them, not just id's
    get_projects_with_user: (opts) =>
        opts = defaults opts,
            account_id       : required
            columns          : PROJECT_COLUMNS
            hidden           : false      # if true, get *ONLY* hidden projects; if false, don't include hidden projects
            cb               : required
        if not @_validate_opts(opts) then return
        @table('projects').getAll(opts.account_id, index:'users').filter((project)=>
            project("users")(opts.account_id)('hide').default(false).eq(opts.hidden)).pluck(opts.columns).run(opts.cb)

    # Get all projects with the given id's.  Note that missing projects are
    # ignored (not an error).
    get_projects_with_ids: (opts) =>
        opts = defaults opts,
            ids     : required   # an array of id's
            columns : PROJECT_COLUMNS
            cb      : required
        if not @_validate_opts(opts) then return
        if opts.ids.length == 0
            opts.cb(undefined, [])
        else
            @table('projects').getAll(opts.ids...).pluck(opts.columns).run(opts.cb)

    # cb(err, array of account_id's of accounts in non-invited-only groups)
    # TODO: add something about invited users too and show them in UI!
    get_account_ids_using_project: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).pluck('users').run (err, x) =>
            opts.cb(err, if x?.users? then (id for id,v of x.users when v.group?.indexOf('invite') == -1) else [])

    ###
    # Compute servers / projects
    ###
    # NOTE: here's how to watch for a project to move:
    #    db.table('projects').get('952ea92f-b12d-48f7-b65d-d12bb0c2fbf8').changes().filter(db.r.row('new_val')('host').ne(db.r.row('old_val')('host'))).run((e,c)->c.each(console.log))
    #
    set_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            host       : required
            cb         : required
        assigned = new Date()
        @table('projects').get(opts.project_id).update(
            host:{host:opts.host, assigned:assigned}).run((err)=>opts.cb(err, assigned))

    get_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('host').run (err, x) =>
            opts.cb(err, if x then x.host)

    get_project_quotas: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('settings').run (err, x) =>
            if err
                opts.cb(err); return
            settings = x.settings
            if not settings?
                opts.cb(undefined, misc.copy(DEFAULT_QUOTAS))
            else
                quotas = {}
                for k, v of DEFAULT_QUOTAS
                    quotas[k] = if not settings[k]? then v else settings[k]
                opts.cb(undefined, quotas)

    set_project_settings: (opts) =>
        opts = defaults opts,
            project_id : required
            settings   : required   # can be any subset of the map
            cb         : required
        @table('projects').get(opts.project_id).update(settings:opts.settings).run(opts.cb)

    #############
    # File editing activity -- users modifying files in any way
    #   - one single table called file_activity with numerous indexes
    #   - table also records info about whether or not activity has been seen by users
    ############
    record_file_use: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            account_id : required
            action     : required  # 'edit', 'read', 'seen', 'chat', etc.?
            cb         : required
        now = new Date()
        entry =
            id         : @sha1(opts.project_id, opts.path)
            project_id : opts.project_id
            path       : opts.path
            users      : {"#{opts.account_id}": {"#{opts.action}": now}}
        if opts.action == 'edit' or opts.action == 'chat'
            entry.last_edited = now
        #winston.debug("record_file_use: #{misc.to_json(entry)}")
        @table('file_use').insert(entry, conflict:'update').run(opts.cb)

    get_file_use: (opts) =>
        opts = defaults opts,
            max_age_s   : required
            project_id  : undefined    # don't specify both project_id and project_ids
            project_ids : undefined
            path        : undefined    # if given, project_id must be given
            cb          : required     # entry if path given; otherwise, an array
        cutoff = new Date(new Date() - opts.max_age_s*1000)
        if opts.path?
            if not opts.project_id?
                opts.cb("if path is given project_id must also be given")
                return
            @table('file_use').between([opts.project_id, opts.path, cutoff],
                               [opts.project_id, opts.path, new Date()], index:'project_id-path-last_edited').orderBy('last_edited').run((err,x)=>opts.cb(err, if x then x[0]))
        else if opts.project_id?
            @table('file_use').between([opts.project_id, cutoff],
                               [opts.project_id, new Date()], index:'project_id-last_edited').orderBy('last_edited').run(opts.cb)
        else if opts.project_ids?
            ans = []
            f = (project_id, cb) =>
                @get_file_use
                    max_age_s  : opts.max_age_s
                    project_id : project_id
                    cb         : (err, x) =>
                        cb(err, if not err then ans = ans.concat(x))
            async.map(opts.project_ids, f, (err)=>opts.cb(err,ans))
        else
            @table('file_use').between(cutoff, new Date(), index:'last_edited').orderBy('last_edited').run(opts.cb)

    ###
    # STATS
    ###

    # If there is a cached version of stats (which has given ttl) return that -- this could have
    # been computed by any of the hubs.  If there is no cached version, compute new one and store
    # in cache for ttl seconds.
    # CONCERN: This could take around 15 seconds, and numerous hubs could all initiate it
    # at once, which is a waste.
    num_recent_projects: (opts) =>
        opts = defaults opts,
            age_m : required
            cb    : required
        @table('projects').between(new Date(new Date() - opts.age_m*60*1000), new Date(),
                                      {index:'last_edited'}).count().run(opts.cb)

    get_stats: (opts) =>
        opts = defaults opts,
            ttl : 60  # how long cached version lives (in seconds)
            cb  : required
        stats = undefined
        async.series([
            (cb) =>
                @table('stats').between(new Date(new Date() - 1000*opts.ttl), new Date(),
                                           {index:'time'}).orderBy('time').run (err, x) =>
                    if x?.length then stats=x[x.length - 1]
                    cb(err)
            (cb) =>
                if stats?
                    cb(); return
                stats = {time:new Date()}
                async.parallel([
                    (cb) =>
                        @table('accounts').count().run((err, x) => stats.accounts = x; cb(err))
                    (cb) =>
                        @table('projects').count().run((err, x) => stats.projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 5, cb : (err, x) => stats.active_projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 60*24, cb : (err, x) => stats.last_day_projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 60*24*7, cb : (err, x) => stats.last_week_projects = x; cb(err))
                    (cb) =>
                        @num_recent_projects(age_m : 60*24*30, cb : (err, x) => stats.last_month_projects = x; cb(err))
                    (cb) =>
                        @table("hub_servers").run (err, hub_servers) =>
                            if err
                                cb(err)
                            else
                                now = new Date()
                                stats.hub_servers = []
                                for x in hub_servers
                                    if x.expire > now
                                        delete x.expire
                                        stats.hub_servers.push(x)
                                cb()
                ], cb)
            (cb) =>
                @table('stats').insert(stats).run(cb)
        ], (err) => opts.cb(err, stats))

    ###
    # Hub servers
    ###
    register_hub: (opts) =>
        opts = defaults opts,
            host    : required
            port    : required
            clients : required
            ttl     : required
            cb      : required
        @table('hub_servers').insert({
            host:opts.host, port:opts.port, clients:opts.clients, expire:expire_time(opts.ttl)
            }, conflict:"replace").run(opts.cb)

    get_hub_servers: (opts) =>
        opts = defaults opts,
            cb   : required
        @table('hub_servers').run (err, v) =>
            if err
                opts.cb(err)
            else
                w = []
                to_delete = []
                for x in v
                    if x.expire and x.expire <= new Date()
                        to_delete.push(x.host)
                    else
                        w.push(x)
                if to_delete.length > 0
                    @table('hub_servers').getAll(to_delete...).delete().run (err) =>
                        if err
                            opts.cb(err)
                        else
                            opts.cb(undefined, w)
                else
                    opts.cb(undefined, w)
    ###
    # Compute servers
    ###
    save_compute_server: (opts) =>
        opts = defaults opts,
            host         : required
            dc           : required
            port         : required
            secret       : required
            experimental : false
            cb           : required
        x = misc.copy(opts); delete x['cb']
        @table('compute_servers').insert(x, conflict:'update').run(opts.cb)

    get_compute_server: (opts) =>
        opts = defaults opts,
            host         : required
            cb           : required
        @table('compute_servers').get(opts.host).run(opts.cb)

    get_all_compute_servers: (opts) =>
        opts = defaults opts,
            cb           : required
        @table('compute_servers').run(opts.cb)

    get_projects_on_compute_server: (opts) =>
        opts = defaults opts,
            compute_server : required    # hostname of the compute server
            columns        : ['project_id']
            cb             : required
        @table('projects').getAll(opts.compute_server, index:'compute_server').pluck(opts.columns).run(opts.cb)

    set_project_compute_server: (opts) =>
        opts = defaults opts,
            project_id     : required
            compute_server : required   # hostname of the compute server
            cb             : required
        @table('projects').get(opts.project_id).update(
            compute_server:opts.compute_server).run(opts.cb)

    ###
    # BLOB store.  Fields:
    #     id     = uuid from sha1(blob)
    #     blob   = the actual blob
    #     expire = time when object expires
    ###
    save_blob: (opts) =>
        opts = defaults opts,
            uuid       : required  # uuid=sha1-based uuid coming from blob
            blob       : required  # we assume misc_node.uuidsha1(opts.blob) == opts.uuid; blob should be a string or Buffer
            ttl        : 0         # object in blobstore will have *at least* this ttl in seconds;
                                   # if there is already something in blobstore with longer ttl, we leave it;
                                   # infinite ttl = 0 or undefined.
            project_id : required  # the id of the project that is saving the blob
            cb         : required  # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl
        @table('blobs').get(opts.uuid).pluck('expire').run (err, x) =>
            if err
                if err.name == 'ReqlRuntimeError'
                    # get ReqlRuntimeError if the blob not already saved, due to trying to pluck from nothing
                    x =
                        id         : opts.uuid
                        blob       : opts.blob
                        expire     : expire_time(opts.ttl)
                        project_id : opts.project_id
                        count      : 0
                        size       : opts.blob.length
                        created    : new Date()
                    @table('blobs').insert(x).run (err) =>
                        opts.cb(err, opts.ttl)
                else
                    # some other error
                    opts.cb(err)
            else
                # the blob was already saved
                new_expire = undefined
                if not x.expire
                    # ttl already infinite -- nothing to do
                    ttl = 0
                else
                    if opts.ttl
                        # saved ttl is finite as is requested one; change in db if requested is longer
                        z = expire_time(opts.ttl)
                        if z > x.expire
                            new_expire = z
                            ttl = opts.ttl
                        else
                            ttl = (x.expire - new Date())/1000.0
                    else
                        # saved ttl is finite but requested one is infinite
                        ttl = 0
                        new_expire = 0
                if new_expire?
                    query = @table('blobs').get(opts.uuid)
                    if new_expire == 0
                        query = query.replace(@r.row.without(expire:true))
                    else
                        query = query.update(expire:new_expire)
                    query.run((err) => opts.cb(err, ttl))
                else
                    opts.cb(undefined, ttl)

    get_blob: (opts) =>
        opts = defaults opts,
            uuid : required
            cb   : required
        @table('blobs').get(opts.uuid).run (err, x) =>
            if err
                opts.cb(err)
            else
                if not x
                    opts.cb(undefined, undefined)
                else if x.expire and x.expire <= new Date()
                    opts.cb(undefined, undefined)   # no such blob anymore
                    @table('blobs').get(opts.uuid).delete().run()   # delete it
                else
                    opts.cb(undefined, x.blob)
                    # We now also update the access counter/times for the blob, but of course
                    # don't block on opts.cb above to do this.
                    @touch_blob(uuid : opts.uuid)

    touch_blob: (opts) =>
        opts = defaults opts,
            uuid : required
            cb   : undefined
        x =
            count       : @r.row('count').add(1)
            last_active : new Date()
        @table('blobs').get(opts.uuid).update(x).run((err) => opts.cb?(err))

    remove_blob_ttls: (opts) =>
        opts = defaults opts,
            uuids : required   # uuid=sha1-based from blob
            cb    : required   # cb(err)
        @table('blobs').getAll(opts.uuids...).replace(
            @r.row.without(expire:true)).run(opts.cb)

    user_query_cancel_changefeed: (opts) =>
        winston.debug("user_query_cancel_changefeed: opts=#{misc.to_json(opts)}")
        opts = defaults opts,
            id : required
            cb : undefined
        x = @_change_feeds[opts.id]
        if x?
            winston.debug("user_query_cancel_changefeed: #{opts.id}")
            delete @_change_feeds[opts.id]
            async.map(x, ((y,cb)->y.close(cb)), ((err)->opts.cb?(err)))
        else
            opts.cb?()

    user_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            query      : required
            options    : []         # used for initial query; **IGNORED** by changefeed!
            changes    : undefined  # id of change feed
            cb         : required   # cb(err, result)  # WARNING -- this *will* get called multiple times when changes is true!
        if misc.is_array(opts.query)
            if opts.changes and opts.query.length > 1
                opts.cb("changefeeds only implemented for single table")
                return
            # array of queries
            result = []
            f = (query, cb) =>
                @user_query
                    account_id : opts.account_id
                    query      : query
                    options    : opts.options
                    cb         : (err, x) =>
                        result.push(x); cb(err)
            async.mapSeries(opts.query, f, (err) => opts.cb(err, result))
            return

        subs =
            '{account_id}' : opts.account_id
            '{now}' : new Date()

        if opts.changes?
            changes =
                id : opts.changes
                cb : opts.cb

        # individual query
        v = misc.keys(opts.query)
        if v.length > 1
            opts.cb?('must specify exactly one key in the query')
            return
        table = v[0]
        query = opts.query[table]
        if misc.is_array(query)
            if query.length > 1
                opts.cb("array of length > 1 not yet implemented")
                return
            multi = true
            query = query[0]
        else
            multi = false
        if typeof(query) == "object"
            query = misc.deep_copy(query)
            obj_key_subs(query, subs)
            if has_null_leaf(query)
                if changes and not multi
                    opts.cb("changefeeds only implemented for multi-document queries")
                    return
                @user_get_query
                    account_id : opts.account_id
                    table      : table
                    query      : query
                    options    : opts.options
                    multi      : multi
                    changes    : changes
                    cb         : (err, x) => opts.cb(err, {"#{table}":x})
            else
                if changes
                    opts.cb("changefeeds only for read queries")
                    return
                if not opts.account_id?
                    opts.cb("user must be signed in to do a set query")
                    return
                @user_set_query
                    account_id : opts.account_id
                    table      : table
                    query      : query
                    cb         : (err, x) => opts.cb(err, {"#{table}":x})
        else
            opts.cb("invalid user_query of '#{table}' -- query must be an object")

    _query_is_cmp: (obj) =>
        for k, _ of obj
            if k in ['==', '!=', '>=', '<=', '>', '<']
                return true
        return false

    _query_cmp: (filter, x, q) =>
        for op, val of q
            switch op
                when '=='
                    x = x.eq(val)
                when '!='
                    x = x.ne(val)
                when '>='
                    x = x.ge(val)
                when '>'
                    x = x.gt(val)
                when '<'
                    x = x.lt(val)
                when '<='
                    x = x.le(val)
            if filter?
                filter = filter.and(x)
            else
                filter = x
        return filter

    _query_descend: (filter, x, q) =>
        for k, v of q
            if v != null
                if typeof(v) != 'object'
                    v = {'==':v}
                if misc.len(v) == 0
                    continue
                row = x(k)
                if @_query_is_cmp(v)
                    filter = @_query_cmp(filter, row, v)
                else
                    filter = @_query_descend(filter, row, v)
        return filter

    _query_to_filter: (query, primary_key) =>
        filter = undefined
        for k, v of query
            if primary_key? and k == primary_key
                continue
            if v != null
                if typeof(v) != 'object'
                    v = {'==':v}
                if misc.len(v) == 0
                    continue
                row = @r.row(k)
                if @_query_is_cmp(v)
                    filter = @_query_cmp(filter, row, v)
                else
                    filter = @_query_descend(filter, row, v)

        return filter

    _query_to_field_selector: (query, primary_key) =>
        selector = {}
        for k, v of query
            if k == primary_key or v == null or typeof(v) != 'object'
                selector[k] = true
            else
                sub = true
                for a, _ of v
                    if a in ['==', '!=', '>=', '>', '<', '<=']
                        selector[k] = true
                        sub = false
                        break
                if sub
                    selector[k] = @_query_to_field_selector(v, primary_key)
        return selector

    _query_get: (table, query, account_id) =>
        x = {}
        keys = misc.keys(query)
        if keys.length == 0
            x.err = "must specify at least one field"
            return x

        t = SCHEMA[table]
        if not t?
            x.err = "unknown table '#{table}'"
            return x

        for k in keys
            if t.user_set?[k]? or t.user_get?[k]?
                continue
            if t.admin_get?[k]?
                x.require_admin = true
                continue
            x.err = "reading #{table}.#{k} not allowed"
            return x

        if not t.user_get_all?
            x.err = "filtering all from #{table} not allowed"
            return x

        if t.user_get_all == 'all_projects_read' and query.project_id?
            {get_all, err} = @_primary_key_query('project_id', query)
            if err
                x.err = err
                return x
            else
                x.get_all = get_all
                x.require_project_read_access = get_all
        if not x.get_all?
            x.get_all = t.user_get_all
        return x

    is_admin: (account_id, cb) =>
        @table('accounts').get(account_id).pluck('groups').run (err, x) =>
            if err
                cb(err)
            else
                cb(undefined, x?.groups? and 'admin' in x.groups)

    _require_is_admin: (account_id, cb) =>
        @is_admin account_id, (err, is_admin) =>
            if err
                cb(err)
            else if not is_admin
                cb("user must be an admin")
            else
                cb()

    # Ensure that each project_id in project_ids is such that the account is in one of the given
    # groups for the project, or that the account is an admin.  If not, cb(err).
    _require_project_ids_in_groups: (account_id, project_ids, groups, cb) =>
        s = {"#{account_id}": true}
        require_admin = false
        @table('projects').getAll(project_ids...).pluck(project_id:true, users:s).run (err, x) =>
            if err
                cb(err)
            else
                known_project_ids = {}  # we use this to ensure that each of the given project_ids exists.
                for p in x
                    known_project_ids[p.project_id] = true
                    if p.users[account_id]?.group not in groups
                        require_admin = true
                # If any of the project_ids don't exist, reject the query.
                for project_id in project_ids
                    if not known_project_ids[project_id]
                        cb("unknown project_id '#{misc.trunc(project_id,100)}'")
                        return
                if require_admin
                    @_require_is_admin(account_id, cb)
                else
                    cb()

    _query_parse_options: (db_query, options) =>
        limit = err = undefined
        for x in options
            for name, value of x
                switch name
                    when 'limit'
                        db_query = db_query.limit(value)
                        limit = value
                    when 'slice'
                        db_query = db_query.slice(value...)
                    when 'order_by'
                        if value[0] == '-'
                            value = @r.desc(value.slice(1))
                        # TODO: could optimize with an index
                        db_query = db_query.orderBy(value)
                    else
                        err:"unknown option '#{name}'"
        return {db_query:db_query, err:err, limit:limit}

    _primary_key_query: (primary_key, query) =>
        if query[primary_key]? and query[primary_key] != null
            # primary key query
            x = query[primary_key]
            if misc.is_array(x)
                get_all = x
            else
                if typeof(x) != 'object'
                    x = {'==':x}
                for k, v of x
                    if k == '=='
                        get_all = [v]
                        break
                    else
                        return {err:"invalid primary key query: '#{k}'"}
        return {get_all:get_all}

    user_set_query: (opts) =>
        opts = defaults opts,
            account_id : required
            table      : required
            query      : required
            cb         : required   # cb(err)
        query = misc.copy(opts.query)
        table = opts.table
        account_id = opts.account_id

        s = SCHEMA[table]
        user_query = s?.user_query
        if not user_query?.set?.fields?
            opts.cb("user set queries not allowed for table '#{opts.table}'")
            return

        # verify all requested fields may be set by users, and also fill in generated values
        for field in misc.keys(user_query.set.fields)
            if user_query.set.fields[field] == undefined
                opts.cb("user set query not allowed for #{opts.table}.#{field}")
                return
            switch user_query.set.fields[field]
                when 'account_id'
                    query[field] = account_id
                when 'time_id'
                    query[field] = uuid.v1()
                    #console.log("time_id -- query['#{field}']='#{query[field]}'")
                when 'project_write'
                    if not query[field]?
                        opts.cb("must specify #{opts.table}.#{field}")
                        return
                    require_project_ids_write_access = [query[field]]

        # call any set functions (after doing the above)
        for field in misc.keys(query)
            f = user_query.set.fields?[field]
            if typeof(f) == 'function'
                query[field] = f(query, @)

        if user_query.set.admin
            require_admin = true

        primary_key = s.primary_key
        if not primary_key?
            primary_key = 'id'
        for k, v of query
            if primary_key == k
                continue
            if s.user_query?.set?.fields?[k] != undefined
                continue
            if s.admin_query?.set?.fields?[k] != undefined
                require_admin = true
                continue
            opts.cb("changing #{table}.#{k} not allowed")
            return

        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        if require_admin
                            @_require_is_admin(account_id, cb)
                        else
                            cb()
                    (cb) =>
                        if require_project_ids_write_access?
                            @_require_project_ids_in_groups(account_id, require_project_ids_write_access,\
                                             ['owner', 'collaborator'], cb)
                        else
                            cb()
                ], cb)
            (cb) =>
                @table(table).insert(query, conflict:'update').run(cb)
        ], opts.cb)

    # fill in the default values for obj in the given table
    _query_set_defaults: (obj, table, fields) =>
        if not misc.is_array(obj)
            obj = [obj]
        else if obj.length == 0
            return
        s = SCHEMA[table]?.user_query?.get?.fields ? {}
        for k in fields
            v = s[k]
            if v?
                for x in obj
                    if x?
                        if not x[k]?
                            x[k] = misc.deep_copy(v)

    user_get_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            table      : required
            query      : required
            multi      : required
            options    : required   # used for initial query; **IGNORED** by changefeed!
            changes    : undefined  # {id:?, cb:?}
            cb         : required   # cb(err, result)
        ###
        # User queries are of the form

            .table(table).getAll(get_all).filter(filter).pluck(pluck)[limit|slice options]

        Using the whitelist rules specified in SCHEMA, we
        determine each of get_all, filter, pluck, and options,
        then run the query.

        If no error in query, and changes is a given uuid, then sets up a change
        feed that calls opts.cb on changes as well.
        ###
        dbg = @dbg("user_get_query(account_id=#{opts.account_id}, table=#{opts.table})")

        if opts.changes?
            if not opts.changes.id?
                opts.cb("user_get_query -- must specifiy opts.changes.id"); return
            if not opts.changes.cb?
                opts.cb("user_get_query -- must specifiy opts.changes.cb"); return

        # get data about user queries on this table
        user_query = SCHEMA[opts.table]?.user_query
        if not user_query?.get?
            opts.cb("user get queries not allowed for table '#{opts.table}'")
            return

        if not opts.account_id? and not SCHEMA[opts.table].anonymous
            opts.cb("anonymous get queries not allowed for table '#{opts.table}'")
            return

        # verify all requested fields may be read by users
        for field in misc.keys(opts.query)
            if user_query.get.fields?[field] == undefined
                opts.cb("user get query not allowed for #{opts.table}.#{field}")
                return

        # get the query that gets only things in this table that this user
        # is allowed to see.
        if not user_query.get.all?.args?
            opts.cb("user get query not allowed for #{opts.table} (no getAll filter)")
            return

        result = undefined
        db_query = @table(SCHEMA[opts.table].virtual ? opts.table)
        opts.this = @

        # The killfeed below is only used when changes is true in case of tricky queries that depend
        # looking up a varying collection of things in the index.   Any activity on this feed results
        # in an error that recreates this feed.  This is a "brutal" approach, but the resulting error
        # will cause the client to reconnect and reset properly, so it's clean.  It's of course less
        # efficient, and should only be used in situations where it will rarely happen.  E.g.,
        # the collaborators of a user don't change constantly.
        killfeed = undefined
        require_admin = false
        async.series([
            (cb) =>
                dbg("initial selection of records from table")
                # Get the spec
                {cmd, args} = user_query.get.all
                if not cmd?
                    cmd = 'getAll'
                if typeof(args) == 'function'
                    args = args(opts.query, @)
                else
                    args = (x for x in args) # important to copy!
                v = []
                f = (x, cb) =>
                    if x == 'account_id'
                        v.push(opts.account_id)
                        cb()
                    else if x == 'project_id-public'
                        if not opts.query.project_id
                            cb("must specify project_id")
                        else
                            if SCHEMA[opts.table].anonymous
                                @has_public_path
                                    project_id : opts.query.project_id
                                    cb         : (err, has_public_path) =>
                                        if err
                                            cb(err)
                                        else if not has_public_path
                                            cb("project does not have any public paths")
                                        else
                                            v.push(opts.query.project_id)
                                            cb()
                    else if x == 'project_id'
                        if not opts.query.project_id
                            cb("must specify project_id")
                        else
                            if SCHEMA[opts.table].anonymous
                                v.push(opts.query.project_id)
                                cb()
                            else
                                @user_is_in_project_group
                                    account_id : opts.account_id
                                    project_id : opts.query.project_id
                                    groups     : ['owner', 'collaborator']
                                    cb         : (err, in_group) =>
                                        if err
                                            cb(err)
                                        else if in_group
                                            v.push(opts.query.project_id)
                                            cb()
                                        else
                                            cb("you do not have read access to this project")
                    else if x == 'all_projects_read'
                        @get_project_ids_with_user
                            account_id : opts.account_id
                            cb         : (err, y) =>
                                if err
                                    cb(err)
                                else
                                    if y.length == 0
                                        # Annoying edge case -- RethinkDB doesn't allow things like getAll with no arguments;
                                        # We want to interpret them as the empty result.
                                        # TODO: They plan to fix this -- see https://github.com/rethinkdb/rethinkdb/issues/2588
                                        y = ['this-is-not-a-valid-project-id']
                                    v = v.concat(y)
                                    if opts.changes?
                                        # See comment below in 'collaborators' case.  The query here is exactly the same as
                                        # in collaborators below, since we need to reset whenever the collabs change on any project.
                                        # I think that plucking only the project_id should work, but it actually doesn't
                                        # (I don't understand why yet).
                                        # Changeeds are tricky!
                                        @table('projects').getAll(opts.account_id, index:'users').pluck('users').changes(includeStates: false).run(includeInitialVals: false, (err, feed) => killfeed = feed; cb(err))
                                    else
                                        cb()
                    else if x == "collaborators"
                        @get_collaborator_ids
                            account_id : opts.account_id
                            cb         : (err, y) =>
                                if err
                                    cb(err)
                                else
                                    v = v.concat(y)
                                    if opts.changes?
                                        # Create the feed that tracks the users on the projects that account_id uses.
                                        # Whenever there is some change in the users of those projects, this
                                        # will emit a record, causing the client to reset the changefeed, which
                                        # will eventually result in a new changefeed with the correct collaborators.
                                        # We *could* be more clever and check that the exact collaborators really changed,
                                        # or try to be even more clever in various ways.  However, all approaches along
                                        # those lines involve manipulating complicated data structures in the server
                                        # that could take too much cpu time or memory.  So we go with this simple solution.
                                        @table('projects').getAll(opts.account_id, index:'users').pluck('users').changes(includeStates: false).run(includeInitialVals: false, (err, feed) =>killfeed = feed; cb(err))
                                    else
                                        cb()
                    else if typeof(x) == 'function'
                        # things like r.maxval are functions
                        v.push(x)
                        cb()
                    else
                        v.push(x)
                        cb()

                # First this function g parses each array in the args.  These are used for
                # multi-indexes.  This whole block of code g and the map below does *nothing*
                # unless the args spec for this schema has a single-level nested array in it.
                g = (i, cb) =>
                    arg = args[i]
                    if not misc.is_array(arg)
                        #console.log(arg, " is not an array")
                        cb()
                    else
                        v = [] # we reuse the global variable f for parsing each array, hence use mapSeries below!
                        async.mapSeries arg, f, (err) =>
                            if err
                                cb(err)
                            else
                                # succeeded in parsing array; replace args[i] by it.
                                #console.log('parsed something and got ', v)
                                args[i] = v
                                cb()
                # The first mapSeries parses any arrays in args (usually there are none)
                async.mapSeries [0...args.length], g, (err) =>
                    if err
                        cb(err)
                    else
                        # Next reset v and parse everything in args that is left.
                        # Each call to f does argument substitutions, possibly checks
                        # permissions, etc.
                        v = []
                        async.mapSeries args, f, (err) =>
                            if err
                                cb(err)
                            else
                                if v.length == 0
                                    # Annoying edge case -- RethinkDB doesn't allow things like getAll with no arguments;
                                    # We want to interpret them as the empty result.
                                    # TODO: They plan to fix this -- see https://github.com/rethinkdb/rethinkdb/issues/2588
                                    v = ['this-is-not-a-valid-project-id']
                                #console.log("cmd=#{cmd}")
                                #try
                                #    console.log("v=#{misc.to_json(v)}")
                                #catch
                                #    console.log("error showing v")
                                db_query = db_query[cmd](v...)
                                cb()
            (cb) =>
                dbg("filter the query")
                # Parse the filter part of the query
                query = misc.copy(opts.query)
                filter  = @_query_to_filter(query)
                if filter?
                    db_query = db_query.filter(filter)

                # Parse the pluck part of the query
                pluck   = @_query_to_field_selector(query)
                db_query = db_query.pluck(pluck)

                # If not multi, limit to one result
                if not opts.multi
                    db_query = db_query.limit(1)

                # Parse option part of the query
                db_query_no_opts = db_query
                {db_query, limit, err} = @_query_parse_options(db_query, opts.options)
                if err
                    cb(err); return

                dbg("run the query -- #{misc.to_json(opts.query)}")
                time_start = misc.walltime()
                db_query.run (err, x) =>
                    if err
                        dbg("query (time=#{misc.walltime(time_start)}s): #{misc.to_json(opts.query)} ERROR -- #{misc.to_json(err)}")
                        cb(err)
                    else
                        dbg("query (time=#{misc.walltime(time_start)}s): #{misc.to_json(opts.query)} got -- #{x.length} results")
                        if not opts.multi
                            x = x[0]
                        result = x
                        @_query_set_defaults(result, opts.table, misc.keys(opts.query))
                        cb()
                        if opts.changes?
                            # no errors -- setup changefeed now
                            changefeed_id = opts.changes.id
                            changefeed_cb = opts.changes.cb
                            winston.debug("FEED -- setting up a feed with id #{changefeed_id}")
                            do_feed = (err, feed) =>
                                if err
                                    winston.debug("FEED -- error setting up #{misc.to_json(err)}")
                                    cb(err)
                                else
                                    if not @_change_feeds?
                                        @_change_feeds = {}
                                    @_change_feeds[changefeed_id] = [feed]
                                    changefeed_state = 'initializing'
                                    feed.each (err, x) =>
                                        #if x?.state?
                                        #    changefeed_state = x.state
                                        #if not err and changefeed_state != 'ready'
                                        #    # still producing initial documents (happens with some queries)
                                        #    return
                                        # winston.debug("FEED #{changefeed_id} -- saw a change! #{misc.to_json([err,x])}")
                                        if not err
                                            @_query_set_defaults(x.new_val, opts.table, misc.keys(opts.query))
                                        else
                                            # feed is broken
                                            winston.debug("FEED #{changefeed_id} is broken, so canceling -- #{misc.to_json(err)}")
                                            @user_query_cancel_changefeed(id:changefeed_id)
                                        changefeed_cb(err, x)
                                    if killfeed?
                                        winston.debug("killfeed(table=#{opts.table}, account_id=#{opts.account_id}, changes.id=#{changefeed_id}) -- watching")
                                        # Setup the killfeed, which if it sees any activity results in the
                                        # feed sending out an error and also being killed.
                                        @_change_feeds[changefeed_id].push(killfeed)  # make sure this feed is also closed
                                        killfeed_state = 'initializing'  # killfeeds should have {includeStates: false}
                                        killfeed.each (err, val) =>
                                            #if not err and val?.state?
                                            #    # info about the state of the changefeed -- may be producing initial docs or new ones
                                            #    killfeed_state = val.state
                                            #    return
                                            #if not err and killfeed_state != 'ready'
                                            #    # still producing initial docs
                                            #    return
                                            # TODO: an optimization for some kinds of killfeeds would be to track what we really care about,
                                            # e.g., the list of project_id's, and only if that changes actually force reset below.
                                            # Send an error via the callback; the client *should* take this as a sign
                                            # to start over, which is entirely their responsibility.
                                            winston.debug("killfeed(table=#{opts.table}, account_id=#{opts.account_id}, changes.id=#{changefeed_id}) -- canceling changed using killfeed!")
                                            changefeed_cb("killfeed")
                                            # Saw activity -- cancel the feeds (both the main one and the killfeed)
                                            @user_query_cancel_changefeed(id: changefeed_id)
                            db_query_no_opts.changes(includeStates: false).run(includeInitialVals: false, do_feed)
        ], (err) =>
            #if err
            #    dbg("error: #{misc.to_json(err)}")
            opts.cb(err, result)
        )

    # Stress testing
    stress1: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        collaborators = undefined
        changefeeds = []
        dbg = (m) => winston.debug("stress1(#{opts.account_id}): #{m}")
        async.series([
            (cb) =>
                dbg("get collabs")
                t = misc.mswalltime()
                @user_query
                    account_id : opts.account_id
                    query      : {collaborators:[{account_id:null, first_name:null, last_name:null}]}
                    cb         : (err, x) =>
                        collaborators = x?.collaborators
                        dbg("got #{collaborators?.length}, time=#{misc.mswalltime(t)}")
                        cb(err)
            (cb) =>
                t = misc.mswalltime()
                n = 0
                f = (user, cb) =>
                    id = misc.uuid()
                    changefeeds.push(id)
                    @user_query
                        account_id : user.account_id
                        query      : {collaborators:[{first_name:null,last_name:null,last_active:null,account_id:null}]}
                        changes    : id
                        cb         : (err, x) =>
                            if cb?
                                n += 1
                                if n%50 == 0
                                    dbg("did #{n} queries")
                                cb?(err)
                                cb = undefined  # so don't call again due to changefeed
                            else
                                dbg("change: #{user.first_name} #{user.last_name} #{x?.collaborators?.length}")
                dbg("getting changefeeds for all #{collaborators.length}'s collaborators in parallel")
                async.map collaborators, f, (err) =>
                    dbg("done, time=#{misc.mswalltime(t)}")
                    cb(err)
            #(cb) =>
            #    t = misc.mswalltime()
            #    dbg("canceling all changefeeds")
            #    f = (id, cb) =>
            #        @user_query_cancel_changefeed(id:id)
            #    async.map changefeeds, f, (err) =>
            #        dbg("done, time=#{misc.mswalltime(t)}")
            #        cb(err)
        ], (err) =>
            opts.cb?(err)
        )



has_null_leaf = (obj) ->
    for k, v of obj
        if v == null or (typeof(v) == 'object' and has_null_leaf(v))
            return true
    return false

# modify obj in place substituting keys as given.
obj_key_subs = (obj, subs) ->
    for k, v of obj
        s = subs[k]
        if s?
            delete obj[k]
            obj[s] = v
        if typeof(v) == 'object'
            obj_key_subs(v, subs)
        else if typeof(v) == 'string'
            s = subs[v]
            if s?
                obj[k] = s


exports.rethinkdb = (opts) -> new RethinkDB(opts)
