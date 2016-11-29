###
Similar to rethink.coffee... but built around PostgreSQL.

** This code is NOT released under any license.  For use by SageMath, Inc. only.**

---

Snippets...

p = (require('./postgres')).pg()


CREATE TABLE accounts (account_id UUID PRIMARY KEY, email_address VARCHAR(128));
CREATE TABLE projects (project_id UUID PRIMARY KEY, title TEXT);

INSERT INTO accounts VALUES ('83b126a6-1f47-42aa-bb94-1eb7639e9a5e', 'wstein@gmail.com');
INSERT INTO projects VALUES ('10f0e544-313c-4efe-8718-2142ac97ad11', 'RethinkDB --> PostgreSQL project');
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
            cb     : undefined
        dbg = @_dbg("_query('#{opts.query}')")
        dbg("doing query (concurrent=#{@_concurrent_queries})")
        @_concurrent_queries += 1
        @_client.query opts.query, opts.params, (err, result) =>
            @_concurrent_queries -= 1
            if err
                dbg("done (concurrent=#{@_concurrent_queries}) -- error: #{err}")
            else
                dbg("done (concurrent=#{@_concurrent_queries}) -- success")
            opts.cb?(err, result)
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

    _ensure_trigger_exists: (table, columns, cb) =>
        dbg = @_dbg("_ensure_trigger_exists(#{table})")
        dbg("columns=#{misc.to_json(columns)}")
        tgname = trigger_name(table)
        trigger_exists = undefined
        async.series([
            (cb) =>
                dbg("checking whether or not trigger exists")
                @_query
                    query : "SELECT count(*) FROM  pg_trigger where tgname = '#{tgname}'"
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
            query  : "SELECT column_name FROM information_schema.columns WHERE table_name = $1::text"
            params : [table]
            cb     : (err, result) =>
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

    table: (name, opts) =>
        throw Error("NotImplementedError")

    synctable: (opts) =>
        throw Error("NotImplementedError")

    watch: (opts) =>
        throw Error("NotImplementedError")

    wait: (opts) =>
        throw Error("NotImplementedError")

    set_random_password: (opts) =>
        throw Error("NotImplementedError")

    delete_all: (opts) =>
        throw Error("NotImplementedError")

    delete_expired: (opts) =>
        throw Error("NotImplementedError")

    log: (opts) =>
        throw Error("NotImplementedError")

    get_log: (opts) =>
        throw Error("NotImplementedError")

    get_user_log: (opts) =>
        throw Error("NotImplementedError")

    log_client_error: (opts) =>
        throw Error("NotImplementedError")

    get_client_error_log: (opts) =>
        throw Error("NotImplementedError")

    set_server_setting: (opts) =>
        throw Error("NotImplementedError")

    get_server_setting: (opts) =>
        throw Error("NotImplementedError")

    get_site_settings: (opts) =>
        throw Error("NotImplementedError")

    set_passport_settings: (opts) =>
        throw Error("NotImplementedError")

    get_passport_settings: (opts) =>
        throw Error("NotImplementedError")

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
        raise Error("NotImplementedError")

    connect: (opts) =>
        raise Error("NotImplementedError")

    get: (key) =>
        raise Error("NotImplementedError")

    getIn: (x) =>
        raise Error("NotImplementedError")

    has: (key) =>
        raise Error("NotImplementedError")

    close: (keep_listeners) =>
        raise Error("NotImplementedError")

    wait: (opts) =>
        raise Error("NotImplementedError")

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
