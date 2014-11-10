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

diffsync = require('diffsync')
misc     = require('misc')
message  = require('message')

{defaults, required} = misc


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


class SyncStringBrowserClient extends diffsync.DiffSync
    constructor : (@push_to_client) ->
        @init(doc:"test string")

    write_mesg: (event, obj) =>
        if not obj?
            obj = {}
        mesg = message['syncstring_' + event](obj)
        @push_to_client(mesg)

    push_edits_to_browser: (id) =>
        @push_edits (err) =>
            if err
                @push_to_client(message.error(error:err, id:id))
            else
                @write_mesg 'diffsync',
                    id               : id
                    edit_stack       : @edit_stack
                    last_version_ack : @last_version_received

    sync_ready: () =>
        @write_mesg('diffsync_ready')

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

exports.syncstring = (opts) ->
    opts = defaults opts,
        string_id      : required
        push_to_client : required    # function that allows for sending a JSON message to remote client
        cb             : required
    syncstring_server opts.string_id, (err, server) ->
        if err
            opts.cb(err)
        else
            client = new SyncStringClient(server, opts.id)
            remote = new SyncStringBrowserClient(opts.push_to_client)
            client.remote = remote
            opts.cb(undefined, client)





