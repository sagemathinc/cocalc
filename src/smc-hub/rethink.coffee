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

fs         = require('fs')
async      = require('async')
underscore = require('underscore')
moment     = require('moment')
uuid       = require('node-uuid')

json_stable_stringify = require('json-stable-stringify')

winston    = require('winston')
winston.remove(winston.transports.Console)

SMC_TEST = process.env.SMC_TEST
if not SMC_TEST
    winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

misc_node = require('smc-util-node/misc_node')

{defaults} = misc = require('smc-util/misc')
required = defaults.required

{UserQueryStats} = require './user-query-stats'

# limit for async.map or async.paralleLimit, esp. to avoid high concurrency when querying in parallel
MAP_LIMIT = 4

# Bucket used for cheaper longterm storage of blobs (outside of rethinkdb).
# NOTE: We should add this to site configuration, and have it get read once when first
# needed and cached.  Also it would be editable in admin account settings.
BLOB_GCLOUD_BUCKET = 'smc-blobs'

{SCHEMA, DEFAULT_QUOTAS, PROJECT_UPGRADES, COMPUTE_STATES, RECENT_TIMES, RECENT_TIMES_KEY, site_settings_conf} = require('smc-util/schema')

to_json = (s) ->
    return misc.trunc_middle(misc.to_json(s), 250)


###
NOTES:

# Sharding

To automate sharding/replication of all the tables (depends on deployment).  E.g.,
if there are 3 nodes, do this to reconfigure *all* tables:

    db = require('rethink').rethinkdb(hosts:['db0'])
	db.db.reconfigure(replicas:3, shards:3).run(console.log)

###

table_options = (table) ->
    t = SCHEMA[table]
    options =
        primaryKey : t.primary_key ? 'id'
        durability : t.durability ? 'hard'
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
    constructor: (opts={}) ->
        opts = defaults opts,
            hosts    : default_hosts
            database : 'smc'
            password : undefined
            debug    : true
            pool     : if process.env.DEVEL then 1 else 100  # default number of connection to use in connection pool
            all_hosts: false      # if true, finds all hosts based on querying the server then connects to them
            warning  : 30          # display warning and stop using connection if run takes this many seconds or more
            error    : 10*60       # kill any query that takes this long (and corresponding connection)
            concurrent_warn  : 500  # if number of concurrent outstanding db queries exceeds this number, put a concurrent_warn message in the log.
            concurrent_error : 1000  # if nonzero, and this many queries at once, any query instantly fails!
            mod_warn : 2           # display MOD_WARN warning in log if any query modifies at least this many docs
            cache_expiry  : 15000  # expire cached queries after this many milliseconds (default: 15s)
            cache_size    : 250    # cache this many queries; use @...query.run({cache:true}, cb) to cache result for a few seconds
            cb       : undefined
        dbg = @dbg('constructor')

        @_debug            = opts.debug
        @_database         = opts.database
        @_num_connections  = opts.pool
        @_warning_thresh   = opts.warning
        @_error_thresh     = opts.error
        @_mod_warn         = opts.mod_warn
        @_concurrent_warn  = opts.concurrent_warn
        @_concurrent_error = opts.concurrent_error
        @_all_hosts        = opts.all_hosts
        @_stats_cached     = undefined
        @_user_query_stats = new UserQueryStats(@dbg("user_query_stats"))

        if opts.cache_expiry and opts.cache_size
            @_query_cache = (new require('expiring-lru-cache'))(size:opts.cache_size, expiry: opts.cache_expiry)

        if typeof(opts.hosts) == 'string'
            opts.hosts = [opts.hosts]

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
                @_init_native(cb)
        ], (err) =>
            if err
                winston.debug("error initializing database -- #{to_json(err)}")
            else
                winston.debug("successfully initialized database")
                @db = @r.db(@_database)
            opts.cb?(err, @)
        )

    _connect: (cb) =>
        dbg = @dbg("_connect")
        hosts = misc.keys(@_hosts)
        x = misc.random_choice(hosts)
        v = x.split(':')
        host = v[0]
        port = v[1]  # could be undefined
        dbg("connecting to #{host}...")
        @r.connect {authKey:@_password, host:host, port:port}, (err, conn) =>
            if err
                dbg("error connecting to #{host} -- #{to_json(err)}")
                cb(err)
            else
                dbg("successfully connected to #{host}")
                if not @_conn
                    first_conn = true
                    @_conn = {}  # initialize if not defined
                @_conn[misc.uuid()] = conn  # save connection
                if not first_conn
                    cb(); return

                if not @_all_hosts
                    cb(); return

                # first connection, so we query for server_status to know all connected servers (in case not given in hosts option)
                @r.db('rethinkdb').table('server_status').run_native conn, (err, servers) =>
                    if not err
                        servers.toArray (err, s) =>
                            if not err
                                for server in s
                                    @_hosts[server.network.hostname] = true
                                #dbg("got complete server list from server_status table: #{to_json(misc.keys(@_hosts))}")
                                cb()
                            else
                                #dbg("error converting server list to array")
                                cb() # non fatal  -- just means we don't know all hosts
                    else
                        #dbg("error getting complete server list -- #{to_json(err)}")
                        cb()  # non fatal -- just means we don't know all hosts

    _init_native: (cb) =>
        @r = require('rethinkdb')
        @_monkey_patch_run()
        winston.debug("creating #{@_num_connections} connections")
        g = (i, cb) =>
            if i%20 == 0
                winston.debug("created #{i} connections so far")
            misc.retry_until_success
                f : @_connect
                start_delay : 5000
                max_delay   : 30000
                cb : cb
        # first connect once (to get topology), then many more times in parallel
        g 0, () =>
            async.mapLimit misc.range(1, @_num_connections-1), 15, g, (err) =>
                winston.debug("finished creating #{@_num_connections}")
                cb(err)

    _update_pool: (cb) =>
        if @_update_pool_cbs?
            @_update_pool_cbs.push(cb)
            return

        @dbg("_update_pool")()
        @_update_pool_cbs = [cb]

        # 1. remove any connections from the pool that aren't opened
        for id, conn of @_conn
            if not conn.isOpen()
                winston.debug("removing a connection since not isOpen")
                delete @_conn[id]

        # 2. ensure that the pool is full
        f = (cb) =>
            n = misc.len(@_conn)
            if n >= @_num_connections
                cb()
            else
                 # fill the pool
                async.map(misc.range(@_num_connections - n), ((n,cb)=>@_connect(cb)), cb)

        f (err) =>
            for cb in @_update_pool_cbs
                cb(err)
            delete @_update_pool_cbs

    _monkey_patch_run: () =>
        # We monkey patch run to have similar semantics to rethinkdbdash, and nice logging and warnings.
        # See http://stackoverflow.com/questions/26287983/javascript-monkey-patch-the-rethinkdb-run
        # for how to monkey patch run.
        that = @ # needed to reconnect if connection dies
        TermBase = @r.expr(1).constructor.__super__.constructor.__super__
        run_cbs = {}
        if not TermBase.run_native?  # only do this once!
            TermBase.run_native = TermBase.run
            TermBase.run = (opts, cb) ->
                if not cb?
                    cb = opts
                    opts = {}
                if not opts?
                    opts = {}
                that2 = @  # needed to call run_native properly on the object below.
                full_query_string = query_string = "#{that2}"
                if query_string.length > 200
                    query_string = misc.trunc_middle(query_string, 200) + " (#{query_string.length} chars)"

                if opts.cache?
                    opts.dedup = true  # if allowing cached result, definitely allow dedup below!
                    cache = opts.cache
                    delete opts.cache
                    if cache and that._query_cache?
                        # check for cached result
                        x = that._query_cache.get(full_query_string)
                        if x?
                            winston.debug("using cache for '#{query_string}'")
                            cb(x[0], x[1])
                            return

                if opts.dedup?
                    # Multiple copies of same query get done once only and all callbacks called.
                    # Fine for idempotent queries where exact order doesn't matter, e.g., a bunch
                    # of permissions checks. Simplifies other code a lot.
                    delete opts.dedup
                    if run_cbs[full_query_string]?
                        run_cbs[full_query_string].push(cb)
                        return
                    else
                        run_cbs[full_query_string] = [cb]

                error = result = undefined
                f = (cb) ->
                    start = new Date()
                    that._update_pool (err) ->
                        if err
                            cb(err)
                            return

                        that._concurrent_queries ?= 0
                        that._concurrent_queries += 1

                        winston.debug("[#{that._concurrent_queries} concurrent]  rethink: query -- '#{query_string}'")
                        if that._concurrent_queries > that._concurrent_warn
                            winston.debug("rethink: *** concurrent_warn *** CONCURRENT WARN THRESHOLD EXCEEDED!")

                        if that._concurrent_error and that._concurrent_queries > that._concurrent_error
                            winston.debug("rethink: *** concurrent_error *** CONCURRENT ERROR THRESHOLD #{that._concurrent_error} EXCEEDED -- FAILING QUERY")
                            that._concurrent_queries -= 1
                            cb("concurrent_error")
                            return

                        # choose a random connection
                        id = misc.random_choice(misc.keys(that._conn))
                        conn = that._conn[id]

                        warning_too_long = ->
                            # if a connection is slow, display a warning
                            winston.debug("[#{that._concurrent_queries} concurrent]  rethink: query '#{query_string}' is taking over #{that._warning_thresh}s!")

                        error_too_long = ->
                            winston.debug("[#{that._concurrent_queries} concurrent]  rethink: query '#{query_string}' is taking over #{that._error_thresh}s so we kill it!")
                            winston.debug("rethink: query -- close existing connection")
                            # this close will cause g below to get called with a RqlRuntimeError
                            conn.close (err) ->
                                winston.debug("rethink: query -- connection closed #{err}")
                                winston.debug("rethink: query -- delete existing connection so won't get re-used")
                                delete that._conn[id]
                                # make another one (adding to pool)
                                that._connect () ->
                                    winston.debug("rethink: query -- made new connection due to connection being slow")

                        warning_timer = setTimeout(warning_too_long, that._warning_thresh*1000)
                        if that._error_thresh
                            error_timer   = setTimeout(error_too_long,   that._error_thresh*1000)

                        g = (err, x) ->
                            report_time = ->
                                that._concurrent_queries -= 1
                                clearTimeout(warning_timer)
                                clearTimeout(error_timer)
                                tm = new Date() - start
                                @_stats ?= {sum:0, n:0}
                                @_stats.sum += tm
                                @_stats.n += 1

                                # include some extra info about the query -- if it was a write this can be useful for debugging
                                modified = (x?.inserted ? 0) + (x?.replaced ? 0) + (x?.deleted ? 0)
                                winston.debug("[#{that._concurrent_queries} concurrent]  [#{modified} modified]  rethink: query time using (#{id}) took #{tm}ms; average=#{Math.round(@_stats.sum/@_stats.n)}ms;  -- '#{query_string}'")
                                if modified >= that._mod_warn
                                    winston.debug("MOD_WARN: modified=#{modified} -- for query  '#{query_string}' ")
                            if err
                                report_time()
                                if err.message.indexOf('is closed') != -1
                                    winston.debug("rethink: query -- got error that connection is closed -- #{err}")
                                    #error = err
                                    #cb()
                                    fix = ->
                                        delete that._conn[id]  # delete existing connection so won't get re-used
                                        # make another one (adding to pool)
                                        that._connect () ->
                                            cb(true)
                                    setTimeout(fix, 5000) # wait a few seconds then try to fix
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
                                        report_time()
                                        cb()
                                else
                                    # Not a cursor -- just keep as is.  It will be either a single javascript object or a changefeed.
                                    result = x
                                    report_time()
                                    cb()
                        that2.run_native(conn, opts, g)

                # 'success' means that we got a connection to the database and made a query using it.
                # It could still have returned an error.
                misc.retry_until_success
                    f           : f
                    max_delay   : 15000
                    start_delay : 3000
                    factor      : 1.4
                    max_tries   : 15
                    cb          : ->
                        if cache
                            that._query_cache.set(full_query_string, [error, result])
                        if run_cbs[full_query_string]?
                            v = run_cbs[full_query_string]
                            delete run_cbs[full_query_string]
                            for cb in v
                                cb?(error, result)
                        else
                            cb?(error, result)

    table: (name, opts={readMode:'outdated'}) =>
        @db.table(name, opts)

    # Server-side changefeed-updated table, which automatically restart changefeed
    # on error, etc.  See SyncTable docs where the class is defined.
    synctable: (opts) =>
        opts = defaults opts,
            query          : required
            primary_key    : undefined  # if not given, will use one for whole table -- value *must* be a string
            idle_timeout_s : undefined  # if given, synctable will disconnect from remote database if nothing happens for this long; this mean on 'change' events won't get fired on change.  Any function calls on the SyncTable will reset this timeout and reconnect.  Also, call .connect () => to ensure that everything is current before using synctable.
            cb             : required
        new SyncTable(opts.query, opts.primary_key, @, opts.idle_timeout_s, opts.cb)
        return

    # This is mainly for interactive debugging use. Any time a record changes in any of
    # the given tables, calls the cb with the change.
    watch: (opts) =>
        opts = defaults opts,
            tables : required   # array of strings (names of tables) -- or a single string
            cb     : required
        if typeof(opts.tables) == 'string'
            opts.tables = [opts.tables]
        if opts.tables.length == 0
            # nothing ever changes
            return
        query = db.table(opts.tables[0])
        for i in [1...opts.tables.length]
            query = query.union(db.table(opts.tables[i]))
        query.changes(includeInitial:false).run (err, feed) =>
            feed.each(opts.cb)

    # Wait until the table is ready for queries.
    # NOTE:
    wait_until_ready_for_writes: (opts) =>
        opts = defaults opts,
            table     : required     # string -- name of a table
            timeout_s : 30
            cache     : true         # if true, cache success for 10s; this is more efficient, but means SMC will stop responding properly during a failure for a few seconds.
            cb        : required     # cb(undefined, obj) on success and cb('timeout') on failure due to timeout
        last = (@_wait_until_ready_for_writes_last ?= {})
        if opts.cache and (last[opts.table]? and new Date() - last[opts.table] < 10000)
            opts.cb()
            return
        d = (@_wait_until_ready_for_writes ?= {})
        if not d[opts.table]?
            d[opts.table] = [opts.cb]
        else
            d[opts.table].push(opts.cb)
            return
        @table(opts.table).wait(waitFor: "ready_for_writes", timeout:30).run (err) =>
            if not err and opts.cache
                last[opts.table] = new Date()
            v = d[opts.table]
            delete d[opts.table]
            for cb in v
                cb(err)

    # Wait until the query results in at least one result obj, and
    # calls cb(undefined, obj).
    # This is not robust to connection to database ending, etc. --
    # in those cases, get cb(err).
    wait: (opts) =>
        opts = defaults opts,
            until     : required     # a rethinkdb query, e.g., @table('projects').getAll(...)....
            timeout_s : undefined
            cb        : required     # cb(undefined, obj) on success and cb('timeout') on failure due to timeout
        feed = undefined
        timer = undefined
        done = =>
            feed?.close()
            clearTimeout(timer)
            feed = timer = undefined
        opts.until.changes(includeInitial:true).run (err, _feed) =>
            feed = _feed
            if err
                opts.cb(err)
            else
                feed.each (err, change) ->
                    if err
                        opts.cb(err)
                    else if change?.new_val
                        opts.cb(undefined, change?.new_val)
                    done()
        if opts.timeout_s?
            timeout = =>
                opts.cb("timeout")
                done()
            timer = setTimeout(timeout, opts.timeout_s*1000)

    # Compute the sha1 hash (in hex) of the input arguments, which are
    # converted to strings (via json) if they are not strings, then concatenated.
    # This is used for computing compound primary keys in a way that is relatively
    # safe, and in situations where if there were a highly unlikely collision, it
    # wouldn't be the end of the world.  There is a similar client-only slower version
    # of this function (in schema.coffee), so don't change it willy nilly.
    sha1: (args...) ->
        v = ((if typeof(x) == 'string' then x else JSON.stringify(x)) for x in args).join('')
        return misc_node.sha1(v)

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
                    winston.debug("error setting password -- #{to_json(err)}")
                else
                    @r.getPoolMaster().drain()
                    @_init(password)
                opts.cb?(err)
        )

    ###
    Sometimes RethinkDB tables waste huge amounts of disk space.  A trick that Daniel Mewes suggests to
    fix this is to write and remove a dummy field from all records.  This function implements that idea.

    db._error_thresh=1e6; db.recompact_table(table:'blobs', cb:done())
    ###
    recompact_table: (opts) =>
        opts = defaults opts,
            table : required
            limit : undefined
            cb    : undefined
        dbg = @dbg("recompact_table(table='#{opts.table}', limit=#{opts.limit})");
        dbg()
        async.series([
            (cb) =>
                dbg('writing dummy field')
                q = @table(opts.table)
                if opts.limit?
                    q = q.limit(opts.limit)
                q.update({dummy: null}, {durability: "soft"}).run (err, x) =>
                    dbg(misc.to_json(x))
                    cb(err)
            (cb) =>
                dbg('deleting dummy field')
                q = @table(opts.table)
                if opts.limit?
                    q = q.limit(opts.limit)
                q.update({dummy: db.r.literal()}, {durability: "soft"}).run (err, x) =>
                    dbg(misc.to_json(x))
                    cb(err)
        ], (err) =>
            dbg('finished')
            opts.cb?(err)
        )

    dbg: (f) =>
        if @_debug
            return (m) => winston.debug("RethinkDB.#{f}: #{m}")
        else
            return () ->

    update_schema: (opts={}) =>
        opts = defaults opts,
            replication : false  # update sharding/replication settings -- definitely don't do by default!  (e.g. doing when a node down would be a disaster)
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
                dbg("Ensure table durability configuration is as specified in the schema")
                f = (name, cb) =>
                    if SCHEMA[name].virtual
                        cb(); return
                    query = @db.table(name).config()
                    query.pluck('durability').run (err, x) =>
                        if err
                            cb(err)
                        else
                            durability = table_options(name).durability
                            if x.durability != durability
                                dbg("Changing durability option for '#{name}' to '#{durability}'")
                                query.update(durability:durability).run(cb)
                            else
                                cb()
                async.mapLimit(misc.keys(SCHEMA), MAP_LIMIT, f, cb)
            (cb) =>
                dbg("Ensure indexes are as specified in the schema")
                f = (name, cb) =>
                    indexes = misc.deep_copy(SCHEMA[name].indexes)  # stuff gets deleted out of indexes below!
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
                                dbg("indexing #{name}: #{to_json(x)}")
                            async.map x, create_index, (err) =>
                                if err or to_delete.length == 0
                                    cb(err)
                                else
                                    # delete some indexes
                                    async.map(to_delete, delete_index, cb)

                async.mapLimit(misc.keys(SCHEMA), MAP_LIMIT, f, cb)
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
    #
    # db._error_thresh=100000; db.delete_expired(count_only:false, repeat_until_done: true, cb:done())
    # db._error_thresh=100000; db.delete_expired(count_only:false, limit:0, cb:done())

    delete_expired: (opts) =>
        opts = defaults opts,
            count_only        : true  # if true, only count the number of blobs that would be deleted
            limit             : 100   # only this many
            throttle_s        : 5     # if repeat_until_done and limit set, waits this many secs until the next chunk is deleted
            table             : undefined  # only this table
            repeat_until_done : false  # if true and limit set, keeps re-calling delete until nothing gets deleted -- useful to do deletes in many small chunks instead of one big one, to better tell when done, and stop when server load increases.
            cb    : required
        dbg = @dbg("delete_expired(...)")
        dbg()
        f = (table, cb) =>
            dbg("table='#{table}'")
            query = @table(table).between(new Date(0),new Date(), index:'expire')
            if opts.limit
                query = query.limit(opts.limit)
            start = new Date()
            if opts.count_only
                opts.repeat_until_done = false
                query = query.count()
                dbg("doing count: #{query}")
            else
                query = query.delete()
                dbg("doing delete: #{query}")
            query.run (err, x) =>
                dbg("query done (time=#{new Date() - start}ms): err=#{err}, x=#{misc.to_json(x)}")
                if err
                    cb(err)
                else if x.deleted == 0
                    cb()
                else
                    if opts.limit and opts.repeat_until_done
                        setTimeout(( -> f(table, cb)), 1000 * opts.throttle_s)
                    else
                        cb()

        if opts.table
            tables = [opts.table]
        else
            tables = (k for k, v of SCHEMA when v.indexes?.expire?)
        async.mapSeries(tables, f, opts.cb)

    ###
    # Tables for loging things that happen
    ###
    log: (opts) =>
        opts = defaults opts,
            event : required    # string
            value : required
            cb    : undefined
        value = if typeof(opts.value) == 'object' then misc.map_without_undefined(opts.value) else opts.value
        @table('central_log').insert({event:opts.event, value:value, time:new Date()}).run((err)=>opts.cb?(err))

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
            event      : 'event'
            error      : 'error'
            account_id : undefined
            cb         : undefined
        x = {event:opts.event, error:opts.error, time:new Date()}
        if opts.account_id?
            x.account_id = opts.account_id
        @table('client_error_log').insert(x).run((err)=>opts.cb?(err))

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

    get_site_settings: (opts) =>
        opts = defaults opts,
            cb : required   # (err, settings)
        if @_site_settings?
            opts.cb(undefined, @_site_settings)
            return
        query = @table('server_settings').getAll(misc.keys(site_settings_conf)...)
        query.run (err, x) =>
            if err
                opts.cb(err)
            else
                @_site_settings = misc.dict(([y.name, y.value] for y in x))
                opts.cb(undefined, @_site_settings)
                query.changes(squash:5).run (err, feed) =>
                    if err
                        delete @_site_settings
                        return
                    feed.each (err, change) =>
                        if err
                            delete @_site_settings
                            return
                        if change.old_val?
                            delete @_site_settings[change.old_val.name]
                        if change.new_val?
                            @_site_settings[change.new_val.name] = change.new_val.value

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
                    first_name    : opts.first_name ? ''
                    last_name     : opts.last_name ? ''
                    created       : new Date()
                if opts.created_by?
                    account.created_by = opts.created_by
                if opts.password_hash?
                    account.password_hash = opts.password_hash
                if opts.email_address?
                    account.email_address = opts.email_address

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

    mark_account_deleted: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : required
        if not opts.account_id? and not opts.email_address?
            opts.cb("one of email address or account_id must be specified")
            return

        query = undefined
        email_address = undefined
        async.series([
            (cb) =>
                if opts.account_id?
                    cb()
                else
                    @account_exists
                        email_address : opts.email_address
                        cb            : (err, account_id) =>
                            if err
                                cb(err)
                            else if not account_id
                                cb("no such email address known")
                            else
                                opts.account_id = account_id
                                cb()
            (cb) =>
                query = @table('accounts').get(opts.account_id)
                query.pluck('email_address').run (err, x) =>
                    email_address = x?.email_address
                    cb(err)
            (cb) =>
                query.update({first_name: 'Deleted', last_name:'User', email_address_before_delete:email_address}).run(cb)
            (cb) =>
                query.replace(@r.row.without('email_address')).run(cb)
            (cb) =>
                query.replace(@r.row.without('passports')).run(cb)
        ], opts.cb)

    # determine if the account exists and if so returns the account id; otherwise returns undefined.
    account_exists: (opts) =>
        opts = defaults opts,
            email_address : required
            cb            : required   # cb(err, account_id or undefined) -- actual account_id if it exists; err = problem with db connection...
        @table('accounts').getAll(opts.email_address, {index:'email_address'}).pluck('account_id').run (err, x) =>
            opts.cb(err, x?[0]?.account_id)

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

    do_account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            account_id    : required
            cb            : required
        dbg = @dbg("do_account_creation_actions(email_address='#{opts.email_address}')")
        @account_creation_actions
            email_address : opts.email_address
            cb            : (err, actions) =>
                if err
                    opts.cb(err); return
                f = (action, cb) =>
                    dbg("account_creation_actions: action = #{misc.to_json(action)}")
                    if action.action == 'add_to_project'
                        @add_user_to_project
                            project_id : action.project_id
                            account_id : opts.account_id
                            group      : action.group
                            cb         : (err) =>
                                if err
                                    dbg("Error adding user to project: #{err}")
                                cb(err)
                    else
                        # TODO: need to report this some better way, maybe email?
                        dbg("skipping unknown action -- #{action.action}")
                        cb()
                async.map actions, f, (err) =>
                    if not err
                        @account_creation_actions_success
                            account_id : opts.account_id
                            cb         : opts.cb
                    else
                        opts.cb(err)

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
            customer_id : undefined  # will be looked up if not known
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
                query.changes(squash:if SMC_TEST then false else 5).run (err, feed) =>
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
        winston.debug("create_passport '#{misc.to_json(opts.profile)}'")
        @_account(opts).update(passports:{"#{@_passport_key(opts)}": misc.map_without_undefined(opts.profile)}).run(opts.cb)

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
                @_account(opts).update(misc.map_without_undefined(opts.set)).run(cb)
        ], opts.cb)

    _touch_account: (account_id, cb) =>
        # never do this more than once per minute
        @_touch_account_lock ?= {}
        if @_touch_account_lock[account_id]?
            cb()
        else
            @_touch_account_lock[account_id] = true
            now = new Date()
            @table('accounts').get(account_id).update(last_active:now).run(cb)
            setTimeout((()=>delete @_touch_account_lock[account_id]), 120*1000)

    _touch_project: (project_id, account_id, cb) =>
        # never do this more than once per minute
        @_touch_project_lock ?= {}
        key = "#{project_id}-#{account_id}"
        if @_touch_project_lock[key]?
            cb()
        else
            @_touch_project_lock[key] = true
            now = new Date()
            @table('projects').get(project_id).update(last_edited:now, last_active:{"#{account_id}":now}).run(cb)
            setTimeout((()=>delete @_touch_project_lock[key]), 120*1000)

    # Indicate activity by a user, possibly on a specific project, and
    # then possibly on a specific path in that project.
    touch: (opts) =>
        opts = defaults opts,
            account_id : required
            project_id : undefined
            path       : undefined
            action     : 'edit'
            ttl_s      : 50        # min activity interval; calling this function with same input again within this interval is ignored
            cb         : undefined
        if opts.ttl_s
            @_touch_lock ?= {}
            key = "#{opts.account_id}-#{opts.project_id}-#{opts.path}-#{opts.action}"
            if @_touch_lock[key]
                opts.cb?()
                return
            @_touch_lock[key] = true
            setTimeout((()=>delete @_touch_lock[key]), opts.ttl_s*1000)

        now = new Date()
        async.parallel([
            (cb) =>
                # touch accounts table
                @_touch_account(opts.account_id, cb)
            (cb) =>
                if not opts.project_id?
                    cb(); return
                # touch projects table
                @_touch_project(opts.project_id, opts.account_id, cb)
            (cb) =>
                if not opts.path? or not opts.project_id?
                    cb(); return
                @record_file_use(project_id:opts.project_id, path:opts.path, action:opts.action, account_id:opts.account_id, cb:cb)
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
            account_id : required
            cb         : undefined
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
            opts.cb(undefined, x?.value)  # x can be made undefined above when it expires

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

    ###
    Tracking file access

    log_file_access is throttled in each server, in the sense that
    if it is called with the same input within a minute, those
    subsequent calls are ignored.  Of course, if multiple servers
    are recording file_access then there can be more than one
    entry per minute.
    ###
    log_file_access: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            filename   : required
            cb         : undefined
        if not @_validate_opts(opts) then return
        @_log_file_access ?= {}
        key = "#{opts.project_id}#{opts.account_id}#{opts.filename}"
        v = @_log_file_access[key]
        minute_ago = misc.minutes_ago(1)
        if v? and v >= minute_ago
            opts.cb?()
            return
        entry =
            project_id : opts.project_id
            account_id : opts.account_id
            filename   : opts.filename
            time       : new Date()
        @_log_file_access[key] = entry.time

        if Math.random() <= 0.2
            # Sometimes we clear old entries from cache to avoid leaking memory in the long run
            for k, v of @_log_file_access
                if v < minute_ago
                    delete @_log_file_access[k]

        @table('file_access_log').insert(entry).run((err)=>opts.cb?(err))

    ###
    Query for all files accessed in all projects in given time range.

        db.get_file_access(start:misc.minutes_ago(5)).run(done())
    ###
    get_file_access: (opts) =>
        opts = defaults opts,
            start  : undefined   # start time
            end    : undefined   # end time
        query = @table('file_access_log')
        @_process_time_range(opts)
        if opts.start? or opts.end?
            query = query.between(opts.start, opts.end, {index:'time'})
        return query

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
                        opts.cb?("invalid uuid #{w} in #{k} -- #{to_json(v)}")
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
                # winston.debug("filtering public paths: orig listing = #{to_json(opts.listing)}")
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
                # winston.debug("filtering public paths: new listing #{to_json(listing)}")
                opts.cb(undefined, listing)

    # Set last_edited for this project to right now, and possibly update its size.
    # It is safe and efficient to call this function very frequently since it will
    # actually hit the database at most once every 30s (per project, per client).  In particular,
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

    get_open_unused_projects: (opts) =>
        opts = defaults opts,
            min_age_days : 30         # project must not have been edited in this much time
            max_age_days : 120        # project must have been edited at most this long ago
            host         : required   # hostname of where project is opened
            cb           : required
        end   = new Date(new Date() - opts.min_age_days*60*60*24*1000)
        start = new Date(new Date() - opts.max_age_days*60*60*24*1000)
        query = @table('projects').between(start, end, {index:'last_edited'})
        query = query.filter(host:{host:opts.host})
        query = query.filter({state:{state:'opened'}}, {default: {state:{state:'opened'}}})
        query = query.pluck('project_id')
        query.run (err, x) =>
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
                if err.name == "ReqlNonExistenceError"
                    # indicates that there's no opts.account_id key in the table (or users key) -- error is different
                    # (i.e., RqlDriverError) when caused by connection being down.
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
    get_account_ids_using_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        @table('projects').get(opts.project_id).pluck('users').run (err, x) =>
            opts.cb(err, if x?.users? then (id for id,v of x.users when v.group?.indexOf('invite') == -1) else [])

    # Have we successfully (no error) sent an invite to the given email address?
    # If so, returns timestamp of when.
    # If not, returns 0.
    when_sent_project_invite: (opts) =>
        opts = defaults opts,
            project_id : required
            to         : required  # an email address
            cb         : required
        @table('projects').get(opts.project_id).pluck('invite').run (err, x) =>
            if err
                opts.cb(err)
            else
                y = x?.invite?[opts.to]
                if not y? or y.error or not y.time
                    opts.cb(undefined, 0)
                else
                    opts.cb(undefined, y.time)

    # call this to record that we have sent an email invite to the given email address
    sent_project_invite: (opts) =>
        opts = defaults opts,
            project_id : required
            to         : required   # an email address
            error      : undefined  # if there was an error set it to this; leave undefined to mean that sending succeeded
            cb         : undefined
        x = {time: new Date()}
        if opts.error?
            x.error = opts.error
        x = @r.literal(x)  # so literally replaces x instead of merging -- see https://www.rethinkdb.com/api/javascript/literal/
        @table('projects').get(opts.project_id).update(invite:{"#{opts.to}":x}).run((err) => opts.cb?(err))

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

    unset_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).replace(
            @r.row.without({host: {host: true}})).run(opts.cb)

    get_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('host').run (err, x) =>
            opts.cb(err, if x then x.host)

    set_project_storage: (opts) =>
        opts = defaults opts,
            project_id : required
            host       : required
            cb         : required
        @get_project_storage
            project_id : opts.project_id
            cb         : (err, current) =>
                if err
                    opts.cb(err)
                    return
                if current?.host? and current.host != opts.host
                    opts.cb("change storage not implemented yet -- need to implement saving previous host")
                else
                    # easy case -- assigning for the first time
                    @table('projects').get(opts.project_id).update(
                        storage:{host:opts.host, assigned:new Date()}).run(opts.cb)

    get_project_storage: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('storage').run (err, x) =>
            opts.cb(err, if x then x.storage)

    update_project_storage_save: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).update(storage:{saved:new Date()}).run(opts.cb)

    set_project_storage_request: (opts) =>
        opts = defaults opts,
            project_id : required
            action     : required    # 'save', 'close', 'open', 'move'
            target     : undefined   # needed for 'open' and 'move'
            cb         : required
        x =
            action : opts.action
            requested : new Date()
        if opts.target?
            x.target = opts.target
        @table('projects').get(opts.project_id).update(storage_request:@r.literal(x)).run(opts.cb)

    get_project_storage_request: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('storage_request').run (err, x) ->
            opts.cb(err, x?.storage_request)

    set_project_state: (opts) =>
        opts = defaults opts,
            project_id : required
            state      : required
            time       : new Date()
            error      : undefined
            cb         : required
        if typeof(opts.state) != 'string'
            opts.cb("invalid state type")
            return
        if not COMPUTE_STATES[opts.state]?
            opts.cb("state = '#{opts.state}' it not a valid state")
            return
        state =
            state : opts.state
            time  : opts.time
        if opts.error
            state.error = opts.error
        state = @r.literal(state)
        @table('projects').get(opts.project_id).update(state:state).run(opts.cb)

    get_project_state: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('state').run (err, x) =>
            opts.cb(err, x?.state)

    # Returns the total quotas for the project, including any upgrades to the base settings.
    get_project_quotas: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        settings = project_upgrades = undefined
        async.parallel([
            (cb) =>
                @get_project_settings
                    project_id : opts.project_id
                    cb         : (err, x) =>
                        settings = x; cb(err)
            (cb) =>
                @get_project_upgrades
                    project_id : opts.project_id
                    cb         : (err, x) =>
                        project_upgrades = x; cb(err)
        ], (err) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, misc.map_sum(settings, project_upgrades))
        )

    # Return mapping from project_id to map listing the upgrades this particular user
    # applied to the given project.  This only includes project_id's of projects that
    # this user may have upgraded in some way.
    get_user_project_upgrades: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        @table('projects').getAll(opts.account_id, index:'users').filter((project)=>project("users")(opts.account_id)('upgrades')).pluck('project_id', 'users').run (err, x) =>
            if err
                opts.cb(err)
            else
                ans = {}
                for p in x
                    ans[p.project_id] = p.users?[opts.account_id]?.upgrades
                opts.cb(undefined, ans)

    # Ensure that all upgrades applied by the given user to projects are consistent,
    # truncating any that exceed their allotment.  NOTE: Unless there is a bug,
    # the only way the quotas should ever exceed their allotment would be if the
    # user is trying to cheat.
    ensure_user_project_upgrades_are_valid: (opts) =>
        opts = defaults opts,
            account_id : required
            fix        : true       # if true, will fix projects in database whose quotas exceed the alloted amount; it is the caller's responsibility to say actually change them.
            cb         : required   # cb(err, excess)
        excess = stripe_data = project_upgrades = undefined
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        @table('accounts').get(opts.account_id).pluck('stripe_customer').run (err, x) =>
                            stripe_data = x?.stripe_customer?.subscriptions?.data
                            cb(err)
                    (cb) =>
                        @get_user_project_upgrades
                            account_id : opts.account_id
                            cb         : (err, x) =>
                                project_upgrades = x
                                cb(err)
                ], cb)
            (cb) =>
                x = require('smc-util/upgrades').available_upgrades(stripe_data, project_upgrades)
                excess = x.excess
                if opts.fix
                    fix = (project_id, cb) =>
                        @table('projects').get(project_id).pluck('users').run (err, x) =>
                            if err
                                cb(err)
                            else
                                # TODO: this is dangerous since if something else changed about a user
                                # between the read/write here, then we would have trouble.
                                # If I had more time I would code this properly using rethinkdb's api,
                                # which should allow doing arithmetic entirely in a single query.
                                current = x.users?[opts.account_id]?.upgrades
                                if current?
                                    for k, v of excess[project_id]
                                        current[k] -= v
                                    @table('projects').get(project_id).update(users:{"#{opts.account_id}":{upgrades:current}}).run(cb)
                                else
                                    cb()
                    async.map(misc.keys(excess), fix, cb)
                else
                    cb()
        ], (err) =>
            opts.cb(err, excess)
        )

    # Return the sum total of all user upgrades to a particular project
    get_project_upgrades: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('users').run (err, x) =>
            if err
                opts.cb(err); return
            upgrades = undefined
            for account_id, info of x.users
                upgrades = misc.map_sum(upgrades, info.upgrades)
            opts.cb(undefined, upgrades)

    get_project_settings: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @table('projects').get(opts.project_id).pluck('settings').run (err, x) =>
            if err
                opts.cb(err); return
            settings = misc.coerce_codomain_to_numbers(x.settings)
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
        @table('projects').get(opts.project_id).update(settings:misc.map_without_undefined(opts.settings)).run(opts.cb)

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
        #winston.debug("record_file_use: #{to_json(entry)}")
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

    count_timespan: (opts) =>
        opts = defaults opts,
            table    : required
            age_m    : required
            upper_m  : undefined  # defaults to zero minutes (i.e. "now")
            index    : required
            cb       : required
        lower = misc.minutes_ago(opts.age_m)
        upper = if opts.upper_m? then misc.minutes_ago(opts.upper_m) else misc.minutes_ago(0)
        @table(opts.table).between(lower, upper, {index:opts.index}).count().run(opts.cb)

    num_projects: (opts) =>
        opts.table = 'projects'
        @count_timespan(opts)

    num_accounts: (opts) =>
        opts.table = 'accounts'
        @count_timespan(opts)

    recent_projects: (opts) =>
        opts = defaults opts,
            age_m     : required   # return results at most this old
            min_age_m : 0          # only returns results at least this old
            pluck     : undefined  # if not given, returns list of project_id's; if given (as an array), returns objects with these fields
            cb        : required   # cb(err, list of strings or objects)
        lower = misc.minutes_ago(opts.age_m)
        upper = misc.minutes_ago(opts.min_age_m)
        query = @table('projects').between(lower, upper, {index:'last_edited'})
        if opts.pluck?
            query.pluck(opts.pluck...).run(opts.cb)
        else
            query.pluck('project_id').run (err, x) =>
                opts.cb(err, if x? then (y.project_id for y in x))

    get_stats_interval: (opts) =>
        opts = defaults opts,
            start : required
            end   : required
            cb    : required
        @table('stats').between(opts.start, opts.end, {index:'time'}).orderBy('time').run(opts.cb)

    # If there is a cached version of stats (which has given ttl) return that -- this could have
    # been computed by any of the hubs.  If there is no cached version, compute new one and store
    # in cache for ttl seconds.
    get_stats: (opts) =>
        opts = defaults opts,
            ttl : 60         # how long cached version lives (in seconds)
            cb  : undefined
        stats = undefined
        dbg = @dbg('get_stats')
        async.series([
            (cb) =>
                dbg("using cached stats?")
                if @_stats_cached? and @_stats_cached.time > misc.seconds_ago(opts.ttl)
                    stats = @_stats_cached
                    dbg("using locally cached stats from #{(new Date() - stats.time) / 1000} secs ago.")
                    cb(); return
                @table('stats').orderBy(index: @r.desc('time')).limit(1).run (err, x) =>
                    if x?.length and x[0].time > misc.seconds_ago(opts.ttl)
                        dbg("using db cached stats from #{(new Date() - x[0].time) / 1000} secs ago.")
                        stats=x[0]
                        # storing still valid result in local cache
                        @_stats_cached = misc.deep_copy(stats)
                    cb(err)
            (cb) =>
                if stats?
                    cb(); return
                dbg("querying all stats from the DB")
                stats = {time : new Date(), projects_created : {}, accounts_created : {}}
                R = RECENT_TIMES
                K = RECENT_TIMES_KEY
                async.parallelLimit([
                    (cb) =>  @table('accounts').count().run((err, x) => stats.accounts = x; cb(err))
                    (cb) =>  @table('projects').count().run((err, x) => stats.projects = x; cb(err))
                    (cb) =>  @num_projects(index: 'last_edited', age_m: R.active,     cb: (err, x) => stats.active_projects = x; cb(err))
                    (cb) =>  @num_projects(index: 'last_edited', age_m: R.last_hour,  cb: (err, x) => stats.last_hour_projects = x; cb(err))
                    (cb) =>  @num_projects(index: 'last_edited', age_m: R.last_day,   cb: (err, x) => stats.last_day_projects = x; cb(err))
                    (cb) =>  @num_projects(index: 'last_edited', age_m: R.last_week,  cb: (err, x) => stats.last_week_projects = x; cb(err))
                    (cb) =>  @num_projects(index: 'last_edited', age_m: R.last_month, cb: (err, x) => stats.last_month_projects = x; cb(err))
                    (cb) =>  @num_projects(index: 'created',     age_m: R.last_hour,  cb: (err, x) => stats.projects_created[K.last_hour] = x; cb(err))
                    (cb) =>  @num_projects(index: 'created',     age_m: R.last_day,   cb: (err, x) => stats.projects_created[K.last_day] = x; cb(err))
                    (cb) =>  @num_projects(index: 'created',     age_m: R.last_week,  cb: (err, x) => stats.projects_created[K.last_week] = x; cb(err))
                    (cb) =>  @num_projects(index: 'created',     age_m: R.last_month, cb: (err, x) => stats.projects_created[K.last_month] = x; cb(err))
                    (cb) =>  @num_accounts(index: 'created',     age_m: R.last_hour,  cb: (err, x) => stats.accounts_created[K.last_hour] = x; cb(err))
                    (cb) =>  @num_accounts(index: 'created',     age_m: R.last_day,   cb: (err, x) => stats.accounts_created[K.last_day] = x; cb(err))
                    (cb) =>  @num_accounts(index: 'created',     age_m: R.last_week,  cb: (err, x) => stats.accounts_created[K.last_week] = x; cb(err))
                    (cb) =>  @num_accounts(index: 'created',     age_m: R.last_month, cb: (err, x) => stats.accounts_created[K.last_month] = x; cb(err))
                    (cb) =>
                        @table("hub_servers").run (err, hub_servers) =>
                            if err
                                cb(err)
                            else
                                now = new Date()
                                stats.hub_servers = []
                                for x in hub_servers
                                    if x.expire > now
                                        stats.hub_servers.push(x)
                                cb()
                ], MAP_LIMIT, (err) =>
                    if err
                        cb(err)
                    else
                        dbg("everything succeeded in parallel above -- now insert stats")
                        # delete x.expire from stats; no point in including it in result
                        for x in stats.hub_servers
                            delete x.expire
                        # storing in local and db cache
                        @_stats_cached = misc.deep_copy(stats)
                        @table('stats').insert(stats).run durability:'soft', (err) =>
                            if err
                                cb(err)
                            else
                                cb()
                )
        ], (err) =>
            opts.cb?(err, stats)
        )

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
        # Since multiple hubs can run on the same host (but with different ports) and the host is the primary
        # key, we combine the host and port number in the host name for the db.  The hub_servers table is only
        # used for tracking connection stats, so this is safe.
        @table('hub_servers').insert({
            host:"#{opts.host}-#{opts.port}", port:opts.port, clients:opts.clients, expire:expire_time(opts.ttl)
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
            member_host  : false
            cb           : required
        x = misc.copy_without(opts, ['cb'])
        @table('compute_servers').insert(x, conflict:'update').run(opts.cb)

    get_compute_server: (opts) =>
        opts = defaults opts,
            host         : required
            cb           : required
        @table('compute_servers').get(opts.host).run(opts.cb)

    get_all_compute_servers: (opts) =>
        opts = defaults opts,
            experimental : undefined
            cb           : required
        @table('compute_servers').run (err, servers) =>
            if err
                opts.cb(err)
            else
                if opts.experimental?
                    is_experimental = !!opts.experimental
                    # just filter experimental client side, since so few servers...
                    servers = (server for server in servers when !!server.experimental == is_experimental)
                opts.cb(undefined, servers)

    get_projects_on_compute_server: (opts) =>
        opts = defaults opts,
            compute_server : required    # hostname of the compute server
            columns        : ['project_id']
            cb             : required
        @table('projects').getAll(opts.compute_server, index:'host').pluck(opts.columns).run(opts.cb)

    is_member_host_compute_server: (opts) =>
        opts = defaults opts,
            host : required   # hostname of the compute server
            cb   : required
        # we cache (for a few seconds), since this is very unlikely to change.
        @table('compute_servers').get(opts.host).pluck('member_host').run {cache:true}, (err, x) =>
            opts.cb(err, !!(x?.member_host))

    ###
    # BLOB store.  Fields:
    #     id     = uuid from sha1(blob)
    #     blob   = the actual blob
    #     expire = time when object expires
    ###
    save_blob: (opts) =>
        opts = defaults opts,
            uuid       : required  # uuid=sha1-based id coming from blob
            blob       : required  # unless check=true, we assume misc_node.uuidsha1(opts.blob) == opts.uuid; blob should be a string or Buffer
            ttl        : 0         # object in blobstore will have *at least* this ttl in seconds;
                                   # if there is already something in blobstore with longer ttl, we leave it;
                                   # infinite ttl = 0 or undefined.
            project_id : required  # the id of the project that is saving the blob
            check      : false     # if true, will give error if misc_node.uuidsha1(opts.blob) != opts.uuid
            cb         : required  # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl
        if opts.check
            uuid = misc_node.uuidsha1(opts.blob)
            if uuid != opts.uuid
                opts.cb("the sha1 uuid (='#{uuid}') of the blob must equal the given uuid (='#{opts.uuid}')")
                return
        @table('blobs').get(opts.uuid).pluck('expire').run (err, x) =>
            if err
                if err.name == 'ReqlNonExistenceError'
                    # Get ReqlNonExistenceError if the blob not already saved, due to trying to pluck from nothing.
                    # We now insert a new blob.
                    x =
                        id         : opts.uuid
                        blob       : opts.blob
                        project_id : opts.project_id
                        count      : 0
                        size       : opts.blob.length
                        created    : new Date()
                    if opts.ttl
                        x.expire = expire_time(opts.ttl)
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
            uuid       : required
            save_in_db : false  # if true and blob isn't in db and is only in gcloud, copies to local db (for faster access e.g., 20ms versus 5ms -- i.e., not much faster; gcloud is FAST too.)
            touch      : true
            cb         : required   # cb(err) or cb(undefined, blob_value) or cb(undefined, undefined) in case no such blob
        x = undefined
        blob = undefined
        async.series([
            (cb) =>
                @table('blobs').get(opts.uuid).run (err, _x) =>
                    x = _x; cb(err)
            (cb) =>
                if not x
                    # nothing to do -- blob not in db (probably expired)
                    cb()
                else if x.expire and x.expire <= new Date()
                    # the blob already expired -- background delete it
                    @table('blobs').get(opts.uuid).delete().run()   # delete it (but don't wait for this to finish)
                    cb()
                else if x.blob?
                    # blob not expired and is in database
                    blob = x.blob
                    cb()
                else if x.gcloud
                    # blob not available locally, but should be in a Google cloud storage bucket -- try to get it
                    @gcloud().bucket(name: x.gcloud).read
                        name : opts.uuid
                        cb   : (err, _blob) =>
                            if err
                                cb(err)
                            else
                                blob = _blob
                                cb()
                                if opts.save_in_db
                                    # also save in database so will be faster next time (again, don't wait on this)
                                    @table('blobs').get(opts.uuid).update(blob : blob).run()
                else
                    # blob not local and not in gcloud -- this shouldn't happen (just view this as "expired" by not setting blob)
                    cb()
        ], (err) =>
            opts.cb(err, blob)
            if blob? and opts.touch
                # blob was pulled from db or gcloud, so note that it was accessed (updates a counter)
                @touch_blob(uuid : opts.uuid)
        )

    # Return gcloud API interface
    gcloud: () =>
        return @_gcloud ?= require('./smc_gcloud').gcloud()

    # Uploads the blob with given sha1 uuid to gcloud storage, if it hasn't already
    # been uploaded there.
    copy_blob_to_gcloud: (opts) =>
        opts = defaults opts,
            uuid   : required  # uuid=sha1-based uuid coming from blob
            bucket : BLOB_GCLOUD_BUCKET # name of bucket
            force  : false      # if true, upload even if already uploaded
            remove : false      # if true, deletes blob from database after successful upload to gcloud (to free space)
            cb     : undefined  # cb(err)
        x = undefined
        async.series([
            (cb) =>
                @table('blobs').get(opts.uuid).run (err, _x) =>
                    x = _x
                    if err
                        cb(err)
                    else if not x?
                        cb('no such blob')
                    else if not x.blob and not x.gcloud
                        cb('blob not available -- this should not be possible')
                    else if not x.blob and x.force
                        cb("blob can't be reploaded since it was already deleted")
                    else
                        cb()
            (cb) =>
                if x.gcloud? and not opts.force
                    # already uploaded -- don't need to do anything
                    cb(); return
                if not x.blob?
                    # blob already deleted locally
                    cb(); return
                # upload to Google cloud storage
                @gcloud().bucket(name:opts.bucket).write
                    name    : opts.uuid
                    content : x.blob
                    cb      : cb
            (cb) =>
                if not x.blob? or x.gcloud == opts.bucket
                    cb(); return
                # successful upload to gcloud -- set x.gcloud
                @table('blobs').get(opts.uuid).update(gcloud:opts.bucket).run(cb)
            (cb) =>
                if x.blob? and opts.remove
                    # blob definitely defined in database, so delete it.
                    @table('blobs').get(opts.uuid).replace(@r.row.without('blob')).run(cb)
                else
                    cb()
        ], (err) => opts.cb?(err))

    # Backup limit blobs that previously haven't been dumped to blobs, and put them in
    # a tarball in the given path.  The tarball's name is the time when the backup starts.
    # The tarball is compressed using gzip compression.
    #
    #    db._error_thresh=1e6; db.backup_blobs_to_tarball(limit:10000,path:'/backup/tmp-blobs',repeat_until_done:60, cb:done())
    #
    # I have not written code to restore from these tarballs.  Assuming the database has been restore,
    # so there is an entry in the blobs table for each blob, it would suffice to upload the tarballs,
    # then copy their contents straight into the BLOB_GCLOUD_BUCKET gcloud bucket, and that’s it.
    # If we didn't have the blobs table in the db, make dummy entries from the blob names in the tarballs.
    backup_blobs_to_tarball: (opts) =>
        opts = defaults opts,
            limit    : 10000     # number of blobs to backup
            path     : required  # path where [timestamp].tar file is placed
            throttle : 0         # wait this many seconds between pulling blobs from database
            repeat_until_done : 0 # if positive keeps re-call'ing this function until no more results to backup (pauses this many seconds between)
            map_limit: 5
            cb    : undefined # cb(err, '[timestamp].tar')
        dbg     = @dbg("backup_blobs_to_tarball(limit=#{opts.limit},path='#{opts.path}')")
        join    = require('path').join
        dir     = misc.date_to_snapshot_format(new Date())
        target  = join(opts.path, dir)
        tarball = target + '.tar.gz'
        v       = undefined
        to_remove = []
        async.series([
            (cb) =>
                dbg("make target='#{target}'")
                fs.mkdir(target, cb)
            (cb) =>
                dbg("get blobs that we need to back up")
                query = @table('blobs').getAll(true, index:'needs_backup')
                query.pluck('id', 'size').limit(opts.limit).pluck('id').run (err, x) =>
                    v = x; cb(err)
            (cb) =>
                dbg("backup #{v.length} blobs")
                f = (x, cb) =>
                    @get_blob
                        uuid  : x.id
                        touch : false
                        cb    : (err, blob) =>
                            if err
                                dbg("ERROR! #{err}")
                                cb(err)
                            else if blob?
                                dbg("got blob from db -- now write to disk")
                                to_remove.push(x.id)
                                fs.writeFile join(target, x.id), blob, (err) =>
                                    if opts.throttle
                                        setTimeout(cb, opts.throttle*1000)
                                    else
                                        cb()
                            else
                                dbg("blob is expired, so nothing to be done, ever.")
                                cb()
                async.mapLimit(v, opts.map_limit, f, cb)
            (cb) =>
                dbg("successfully wrote all blobs to files; now make tarball")
                misc_node.execute_code
                    command : 'tar'
                    args    : ['zcvf', tarball, dir]
                    path    : opts.path
                    timeout : 3600
                    cb      : cb
            (cb) =>
                dbg("remove temporary blobs")
                f = (x, cb) =>
                    fs.unlink(join(target, x), cb)
                async.mapLimit(to_remove, 10, f, cb)
            (cb) =>
                dbg("remove temporary directory")
                fs.rmdir(target, cb)
            (cb) =>
                dbg("backup succeeded completely -- mark all blobs as backed up")
                @table('blobs').getAll((x.id for x in v)...).update(backup:true).run(cb)
        ], (err) =>
            if err
                dbg("ERROR: #{err}")
                opts.cb?(err)
            else
                dbg("done")
                if opts.repeat_until_done and to_remove.length == opts.limit
                    f = () =>
                        @backup_blobs_to_tarball(opts)
                    setTimeout(f, opts.repeat_until_done*1000)
                else
                    opts.cb?(undefined, tarball)
        )

    # Copied all blobs that will never expire to a google cloud storage bucket.
    #
    #    db._error_thresh=1e6; errors={}; db.copy_all_blobs_to_gcloud(limit:500, cb:done(), remove:true, repeat_until_done_s:10, errors:errors)
    #
    copy_all_blobs_to_gcloud: (opts) =>
        opts = defaults opts,
            bucket    : BLOB_GCLOUD_BUCKET # name of bucket
            limit     : 1000               # copy this many in each batch
            map_limit : 1                  # copy this many at once.
            throttle  : 0                  # wait this many seconds between uploads
            repeat_until_done_s : 0        # if nonzero, waits this many seconds, then recalls this function until nothing gets uploaded.
            errors    : {}                 # used to accumulate errors
            remove    : false
            cb        : required
        dbg = @dbg("copy_all_blobs_to_gcloud()")
        dbg()
        # This query selects the blobs that will never expire, but have not yet
        # been copied to Google cloud storage.
        query = @table('blobs').getAll(true, index:'needs_gcloud').pluck('id', 'size')
        if opts.limit
            query = query.limit(opts.limit)
        dbg("getting blob id's...")
        query.run (err, v) =>
            if err
                dbg("fail: #{err}")
                opts.cb(err)
            else if not v?
                dbg("no results -- v undefined")
                opts.cb('no results')
            else
                n = v.length; m = 0
                dbg("got #{n} blob id's")
                f = (x, cb) =>
                    m += 1
                    k = m; start = new Date()
                    dbg("**** #{k}/#{n}: uploading #{x.id} of size #{x.size/1000}KB")
                    @copy_blob_to_gcloud
                        uuid   : x.id
                        bucket : opts.bucket
                        remove : opts.remove
                        cb     : (err) =>
                            dbg("**** #{k}/#{n}: finished -- #{err}; size #{x.size/1000}KB; time=#{new Date() - start}ms")
                            if err
                                opts.errors[x.id] = err
                            if opts.throttle
                                setTimeout(cb, 1000*opts.throttle)
                            else
                                cb()
                async.mapLimit v, opts.map_limit, f, (err) =>
                    dbg("finished this round -- #{err}")
                    if opts.repeat_until_done_s and v.length > 0
                        dbg("repeat_until_done triggering another round")
                        setTimeout((=> @copy_all_blobs_to_gcloud(opts)), opts.repeat_until_done_s*1000)
                    else
                        dbg("done : #{misc.to_json(opts.errors)}")
                        opts.cb(if misc.len(opts.errors) > 0 then opts.errors)

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

    # If blob has been copied to gcloud, remove the BLOB part of the data
    # from the database (to save space).
    close_blob: (opts) =>
        opts = defaults opts,
            uuid   : required   # uuid=sha1-based from blob
            bucket : BLOB_GCLOUD_BUCKET # name of bucket
            cb     : undefined   # cb(err)
        query = @table('blobs').get(opts.uuid)
        async.series([
            (cb) =>
                # ensure blob is in gcloud
                query.pluck('gcloud').run (err, x) =>
                    if err
                        cb(err)
                    else if not x.gcloud
                        # not yet copied to gcloud storage
                        @copy_blob_to_gcloud
                            uuid   : opts.uuid
                            bucket : opts.bucket
                            cb     : cb
                    else
                        # copied already
                        cb()
            (cb) =>
                # now blob is in gcloud -- delete in database
                query.replace(@r.row.without('blob')).run(cb)
        ], (err) => opts.cb?(err))

    # Free space in database used by blobs that have already been uploaded to gcloud. Once done,
    # these blobs get served from gcloud.
    #
    #   db._error_thresh = 1e6; db.free_uploaded_blobs(repeat_until_done:true, cb:done())
    #
    # TODO: delete this once we have freed all of them...
    free_uploaded_blobs: (opts) =>
        opts = defaults opts,
            limit : 10000  # do this many of them
            repeat_until_done : false
            cb    : required
        dbg = @dbg("free_uploaded_blobs()")
        dbg()
        v = undefined
        async.series([
            (cb) =>
                dbg("querying db for the ids of uploaded blobs that haven't been freed (still have blob field)")
                query = @table('blobs').hasFields('gcloud').filter(db.r.row.hasFields('blob')).pluck('id')
                if opts.limit
                    query = query.limit(opts.limit)
                query.run (err, _v) =>
                    v = _v; cb(err)
            (cb) =>
                dbg("now deleting blob field on #{v.length} blobs")
                v = (x.id for x in v)
                @table('blobs').getAll(v...).replace(@r.row.without('blob')).run(cb)
        ], (err) =>
            if err
                opts.cb?(err)
            else if opts.repeat_until_done and v?.length == opts.limit
                @free_uploaded_blobs(opts)
            else
                opts.cb?()

        )

    ###
    # User queries
    ###

    user_query_cancel_changefeed: (opts) =>
        winston.debug("user_query_cancel_changefeed: opts=#{to_json(opts)}")
        opts = defaults opts,
            id : required
            cb : undefined
        x = @_change_feeds?[opts.id]
        if x?
            delete @_change_feeds[opts.id]
            @_user_query_stats.cancel_changefeed(changefeed_id: opts.id)
            winston.debug("user_query_cancel_changefeed: #{opts.id} (num_feeds=#{misc.len(@_change_feeds)})")
            f = (y, cb) ->
                y?.close(cb)
            async.map(x, f, ((err)->opts.cb?(err)))
        else
            opts.cb?()

    user_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            query      : required
            options    : []         # used for initial query; **IGNORED** by changefeed!; can use [{set:true}] or [{set:false}] to force get or set query
            changes    : undefined  # id of change feed
            cb         : required   # cb(err, result)  # WARNING -- this *will* get called multiple times when changes is true!
        dbg = @dbg("user_query(...)")
        if misc.is_array(opts.query)
            if opts.changes and opts.query.length > 1
                opts.cb("changefeeds only implemented for single table")
                return
            # array of queries
            result = []
            f = (query, cb) =>
                @user_query
                    account_id : opts.account_id
                    project_id : opts.project_id
                    query      : query
                    options    : opts.options
                    cb         : (err, x) =>
                        result.push(x); cb(err)
            async.mapSeries(opts.query, f, (err) => opts.cb(err, result))
            return

        subs =
            '{account_id}' : opts.account_id
            '{project_id}' : opts.project_id
            '{now}'        : new Date()

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
        is_set_query = undefined
        if opts.options?
            if not misc.is_array(opts.options)
                if misc.len(opts.options) == 0
                    opts.options = []  # old clients
                else
                    opts.cb("options (=#{misc.to_json(opts.options)}) must be an array")
                    return
            for x in opts.options
                if x.set?
                    is_set_query = !!x.set
            options = (x for x in opts.options when not x.set?)
        else
            options = []
        if typeof(query) == "object"
            query = misc.deep_copy(query)
            obj_key_subs(query, subs)
            if not is_set_query?
                is_set_query = not misc.has_null_leaf(query)
            if is_set_query
                # do a set query
                if changes
                    opts.cb("changefeeds only for read queries")
                    return
                if not opts.account_id? and not opts.project_id?
                    opts.cb("no anonymous set queries")
                    return

                on_success = undefined
                if SCHEMA[table].unique_writes
                    # no reason for user to ever write the same thing to this table twice
                    uniq = @_user_set_query_unique_writes ?= {}
                    uniq[table] ?= {}
                    # dbg("uniq=#{misc.to_json(uniq)}")
                    rep = json_stable_stringify(opts.query)
                    q = misc_node.sha1(rep)
                    if uniq[table][q]
                        who = if opts.account_id? then "account_id='#{opts.account_id}'" else "project_id='#{opts.project_id}'"
                        dbg("(#{who}): trying to rewrite entry in unique_writes table for the #{uniq[table][q]} time -- skipping: query='#{rep}'")
                        uniq[table][q] += 1
                        opts.cb() # CRITICAL -- DO NOT ERROR!  That stops subsequent records being written, leading to data loss
                        return
                    else
                        on_success = () =>
                            uniq[table][q] = 1

                @user_set_query
                    account_id : opts.account_id
                    project_id : opts.project_id
                    table      : table
                    query      : query
                    cb         : (err, x) =>
                        if not err
                            on_success?()
                        opts.cb(err, {"#{table}":x})

            else
                # do a get query
                if changes and not multi
                    opts.cb("changefeeds only implemented for multi-document queries")
                    return
                @user_get_query
                    account_id : opts.account_id
                    project_id : opts.project_id
                    table      : table
                    query      : query
                    options    : options
                    multi      : multi
                    changes    : changes
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

    is_admin: (account_id, cb) =>
        @table('accounts').get(account_id).pluck('groups').run {cache:true}, (err, x) =>
            if err
                cb(err)
            else
                cb(undefined, x?.groups? and 'admin' in x.groups)

    _require_is_admin: (account_id, cb) =>
        if not account_id?
            cb("user must be an admin")
            return
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
        @table('projects').getAll(project_ids...).pluck(project_id:true, users:s).run {cache:true}, (err, x) =>
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
        limit = err = heartbeat = undefined
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
                    when 'heartbeat'
                        x = parseInt(value)
                        if x > 0
                            heartbeat = x
                    else
                        err:"unknown option '#{name}'"
        return {db_query:db_query, err:err, limit:limit, heartbeat:heartbeat}

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
            account_id : undefined
            project_id : undefined
            table      : required
            query      : required
            cb         : required   # cb(err)
        if opts.project_id?
            dbg = @dbg("user_set_query(project_id='#{opts.project_id}', table='#{opts.table}')")
        else if opts.account_id?
            dbg = @dbg("user_set_query(account_id='#{opts.account_id}', table='#{opts.table}')")
        else
            opts.cb("account_id or project_id must be specified")
            return
        dbg(to_json(opts.query))

        @_user_query_stats.set_query
            account_id : opts.account_id
            project_id : opts.project_id
            table      : opts.table

        query = misc.copy(opts.query)
        table = opts.table
        db_table = SCHEMA[opts.table].virtual ? table
        account_id = opts.account_id
        project_id = opts.project_id

        s = SCHEMA[table]

        if account_id?
            client_query = s?.user_query
        else
            client_query = s?.project_query
        if not client_query?.set?.fields?
            #dbg("requested to do set on table '#{opts.table}' that doesn't allow set")
            opts.cb("user set queries not allowed for table '#{opts.table}'")
            return

        # mod_fields counts the fields in query that might actually get modified
        # in the database when we do the query; e.g., account_id won't since it gets
        # filled in with the user's account_id, and project_write won't since it must
        # refer to an existing project.  We use mod_field **only** to skip doing
        # no-op queries below. It's just an optimization.
        mod_fields = 0
        for field in misc.keys(opts.query)
            if client_query.set.fields[field] not in ['account_id', 'project_write']
                mod_fields += 1
        if mod_fields == 0
            # nothing to do
            opts.cb()
            return

        for field in misc.keys(client_query.set.fields)
            if client_query.set.fields[field] == undefined
                opts.cb("user set query not allowed for #{opts.table}.#{field}")
                return
            switch client_query.set.fields[field]
                when 'account_id'
                    if not account_id?
                        opts.cb("account_id must be specified")
                        return
                    query[field] = account_id
                when 'project_id'
                    if not project_id?
                        opts.cb("project_id must be specified")
                        return
                    query[field] = project_id
                when 'time_id'
                    query[field] = uuid.v1()
                    #console.log("time_id -- query['#{field}']='#{query[field]}'")
                when 'project_write'
                    if not query[field]?
                        opts.cb("must specify #{opts.table}.#{field}")
                        return
                    require_project_ids_write_access = [query[field]]
                when 'project_owner'
                    if not query[field]?
                        opts.cb("must specify #{opts.table}.#{field}")
                        return
                    require_project_ids_owner = [query[field]]

        #dbg("call any set functions (after doing the above)")
        for field in misc.keys(query)
            f = client_query.set.fields?[field]
            if typeof(f) == 'function'
                try
                    query[field] = f(query, @, opts.account_id)
                catch err
                    opts.cb("error setting '#{field}' -- #{err}")
                    return

        if client_query.set.admin
            require_admin = true

        primary_key = s.primary_key
        if not primary_key?
            primary_key = 'id'
        for k, v of query
            if primary_key == k
                continue
            if client_query?.set?.fields?[k] != undefined
                continue
            if s.admin_query?.set?.fields?[k] != undefined
                require_admin = true
                continue
            opts.cb("changing #{table}.#{k} not allowed")
            return

        # HOOKS which allow for running arbitrary code in response to
        # user set queries.  In each case, new_val below is only the part
        # of the object that the user requested to change.

        # 0. CHECK: Runs before doing any further processing; has callback, so this
        # provides a generic way to quickly check whether or not this query is allowed
        # for things that can't be done declaratively.
        check_hook = client_query.set.check_hook

        # 1. BEFORE: If before_change is set, it is called with input
        #   (database, old_val, new_val, account_id, cb)
        # before the actual change to the database is made.
        before_change_hook = client_query.set.before_change

        # 2. INSTEAD OF: If instead_of_change is set, then instead_of_change_hook
        # is called with input
        #      (database, old_val, new_val, account_id, cb)
        # *instead* of actually doing the update/insert to
        # the database.  This makes it possible to run arbitrary
        # code whenever the user does a certain type of set query.
        # Obviously, if that code doesn't set the new_val in the
        # database, then new_val won't be the new val.
        instead_of_change_hook = client_query.set.instead_of_change

        # 3. AFTER:  If set, the on_change_hook is called with
        #   (database, old_val, new_val, account_id, cb)
        # after everything the database has been modified.
        on_change_hook = client_query.set.on_change

        old_val = undefined
        #dbg("on_change_hook=#{on_change_hook?}, #{to_json(misc.keys(client_query.set))}")

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
                            if project_id?
                                err = undefined
                                for x in require_project_ids_write_access
                                    if x != project_id
                                        err = "can only query same project"
                                        break
                                cb(err)
                            else
                                @_require_project_ids_in_groups(account_id, require_project_ids_write_access,\
                                                 ['owner', 'collaborator'], cb)
                        else
                            cb()
                    (cb) =>
                        if require_project_ids_owner?
                            @_require_project_ids_in_groups(account_id, require_project_ids_owner,\
                                             ['owner'], cb)
                        else
                            cb()
                ], cb)
            (cb) =>
                if check_hook?
                    check_hook(@, query, account_id, project_id, cb)
                else
                    cb()
            (cb) =>
                if on_change_hook? or before_change_hook? or instead_of_change_hook?
                    # get the old value before changing it
                    @table(db_table).get(query[primary_key]).run (err, x) =>
                        old_val = x; cb(err)
                else
                    cb()
            (cb) =>
                if before_change_hook?
                    before_change_hook(@, old_val, query, account_id, cb)
                else
                    cb()
            (cb) =>
                if instead_of_change_hook?
                    instead_of_change_hook(@, old_val, query, account_id, cb)
                else
                    @table(db_table).insert(query, conflict:'update').run(cb)
            (cb) =>
                if on_change_hook?
                    #dbg("calling on_change_hook")
                    on_change_hook(@, old_val, query, account_id, cb)
                else
                    cb()
        ], (err) => opts.cb(err))

    # fill in the default values for obj using the client_query spec.
    _query_set_defaults: (client_query, obj, fields) =>
        if not misc.is_array(obj)
            obj = [obj]
        else if obj.length == 0
            return
        s = client_query?.get?.fields ? {}
        for k in fields
            v = s[k]
            if v?
                # k is a field for which a default value (=v) is provided in the schema
                for x in obj
                    # For each obj pulled from the database that is defined...
                    if x?
                        # We check to see if the field k was set on that object.
                        y = x[k]
                        if not y?
                            # It was NOT set, so we deep copy the default value for the field k.
                            x[k] = misc.deep_copy(v)
                        else if typeof(v) == 'object' and typeof(y) == 'object' and not misc.is_array(v)
                            # y *is* defined and is an object, so we merge in the provided defaults.
                            for k0, v0 of v
                                if not y[k0]?
                                    y[k0] = v0

    _user_set_query_project_users: (obj, account_id) =>
        #winston.debug("_user_set_query_project_users: #{misc.to_json(obj)}")
        # TODO:  disabling the real checks for now !!!!
        winston.debug("_user_set_query_project_users: (disabled)")
        return obj.users

        #   - ensures all keys of users are valid uuid's (though not that they are valid users).
        #   - and format is:
        #          {group:'owner' or 'collaborator', hide:bool, upgrades:{a map}}
        #     with valid upgrade fields.
        upgrade_fields = PROJECT_UPGRADES.params
        users = {}
        for id, x of obj.users
            if misc.is_valid_uuid_string(id)
                for key in misc.keys(x)
                    if key not in ['group', 'hide', 'upgrades']
                        throw Error("unknown field '#{key}")
                if x.group? and (x.group not in ['owner', 'collaborator'])
                    throw Error("invalid value for field 'group'")
                if x.hide? and typeof(x.hide) != 'boolean'
                    throw Error("invalid type for field 'hide'")
                if x.upgrades?
                    if typeof(x.upgrades) != 'object'
                        throw Error("invalid type for field 'upgrades'")
                    for k,_ of x.upgrades
                        if not upgrade_fields[k]
                            throw Error("invalid upgrades field '#{k}'")
                users[id] = x
        return users

    project_action: (opts) =>
        opts = defaults opts,
            project_id     : required
            action_request : required   # action is a pair
            cb             : required
        dbg = @dbg("project_action(project_id=#{opts.project_id},action_request=#{misc.to_json(opts.action_request)})")
        dbg()
        project = undefined
        action_request = misc.copy(opts.action_request)
        async.series([
            (cb) =>
                action_request.started = new Date()
                dbg("set action_request to #{misc.to_json(action_request)}")
                @table('projects').get(opts.project_id).update(action_request:@r.literal(action_request)).run(cb)
            (cb) =>
                dbg("get project")
                @compute_server.project
                    project_id : opts.project_id
                    cb         : (err, x) =>
                        project = x; cb(err)
            (cb) =>
                dbg("doing action")
                switch action_request.action
                    when 'save'
                        project.save
                            min_interval : 1   # allow frequent explicit save (just an rsync)
                            cb           : cb
                    when 'restart'
                        project.restart
                            cb           : cb
                    when 'stop'
                        project.stop
                            cb           : cb
                    when 'start'
                        project.start
                            cb           : cb
                    when 'close'
                        project.close
                            cb           : cb
                    else
                        cb("action '#{opts.action_request.action}' not implemented")
        ], (err) =>
            if err
                action_request.err = err
            action_request.finished = new Date()
            dbg("finished!")
            @table('projects').get(opts.project_id).update(action_request:@r.literal(action_request)).run(opts.cb)
        )

    # This hook is called *before* the user commits a change to a project in the database
    # via a user set query.
    # TODO: Add a pre-check here as well that total upgrade isn't going to be exceeded.
    # This will avoid a possible subtle edge case if user is cheating and always somehow
    # crashes server...?
    _user_set_query_project_change_before: (old_val, new_val, account_id, cb) =>
        dbg = @dbg("_user_set_query_project_change_before #{account_id}, #{to_json(old_val)} --> #{to_json(new_val)}")
        dbg()

        if new_val?.action_request? and (new_val.action_request.time - (old_val?.action_request?.time ? 0) != 0)
            # Requesting an action, e.g., save, restart, etc.
            dbg("action_request -- #{misc.to_json(new_val.action_request)}")
            #
            # WARNING: Above, we take the difference of times below, since != doesn't work as we want with
            # separate Date objects, as it will say equal dates are not equal. Example:
            # coffee> x = JSON.stringify(new Date()); {from_json}=require('misc'); a=from_json(x); b=from_json(x); [a!=b, a-b]
            # [ true, 0 ]

            # Launch the action -- success or failure communicated back to all clients through changes to state.
            # Also, we don't have to worry about permissions here; that this function got called at all means
            # the user has write access to the projects table entry with given project_id, which gives them permission
            # to do any action with the project.
            @project_action
                project_id     : new_val.project_id
                action_request : misc.copy_with(new_val.action_request, ['action', 'time'])
                cb         : (err) =>
                    dbg("action_request #{misc.to_json(new_val.action_request)} completed -- #{err}")
            cb()
            return

        if not new_val.users?  # not changing users
            cb(); return
        old_val = old_val?.users ? {}
        new_val = new_val?.users ? {}
        for id in misc.keys(old_val).concat(new_val)
            if account_id != id
                # make sure user doesn't change anybody else's allocation
                if not underscore.isEqual(old_val?[id]?.upgrades, new_val?[id]?.upgrades)
                    err = "user '#{account_id}' tried to change user '#{id}' allocation toward a project"
                    dbg(err)
                    cb(err)
                    return
        cb()

    # This hook is called *after* the user commits a change to a project in the database
    # via a user set query.  It could undo changes the user isn't allowed to make, which
    # might require doing various async calls, or take actions (e.g., setting quotas,
    # starting projects, etc.).
    _user_set_query_project_change_after: (old_val, new_val, account_id, cb) =>
        dbg = @dbg("_user_set_query_project_change_after #{account_id}, #{to_json(old_val)} --> #{to_json(new_val)}")
        dbg()
        old_upgrades = old_val.users?[account_id]?.upgrades
        new_upgrades = new_val.users?[account_id]?.upgrades
        if new_upgrades? and not underscore.isEqual(old_upgrades, new_upgrades)
            dbg("upgrades changed for #{account_id} from #{misc.to_json(old_upgrades)} to #{misc.to_json(new_upgrades)}")
            project = undefined
            async.series([
                (cb) =>
                    @ensure_user_project_upgrades_are_valid
                        account_id : account_id
                        cb         : cb
                (cb) =>
                    if not @compute_server?
                        cb()
                    else
                        dbg("get project")
                        @compute_server.project
                            project_id : new_val.project_id
                            cb         : (err, p) =>
                                project = p; cb(err)
                (cb) =>
                    if not project?
                        cb()
                    else
                        dbg("determine total quotas and apply")
                        project.set_all_quotas(cb:cb)
            ], cb)
        else
            cb()

    user_get_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            table      : required
            query      : required
            multi      : required
            options    : required   # used for initial query; **IGNORED** by changefeed, except for {heartbeat:n}, which ensures that *something* is sent every n minutes, in case no changes are coming out of the changefeed. This is an additional measure in case the client somehow doesn't get a "this changefeed died" message.
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
        if opts.account_id?
            dbg = @dbg("user_get_query(account_id=#{opts.account_id}, table=#{opts.table})")
        else if opts.project_id?
            dbg = @dbg("user_get_query(project_id=#{opts.project_id}, table=#{opts.table})")
        else
            dbg = @dbg("user_get_query(anonymous, table=#{opts.table})")

        dbg("options=#{misc.to_json(opts.options)}")

        if not opts.changes
            @_user_query_stats.get_query
                account_id : opts.account_id
                project_id : opts.project_id
                table      : opts.table

        # For testing, it can be useful to simulate lots of random failures
        #if Math.random() <= .5
        #    dbg("user_get_query: randomly failing as a test")
        #    opts.cb("random failure")
        #    return

        if opts.changes? and not opts.changes.cb?
            opts.cb("user_get_query -- if opts.changes is specified, then opts.changes.cb must also be specified")
            return

        # get data about user queries on this table
        if opts.project_id?
            client_query = SCHEMA[opts.table]?.project_query
        else
            client_query = SCHEMA[opts.table]?.user_query

        if not client_query?.get?
            opts.cb("get queries not allowed for table '#{opts.table}'")
            return

        if not opts.account_id? and not opts.project_id? and not SCHEMA[opts.table].anonymous
            opts.cb("anonymous get queries not allowed for table '#{opts.table}'")
            return

        # Are only admins allowed any get access to this table?
        if client_query.get.admin
            require_admin = true
        else
            require_admin = false

        # verify all requested fields may be read by users
        for field in misc.keys(opts.query)
            if client_query.get.fields?[field] == undefined
                opts.cb("user get query not allowed for #{opts.table}.#{field}")
                return

        if client_query.get.instead_of_query?
            # custom version: instead of doing a full query, we instead call a function and that's it.
            client_query.get.instead_of_query(@, opts.query, opts.account_id, opts.cb)
            return

        # Make sure there is the query that gets only things in this table that this user
        # is allowed to see.
        if not client_query.get.all?.args?
            opts.cb("user get query not allowed for #{opts.table} (no getAll filter)")
            return

        # Apply default options to the get query (don't impact changefeed)
        # The user can overide these, e.g., if they were to want to explicitly increase a limit
        # to get more file use history.
        if client_query.get.all?.options?
            # complicated since options is a list of {opt:val} !
            user_options = {}
            for x in opts.options
                for y, z of x
                    user_options[y] = true
            for x in client_query.get.all.options
                for y, z of x
                    if not user_options[y]
                        opts.options.push(x)

        result = undefined
        table_name = SCHEMA[opts.table].virtual ? opts.table
        db_query = @table(table_name)
        opts.this = @

        # The killfeed below is only used when changes is true in case of tricky queries that depend
        # looking up a varying collection of things in the index.   Any activity on this feed results
        # in an error that recreates this feed.  This is a "brutal" approach, but the resulting error
        # will cause the client to reconnect and reset properly, so it's clean.  It's of course less
        # efficient, and should only be used in situations where it will rarely happen.  E.g.,
        # the collaborators of a user don't change constantly.
        killfeed      = undefined
        require_admin = false
        async.series([
            (cb) =>
                if client_query.get.check_hook?
                    client_query.get.check_hook(@, opts.query, opts.account_id, opts.project_id, cb)
                else
                    cb()
            (cb) =>
                # this possibly increases the load on the database a LOT which is not an option, since it kills the site :-(
                ## cb(); return # to disable
                if opts.changes
                    # see discussion at https://github.com/rethinkdb/rethinkdb/issues/4754#issuecomment-143477039
                    @wait_until_ready_for_writes
                        table   : table_name
                        cb      : cb
                else
                    cb()
            (cb) =>
                if require_admin
                    @_require_is_admin(opts.account_id, cb)
                else
                    cb()
            (cb) =>
                dbg("initial selection of records from table")
                # Get the spec
                {cmd, args} = client_query.get.all
                if not cmd?
                    cmd = 'getAll'
                if typeof(args) == 'function'
                    args = args(opts.query, @)
                else
                    args = (x for x in args) # important to copy!
                v = []
                f = (x, cb) =>
                    #dbg("f('#{x}')")
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
                        if opts.project_id?
                            v.push(opts.project_id)
                            cb()
                        else if not opts.query.project_id
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
                                        @wait_until_ready_for_writes
                                            table : 'projects'
                                            cb    : (err) =>
                                                if err
                                                    cb(err)
                                                else
                                                    @table('projects').getAll(opts.account_id, index:'users').pluck('users').changes(includeStates: false, squash:5).run (err, feed) =>
                                                        if err
                                                            e = misc.to_json(err)
                                                            if e.indexOf("Did you just reshard?") != -1
                                                                # give it time so we do not overload the server
                                                                setTimeout((()=>cb(err)), 10000)
                                                            else
                                                                cb(err)
                                                        else
                                                            killfeed = feed
                                                            cb()
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
                                        @wait_until_ready_for_writes
                                            table : 'projects'
                                            cb    : (err) =>
                                                if err
                                                    cb(err)
                                                else
                                                    @table('projects').getAll(opts.account_id, index:'users').pluck('users').changes(includeStates: false, squash:5).run (err, feed) =>
                                                        if err
                                                            e = misc.to_json(err)
                                                            if e.indexOf("Did you just reshard?") != -1
                                                                # give it time so we do not overload the server
                                                                setTimeout((()=>cb(err)), 10000)
                                                            else
                                                                cb(err)
                                                        else
                                                            killfeed = feed
                                                            cb()
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
                                #dbg("v=#{misc.to_json(v)}")
                                db_query = db_query[cmd](v...)
                                cb()
            (cb) =>
                dbg("filter the query")
                # Parse the filter part of the query
                query = misc.copy(opts.query)

                # If the schema lists the value in a get query as null, then we reset it to null; it was already
                # used by the initial get all part of the query.
                for field, val of client_query.get.fields
                    if val == 'null'
                        query[field] = null

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
                {db_query, limit, heartbeat, err} = @_query_parse_options(db_query, opts.options)
                dbg("heartbeat = #{heartbeat}")
                if err
                    cb(err); return

                dbg("run the query -- #{to_json(opts.query)}")
                time_start = misc.walltime()

                main_query = (cb) =>
                    db_query.run (err, x) =>
                        if err
                            dbg("query (time=#{misc.walltime(time_start)}s):  #{db_query}  ERROR -- #{to_json(err)}")
                            cb(err)
                        else
                            dbg("query (time=#{misc.walltime(time_start)}s): #{to_json(opts.query)} got -- #{x.length} results")
                            if not opts.multi
                                x = x[0]
                            result = x
                            @_query_set_defaults(client_query, result, misc.keys(opts.query))
                            #dbg("query #{changefeed_id} -- initial part -- #{misc.to_json(result)}")
                            cb()

                changefeed_query = (cb) =>
                    if not opts.changes?
                        cb(); return
                    # no errors -- setup changefeed now
                    changefeed_id = opts.changes.id

                    # IMPORTANT: We call changefeed_cb only once per tick;
                    # feed.each below could call 300 times (say) synchronously since we squash updates;
                    # if each of the values took 10ms blocking to json-ify, that would be 3000ms in which
                    # the node.js process is completely BLOCKED.
                    # By using process.nextTick, we let node.js handle other work
                    # during this time.
                    _changefeed_cb_queue = []
                    last_changefeed_cb_call = new Date()
                    changefeed_cb = (err, x) ->
                        last_changefeed_cb_call = new Date()
                        if _changefeed_cb_queue.length > 0
                            _changefeed_cb_queue.push([err, x])
                            #winston.debug("USING CHANGEFEED QUEUE: #{_changefeed_cb_queue.length}")
                            return
                        _changefeed_cb_queue.push([err, x])
                        f = () ->
                            #winston.debug("PROCESSING CHANGEFEED QUEUE: #{_changefeed_cb_queue.length}")
                            z = _changefeed_cb_queue.shift()
                            opts.changes.cb(z[0], z[1])
                            if _changefeed_cb_queue.length > 0
                                process.nextTick(f)
                        process.nextTick(f)

                    winston.debug("FEED -- setting up a feed with id #{changefeed_id}")
                    db_query_no_opts.changes(includeStates: false, squash:.5).run (err, feed) =>
                    #db_query_no_opts.changes(includeStates: false).run (err, feed) =>
                        if err
                            e = to_json(err)
                            winston.debug("FEED -- error setting up #{e}")
                            if e.indexOf("Did you just reshard?") != -1
                                # give it time so we do not overload the server -- this happens when any auto-failover happens
                                setTimeout((()=>cb(err)), 10000)
                            else
                                cb(err)
                        else
                            @_change_feeds ?= {}
                            @_change_feeds[changefeed_id] = [feed]
                            @_user_query_stats.changefeed
                                account_id    : opts.account_id
                                project_id    : opts.project_id
                                table         : opts.table
                                changefeed_id : changefeed_id

                            winston.debug("FEED -- there are now num_feeds=#{misc.len(@_change_feeds)} changefeeds")
                            changefeed_state = 'initializing'

                            if heartbeat
                                winston.debug("FEED - setup heartbeat timer on '#{opts.table}' for feed '#{changefeed_id}'")
                                # This is to ensure changefeed_cb is called at least once every heartbeat minutes.
                                heartbeat_ms = 60*1000*heartbeat
                                process_heartbeat = () =>
                                    if not @_change_feeds[changefeed_id]
                                        # changefeed is canceled
                                        return
                                    #winston.debug("processing heartbeat timer on '#{opts.table}', #{new Date() - last_changefeed_cb_call}, #{heartbeat_ms}")
                                    time_since_last = new Date() - last_changefeed_cb_call
                                    if time_since_last >= heartbeat_ms
                                        changefeed_cb(undefined, {}) # empty message
                                        setTimeout(process_heartbeat, heartbeat_ms)
                                    else
                                        setTimeout(process_heartbeat, heartbeat_ms - time_since_last)
                                setTimeout(process_heartbeat, heartbeat_ms)

                            feed.each (err, x) =>
                                if not err
                                    @_query_set_defaults(client_query, x.new_val, misc.keys(opts.query))

                                    ###
                                    if Math.random() <= .1  # FOR TESTING!
                                        winston.debug("FEED #{changefeed_id} (table='#{opts.table}') -- simulating silent loss ")
                                        delete @_change_feeds[changefeed_id]
                                        feed.close()
                                        return
                                    ###
                                else
                                    # feed is broken
                                    winston.debug("FEED #{changefeed_id} is broken, so canceling -- #{to_json(err)}")
                                    @user_query_cancel_changefeed(id:changefeed_id)
                                #dbg("query feed #{changefeed_id} update -- #{misc.to_json(x)}")
                                changefeed_cb(err, x)

                            if killfeed?
                                winston.debug("killfeed(table=#{opts.table}, account_id=#{opts.account_id}, changes.id=#{changefeed_id}) -- watching")
                                # Setup the killfeed, which if it sees any activity results in the
                                # feed sending out an error and also being killed.
                                @_change_feeds[changefeed_id].push(killfeed)  # make sure this feed is also closed
                                killfeed_state = 'initializing'  # killfeeds should have {includeStates: false}
                                killfeed.each (err, val) =>
                                    # TODO: an optimization for some kinds of killfeeds would be to track what we really care about,
                                    # e.g., the list of project_id's, and only if that changes actually force reset below.
                                    # Send an error via the callback; the client *should* take this as a sign
                                    # to start over, which is entirely their responsibility.
                                    winston.debug("killfeed(table=#{opts.table}, account_id=#{opts.account_id}, changes.id=#{changefeed_id}) -- canceling changed using killfeed!")
                                    changefeed_cb("killfeed")
                                    # Saw activity -- cancel the feeds (both the main one and the killfeed)
                                    @user_query_cancel_changefeed(id: changefeed_id)
                            cb()

                async.series([
                    (cb) =>
                        changefeed_query(cb)
                    (cb) =>
                        main_query(cb)
                ], cb)
        ], (err) =>
            #if err
            #    dbg("error: #{to_json(err)}")
            opts.cb(err, result)
        )

    ###
    Synchronized strings
    ###
    _user_set_query_syncstring_change_after: (old_val, new_val, account_id, cb) =>
        dbg = @dbg("_user_set_query_syncstring_change_after")
        cb() # immediately -- stuff below can happen as side effect in the background.
        #dbg("new_val='#{misc.to_json(new_val)}")

        # Now do the following reactions to this syncstring change in the background:

        # 1. Awaken the relevant project.
        project_id = old_val?.project_id ? new_val?.project_id
        if project_id? and (new_val?.save?.state == 'requested' or (new_val?.last_active? and new_val?.last_active != old_val?.last_active))
            dbg("awakening project #{project_id}")
            awaken_project(@, project_id)

        # 2. Log that this particular file is being used/accessed; this is used only
        # longterm for analytics.  Note that log_file_access is throttled.
        # Also, record in a local cache that the user has permission to write
        # to this syncstring.
        if project_id? and new_val?.last_active?
            filename = old_val?.path
            if filename? and account_id?
                @log_file_access
                    project_id : project_id
                    account_id : account_id
                    filename   : filename

    # Verify that writing a patch is allowed.
    _user_set_query_patches_check: (obj, account_id, project_id, cb) =>
        #dbg = @dbg("_user_set_query_patches_check")
        #dbg(misc.to_json([obj, account_id]))
        # 1. Check that
        #  obj.id = [string_id, time],
        # where string_id is a valid sha1 hash and time is a timestamp
        id = obj.id
        if not misc.is_array(id)
            cb("id must be an array")
            return
        if id.length != 2
            cb("id must be of length 2")
            return
        string_id = id[0]; time = id[1]
        if not misc.is_valid_sha1_string(string_id)
            cb("id[0] must be a valid sha1 hash")
            return
        if not misc.is_date(time)
            cb("id[1] must be a Date")
            return
        if obj.user?
            if typeof(obj.user) != 'number'
                cb("user must be a number")
                return
            if obj.user < 0
                cb("user must be positive")
                return

        # 2. Write access
        @_syncstring_access_check(string_id, account_id, project_id, cb)

    # Verify that writing a patch is allowed.
    _user_get_query_patches_check: (obj, account_id, project_id, cb) =>
        #dbg = @dbg("_user_get_query_patches_check")
        #dbg(misc.to_json([obj, account_id]))
        string_id = obj.id?[0]
        if not misc.is_valid_sha1_string(string_id)
            cb("id[0] must be a valid sha1 hash")
            return
        # Write access (no notion of read only yet -- will be easy to add later)
        @_syncstring_access_check(string_id, account_id, project_id, cb)

    # Verify that writing a patch is allowed.
    _user_set_query_cursors_check: (obj, account_id, project_id, cb) =>
        #dbg = @dbg("_user_set_query_cursors_check")
        #dbg(misc.to_json([obj, account_id]))
        # 1. Check that
        #  obj.id = [string_id, user_id],
        # where string_id is a valid uuid, time is a timestamp, and user_id is a nonnegative integer.
        id = obj.id
        if not misc.is_array(id)
            cb("id must be an array")
            return
        if id.length != 2
            cb("id must be of length 2")
            return
        string_id = id[0]; user_id = id[1]
        if not misc.is_valid_sha1_string(string_id)
            cb("id[0] must be a valid sha1 hash")
            return
        if typeof(user_id) != 'number'
            cb("id[1] must be a number")
            return
        if user_id < 0
            cb("id[1] must be positive")
            return
        @_syncstring_access_check(string_id, account_id, project_id, cb)

    # Verify that writing a patch is allowed.
    _user_get_query_cursors_check: (obj, account_id, project_id, cb) =>
        @_syncstring_access_check(obj.string_id, account_id, project_id, cb)

    _syncstring_access_check: (string_id, account_id, project_id, cb) =>
        # Check that string_id is the id of a syncstring the the given account_id or
        # project_id is allowed to write to.  NOTE: We do not concern ourselves (for now at least)
        # with proof of identity (i.e., one user with full read/write access to a project
        # claiming they are another users of that project), since our security model
        # is that any user of a project can edit anything there.  In particular, the
        # synctable lets any user with write access to the project edit the users field.
        @table('syncstrings').get(string_id).pluck('project_id').run {cache:true}, (err, x) =>
            if err
                cb(err)
            else if not x
                # There is no such syncstring with this id -- fail
                cb("no such syncstring")
            else if account_id?
                # Attempt to write by a user browser client
                @_require_project_ids_in_groups(account_id, [x.project_id], ['owner', 'collaborator'], cb)
            else if project_id?
                # Attempt to write by a *project*
                if project_id == x.project_id
                    cb()
                else
                    cb("project not allowed to write to syncstring in different project")

    # Check permissions for querying for syncstrings in a project
    _syncstrings_check: (obj, account_id, project_id, cb) =>
        #dbg = @dbg("_syncstrings_check")
        #dbg(misc.to_json([obj, account_id, project_id]))
        if not misc.is_valid_uuid_string(obj?.project_id)
            cb("project_id must be a valid uuid")
        else if project_id?
            if project_id == obj.project_id
                # The project can access its own syncstrings
                cb()
            else
                cb("projects can only access their own syncstrings") # for now at least!
        else if account_id?
            # Access request by a client user
            @_require_project_ids_in_groups(account_id, [obj.project_id], ['owner', 'collaborator'], cb)
        else
            cb("only users and projects can access syncstrings")

    # One-off code
    ###
    # Compute a map from email addresses to list of corresponding account id's
    # The lists should all have length exactly 1, but due to inconsistencies in
    # the original cassandra database that we migrated from, they might now.
    email_to_accounts: (opts) =>
        opts = defaults opts,
            cb : required
        @table('accounts').pluck('email_address', 'account_id').run (err, data) =>
            if err
                opts.cb(err)
                return
            v = {}
            for x in data
                if x.email_address
                    if not v[x.email_address]
                        v[x.email_address] = [x.account_id]
                    else
                        v[x.email_address].push(x.account_id)
            opts.cb(undefined, v)

    fix_email_address_inconsistency: (opts) =>
        opts = defaults opts,
            email_to_accounts : required  # output of email_to_accounts above
            cb                : required
        f = (email, cb) =>
            accounts = opts.email_to_accounts[email]
            if not accounts? or accounts.length <= 1
                cb()
                return
            # for each account, get the number of projects this user collaborates on.
            project_counts = []
            g = (account_id, cb) =>
                @get_projects_with_user
                    account_id : account_id
                    cb         : (err, projects) =>
                        if err
                            cb(err)
                        else
                            project_counts.push([projects.length, account_id])
                            cb()
            async.map accounts, g, (err) =>
                if err
                    cb(err)
                    return
                project_counts.sort (a,b) -> misc.cmp(a[0],b[0])
                console.log("project_counts=", project_counts)
                if project_counts[project_counts.length-2][0] == 0
                    winston.debug("#{email} -- all but last count is 0, so change all the other email addresses")
                    n = 1
                    h = (account_id, cb) =>
                        w = email.split('@')
                        new_email = "#{w[0]}+#{n}@#{w[1]}"
                        n += 1
                        @table('accounts').get(account_id).update(email_address:new_email).run(cb)
                    async.map( (x[1] for x in project_counts.slice(0,project_counts.length-1)), h, cb)
                else
                    winston.debug("#{email} -- multiple accounts with nontrivial projects -- take most recently used account with projects (or arbitrary if no data about that)")
                    recently_used = []
                    g2 = (account_id, cb) =>
                        @table('accounts').get(account_id).pluck('last_active').run (err, x) =>
                            if err
                                cb(err)
                            else
                                recently_used.push( [x.last_active, account_id ? 0] )
                                cb()
                    async.map (x[1] for x in project_counts when x[0] > 0 ), g2, (err) =>
                        if err
                            cb(err)
                        else
                            n = 1
                            recently_used.sort (a,b) -> misc.cmp(a[0],b[0])
                            h = (account_id, cb) =>
                                w = email.split('@')
                                new_email = "#{w[0]}+#{n}@#{w[1]}"
                                n += 1
                                @table('accounts').get(account_id).update(email_address:new_email).run(cb)
                            z = (x[1] for x in recently_used.slice(0,recently_used.length-1))
                            for x in project_counts  # also include accounts with 0 projects
                                if x[0] == 0
                                    z.push(x[1])
                            async.map(z, h, cb)

        async.mapSeries(misc.keys(opts.email_to_accounts), f, opts.cb)
    ###
    ###
    # Stress testing
    stress0: (opts) =>
        opts = defaults opts,
            account_id : required
            changes    : undefined
            cb         : undefined
        dbg = (m) => winston.debug("stress0(#{opts.account_id}): #{m}")
        t0 = misc.walltime()
        dbg("get collabs")
        @user_query
            account_id : opts.account_id
            query      : {collaborators:[{account_id:null, first_name:null, last_name:null}]}
            changes    : opts.changes
            cb         : (err, result) =>
                dbg("total time=#{misc.walltime(t0)}; got #{result.length} collaborators with output having length #{JSON.stringify(result).length}")
                opts.cb?(err)

    stress0b: (opts) =>
        opts = defaults opts,
            account_id : required
            changes    : undefined
            cb         : undefined
        dbg = (m) => winston.debug("stress0(#{opts.account_id}): #{m}")
        t0 = misc.walltime()
        ids = undefined
        async.series([
            (cb) =>
                dbg("get project ids")
                @table('projects').getAll(opts.account_id, index:'users').run (err, x) =>
                    dbg("got users")
                    if err
                        cb(err)
                    else
                        collabs = {}
                        for project in x
                            for account_id, data of project.users ? {}
                                if data.group in ['collaborator', 'owner']
                                    collabs[account_id] = true
                        ids = misc.keys(collabs)
                        dbg("got #{ids.length} collaborators")
                        cb()
            (cb) =>
                dbg("get info about collaborators")
                @table('accounts').getAll(ids...).pluck('account_id', 'first_name', 'last_name').run (err, x) =>
                    dbg("got user info about #{x?.length} users -- #{to_json(err)}")
                    cb(err)
        ], (err) =>
            opts.cb?(err)
        )

    stress1: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        collaborators = undefined
        changefeeds = []
        dbg = (m) => winston.debug("stress1(#{opts.account_id}): #{m}")
        t_start = misc.walltime()
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
            winston.debug("STRESS1 done: #{misc.walltime(t_start)}s")
            opts.cb?(err)
        )


    stress2: (opts) =>
        opts = defaults opts,
            account_id : required
            changes    : undefined
            cb         : undefined
        dbg = (m) => winston.debug("stress2(#{opts.account_id}): #{m}")
        t0 = misc.walltime()
        dbg("get projects")
        @user_query
            account_id : opts.account_id
            query      : {projects:[{project_id:null, title:null, description:null, users:null}]}
            changes    : opts.changes
            cb         : (err, result) =>
                dbg("total time=#{misc.walltime(t0)}; got #{result.projects.length} projects with output having length #{JSON.stringify(result).length}")
                opts.cb?(err)

    stress3: (opts) =>
        opts = defaults opts,
            account_id : required
            changes    : undefined
            cb         : undefined
        dbg = (m) => winston.debug("stress3(#{opts.account_id}): #{m}")
        t0 = misc.walltime()
        dbg("get file_use")
        @user_query
            account_id : opts.account_id
            query      : {file_use:[{project_id:null, path:null, users:null, last_edited:null}]}
            changes    : opts.changes
            cb         : (err, result) =>
                dbg("total time=#{misc.walltime(t0)}; got #{result.file_use.length} last_use info with output having length #{JSON.stringify(result).length}")
                opts.cb?(err)

    stress3b: (opts) =>
        opts = defaults opts,
            account_id : required
            changes    : undefined
            cb         : undefined
        dbg = (m) => winston.debug("stress3b(#{opts.account_id}): #{m}")
        t0 = misc.walltime()
        ids = undefined
        async.series([
            (cb) =>
                dbg("get project ids")
                @table('projects').getAll(opts.account_id, index:'users').pluck('project_id').run (err, x) =>
                    dbg("got projects")
                    if err
                        cb(err)
                    else
                        ids = (y.project_id for y in x)
                        dbg("got #{ids.length} project_ids")
                        cb()
            (cb) =>
                dbg("get info about file use for these projects")
                @table('file_use').getAll(ids..., index:'project_id').pluck('project_id', 'path', 'users', 'last_edited').changes().run (err, x) =>
                    dbg("got file_use info; #{x?.length}  -- #{to_json(err)}")
                    cb(err)
        ], (err) =>
            opts.cb?(err)
        )

    stress3c: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        query = @table('projects').getAll(opts.account_id, index:'users').pluck('project_id')
        query = query.merge (project) =>
            {file_use: @table('file_use').getAll(project('project_id'), index:'project_id').coerceTo('array')}
        query.run (err, x) =>
            opts.cb?(err, x)

    stress3d: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        query = @table('projects').getAll(opts.account_id, index:'users').pluck('project_id')
        query = query.innerJoin @table('file_use'), (project, file_use) =>
            project('project_id').eq(file_use('project_id'))
        query.run (err, x) =>
            opts.cb?(err, x)

    stress3e: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        query = @table('projects').getAll(opts.account_id, index:'users').pluck('project_id')
        query = query.eqJoin('project_id', @table('file_use'), index:'project_id')
        query.run (err, x) =>
            opts.cb?(err, x)

    stress4: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : undefined
        dbg = (m) => winston.debug("stress4(#{opts.project_id}): #{m}")
        t0 = misc.walltime()
        dbg("get project_log")
        @user_query
            account_id : opts.account_id
            query      : {project_log:[{id:null, project_id:opts.project_id, time:null, account_id:null, event:null}]}
            cb         : (err, result) =>
                dbg("total time=#{misc.walltime(t0)}; ")
                opts.cb?(err, result)
    stress5: (opts) =>
        opts = defaults opts,
            account_id : required
            changes    : undefined
            cb         : undefined
        dbg = (m) => winston.debug("stress5(#{opts.account_id}): #{m}")
        t0 = misc.walltime()
        dbg("get projects")
        q = {}
        for k,_ of SCHEMA.projects.user_query.get.fields
            q[k] = null
        @user_query
            account_id : opts.account_id
            query      : {projects:[q]}
            changes    : opts.changes
            cb         : (err, result) =>
                dbg("total time=#{misc.walltime(t0)}; got #{result.projects.length} ")
                opts.cb?(err, result.projects)
    ###

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


###
SyncTable

Methods:
  - get():     Current value of the query, as an immutable.js Map from
               the primary key to the records, which are also immutable.js Maps.
  - get(key):  The record with given key, as an immutable Map; if key=undefined, returns full immutable.js map
  - getIn([key1,key2,...]):  as with immutable.js
  - has(key):  Whether or not record with this primary key exists.
  - close():   Frees up resources, stops syncing, don't use object further
  - wait(...): Until a condition is satisfied

Events:
  - 'change', primary_key : fired any time the value of the query result
        *changes* after initialization; where change includes deleting a record.

###

immutable = require('immutable')
EventEmitter = require('events')

# hackishly try to determine the most likely table of  query
# (some queries span tables, e.g., joins, so not always possible, right).
query_table = (query) ->
    s = query.toString()
    tbl = '.table("'
    i = s.indexOf(tbl)
    if i == -1
        return
    s = s.slice(i+tbl.length)
    i = s.indexOf('"')
    if i == -1
        return
    return s.slice(0,i)

synctable_changefeed_count = 0

class SyncTable extends EventEmitter
    constructor: (@_query, @_primary_key, @_db, @_idle_timeout_s, cb) ->
        @_id = misc.uuid().slice(0,8)    # purely to make logging easier
        @_table = query_table(@_query)   # undefined if can't determine
        dbg = @_dbg('constructor')
        dbg("query=#{@_query}")
        dbg("initializing changefeed")
        @_primary_key ?= SCHEMA[@_table]?.primary_key ? 'id'
        @_closed = true
        @connect(cb : cb)

    _init_idle_timeout: =>
        if not @_idle_timeout_s?
            return
        @_activity = () =>
            @_last_activity = new Date()
        @_activity()
        @_idle_timeout_interval = setInterval(@_disconnect_if_idle, 15000)

    _disconnect_if_idle: =>
        if not @_closed and (new Date() - @_last_activity > 1000*@_idle_timeout_s)
            @_dbg("_disconnect_if_idle")('disconnecting...')
            @close(true) # true = keep event listeners

    _reconnect: (cb) =>
        misc.retry_until_success
            start_delay : 3000
            max_time    : 1000*60*60   # by default, give up attempting to reconnect after 1 hour
            max_delay   : 30000
            f           : @_init_db
            cb          : cb

    # connect -- ensure that sync table is connected and ready to use; if you set
    # idle_timeout_interval, you should call connect immediately before
    # using any non-async get method below, and to start firing change
    # events again.
    connect: (opts) =>
        opts = defaults opts,
            cb : undefined   # cb(err, @)
        #dbg = @_dbg('connect')
        if @_connecting?
            #dbg("already connecting")
            @_connecting.push(opts.cb)
            return
        if @_closed
            #dbg("closed so connecting")
            @_connecting = [opts.cb]
            @_value = immutable.Map({})
            @on('disconnect', @connect)
            @_reconnect (err) =>
                if not err
                    @_closed = false
                    synctable_changefeed_count += 1
                    @_dbg('connect')("connected [#{synctable_changefeed_count} synctable-changefeeds]")
                    @_init_idle_timeout()
                v = @_connecting
                delete @_connecting
                #dbg("got connection (err=#{err}), len(v)=#{v.length}")
                for cb in v
                    #dbg("calling a callback (#{cb?})")
                    cb?(err, @)
        else
            #dbg("already connected")
            opts.cb?(undefined, @)

    get: (key) =>
        @_activity?()
        if not key?
            return @_value
        else
            return @_value?.get(key)

    getIn: (x) =>
        @_activity?()
        return @_value?.getIn(x)

    has: (key) =>
        @_activity?()
        return @_value?.has(key)

    close: (keep_listeners) =>
        dbg = @_dbg('close')
        if @_closed  # nothing further to do
            dbg("already closed")
            return
        dbg("closing...")
        if not keep_listeners
            @removeAllListeners()
        else
            @removeListener('disconnect', @connect)
        @_closed = true
        @_feed?.close()
        if @_idle_timeout_interval?
            clearInterval(@_idle_timeout_interval)
            delete @_idle_timeout_interval
        delete @_feed
        delete @_value
        delete @_last_activity
        delete @_activity
        synctable_changefeed_count -= 1
        dbg("closed [#{synctable_changefeed_count} synctable-changefeeds]")

    # wait until some function of this synctable is truthy
    wait: (opts) =>
        opts = defaults opts,
            until   : required     # waits until "until(@)" evaluates to something truthy
            timeout : 30           # in *seconds* -- set to 0 to disable (sort of DANGEROUS, obviously.)
            cb      : required     # cb(undefined, until(@)) on success and cb('timeout') on failure due to timeout
        @_activity?()
        @connect
            cb : (err) =>
                if err
                    opts.cb(err)
                    return
                x = opts.until(@)
                if x
                    opts.cb(undefined, x)  # already true
                    return
                fail_timer = undefined
                f = =>
                    x = opts.until(@)
                    if x
                        @removeListener('change', f)
                        if fail_timer? then clearTimeout(fail_timer)
                        opts.cb(undefined, x)
                @on('change', f)
                if opts.timeout
                    fail = =>
                        @removeListener('change', f)
                        opts.cb('timeout')
                    fail_timer = setTimeout(fail, 1000*opts.timeout)
                return

    _dbg: (f) =>
        return (m) => winston.debug("SyncTable(table='#{@_table}',id='#{@_id}').#{f}: #{m}")

    _init_db: (cb) =>
        dbg = @_dbg("_init_db")
        dbg()
        async.series([
            (cb) =>
                # make it so @_value starts getting updated
                dbg('create the changefeed')
                @_init_changefeed(cb)
            (cb) =>
                dbg('doing the query')
                @_get_value (err, value) =>
                    if err
                        cb(err)
                    else
                        dbg("merge in value")  # potential for race condition; have to wait for newer rethinkdb -- they have serious bugs
                        @_value = value.merge(@_value)
                        cb()
        ], cb)

    # cb(err, immutable js map with value of query from the db)
    _get_value: (cb) =>
        dbg = @_dbg("_get_value")
        dbg()
        @_query.run (err, results) =>
            if err
                dbg("fail: #{err}")
                cb(err)
            else
                dbg("init_value: got #{results.length} init values")
                t = {}
                if results
                    for x in results
                        t[x[@_primary_key]] = x
                cb(undefined, immutable.fromJS(t))

    # Creates a changefeed that updates @_value on changes and emits a 'disconnect' event
    # on db failure;  calls cb once the feed is running; cb(err) if can't setup changfeed.
    _init_changefeed: (cb) =>
        dbg = @_dbg("_init_changefeed")
        dbg()
        delete @_state
        dbg("trying to initialize changefeed")
        if @_feed?
            @_feed.close()
            delete @_feed
        @_query.changes(includeInitial:false, includeStates:false).run (err, feed) =>
            if err
                dbg("failed to start changefeed -- changes query failed: #{err}")
                cb(err)
            else
                dbg("successful initialization of feed; now start getting changes...")
                @_feed = feed # save to use in @close
                cb()
                feed.each (err, change) =>
                    if not @_value?
                        # a changefeed might send a little more information after it was closed; ignore it.
                        return
                    if err
                        @close(true)
                        @emit('disconnect')  # causes attempt to reconnect
                    else
                        if change.new_val?
                            # change or new
                            k = change.new_val[@_primary_key]
                            y = immutable.fromJS(change.new_val)
                            if not y.equals(@_value.get(k))
                                @_value = @_value.set(k, y)
                                process.nextTick(=>@emit('change', k))   # WARNING: don't remove this promise.nextTick! See above.
                        if change.old_val? and (not change.new_val? or change.new_val[@_primary_key] != change.old_val[@_primary_key])
                            # delete change.old_val
                            k = change.old_val[@_primary_key]
                            if @_value.get(k)?
                                # delete key
                                @_value = @_value.delete(k)
                                process.nextTick(=>@emit('change', k))


    # the correct official way to do this, which is randomly broken: https://github.com/rethinkdb/rethinkdb/issues/5210
    # Use the includeInitial:true, includeStates:true
    ###
    **NOT** USED RIGHT NOW -- should be completely rewritten.
    _init_changefeed_0: (cb) =>
        if @_closed
            return
        dbg = @_dbg("_init_changefeed_0")
        dbg("doing the query")
        wait = 0
        @_query.changes(includeInitial:true, includeStates:true).run (err, feed) =>
            if err
                dbg("failed to start changefeed: #{err}")
                if err.name == 'ReqlQueryLogicError'
                    dbg('terminating')
                    cb?(err)
                    cb = undefined
                else
                    wait = Math.random()*1000 + Math.min(15000, 1.3*wait)
                    dbg("will try again in #{wait/1000} seconds")
                    setTimeout(@_init_changefeed, wait)
            else
                dbg("did the initial query; now waiting for the ready state")
                wait = 0
                value = immutable.Map()
                @_feed = feed
                feed.each (err, change) =>
                    if err
                        feed.close()
                        wait = Math.random()*1000 + Math.min(15000, 1.3*wait)
                        dbg("error -- will try to recreate changefeed in #{wait/1000} seconds: #{err}")
                        setTimeout(@_init_changefeed, wait)
                    else
                        if change.state?
                            dbg("state change: state='#{change.state}'")
                            @_state = change.state
                            if @_state == 'ready'
                                if @_value?
                                    dbg("reconnect")
                                    # this is a reconnect so fire change event for all records that changed
                                    # keys that were there before and have changed:
                                    @_value.map (v, k) =>
                                        if not immutable.is(v, value.get(k))
                                            @emit('change', k)
                                    # new keys - not there before
                                    value.map (v, k) =>
                                        if not @_value.has(k)
                                            @emit('change', k)
                                @_value = value
                                if cb?
                                    dbg("calling cb()")
                                    cb()  # initialized!
                                    cb = undefined  # never again
                        if change.old_val? and not change.new_val?
                            k = change.old_val[@_primary_key]
                            value = value.delete(k)
                            if @_state == 'ready'
                                @_value = value
                                # WARNING!!!!! This process.nextTick is necessary; if you don't put it here
                                # the feed just stops after the first thing is emitted!!!!!  This would, of
                                # course, lead to very subtle bugs.  I don't understand this, but it is probably
                                # some subtle bug/issue involving bluebird promises and node's eventemitter...
                                process.nextTick(=>@emit('change', k))
                        if change.new_val?
                            k = change.new_val[@_primary_key]
                            value = value.set(k, immutable.fromJS(change.new_val))
                            if @_state == 'ready'
                                @_value = value
                                process.nextTick(=>@emit('change', k))   # WARNING: don't remove this promise.nextTick! See above.
    ####

_last_awaken_time = {}
awaken_project = (db, project_id) ->
    # throttle so that this gets called *for a given project* at most once every 30s.
    now = new Date()
    if _last_awaken_time[project_id]? and now - _last_awaken_time[project_id] < 30000
        return
    _last_awaken_time[project_id] = now
    dbg = (m) -> winston.debug("_awaken_project: #{m}")
    dbg("getting #{project_id}")
    db.compute_server.project
        project_id : project_id
        cb         : (err, project) =>
            if err
                dbg("err = #{err}")
            else
                dbg("requesting whole-project save of #{project_id}")
                project.save()  # this causes saves of all files to storage machines to happen periodically
                project.ensure_running
                    cb : (err) =>
                        if err
                            dbg("failed to ensure running of #{project_id}")
                        else
                            dbg("also make sure there is a connection from hub to project")
                            # This is so the project can find out that the user wants to save a file (etc.)
                            db.ensure_connection_to_project?(project_id)

