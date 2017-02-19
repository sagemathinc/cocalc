###
SageMathCloud, Copyright (C) 2016, Sagemath Inc.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

---

SYNCHRONIZED TABLE -- defined by an object query

    - Do a query against a PostgreSQL table using our object query description.
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

# if true, will log to the console a huge amount of info about every get/set
DEBUG = false

exports.set_debug = (x) ->
    DEBUG = !!x

{EventEmitter} = require('events')
immutable      = require('immutable')
async          = require('async')
underscore     = require('underscore')

misc           = require('./misc')
schema         = require('./schema')

{defaults, required} = misc

# We represent synchronized tables by an immutable.js mapping from the primary
# key to the object.  Since PostgresQL primary keys can be compound (more than
# just strings), e.g., they can be arrays, so we convert complicated keys to their
# JSON representation.  A binary object doesn't make sense here in pure javascript,
# but these do:
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

# Plug: Class to ensure that the SyncTable stays "plugged" into the hub, if at all possible.
# NOTE: I implemented this outside of SyncTable so that it would be much easier
#       to reason about, and be sure the code is right.
class Plug
    constructor : (opts) ->
        @_opts = defaults opts,
            name       : 'plug'     # Used only for debug logging
            no_sign_in : required   # True if sign is isn't required before connecting, e.g., anonymous synctable and project.
            client     : required   # The client object, which provides:
                                    #   'connected' and 'signed_in' events, and
                                    #   is_connected() and is_signed_in() functions.
            connect    : required   # A function to call to create a connection; it should run as
                                    # quickly as it can and call it's callback with an error if
                                    # and only if it fails.  It will definitely only be called
                                    # once at a time, so no need to put in any sort of block.
        @connect()

    dbg: (f) =>
        #return @_opts.client.dbg("Plug('#{@_opts.name}').#{f}")
        return =>

    # Keep trying until we connect - always succeeds if it terminates
    connect: (cb) =>
        dbg = @dbg('connect')
        if @_is_connecting
            dbg("already connecting")
            return
        @_is_connecting = true
        dbg('')
        misc.retry_until_success
            f           : @__try_to_connect_once
            log         : dbg
            start_delay : 4000
            max_delay   : 20000
            cb          : =>
                delete @_is_connecting
                dbg("success!")
                cb?()

    # Try to connect exactly once.  cb gets error if and only if fails to connect.
    __try_to_connect_once: (cb) =>
        # timer for giving up on waiting to try to connect
        give_up_timer = undefined

        # actually try to connect
        do_connect = =>
            if give_up_timer
                clearInterval(give_up_timer)
            @_opts.connect(cb)

        # Which event/condition has too be true before we even try to connect.
        if @_opts.no_sign_in
            event = 'connected'
        else
            event = 'signed_in'

        if @_opts.client["is_#{event}"]()
            # The condition is satisfied, so try once to connect.
            do_connect()
        else
            # Wait until condition is satisfied...
            @_opts.client.once(event, do_connect)
            # ... but don't wait forever, in case for some reason we miss
            # the event (this can maybe rarely happen).
            give_up = =>
                @_opts.client.removeListener(event, do_connect)
                cb("timeout")
            timer = setTimeout(give_up, 5000+Math.random()*10000)

class SyncTable extends EventEmitter
    constructor: (@_query, @_options, @_client, @_debounce_interval, @_throttle_changes, @_cache_key) ->
        @_init_query()
        # The value of this query locally.
        @_value_local = undefined

        # Our best guess as to the value of this query on the server,
        # according to queries and updates the server pushes to us.
        @_value_server = undefined

        # The changefeed id, when set by doing a change-feed aware query.
        @_id = undefined

        # Not connected yet
        @_state = 'disconnected'   # disconnected <--> connected --> closed
        @_created = new Date()

        @_plug = new Plug
            name       : @_table
            client     : @_client
            connect    : @_connect
            no_sign_in : @_schema.anonymous or @_client.is_project()  # note: projects don't have to authenticate

        @_client.on('disconnected', (=>@_disconnected('client disconnect')))

        # No throttling of change events unless explicitly requested *or* part of the schema.
        @_throttle_changes ?= schema.SCHEMA[@_table]?.user_query?.get?.throttle_changes

        if not @_throttle_changes
            @emit_change = (changed_keys) => @emit('change', changed_keys)
        else
            # throttle emitting of change events
            all_changed_keys = {}
            do_emit_changes = =>
                #console.log("#{@_table} -- emitting changes", misc.keys(all_changed_keys))
                # CRITICAL: some code depends on emitting change even for the *empty* list of keys!
                # E.g., projects page won't load for new users.  This is the *change* from not
                # loaded to being loaded, which does make sense.
                @emit('change', misc.keys(all_changed_keys))
                all_changed_keys = {}
            do_emit_changes = underscore.throttle(do_emit_changes, @_throttle_changes)
            @emit_change = (changed_keys) =>
                #console.log("#{@_table} -- queue changes", changed_keys)
                for key in changed_keys
                    all_changed_keys[key] = true
                do_emit_changes()



    dbg: (f) =>
        #return @_client.dbg("SyncTable('#{@_table}').#{f}")
        return =>

    _connect: (cb) =>
        dbg = @dbg("connect")
        dbg()
        if @_state == 'closed'
            cb?('closed')
            return
        if @_state == 'connected'
            cb?()
            return
        if @_id?
            @_client.query_cancel(id:@_id)
            @_id = undefined

        async.series([
            (cb) =>
                # 1. save, in case we have any local unsaved changes, then sync with upstream.
                if @_value_local? and @_value_server?
                    @_save(cb)
                else
                    cb()
            (cb) =>
                # 2. Now actually do the changefeed query.
                @_reconnect(cb)
        ], cb)

    _reconnect: (cb) =>
        dbg = @dbg("_run")
        if @_state == 'closed'
            dbg("closed so don't do anything ever again")
            cb?()
            return
        first_resp = true
        this_query_id = undefined
        dbg("do the query")
        @_client.query
            query   : @_query
            changes : true
            timeout : 30
            options : @_options
            cb      : (err, resp) =>

                if @_state == 'closed'
                    # already closed so ignore anything else.
                    return

                if first_resp
                    dbg("query got ", err, resp)
                    first_resp = false
                    if @_state == 'closed'
                        cb?("closed")
                    else if resp?.event == 'query_cancel'
                        cb?("query-cancel")
                    else if err
                        cb?(err)
                    else if not resp?.query?[@_table]?
                        cb?("got no data")
                    else
                        # Successfully completed query
                        this_query_id = @_id = resp.id
                        @_state = 'connected'
                        @_update_all(resp.query[@_table])
                        @emit("connected", resp.query[@_table])  # ready to use!
                        cb?()
                        # Do any pending saves
                        for cb in @_connected_save_cbs ? []
                            @save(cb)
                        delete @_connected_save_cbs
                else
                    if @_state != 'connected'
                        dbg("nothing to do -- ignore these, and make sure they stop")
                        @_client.query_cancel(id:this_query_id)
                        return
                    if err or resp?.event == 'query_cancel'
                        @_disconnected("err=#{err}, resp?.event=#{resp?.event}")
                    else
                        # Handle the update
                        @_update_change(resp)

    _disconnected: (why) =>
        dbg = @dbg("_disconnected")
        dbg("why=#{why}")
        if @_state == 'disconnected'
            dbg("already disconnected")
            return
        if @_id
            @_client.query_cancel(id:@_id)
        @_state = 'disconnected'
        @_plug.connect()  # start trying to connect again

    # Return string key used in the immutable map in which this table is stored.
    key: (obj) =>
        return @_key(obj)

    # Return true if there are changes to this synctable that
    # have NOT been confirmed as saved to the backend database.
    has_uncommitted_changes: () =>
        if not @_value_server? and not @_value_local?
            return false
        if @_value_local? and not @_value_server?
            return true
        return not @_value_server.equals(@_value_local)

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
        @_primary_keys = schema.client_db.primary_keys(@_table)
        # TODO: could put in more checks on validity of query here, using schema...
        for primary_key in @_primary_keys
            if not @_query[@_table][0][primary_key]?
                # must include each primary key in query
                @_query[@_table][0][primary_key] = null
        # Function @_to_key to extract primary key from object
        if @_primary_keys.length == 1
            # very common case
            pk = @_primary_keys[0]
            @_key = (obj) =>
                if not obj?
                    return
                if immutable.Map.isMap(obj)
                    return to_key(obj.get(pk))
                else
                    return to_key(obj[pk])
        else
            # compound primary key
            @_key = (obj) =>
                if not obj?
                    return
                v = []
                if immutable.Map.isMap(obj)
                    for pk in @_primary_keys
                        a = obj.get(pk)
                        if not a?
                            return
                        v.push(a)
                else
                    for pk in @_primary_keys
                        a = obj[pk]
                        if not a?
                            return
                        v.push(a)
                return to_key(v)

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
        if @__is_saving
            cb?("already saving")
        else
            @__is_saving = true
            @__save (err) =>
                @__is_saving = false
                cb?(err)

    __save: (cb) =>
        if @_state == 'closed'
            cb?("closed")
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

        changed = @_changes()
        at_start = @_value_local

        # Send our changes to the server.
        query = []
        saved_objs = []
        # sort so that behavior is more predictable = faster (e.g., sync patches are in
        # order); the keys are strings so default sort is fine
        for key in misc.keys(changed).sort()
            c = changed[key]
            obj = {}
            # NOTE: this may get replaced below with proper javascript, e.g., for compound primary key
            if @_primary_keys.length == 1
                obj[@_primary_keys[0]] = key
            else
                # unwrap compound primary key
                v = JSON.parse(key)
                i = 0
                for primary_key in @_primary_keys
                    obj[primary_key] = v[i]
                    i += 1

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
        #console.log("query=#{misc.to_json(query)}")
        #Use this to test fix_if_no_update_soon:
        #    if Math.random() <= .5
        #        query = []
        #@_fix_if_no_update_soon() # -disabled -- instead use "checking changefeed ids".
        @_client.query
            query   : query
            options : [{set:true}]  # force it to be a set query
            timeout : 30
            cb      : (err) =>
                if err
                    console.warn("_save('#{@_table}') error:", err)
                    cb?(err)
                else
                    if @_state == 'closed'
                        # this can happen in case synctable is closed after _save is called but before returning from this query.
                        cb?("closed")
                        return
                    @emit('saved', saved_objs)
                    # success: each change in the query what committed successfully to the database; we can
                    # safely set @_value_server (for each value) as long as it didn't change in the meantime.
                    for k, v of changed
                        if immutable.is(@_value_server.get(k), v.old_val)  # immutable.is since either could be undefined
                            #console.log "setting @_value_server[#{k}] =", v.new_val?.toJS()
                            @_value_server = @_value_server.set(k, v.new_val)
                    if not at_start.equals(@_value_local)
                        # keep saving until @_value_local doesn't change *during* the save -- this means
                        # when saving stops that we guarantee there are no unsaved changes.
                        @_save(cb)
                    else
                        cb?()

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
            f        : (cb) =>
                misc.retry_until_success
                    f         : @_save
                    max_delay : 5000
                    max_time  : 30000
                    cb        : cb
            interval : @_debounce_interval
            state    : @_save_debounce
            cb       : cb

    # Handle an update of all records from the database.  This happens on
    # initialization, and also if we disconnect and reconnect.
    _update_all: (v) =>
        dbg = @dbg("_update_all")

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
            x[@_key(y)] = y

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

                    if @_value_local.get(key).equals(@_value_server.get(key))
                        # The local value for this key was saved to the backend before
                        # we got disconnected, so there's definitely no need to try
                        # keep it around, given that the backend no longer has it
                        # as part of the query.  CRITICAL: This doesn't necessarily mean
                        # the value was deleted from the database, but instead that
                        # it doesn't satisfy the synctable query, e.g., it isn't one
                        # of the 150 most recent file_use notifications, or it isn't
                        # a patch that is at least as new as the newest snapshot.
                        #console.log("removing local value: #{key}")
                        @_value_local = @_value_local.delete(key)
                        changed_keys.push(key)
                    else
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
            @emit_change(changed_keys)
        else if first_connect
            # First connection and table is empty.
            @emit_change(changed_keys)
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
        if DEBUG
            console.log("_update_change('#{@_table}'): #{misc.to_json(change)}")
        @emit('before-change')
        changed_keys = []
        conflict = false
        if change.new_val?
            conflict = @_handle_new_val(change.new_val, changed_keys)

        if change.old_val? and @_key(change.old_val) != @_key(change.new_val)
            # Delete a record (TODO: untested)
            key = @_key(change.old_val)
            @_value_local = @_value_local.delete(key)
            @_value_server = @_value_server.delete(key)
            changed_keys.push(key)

        #console.log("update_change: changed_keys=", changed_keys)
        if changed_keys.length > 0
            #console.log("_update_change: change")
            @emit_change(changed_keys)
            if conflict
                @save()

    _handle_new_val: (val, changed_keys) =>
        key       = @_key(val)
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
        if @_primary_keys.length == 1
            f = @_client_query.set.fields[@_primary_keys[0]]
            if typeof(f) == 'function'
                return f(obj.toJS(), schema.client_db)
            else
                return
        else
            v = []
            for pk in @_primary_keys
                f = @_client_query.set.fields[pk]
                if typeof(f) == 'function'
                    v.push(f(obj.toJS(), schema.client_db))
                else
                    return
            return v

    # Changes (or creates) one entry in the table.
    # The input field changes is either an Immutable.js Map or a JS Object map.
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
            cb?("type error -- changes must be an immutable.js Map or JS map")
            return

        if DEBUG
            console.log("set('#{@_table}'): #{misc.to_json(changes.toJS())}")

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
        id = @_key(changes)
        if not id?
            # attempt to compute primary key if it is a computed primary key
            id0 = @_computed_primary_key(changes)
            id = to_key(id0)
            if not id? and @_primary_keys.length == 1
                # use a "random" primary key from existing data
                id0 = id = @_value_local.keySeq().first()
            if not id?
                cb?("must specify primary key #{@_primary_keys.join(',')}, have at least one record, or have a computed primary key")
                return
            # Now id is defined
            if @_primary_keys.length == 1
                changes = changes.set(@_primary_keys[0], id0)
            else
                i = 0
                for pk in @_primary_keys
                    changes = changes.set(pk, id0[i])
                    i += 1

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
            @emit_change([id])  # CRITICAL: other code assumes the key is *NOT* sent with this change event!
        return new_val

    close: =>
        if @_state == 'closed'
            # already closed
            return
        # decrement the reference to this synctable
        if global_cache_decref(@)
            # close: not zero -- so don't close it yet -- still in use by multiple clients
            return
        @_client.removeListener('disconnected', @_disconnected)
        # do a last attempt at a save (so we don't lose data), then really close.
        @_save()  # this will synchronously construct the last save and send it
        # The moment the sync part of @_save is done, we remove listeners and clear
        # everything up.  It's critical that as soon as @close is called that there
        # be no possible way any further connect events (etc) can make this SyncTable
        # do anything!!  That finality assumption is made elsewhere (e.g in smc-project/client.coffee)
        @removeAllListeners()
        if @_id?
            @_client.query_cancel(id:@_id)
            delete @_id
        delete @_value_local
        delete @_value_server
        @_state = 'closed'

    # wait until some function of this synctable is truthy
    # (this might be exactly the same code as in the postgres-synctable.coffee SyncTable....)
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

synctables = {}
# for debugging; in particular, verify that synctables are freed.
# Do not leave in production; could be slight security risk.
## window?.synctables = synctables

exports.sync_table = (query, options, client, debounce_interval=2000, throttle_changes=undefined) ->

    cache_key = json_stable_stringify(query:query, options:options, debounce_interval:debounce_interval, throttle_changes:throttle_changes)
    S = synctables[cache_key]
    if S?
        if S._state == 'connected'
            # same behavior as newly created synctable
            async.nextTick () ->
                if S._state == 'connected'
                    S.emit('connected')
        S._reference_count += 1
        return S
    else
        S = synctables[cache_key] = new SyncTable(query, options, client, debounce_interval, throttle_changes, cache_key)
        S._reference_count = 1
        return S

global_cache_decref = (S) ->
    if S._reference_count?
        S._reference_count -= 1
        if S._reference_count <= 0
            delete synctables[S._cache_key]
            return false  # not in use
        else
            return true   # still in use

#if window?
#    window.synctables = synctables
