###
Simple in memory client for testing synctable based functionality.

This simulates all of the database queries with a simple local database.

** This is only meant for testing running on the backend under node.js. **

**WARNING** this is not complete!  I implemented enough of postgres-user-queries,
so that I could test the jupyter implementation.  There are edge cases involving
queries, etc., which may just not work yet.    It's a lot of work to just go
through and re-implement everything in postgres-user-queries...

Also, obviously, I didn't worry one speck about efficiency here -- this is just
for tiny local testing.

Part of CoCALC, which is (c) 2017, SageMath, Inc. and AGPLv3+ licensed.
###

async = require('async')
immutable = require('immutable')

misc      = require('./misc')
{defaults, required} = misc

{SCHEMA, client_db} = require('smc-util/schema')

syncstring = require('./syncstring')
synctable  = require('./synctable')
db_doc     = require('./db-doc')

class exports.Client extends syncstring.TestBrowserClient1
    constructor: (_client_id=misc.uuid(), _debounce_interval=0) ->
        super(_client_id, _debounce_interval)
        # @db is our personal in-memory "database"
        # The keys are the database tables, and the values are
        # the entries in the tables.
        # Efficiency does not matter, of course -- this is 100% just
        # for testing!
        @account_id = misc.uuid()
        @reset()

    reset: =>
        @removeAllListeners()
        @_changefeeds = []
        @db = immutable.Map()

    sha1: (args...) =>
        client_db.sha1(args...)

    is_project: =>
        return false

    is_connected: =>
        return true

    is_signed_in: =>
        return true

    is_user: =>
        return true

    client_id: =>
        return @_client_id

    dbg: (f) =>
        return (m...) ->
            switch m.length
                when 0
                    s = ''
                when 1
                    s = m[0]
                else
                    s = JSON.stringify(m)
            console.log("#{(new Date()).toISOString()} - Client.#{f}: #{s}")

    mark_file: =>

    server_time: =>
        return new Date()

    _user_query_array: (opts) =>
        if opts.changes and opts.query.length > 1
            opts.cb("changefeeds only implemented for single table")
            return
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

    query: (opts) =>
        opts = defaults opts,
            query   : required
            changes : undefined
            options : undefined    # if given must be an array of objects, e.g., [{limit:5}]
            timeout : undefined    # ignored
            cb      : undefined
        delete opts.timeout
        @user_query(opts)

    user_query: (opts) =>
        opts = defaults opts,
            account_id : @account_id
            project_id : undefined
            query      : required
            changes    : undefined
            options    : []
            cb         : undefined
        if misc.is_array(opts.query)
            @_user_query_array(opts)
            return
        subs =
            '{account_id}' : opts.account_id
            '{project_id}' : opts.project_id
            '{now}'        : new Date()
        if opts.changes?
            changes =
                id : misc.uuid()
                cb : opts.cb
        v = misc.keys(opts.query)
        table = v[0]
        query = opts.query[table]
        if misc.is_array(query)
            multi = true
            query = query[0]
        else
            multi = false
        @_user_query_functional_subs(query, SCHEMA[table]?.user_query.get?.fields)
        is_set_query = undefined
        if opts.options?
            if not misc.is_array(opts.options)
                opts.cb?("error")
                return
            for x in opts.options
                if x.set?
                    is_set_query = !!x.set
            options = (x for x in opts.options when not x.set?)
        else
            options = []
        if misc.is_object(query)
            query = misc.deep_copy(query)
            misc.obj_key_subs(query, subs)
            if not is_set_query?
                is_set_query = not misc.has_null_leaf(query)
            if is_set_query
                # do a set query
                if changes
                    opts.cb?("changefeeds only for read queries")
                    return
                if not opts.account_id? and not opts.project_id?
                    opts.cb?("no anonymous set queries")
                    return
                @user_set_query
                    account_id : opts.account_id
                    project_id : opts.project_id
                    table      : table
                    query      : query
                    options    : opts.options
                    cb         : (err, x) =>
                        opts.cb?(err, {query:{"#{table}":x}})
            else
                # do a get query
                if changes and not multi
                    opts.cb?("changefeeds only implemented for multi-document queries")
                    return
                @user_get_query
                    account_id : opts.account_id
                    project_id : opts.project_id
                    table      : table
                    query      : query
                    options    : options
                    multi      : multi
                    changes    : changes
                    cb         : (err, x) =>
                        opts.cb?(err, if not err then {query:{"#{table}":x}})
        else
            opts.cb?("invalid user_query of '#{table}' -- query must be an object")

    _user_query_functional_subs: (query, fields) =>
        if fields?
            for field, val of fields
                if typeof(val) == 'function'
                    query[field] = val(query, @)

    user_get_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            table      : required
            query      : required
            multi      : required
            options    : required
            changes    : undefined
            cb         : required
        client_query = SCHEMA[opts.table]?.user_query
        schema = SCHEMA[opts.table]
        table_name = SCHEMA[opts.table].virtual ? opts.table
        table = @db.get(table_name)

        if opts.multi
            # list of all matches
            result = []
            table?.forEach (x) ->
                y = x.toJS()
                if matches_query(y, opts.query)
                    result.push(y)
            opts.cb(undefined, result)
            if opts.changes
                # setup changefeed
                @_changefeeds.push
                    id : opts.changes.id
                    cb : opts.changes.cb
                    table : table_name
                    query : opts.query
        else
            # one match
            key = to_key(misc.copy_with(misc.copy(opts.query), schema.primary_key))
            obj = table?.get(key)?.toJS()
            if obj?
                obj = misc.copy_with(obj, misc.keys(opts.query))
            opts.cb(undefined, obj)
        return

    user_set_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            table      : required
            query      : required
            options    : undefined
            cb         : required
        schema = SCHEMA[opts.table]
        table_name = schema.virtual ? opts.table
        table = @db.get(table_name)
        if not table?
            table = immutable.Map()
            @db = @db.set(table_name, table)
        key = to_key(misc.copy_with(misc.copy(opts.query), schema.primary_key))
        cur = table.get(key)
        query = immutable.fromJS(opts.query)
        if cur?
            new_val = cur.merge(query)
            table = table.set(key, new_val)
            obj = new_val.toJS()
            for c in @_changefeeds
                if c.table == table_name and matches_query(obj, c.query)
                    c.cb(undefined, {old_val:cur.toJS(), new_val:obj})
        else
            table = table.set(key, query)
            for c in @_changefeeds
                if c.table == table_name and matches_query(opts.query, c.query)
                    c.cb(undefined, {new_val:opts.query})

        @db = @db.set(table_name, table)
        opts.cb(undefined, opts.query)
        return

    query_cancel: =>

    sync_table: (query, options, debounce_interval=0) =>
        debounce_interval = @_debounce_interval # hard coded for testing
        return synctable.sync_table(query, options, @, debounce_interval, 0, false)

    sync_string: (opts) =>
        opts = defaults opts,
            id                : undefined
            project_id        : undefined
            path              : undefined
            file_use_interval : 'default'
            cursors           : false
            save_interval     : 0
        opts.client = @
        return new syncstring.SyncString(opts)

    sync_db: (opts) =>
        opts = defaults opts,
            project_id      : required
            path            : required
            primary_keys    : required
            string_cols     : undefined
            cursors         : false
            change_throttle : 0
            save_interval   : 0
        opts.client = @
        return new db_doc.SyncDB(opts)





# Well-defined JSON.stringify...
json_stable = require('json-stable-stringify')
to_key = (s) ->
    if immutable.Map.isMap(s)
        s = s.toJS()
    return json_stable(s)


matches_query = (obj, query) ->
    for k, v of query
        if v? and obj[k] != v
            return false
    return true