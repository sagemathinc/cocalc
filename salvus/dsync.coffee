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
###################################################################


# coffee  -o node_modules -c dsync.coffee && echo "require('dsync').test1()" | coffee

misc = require('misc')
{defaults, required} = misc

diff_match_patch = require('googlediff')  # TODO: this greatly increases the size of browserify output (unless we compress it)

dmp = new diff_match_patch()

class DSync0
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

    status: () =>
        return {'id':@id, 'live':@live, 'shadow':@shadow, 'shadow_version':@shadow_version, 'edit_stack':@edit_stack}

    restart: (reason) =>
        console.log("*********************************************************")
        console.log("* THINGS WENT TO HELL. -- #{reason} --  HAVE TO RESTART!!!!! *")
        console.log("*********************************************************")
        throw("dang")

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

    # Connect this client to the other end of the connection, the "server".
    connect: (server) =>
        @server = server

    # Create a list of new edits, then send all edits not yet
    # processed to the other end of the connection.
    push_edits: (cb) =>
        snapshot = @_copy(@live)
        edits = {edits:@_compute_edits(@shadow, snapshot)}

        if edits.edits.length > 0
            edits.shadow_version = @shadow_version
            edits.shadow_checksum = @_checksum(@shadow)
            # console.log("#{@id} -- push_edits -- #{misc.to_json(edits)}")
            @edit_stack.push(edits)
            console.log("#{@id} -- shadow changes: '#{@shadow}' --> '#{snapshot}'  (version #{@shadow_version+1})")
            @shadow = snapshot
            @shadow_version += 1

        if Math.random() < .5
            cb?(true)
            return

        # Push any remaining edits from the stack, *AND* report the last version we have received so far.
        @server.recv_edits(@edit_stack, @last_version_received, cb)

    # Receive and process the edits from the other end of the sync connection.
    recv_edits: (edit_stack, last_version_ack, cb) =>

        if Math.random() < .5
            cb?(true)
            return

        # Keep only edits that we still need to send.
        @edit_stack = (edits for edits in @edit_stack when edits.shadow_version > last_version_ack)

        if edit_stack.length == 0
            cb?()
            return

        if edit_stack[0].shadow_version != @shadow_version and edit_stack[0].shadow_version == @backup_shadow_version
            # Lost return packet
            @shadow = @_copy(@backup_shadow)
            @shadow_version = @backup_shadow_version
            @edit_stack = []

        # Make a backup, just in case it turns out that our message back to the client that
        # we applied these changes is lost "Lost return packet."
        @backup_shadow = @_copy(@shadow)
        @backup_shadow_version = @shadow_version

        # Process the incoming edits
        for edits in edit_stack
            console.log("#{@id} -- our shadow version = #{@shadow_version} and other shadow version #{edits.shadow_version}")
            if edits.shadow_version == @shadow_version
                if edits.shadow_checksum != @_checksum(@shadow)
                    # Data corruption in memory or network -- there should be no other way for this to happen.
                    # In this case, we have to just restart everything from scratch.
                    @restart("checksum (edit_stack=#{misc.to_json(edit_stack)})")
                    cb(true)
                    return
                console.log("last_version_received:  #{@last_version_received} --> #{edits.shadow_version}")
                @last_version_received = edits.shadow_version
                @shadow = @_apply_edits(edits.edits, @shadow)
                @shadow_version += 1
                @live = @_apply_edits(edits.edits, @live)

            else
                # PACKET LOSS / CORRUPTION
                # If edits.shadow_version does not equal @shadow_version, then there was a packet duplication or loss.
                if edits.shadow_version < @shadow_version
                    console.log("Duplicate Packet: we have no interest in edits we have already processed.")
                    continue
                else if edits.shadow_version > @shadow_version
                    @restart('shadow_version out of sync')

        cb?()

class DSync1
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

    status: () =>
        return {'id':@id, 'live':@live, 'shadow':@shadow}

    restart: (reason) =>
        console.log("*********************************************************")
        console.log("* THINGS WENT TO HELL. -- #{reason} --  HAVE TO RESTART!!!!! *")
        console.log("*********************************************************")
        throw("dang")

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

    # Connect this client to the other end of the connection, the "server".
    connect: (server) =>
        @server = server

    # Create a list of new edits, then send all edits not yet
    # processed to the other end of the connection.
    push_edits: (cb) =>
        snapshot = @_copy(@live)
        edits    = @_compute_edits(@shadow, snapshot)

        if edits.length == 0
            cb?()
            return

        @server.recv_edits edits, @_checksum(@shadow), (err) =>
            if err
                cb?(err)
            else
                @shadow = @_copy(snapshot)
                cb?()


    # Receive and process the edits from the other end of the sync connection.
    recv_edits: (edits, checksum, cb) =>
        if Math.random() < .5
            cb(true)
            return
        if checksum != @_checksum(@shadow)
            # Data corruption in memory or network -- there should be no other way for this to happen.
            # In this case, we have to just restart everything from scratch.
            @restart("checksum")
            cb(true)
            return

        @shadow = @_apply_edits(edits, @shadow)
        @live = @_apply_edits(edits, @live)
        cb?()



DSync = DSync0
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

    go = () ->
        client.push_edits( (err) =>
            if not err
                server.push_edits())

    go()
    client.live += "\nmore stuff"
    server.live = 'bar' + server.live
    status()
    while client.live != server.live
        status()
        go()
    status()

exports.test2 = (n) ->
    for i in [0...n]
        exports.test1()

exports.DSync = DSync