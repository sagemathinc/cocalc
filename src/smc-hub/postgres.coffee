###
Similar to rethink.coffee... but built around PostgreSQL.

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) SageMath, Inc.
**

---

p = (require('./postgres')).pg()
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
            query  : required
            params : undefined
            where  : undefined   # Used for SELECT: If given, must be a map with keys clauses with $::TYPE  (not $1::TYPE!)
                                 # and values the corresponding params.  Also, WHERE must not be in the query already.
                                 # If where[cond] is undefined, then cond is completely **ignored**.
            values : undefined   # Used for INSERT: If given, then params and where must not be given.   Values is a map
                                 # {field1:[{type1:value}|string|undefined], field2:[{type2:value}|string|undefined], ...} which gets converted to
                                 # ' (field1, field2, ...) VALUES ($1::type1, $2::type2, ...) '
                                 # with corresponding params set.  Undefined valued fields are ignored.
            conflict : undefined # if given, then values must be given; appends something like this to query:
                                 #     ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value'
            cb     : undefined
        dbg = @_dbg("_query('#{opts.query}') (concurrent=#{@_concurrent_queries})")
        dbg()
        if opts.params? and not misc.is_array(opts.params)
            opts.cb("params must be an array")
            return
        if opts.values?
            if opts.where? or opts.params?
                opts.cb("where and params must not be defined if opts.values is defined")
                return
            i = 1
            fields = []
            params = []
            values = []
            for field, v of opts.values
                if not v? # ignore undefined fields -- makes code cleaner (and makes sense)
                    continue
                fields.push(field)
                if typeof(v) == 'string'
                    if v.indexOf('$') != -1
                        opts.cb("if value is a string it must not contain $")
                        return
                    values.push(v)
                else
                    if typeof(v) != 'object'
                        opts.cb("values (=#{misc.to_json(v)}) must be of the form {type1:value} or string")
                        return
                    for type, param of v
                        values.push("$#{i}::#{type}")
                        params.push(param)
                        i += 1
                        break  # v should have just one thing in it.
            opts.params = params
            opts.query += " (#{fields.join(', ')}) VALUES (#{values.join(', ')}) "

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
            if opts.params? or opts.values?
                opts.cb("params (or values) must not be given if where clause is given")
                return
            i = 1
            z = []
            p = []
            for cond, param of opts.where
                if typeof(cond) != 'string'
                    opts.cb("each condition must be a string but '#{cond}' isn't")
                    return
                if not param?
                    continue
                z.push(cond.replace('$', "$#{i}"))
                p.push(param)
                i += 1
            if z.length > 0
                opts.params = p
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
                            trigger_exists = result.rows[0].count > 0
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
            if schema.primary_key == column
                primary_keys.push(column)
            columns.push(s)
        if primary_keys.length == 0
            cb("ERROR creating table '#{table}': a valid primary key must be specified -- #{schema.primary_key}")
            return
        @_query
            query  : "CREATE TABLE #{table} (#{columns.join(', ')}, PRIMARY KEY(#{primary_keys.join(', ')}))"
            cb     : cb

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
                id    : UUID  : misc.uuid()
                event : TEXT  : opts.event
                value : JSONB : opts.value
                time  : 'NOW()'
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
            cb     : (err, result) =>
                opts.cb(err, result?.rows)

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
                id         : UUID : misc.uuid()
                event      : TEXT : opts.event
                error      : TEXT : opts.error
                account_id : UUID : opts.account_id
                time       : 'NOW()'
            cb     : (err) => opts.cb?(err)

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
                name  : 'TEXT' : opts.name
                value : 'TEXT' : opts.value
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
            cb    : (err, result) =>
                opts.cb(err, result?.rows[0]?.value)

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
            query : 'INSERT into passport_settings'
            values :
                strategy : TEXT  : opts.strategy
                conf     : JSONB : opts.conf
            conflict : 'strategy'

    get_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            cb       : required
        @_query
            query : 'SELECT conf FROM passport_settings'
            where :
                "strategy = $::TEXT" : opts.strategy
            cb    : (err, result) =>
                opts.cb(err, result?.rows[0]?.conf)

    count_accounts_created_by: (opts) =>
        throw Error("NotImplementedError")

    delete_account: (opts) =>
        throw Error("NotImplementedError")

    mark_account_deleted: (opts) =>
        throw Error("NotImplementedError")

    account_exists: (opts) =>
        throw Error("NotImplementedError")

    account_creation_actions: (opts) =>
        throw Error("NotImplementedError")

    account_creation_actions_success: (opts) =>
        throw Error("NotImplementedError")

    do_account_creation_actions: (opts) =>
        throw Error("NotImplementedError")

    set_stripe_customer_id: (opts) =>
        throw Error("NotImplementedError")

    get_stripe_customer_id: (opts) =>
        throw Error("NotImplementedError")

    stripe_update_customer: (opts) =>
        throw Error("NotImplementedError")

    account_ids_to_usernames: (opts) =>
        throw Error("NotImplementedError")

    get_usernames: (opts) =>
        throw Error("NotImplementedError")

    all_users: (cb) =>
        throw Error("NotImplementedError")

    user_search: (opts) =>
        throw Error("NotImplementedError")

    get_account: (opts) =>
        throw Error("NotImplementedError")

    is_banned_user: (opts) =>
        throw Error("NotImplementedError")

    ban_user: (opts) =>
        throw Error("NotImplementedError")

    unban_user: (opts) =>
        throw Error("NotImplementedError")

    create_passport: (opts) =>
        throw Error("NotImplementedError")

    delete_passport: (opts) =>
        throw Error("NotImplementedError")

    passport_exists: (opts) =>
        throw Error("NotImplementedError")

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
        throw Error("NotImplementedError")

    get_project: (opts) =>
        throw Error("NotImplementedError")

    update_project_data: (opts) =>
        throw Error("NotImplementedError")

    get_project_data: (opts) =>
        throw Error("NotImplementedError")

    add_user_to_project: (opts) =>
        throw Error("NotImplementedError")

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
