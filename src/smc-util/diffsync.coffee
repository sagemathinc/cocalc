###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


###################################################################
#
# Code to support simultaneous multiple editing
# sessions by different clients of a single object.  This uses
# the Differential Synchronization algorithm of Neil Fraser,
# which is the same thing that Google Docs uses.
#
#   * "Differential Synchronization" (by Neil Fraser).
#   * http://neil.fraser.name/writing/sync/
#   * http://www.youtube.com/watch?v=S2Hp_1jqpY8
#   * http://code.google.com/p/google-diff-match-patch/
#
# SYMMETRY: The implementation below is completely symmetric.  However,
# you *cannot* randomly initiate the synchronization from either the
# "client" or "server" -- if one of the two initiates a sync, then
# that one has to stay the initiater until the sync succeeds. E.g.,
# if you run
#             client.push_edits( (err) =>
#                if not err
#                    server.push_edits()
#             )
# then do not suddenly do "server.push_edits..." until we do not get
# an error above.
###################################################################
# FOR TESTING:
# coffee  -o node_modules -c diffsync.coffee && echo "require('diffsync').test1()" | coffee

SIMULATE_LOSS = false
#SIMULATE_LOSS = true

exports.MAX_SAVE_TIME_S = MAX_SAVE_TIME_S = 30

async = require('async')
{EventEmitter} = require('events')

{diff_match_patch} = require('./dmp')

# maximum time in seconds that diff_main will BLOCK optimizing the diff -- see https://code.google.com/p/google-diff-match-patch/wiki/API

dmp = new diff_match_patch()

# We set a short maximum time to try to make a patch; if exceeds this, patch may
# be very non-optimal, but still valid.  This is important to maintain user
# interactivity in a single-threaded context (which Javascript provides).
# NOTE: I had to significantly modify the code at
#    https://code.google.com/p/google-diff-match-patch/wiki/API
# to make Diff_Timeout actually work!  Hence the file node_modules/dmp.coffee, in
# the git repo.
dmp.Diff_Timeout = 0.2

dmp.Match_Threshold = 0.3   # make matching more conservative
dmp.Patch_DeleteThreshold = 0.3  # make deleting more conservative


exports.dmp = dmp

misc = require('./misc')
{defaults, required, hash_string, len} = misc

# debug = (s) ->
#     w = 'winston'
#     try
#         require(w).debug(s)
#     catch e
#         # nothing

class DiffSync extends EventEmitter  #not used here, but may be in derived classes
    constructor: (opts) ->
        @init(opts)

    # NOTE: We're using init instead of a constructor and super()
    # because inheritence doesn't seem to work right across exports in
    # coffeescript... this took me 2 hours to figure out :-(.  This is used
    # in local_hub.coffee :-(
    init: (opts) =>
        opts = defaults opts,
            id   : undefined
            doc  : required
        if not opts.id?
            @id = misc.uuid()
        else
            @id = opts.id
        @live                  = opts.doc
        @shadow                = @_copy(@live)
        @backup_shadow         = @_copy(@shadow)
        @shadow_version        = 0
        @backup_shadow_version = 0
        @last_version_received = -1
        @edit_stack            = []

    # This can be overloaded in a derived class
    snapshot: (cb) => # cb(err, snapshot of live document)
        cb(false, @_copy(@live))

    # Copy a document; strings are immutable and the default, so we
    # just return the object.
    _copy: (doc) =>
        return doc

    # Determine array of edits between the two versions of the document
    _compute_edits: (version0, version1) =>
        return dmp.patch_make(version0, version1)

    # "Best effort" application of array of edits.
    _apply_edits: (edits, doc, cb) =>
        cb?(false, dmp.patch_apply(edits, doc)[0])

    _apply_edits_to_live: (edits, cb) =>
        @_pre_apply_edits_to_live?()
        @_apply_edits  edits, @live, (err, result) =>
            if err
                cb?(err); return
            else
                @live = result
                cb?()

    # Return a checksum of a document
    _checksum: (doc) =>
        return doc.length

    ###############################################################
    # API:
    #
    #   * connect -- use to connect the client and the remote
    #   * push_edits -- compute and push collection of edits out
    #   * recv_edits -- receive edits and apply them, then send ack.
    #
    ###############################################################

    # Connect this client to the other end of the connection, the "server".
    connect: (remote) =>
        @remote = remote

    # Do a complete sync cycle; cb() on success and cb(true) if anything goes wrong.
    # In case of failure, do *not* initiate a sync from the other side!
    # Also, cb('reset') in case of an non-recoverable data corruption error.
    sync: (cb) =>
        @push_edits (err) =>
            if err
                cb(err)
            else
                @remote.push_edits(cb)

    # Create a list of new edits, then send all edits not yet
    # processed to @remote, if defined.  If @remote, not defined then
    #     cb(undefined, edit_stack, last_version_received)
    # caller, please don't modify edit_stack!
    push_edits: (cb) =>    #
        @snapshot (err, snapshot) =>
            if err
                cb?(err); return

            if not snapshot?
                cb?("snapshot computed in push_edits is undefined"); return

            edits = {edits:@_compute_edits(@shadow, snapshot)}

            if edits.edits.length > 0
                edits.shadow_version  = @shadow_version
                edits.shadow_checksum = @_checksum(@shadow)
                @edit_stack.push(edits)
                @shadow          = snapshot
                @shadow_version += 1

            if SIMULATE_LOSS and Math.random() < .5  # Simulate packet loss
                console.log("Simulating loss!"); cb?(true); return

            # Push any remaining edits from the stack, *AND* report the last version we have received so far.
            #console.log("DiffSync.push_edits: push any remaining edits from the stack, *AND* report the last version (=#{@last_version_received}) we have received so far.")
            if @remote?
                @remote.recv_edits(@edit_stack, @last_version_received, cb)
            else
                cb?()

    # Receive and process the edits from the other end of the sync connection.
    recv_edits: (edit_stack, last_version_ack, cb) =>
        if SIMULATE_LOSS and Math.random() < .5           # Simulate packet loss
            console.log("Simulating loss!"); cb?(true); return

        #console.log("DiffSync.recv_edits: receive and process the edits from the other end of the sync connection", last_version_ack, edit_stack)

        # Keep only edits that we still need to send.
        @edit_stack = (edits for edits in @edit_stack when edits.shadow_version > last_version_ack)

        if edit_stack.length == 0
            cb?()
            return

        if edit_stack[0].shadow_version != @shadow_version and edit_stack[0].shadow_version == @backup_shadow_version
            # Lost return packet
            @shadow         = @_copy(@backup_shadow)
            @shadow_version = @backup_shadow_version
            @edit_stack     = []

        # Make a backup, just in case it turns out that our message
        # back to the client that we applied these changes is lost
        # "Lost return packet."
        @backup_shadow         = @_copy(@shadow)
        @backup_shadow_version = @shadow_version

        # Process the incoming edits
        i = 0
        process_edit = (cb) =>
            edits = edit_stack[i]
            i += 1
            if edits.shadow_version == @shadow_version
                if edits.shadow_checksum != @_checksum(@shadow)
                    # Data corruption in memory or network: we have to just restart everything from scratch.
                    cb("reset -- checksum mismatch (#{edits.shadow_checksum} != #{@_checksum(@shadow)})")
                    return
                @_apply_edits  edits.edits, @shadow, (err, result) =>
                    if err
                        cb(err)
                    else
                        @last_version_received = edits.shadow_version
                        @shadow = result
                        @shadow_version  += 1
                        @_apply_edits_to_live(edits.edits, cb)

            else
                if edits.shadow_version < @shadow_version
                    # Packet duplication or loss: ignore -- it will sort itself out later.
                    cb()
                else if edits.shadow_version > @shadow_version
                    # This should be impossible, unless there is data corruption.
                    cb("reset -- shadow version from the future #{edits.shadow_version} > #{@shadow_version}")
                    return
        tasks = (process_edit for j in [0...edit_stack.length])
        async.series(tasks, (err) -> cb?(err))



    # This is for debugging.
    status: () => {'id':@id, 'live':@live, 'shadow':@shadow, 'shadow_version':@shadow_version, 'edit_stack':@edit_stack}

class CustomDiffSync extends DiffSync
    constructor: (opts) ->
        #IMPORTANT: (1) None of the custom functions below take callbacks
        # as the last argument!
        # (2) You really, really want to define patch_in_place.  You must if doc0 = doc1 doesn't work.
        opts = defaults opts,
            id       : undefined   # anything you want; or leave empty to have a uuid randomly assigned
            doc      : required    # the starting live document
            copy     : required    # copy(doc) --> copy of the doc      -- return, not callback!
            diff     : required    # diff(doc0, doc1) --> p such that patch(p, doc0) = doc1
            patch    : required    # patch(d, doc0) = doc1
            checksum : required    # checksum(doc0) -> something simple
            patch_in_place : undefined  # patch(d, doc0) modified doc0 in place to become doc1.

        @opts = opts
        @init(id : opts.id,  doc : opts.doc)

        @_patch          = opts.patch
        @_patch_in_place = opts.patch_in_place
        @_checksum       = opts.checksum

    _copy: (doc) =>
        return @opts.copy(doc)

    _compute_edits: (version0, version1) =>
        return @opts.diff(version0, version1)

    _apply_edits: (edits, doc, cb) =>
        cb?(false, @opts.patch(edits, doc))

    _apply_edits_to_live: (edits, cb) =>
        @_pre_apply_edits_to_live?()
        if @opts.patch_in_place?
            @opts.patch_in_place(edits, @live)
            cb?()
        else
            @_apply_edits  edits, @live, (err, result) =>
                if err
                    cb?(err); return
                else
                    @live = result
                    cb?()

    _checksum: (doc) =>
        return @opts.checksum(doc)

exports.CustomDiffSync = CustomDiffSync

test0 = (client, server, DocClass, Doc_equal, Doc_str) ->
    if DocClass?
        client.live = new DocClass("sage")
        server.live = new DocClass("my\nsage")
    else
        client.live = "sage"
        server.live = "my\nsage"

    if not Doc_equal?
        Doc_equal = (s,t) -> s==t
    if not Doc_str?
        Doc_str = (s) -> s

    status = () ->
        #console.log("------------------------")
        #console.log(misc.to_json(client.status()))
        #console.log(misc.to_json(server.status()))
        console.log("------------------------")
        console.log("'#{Doc_str(client.live)}'")
        console.log("'#{Doc_str(server.live)}'")

    pusher = undefined
    go = () ->
        if not pusher?
            console.log("SWITCH client/server")
            if Math.random() < .5
                pusher = 'client'
            else
                pusher = 'server'
        if pusher == 'client'
            client.sync (err) ->
                if not err
                    pusher = undefined
                if err.slice(0,5) == 'reset'
                    throw err
        else
            server.push_edits (err) ->
                if not err
                    pusher = undefined
                if err.slice(0,5) == 'reset'
                    throw err

    go()
    if DocClass?
        client.live = new DocClass("bar more stuffklajsdf lasdjf lasdj flasdjf lasjdfljas dfaklsdjflkasjd flajsdflkjasdklfj\n" + misc.uuid())
        server.live = new DocClass("bar lkajsdfllkjasdfl jasdlfj alsdkfjasdfjlkasdjflasjdfkljasdf\n" + misc.uuid())
    else
        client.live += "more stuffklajsdf lasdjf lasdj flasdjf lasjdfljas dfaklsdjflkasjd flajsdflkjasdklfj\n" + misc.uuid()
        server.live = 'bar\n' + server.live + "lkajsdfllkjasdfl jasdlfj alsdkfjas'dfjlkasdjflasjdfkljasdf\n" + misc.uuid()
    status()
    while not Doc_equal(client.live, server.live)
        status()
        go()
    status()

exports.test1 = () ->
    client = new DiffSync(doc:"sage", id:"client")
    server = new DiffSync(doc:"sage", id:"server")
    client.connect(server)
    server.connect(client)
    test0(client, server)

exports.test2 = (n) ->
    for i in [0...n]
        exports.test1()

exports.test3 = () ->
    client = new DiffSync(doc:"cat", id:"client")
    server = new DiffSync(doc:"cat", id:"server")
    client.connect(server)
    server.connect(client)

    client.live = "cats"
    server.live = "my\ncat"

    client.sync () =>
        console.log(misc.to_json(client.status()))
        console.log(misc.to_json(server.status()))

exports.test4 = (n=1) ->
    # Just use the standard dmp functions on strings again.
    copy      = (s) -> s
    diff      = (v0,v1)  -> dmp.patch_make(v0,v1)
    patch     = (d, doc) -> dmp.patch_apply(d, doc)[0]
    checksum  = (s) -> s.length + 3    # +3 for luck

    DS = (id, doc) -> return new CustomDiffSync
        id       : id
        doc      : doc
        copy     : copy
        diff     : diff
        patch    : patch
        checksum : checksum

    for i in [0...n]
        client = DS("client", "cat")
        server = DS("server", "cat")

        client.connect(server)
        server.connect(client)

        client.live = "cats"
        server.live = "my\ncat"
        client.sync () =>
            console.log(misc.to_json(client.status()))
            console.log(misc.to_json(server.status()))
        test0(client, server)

exports.test5 = (n=1) ->
    #
    # Make the documents a mutable version of strings (defined via a class) instead.
    #

    class Doc
        constructor: (@doc) ->
            if @doc.doc?
                console.log("tried to make Doc(Doc)")
                traceback()
            if @doc == '[object Object]'
                console.log("tried to make Doc from obvious mistake")
                traceback()
            if not @doc?
                console.log("tried to make Doc with undefined doc")
                traceback() # cause stack trace
            if not (typeof @doc == 'string')
                console.log("tried to make Doc from non-string '#{misc.to_json(@doc)}'")
                traceback()

    copy      = (s) ->
        return new Doc(s.doc)

    diff      = (v0,v1)  ->
        return dmp.patch_make(v0.doc, v1.doc)

    patch     = (d, doc) -> new Doc(dmp.patch_apply(d, doc.doc)[0])
    checksum  = (s) -> s.doc.length + 3    # +3 for luck
    patch_in_place = (d, s) -> s.doc = dmp.patch_apply(d, s.doc)[0]  # modifies s.doc inside object

    DS = (id, doc) -> return new CustomDiffSync
        id       : id
        doc      : doc
        copy     : copy
        diff     : diff
        patch    : patch
        patch_in_place : patch_in_place
        checksum : checksum

    for i in [0...n]
        client = DS("client", new Doc("cat"))
        server = DS("server", new Doc("cat"))

        client.connect(server)
        server.connect(client)

        client.live = new Doc("cats")
        server.live = new Doc("my\nbat")
        client.sync () =>
            console.log(misc.to_json(client.status()))
            console.log(misc.to_json(server.status()))
        test0(client, server, Doc, ((s,t) -> s.doc ==t.doc), ((s) -> s.doc))

exports.test6 = (n=1) ->
    #
    # Do all diffs at a line level (could be used for a "list of worksheet cells", if followed by a post-processing to remove dups -- see below)
    # WARNING: ALL lines must end in \n
    #

    class Doc
        constructor: (@doc) ->
            if not (typeof @doc == 'string')
                console.log("tried to make Doc from non-string '#{misc.to_json(@doc)}'")
                traceback()

    copy      = (s) ->
        return new Doc(s.doc)

    # See http://code.google.com/p/google-diff-match-patch/wiki/LineOrWordDiffs
    diff      = (v0,v1)  ->
        a = dmp.diff_linesToChars_(v0.doc, v1.doc)
        diffs = dmp.diff_main(a.chars1, a.chars2, false)
        dmp.diff_charsToLines_(diffs, a.lineArray)
        return dmp.patch_make(diffs)

    patch     = (d, doc) -> new Doc(dmp.patch_apply(d, doc.doc)[0])
    checksum  = (s) -> s.doc.length + 3    # +3 for luck
    patch_in_place = (d, s) -> s.doc = dmp.patch_apply(d, s.doc)[0]  # modifies s.doc inside object

    DS = (id, doc) -> return new CustomDiffSync
        id       : id
        doc      : doc
        copy     : copy
        diff     : diff
        patch    : patch
        patch_in_place : patch_in_place
        checksum : checksum

    for i in [0...n]
        client = DS("client", new Doc("cat"))
        server = DS("server", new Doc("cat"))

        status = () ->
            console.log(client.live.doc)
            console.log("-----")
            console.log(server.live.doc)
            console.log("================")

        client.connect(server)
        server.connect(client)

        status()
        client.live = new Doc("cat\nwilliam\nb\nstein\n")
        server.live = new Doc("cats\nstein\na\nb\nwilliam\n")
        client.sync () =>
            status()

        # test0(client, server, Doc, ((s,t) -> s.doc ==t.doc), ((s) -> s.doc))

exports.test7 = (n=1) ->
    #
    # Do all diffs at a line level then delete dup lines (could be used for a "list of worksheet cells")
    # WARNING: ALL lines must end in \n
    #

    dedup = (s) ->
        # delete duplicate lines
        v = s.split('\n')
        lines_so_far = {}
        w = []
        for line in v
            if not lines_so_far[line]?
                w.push(line)
                lines_so_far[line] = true
        return w.join('\n')

    class Doc
        constructor: (@doc, dedup_doc) ->
            if not (typeof @doc == 'string')
                console.log("tried to make Doc from non-string '#{misc.to_json(@doc)}'")
                traceback()
            if dedup_doc? and dedup_doc
                @doc = dedup(@doc)

    copy      = (s) ->
        return new Doc(s.doc, true)

    # See http://code.google.com/p/google-diff-match-patch/wiki/LineOrWordDiffs
    diff      = (v0,v1)  ->
        a = dmp.diff_linesToChars_(v0.doc, v1.doc)
        diffs = dmp.diff_main(a.chars1, a.chars2, false)
        dmp.diff_charsToLines_(diffs, a.lineArray)
        return dmp.patch_make(diffs)

    patch     = (d, doc) ->
        new Doc(dmp.patch_apply(d, doc.doc)[0], true)

    checksum  = (s) -> s.doc.length + 3    # +3 for luck

    patch_in_place = (d, s) ->
        s.doc = dedup(dmp.patch_apply(d, s.doc)[0])  # modifies s.doc inside object

    DS = (id, doc) -> return new CustomDiffSync
        id       : id
        doc      : doc
        copy     : copy
        diff     : diff
        patch    : patch
        patch_in_place : patch_in_place
        checksum : checksum

    for i in [0...n]
        client = DS("client", new Doc("cat"))
        server = DS("server", new Doc("cat"))

        status = () ->
            console.log(client.live.doc)
            console.log("-----")
            console.log(server.live.doc)
            console.log("================")

        client.connect(server)
        server.connect(client)
        status()

        # This is like adding a cell at the beginning of both -- one gets added, the other deleted!?
        client.live = new Doc("laskdjf\ncat\ncat\nwilliam\nb\nstein\n")
        server.live = new Doc("1290384\ncat\ncats\nstein\na\nb\nwilliam\n")
        client.sync () =>
            status()

        #test0(client, server, Doc, ((s,t) -> s.doc ==t.doc), ((s) -> s.doc))

exports.DiffSync = DiffSync



#---------------------------------------------------------------------------------------------------------
# Support for using a synchronized doc as a synchronized document database
# storing one record per line in JSON.
#---------------------------------------------------------------------------------------------------------


###
Synchronized document-oriented database, based on differential synchronization.

NOTE: The API is sort of like <http://hood.ie/#docs>, though I found that *after* I wrote this.
The main difference is my syncdb doesn't use a database, instead using a file, and also it
doesn't use localStorage.  HN discussion: <https://news.ycombinator.com/item?id=7767765>
###


###
For now _doc -- in the constructor of SynchronizedDB
has a different API than DiffSync objects above.
The wrapper object below allows you to use a DiffSync
object with this API.

    _doc._presync -- if set, is called before syncing
    _doc.on 'sync' -- event emitted on successful sync
    _doc.live() -- returns current live string
    _doc.live('new value') -- set current live string
    _doc.sync(cb) -- cause sync of _doc
    _doc.save(cb) -- cause save of _doc to persistent storage
    _doc.readonly -- true if and only if doc is readonly

###
class exports.SynchronizedDB_DiffSyncWrapper extends EventEmitter
    constructor: (@doc) ->
        @doc.on 'sync', () => @emit('sync')

    sync: (cb) =>
        @_presync?()
        @doc.sync(cb)

    live: (value) =>
        if not value?
            return @doc.live
        else
            @doc.live = value

    save: (cb) => @doc.save(cb)

class exports.SynchronizedDB extends EventEmitter
    constructor: (@_doc, @to_json, @from_json, @max_len) ->
        if not @to_json?
            @to_json = misc.to_json
        if not @from_json?
            @from_json = misc.from_json
        @readonly = @_doc.readonly
        @_data = {}
        @valid_data = @_set_data_from_doc()
        @_doc._presync = () =>
            @_live_before_sync = @_doc?.live()  # doc could be deleted when this is called, due to destroy method.
        @_doc.on('sync', @_on_sync)

    _on_sync: () =>
        if not @_doc?
            return
        @emit('sync')
        #console.log("syncdb -- syncing")
        if not @_set_data_from_doc() and @_live_before_sync?
            #console.log("DEBUG: invalid/corrupt sync request; revert it")
            @_doc.live(@_live_before_sync)
            @_set_data_from_doc()
            @emit('presync')
            @_doc.sync()

    destroy: () =>
        @_doc?.removeListener('sync', @_on_sync)
        @_doc?.disconnect_from_session()
        delete @_doc
        delete @_data
        @removeAllListeners()

    # set the data object to equal what is defined in the syncdoc
    _set_data_from_doc: () =>
        if not @_doc?
            return
        # change/add anything that has changed or been added
        i = 0
        hashes = {}
        changes = []
        is_valid = true
        for x in @_doc.live().split('\n')
            if x.length > 0
                h = hash_string(x)
                hashes[h] = true
                if not @_data[h]?
                    # insert a new record
                    try
                        data = @from_json(x)
                    catch e
                        # invalid/corrupted json -- still, we try out best
                        # WE will revert this, unless it is on the initial load.
                        data = {'corrupt':x}
                        is_valid = false
                    @_data[h] = {data:data, line:i}
                    changes.push({insert:misc.deep_copy(data)})
            i += 1
        for h,v of @_data
            if not hashes[h]?
                # delete this record
                changes.push({remove:v.data})
                delete @_data[h]
        if changes.length > 0
            @emit("change", changes)
        return is_valid

    _set_doc_from_data: (hash) =>
        if not @_doc?
            return
        if hash? and @_data[hash]?  # second condition due to potential of @_data changing before _set_doc_from_data called
            # one line changed
            d = @_data[hash]
            v = @_doc.live().split('\n')
            v[d.line] = @to_json(d.data)
            new_hash = hash_string(v[d.line])
            if new_hash != hash
                @_data[new_hash] = d
                delete @_data[hash]
        else
            # possible major change to doc (e.g., deleting or adding records)
            m = []
            for hash, x of @_data
                m[x.line] = {hash:hash, x:x}
            m = (x for x in m when x?)
            line = 0
            v = []
            for z in m
                if not z?
                    continue
                z.x.line = line
                v.push(@to_json(z.x.data))
                line += 1
        @_doc.live(v.join('\n'))
        @emit('presync')
        @_doc.sync()

    save: (cb) =>
        if not @_doc?
            cb?("@_doc not defined")
            return
        f = (cb) =>
            @sync (err) =>
                if err
                    cb(err)
                else
                    if not @_doc?
                        cb?("@_doc not defined")
                    else
                        @_doc.save(cb)
        misc.retry_until_success
            f : f
            start_delay : 3000
            max_delay   : 5000
            factor      : 1.3
            max_time    : 1000*MAX_SAVE_TIME_S
            cb          : cb

    sync: (cb) =>
        #console.log("returning fake save error"); cb?("fake saving error"); return
        if not @_doc?
            cb?("@_doc not defined")
        else
            @_doc.sync(cb)

    # change (or create) exactly *one* database entry that matches
    # the given where criterion.
    update: (opts) =>
        opts = defaults opts,
            set   : required
            where : required
        if not @_doc?
            return
        set   = opts.set
        where = opts.where
        #console.log("update(set='#{misc.to_json(set)}',where='#{misc.to_json(where)}')")
        i = 0
        for hash, val of @_data
            match = true
            x = val.data
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                # modify exactly one existing database entry
                #console.log("update: change '#{misc.to_json(x)}'?")
                changed = false
                before = misc.deep_copy(x)
                for k, v of set
                    if not changed and misc.to_json(x[k]) != misc.to_json(v)
                        changes = [{remove:before}]
                        changed = true
                    x[k] = v
                if changed
                    #console.log("update: yes, to '#{misc.to_json(x)}'")
                    if @max_len?
                        cur_len = @_doc.live().length
                        new_len = misc.to_json(x).length - misc.to_json(before).length + cur_len
                        if new_len > @max_len
                            @_data[hash].data = before
                            throw {error:"max_len", new_len:new_len, cur_len:cur_len, max_len:@max_len}
                    # actually changed something
                    changes.push({insert:misc.deep_copy(x)})
                    @emit("change", changes)
                    #console.log("update: from '#{@_doc.live()}'")
                    @_set_doc_from_data(hash)
                    #console.log("update: to   '#{@_doc.live()}'")
                return
            i += 1

        # add a new entry
        new_obj = {}
        for k, v of set
            new_obj[k] = v
        for k, v of where
            new_obj[k] = v
        j = @to_json(new_obj)
        if @max_len?
            cur_len = @_doc.live().length
            new_len = j.length + 1 + @_doc.live().length
            if new_len > @max_len
                throw {error:"max_len", new_len:new_len, cur_len:cur_len, max_len:@max_len}
        hash = hash_string(j)
        @_data[hash] = {data:new_obj, line:len(@_data)}
        @_set_doc_from_data(hash)
        @emit("change", [{insert:misc.deep_copy(new_obj)}])

    # return list of all database objects that match given condition.
    select: (opts={}) =>
        {where} = defaults opts,
            where : {}
        if not @_data?
            return []
        result = []
        for hash, val of @_data
            x = val.data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                result.push(x)
        return misc.deep_copy(result)

    # return first database objects that match given condition or undefined if there are no matches
    select_one: (opts={}) =>
        {where} = defaults opts,
            where : {}
        if not @_data?
            return
        for hash, val of @_data
            x = val.data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                return misc.deep_copy(x)

    # delete everything that matches the given criterion; returns number of deleted items
    delete: (opts) =>
        {where, one} = defaults opts,
            where : required  # give {} to delete everything ?!
            one   : false
        if not @_data?
            return 0
        result = []
        i = 0
        changes = []
        for hash, val of @_data
            x = val.data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                i += 1
                changes.push({remove:x})
                delete @_data[hash]
                if one
                    break
        if i > 0
            @_set_doc_from_data()
            @emit("change", changes)
        return i

    # delete first thing in db that matches the given criterion
    delete_one: (opts) =>
        opts.one = true
        @delete(opts)

    # anything that couldn't be parsed from JSON as a map gets converted to {key:thing}.
    ensure_objects: (key) =>
        if not @_data?
            return
        changes = {}
        for h,v of @_data
            if typeof(v.data) != 'object'
                x = v.data
                v.data = {}
                v.data[key] = x
                h2 = hash_string(@to_json(v.data))
                delete @_data[h]
                changes[h2] = v
        if misc.len(changes) > 0
            for h, v of changes
                @_data[h] = v
            @_set_doc_from_data()

    # ensure that every db entry has a distinct uuid value for the given key
    ensure_uuid_primary_key: (key) =>
        if not @_data?
            return
        uuids   = {}
        changes = {}
        for h,v of @_data
            if not v.data[key]? or uuids[v.data[key]]  # not defined or seen before
                v.data[key] = misc.uuid()
                h2 = hash_string(@to_json(v.data))
                delete @_data[h]
                changes[h2] = v
            uuids[v.data[key]] = true
        if misc.len(changes) > 0
            w = []
            for h, v of changes
                w.push({remove:@_data[h]})
                w.push({insert:v})
            @emit("change", w)

            for h, v of changes
                @_data[h] = v
            @_set_doc_from_data()

    count: () =>
        return misc.len(@_data)


















