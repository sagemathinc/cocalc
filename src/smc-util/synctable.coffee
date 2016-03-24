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
      - 'before-change': fired right before (and in the same event loop) actually
                  applying remote incoming changes
      - 'change', [array of string primary keys] : fired any time the value of the query result
                 changes, *including* if changed by calling set on this object.
                 Also, called with empty list on first connection if there happens
                 to be nothing in this table.   If the primary key is not a string it is
                 converted to a JSON string.
      - 'disconnected': fired when table is disconnected from the server for some reason
      - 'connected': fired when table has successfully connected and finished initializing
                     and is ready to use
      - 'saved', [array of saved objects]: fired after confirmed successful save of objects to backend

STATES:

A SyncTable is a finite state machine as follows:

                          -------------------<------------------
                         \|/                                   |
    [connecting] --> [connected]  -->  [disconnected]  --> [reconnecting]

Also, there is a final state called 'closed', that the SyncTable moves to when
it will not be used further; this frees up all connections and used memory.
The table can't be used after it is closed.   The only way to get to the
closed state is to explicitly call close() on the table; otherwise, the
table will keep attempting to connect and work, until it works.

    (anything)  --> [closed]



- connecting   -- connecting to the backend, and have never connected before.

- connected    -- successfully connected to the backend, initialized, and receiving updates.

- disconnected -- table was successfully initialized, but the network connection
                  died. Can still takes writes, but they will never try to save to
                  the backend.  Waiting to reconnect when user connects back to the backend.

- reconnecting -- client just reconnected to the backend, so this table is now trying
                  to get the full current state of the table and initialize a changefeed.

- closed       -- table is closed, and memory/connections used by the table is freed.


WORRY: what if the user does a set and connecting (or reconnecting) takes a long time, e.g., suspend
a laptop, then resume?  The changes may get saved... a month later.  For some things, e.g., logs,
this could be fine.  However, on reconnect, the first thing is that complete upstream state of
table is set on server version of table, so reconnecting user only sends its changes if upstream
hasn't changed anything in that same record.
###

{EventEmitter} = require('events')

immutable = require('immutable')
async     = require('async')

misc      = require('./misc')
schema    = require('./schema')

{defaults, required} = misc

# We represent synchronized tables by an immutable.js mapping from the primary
# key to the object.  Since RethinkDB primary keys can be more than just strings,
# e.g., they can be arrays, so we convert complicated keys to their
# JSON representation.  According to RethinkdB: "The data type of a primary
# key is usually a string (like a UUID) or a number, but it can also be a
# time, binary object, boolean or an array."
# (see https://rethinkdb.com/api/javascript/table_create/)
# A binary object doesn't make sense here in pure javascript, but these do:
#       string, number, time, boolean, or array
# Everything automatically converts fine to a string except array, which is the
# main thing this function deals with below.
# NOTE (1)  RIGHT NOW:  This should be safe to change at
# any time, since the keys aren't stored longterm.
# If we do something with localStorage, this will no longer be safe
# without a version number.
# NOTE (2) Of course you could use both a string and an array as primary keys
# in the same table.  You could evily make the string equal the json of an array,
# and this *would* break things.  We are thus assuming that such mixing
# doesn't happen.  An alternative would be to just *always* use a *stable* version of stringify.
# NOTE (3) we use a stable version, since otherwise things will randomly break if the
# key is an object.

json_stable_stringify = require('json-stable-stringify')

to_key = (x) ->
    if typeof(x) == 'object'
        return json_stable_stringify(x)
    else
        return x

class SyncTable extends EventEmitter
    constructor: (@_query, @_options, @_client, @_debounce_interval=2000) ->
        @_init_query()
        @_init()

    # Return string key used in the immutable map in which this table is stored.
    to_key: (x) =>
        if immutable.Map.isMap(x)
            x = x.get(@_primary_key).toJS()
        return to_key(x)

    _init: () =>
        # Any listeners on the client that we should remove when closing this table.
        @_client_listeners = {}

        # The value of this query locally.
        @_value_local = undefined

        # Our best guess as to the value of this query on the server,
        # according to queries and updates the server pushes to us.
        @_value_server = undefined

        # The changefeed id, when set by doing a change-feed aware query.
        @_id = undefined

        # Not connected yet
        @_state = 'disconnected'

        #dbg = @_client.dbg("_init('#{@_table}')")
        #dbg()
        dbg = ->

        @_connect = () =>
            if @_state != 'disconnected'
                # only try to connect if currently 'disconnected'
                return
            dbg("connect #{misc.to_json(@_query)}")
            if @_id?
                @_client.query_cancel(id:@_id)
                @_id = undefined
            # First save, in case we have any local unsaved changes, then sync with upstream.
            @_save () =>
                @_reconnect()

        if @_schema.anonymous or @_client.is_project()
            # just need to be connected; also projects don't have to authenticate
            if @_client.is_connected()
                @_connect() # first time
            else
                @_client.once('connected', @_connect)
                @_client_listeners.connected = @_connect
        else
            # need to be signed in
            if @_client.is_signed_in()
                @_connect() # first time
            else
                @_client.once('signed_in', @_connect)
                @_client_listeners.signed_in = @_connect

        disconnected = () =>
            if @_state != 'disconnected'
                dbg("disconnected -- #{misc.to_json(@_query)}")
                @_state = 'disconnected'
                @emit('disconnected')   # tell any listeners that we're disconnected now.
                @_client.once('connected', @_connect)
                @_client_listeners.connected = @_connect

        @_client.on('disconnected', disconnected)
        @_client_listeners.disconnected = disconnected
        return

    get: (arg) =>
        if not @_value_local?
            return
        if arg?
            if misc.is_array(arg)
                x = {}
                for k in arg
                    x[to_key(k)] = @_value_local.get(to_key(k))
                return immutable.fromJS(x)
            else
                return @_value_local.get(to_key(arg))
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
        if @_client.is_project()
            @_client_query = schema.SCHEMA[@_table].project_query
        else
            @_client_query = schema.SCHEMA[@_table].user_query
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
            if @_client_query?.set?.fields?[field]?
                @_set_fields.push(field)
            if @_client_query?.set?.required_fields?[field]?
                @_required_set_fields[field] = true

        # Is anonymous access to this table allowed?
        @_anonymous = !!@_schema.anonymous

    _reconnect: =>
        if @_state == 'closed'
            # nothing to do
            return
        #dbg = (m) => console.log("_reconnect(table='#{@_table}'): #{m}")
        #dbg()
        dbg = =>
        if not @_client._connected
            # nothing to do -- not connected to server; connecting to server triggers another reconnect later
            dbg("not connected to server")
            return
        if @_state == 'connected'
            dbg("already connected")
            return
        if not @_anonymous and not @_client.is_signed_in()
            dbg("waiting for sign in before connecting")
            @_state = 'reconnecting'
            f = =>
                dbg("sign in triggered connecting")
                @_state = 'disconnected'
                @_reconnect()
            @_client.once('signed_in', f)
            @_client_listeners.signed_in = f
            return
        @_state = 'reconnecting'
        dbg("running query...")
        @_run (err) =>
            dbg("running query returned -- #{err}")
            if @_state != 'connected'
                if not @_reconnect_timeout?
                    @_reconnect_timeout = 3
                else
                    @_reconnect_timeout = Math.max(3, Math.min(20+Math.random(), 1.4*@_reconnect_timeout))
                dbg("didn't work -- try again in #{@_reconnect_timeout} seconds")
                @_waiting_to_reconnect = true
                setTimeout( (()=>@_waiting_to_reconnect = false; @_reconnect()), @_reconnect_timeout*1000 )
            else
                delete @_reconnect_timeout
                for cb in @_connected_save_cbs ? []
                    @save(cb)

    _run: (cb) =>
        if @_state == 'closed'
            # closed so don't do anything ever again
            cb?("closed")
            return
        first_resp = true
        query_id = misc.uuid()
        @_query_id = query_id
        #console.log("#{this_id} -- query #{@_table}: _run")
        @_client.query
            query   : @_query
            changes : true
            timeout : 30
            options : @_options
            cb      : (err, resp) =>
                if @_query_id != query_id
                    # ignore any potential output from past attempts to query.
                    return

                if err == 'socket-end' and @_client.is_project()
                    # This is a synctable in a project and the socket that it was
                    # using for getting changefeed updates from a hub ended.
                    # There may be other sockets that this project can use
                    # to maintain this changefeed: if so, we connect immediately,
                    # and if not, we wait until the next connection.
                    console.warn("query #{@_table}: _run: socket-end ")
                    @emit('disconnected')
                    @_state = 'disconnected'
                    if @_client.is_connected()
                        # some socket is still available
                        @_connect()
                    else
                        # no sockets avialable; wait to connect
                        @_client.once('connected', @_connect)
                    return

                @_last_err = err
                if first_resp and resp?.event != 'query_cancel'
                    first_resp = false
                    if @_state == 'closed'
                        cb?("closed")
                    else if err
                        #console.warn("query '#{misc.to_json(@_query)}': _run: first error ", err)
                        cb?(err)
                    else if not resp?.query?[@_table]?
                        #console.warn("query on '#{misc.to_json(@_query)}' returned undefined")
                        cb?("got no data")
                    else
                        # Successfully completed a query
                        @_id = resp.id
                        @_state = 'connected'
                        #console.log("query #{@_table}: query resp = ", resp)
                        @_update_all(resp.query[@_table])
                        @emit("connected", resp.query[@_table])  # ready to use!
                        cb?()
                else
                    if @_state == 'closed'
                        # nothing to do
                        return
                    #console.log("changefeed #{@_table} produced: #{err}, #{misc.to_json(resp)}")
                    # changefeed
                    if err
                        # were connected, but got an error, e.g., disconnect from server, so switch
                        # to reconnect state.
                        if err != 'killfeed' and err?.msg != 'Connection is closed.'   # killfeed is expected and happens regularly (right now)
                            console.warn("query #{@_table}: _run: not first error -- ", err)
                        delete @_state  # undefined until @_reconnect sets it (in same tick)
                        @_reconnect()
                    else
                        if resp?.event != 'query_cancel' and @_state == 'connected'
                            @_update_change(resp)
                        #else
                        #    console.log("#{this_id} -- query_cancel")

    # Return map from keys that have changed along with how they changed, or undefined
    # if the value of local or the server hasn't been initialized
    _changes: =>
        if not @_value_server? or not @_value_local?
            return
        changed = {}
        @_value_local.map (new_val, key) =>
            old_val = @_value_server.get(key)
            if not new_val.equals(old_val)
                changed[key] = {new_val:new_val, old_val:old_val}
        return changed

    _save: (cb) =>
        if @_state == 'closed'
            cb?("closed")
            return
        if @_state != 'connected'
            cb?("not connected")    # do not change this error message; it is assumed elsewhere.
            return
        # console.log("_save('#{@_table}')")
        # Determine which records have changed and what their new values are.
        if not @_value_server?
            cb?("don't know server yet")
            return
        if not @_value_local?
            cb?("don't know local yet")
            return

        if not @_client_query.set?
            # Nothing to do -- can never set anything for this table.
            # There are some tables (e.g., stats) where the remote values
            # could change while user is offline, and the code below would
            # result in warnings.
            cb?()
            return

        at_start = @_value_local
        changed = @_changes()

        # Send our changes to the server.
        query = []
        saved_objs = []
        for key in misc.keys(changed).sort()  # sort so that behavior is more predictable = faster (e.g., sync patches are in order); the keys are strings so default sort is fine
            c = changed[key]
            obj = {"#{@_primary_key}":key}   # NOTE: this may get replaced below with proper javascript, e.g., for compound primary key
            for k in @_set_fields
                v = c.new_val.get(k)
                if v?
                    if @_required_set_fields[k] or not immutable.is(v, c.old_val?.get(k))
                        if immutable.Iterable.isIterable(v)
                            obj[k] = v.toJS()
                        else
                            obj[k] = v
            query.push({"#{@_table}":obj})
            saved_objs.push(obj)

        # console.log("sending #{query.length} changes: #{misc.to_json(query)}")
        if query.length == 0
            cb?()
            return
        @_client.query
            query   : query
            options : [{set:true}]  # force it to be a set query
            cb      : (err) =>
                if err
                    console.warn("_save('#{@_table}') error: #{err}")
                else
                    @emit('saved', saved_objs)
                if not err and not at_start.equals(@_value_local)
                    # keep saving until table doesn't change *during* the save
                    @_save(cb)
                else
                    cb?(err)

    save: (cb) =>
        if @_state == 'closed'
            cb?("closed")
            return

        if @_state != 'connected'
            cb?("not connected")    # do not change this error message; it is assumed elsewhere.
            return

        @_save_debounce ?= {}

        if not @_value_server? or not @_value_local?
            @_connected_save_cbs ?= []
            @_connected_save_cbs.push(cb)
            return

        misc.async_debounce
            f        : @_save
            interval : @_debounce_interval
            state    : @_save_debounce
            cb       : cb

    # Handle an update of all records from the database.  This happens on
    # initialization, and also if we disconnect and reconnect.
    _update_all: (v) =>
        #dbg = (m) => console.log("_update_all(table='#{@_table}'): #{m}")
        dbg = =>

        if @_state == 'closed'
            # nothing to do -- just ignore updates from db
            return

        if not v?
            console.warn("_update_all('#{@_table}') called with v=undefined")
            return

        @emit('before-change')
        # Restructure the array of records in v as a mapping from the primary key
        # to the corresponding record.
        x = {}
        for y in v
            x[to_key(y[@_primary_key])] = y

        conflict = false

        # Figure out what to change in our local view of the database query result.
        if not @_value_local? or not @_value_server?
            dbg("easy case -- nothing has been initialized yet, so just set everything.")
            @_value_local = @_value_server = immutable.fromJS(x)
            first_connect = true
            changed_keys = misc.keys(x)  # of course all keys have been changed.
        else
            dbg("harder case -- everything has already been initialized.")
            changed_keys = []

            # DELETE or CHANGED:
            # First check through each key in our local view of the query
            # and if the value differs from what is in the database (i.e.,
            # what we just got from DB), make that change.
            # (Later we will possibly merge in the change
            # using the last known upstream database state.)
            @_value_local.map (local, key) =>
                if x[key]?
                    # update value we have locally
                    if @_handle_new_val(x[key], changed_keys)
                        conflict = true
                else
                    # This is a value defined locally that does not exist
                    # on the remote serve.   It could be that the value
                    # was deleted when we weren't connected, in which case
                    # we should delete the value we have locally.  On the
                    # other hand, maybe the local value was newly set
                    # while we weren't connected, so we know it but the
                    # backend server doesn't, which case we should keep it,
                    # and set conflict=true, so it gets saved to the backend.
                    # Given that in sync we always want to keep, and basically
                    # all of the synctables in SMC involve no deleting (just adding to or
                    # changing fields), we MAKE THE CHOICE that we always keep the
                    # local value.
                    # This would be deleting local:  @_value_local = @_value_local.delete(key); changed_keys.push(key)
                    conflict = true

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

    # Apply one incoming change from the database to the in-memory
    # local synchronized table
    _update_change: (change) =>
        #console.log("_update_change", change)
        if @_state == 'closed'
            # We might get a few more updates even after
            # canceling the changefeed, so we just ignore them.
            return
        if not @_value_local?
            console.warn("_update_change(#{@_table}): tried to call _update_change even though local not yet defined (ignoring)")
            return
        if not @_value_server?
            console.warn("_update_change(#{@_table}): tried to call _update_change even though set not yet defined (ignoring)")
            return
        @emit('before-change')
        changed_keys = []
        conflict = false
        if change.new_val?
            conflict = @_handle_new_val(change.new_val, changed_keys)

        if change.old_val? and to_key(change.old_val[@_primary_key]) != to_key(change.new_val?[@_primary_key])
            # Delete a record (TODO: untested)
            key = to_key(change.old_val[@_primary_key])
            @_value_local = @_value_local.delete(key)
            @_value_server = @_value_server.delete(key)
            changed_keys.push(key)

        #console.log("update_change: changed_keys=", changed_keys)
        if changed_keys.length > 0
            #console.log("_update_change: change")
            @emit('change', changed_keys)
            if conflict
                @save()

    _handle_new_val: (val, changed_keys) =>
        key       = to_key(val[@_primary_key])
        new_val   = immutable.fromJS(val)
        local_val = @_value_local.get(key)
        conflict  = false
        if not new_val.equals(local_val)
            #console.log("change table='#{@_table}': #{misc.to_json(local_val?.toJS())} --> #{misc.to_json(new_val.toJS())}") if @_table == 'patches'
            if not local_val?
                @_value_local = @_value_local.set(key, new_val)
                changed_keys.push(key)
            else
                server = @_value_server.get(key)
                # Set in @_value_local every key whose value changed between new_val and server; basically, we're
                # determining and applying the "patch" from upstream, even though it was sent as a complete record.
                # We can compute the patch, since we know the last server value.
                new_val.map (v, k) =>
                    if not immutable.is(v, server?.get(k))
                        local_val = local_val.set(k, v)
                        #console.log("#{@_table}: set #{k} to #{v}")
                server?.map (v, k) =>
                    if not new_val.has(k)
                        local_val = local_val.delete(k)
                if not local_val.equals(@_value_local.get(key))
                    @_value_local = @_value_local.set(key, local_val)
                    changed_keys.push(key)
                if not local_val.equals(new_val)
                    #console.log("#{@_table}: conflict! ", local_val, new_val) if @_table == 'patches'
                    @emit('conflict', {new_val:new_val, old_val:local_val})
                    conflict = true
        @_value_server = @_value_server.set(key, new_val)
        return conflict

    # obj is an immutable.js Map without the primary key
    # set.  If the database schema defines a way to compute
    # the primary key from other keys, try to use it here.
    # This function returns the computed primary key if it works,
    # and returns undefined otherwise.
    _computed_primary_key: (obj) =>
        f = @_client_query.set.fields[@_primary_key]
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
    # Returns the updated value.
    set: (changes, merge, cb) =>
        if @_state == 'closed'
            # Attempting to set on a closed table is dangerous since any data set *will* be
            # silently lost.  So spit out a visible warning.
            console.warn("WARNING: attempt to do a set on a closed table: '#{@_table}', #{misc.to_json(@_query)}")
            cb?("closed")
            return

        if not immutable.Map.isMap(changes)
            changes = immutable.fromJS(changes)
        if not @_value_local?
            @_value_local = immutable.Map({})

        if not merge?
            merge = 'deep'
        else if typeof(merge) == 'function'
            cb = merge
            merge = 'deep'

        if not immutable.Map.isMap(changes)
            cb?("type error -- changes must be an immutable.js Map or JS map"); return
        # Ensure that each key is allowed to be set.
        if not @_client_query.set?
            cb?("users may not set #{@_table}")
            return
        can_set = @_client_query.set.fields
        try
            changes.map (v, k) => if (can_set[k] == undefined) then throw Error("users may not set #{@_table}.#{k}")
        catch e
            cb?(e)
            return

        # Determine the primary key's value
        id = to_key(changes.get(@_primary_key))
        if not id?
            # attempt to compute primary key if it is a computed primary key
            id = to_key(@_computed_primary_key(changes))
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
            # If no current value, then next value is easy -- it equals the current value in all cases.
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
            @emit('change', [id])  # CRITICAL: other code assumes the key is *NOT* sent with this change event!
        return new_val

    close: =>
        if @_state == 'closed'
            return
        # do a last attempt at a save (so we don't lose data), then really close.
        @_save () =>
            @removeAllListeners()
            if @_id?
                @_client.query_cancel(id:@_id)
                delete @_id
            delete @_value_local
            delete @_value_server
            for e, f of @_client_listeners
                @_client.removeListener(e, f)
            @_client_listeners = {}
            @_state = 'closed'

    # wait until some function of this synctable is truthy
    # (this is exactly the same code as in the rethink.coffee SyncTable!)
    wait: (opts) =>
        opts = defaults opts,
            until   : required     # waits until "until(@)" evaluates to something truthy
            timeout : 30           # in *seconds* -- set to 0 to disable (sort of DANGEROUS, obviously.)
            cb      : required     # cb(undefined, until(@)) on success and cb('timeout') on failure due to timeout; cb('closed') if closed
        if @_state == 'closed'
            # instantly fail -- table is closed so can't wait for anything
            opts.cb("closed")
            return
        x = opts.until(@)
        if x
            opts.cb(undefined, x)  # already true
            return
        fail_timer = undefined
        f = =>
            x = opts.until(@)
            if x
                @removeListener('change', f)
                if fail_timer? then clearTimeout(fail_timer)
                opts.cb(undefined, x)
        @on('change', f)
        if opts.timeout
            fail = =>
                @removeListener('change', f)
                opts.cb('timeout')
            fail_timer = setTimeout(fail, 1000*opts.timeout)
        return

exports.SyncTable = SyncTable


###
# Do a three-way merge.  The situation is that some immutable.js object
# called "last" was converted locally to "local", and we **assume** that local
# is not equal to last.  In the meantime, the remove server wants us to
# change this to "upstream".
{diff_match_patch} = require('./dmp')
dmp = new diff_match_patch()
dmp.Diff_Timeout = 0.1
threeway_merge = (last, local, upstream) ->
    switch typeof(last)
        when 'string'
            # It's a string, so a reasonable default is to compute a patch and apply it to upstream.
            merge = dmp.patch_apply(dmp.patch_make(last, local), upstream)[0]
            console.log("'#{last}', '#{local}', '#{upstream}' --> '#{merge}'")
            return merge
        else
            # A generic simple way to resolve the conflict is in favor of our local version.
            return local
###
