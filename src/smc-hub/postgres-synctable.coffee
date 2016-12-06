###
Server side synchronized tables built on PostgreSQL, and basic support
for user get query updates.

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) 2016 SageMath, Inc.
**

###

EventEmitter = require('events')

immutable    = require('immutable')
async        = require('async')

{defaults} = misc = require('smc-util/misc')
required = defaults.required
misc_node = require('smc-util-node/misc_node')

{PostgreSQL, pg_type} = require('./postgres')

{SCHEMA} = require('smc-util/schema')


class exports.PostgreSQL extends PostgreSQL

    _ensure_trigger_exists: (table, columns, cb) =>
        dbg = @_dbg("_ensure_trigger_exists(#{table})")
        dbg("columns=#{misc.to_json(columns)}")
        if misc.len(columns) == 0
            cb('there must be at least one column')
            return
        tgname = trigger_name(table, columns)
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
        dbg("columns = #{misc.to_json(columns)}")
        if misc.len(columns) == 0
            cb('there must be at least one column')
            return
        @_listening ?= {}
        tgname = trigger_name(table, columns)
        if @_listening[tgname]
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
                    query : "LISTEN #{tgname}"
                    cb    : cb
        ], (err) =>
            if err
                dbg("fail: err = #{err}")
                cb?(err)
            else
                @_listening[tgname] = true
                dbg("success")
                cb?(undefined, tgname)
        )

    _notification: (mesg) =>
        @_dbg('notification')(misc.to_json(mesg))
        @emit(mesg.channel, JSON.parse(mesg.payload))

    # Server-side changefeed-updated table, which automatically restart changefeed
    # on error, etc.  See SyncTable docs where the class is defined.
    synctable: (opts) =>
        opts = defaults opts,
            table          : required
            columns        : undefined
            where          : undefined
            limit          : undefined
            order_by       : undefined
            cb             : required
        new SyncTable(@, opts.table, opts.columns, opts.where, opts.limit, opts.order_by, opts.cb)
        return

class SyncTable extends EventEmitter
    constructor: (@_db, @_table, @_columns, @_where, @_limit, @_order_by, cb) ->
        t = SCHEMA[@_table]
        if not t?
            @_state = 'error'
            cb("unknown table #{@_table}")
            return

        @_primary_key = t.primary_key
        if not @_primary_key
            @_state = 'error'
            cb("primary key unknown")
            return

        @_listen_columns = {"#{@_primary_key}" : pg_type(t.fields[@_primary_key], @_primary_key)}

        columns = if @_columns then @_columns.join(', ') else misc.keys(SCHEMA[@_table].fields).join(', ')
        @_select_query = "SELECT #{columns} FROM #{@_table}"

        @_init (err) => cb(err, @)

    _dbg: (f) =>
        return @_db._dbg("SyncTable.#{f}")

    _query_opts: () =>
        opts = {}
        opts.query = @_select_query
        opts.where = @_where
        opts.limit = @_limit
        opts.order_by = @_order_by
        return opts

    close: () =>
        @_db.removeListener(@_tgname, @_notification)
        delete @_value
        @_state = 'closed'

    _satisfies_where: (obj) =>
        return true  # TODO

    _notification: (obj) =>
        console.log 'notification', obj
        if obj.action == 'DELETE'
            @_value = @_value.delete(obj[@_primary_key])
        else
            @_changed[obj[@_primary_key]] = true
            @_update()

    _init: (cb) =>
        @_state = 'init' # 'init' -> ['error', 'ready'] -> 'closed'
        @_value = immutable.Map()
        @_changed = {}
        async.series([
            (cb) =>
                # ensure database client is listen for primary keys changes to our table
                @_db._listen @_table, @_listen_columns, (err, tgname) =>
                    @_tgname = tgname
                    @_db.on(@_tgname, @_notification)
                    cb(err)
            (cb) =>
                opts = @_query_opts()
                opts.cb = (err, result) =>
                    if err
                        cb(err)
                    else
                        @_process_results(result.rows)
                        cb()
                @_db._query(opts)
            (cb) =>
                @_update(cb)
            ], (err) =>
                if err
                    @_state = 'error'
                    cb(err)
                else
                    @_state = 'ready'
                    cb()
            )

    _process_results: (rows) =>
        for x in rows
            @_value = @_value.set(x[@_primary_key], immutable.fromJS(misc.map_without_undefined(x)))

    # Grab any entries from table about which we have been notified of changes.
    _update: (cb) =>
        changed = @_changed
        @_changed = {}
        @_db._query
            query : @_select_query
            where : misc.merge("#{@_primary_key} = ANY($)" : misc.keys(changed), @_where)
            cb    : (err, result) =>
                if err
                    @_dbg("update")("error #{err}")
                    for k of changed
                        @_changed[k] = true   # will try again
                else
                    @_process_results(result.rows)
                cb?()

    connect: (opts) =>
        throw Error("NotImplementedError")

    get: (key) =>
        return if key? then @_value.get(key) else @_value

    getIn: (x) =>
        return @_value.getIn(x)

    has: (key) =>
        return @_value.has(key)

    close: (keep_listeners) =>
        throw Error("NotImplementedError")

    wait: (opts) =>
        throw Error("NotImplementedError")


###
Trigger functions
###
trigger_name = (table, columns) ->
    c = misc.keys(columns)
    c.sort()
    return 'change_' + misc_node.sha1("changes_#{table}_#{c.join('_')}")

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
        notification = json_build_object('action', TG_OP, #{build_obj.join(',')});
        PERFORM pg_notify('#{tgname}', notification::text);
        RETURN NULL;
    END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER #{tgname} AFTER INSERT OR UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE PROCEDURE #{tgname}();
"""

parse_cond = (cond) ->
    # TODO hack for now -- there must be space
    i = cond.indexOf(' ')
    if i == -1
        return {field:cond}
    else
        return {field:cond.slice(0,i)}


