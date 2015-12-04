###

SageMathCloud, Copyright (C) 2015, William Stein

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

---

RethinkDB-backed time-log database-based synchronized editing

[Describe algorithm here]
###

{EventEmitter} = require('events')

node_uuid = require('node-uuid')

diffsync  = require('./diffsync')
misc      = require('./misc')

{diff_match_patch} = require('./dmp')
dmp = new diff_match_patch()
dmp.Diff_Timeout = 0.2

{defaults, required} = misc

# patch that transforms s0 into s1
exports.make_patch = make_patch = (s0, s1) ->
    return diffsync.compress_patch(dmp.patch_make(s0, s1))

exports.apply_patch = apply_patch = (patch, s) ->
    x = dmp.patch_apply(diffsync.decompress_patch(patch), s)
    clean = true
    for a in x[1]
        if not a
            clean = false
            break
    return [x[0], clean]

apply_patch_sequence = (patches, s) ->
    for x in patches
        s = apply_patch(x.patch, s)[0]
    return s

patch_cmp = (a, b) -> misc.cmp_array([a.time, a.user], [b.time, b.user])

# Sorted list of patches applied to a string
class SortedPatchList
    constructor: (string) ->
        @_patches = []
        @_string = string
        @_times = {}

    add: (patches) =>
        v = []
        for x in patches
            if x? and not @_times[x.time - 0]
                v.push(x)
                @_times[x.time - 0] = true
        if @_cache?
            # if any patch introduced is as old as cached result, then clear cache, since can't build on it
            for x in v
                if x.time <= @_cache.patch.time
                    delete @_cache
                    break
        # this is O(n*log(n)) where n is the length of @_patches and patches;
        # better would be an insertion sort which would be O(m*log(n)) where m=patches.length...
        @_patches = @_patches.concat(v)
        @_patches.sort(patch_cmp)

    # if optional time is given only include patches up to (and including) the given time
    value: (time) =>
        if time? and not misc.is_date(time)
            throw Error("time must be a date")
        if not time? and @_cache?
            s = @_cache.value
            for x in @_patches.slice(@_cache.start, @_patches.length)
                s = apply_patch(x.patch, s)[0]
        else
            s = @_string
            for x in @_patches
                if time? and x.time > time
                    break
                s = apply_patch(x.patch, s)[0]
        if not time? and x?   # x? = there was at least one new patch
            @_cache = {patch:x, value:s, start:@_patches.length}
        return s



# The SyncString class, which enables synchronized editing of a
# document that can be represented by a string.
# Fires a 'change' event whenever the document is changed *remotely*, and also once when document is initialized.
class SyncDoc extends EventEmitter
    constructor: (opts) ->
        opts = defaults opts,
            save_interval : 1000
            string_id : required
            client    : required
            doc       : required   # String-based document that we're editing.  This must have methods:
                # get -- returns a string: the live version of the document
                # set -- takes a string as input: sets the live version of the document to this.
        @_closed = true
        @_string_id = opts.string_id
        @_client    = opts.client
        @_doc       = opts.doc
        @_save_interval = opts.save_interval
        @connect()

    # Used for internal debug logging
    dbg: (f) ->
        return (m...) -> console.log("SyncString.#{f}: ", m...)

    # Version of the document at a given point in time
    version: (time) =>
        return @_patch_list.value(time)

    # List of timestamps of the versions of this string after
    # the last snapshot
    versions: =>
        m = @_patches_table.get()
        v = []
        m.map (x, id) =>
            key = x.get('id').toJS()
            v.push(key[1])
        v.sort()
        return v

    # Close synchronized editing of this string; this stops listening
    # for changes and stops broadcasting changes.
    close: =>
        @_syncstring_table.close()
        @_patches_table.close()
        @_closed = true

    reconnect: (cb) =>
        @close()
        @connect(cb)

    connect: (cb) =>
        if not @_closed
            cb("already connected")
            return
        query =
            syncstrings :
                string_id : @_string_id
                users     : null
                snapshot  : null
        @_syncstring_table = @_client.sync_table(query)

        @_syncstring_table.once 'change', =>
            @_handle_syncstring_update()
            @_syncstring_table.on('change', @_handle_syncstring_update)
            @_patch_list = new SortedPatchList(@_snapshot.string)

            query =
                patches :
                    id    : [@_string_id, @_snapshot.time]
                    patch : null
            @_patches_table = @_client.sync_table(query,{},250)
            @_patches_table.once 'change', =>
                @_patch_list.add(@_get_patches())
                value = @_patch_list.value()
                @_last = value
                @_doc.set(value)
                @_patches_table.on('change', @_handle_patch_update)
                @_closed = false
                @emit('change')
                cb?()

    # save any changes we have as a new patch; returns value
    # of live document at time of save
    _save: (cb) =>
        #dbg = @dbg('_save'); dbg()
        dbg = =>
        if @_closed
            dbg("string closed -- can't save")
            cb?("string closed")
            return
        value = @_doc.get()
        if not value?
            dbg("string not initialized -- can't save")
            cb?("string not initialized")
            return
        #dbg("saving at ", new Date())
        if value == @_last
            #dbg("nothing changed so nothing to save")
            cb?()
            return value
        # compute transformation from last to live -- exactly what we did
        patch = make_patch(@_last, value)
        @_last = value
        # now save the resulting patch
        time = @_client.server_time()
        obj =
            id    : [@_string_id, time, @_user_id]
            patch : patch
        #dbg('attempting to save patch ', time, JSON.stringify(obj))
        x = @_patches_table.set(obj, 'none', cb)
        @_patch_list.add([@_process_patch(x)])
        return value

    # Save current live string to backend.  It's safe to call this frequently,
    # since it will debounce itself.
    save: (cb) =>
        @_save_debounce ?= {}
        misc.async_debounce
            f        : @_save
            interval : @_save_interval
            state    : @_save_debounce
            cb       : cb

    # Create and store in the database a snapshot of the state
    # of the string at the given point in time.  This should
    # be the time of an existing patch.
    snapshot: (time, cb) =>
        if not misc.is_date(time)
            throw Error("time must be a date")
        s = @_patch_list.value(time)
        # save the snapshot in the database
        @_snapshot = {string:s, time:time}
        @_syncstring_table.set({string_id:@_string_id, snapshot:@_snapshot}, cb)

    _process_patch: (x, time0, time1) =>
        if not x?  # we allow for x itself to not be defined since that simplifies other code
            return
        key = x.get('id').toJS()
        time = key[1]; user = key[2]
        if time < @_snapshot.time
            return
        if time0? and time <= time0
            return
        if time1? and time > time1
            return
        obj =
            time  : time
            user  : user
            patch : x.get('patch').toJS()
        return obj

    # return all patches with time such that time0 < time <= time1;
    # if time0 undefined then sets equal to time of snapshot; if time1 undefined treated as +oo
    _get_patches: (time0, time1) =>
        time0 ?= @_snapshot.time
        m = @_patches_table.get()  # immutable.js map with keys the globally unique patch id's (sha1 of time_id and string_id)
        v = []
        m.map (x, id) =>
            p = @_process_patch(x, time0, time1)
            if p?
                v.push(p)
        v.sort(patch_cmp)
        return v

    show_history: =>
        s = @_snapshot.string
        i = 0
        for x in @_get_patches()
            console.log(x.user, x.time, JSON.stringify(x.patch))
            t = apply_patch(x.patch, s)
            s = t[0]
            console.log(i, "   ", t[1], misc.trunc_middle(s,100).trim())
            i += 1
        return

    _handle_syncstring_update: =>
        x = @_syncstring_table.get_one()?.toJS()
        #dbg = @dbg("_handle_syncstring_update")
        #dbg(JSON.stringify(x))
        # TODO: potential races, but it will (or should!?) get instantly fixed when we get an update in case of a race (?)
        if not x?
            # Brand new document
            @_snapshot = {string:@_doc.get(), time:0}
            # brand new syncstring
            @_user_id = 0
            @_users = [@_client.account_id]
            @_syncstring_table.set({string_id:@_string_id, snapshot:@_snapshot, users:@_users})
        else
            @_snapshot = x.snapshot
            @_users    = x.users
            @_user_id = @_users.indexOf(@_client.account_id)
            if @_user_id == -1
                @_user_id = @_users.length
                @_users.push(@_client.account_id)
                @_syncstring_table.set({string_id:@_string_id, users:@_users})

    # update of remote version -- update live as a result.
    _handle_patch_update: (changed_keys) =>
        if not changed_keys?
            # this happens right now when we do a save.
            return
        #dbg = @dbg("_handle_patch_update")
        #dbg(new Date(), changed_keys)

        if changed_keys?     # note: other code handles that @_patches_table.get(key) may not be defined, e.g., when changed means "deleted"
            @_patch_list.add( (@_process_patch(@_patches_table.get(key)) for key in changed_keys) )

        # Save any unsaved changes we might have made locally.
        # This is critical to do, since otherwise the remote
        # changes would likely overwrite the local ones.
        live = @_save()

        # compute result of applying all patches in order to snapshot
        new_remote = @_patch_list.value()
        # if document changed, set to new version
        if live != new_remote
            @_last = new_remote
            @_doc.set(new_remote)
            @emit('change')

# A simple example of a document.  Uses this one by default
# if nothing explicitly passed in for doc in SyncString constructor.
class StringDocument
    constructor: (@_value='') ->
    set: (value) ->
        @_value = value
    get: ->
        @_value


class exports.SyncString extends SyncDoc
    constructor: (opts) ->
        opts = defaults opts,
            id      : required
            client  : required
            default : ''
        super
            string_id : opts.id
            client    : opts.client
            doc       : new StringDocument(opts.default)

    set: (value) ->
        @_doc.set(value)

    get: ->
        @_doc.get()

# A document that represents an arbitrary JSON-able Javascript object.
class ObjectDocument
    constructor: (@_value={}) ->
    set: (value) ->
        try
            @_value = misc.from_json(value)
        catch err
            console.warn("error parsing JSON", err)
            # leaves @_value unchanged, so JSON stays valid
    get: ->
        misc.to_json(@_value)
    # Underlying Javascript object -- safe to directly edit
    obj: ->
        return @_value

class exports.SyncObject extends SyncDoc
    constructor: (opts) ->
        opts = defaults opts,
            id      : required
            client  : required
            default : {}
        super
            string_id : opts.id
            client    : opts.client
            doc       : new ObjectDocument(opts.default)
    set: (obj) =>
        @_doc._value = obj
    get: =>
        @_doc.obj()

