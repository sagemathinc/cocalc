#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# PostgreSQL -- basic queries and database interface

exports.DEBUG = true

# If database conection is non-responsive but no error raised directly
# by db client, then we will know and fix, rather than just sitting there...
DEFAULT_TIMEOUS_MS = 60000

# Do not test for non-responsiveness until a while after initial connection
# established, since things tend to work initially, *but* may also be much
# slower, due to tons of clients simultaneously connecting to DB.
DEFAULT_TIMEOUT_DELAY_MS = DEFAULT_TIMEOUS_MS * 4

QUERY_ALERT_THRESH_MS=5000

# this is a limit for each query, unless timeout_s is specified.
# https://postgresqlco.nf/en/doc/param/statement_timeout/
DEFAULT_STATEMENT_TIMEOUT_S = 30

EventEmitter = require('events')

fs      = require('fs')
async   = require('async')
escapeString = require('sql-string-escape')
validator = require('validator')
{callback2} = require('smc-util/async-utils')

LRU = require('lru-cache')

pg      = require('pg').native    # You might have to do: "apt-get install libpq5 libpq-dev"
if not pg?
    throw Error("YOU MUST INSTALL the pg-native npm module")
# You can uncommment this to use the pure javascript driver.
#  However: (1) it can be 5x slower or more!
#           (2) I think it corrupts something somehow in a subtle way, since our whole
#               syncstring system was breaking... until I switched to native.  Not sure.
#pg      = require('pg')

winston      = require('./logger').getLogger('postgres')
{do_query_with_pg_params} = require('./postgres/set-pg-params')

misc_node = require('smc-util-node/misc_node')

{defaults} = misc = require('smc-util/misc')
required = defaults.required

{SCHEMA, client_db} = require('smc-util/schema')

exports.PUBLIC_PROJECT_COLUMNS = ['project_id',  'last_edited', 'title', 'description', 'deleted',  'created', 'env']
exports.PROJECT_COLUMNS = ['users'].concat(exports.PUBLIC_PROJECT_COLUMNS)

{read_db_password_from_disk} = require('./utils')

class exports.PostgreSQL extends EventEmitter    # emits a 'connect' event whenever we successfully connect to the database and 'disconnect' when connection to postgres fails
    constructor: (opts) ->
        super()
        opts = defaults opts,
            host            : process.env['PGHOST'] ? 'localhost'    # or 'hostname:port' or 'host1,host2,...' (multiple hosts) -- TODO -- :port only works for one host.
            database        : process.env['SMC_DB'] ? 'smc'
            user            : process.env['PGUSER'] ? 'smc'
            debug           : exports.DEBUG
            connect         : true
            password        : undefined
            cache_expiry    : 5000  # expire cached queries after this many milliseconds
                                    # keep this very short; it's just meant to reduce impact of a bunch of
                                    # identical permission checks in a single user query.
            cache_size      : 300   # cache this many queries; use @_query(cache:true, ...) to cache result
            concurrent_warn : 500
            concurrent_heavily_loaded : 70 # when concurrent hits this, consider load "heavy"; this changes home some queries behave to be faster but provide less info
            ensure_exists   : true  # ensure database exists on startup (runs psql in a shell)
            timeout_ms      : DEFAULT_TIMEOUS_MS # **IMPORTANT: if *any* query takes this long, entire connection is terminated and recreated!**
            timeout_delay_ms : DEFAULT_TIMEOUT_DELAY_MS # Only reconnect on timeout this many ms after connect.  Motivation: on initial startup queries may take much longer due to competition with other clients.
        @setMaxListeners(10000)  # because of a potentially large number of changefeeds
        @_state = 'init'
        @_debug = opts.debug
        @_timeout_ms = opts.timeout_ms
        @_timeout_delay_ms = opts.timeout_delay_ms
        @_ensure_exists = opts.ensure_exists
        @_init_test_query()
        dbg = @_dbg("constructor")  # must be after setting @_debug above
        dbg(opts)
        i = opts.host.indexOf(':')
        if i != -1
            @_host = opts.host.slice(0, i)
            @_port = parseInt(opts.host.slice(i+1))
        else
            @_host = opts.host
            @_port = 5432
        @_concurrent_warn = opts.concurrent_warn
        @_concurrent_heavily_loaded = opts.concurrent_heavily_loaded
        @_user = opts.user
        @_database = opts.database
        @_password = opts.password ? read_db_password_from_disk()
        @_init_metrics()

        if opts.cache_expiry and opts.cache_size
            @_query_cache = new LRU({max:opts.cache_size, maxAge: opts.cache_expiry})
        if opts.connect
            @connect()  # start trying to connect

    clear_cache: =>
        @_query_cache?.reset()

    close: =>
        if @_state == 'closed'
            return  # nothing to do
        @_close_test_query()
        @_state = 'closed'
        @emit('close')
        @removeAllListeners()
        if @_clients?
            for client in @_clients
                client.removeAllListeners()
                client.end()
            delete @_clients

    ###
    If @_timeout_ms is set, then we periodically do a simple test query,
    to ensure that the database connection is working and responding to queries.
    If the query below times out, then the connection will get recreated.
    ###
    _do_test_query: =>
        dbg = @_dbg('test_query')
        dbg('starting')
        @_query
            query : 'SELECT NOW()'
            cb    : (err, result) =>
                dbg("finished", err, result)

    _init_test_query: =>
        if not @_timeout_ms
            return
        @_test_query = setInterval(@_do_test_query, @_timeout_ms)

    _close_test_query: =>
        if @_test_query?
            clearInterval(@_test_query)
            delete @_test_query

    engine: -> 'postgresql'

    connect: (opts) =>
        opts = defaults opts,
            max_time : undefined   # set to something shorter to not try forever
                                   # Only first max_time is used.
            cb       : undefined
        if @_state == 'closed'
            opts.cb?("closed")
            return
        dbg = @_dbg("connect")
        if @_clients?
            dbg("already connected")
            opts.cb?()
            return
        if @_connecting?
            dbg('already trying to connect')
            @_connecting.push(opts.cb)
            return
        dbg('will try to connect')
        @_state = 'init'
        if opts.max_time
            dbg("for up to #{opts.max_time}ms")
        else
            dbg("until successful")
        @_connecting = [opts.cb]
        misc.retry_until_success
            f           : @_connect
            max_delay   : 10000
            max_time    : opts.max_time
            start_delay : 500 + 500*Math.random()
            log         : dbg
            cb          : (err) =>
                v = @_connecting
                delete @_connecting
                for cb in v
                    cb?(err)
                if not err
                    @_state = 'connected'
                    @emit('connect')

    disconnect: () =>
        if @_clients?
            for client in @_clients
                client.end()
                client.removeAllListeners()
        delete @_clients

    is_connected: () =>
        return @_clients? and @_clients.length > 0

    _connect: (cb) =>
        dbg = @_dbg("_do_connect")
        dbg("connect to #{@_host}")
        @_clear_listening_state()   # definitely not listening
        if @_clients?
            @disconnect()
        locals =
            clients : []
            hosts   : []
        @_connect_time = 0
        @_concurrent_queries = 0  # can't be any going on now.
        async.series([
            (cb) =>
                if @_ensure_exists
                    dbg("first make sure db exists")
                    @_ensure_database_exists(cb)
                else
                    dbg("assuming database exists")
                    cb()
            (cb) =>
                if not @_host   # undefined if @_host=''
                    locals.hosts = [undefined]
                    cb()
                    return
                if @_host.indexOf('/') != -1
                    dbg("using a local socket file (not a hostname)")
                    locals.hosts = [@_host]
                    cb()
                    return
                f = (host, cb) =>
                    hostname = host.split(':')[0]
                    winston.debug("Looking up ip addresses of #{hostname}")
                    require('dns').lookup hostname, {all:true}, (err, ips) =>
                        if err
                            winston.debug("Got #{hostname} --> err=#{err}")
                            # NON-FATAL -- we just don't include these and hope to
                            # have at least one total working host...
                            cb()
                        else
                            winston.debug("Got #{hostname} --> #{JSON.stringify(ips)}")
                            # In kubernetes the stateful set service just has
                            # lots of ip address.  We connect to *all* of them,
                            # and spread queries across them equally.
                            for x in ips
                                locals.hosts.push(x.address)
                            cb()
                async.map(@_host.split(','), f, cb)
            (cb) =>
                dbg("connecting to #{JSON.stringify(locals.hosts)}...")
                if locals.hosts.length == 0
                    dbg("locals.hosts has length 0 -- no available db")
                    cb("no databases available")
                    return

                dbg("create client and start connecting...")
                locals.clients = []

                # Use a function to initialize the client, to avoid any
                # issues with scope of "client" below.
                init_client = (host) =>
                    client = new pg.Client
                        user     : @_user
                        host     : host
                        port     : @_port
                        password : @_password
                        database : @_database
                    if @_notification?
                        client.on('notification', @_notification)
                    client.on 'error', (err) =>
                        if @_state == 'init'
                            # already started connecting
                            return
                        @emit('disconnect')
                        dbg("error -- #{err}")
                        @disconnect()
                        @connect()  # start trying to reconnect
                    client.setMaxListeners(1000)  # there is one emitter for each concurrent query... (see query_cb)
                    locals.clients.push(client)

                for host in locals.hosts
                    init_client(host)

                # Connect the clients.  If at least one succeeds, we use this.
                # If none succeed, we declare failure.
                # Obviously, this is NOT optimal -- it's just hopefully sufficiently robust/works.
                # I'm going to redo this with experience.
                locals.clients_that_worked = []
                locals.errors = []
                f = (c) =>
                    try
                        await c.connect()
                        locals.clients_that_worked.push(c)
                    catch err
                        locals.errors.push(err)

                await Promise.all((f(c) for c in locals.clients))

                if locals.clients_that_worked.length == 0
                    dbg("ALL clients failed", locals.errors)
                    cb("ALL clients failed to connect")
                else
                    # take what we got
                    if locals.clients.length == locals.clients_that_worked.length
                        dbg("ALL clients worked")
                    else
                        dbg("ONLY #{locals.clients_that_worked.length} clients worked")
                    locals.clients = locals.clients_that_worked
                    cb()

            (cb) =>
                @_connect_time = new Date()
                locals.i = 0

                # Weird and unfortunate fact -- this query can and does **HANG** never returning
                # in some edge cases.  That's why we have to be paranoid about this entire _connect
                # function...
                f = (client, cb) =>
                    it_hung = =>
                        cb("hung")
                        cb = undefined
                    timeout = setTimeout(it_hung, 15000)
                    dbg("now connected; checking if we can actually query the DB via client #{locals.i}")
                    locals.i += 1
                    client.query "SELECT NOW()", (err) =>
                        clearTimeout(timeout)
                        cb(err)
                async.map(locals.clients, f, cb)
            (cb) =>
                # we set a statement_timeout, to avoid queries locking up PG
                f = (client, cb) =>
                    statement_timeout_ms = DEFAULT_STATEMENT_TIMEOUT_S * 1000 # in millisecs
                    client.query "SET statement_timeout TO #{statement_timeout_ms}", (err) =>
                        cb(err)
                async.map(locals.clients, f, cb)
            (cb) =>
                dbg("checking if ANY db server is in recovery, i.e., we are doing standby queries only")
                @is_standby = false
                f = (client, cb) =>
                    # Is this a read/write or read-only connection?
                    client.query "SELECT pg_is_in_recovery()", (err, resp) =>
                        if err
                            cb(err)
                        else
                            # True if ANY db connection is read only.
                            if resp.rows[0].pg_is_in_recovery
                                @is_standby = true
                            cb()
                async.map(locals.clients, f, cb)
        ], (err) =>
            if err
                mesg = "Failed to connect to database -- #{err}"
                dbg(mesg)
                console.warn(mesg)  # make it clear for interactive users with debugging off -- common mistake with env not setup right.
                cb?(err)
            else
                @_clients = locals.clients
                @_concurrent_queries = 0
                dbg("connected!")
                cb?(undefined, @)
        )

    # Return a native pg client connection.  This will
    # round robbin through all connections.  It returns
    # undefined if there are no connections.
    _client: =>
        if not @_clients?
            return
        if @_clients.length <= 1
            return @_clients[0]
        @_client_index ?= -1
        @_client_index = @_client_index + 1
        if @_client_index >= @_clients.length
            @_client_index = 0
        return @_clients[@_client_index]

    _dbg: (f) =>
        if @_debug
            return (m) => winston.debug("PostgreSQL.#{f}: #{misc.trunc_middle(JSON.stringify(m), 250)}")
        else
            return ->

    _init_metrics: =>
        # initialize metrics
        MetricsRecorder  = require('./metrics-recorder')
        @query_time_histogram = MetricsRecorder.new_histogram('db_query_ms_histogram', 'db queries'
            buckets : [1, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 10000]
            labels: ['table']
        )
        @concurrent_counter = MetricsRecorder.new_counter('db_concurrent_total',
            'Concurrent queries (started and finished)',
            ['state']
        )

    async_query: (opts) =>
        return await callback2(@_query.bind(@), opts)

    _query: (opts) =>
        opts  = defaults opts,
            query     : undefined    # can give select and table instead
            select    : undefined    # if given, should be string or array of column names  -|  can give these
            table     : undefined    # if given, name of table                              -|  two instead of query
            params    : []
            cache     : false        # Will cache results for a few seconds or use cache.  Use this
                                     # when speed is very important, and results that are a few seconds
                                     # out of date are fine.
            where     : undefined    # Used for SELECT: If given, can be
                                     #  - a map with keys clauses with $::TYPE  (not $1::TYPE!)  and values
                                     #    the corresponding params.  Also, WHERE must not be in the query already.
                                     #    If where[cond] is undefined, then cond is completely **ignored**.
                                     #  - a string, which is inserted as is as a normal WHERE condition.
                                     #  - an array of maps or strings.
            set       : undefined    # Appends a SET clause to the query; same format as values.
            values    : undefined    # Used for INSERT: If given, then params and where must not be given.   Values is a map
                                     # {'field1::type1':value, , 'field2::type2':value2, ...} which gets converted to
                                     # ' (field1, field2, ...) VALUES ($1::type1, $2::type2, ...) '
                                     # with corresponding params set.  Undefined valued fields are ignored and types may be omited.
            conflict  : undefined    # If given, then values must also be given; appends this to query:
                                     #     ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value'
                                     # Or, if conflict starts with "ON CONFLICT", then just include as is, e.g.,
                                     # "ON CONFLICT DO NOTHING"
            jsonb_set : undefined    # Used for setting a field that contains a JSONB javascript map.
                                     # Give as input an object
                                     #
                                     # { field1:{key1:val1, key2:val2, ...}, field2:{key3:val3,...}, ...}
                                     #
                                     # In each field, every key has the corresponding value set, unless val is undefined/null, in which
                                     # case that key is deleted from the JSONB object fieldi.  Simple as that!  This is much, much
                                     # cleaner to use than SQL.   Also, if the value in fieldi itself is NULL, it gets
                                     # created automatically.
            jsonb_merge : undefined  # Exactly like jsonb_set, but when val1 (say) is an object, it merges that object in,
                                     # *instead of* setting field1[key1]=val1.  So after this field1[key1] has what was in it
                                     # and also what is in val1.  Obviously field1[key1] had better have been an array or NULL.
            order_by    : undefined
            limit       : undefined
            offset      : undefined
            safety_check: true
            retry_until_success : undefined  # if given, should be options to misc.retry_until_success
            pg_params   : undefined  # key/value map of postgres parameters, which will be set for the query in a single transaction
            timeout_s   : undefined  # by default, there is a "statement_timeout" set. set to 0 to disable or a number in seconds
            cb          : undefined

        # quick check for write query against read-only connection
        if @is_standby and (opts.set? or opts.jsonb_set? or opts.jsonb_merge?)
            opts.cb?("set queries against standby not allowed")
            return

        if opts.retry_until_success
            @_query_retry_until_success(opts)
            return

        if not @is_connected()
            dbg = @_dbg("_query")
            dbg("connecting first...")
            @connect
                max_time : 45000    # don't try forever; queries could pile up.
                cb       : (err) =>
                    if err
                        dbg("FAILED to connect -- #{err}")
                        opts.cb?("database is down (please try later)")
                    else
                        dbg("connected, now doing query")
                        @__do_query(opts)
        else
            @__do_query(opts)

    _query_retry_until_success: (opts) =>
        retry_opts = opts.retry_until_success
        orig_cb = opts.cb
        delete opts.retry_until_success

        # f just calls @_do_query, but with a different cb (same opts)
        args = undefined
        f = (cb) =>
            opts.cb = (args0...) =>
                args = args0
                cb(args[0])
            @_query(opts)

        retry_opts.f = f
        # When misc.retry_until_success finishes, it calls this, which just
        # calls the original cb.
        retry_opts.cb = (err) =>
            if err
                orig_cb?(err)
            else
                orig_cb?(args...)

        # OK, now start it attempting.
        misc.retry_until_success(retry_opts)

    __do_query: (opts) =>
        dbg = @_dbg("_query('#{misc.trunc(opts.query?.replace(/\n/g, " "),250)}',id='#{misc.uuid().slice(0,6)}')")
        if not @is_connected()
            # TODO: should also check that client is connected.
            opts.cb?("client not yet initialized")
            return
        if opts.params? and not misc.is_array(opts.params)
            opts.cb?("params must be an array")
            return
        if not opts.query?
            if not opts.table?
                opts.cb?("if query not given, then table must be given")
                return
            if not opts.select?
                opts.select = '*'
            if misc.is_array(opts.select)
                opts.select = (quote_field(field) for field in opts.select).join(',')
            opts.query = "SELECT #{opts.select} FROM \"#{opts.table}\""
            delete opts.select

        push_param = (param, type) ->
            if type?.toUpperCase() == 'JSONB'
                param = misc.to_json(param)  # I don't understand why this is needed by the driver....
            opts.params.push(param)
            return opts.params.length

        if opts.jsonb_merge?
            if opts.jsonb_set?
                opts.cb?("if jsonb_merge is set then jsonb_set must not be set")
                return
            opts.jsonb_set = opts.jsonb_merge

        SET = []
        if opts.jsonb_set?
            # This little piece of very hard to write (and clever?) code
            # makes it so we can set or **merge in at any nested level** (!)
            # arbitrary JSON objects.  We can also delete any key at any
            # level by making the value null or undefined!  This is amazingly
            # easy to use in queries -- basically making JSONP with postgres
            # as expressive as RethinkDB REQL (even better in some ways).
            set = (field, data, path) =>
                obj = "COALESCE(#{field}#>'{#{path.join(',')}}', '{}'::JSONB)"
                for key, val of data
                    if not val?
                        # remove key from object
                        obj = "(#{obj} - '#{key}')"
                    else
                        if opts.jsonb_merge? and (typeof(val) == 'object' and not misc.is_date(val))
                            subobj = set(field, val, path.concat([key]))
                            obj    = "JSONB_SET(#{obj}, '{#{key}}', #{subobj})"
                        else
                            # completely replace field[key] with val.
                            obj = "JSONB_SET(#{obj}, '{#{key}}', $#{push_param(val, 'JSONB')}::JSONB)"
                return obj
            v = ("#{field}=#{set(field, data, [])}" for field, data of opts.jsonb_set)
            SET.push(v...)

        if opts.values?
            #dbg("values = #{misc.to_json(opts.values)}")
            if opts.where?
                opts.cb?("where must not be defined if opts.values is defined")
                return

            if misc.is_array(opts.values)
                # An array of numerous separate object that we will insert all at once.
                # Determine the fields, which as the union of the keys of all values.
                fields = {}
                for x in opts.values
                    if not misc.is_object(x)
                        opts.cb?("if values is an array, every entry must be an object")
                        return
                    for k, p of x
                        fields[k] = true
                # convert to array
                fields = misc.keys(fields)
                fields_to_index = {}
                n = 0
                for field in fields
                    fields_to_index[field] = n
                    n += 1
                values = []
                for x in opts.values
                    value = []
                    for field, param of x
                        if field.indexOf('::') != -1
                            [field, type] = field.split('::')
                            type = type.trim()
                            y = "$#{push_param(param, type)}::#{type}"
                        else
                            y = "$#{push_param(param)}"
                        value[fields_to_index[field]] = y
                    values.push(value)
            else
                # A single entry that we'll insert.

                fields = []
                values = []
                for field, param of opts.values
                    if not param? # ignore undefined fields -- makes code cleaner (and makes sense)
                        continue
                    if field.indexOf('::') != -1
                        [field, type] = field.split('::')
                        fields.push(quote_field(field.trim()))
                        type = type.trim()
                        values.push("$#{push_param(param, type)}::#{type}")
                        continue
                    else
                        fields.push(quote_field(field))
                        values.push("$#{push_param(param)}")
                values = [values]  # just one

            if values.length > 0
                opts.query += " (#{(quote_field(field) for field in fields).join(',')}) VALUES " + (" (#{value.join(',')}) " for value in values).join(',')

        if opts.set?
            v = []
            for field, param of opts.set
                if field.indexOf('::') != -1
                    [field, type] = field.split('::')
                    type = type.trim()
                    v.push("#{quote_field(field.trim())}=$#{push_param(param, type)}::#{type}")
                    continue
                else
                    v.push("#{quote_field(field.trim())}=$#{push_param(param)}")
            if v.length > 0
                SET.push(v...)

        if opts.conflict?
            if misc.is_string(opts.conflict) and misc.startswith(opts.conflict.toLowerCase().trim(), 'on conflict')
                # Straight string inclusion
                opts.query += ' ' + opts.conflict + ' '
            else
                if not opts.values?
                    opts.cb?("if conflict is specified then values must also be specified")
                    return
                if not misc.is_array(opts.conflict)
                    if typeof(opts.conflict) != 'string'
                        opts.cb?("conflict (='#{misc.to_json(opts.conflict)}') must be a string (the field name), for now")
                        return
                    else
                        conflict = [opts.conflict]
                else
                    conflict = opts.conflict
                v = ("#{quote_field(field)}=EXCLUDED.#{field}" for field in fields when field not in conflict)
                SET.push(v...)
                if SET.length == 0
                    opts.query += " ON CONFLICT (#{conflict.join(',')}) DO NOTHING "
                else
                    opts.query += " ON CONFLICT (#{conflict.join(',')}) DO UPDATE "

        if SET.length > 0
            opts.query += " SET " + SET.join(' , ')

        WHERE = []
        push_where = (x) =>
            if typeof(x) == 'string'
                WHERE.push(x)
            else if misc.is_array(x)
                for v in x
                    push_where(v)
            else if misc.is_object(x)
                for cond, param of x
                    if typeof(cond) != 'string'
                        opts.cb?("each condition must be a string but '#{cond}' isn't")
                        return
                    if not param?  # *IGNORE* where conditions where value is explicitly undefined
                        continue
                    if cond.indexOf('$') == -1
                        # where condition is missing it's $ parameter -- default to equality
                        cond += " = $"
                    WHERE.push(cond.replace('$', "$#{push_param(param)}"))

        if opts.where?
            push_where(opts.where)

        if WHERE.length > 0
            if opts.values?
                opts.cb?("values must not be given if where clause given")
                return
            opts.query += " WHERE #{WHERE.join(' AND ')}"

        if opts.order_by?
            if opts.order_by.indexOf("'") >= 0
                err = "ERROR -- detected ' apostrophe in order_by='#{opts.order_by}'"
                dbg(err)
                opts.cb?(err)
                return
            opts.query += " ORDER BY #{opts.order_by} "

        if opts.limit?
            if not validator.isInt('' + opts.limit, min:0)
                err = "ERROR -- opts.limit = '#{opts.limit}' is not an integer"
                dbg(err)
                opts.cb?(err)
                return
            opts.query += " LIMIT #{opts.limit} "

        if opts.offset?
            if not validator.isInt('' + opts.offset, min:0)
                err = "ERROR -- opts.offset = '#{opts.offset}' is not an integer"
                dbg(err)
                opts.cb?(err)
                return
            opts.query += " OFFSET #{opts.offset} "



        if opts.safety_check
            safety_check = opts.query.toLowerCase()
            if (safety_check.indexOf('update') != -1 or safety_check.indexOf('delete') != -1)  and  (safety_check.indexOf('where') == -1 and safety_check.indexOf('trigger') == -1  and safety_check.indexOf('insert') == -1 and safety_check.indexOf('create') == -1)
                # This is always a bug.
                err = "ERROR -- Dangerous UPDATE or DELETE without a WHERE, TRIGGER, or INSERT:  query='#{opts.query}'"
                dbg(err)
                opts.cb?(err)
                return

        if opts.cache and @_query_cache?
            # check for cached result
            full_query_string = JSON.stringify([opts.query, opts.params])
            if (x = @_query_cache.get(full_query_string))?
                dbg("using cache for '#{opts.query}'")
                opts.cb?(x...)
                return

        # params can easily be huge, e.g., a blob.  But this may be
        # needed at some point for debugging.
        #dbg("query='#{opts.query}', params=#{misc.to_json(opts.params)}")
        client = @_client()
        if not client?
            opts.cb?("not connected")
            return
        @_concurrent_queries ?= 0
        @_concurrent_queries += 1
        dbg("query='#{opts.query} (concurrent=#{@_concurrent_queries})'")

        @concurrent_counter?.labels('started').inc(1)
        try
            start = new Date()
            if @_timeout_ms and @_timeout_delay_ms
                # Create a timer, so that if the query doesn't return within
                # timeout_ms time, then the entire connection is destroyed.
                # It then gets recreated automatically.  I tested
                # and all outstanding queries also get an error when this happens.
                timeout_error = =>
                    # Only disconnect with timeout error if it has been sufficiently long
                    # since connecting.   This way when an error is triggered, all the
                    # outstanding timers at the moment of the error will just get ignored
                    # when they fire (since @_connect_time is 0 or too recent).
                    if @_connect_time and new Date() - @_connect_time > @_timeout_delay_ms
                        client.emit('error', 'timeout')
                timer = setTimeout(timeout_error, @_timeout_ms)

            # PAINFUL FACT: In client.query below, if the client is closed/killed/errored
            # (especially via client.emit above), then none of the callbacks from
            # client.query are called!
            finished = false
            error_listener = ->
                dbg("error_listener fired")
                query_cb('error')
            client.once('error', error_listener)
            query_cb = (err, result) =>
                if finished  # ensure no matter what that query_cb is called at most once.
                    dbg("called when finished (ignoring)")
                    return
                finished = true
                client.removeListener('error', error_listener)

                if @_timeout_ms
                    clearTimeout(timer)
                query_time_ms = new Date() - start
                @_concurrent_queries -= 1
                @query_time_histogram?.observe({table:opts.table ? ''}, query_time_ms)
                @concurrent_counter?.labels('ended').inc(1)
                if err
                    dbg("done (concurrent=#{@_concurrent_queries}), (query_time_ms=#{query_time_ms}) -- error: #{err}")
                    err = 'postgresql ' + err
                else
                    dbg("done (concurrent=#{@_concurrent_queries}) (query_time_ms=#{query_time_ms}) -- success")
                if opts.cache and @_query_cache?
                    @_query_cache.set(full_query_string, [err, result])
                opts.cb?(err, result)
                if query_time_ms >= QUERY_ALERT_THRESH_MS
                    dbg("QUERY_ALERT_THRESH: query_time_ms=#{query_time_ms}\nQUERY_ALERT_THRESH: query='#{opts.query}'\nQUERY_ALERT_THRESH: params='#{misc.to_json(opts.params)}'")

            if opts.timeout_s? and typeof opts.timeout_s == 'number' and opts.timeout_s >= 0
                dbg("set query timeout to #{opts.timeout_s}secs")
                opts.pg_params ?= {}
                # the actual param is in milliseconds
                # https://postgresqlco.nf/en/doc/param/statement_timeout/
                opts.pg_params.statement_timeout = 1000 * opts.timeout_s

            if opts.pg_params?
                dbg("run query with specific postgres parameters in a transaction")
                do_query_with_pg_params(client: client, query: opts.query, params: opts.params, pg_params:opts.pg_params, cb: query_cb)
            else
                client.query(opts.query, opts.params, query_cb)

        catch e
            # this should never ever happen
            dbg("EXCEPTION in client.query: #{e}")
            opts.cb?(e)
            @_concurrent_queries -= 1
            @concurrent_counter?.labels('ended').inc(1)
        return

    # Special case of query for counting entries in a table.
    _count: (opts) =>
        opts  = defaults opts,
            table : required
            where : undefined  # as in _query
            cb    : required
        @_query
            query : "SELECT COUNT(*) FROM #{opts.table}"
            where : opts.where
            cb    : count_result(opts.cb)

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

    _ensure_database_exists: (cb) =>
        dbg = @_dbg("_ensure_database_exists")
        dbg("ensure database '#{@_database}' exists")
        args = ['--user', @_user, '--host', @_host.split(',')[0], '--port', @_port, '--list', '--tuples-only']
        dbg("psql #{args.join(' ')}")
        misc_node.execute_code
            command : 'psql'
            args    : args
            env     :
                PGPASSWORD : @_password
            cb      : (err, output) =>
                if err
                    cb(err)
                    return
                databases = (x.split('|')[0].trim() for x in output.stdout.split('\n') when x)
                if @_database in databases
                    dbg("database '#{@_database}' already exists")
                    cb()
                    return
                dbg("creating database '#{@_database}'")
                misc_node.execute_code
                    command : 'createdb'
                    args    : ['--host', @_host, '--port', @_port, @_database]
                    cb      : cb

    _confirm_delete: (opts) =>
        opts = defaults opts,
            confirm : 'no'
            cb      : required
        dbg = @_dbg("confirm")
        if opts.confirm != 'yes'
            err = "Really delete all data? -- you must explicitly pass in confirm='yes' (but confirm:'#{opts.confirm}')"
            dbg(err)
            opts.cb(err)
            return false
        else
            return true

    set_random_password: (opts) =>
        throw Error("NotImplementedError")

    # This will fail if any other clients have db open.
    # This function is very important for automated testing.
    delete_entire_database: (opts) =>
        dbg = @_dbg("delete_entire_database")
        dbg("deleting database '#{@_database}'")
        if not @_confirm_delete(opts)
            dbg("failed confirmation")
            return
        async.series([
            (cb) =>
                dbg("disconnect from db")
                @disconnect()
                cb()
            (cb) =>
                misc_node.execute_code
                    command : 'dropdb'
                    args    : ['--host', @_host, '--port', @_port, @_database]
                    cb      : cb
        ], opts.cb)

    # Deletes all the contents of the tables in the database.  It doesn't
    # delete anything about the schema itself: indexes or tables.
    delete_all: (opts) =>
        dbg = @_dbg("delete_all")
        dbg("deleting all contents of tables in '#{@_database}'")
        if not @_confirm_delete(opts)
            return

        # If the cache is enabled, be sure to also clear it.
        @clear_cache()

        tables = undefined

        # Delete anything cached in the db object.  Obviously, not putting something here
        # is a natural place in which to cause bugs... but they will probably all be bugs
        # of the form "the test suite fails", so we'll find them.
        delete @_stats_cached

        # Actually delete tables
        async.series([
            (cb) =>
                @_get_tables (err, t) =>
                    tables = t; cb(err)
            (cb) =>
                f = (table, cb) =>
                    @_query
                        query        : "DELETE FROM #{table}"
                        safety_check : false
                        cb           : cb
                async.map(tables, f, cb)
        ], opts.cb)

    # return list of tables in the database
    _get_tables: (cb) =>
        @_query
            query : "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            cb    : (err, result) =>
                if err
                    cb(err)
                else
                    cb(undefined, (row.table_name for row in result.rows))

    # Return list of columns in a given table
    _get_columns: (table, cb) =>
        @_query
            query : "SELECT column_name FROM information_schema.columns"
            where :
                "table_name = $::text" : table
            cb    : (err, result) =>
                if err
                    cb(err)
                else
                    cb(undefined, (row.column_name for row in result.rows))

    _primary_keys: (table) =>
        return client_db.primary_keys(table)

    # Return *the* primary key, assuming unique; otherwise raise an exception.
    _primary_key: (table) =>
        v = @_primary_keys(table)
        if v.length != 1
            throw Error("compound primary key tables not yet supported")
        return v[0]

    _create_table: (table, cb) =>
        dbg = @_dbg("_create_table('#{table}')")
        dbg()
        schema = SCHEMA[table]
        if not schema?
            cb("no table '#{table}' in schema")
            return
        if schema.virtual
            cb("table '#{table}' is virtual")
            return
        columns = []
        try
            primary_keys = @_primary_keys(table)
        catch e
            cb(e)
            return
        for column, info of schema.fields
            s = "#{quote_field(column)} #{pg_type(info)}"
            if info.unique
                s += " UNIQUE"
            if info.pg_check
                s += " " + info.pg_check
            columns.push(s)
        async.series([
            (cb) =>
                dbg("creating the table")
                @_query
                    query  : "CREATE TABLE #{table} (#{columns.join(', ')}, PRIMARY KEY(#{primary_keys.join(', ')}))"
                    cb     : cb
            (cb) =>
                @_create_indexes(table, cb)
        ], cb)

    _create_indexes_queries: (table) =>
        schema = SCHEMA[table]
        v = schema.pg_indexes ? []
        if schema.fields.expire? and 'expire' not in v
            v.push('expire')
        queries = []
        for query in v
            name = "#{table}_#{misc.make_valid_name(query)}_idx"  # this first, then...
            if query.indexOf('(') == -1                           # do this **after** making name.
                query = "(#{query})"
            queries.push({name:name, query:query})
        return queries

    _create_indexes: (table, cb) =>
        dbg = @_dbg("_create_indexes('#{table}')")
        dbg()
        pg_indexes = @_create_indexes_queries(table)
        if pg_indexes.length == 0
            dbg("no indexes")
            cb()
            return
        dbg("creating indexes")
        f = (info, cb) =>
            query = info.query
            # Shorthand index is just the part in parens.
            # 2020-10-12: it makes total sense to add CONCURRENTLY to this index command to avoid locking up the table,
            # but the first time we tried this in production (postgres 10), it just made "invalid" indices.
            # the problem might be that several create index commands were issued rapidly, which trew this off
            # So, for now, it's probably best to either create them manually first (concurrently) or be
            # aware that this does lock up briefly.
            query = "CREATE INDEX #{info.name} ON #{table} #{query}"
            @_query
                query : query
                cb    : cb
        async.map(pg_indexes, f, cb)

    # Ensure that for the given table, the actual schema and indexes
    # in the database matches the one defined in SCHEMA.
    _update_table_schema: (table, cb) =>
        dbg = @_dbg("_update_table_schema('#{table}')")
        dbg()
        schema = SCHEMA[table]
        if not schema?  # some auxiliary table in the database not in our schema -- leave it alone!
            cb()
            return
        if schema.virtual
            dbg("nothing to do -- table is virtual");
            cb()
            return
        async.series([
            (cb) => @_update_table_schema_columns(table, cb)
            (cb) => @_update_table_schema_indexes(table, cb)
        ], cb)

    _update_table_schema_columns: (table, cb) =>
        dbg = @_dbg("_update_table_schema_columns('#{table}')")
        dbg()
        schema   = SCHEMA[table]
        columns  = {}
        async.series([
            (cb) =>
                @_query
                    query : "select column_name, data_type, character_maximum_length from information_schema.columns"
                    where : {table_name: table}
                    cb    : all_results (err, x) =>
                        if err
                            cb(err)
                        else
                            for y in x
                                if y.character_maximum_length
                                    columns[y.column_name] = "varchar(#{y.character_maximum_length})"
                                else
                                    columns[y.column_name] = y.data_type
                            cb()
            (cb) =>
                # Note: changing column ordering is NOT supported in PostgreSQL, so
                # it's critical to not depend on it!
                # https://wiki.postgresql.org/wiki/Alter_column_position
                tasks = []
                for column, info of schema.fields
                    cur_type  = columns[column]?.toLowerCase()
                    if cur_type?
                        cur_type = cur_type.split(' ')[0]
                    try
                        goal_type = pg_type(info).toLowerCase()
                    catch err
                        cb(err)
                        return
                    goal_type = goal_type.split(' ')[0]
                    if goal_type.slice(0,4) == 'char'
                        # we do NOT support changing between fixed length and variable length strength
                        goal_type = 'var' + goal_type
                    if not cur_type?
                        # column is in our schema, but not in the actual database
                        dbg("will add column '#{column}' to the database")
                        tasks.push({action:'add', column:column})
                    else if cur_type != goal_type
                        if goal_type.indexOf('[]') != -1
                            # NO support for array schema changes (even detecting)!
                            continue
                        dbg("type difference for column '#{column}' -- cur='#{cur_type}' versus goal='#{goal_type}'")
                        tasks.push({action:'alter', column:column})
                # Note: we do not delete columns in the database, since that's scary
                # and they don't cause any harm (except wasting space).

                if tasks.length == 0
                    dbg("no changes to table are needed")
                    cb()
                    return
                dbg("#{tasks.length} columns will be altered")
                do_task = (task, cb) =>
                    info = schema.fields[task.column]
                    col  = quote_field(task.column)
                    try
                        type = pg_type(info)
                    catch err
                        cb(err)
                        return
                    desc = type
                    if info.unique
                        desc += " UNIQUE"
                    if info.pg_check
                        desc += " " + info.pg_check
                    # Disable the safety_checks since we know these are
                    # fine and they can be hit, e.g., when adding a column
                    # named "deleted"...
                    switch task.action
                        when 'alter'
                            @_query
                                safety_check : false
                                query : "ALTER TABLE #{quote_field(table)} ALTER COLUMN #{col} TYPE #{desc} USING #{col}::#{type}"
                                cb    : cb
                        when 'add'
                            @_query
                                safety_check : false
                                query : "ALTER TABLE #{quote_field(table)} ADD COLUMN #{col} #{desc}"
                                cb    : cb
                        else
                            cb("unknown action '#{task.action}")
                async.mapSeries(tasks, do_task, cb)
        ], (err) -> cb?(err))

    _update_table_schema_indexes: (table, cb) =>
        dbg = @_dbg("_update_table_schema_indexes('#{table}')")
        cur_indexes = {}
        async.series([
            (cb) =>
                dbg("getting list of existing indexes")
                @_query   # See http://www.alberton.info/postgresql_meta_info.html#.WIfyPLYrLdQ
                    query : "SELECT c.relname AS name FROM pg_class AS a JOIN pg_index AS b ON (a.oid = b.indrelid) JOIN pg_class AS c ON (c.oid = b.indexrelid)"
                    where : {'a.relname': table}
                    cb    : all_results 'name', (err, x) =>
                        if err
                            cb(err)
                        else
                            for name in x
                                cur_indexes[name] = true
                            cb()
            (cb) =>
                # these are the indexes we are supposed to have
                goal_indexes = @_create_indexes_queries(table)
                goal_indexes_map = {}
                tasks = []
                for x in goal_indexes
                    goal_indexes_map[x.name] = true
                    if not cur_indexes[x.name]
                        tasks.push({action:'create', name:x.name, query:x.query})
                for name of cur_indexes
                    # only delete indexes that end with _idx; don't want to delete, e.g., pkey primary key indexes.
                    if misc.endswith(name, '_idx') and not goal_indexes_map[name]
                        tasks.push({action:'delete', name:name})
                do_task = (task, cb) =>
                    switch task.action
                        when 'create'
                            # ATTN if you consider adding CONCURRENTLY to create index, read the note earlier above about this
                            @_query
                                query : "CREATE INDEX #{task.name} ON #{table} #{task.query}"
                                cb    : cb
                        when 'delete'
                            @_query
                                query : "DROP INDEX #{task.name}"
                                cb    : cb
                        else
                            cb("unknown action '#{task.action}")
                async.map(tasks, do_task, cb)
        ], (err) -> cb?(err))

    _throttle: (name, time_s, key...) =>
        key = misc.to_json(key)
        x = "_throttle_#{name}"
        @[x] ?= {}
        if @[x][key]
            return true
        @[x][key] = true
        setTimeout((()=>delete @[x]?[key]), time_s*1000)
        return false

    # Ensure that the actual schema in the database matches the one defined in SCHEMA.
    # This creates the initial schema, adds new columns fine, and in a VERY LIMITED
    # range of cases, *might be* be able to change the data type of a column.
    update_schema: (opts) =>
        opts = defaults opts,
            cb : undefined
        dbg = @_dbg("update_schema"); dbg()

        psql_tables = goal_tables = created_tables = undefined
        async.series([
            (cb) =>
                # Get a list of all tables that should exist
                dbg("get tables")
                @_get_tables (err, t) =>
                    psql_tables = t
                    dbg("psql_tables = #{misc.to_json(psql_tables)}")
                    goal_tables = (t for t,s of SCHEMA when t not in psql_tables and not s.virtual and s.durability != 'ephemeral')
                    dbg("goal_tables = #{misc.to_json(goal_tables)}")
                    cb(err)
            (cb) =>
                # Create from scratch any missing tables -- usually this creates all tables and
                # indexes the first time around.
                to_create = (table for table in goal_tables when table not in psql_tables)
                created_tables = {}
                for table in to_create
                    created_tables[table] = true
                if to_create.length == 0
                    dbg("there are no missing tables in psql")
                    cb()
                    return
                dbg("creating #{to_create.length} missing tables")
                async.map to_create, @_create_table, (err) =>
                    if err
                        dbg("error creating tables -- #{err}")
                    cb(err)
            (cb) =>
                # For each table that already exists, ensure that the columns are correct,
                # have the correct type, and all indexes exist.
                old_tables = (table for table in psql_tables when not created_tables[table])
                if old_tables.length == 0
                    dbg("no old tables to update")
                    cb()
                    return
                dbg("verifying schema and indexes for #{old_tables.length} existing tables")
                async.map old_tables, @_update_table_schema, (err) =>
                    if err
                        dbg("error updating table schemas -- #{err}")
                    cb(err)
        ], (err) => opts.cb?(err))

    # Return the number of outstanding concurrent queries.
    concurrent: =>
        return @_concurrent_queries ? 0

    is_heavily_loaded: =>
        return @_concurrent_queries >= @_concurrent_heavily_loaded

    # Compute the sha1 hash (in hex) of the input arguments, which are
    # converted to strings (via json) if they are not strings, then concatenated.
    # This is used for computing compound primary keys in a way that is relatively
    # safe, and in situations where if there were a highly unlikely collision, it
    # wouldn't be the end of the world.  There is a similar client-only slower version
    # of this function (in schema.coffee), so don't change it willy nilly.
    sha1: (args...) ->
        v = ((if typeof(x) == 'string' then x else JSON.stringify(x)) for x in args).join('')
        return misc_node.sha1(v)

    # Go through every table in the schema with a column called "expire", and
    # delete every entry where expire is <= right now.
    delete_expired: (opts) =>
        opts = defaults opts,
            count_only : false      # if true, only count the number of rows that would be deleted
            table      : undefined  # only delete from this table
            cb         : required
        dbg = @_dbg("delete_expired(...)")
        dbg()
        f = (table, cb) =>
            dbg("table='#{table}'")
            if opts.count_only
                @_query
                    query : "SELECT COUNT(*) FROM #{table} WHERE expire <= NOW()"
                    cb    : (err, result) =>
                        if not err
                            dbg("COUNT for table #{table} is #{result.rows[0].count}")
                        cb(err)
            else
                dbg("deleting expired entries from '#{table}'")
                @_query
                    query : "DELETE FROM #{table} WHERE expire <= NOW()"
                    cb    : (err) =>
                        dbg("finished deleting expired entries from '#{table}' -- #{err}")
                        cb(err)
        if opts.table
            tables = [opts.table]
        else
            tables = (k for k, v of SCHEMA when v.fields?.expire? and not v.virtual)
        async.map(tables, f, opts.cb)

    # count number of entries in a table
    count: (opts) =>
        opts = defaults opts,
            table : required
            cb    : required
        @_query
            query : "SELECT COUNT(*) FROM #{opts.table}"
            cb    : count_result(opts.cb)

    # sanitize strings before inserting them into a query string
    sanitize: (s) =>
        escapeString(s)

###
Other misc functions
###

# Convert from info in the schema table to a pg type
# See https://www.postgresql.org/docs/devel/static/datatype.html
# The returned type from this function is upper case!
exports.pg_type = pg_type = (info) ->
    if not info? or typeof(info) == 'boolean'
        throw Error("pg_type: insufficient information to determine type (info=#{typeof(info)})")
    if info.pg_type?
        return info.pg_type
    if not info.type?
        throw Error("pg_type: insufficient information to determine type (pg_type and type both not given)")
    type = info.type.toLowerCase()
    switch type
        when 'uuid'
            return 'UUID'
        when 'timestamp'
            return 'TIMESTAMP'
        when 'date'
            return 'DATE'
        when 'string', 'text'
            return 'TEXT'
        when 'boolean'
            return 'BOOLEAN'
        when 'map'
            return 'JSONB'
        when 'integer'
            return 'INTEGER'
        when 'number'
            return 'DOUBLE PRECISION'
        when 'array'
            throw Error("pg_type: you must specify the array type explicitly (info=#{misc.to_json(info)})")
        when 'buffer'
            return "BYTEA"
        else
            throw Error("pg_type: unknown type '#{type}'")

# Certain field names we used with RethinkDB
# aren't allowed without quoting in Postgres.
NEEDS_QUOTING =
    user : true
exports.quote_field = quote_field = (field) ->
    if field[0] == '"'  # already quoted
        return field
    return "\"#{field}\""
    #if NEEDS_QUOTING[field]
    #    return "\"#{field}\""
    #return field

# Timestamp the given number of seconds **in the future**.
exports.expire_time = expire_time = (ttl) ->
    if ttl then new Date((new Date() - 0) + ttl*1000)

# Returns a function that takes as input the output of doing a SQL query.
# If there are no results, returns undefined.
# If there is exactly one result, what is returned depends on pattern:
#     'a_field' --> returns the value of this field in the result
# If more than one result, an error
exports.one_result = one_result = (pattern, cb) ->
    if not cb? and typeof(pattern) == 'function'
        cb = pattern
        pattern = undefined
    if not cb?
        return ->  # do nothing -- return function that ignores result
    return (err, result) ->
        if err
            cb(err)
            return
        if not result?.rows?
            cb()
            return
        switch result.rows.length
            when 0
                cb()
            when 1
                obj = misc.map_without_undefined(result.rows[0])
                if not pattern?
                    cb(undefined, obj)
                    return
                switch typeof(pattern)
                    when 'string'
                        x = obj[pattern]
                        if not x?  # null or undefined -- SQL returns null, but we want undefined
                            cb()
                        else
                            if obj.expire? and new Date() >= obj.expire
                                cb()
                            else
                                cb(undefined, x)
                    when 'object'
                        x = {}
                        for p in pattern
                            if obj[p]?
                                x[p] = obj[p]
                        cb(undefined, x)
                    else
                        cb("BUG: unknown pattern -- #{pattern}")
            else
                cb("more than one result")

exports.all_results = all_results = (pattern, cb) ->
    if not cb? and typeof(pattern) == 'function'
        cb = pattern
        pattern = undefined
    if not cb?
        return ->  # do nothing -- return function that ignores result
    return (err, result) ->
        if err
            cb(err)
        else
            rows = result.rows
            if not pattern?
                # TODO: we use stupid (?) misc.copy to unwrap from pg driver type -- investigate better!
                # Maybe this is fine.  I don't know.
                cb(undefined, (misc.copy(x) for x in rows))
            else if typeof(pattern) == 'string'
                cb(undefined, ((x[pattern] ? undefined) for x in rows))
            else
                cb("unsupported pattern type '#{typeof(pattern)}'")


exports.count_result = count_result = (cb) ->
    if not cb?
        return ->  # do nothing -- return function that ignores result
    return (err, result) ->
        if err
            cb(err)
        else
            cb(undefined, parseInt(result?.rows?[0]?.count))
