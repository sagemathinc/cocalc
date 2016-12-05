###
Server side synchronized tables built on PostgreSQL, and basic support
for user get query updates.

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) 2016 SageMath, Inc.
**

###

EventEmitter = require('events')

{defaults} = misc = require('smc-util/misc')
required = defaults.required

{PostgreSQL} = require('./postgres')

class exports.PostgreSQL extends PostgreSQL

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
