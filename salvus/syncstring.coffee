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

class SyncString extends EventEmitter
    constructor: (@id, @client, cb) ->
        if not @id?
            throw Error("must specify id")
        if not @client?
            throw Error("must specify client")
        @_our_patches = {}
        query =
            syncstring:
                id         : @id
                time_id    : null
                account_id : null
                patch      : null
        @_table = @client.sync_table(query)
        @_table.once 'change', =>
            @_last = @_live = @_last_remote = @_remote()
            @_table.on 'change', @_handle_update
            cb?()

        # Patches that we are trying to sync.
        # This is a map from time_id to the patch.
        # We remove something from this queue when we see it show up in the updates
        # coming back from the server.  Otherwise we keep retrying.
        @_sync_queue = {}

    set_live: (live) =>
        @_live = live

    get_live: =>
        return @_live

    close: =>
        @_closed = true
        @_table.close()

    sync: =>
        if not @_live?
            return
        console.log('sync at ', new Date())
        # 1. compute diff between live and last
        if @_live == @_last
            console.log("sync: no change")
            cb?(); return
        patch = diffsync.dmp.patch_make(@_last, @_live)
        # 2. apply to remote to get new_remote
        remote = @_remote()
        new_remote = diffsync.dmp.patch_apply(patch, remote)[0]
        if new_remote == remote
            console.log("sync: patch doesn't change remote", patch)
            console.log("remote=", remote)
            console.log("new_remote=", new_remote)
            @_last = @_live
            cb?(); return
        # 3. compute diff between remote and new_remote
        patch = diffsync.dmp.patch_make(remote, new_remote)
        # 4. sync resulting patch to database.
        @_last = @_live
        @_sync_patch(patch)

    _sync_patch: (patch) =>
        time_id = node_uuid.v1()
        f = (cb) =>
            console.log("_sync_patch ", time_id)
            if @_closed
                cb()
                return
            @_table.set
                time_id : time_id
                id      : @id
                patch   : diffsync.compress_patch(patch),
                cb
        misc.retry_until_success(f:f)

    _get_patches: () =>
        m = @_table.get()  # immutable.js map
        v = []
        m.map (x, time_id) =>
            v.push
                timestamp  : new Date(uuid_time.v1(time_id))
                account_id : x.get('account_id')
                patch      : diffsync.decompress_patch(x.get('patch').toJS())
        v.sort (a,b) -> misc.cmp(a.timestamp, b.timestamp)
        return v

    # Return the "remote" version of the string, which is what is defined by
    # our view of the current state of the database.   This is
    # the result of applying one after the other all of the patches
    # returned by @_get_patches to the starting string (which is '' for now).
    _remote: =>
        s = ''
        for x in @_get_patches()
            s = diffsync.dmp.patch_apply(x.patch, s)[0]
        return s

    _show_log: =>
        s = ''
        for x in @_get_patches()
            console.log(x.timestamp, JSON.stringify(x.patch))
            s = diffsync.dmp.patch_apply(x.patch, s)[0]
            console.log("    '#{s}'")
            
    _remote1: =>
        s = ''
        for x in @_get_patches()
            s = diffsync.dmp.patch_apply(x.patch, s)[0]
        return s


    # update of remote version -- update live as a result.
    _handle_update: =>
        console.log("update at ", new Date())
        # 1. compute current remote
        remote = @_remote()
        # 2. apply what have we changed since we last sent off our changes
        if @_last != @_live
            patch = diffsync.dmp.patch_make(@_last, @_live)
            new_ver = diffsync.dmp.patch_apply(patch, remote)[0]
            # send off new change... if the patch had an impact.
            if new_ver != remote
                new_patch = diffsync.dmp.patch_make(remote, new_ver)
                @_sync_patch new_patch, (err) =>
                    if err
                        console.log("failed to sync update patch", patch, err)
                    else
                        console.log("syncd update patch", patch)
        else
            new_ver = remote
        @_last = @_live = new_ver

exports.SyncString = SyncString
