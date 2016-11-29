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

# standard liib
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
            query : required
            cb    : undefined
        dbg = @_dbg("_query('#{opts.query}')")
        dbg("doing query")
        @_client.query opts.query, (err, result) =>
            if err
                dbg("done -- error: #{err}")
            else
                dbg('done -- success')
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

    # Ensure that the actual schema in the database matches the one defined in SCHEMA
    update_schema: (opts) =>
        opts = defaults opts,
            cb : undefined
         dbg = @_dbg("update_schema"); dbg()
         async.series([
            (cb) =>
                cb()
         ], (err) =>
            opts.cb?(err)
         )

    delete_entire_database: (opts) =>
        throw Error("NotImplementedError")

    concurrent: () =>
        throw Error("NotImplementedError")

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

