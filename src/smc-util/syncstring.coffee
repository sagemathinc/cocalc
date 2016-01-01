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

# Touch syncstring every so often so that it stays opened in the local hub,
# when the local hub is running.
TOUCH_INTERVAL_M = 10

{EventEmitter} = require('events')
immutable = require('immutable')

node_uuid = require('node-uuid')
async     = require('async')

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

    # integer index of user who made the edit at given point in time (or undefined)
    user: (time) =>
        for x in @_patches
            if x.time - time == 0
                return x.user

# The SyncDoc class, which enables synchronized editing of a
# document that can be represented by a string.
# Fires a 'change' event whenever the document is changed *remotely* (NOT locally),
# and also once when document is initialized.
class SyncDoc extends EventEmitter
    constructor: (opts) ->
        opts = defaults opts,
            save_interval : 1000
            string_id     : undefined
            project_id    : undefined  # optional project_id that contains the doc (not all syncdocs are associated with a project)
            path          : undefined  # optional path of the file corresponding to the doc (not all syncdocs associated with a path)
            client        : required
            doc           : required   # String-based document that we're editing.  This must have methods:
                # get -- returns a string: the live version of the document
                # set -- takes a string as input: sets the live version of the document to this.

        if not opts.string_id?
            if not opts.project_id? or not opts.path?
                throw "if string_id is not given, then project_id and path must both be given"
            opts.string_id = require('smc-util/schema').client_db.sha1(opts.project_id, opts.path)
        @_closed         = true
        @_string_id     = opts.string_id
        @_project_id    = opts.project_id
        @_path          = opts.path
        @_client        = opts.client
        @_doc           = opts.doc
        @_save_interval = opts.save_interval
        @connect (err) =>
            if err
                console.warn("error creating SyncDoc: '#{err}'")
                @emit('error', err)

    # Used for internal debug logging
    dbg: (f) ->
        return @_client.dbg("SyncString.#{f}:")

    # Version of the document at a given point in time; if no
    # time specified, gives the version right now.
    version: (time) =>
        return @_patch_list.value(time)

    # account_id of the user who made the edit at
    # the given point in time.
    account_id: (time) =>
        return @_users[@user(time)]

    # integer index of user who made the edit at given
    # point in time.
    user: (time) =>
        return @_patch_list.user(time)

    # Indicate active interest in syncstring; only updates time
    # if last_active is at least min_age_m=5 minutes old (so this can be safely
    # called frequently without too much load).
    touch: (min_age_m=5) =>
        last_active = @_syncstring_table.get_one().get('last_active')
        if not last_active? or last_active <= misc.minutes_ago(min_age_m)
            @_syncstring_table.set
                string_id   : @_string_id
                last_active : new Date()

    # List of timestamps of the versions of this string after
    # the last snapshot
    versions: () =>
        v = []
        @_patches_table.get().map (x, id) =>
            key = x.get('id').toJS()
            v.push(key[1])
        v.sort()
        return v

    last_changed: () =>
        v = @versions()
        if v.length > 0
            return v[v.length-1]

    # Close synchronized editing of this string; this stops listening
    # for changes and stops broadcasting changes.
    close: =>
        if @_periodically_touch?
            clearInterval(@_periodically_touch)
            delete @_periodically_touch
        @_syncstring_table?.close()
        @_patches_table?.close()
        @_cursors?.close()
        @_closed = true
        @_update_watch_path()  # no input = closes it

    reconnect: (cb) =>
        @close()
        @connect(cb)

    connect: (cb) =>
        if not @_closed
            cb("already connected")
            return
        query =
            syncstrings :
                string_id   : @_string_id
                project_id  : null
                path        : null
                users       : null
                snapshot    : null
                save        : null
                last_active : null
        @_syncstring_table = @_client.sync_table(query)

        @_syncstring_table.once 'change', =>
            @_handle_syncstring_update()
            @_syncstring_table.on('change', @_handle_syncstring_update)
            async.series([
                (cb) =>
                    async.parallel([@_init_patch_list, @_init_cursors], cb)
                (cb) =>
                    @_closed = false
                    if @_client.is_user() and not @_periodically_touch?
                        @touch()
                        # touch every few minutes while syncstring is open, so that backend local_hub
                        # (if open) keeps its side open
                        @_periodically_touch = setInterval(@touch, 1000*60*TOUCH_INTERVAL_M)
                    if @_client.is_project()
                        @_load_from_disk_if_newer(cb)
                    else
                        cb()
            ], (err) =>
                if err
                    cb(err)
                else
                    @emit('change')
                    cb()
            )

    _load_from_disk_if_newer: (cb) =>
        tm     = @last_changed()
        dbg    = @_client.dbg("syncstring._load_from_disk_if_newer('#{@_path}')")
        exists = undefined
        async.series([
            (cb) =>
                dbg("check if path exists")
                @_client.path_exists
                    path : @_path
                    cb   : (err, _exists) =>
                        dbg("got #{err}, #{_exists}")
                        exists = _exists
                        cb(err)
            (cb) =>
                if tm?
                    dbg("edited before, so stat file")
                    @_client.path_stat
                        path : @_path
                        cb   : (err, stats) =>
                            if err
                                cb(err)
                            else if stats.ctime > tm
                                dbg("disk file changed more recently than edits, so loading")
                                @_load_from_disk(cb)
                            else
                                dbg("stick with database version")
                                cb()
                else
                    dbg("never edited before")
                    if exists
                        dbg("path exists, so load from disk")
                        @_load_from_disk(cb)
                    else
                        cb()
        ], cb)

    _init_patch_list: (cb) =>
        @_patch_list = new SortedPatchList(@_snapshot.string)
        query =
            patches :
                id    : [@_string_id, @_snapshot.time]
                patch : null
        @_patches_table = @_client.sync_table(query, {}, 250)
        @_patches_table.once 'change', =>
            @_patch_list.add(@_get_patches())
            value = @_patch_list.value()
            @_last = value
            @_doc.set(value)
            @_patches_table.on('change', @_handle_patch_update)
            cb()

    _init_cursors: (cb) =>
        if not @_client.is_user()
            # only the users care about cursors.
            cb()
        else
            query =
                cursors :
                    doc_id : @_string_id
                    id     : null
                    locs   : null
                    time   : null
                    caused : null
            @_cursors = @_client.sync_table(query)
            @_cursors.once 'change', =>
                # cursors now initialized; first initialize the local @_cursor_map,
                # which tracks positions of cursors by account_id:
                @_cursor_map = immutable.Map()
                @_cursors.get().map (locs, k) =>
                    @_cursor_map = @_cursor_map.set(@_users[JSON.parse(k)?[1]], locs)
                cb()

            # @_other_cursors is an immutable.js map from account_id's
            # to list of cursor positions of *other* users (starts undefined).
            @_cursor_map = undefined
            @_cursors.on 'change', (keys) =>
                for k in keys
                    account_id = @_users[JSON.parse(k)?[1]]
                    @_cursor_map = @_cursor_map.set(account_id, @_cursors.get(k))
                    @emit('cursor_activity', account_id)

    set_cursor_locs: (locs, caused=true) =>
        x =
            id   : [@_string_id, @_user_id]
            locs : locs
            time : @_client.server_time()
            caused : caused   # true if move was caused by user; false if caused by some remote change
        @_cursors?.set(x,'none')
        return

    # returns immutable.js map from account_id to list of cursor positions
    get_cursors: =>
        return @_cursor_map

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
        m = @_patches_table.get()  # immutable.js map with keys the string that is the JSON version of the primary key [string_id, timestamp, user_number].
        v = []
        m.map (x, id) =>
            p = @_process_patch(x, time0, time1)
            if p?
                v.push(p)
        v.sort(patch_cmp)
        return v

    show_history: (opts={}) =>
        opts = defaults opts,
            milliseconds : false
        s = @_snapshot.string
        i = 0
        for x in @_get_patches()
            tm = x.time
            if opts.milliseconds then tm = tm - 0
            console.log(x.user, tm, JSON.stringify(x.patch))
            t = apply_patch(x.patch, s)
            s = t[0]
            console.log(i, "   ", t[1], misc.trunc_middle(s,100).trim())
            i += 1
        return

    get_path: =>
        return @_syncstring_table.get_one().get('path')

    get_project_id: =>
        return @_syncstring_table.get_one().get('project_id')

    set_path: (path) =>
        @_syncstring_table.set(@_syncstring_table.get_one().set('path',path))
        return

    set_project_id: (project_id) =>
        @_syncstring_table.set(@_syncstring_table.get_one().set('project_id',project_id))
        return

    _handle_syncstring_update: =>
        x = @_syncstring_table.get_one()?.toJS()
        #dbg = @dbg("_handle_syncstring_update")
        #dbg(JSON.stringify(x))
        # TODO: potential races, but it will (or should!?) get instantly fixed when we get an update in case of a race (?)
        client_id = @_client.client_id()
        if not x?
            # Brand new document
            @_snapshot = {string:@_doc.get(), time:0}
            # brand new syncstring
            @_user_id = 0
            @_users = [client_id]
            obj = {string_id:@_string_id, snapshot:@_snapshot, users:@_users}
            if @_project_id?
                obj.project_id = @_project_id
            if @_path?
                obj.path = @_path
            @_syncstring_table.set(obj)
        else
            @_snapshot   = x.snapshot
            @_users      = x.users
            @_project_id = x.project_id
            @_path       = x.path

            # Ensure that this client is in the list of clients
            @_user_id = @_users.indexOf(client_id)
            if @_user_id == -1
                @_user_id = @_users.length
                @_users.push(client_id)
                @_syncstring_table.set({string_id:@_string_id, users:@_users})

            if @_client.is_project()
                # If client is project and save is requested, start saving...
                if x.save?.state == 'requested'
                    if not @_patch_list?
                        # requested to save, but we haven't even loaded the document yet -- when we do, then save.
                        @on 'change', =>
                            @_save_to_disk()
                    else
                        @_save_to_disk()
                # If client is a project and path isn't being properly watched, make it so.
                if x.project_id? and @_watch_path != x.path
                    @_update_watch_path(x.path)
        @emit('metadata-change')

    _update_watch_path: (path) =>
        if @_gaze_file_watcher?
            @_gaze_file_watcher.close()
            delete @_gaze_file_watcher
        if not path?
            return
        async.series([
            (cb) =>
                # write current version of file to path if it doesn't exist
                @_client.path_exists
                    path : path
                    cb   : (err, exists) =>
                        if exists and not err
                            cb()
                        else
                            @_client.write_file
                                path : path
                                data : @version()
                                cb   : cb
            (cb) =>
                # now setup watcher (which wouldn't work if there was no file)
                @_client.watch_file
                    path : path
                    cb   : (err, watcher) =>
                        if err
                            cb(err)
                        else
                            @_gaze_file_watcher?.close()  # if it somehow got defined by another call, close it first
                            @_gaze_file_watcher = watcher
                            @_watch_path = path
                            watcher.on 'changed', =>
                                if @_save_to_disk_just_happened
                                    @_save_to_disk_just_happened = false
                                else
                                    @_load_from_disk()
        ])

    _load_from_disk: (cb) =>
        path = @get_path()
        dbg = @_client.dbg("syncstring._load_from_disk('#{path}')")
        dbg()
        @_client.read_file
            path : path
            cb   : (err, data) =>
                if err
                    dbg("failed -- #{err}")
                    cb?(err)
                else
                    dbg("got it")
                    @set(data)
                    @save(cb)

    _set_save: (x) =>
        @_syncstring_table.set(@_syncstring_table.get_one().set('save', x))
        return

    # Returns true if the current live version of this document has a different hash
    # than the version mostly recently saved to disk.
    has_unsaved_changes:   => misc.hash_string(@get()) != @hash_of_saved_version()

    # Returns hash of last version saved to disk (as far as we know).
    hash_of_saved_version: => @_syncstring_table.get_one().getIn(['save', 'hash'])

    save_to_disk: (cb) =>
        @_save_to_disk()
        if cb?
            @_syncstring_table.wait
                until   : (table) -> table.get_one().getIn(['save','state']) == 'done'
                timeout : 30
                cb      : (err) =>
                    if not err
                        err = @_syncstring_table.get_one().getIn(['save', 'error'])
                    cb(err)

    # Save this file to disk, if it is associated with a project and has a filename.
    # A user (web browsers) sets the save state to requested.
    # The project sets the state to saving, does the save to disk, then sets the state to done.
    _save_to_disk: () =>
        path = @get_path()
        dbg = @dbg("_save_to_disk('#{path}')")
        if not path
            @_set_save(state:'done', error:'cannot save without path')
            return
        if @_client.is_project()
            dbg("write to disk file")
            data = @version()
            @_save_to_disk_just_happened = true
            @_client.write_file
                path : path
                data : data
                cb   : (err) =>
                    #dbg("returned from write_file: #{err}")
                    if err
                        @_set_save(state:'done', error:err)
                    else
                        @_set_save(state:'done', error:false, hash:misc.hash_string(data))
        else
            # browser client
            if not @get_project_id()
                @_set_save(state:'done', error:'cannot save without project')
            else
                dbg("send request to save")
                @_set_save(state:'requested', error:false)

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
            id         : undefined
            client     : required
            project_id : undefined
            path       : undefined
            save_interval : undefined
            default    : ''
        super
            string_id  : opts.id
            client     : opts.client
            project_id : opts.project_id
            path       : opts.path
            save_interval : opts.save_interval
            doc        : new StringDocument(opts.default)


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

