#################################################################
#
# stringsync -- a node.js module that is used by the hub to provide
# a differential synchronized string, which is persisted and synchronized
# across hubs via the database itself.
#
#  (c) William Stein, 2014
#
# Here's a diagram:
#
# [dc0 database state] .... [dc1 database state] <-----> [*hub*] <---> clients...
#        /|\
#         |-----[hub] <--> clients...
#
# This hub views it's in-memory current state of the string as the ultimate
# upstream for the string.  It views the database as one single downstream client,
# and some connected browser clients as other downstream clients.
# We query the database to see if any hashes have changed. with one single
# query for *all* strings, so polling scales.
#
#################################################################

async    = require('async')

winston = require('winston')

diffsync = require('diffsync')
misc     = require('misc')
message  = require('message')

{defaults, required} = misc

######################################################################################
# Building block:  This is a complete synchronized
# string session between one single browser client and the hub.
# With this, we can reduce all complicated multi-user sync
# stuff as happening within the hub (first move from a remote computer
# to local via sync, then do everything locally).
######################################################################################

class SyncStringDB extends diffsync.DiffSync

class SyncStringBrowser extends diffsync.DiffSync
    constructor : (@syncstring, @session_id, @push_to_client) ->
        misc.call_lock(obj:@)
        @init(doc:@syncstring.head)

    _write_mesg: (event, obj, cb) =>
        if not obj?
            obj = {}
        obj.session_id = @session_id
        mesg = message['syncstring_' + event](obj)
        @push_to_client(mesg, cb)

    # After receiving and processing edits from the client, we then
    # call push_edits_to_browser to push our edits back to the
    # browser (in the response message.)
    push_edits_to_browser: (id, cb) =>
        f = (cb) =>
            @_push_edits_to_browser(id, cb)
            @syncstring.sync()
        @_call_with_lock(f, cb)

    _push_edits_to_browser: (id, cb) =>
        # if id is given, then we are responding to a sync request from the client.
        # if id not given, we are initiating the sync request.
        #dbg = (m) => winston.debug("push_edits_to_browser: #{m}")
        @push_edits (err) =>
            # this just computed @edit_stack and @last_version_received
            if err
                @push_to_client(message.error(error:err, id:id))
                cb?(err)
            else
                mesg =
                    id               : id
                    edit_stack       : @edit_stack
                    last_version_ack : @last_version_received
                # diffsync2 when sync initiated by hub; diffsync when initiated by browser client.
                @_write_mesg "diffsync#{if id? then '' else '2'}", mesg, (err, resp) =>
                    if err
                        cb?(err)
                    else
                        if resp?
                            @recv_edits(resp.edit_stack, resp.last_version_ack, cb)
                        else
                            cb?()

    sync: (cb) =>
        @push_edits_to_browser(undefined, cb)

class SynchronizedString
    constructor: () ->
        misc.call_lock(obj:@)
        @clients = {}
        @head = ''

    new_browser_client: (session_id, push_to_client) =>
        client = new SyncStringBrowser(@, session_id, push_to_client)
        client.id = session_id
        @clients[session_id] = client
        return client

    sync: (cb) =>
        @_call_with_lock(@_sync, cb)

    _sync: (cb) =>
        last = @head
        winston.debug("sync: last='#{last}'")
        all = {}
        all[last] = true
        for _, client of @clients
            all[client.live] = true
        if misc.len(all) <= 1
            # nothing to do
            winston.debug("sync: nothing to do")
            cb?()
            return

        v = []
        for _, client of @clients
            v.push(client)
            patch = diffsync.dmp.patch_make(last, client.live)
            @head = diffsync.dmp.patch_apply(patch, @head)[0]
            winston.debug("sync: new head='#{@head}' from patch=#{misc.to_json(patch)}")
        for _, client of @clients
            client.live = @head
        # Sync any that changed (all at once, in parallel).
        f = (client, cb) =>
            if client.shadow != @head
                winston.debug("syncing '#{client.shadow}' <--> '#{@head}'")
                client.sync(cb)
            else
                cb()
        async.map v, f, (err) =>
            if err
                cb?(err)
            else
                @_sync(cb)

    sync0: (cb) =>
        # Set the live state of all inside diffsyncs to the corresponding
        # live states of the outside diffsync clients.
        for _, x of @clients
            x.inside.live = x.outside.live

        # Synchronize everything entirely in-memory and blocking.
        n = 0
        max_attempts = 3
        while true
            vals = {}
            n += 1
            if n > max_attempts
                winston.debug("WARNING: syncing not converging after #{max_attempts} attempts -- bailing!!!")
                break
            for _, x of @clients
                winston.debug("before: x.inside='#{x.inside.live}' and root='#{@root.live}'")
                x.inside.sync (err) =>  # actually synchronous!
                    winston.debug("after :x.inside='#{x.inside.live}' and root='#{@root.live}'")
                    if err
                        winston.debug("ERROR syncing -- #{err}")
                    vals[x.inside.live] = true
                    winston.debug("vals=#{misc.to_json(vals)}; root='#{@root.live}'")
            if misc.len(vals) <= 1
                break

        # Now set all the outside live to the common inside live
        changed = []
        for _, x of @clients
            before = x.outside.live
            x.outside.live = x.inside.live
            if before != x.inside.live
                changed.push(x.outside)

        # Sync any that changed (all at once, in parallel).
        async.map(changed, ((client, c)->client.sync(c)), (err) => cb?(err))


S = new SynchronizedString()

exports.syncstring = (opts) ->
    opts = defaults opts,
        session_id     : required
        push_to_client : required    # function that allows for sending a JSON message to remote client
    return S.new_browser_client(opts.session_id, opts.push_to_client)




# Connection to the database
#database = undefined
#exports.connect_to_database = (db) -> database = db

# Client that monitors the database, and sets its live to the contents
# of the database when the database changes.  Also, when it changes
# based on changes to SyncStringDBClient, it writes those changes to the
# database.
class SyncStringDBClient extends diffsync.DiffSync
    constructor: (@string_id, cb) ->
        @init(doc:"test string", id:@string_id)
        cb(undefined, @)

class SyncStringServer extends diffsync.DiffSync
    constructor: (@string_id, cb) ->
        new SyncStringDBClient @string_id, (err, client) =>
            if err
                cb(err)
            else
                @sync_db_client = client
                console.log("SyncStringServer: ", @sync_db_client)
                super(doc:@sync_db_client.live, id:@string_id)
                # Connect the two together
                @sync_db_client.connect(@)
                @connect(@sync_db_client)
                cb(undefined, @)

class SyncStringClient extends diffsync.DiffSync
    constructor: (@server, @id="") ->
        super(doc:@server.live, id:@id)
        @server.connect(@)
        @connect(@server)


_syncstring_servers = {}
_create_syncstring_server_queue = {}
syncstring_server = (string_id, cb) ->
    if _syncstring_servers[string_id]?
        # done -- already created
        cb(undefined, _syncstring_servers[string_id])
        return
    if _create_syncstring_server_queue[string_id]?
        # already started creating; add to queue
        _create_syncstring_server_queue[string_id].push(cb)
        return
    # start creating
    _create_syncstring_server_queue[string_id] = [cb]
    new SyncStringServer string_id, (err, server) ->
        # done -- now tell everybody who cares about the result
        if err
            for cb in _create_syncstring_server_queue[string_id]
                cb(err)
        else
            _syncstring_servers[string_id] = server
            for cb in _create_syncstring_server_queue[string_id]
                cb(undefined, server)
        _create_syncstring_server_queue[string_id] = undefined

# a database-backed string that is synchronized between database and users and hub
# NOT DONE
exports.syncstring_db = (opts) ->
    opts = defaults opts,
        string_id      : required
        push_to_client : required    # function that allows for sending a JSON message to remote client
        cb             : required
    syncstring_server opts.string_id, (err, server) ->
        if err
            opts.cb(err)
        else
            client = new SyncStringClient(server, opts.id)
            remote = new SyncStringBrowser(opts.push_to_client)
            client.remote = remote
            opts.cb(undefined, client)





