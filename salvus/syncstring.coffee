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

uuid_time = require('uuid-time')
node_uuid = require('node-uuid')
diffsync  = require('diffsync')
misc      = require('misc')

# patch that transforms s0 into s1
exports.make_patch = make_patch = (s0, s1) ->
    return diffsync.compress_patch(diffsync.dmp.patch_make(s0, s1))

exports.apply_patch = apply_patch = (patch, s) ->
    x = diffsync.dmp.patch_apply(diffsync.decompress_patch(patch), s)
    clean = true
    for a in x[1]
        if not a
            clean = false
            break
    return [x[0], clean]

class SyncString extends EventEmitter
    constructor: (@string_id, @client) ->
        if not @string_id?
            throw Error("must specify string_id")
        if not @client?
            throw Error("must specify client")
        query =
            syncstring:
                id         : [@string_id, null]
                account_id : null
                patch      : null
        @_table = @client.sync_table(query)
        @_table.once 'change', =>
            @_last = @_live = @_last_remote = @_remote()
            @_table.on 'change', @_handle_update

    dbg: (f) ->
        (m...) -> console.log("SyncString.#{f}: ", m...)

    # set or get live version of this synchronized string
    live: (live) =>
        if live?
            @_live = live
        else
            return @_live

    # close synchronized editing of this string
    close: =>
        @_closed = true
        @_table.close()

    # save any changes we have to the backend
    save: (cb) =>
        dbg = @dbg('save')
        if @_closed
            dbg("string closed -- can't save")
            return
        if not @_live?
            dbg("string not initialized -- can't save")
            return
        dbg("syncing at ", new Date())
        if @_live == @_last
            dbg("nothing changed so nothing to save")
            return
        # compute transformation from last to live -- exactly what we did
        patch = make_patch(@_last, @_live)
        @_last = @_live
        # now save the resulting patch
        time_id = node_uuid.v1()
        dbg('attempting to save patch ', time_id, JSON.stringify(patch))
        @_table.set({id: [@string_id, time_id], patch: patch}, 'none', cb)

    _get_patches: () =>
        m = @_table.get()  # immutable.js map with keys the globally unique patch id's (sha1 of time_id and string_id)
        v = []
        m.map (x, id) =>
            v.push
                timestamp  : new Date(uuid_time.v1(x.get('id').get(1)))
                account_id : x.get('account_id')
                patch      : x.get('patch').toJS()
        v.sort (a,b) -> misc.cmp(a.timestamp, b.timestamp)
        return v

    # Return the "remote" version of the string, which is what is defined by
    # our view of the current state of the database.   This is
    # the result of applying one after the other all of the patches
    # returned by @_get_patches to the starting string (which is '' for now).
    _remote: =>
        s = ''
        for x in @_get_patches()
            s = apply_patch(x.patch, s)[0]
        return s

    _remote1: =>
        s = ''
        for x in @_get_patches()
            s = apply_patch(x.patch, s)[0]
        return s

    _show_log: =>
        s = ''
        for x in @_get_patches()
            console.log(x.timestamp, JSON.stringify(x.patch))
            t = apply_patch(x.patch, s)
            s = t[0]
            console.log("   ", t[1], misc.trunc_middle(s,100).trim())

    # update of remote version -- update live as a result.
    _handle_update: =>
        dbg = @dbg("_handle_update")
        dbg(new Date())
        # save any changes we have made
        if @_last != @_live
            @save()
        # compute result of applying all patches in order
        new_remote = @_remote()
        # if document changed, set live to new version
        if @_live != new_remote
            @emit('change')
            @_last = @_live = new_remote

exports.SyncString = SyncString
