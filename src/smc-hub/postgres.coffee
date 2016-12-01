###
Similar to rethink.coffee... but built around PostgreSQL.

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) SageMath, Inc.
**
---

p = (require('./postgres')).pg()

---

NOTES:

  - Some of the methods in the main class below are also in rethink.coffee.
    Since rethink will likely get deleted once postgres is up and running,
    this doesn't concern me.
  - In the first pass, I'm not worrying about indexes.  This may hurt
    scalable performance.
###

# standard lib
EventEmitter = require('events')
fs           = require('fs')

# third party modules
pg      = require('pg')
async   = require('async')
winston = require('winston')

winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

# smc modules
misc_node  = require('smc-util-node/misc_node')
{defaults} = misc = require('smc-util/misc')
required   = defaults.required

# TODO: this is purely for interactive debugging -- remove later.
global.done = global.d = misc.done

# Bucket used for cheaper longterm storage of blobs (outside of rethinkdb).
# NOTE: We should add this to site configuration, and have it get read once when first
# needed and cached.  Also it would be editable in admin account settings.
BLOB_GCLOUD_BUCKET = 'smc-blobs'

{SCHEMA, DEFAULT_QUOTAS, PROJECT_UPGRADES, COMPUTE_STATES, RECENT_TIMES, RECENT_TIMES_KEY, site_settings_conf} = require('smc-util/schema')


exports.pg = (opts) ->
    return new PostgreSQL(opts)

class PostgreSQL
    constructor: (opts) ->
        opts = defaults opts,
            host     : 'localhost'
            database : 'smc'
            port     : 5432
            debug    : true
            cb       : undefined
        @_debug    = opts.debug
        @_host     = opts.host
        @_port     = opts.port
        @_database = opts.database
        @_concurrent_queries = 0
        @_connect(opts.cb)

    _connect: (cb) =>
        dbg = @_dbg("connect"); dbg()
        async.series([
            (cb) =>
                if @_client?
                    @_client.end(cb)
                else
                    cb()
            (cb) =>
                @_concurrent_queries = 0
                dbg("first make sure db exists")
                @_ensure_database_exists(cb)
            (cb) =>
                @_client = new pg.Client
                    host     : @_host
                    port     : @_port
                    database : @_database
                @_client.on('notification', @_notification)
                @_client.connect(cb)
        ], (err) =>
            if err
                dbg("Failed to connect to database -- #{err}")
                cb?(err)
            else
                dbg("connected!")
                cb?(undefined, @)
        )

    _dbg: (f) =>
        if @_debug
            return (m) => winston.debug("PostgreSQL.#{f}: #{m}")
        else
            return ->

    _notification: (mesg) =>
        dbg = @_dbg("_notification")
        dbg("mesg #{misc.to_json(mesg)}")

    _query: (opts) =>
        opts  = defaults opts,
            query     : required
            params    : []
            where     : undefined    # Used for SELECT: If given, must be a map with keys clauses with $::TYPE  (not $1::TYPE!)
                                     # and values the corresponding params.  Also, WHERE must not be in the query already.
                                     # If where[cond] is undefined, then cond is completely **ignored**.
            set       : undefined    # Appends a SET clause to the query; same format as values.
            values    : undefined    # Used for INSERT: If given, then params and where must not be given.   Values is a map
                                     # {'field1::type1':value, , 'field2::type2':value2, ...} which gets converted to
                                     # ' (field1, field2, ...) VALUES ($1::type1, $2::type2, ...) '
                                     # with corresponding params set.  Undefined valued fields are ignored and types may be omited.
            conflict  : undefined    # If given, then values must also be given; appends this to query:
                                     #     ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value'
            jsonb_set : undefined    # Used for setting a field that contains a JSONB javascript map.
                                     # Give as input an object
                                     #
                                     # { field1:{key1:val1, key2:val2, ...}, field2:{key3:val3,...}, ...}
                                     #
                                     # In each field, every key has the corresponding value set, unless val is undefined/null, in which
                                     # case that key is deleted from the JSONB object fieldi.  Simple as that!  This is much, much
                                     # cleaner to use than SQL.   Also, if the value in fieldi itself is NULL, it gets
                                     # created automatically.
            jsonb_merge : undefined  # Exactly lke jsonb_set, but when val1 (say) is an object, it merges that object in,
                                     # *instead of* setting field1[key1]=val1.  So after this field1[key1] has what was in it
                                     # and also what is in val1.  Obviously field1[key1] had better have been an array or NULL.
            cb     : required
        dbg = @_dbg("_query('#{opts.query}') (concurrent=#{@_concurrent_queries})")
        dbg()
        if opts.params? and not misc.is_array(opts.params)
            opts.cb("params must be an array")
            return

        push_param = (param, type) ->
            if type?.toUpperCase() == 'JSONB'
                param = misc.to_json(param)  # I don't understand why this is needed by the driver....
            opts.params.push(param)
            return opts.params.length

        if opts.jsonb_merge?
            if opts.jsonb_set?
                opts.cb("if jsonb_merge is set then jsonb_set must not be set")
                return
            opts.jsonb_set = opts.jsonb_merge

        if opts.jsonb_set?
            # This little piece of very hard to write (and clever?) code
            # makes it so we can set or **merge in at any nested level (!)
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
                        if opts.jsonb_merge? and typeof(val) == 'object'
                            subobj = set(field, val, path.concat([key]))
                            obj    = "JSONB_SET(#{obj}, '{#{key}}', #{subobj})"
                        else
                            # completely replace field[key] with val.
                            obj = "JSONB_SET(#{obj}, '{#{key}}', $#{push_param(val, 'JSONB')}::JSONB)"
                return obj
            v = ("#{field}=#{set(field, data, [])}" for field, data of opts.jsonb_set)
            opts.query += " SET " + v.join(' , ')

        if opts.values?
            if opts.where?
                opts.cb("where must not be defined if opts.values is defined")
                return
            fields = []
            values = []
            for field, param of opts.values
                if not param? # ignore undefined fields -- makes code cleaner (and makes sense)
                    continue
                if field.indexOf('::') != -1
                    [field, type] = field.split('::')
                    fields.push(field.trim())
                    type = type.trim()
                    values.push("$#{push_param(param, type)}::#{type}")
                    continue
                else
                    fields.push(field)
                    values.push("$#{push_param(param)}")
            opts.query += " (#{fields.join(', ')}) VALUES (#{values.join(', ')}) "

        if opts.set?
            v = []
            for field, param of opts.set
                if field.indexOf('::') != -1
                    [field, type] = field.split('::')
                    type = type.trim()
                    v.push("#{field.trim()}=$#{push_param(param, type)}::#{type}")
                    continue
                else
                    v.push("#{field.trim()}=$#{push_param(param)}")
            if v.length > 0
                opts.query += " SET #{v.join(', ')} "

        if opts.conflict?
            if not opts.values?
                opts.cb("if conflict is specified then values must also be specified")
                return
            if typeof(opts.conflict) != 'string'
                opts.cb("conflict must be a string (the field name), for now")
                return
            set = ("#{field}=EXCLUDED.#{field}" for field in fields when field != opts.conflict)
            opts.query += " ON CONFLICT (#{opts.conflict}) DO UPDATE SET #{set.join(', ')} "

        if opts.where?
            if typeof(opts.where) != 'object'
                opts.cb("where must be an object")
                return
            if opts.values?
                opts.cb("values must not be given if where clause is given")
                return
            z = []
            for cond, param of opts.where
                if typeof(cond) != 'string'
                    opts.cb("each condition must be a string but '#{cond}' isn't")
                    return
                if not param?
                    continue
                z.push(cond.replace('$', "$#{push_param(param)}"))
            if z.length > 0
                opts.query += " WHERE #{z.join(' AND ')}"

        dbg("query='#{opts.query}', params=#{misc.to_json(opts.params)}")

        @_concurrent_queries += 1
        try
            @_client.query opts.query, opts.params, (err, result) =>
                @_concurrent_queries -= 1
                if err
                    dbg("done (concurrent=#{@_concurrent_queries}) -- error: #{err}")
                else
                    dbg("done (concurrent=#{@_concurrent_queries}) -- success")
                opts.cb?(err, result)
        catch e
            # this should never ever happen
            dbg("EXCEPTION in @_client.query: #{e}")
            @_concurrent_queries -= 1
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
                        opts.cb?("invalid uuid #{w} in #{k} -- #{to_json(v)}")
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
        misc_node.execute_code
            command : 'psql'
            args    : ['--host', @_host, '--port', @_port,
                       '--list', '--tuples-only']
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
                @_client.end(cb)
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
        tables = undefined
        async.series([
            (cb) =>
                @_get_tables (err, t) =>
                    tables = t; cb(err)
            (cb) =>
                f = (table, cb) =>
                    @_query
                        query : "DELETE FROM #{table}"
                        cb    : cb
                async.map(tables, f, cb)
        ], opts.cb)

    _ensure_trigger_exists: (table, columns, cb) =>
        dbg = @_dbg("_ensure_trigger_exists(#{table})")
        dbg("columns=#{misc.to_json(columns)}")
        tgname = trigger_name(table)
        trigger_exists = undefined
        async.series([
            (cb) =>
                dbg("checking whether or not trigger exists")
                @_query
                    query : "SELECT count(*) FROM pg_trigger WHERE tgname = '#{tgname}'"
                    cb    : (err, result) =>
                        if err
                            cb(err)
                        else
                            trigger_exists = parseInt(result.rows[0].count) > 0
                            cb()
            (cb) =>
                if trigger_exists
                    dbg("trigger #{tgname} already exists")
                    cb()
                    return
                dbg("creating trigger #{tgname}")
                @_query
                    query : trigger_code(table, columns)
                    cb    : cb
        ], cb)

    _listen: (table, columns, cb) =>
        dbg = @_dbg("_listen(#{table})")
        @_listening ?= {}
        if @_listening[table]
            dbg("already listening")
            cb?()
            return
        async.series([
            (cb) =>
                dbg("ensure trigger exists")
                @_ensure_trigger_exists(table, columns, cb)
            (cb) =>
                dbg("add listener")
                @_query
                    query : "LISTEN changes_#{table}"
                    cb    : cb
        ], (err) =>
            if err
                dbg("fail: err = #{err}")
                cb?(err)
            else
                @_listening[table] = true
                dbg("success")
                cb?()
        )

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
        primary_keys = []
        for column, info of schema.fields
            if info.deprecated
                continue
            if typeof(info.pg_type) == 'object'
                # compound primary key
                for field, type of info.pg_type
                    columns.push("#{quote_field(field)} #{type}")
                    primary_keys.push(field)
                continue
            s = "#{quote_field(column)} #{pg_type(info)}"
            if info.unique
                s += " UNIQUE"
            if schema.primary_key == column
                primary_keys.push(column)
            columns.push(s)
        if primary_keys.length == 0
            cb("ERROR creating table '#{table}': a valid primary key must be specified -- #{schema.primary_key}")
            return
        async.series([
            (cb) =>
                dbg("creating the table")
                @_query
                    query  : "CREATE TABLE #{table} (#{columns.join(', ')}, PRIMARY KEY(#{primary_keys.join(', ')}))"
                    cb     : cb
            (cb) =>
                @_create_indexes(cb)
        ], cb)

    _create_indexes: (table, cb) =>
        dbg = @_dbg("_create_indexes('#{table}')")
        dbg()
        schema = SCHEMA[table]
        if not schema.pg_indexes?
            dbg("no indexes defined")
            cb()
            return
        dbg("creating indexes")
        f = (query, cb) =>
            s = query.toLowerCase()
            if s.indexOf('create') == -1 or s.indexOf('index') == -1
                # Shorthand index is just the part in parens.
                # Schema can also give a full create index command.
                query = "CREATE INDEX ON #{table} (#{query})"
            @_query
                query : query
                cb    : cb
        async.map(schema.pg_indexes, f, cb)


    # Ensure that the actual schema in the database matches the one defined in SCHEMA.
    # TODO: we do NOT do anything related to the actual columns or datatypes yet!
    update_schema: (opts) =>
        opts = defaults opts,
            cb : undefined
        dbg = @_dbg("update_schema"); dbg()

        psql_tables = goal_tables = undefined
        async.series([
            (cb) =>
                dbg("get tables")
                @_get_tables (err, t) =>
                    psql_tables = t
                    dbg("psql_tables = #{misc.to_json(psql_tables)}")
                    goal_tables = (t for t,s of SCHEMA when t not in psql_tables and not s.virtual)
                    dbg("goal_tables = #{misc.to_json(goal_tables)}")
                    cb(err)
            (cb) =>
                to_create = (table for table in goal_tables when table not in psql_tables)
                if to_create.length == 0
                    dbg("there are no missing tables in psql")
                    cb()
                    return
                async.map to_create, @_create_table, (err) =>
                    if err
                        dbg("error creating tables -- #{err}")
                    cb(err)
        ], (err) => opts.cb?(err))

    # Return the number of outstanding concurrent queries.
    concurrent: () =>
        return @_concurrent_queries

    # Server-side changefeed-updated table, which automatically restart changefeed
    # on error, etc.  See SyncTable docs where the class is defined.
    synctable: (opts) =>
        opts = defaults opts,
            query          : required
            primary_key    : undefined  # if not given, will use the one for the whole table -- value *must* be a string
            idle_timeout_s : undefined  # if given, synctable will disconnect from remote database if nothing happens for this long; this mean on 'change' events won't get fired on change.  Any function calls on the SyncTable will reset this timeout and reconnect.  Also, call .connect () => to ensure that everything is current before using synctable.
            cb             : required
        new SyncTable(opts.query, opts.primary_key, @, opts.idle_timeout_s, opts.cb)
        return

    # Any time a record changes in any of the given tables,
    # calls the cb with the change.
    watch: (opts) =>
        throw Error("NotImplementedError")

    # Wait until the query results in at least one result obj, and
    # calls cb(undefined, obj).
    # TODO: rethinkdb api says:  "This is not robust to connection to database ending, etc. --
    # in those cases, get cb(err)."  -- maybe we can do better this time?
    wait: (opts) =>
        opts = defaults opts,
            until     : required     # a rethinkdb query, e.g., @table('projects').getAll(...)....
            timeout_s : undefined
            cb        : required     # cb(undefined, obj) on success and cb('timeout') on failure due to timeout
        throw Error("NotImplementedError")

    # Compute the sha1 hash (in hex) of the input arguments, which are
    # converted to strings (via json) if they are not strings, then concatenated.
    # This is used for computing compound primary keys in a way that is relatively
    # safe, and in situations where if there were a highly unlikely collision, it
    # wouldn't be the end of the world.  There is a similar client-only slower version
    # of this function (in schema.coffee), so don't change it willy nilly.
    sha1: (args...) ->
        v = ((if typeof(x) == 'string' then x else JSON.stringify(x)) for x in args).join('')
        return misc_node.sha1(v)

    set_random_password: (opts) =>
        throw Error("NotImplementedError")

    # Go through every table in the schema with a column called "expire", and
    # delete every entry where expire is <= right now.
    # TODO: I took out everything related to throttling from the RethinkDB
    # version -- maybe postgres is much more efficient!
    delete_expired: (opts) =>
        opts = defaults opts,
            count_only : true       # if true, only count the number of rows that would be deleted
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

    # write an event to the central_log table
    log: (opts) =>
        opts = defaults opts,
            event : required    # string
            value : required    # object
            cb    : undefined
        @_query
            query  : 'INSERT INTO central_log'
            values :
                'id::UUID'        : misc.uuid()
                'event::TEXT'     : opts.event
                'value::JSONB'    : opts.value
                'time::TIMESTAMP' : 'NOW()'
            cb     : (err) => opts.cb?(err)

    # dump a range of data from the central_log table
    get_log: (opts) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            log   : 'central_log' # which table to query
            event : undefined
            where : undefined     # if given, restrict to records with the given json
                                  # containment, e.g., {account_id:'...'}, only returns
                                  # entries whose value has the given account_id.
            cb    : required
        @_query
            query  : "SELECT * FROM #{opts.log}"
            where  :
                'time  >= $::TIMESTAMP' : opts.start
                'time  <= $::TIMESTAMP' : opts.end
                'event  = $::TEXT'      : opts.event
                'value @> $::JSONB'     : opts.where
            cb     : all_results(opts.cb)

    # Return every entry x in central_log in the given period of time for
    # which x.event==event and x.value.account_id == account_id.
    get_user_log: (opts) =>
        opts = defaults opts,
            start      : undefined
            end        : undefined     # if not given include everything until now
            event      : 'successful_sign_in'
            account_id : required
            cb         : required
        @get_log
            start : opts.start
            end   : opts.end
            event : opts.event
            where : {account_id: opts.account_id}
            cb    : opts.cb

    log_client_error: (opts) =>
        opts = defaults opts,
            event      : 'event'
            error      : 'error'
            account_id : undefined
            cb         : undefined
        @_query
            query  : 'INSERT INTO client_error_log'
            values :
                'id         :: UUID'      : misc.uuid()
                'event      :: TEXT'      : opts.event
                'error      :: TEXT'      : opts.error
                'account_id :: UUID'      : opts.account_id
                'time       :: TIMESTAMP' : 'NOW()'
            cb     : opts.cb

    get_client_error_log: (opts) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            event : undefined
            cb    : required
        opts.log = 'client_error_log'
        @get_log(opts)

    set_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            value : required
            cb    : required
        @_query
            query  : 'INSERT INTO server_settings'
            values :
                'name::TEXT'  : opts.name
                'value::TEXT' : opts.value
            conflict : 'name'
            cb     : opts.cb

    get_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            cb    : required
        @_query
            query : 'SELECT value FROM server_settings'
            where :
                "name = $::TEXT" : opts.name
            cb    : one_result(opts.cb, 'value')

    # TODO: optimization -- this could be done as a changefeed (and is in rethink.coffee)
    get_site_settings: (opts) =>
        opts = defaults opts,
            cb : required   # (err, settings)
        @_query
            query : 'SELECT name, value FROM server_settings'
            where :
                "name = ANY($)" : misc.keys(site_settings_conf)
            cb : (err, result) =>
                if err
                    opts.cb(err)
                else
                    x = {}
                    for k in result.rows
                        if k.name == 'commercial' and k.value in ['true', 'false']  # backward compatibility
                            k.value = eval(k.value)
                        x[k.name] = k.value
                    opts.cb(undefined, x)

    set_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            conf     : required
            cb       : required
        @_query
            query    : 'INSERT into passport_settings'
            values   :
                'strategy::TEXT ' : opts.strategy
                'conf    ::JSONB' : opts.conf
            conflict : 'strategy'
            cb       : opts.cb

    get_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            cb       : required
        @_query
            query : 'SELECT conf FROM passport_settings'
            where :
                "strategy = $::TEXT" : opts.strategy
            cb    : one_result(opts.cb, 'conf')

    ###
    Account creation, deletion, existence
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

        dbg = @_dbg("create_account(#{opts.first_name}, #{opts.last_name} #{opts.email_address}, #{opts.passport_strategy}, #{opts.passport_id})")
        dbg()

        if opts.email_address? # canonicalize the email address, if given
            opts.email_address = misc.lower_email_address(opts.email_address)

        if not opts.email_address? and not opts.passport_strategy?
            opts.cb("email_address or passport must be given")
            return

        account_id = misc.uuid()

        passport_key = undefined
        if opts.passport_strategy?
            # This is to make it impossible to accidentally create two accounts with the same passport
            # due to calling create_account twice at once.   See TODO below about changing schema.
            # This should be enough for now since a given user only makes their account through a single
            # server via the persistent websocket...
            @_create_account_passport_keys ?= {}
            passport_key = @_passport_key(strategy:opts.passport_strategy, id:opts.passport_id)
            last = @_create_account_passport_keys[passport_key]
            if last? and new Date() - last <= 60*1000
                opts.cb("recent attempt to make account with this passport strategy")
                return
            @_create_account_passport_keys[passport_key] = new Date()

        async.series([
            (cb) =>
                if not opts.passport_strategy?
                    cb(); return
                dbg("verify that no account with passport (strategy='#{opts.passport_strategy}', id='#{opts.passport_id}') already exists")
                # **TODO:** need to make it so insertion into the table still would yield an error due to
                # unique constraint; this will require probably moving the passports
                # object to a separate table.  This is important, since this is exactly the place where
                # a race condition might cause touble!
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
            (cb) =>
                dbg("create the actual account")
                @_query
                    query  : "INSERT INTO accounts"
                    values :
                        'account_id    :: UUID'      : account_id
                        'first_name    :: TEXT'      : opts.first_name
                        'last_name     :: TEXT'      : opts.last_name
                        'created       :: TIMESTAMP' : new Date()
                        'created_by    :: INET'      : opts.created_by
                        'password_hash :: CHAR(173)' : opts.password_hash
                        'email_address :: TEXT'      : opts.email_address
                    cb : cb
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

    # TODO: (probably) need indexes to make this fast.
    count_accounts_created_by: (opts) =>
        opts = defaults opts,
            ip_address : required
            age_s      : required
            cb         : required
        @_count
            table : 'accounts'
            where :
                "created_by  = $::INET"      : opts.ip_address
                "created    >= $::TIMESTAMP" : misc.seconds_ago(opts.age_s)
            cb    : opts.cb

    # Completely delete the given account from the database.  This doesn't
    # do any sort of cleanup of things associated with the account!  There
    # is no reason to ever use this, except for testing purposes.
    delete_account: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        @_query
            query : "DELETE FROM accounts"
            where : "account_id = $::UUID" : opts.account_id
            cb    : opts.cb

    mark_account_deleted: (opts) =>
        throw Error("NotImplementedError")

    account_exists: (opts) =>
        opts = defaults opts,
            email_address : required
            cb            : required   # cb(err, account_id or undefined) -- actual account_id if it exists; err = problem with db connection...
        @_query
            query : 'SELECT account_id FROM accounts'
            where : "email_address = $::TEXT" : opts.email_address
            cb    : one_result(opts.cb, 'account_id')

    # set an account creation action, or return all of them for the given email address
    account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            action        : undefined   # if given, adds this action; if not, returns all non-expired actions
            ttl           : 60*60*24*14 # add action with this ttl in seconds (default: 2 weeks)
            cb            : required    # if ttl not given cb(err, [array of actions])
        if opts.action?
            # add action
            @_query
                query  : 'INSERT INTO account_creation_actions'
                values :
                    'id            :: UUID'      : misc.uuid()
                    'email_address :: TEXT'      : opts.email_address
                    'action        :: JSONB'     : opts.action
                    'expire        :: TIMESTAMP' : expire_time(opts.ttl)
                cb : opts.cb
        else
            # query for actions
            @_query
                query : 'SELECT action FROM account_creation_actions'
                where :
                    'email_address  = $::TEXT'       : opts.email_address
                    'expire        >= $::TIMESTAMP'  : new Date()
                cb    : all_results(opts.cb, 'action')

    account_creation_actions_success: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        @_query
            query : 'UPDATE accounts'
            set   :
                'creation_actions_done::BOOLEAN' : true
            where :
                'account_id = $::UUID' : opts.account_id
            cb     : opts.cb

    do_account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            account_id    : required
            cb            : required
        dbg = @_dbg("do_account_creation_actions(email_address='#{opts.email_address}')")
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
    Stripe support for accounts
    ###
    # Set the stripe id in our database of this user.  If there is no user with this
    # account_id, then this is a NO-OP.
    set_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            customer_id : required
            cb          : required
        @_query
            query : 'UPDATE accounts'
            set   : 'stripe_customer_id::TEXT' : opts.customer_id
            where : 'account_id = $::UUID'     : opts.account_id
            cb    : opts.cb

    # Get the stripe id in our database of this user (or undefined if not stripe_id or no such user).
    get_stripe_customer_id: (opts) =>
        opts = defaults opts,
            account_id  : required
            cb          : required
        @_query
            query : 'SELECT stripe_customer_id FROM accounts'
            where : 'account_id = $::UUID' : opts.account_id
            cb    : one_result(opts.cb, 'stripe_customer_id')

    ###
    Stripe integration/sync:
    Get all info about the given account from stripe and put it in our own local database.
    Call it with force right after the user does some action that will change their
    account info status.  This will never touch stripe if the user doesn't have
    a stripe_customer_id.   TODO: This should be replaced by webhooks...
    ###
    stripe_update_customer: (opts) =>
        opts = defaults opts,
            account_id  : required   # user's account_id
            stripe      : undefined  # api connection to stripe
            customer_id : undefined  # will be looked up if not known
            cb          : undefined
        customer = undefined
        dbg = @_dbg("stripe_update_customer(account_id='#{opts.account_id}')")
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
                            else if not secret
                                cb("stripe must be configured")
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
                    @_query
                        query : 'UPDATE accounts'
                        set   : 'stripe_customer::JSONB' : customer
                        where : 'account_id = $::UUID'   : opts.account_id
                        cb    : opts.cb
                else
                    cb()
        ], opts.cb)

    ###
    Querying for searchable information about accounts.
    ###
    account_ids_to_usernames: (opts) =>
        opts = defaults opts,
            account_ids : required
            cb          : required # (err, mapping {account_id:{first_name:?, last_name:?}})
        if not @_validate_opts(opts) then return
        if opts.account_ids.length == 0 # easy special case -- don't waste time on a db query
            opts.cb(undefined, [])
            return
        @_query
            query : 'SELECT account_id, first_name, last_name FROM accounts'
            where : 'account_id = ANY($::UUID[])' : opts.account_ids
            cb    : (err, result) =>
                if err
                    opts.cb(err)
                else
                    v = misc.dict(([r.account_id, {first_name:r.first_name, last_name:r.last_name}] for r in result.rows))
                    # fill in unknown users (should never be hit...)
                    for id in opts.account_ids
                        if not v[id]?
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

    user_search: (opts) =>
        opts = defaults opts,
            query : required     # comma separated list of email addresses or strings such as 'foo bar' (find everything where foo and bar are in the name)
            limit : 50           # limit on string queries; email query always returns 0 or 1 result per email address
            cb    : required     # cb(err, list of {id:?, first_name:?, last_name:?, email_address:?}), where the
                                 # email_address *only* occurs in search queries that are by email_address -- we do not reveal
                                 # email addresses of users queried by name.
        {string_queries, email_queries} = misc.parse_user_search(opts.query)
        results = []
        dbg = @_dbg("user_search")
        dbg("query = #{misc.to_json(opts.query)}")
        async.parallel([
            (cb) =>
                if email_queries.length == 0
                    cb(); return
                dbg("do email queries -- with exactly two targeted db queries (even if there are hundreds of addresses)")
                @_query
                    query : 'SELECT account_id, first_name, last_name, email_address FROM accounts'
                    where : 'email_address = ANY($::TEXT[])' : email_queries
                    cb    : (err, result) =>
                        cb(err, if result? then results.push(result.rows...))
            (cb) =>
                dbg("do all string queries")
                if string_queries.length == 0 or (opts.limit? and results.length >= opts.limit)
                    # nothing to do
                    cb(); return
                # substring search on first and last name.
                # With the two indexes, the query below is instant even on several
                # hundred thousand accounts:
                #     CREATE INDEX accounts_first_name_idx ON accounts(first_name text_pattern_ops);
                #     CREATE INDEX accounts_last_name_idx  ON accounts(last_name text_pattern_ops);
                where  = []
                params = []
                i      = 1
                for terms in string_queries
                    v = []
                    for s in terms
                        s = s.toLowerCase()
                        v.push("(lower(first_name) LIKE $#{i}::TEXT OR lower(last_name) LIKE $#{i}::TEXT)")
                        params.push("#{s}%")  # require string to name to start with string -- makes searching way faster and is more useful too
                        i += 1
                    where.push("(#{v.join(' AND ')})")
                query = 'SELECT account_id, first_name, last_name FROM accounts'
                query += ' WHERE ' + where.join(' OR ')
                query += " LIMIT $#{i}::INTEGER"; i += 1
                params.push(opts.limit)
                @_query
                    query  : query
                    params : params
                    cb     : (err, result) =>
                        cb(err, if result? then results.push(result.rows...))
            ], (err) => opts.cb(err, results))

    get_account: (opts) =>
        throw Error("NotImplementedError")

    is_banned_user: (opts) =>
        throw Error("NotImplementedError")

    ban_user: (opts) =>
        throw Error("NotImplementedError")

    unban_user: (opts) =>
        throw Error("NotImplementedError")

    ###
    Passports -- accounts linked to Google/Dropbox/Facebook/Github, etc.
    The Schema is slightly redundant, but indexed properly:
       {passports:['google-id', 'facebook-id'],  passport_profiles:{'google-id':'...', 'facebook-id':'...'}}
    ###
    _passport_key: (opts) => "#{opts.strategy}-#{opts.id}"

    create_passport: (opts) =>
        opts= defaults opts,
            account_id : required
            strategy   : required
            id         : required
            profile    : required
            cb         : required   # cb(err)
        @_dbg('create_passport')(misc.to_json(opts.profile))
        @_query
            query     : "UPDATE accounts"
            jsonb_set :
                passports : "#{@_passport_key(opts)}" : opts.profile
            where     :
                "account_id = $::UUID" : opts.account_id
            cb        : opts.cb

    delete_passport: (opts) =>
        opts= defaults opts,
            account_id : required
            strategy   : required
            id         : required
            cb         : required
        @_dbg('delete_passport')(misc.to_json(opts.profile))
        @_query
            query     : "UPDATE accounts"
            jsonb_set :
                passports : "#{@_passport_key(opts)}" : null  # delete it
            where     :
                "account_id = $::UUID" : opts.account_id
            cb        : opts.cb

    passport_exists: (opts) =>
        opts = defaults opts,
            strategy : required
            id       : required
            cb       : required   # cb(err, account_id or undefined)
        @_query
            query : "SELECT account_id FROM accounts"
            where : "(passports->>$::TEXT) IS NOT NULL" : @_passport_key(opts)
            cb    : (err, result) =>
                opts.cb(err, result?.rows[0]?.account_id)

    update_account_settings: (opts) =>
        throw Error("NotImplementedError")

    touch: (opts) =>
        throw Error("NotImplementedError")

    save_remember_me: (opts) =>
        throw Error("NotImplementedError")

    invalidate_all_remember_me: (opts) =>
        throw Error("NotImplementedError")

    get_remember_me: (opts) =>
        throw Error("NotImplementedError")

    delete_remember_me: (opts) =>
        throw Error("NotImplementedError")

    change_password: (opts) =>
        throw Error("NotImplementedError")

    change_email_address: (opts) =>
        throw Error("NotImplementedError")

    set_password_reset: (opts) =>
        throw Error("NotImplementedError")

    get_password_reset: (opts) =>
        throw Error("NotImplementedError")

    delete_password_reset: (opts) =>
        throw Error("NotImplementedError")

    record_password_reset_attempt: (opts) =>
        throw Error("NotImplementedError")

    count_password_reset_attempts: (opts) =>
        throw Error("NotImplementedError")

    log_file_access: (opts) =>
        throw Error("NotImplementedError")

    get_file_access: (opts) =>
        throw Error("NotImplementedError")

    create_project: (opts) =>
        opts = defaults opts,
            account_id  : required    # initial owner
            title       : undefined
            description : undefined
            cb          : required    # cb(err, project_id)
        if not @_validate_opts(opts) then return
        project_id = misc.uuid()
        now = new Date()
        @_query
            query  : "INSERT INTO projects"
            values :
                project_id  : project_id
                title       : opts.title
                description : opts.description
                created     : now
                last_edited : now
                users       : {"#{opts.account_id}":{group:'owner'}}
            cb : (err, result) =>
                opts.cb(err, if not err then project_id)

    get_project: (opts) =>
        throw Error("NotImplementedError")

    update_project_data: (opts) =>
        throw Error("NotImplementedError")

    get_project_data: (opts) =>
        throw Error("NotImplementedError")

    add_user_to_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            group      : 'collaborator'  # see misc.PROJECT_GROUPS above
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        @_query
            query       : 'UPDATE projects'
            jsonb_merge :
                users   :
                    "#{opts.account_id}":
                        group: opts.group
            cb          : opts.cb

    remove_collaborator_from_project: (opts) =>
        throw Error("NotImplementedError")

    get_collaborator_ids: (opts) =>
        throw Error("NotImplementedError")

    get_project_users: (opts) =>
        throw Error("NotImplementedError")

    get_public_paths: (opts) =>
        throw Error("NotImplementedError")

    has_public_path: (opts) =>
        throw Error("NotImplementedError")

    path_is_public: (opts) =>
        throw Error("NotImplementedError")

    filter_public_paths: (opts) =>
        throw Error("NotImplementedError")

    touch_project: (opts) =>
        throw Error("NotImplementedError")

    recently_modified_projects: (opts) =>
        throw Error("NotImplementedError")

    get_open_unused_projects: (opts) =>
        throw Error("NotImplementedError")

    user_is_in_project_group: (opts) =>
        throw Error("NotImplementedError")

    get_project_ids_with_user: (opts) =>
        throw Error("NotImplementedError")

    get_projects_with_user: (opts) =>
        throw Error("NotImplementedError")

    get_projects_with_ids: (opts) =>
        throw Error("NotImplementedError")

    get_account_ids_using_project: (opts) =>
        throw Error("NotImplementedError")

    when_sent_project_invite: (opts) =>
        throw Error("NotImplementedError")

    sent_project_invite: (opts) =>
        throw Error("NotImplementedError")

    set_project_host: (opts) =>
        throw Error("NotImplementedError")

    unset_project_host: (opts) =>
        throw Error("NotImplementedError")

    get_project_host: (opts) =>
        throw Error("NotImplementedError")

    set_project_storage: (opts) =>
        throw Error("NotImplementedError")

    get_project_storage: (opts) =>
        throw Error("NotImplementedError")

    update_project_storage_save: (opts) =>
        throw Error("NotImplementedError")

    set_project_storage_request: (opts) =>
        throw Error("NotImplementedError")

    get_project_storage_request: (opts) =>
        throw Error("NotImplementedError")

    set_project_state: (opts) =>
        throw Error("NotImplementedError")

    get_project_state: (opts) =>
        throw Error("NotImplementedError")

    get_project_quotas: (opts) =>
        throw Error("NotImplementedError")

    get_user_project_upgrades: (opts) =>
        throw Error("NotImplementedError")

    ensure_user_project_upgrades_are_valid: (opts) =>
        throw Error("NotImplementedError")

    get_project_upgrades: (opts) =>
        throw Error("NotImplementedError")

    get_project_settings: (opts) =>
        throw Error("NotImplementedError")

    set_project_settings: (opts) =>
        throw Error("NotImplementedError")

    record_file_use: (opts) =>
        throw Error("NotImplementedError")

    get_file_use: (opts) =>
        throw Error("NotImplementedError")

    count_timespan: (opts) =>
        throw Error("NotImplementedError")

class SyncTable extends EventEmitter
    constructor: (@_query, @_primary_key, @_db, @_idle_timeout_s, cb) ->
        throw Error("NotImplementedError")

    connect: (opts) =>
        throw Error("NotImplementedError")

    get: (key) =>
        throw Error("NotImplementedError")

    getIn: (x) =>
        throw Error("NotImplementedError")

    has: (key) =>
        throw Error("NotImplementedError")

    close: (keep_listeners) =>
        throw Error("NotImplementedError")

    wait: (opts) =>
        throw Error("NotImplementedError")

###
Trigger functions
###
trigger_name = (table) ->
    return "changes_#{table}"

trigger_code = (table, columns) ->
    tgname      = trigger_name(table, columns)
    column_decl = ("#{name} #{type ? 'text'};" for name, type of columns)
    old_assign  = ("#{name} = OLD.#{name};" for name, _ of columns)
    new_assign  = ("#{name} = NEW.#{name};" for name, _ of columns)
    build_obj   = ("'#{name}', #{name}" for name, _ of columns)
    return """
CREATE OR REPLACE FUNCTION #{tgname}() RETURNS TRIGGER AS $$
    DECLARE
        notification json;
        #{column_decl.join('\n')}
    BEGIN
        -- Action = DELETE?             -> OLD row; INSERT or UPDATE?   -> NEW row
        IF (TG_OP = 'DELETE') THEN
            #{old_assign.join('\n')}
        ELSE
            #{new_assign.join('\n')}
        END IF;
        notification = json_build_object('table',  TG_TABLE_NAME, 'action', TG_OP, #{build_obj.join(',')});
        PERFORM pg_notify('#{tgname}', notification::text);
        RETURN NULL;
    END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER #{tgname} AFTER INSERT OR UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE PROCEDURE #{tgname}();
"""

###
Other misc functions
###

# Convert from info in the schema table to a pg type
# See https://www.postgresql.org/docs/devel/static/datatype.html
pg_type = (info, field) ->
    if typeof(info) == 'boolean'
        throw Error("pg_type: insufficient information to determine type (info=boolean)")
    if info.pg_type
        return info.pg_type
    if not info.type?
        throw Error("pg_type: insufficient information to determine type (pg_type and type both not given)")
    type = info.type.toLowerCase()
    switch type
        when 'uuid'
            return 'UUID'
        when 'timestamp'
            return 'TIMESTAMP'
        when 'string'
            return 'TEXT'
        when 'boolean'
            return 'BOOLEAN'
        when 'map'
            return 'JSONB'
        when 'integer'
            return 'INTEGER'
        when 'number', 'double', 'float'
            return 'DOUBLE PRECISION'
        when 'array'
            throw Error("pg_type: you must specify the array type explicitly")
        when 'buffer'
            return "BYTEA"
        else
            throw Error("pg_type: unknown type '#{type}'")

# Certain field names we used with RethinkDB
# aren't allowed without quoting in Postgres.
NEEDS_QUOTING =
    user : true
quote_field = (field) ->
    if NEEDS_QUOTING[field]
        return "\"#{field}\""
    return field

# Timestamp the given number of seconds **in the future**.
exports.expire_time = expire_time = (ttl) ->
    if ttl then new Date((new Date() - 0) + ttl*1000)

# Returns a function that takes as input the output of doing a SQL query.
# If there are no results, returns undefined.
# If there is exactly one result, what is returned depends on pattern:
#     'a_field' --> returns the value of this field in the result
# If more than one result, an error
one_result = (cb, pattern) ->
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
                obj = result.rows[0]
                switch typeof(pattern)
                    when 'string'
                        x = obj[pattern]
                        if not x?  # null or undefined -- SQL returns null, but we want undefined
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

all_results = (cb, pattern) ->
    if not cb?
        return ->  # do nothing -- return function that ignores result
    return (err, result) ->
        if err
            cb(err)
        else
            rows = result.rows
            if not pattern?
                cb(undefined, rows)
            else if typeof(pattern) == 'string'
                cb(undefined, ((x[pattern] ? undefined) for x in rows))
            else
                cb("unsupported pattern type '#{typeof(pattern)}'")


count_result = (cb) ->
    if not cb?
        return ->  # do nothing -- return function that ignores result
    return (err, result) ->
        if err
            cb(err)
        else
            cb(undefined, parseInt(result?.rows?[0]?.count))