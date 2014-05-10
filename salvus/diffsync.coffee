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
# that one has to stay the initiater until the sync succeeds. E.g., if you run
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

async = require('async')

diff_match_patch = require('googlediff')  # TODO: this greatly increases the size of browserify output (unless we compress it) -- watch out.
dmp = new diff_match_patch()
exports.dmp = dmp

misc = require('misc')
{defaults, required} = misc

# debug = (s) ->
#     w = 'winston'
#     try
#         require(w).debug(s)
#     catch e
#         # nothing

class DiffSync
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
    # processed to the other end of the connection.
    push_edits: (cb) =>
        @snapshot (err, snapshot) =>
            if err
                cb(err); return

            if not snapshot?
                cb("snapshot computed in push_edits is undefined"); return

            if not @remote?
                cb("@remote in push_edits is undefined"); return

            edits = {edits:@_compute_edits(@shadow, snapshot)}

            if edits.edits.length > 0
                edits.shadow_version  = @shadow_version
                edits.shadow_checksum = @_checksum(@shadow)
                @edit_stack.push(edits)
                @shadow          = snapshot
                @shadow_version += 1

            if SIMULATE_LOSS and Math.random() < .5  # Simulate packet loss
                console.log("Simulating loss!"); cb(true); return

            # Push any remaining edits from the stack, *AND* report the last version we have received so far.
            #console.log("DiffSync.push_edits: push any remaining edits from the stack, *AND* report the last version (=#{@last_version_received}) we have received so far.")
            @remote.recv_edits(@edit_stack, @last_version_received, cb)

    # Receive and process the edits from the other end of the sync connection.
    recv_edits: (edit_stack, last_version_ack, cb) =>
        if SIMULATE_LOSS and Math.random() < .5           # Simulate packet loss
            console.log("Simulating loss!"); cb(true); return

        #console.log("DiffSync.recv_edits: receive and process the edits from the other end of the sync connection", last_version_ack, edit_stack)

        # Keep only edits that we still need to send.
        @edit_stack = (edits for edits in @edit_stack when edits.shadow_version > last_version_ack)

        if edit_stack.length == 0
            cb()
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
# Support for using synchronized docs to represent Sage Worksheets (i.e., live compute documents)
#---------------------------------------------------------------------------------------------------------

exports.MARKERS =
    cell   : "\uFE20"
    output : "\uFE21"

exports.FLAGS = FLAGS =
    execute     : "x"   # request that cell be executed
    waiting     : "w"   # request to execute received, but still not running (because of another cell running)
    running     : "r"   # cell currently running
    interrupt   : "c"   # request execution of cell be interrupted
    hide_input  : "i"   # hide input part of cell
    hide_output : "o"   # hide output part of cell
    auto        : "a"   # if set, run the cell when the sage session first starts

exports.ACTION_FLAGS = [FLAGS.execute, FLAGS.running, FLAGS.waiting, FLAGS.interrupt]

# Return a list of the uuids of files that are displayed in the given document,
# where doc is the string representation of a worksheet.
# At present, this function finds all output messages of the form
#   {"file":{"uuid":"806f4f54-96c8-47f0-9af3-74b5d48d0a70",...}}
# but it could do more at some point in the future.

exports.uuids_of_linked_files = (doc) ->
    uuids = []
    i = 0
    while true
        i = doc.indexOf(exports.MARKERS.output, i)
        if i == -1
            return uuids
        j = doc.indexOf('\n', i)
        if j == -1
            j = doc.length
        line = doc.slice(i, j)
        for m in line.split(exports.MARKERS.output).slice(1)
            # Only bother to run the possibly slow JSON.parse on file messages; since
            # this function would block the global hub server, this is important.
            if m.slice(0,8) == '{"file":'
                mesg = JSON.parse(m)
                uuid = mesg.file?.uuid
                if uuid?
                    uuids.push(uuid)
        i = j







