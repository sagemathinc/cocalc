###

SageMathCloud, Copyright (C) 2015, William Stein

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

---

SYNCHRONIZED TABLE -- defined by an object query

    - Do a query against a RethinkDB table using our object query description.
    - Synchronization with the backend database is done automatically.

   Methods:
      - constructor(query): query = the name of a table (or a more complicated object)

      - set(map):  Set the given keys of map to their values; one key must be
                   the primary key for the table.  NOTE: Computed primary keys will
                   get automatically filled in; these are keys in schema.coffee,
                   where the set query looks like this say:
                      (obj, db) -> db.sha1(obj.project_id, obj.path)
      - get():     Current value of the query, as an immutable.js Map from
                   the primary key to the records, which are also immutable.js Maps.
      - get(key):  The record with given key, as an immutable Map.
      - get(keys): Immutable Map from given keys to the corresponding records.
      - get_one(): Returns one record as an immutable Map (useful if there
                   is only one record)

      - close():   Frees up resources, stops syncing, don't use object further

   Events:
      - 'change', [array of primary keys] : fired any time the value of the query result
                 changes, *including* if changed by calling set on this object.
                 Also, called with empty list on first connection if there happens
                 to be nothing in this table.
###


{EventEmitter} = require('events')

immutable = require('immutable')
async     = require('async')
misc      = require('misc')
schema    = require('schema')

class SyncTable extends EventEmitter
    constructor: (@_query, @_options, @_client) ->
        @_init_query()

        # The value of this query locally.
        @_value_local = undefined

        # Our best guess as to the value of this query on the server,
        # according to queries and updates the server pushes to us.
        @_value_server = undefined

        # The changefeed id, when set by doing a change-feed aware query.
        @_id = undefined

        # Reconnect on connect.
        @_client.on('connected', @_reconnect)

        # Connect to the server the first time.
        @_reconnect()

    get: (arg) =>
        if arg?
            if misc.is_array(arg)
                x = {}
                for k in arg
                    x[k] = @_value_local.get(k)
                return immutable.fromJS(x)
            else
                return @_value_local.get(arg)
        else
            return @_value_local

    get_one: =>
        return @_value_local?.toSeq().first()

    _parse_query: (query) =>
        if typeof(query) == 'string'
            # name of a table -- get all fields
            v = misc.copy(schema.SCHEMA[query].user_query.get.fields)
            for k, _ of v
                v[k] = null
            return {"#{query}": [v]}
        else
            keys = misc.keys(query)
            if keys.length != 1
                throw Error("must specify exactly one table")
            table = keys[0]
            x = {}
            if not misc.is_array(query[table])
                return {"#{table}": [query[table]]}
            else
                return {"#{table}": query[table]}

    _init_query: =>
        # first parse the query to allow for some convenient shortcuts
        @_query = @_parse_query(@_query)

        # Check that the query is probably valid, and record the table and schema
        if misc.is_array(@_query)
            throw Error("must be a single query")
        tables = misc.keys(@_query)
        if misc.len(tables) != 1
            throw Error("must query only a single table")
        @_table = tables[0]
        if not misc.is_array(@_query[@_table])
            throw Error("must be a multi-document queries")
        @_schema = schema.SCHEMA[@_table]
        if not @_schema?
            throw Error("unknown schema for table #{@_table}")
        @_primary_key = @_schema.primary_key ? "id"
        # TODO: could put in more checks on validity of query here, using schema...
        if not @_query[@_table][0][@_primary_key]?
            # must include primary key in query
            @_query[@_table][0][@_primary_key] = null

        # Which fields the user is allowed to set.
        @_set_fields = []
        # Which fields *must* be included in any set query
        @_required_set_fields = {}
        for field in misc.keys(@_query[@_table][0])
            if @_schema.user_query?.set?.fields?[field]?
                @_set_fields.push(field)
            if @_schema.user_query?.set?.required_fields?[field]?
                @_required_set_fields[field] = true

        # Is anonymous access to this table allowed?
        @_anonymous = !!@_schema.anonymous

    _reconnect: (cb) =>
        if @_closed
            throw Error("object is closed")
        if not @_anonymous and not @_client.is_signed_in()
            #console.log("waiting for sign in before connecting")
            @_client.once 'signed_in', =>
                #console.log("sign in triggered connecting")
                @_reconnect(cb)
            return
        if @_reconnecting?
            @_reconnecting.push(cb)
            return
        @_reconnecting = [cb]
        connect = false
        async.series([
            (cb) =>
                if not @_id?
                    connect = true
                    cb()
                else
                    # TODO: this should be done better via registering in client, which also needs to
                    # *cancel* any old changefeeds we don't care about, e.g., due
                    # to refreshing browser, but are still getting messages about.
                    @_client.query_get_changefeed_ids
                        cb : (err, ids) =>
                            if err or @_id not in ids
                                connect = true
                            cb()
            (cb) =>
                if connect
                    misc.retry_until_success
                        f           : @_run
                        max_tries   : 100  # maybe make more -- this is for testing -- TODO!
                        start_delay : 3000
                        cb          : cb
                else
                    cb()
        ], (err) =>
            if err
                @emit "error", err
            v = @_reconnecting
            delete @_reconnecting
            for cb in v
                cb?(err)
        )

    _run: (cb) =>
        if @_closed
            throw Error("object is closed")
        first = true
        #console.log("query #{@_table}: _run")
        @_client.query
            query   : @_query
            changes : true
            options : @_options
            cb      : (err, resp) =>
                @_last_err = err
                if @_closed
                    if first
                        cb?("closed")
                        first = false
                    return
                #console.log("query #{@_table}: -- got result of doing query", resp)
                if first
                    first = false
                    if err
                        #console.log("query #{@_table}: _run: first error ", err)
                        cb?(err)
                    else
                        @_id = resp.id
                        #console.log("query #{@_table}: query resp = ", resp)
                        @_update_all(resp.query[@_table])
                        cb?()
                else
                    #console.log("changefeed #{@_table} produced: #{err}, ", resp)
                    # changefeed
                    if err
                        # TODO: test this by disconnecting backend database
                        #console.log("query #{@_table}: _run: not first error ", err)
                        @_reconnect()
                    else
                        @_update_change(resp)

    _save: (cb) =>
        #console.log("_save(#{@_table})")
        # Determine which records have changed and what their new values are.
        changed = {}
        if not @_value_server?
            cb?("don't know server yet")
            return
        if not @_value_local?
            cb?("don't know local yet")
            return
        at_start = @_value_local
        @_value_local.map (new_val, key) =>
            old_val = @_value_server.get(key)
            if not new_val.equals(old_val)
                changed[key] = {new_val:new_val, old_val:old_val}

        # send our changes to the server
        # TODO: must group all queries in one call.
        f = (key, cb) =>
            c = changed[key]
            obj = {"#{@_primary_key}":key}
            for k in @_set_fields
                v = c.new_val.get(k)
                if v?
                    if @_required_set_fields[k] or not immutable.is(v, c.old_val?.get(k))
                        if immutable.Map.isMap(v)
                            obj[k] = v.toJS()
                        else
                            obj[k] = v
                # TODO: need a way to delete fields!
            @_client.query
                query : {"#{@_table}":obj}
                cb    : cb
        async.map misc.keys(changed), f, (err) =>
            if not err and at_start != @_value_local
                # keep saving until table doesn't change *during* the save
                @_save(cb)
            else
                cb?(err)

    _save0 : (cb) =>
        misc.retry_until_success
            f         : @_save
            max_tries : 100
            #warn      : (m) -> console.warn(m)
            #log       : (m) -> console.log(m)
            cb        : cb

    save: (cb) =>
        if @_saving?
            @_saving.push(cb)
            return
        @_saving = [cb]
        @_save_debounce ?= {}
        misc.async_debounce
            f        : @_save0
            interval : 2000
            state    : @_save_debounce
            cb       : (err) =>
                v = @_saving
                delete @_saving
                for cb in v
                    cb?(err)

    # Handle an update of all records from the database.  This happens on
    # initialization, and also if we disconnect and reconnect.
    _update_all: (v) =>
        #console.log("_update_all(#{@_table})", v)

        # Restructure the array of records in v as a mapping from the primary key
        # to the corresponding record.
        x = {}
        for y in v
            x[y[@_primary_key]] = y

        conflict = false

        # Figure out what to change in our local view of the database query result.
        if not @_value_local? or not @_value_server?
            #console.log("_update_all: easy case -- nothing has been initialized yet, so just set everything.")
            @_value_local = @_value_server = immutable.fromJS(x)
            first_connect = true
            changed_keys = misc.keys(x)  # of course all keys have been changed.
        else
            # Harder case -- everything has already been initialized.
            changed_keys = []
            # DELETE or CHANGED:
            # First check through each key in our local view of the query
            # and if the value differs from what is in the database (i.e., what we just got from DB), make
            # that change.  (Later we will possibly merge in the change
            # using the last known upstream database state.)
            @_value_local.map (local, key) =>
                # x[key] is what we just got from DB, and it's different from what we have locally
                new_val = new_val0 = immutable.fromJS(x[key])
                if not local.equals(new_val)
                    changed_keys.push(key)
                    if not new_val?
                        # delete the record
                        @_value_local = @_value_local.delete(key)
                    else
                        server = @_value_server.get(key)
                        if not local.equals(server)
                            # conflict
                            local.map (v, k) =>
                                if not immutable.is(server.get(k), v)
                                    conflict = true
                                    console.log("update_all conflict ", k)
                                    new_val0 = new_val0.set(k, v)
                        # set the record to its new server value
                        @_value_local = @_value_local.set(key, new_val0)
            # NEWLY ADDED:
            # Next check through each key in what's on the remote database,
            # and if the corresponding local key isn't defined, set its value.
            # Here we are simply checking for newly added records.
            for key, val of x
                if not @_value_local.get(key)?
                    @_value_local = @_value_local.set(key, immutable.fromJS(val))
                    changed_keys.push(key)

        # It's possibly that nothing changed (e.g., typical case on reconnect!) so we check.
        # If something really did change, we set the server state to what we just got, and
        # also inform listeners of which records changed (by giving keys).
        #console.log("update_all: changed_keys=", changed_keys)
        if changed_keys.length != 0
            @_value_server = immutable.fromJS(x)
            @emit('change', changed_keys)
        else if first_connect
            # First connection and table is empty.
            @emit('change', changed_keys)
        if conflict
            @save()

    _update_change: (change) =>
        #console.log("_update_change", change)
        changed_keys = []
        conflict = false
        if change.new_val?
            key = change.new_val[@_primary_key]
            new_val = new_val0 = immutable.fromJS(change.new_val)
            if not new_val.equals(@_value_local.get(key))
                local = @_value_local.get(key)
                server = @_value_server.get(key)
                if local? and server? and not local.equals(server)
                    # conflict -- unsaved changes would be overwritten!
                    # This might happen in the case of loosing network or just rapidly doing writes to individual
                    # fields then getting back new versions from the changefeed.
                    # Will want to rewrite this to have timestamps on each field, maybe.
                    if local? and server?
                        local.map (v,k) =>
                            if not immutable.is(server.get(k), v)
                                conflict = true
                                new_val0 = new_val0.set(k, v)
                @_value_local = @_value_local.set(key, new_val0)
                changed_keys.push(key)

            @_value_server = @_value_server.set(key, new_val)

        if change.old_val? and change.old_val[@_primary_key] != change.new_val?[@_primary_key]
            # Delete a record (TODO: untested)
            key = change.old_val[@_primary_key]
            @_value_local = @_value_local.delete(key)
            @_value_server = @_value_server.delete(key)
            changed_keys.push(key)

        #console.log("update_change: changed_keys=", changed_keys)
        if changed_keys.length > 0
            #console.log("_update_change: change")
            @emit('change', changed_keys)
            if conflict
                @save()

    # obj is an immutable.js Map without the primary key
    # set.  If the database schema defines a way to compute
    # the primary key from other keys, try to use it here.
    # This function returns the computed primary key if it works,
    # and returns undefined otherwise.
    _computed_primary_key: (obj) =>
        f = schema.SCHEMA[@_table].user_query.set.fields[@_primary_key]
        if typeof(f) == 'function'
            return f(obj.toJS(), schema.client_db)

    # Changes (or creates) one entry in the table.
    # The input changes is either an Immutable.js Map or a JS Object map.
    # If changes does not have the primary key then a random record is updated,
    # and there *must* be at least one record.  Exception: computed primary
    # keys will be computed (see stuff about computed primary keys above).
    # The second parameter 'merge' can be one of three values:
    #   'deep'   : (DEFAULT) deep merges the changes into the record, keep as much info as possible.
    #   'shallow': shallow merges, replacing keys by corresponding values
    #   'none'   : do no merging at all -- just replace record completely
    # The cb is called with cb(err) if something goes wrong.
    set: (changes, merge, cb) =>
        if not immutable.Map.isMap(changes)
            changes = immutable.fromJS(changes)
        if not @_value_local?
            @_value_local = immutable.Map({})

        if not merge?
            merge = 'deep'
        else if typeof(merge) == 'function'
            cb = merge
            merge = 'deep'

        if @_closed
            cb?("object is closed"); return

        if not immutable.Map.isMap(changes)
            cb?("type error -- changes must be an immutable.js Map or JS map"); return

        # Ensure that each key is allowed to be set.
        can_set = schema.SCHEMA[@_table].user_query.set.fields
        try
            changes.map (v, k) => if (can_set[k] == undefined) then throw Error("users may not set {@_table}.#{k}")
        catch e
            cb?(e)
            return

        # Determine the primary key's value
        id = changes.get(@_primary_key)
        if not id?
            # attempt to compute primary key if it is a computed primary key
            id = @_computed_primary_key(changes)
            if not id?
                # use a "random" primary key from existing data
                id = @_value_local.keySeq().first()
            if not id?
                cb?("must specify primary key #{@_primary_key}, have at least one record, or have a computed primary key")
                return
            # Now id is defined
            changes = changes.set(@_primary_key, id)

        # Get the current value
        cur  = @_value_local.get(id)
        if not cur?
            # No record with the given primary key.  Require that all the @_required_set_fields
            # are specified, or it will become impossible to sync this table to the backend.
            for k,_ of @_required_set_fields
                if not changes.get(k)?
                    cb?("must specify field '#{k}' for new records")
                    return
            # If no currennt value, then next value is easy -- it equals the current value in all cases.
            new_val = changes
        else
            # Use the appropriate merge strategy to get the next val.  Fortunately these are all built
            # into immutable.js!
            switch merge
                when 'deep'
                    new_val = cur.mergeDeep(changes)
                when 'shallow'
                    new_val = cur.merge(changes)
                when 'none'
                    new_val = changes
                else
                    cb?("merge must be one of 'deep', 'shallow', 'none'"); return
        # If something changed, then change in our local store, and also kick off a save to the backend.
        if not immutable.is(new_val, cur)
            @_value_local = @_value_local.set(id, new_val)
            @save(cb)
            @emit('change')

    close : =>
        @_closed = true
        @removeAllListeners()
        if @_id?
            @_client.query_cancel(id:@_id)
        delete @_value_local
        delete @_value_server
        @_client.removeListener('connected', @_reconnect)


exports.SyncTable = SyncTable