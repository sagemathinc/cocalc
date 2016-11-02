###
Similar to rethink.coffee... but built around PostgreSQL.

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

exports.pg = (opts) ->
    new PostgreSQL(opts)

class PostgreSQL
    constructor: (opts) ->
        opts = defaults opts,
            host     : 'localhost'
            database : 'smc'
            debug    : true
            cb       : undefined
        @_debug = opts.debug
        dbg = @_dbg("constructor"); dbg()
        pg.connect "postgres://#{opts.host}/#{opts.database}", (err, client) =>
            if err
                dbg("Failed to connect to database -- #{err}")
                opts.cb?(err)
            else
                @_client = client
                @_client.on('notification', @_notification)
                opts.cb?()

    _dbg: (f) =>
        if @_debug
            return (m) => winston.debug("PostgreSQL.#{f}: #{m}")
        else
            return =>

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

