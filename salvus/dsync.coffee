###################################################################
#
# Class to support simultaneous multiple editing
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
# coffee  -o node_modules -c dsync.coffee && echo "require('dsync').test1()" | coffee

SIMULATE_LOSS = false

misc = require('misc')
{defaults, required} = misc
diff_match_patch = require('googlediff')  # TODO: this greatly increases the size of browserify output (unless we compress it) -- watch out.
dmp = new diff_match_patch()

class DSync
    constructor: (opts) ->
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

    # Copy a document; strings are immutable and the default, so we
    # just return the object.
    _copy: (doc) =>
        return doc

    # Determine array of edits between the two versions of the document
    _compute_edits: (version0, version1) =>
        return dmp.patch_make(version0, version1)

    # "Best effort" application of array of edits.
    _apply_edits: (edits, doc) =>
        return dmp.patch_apply(edits, doc)[0]

    # Return a checksum of a document
    _checksum: (doc) =>
        return doc.length

    ###############################################################
    # API:
    #
    #   * connect -- use to connect the client and the server
    #   * push_edits -- compute and push collection of edits out
    #   * recv_edits -- receive edits and apply them, then send ack.
    #
    ###############################################################

    # Connect this client to the other end of the connection, the "server".
    connect: (server) =>
        @server = server

    # Do a complete sync cycle; cb() on success and cb(true) if anything goes wrong.
    # In case of failure, do *not* initiate a sync from the other side!
    # Also, cb('reset') in case of an non-recoverable data corruption error.
    sync: (cb) =>
        @push_edits (err) =>
            if err
                cb(err)
            else
                @server.push_edits(cb)

    # Create a list of new edits, then send all edits not yet
    # processed to the other end of the connection.
    push_edits: (cb) =>
        snapshot = @_copy(@live)
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
        @server.recv_edits(@edit_stack, @last_version_received, cb)

    # Receive and process the edits from the other end of the sync connection.
    recv_edits: (edit_stack, last_version_ack, cb) =>

        if SIMULATE_LOSS and Math.random() < .5           # Simulate packet loss
            console.log("Simulating loss!"); cb(true); return

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
        for edits in edit_stack
            if edits.shadow_version == @shadow_version
                if edits.shadow_checksum != @_checksum(@shadow)
                    # Data corruption in memory or network: we have to just restart everything from scratch.
                    cb('reset')
                    return
                @last_version_received = edits.shadow_version
                @shadow                = @_apply_edits(edits.edits, @shadow)
                @shadow_version       += 1
                @live                  = @_apply_edits(edits.edits, @live)
            else
                if edits.shadow_version < @shadow_version
                    # Packet duplication or loss.
                    continue
                else if edits.shadow_version > @shadow_version
                    # This should be impossible, unless there is data corruption.
                    cb('reset')
        cb()

    # This is for debugging.
    status: () => {'id':@id, 'live':@live, 'shadow':@shadow, 'shadow_version':@shadow_version, 'edit_stack':@edit_stack}



exports.test1 = () ->
    client = new DSync(doc:"sage", id:"client")
    server = new DSync(doc:"sage", id:"server")
    client.connect(server)
    server.connect(client)

    client.live = "sage"
    server.live = "my\nsage"
    status = () ->
        console.log("------------------------")
        console.log(misc.to_json(client.status()))
        console.log(misc.to_json(server.status()))
        console.log("------------------------")

    pusher = undefined
    go = () ->
        if not pusher?
            console.log("SWITCH")
            if Math.random() < .5
                pusher = 'client'
            else
                pusher = 'server'
        if pusher == 'client'
            client.sync (err) ->
                if not err
                    pusher = undefined
                if err == 'reset'
                    throw err
        else
            server.push_edits (err) ->
                if not err
                    pusher = undefined
                if err == 'reset'
                    throw err

    go()
    client.live += "\nmore stuffklajsdf lasdjf lasdj flasdjf lasjdfljas dfaklsdjflkasjd flajsdflkjasdklfj"
    server.live = 'bar' + server.live + "lkajsdfllkjasdfl jasdlfj\n\nalsdkfjas'dfjlkasdjflasjdfkljasdf"
    status()
    while client.live != server.live
        status()
        go()
    status()

exports.test2 = (n) ->
    for i in [0...n]
        exports.test1()

exports.test3 = () ->
    client = new DSync(doc:"cat", id:"client")
    server = new DSync(doc:"cat", id:"server")
    client.connect(server)
    server.connect(client)

    client.live = "cats are cool!"
    server.live = "my\ncat"

    client.sync () =>
        console.log(misc.to_json(client.status()))
        console.log(misc.to_json(server.status()))

exports.DSync = DSync