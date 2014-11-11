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
cass     = require("cassandra")


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
        successful_live = {}
        successful_live[@head] = true
        f = (client, cb) =>
            if client.shadow != @head
                winston.debug("syncing '#{client.shadow}' <--> '#{@head}'")
                t = misc.mswalltime()
                client.sync (err) =>
                    winston.debug("sync time=#{misc.mswalltime(t)}")
                    if err == 'disconnected'
                        delete @clients[client.id]
                    if err
                        winston.debug("sync err = #{err}")
                    else
                        successful_live[client.live] = true
                    cb()
            else
                cb()
        async.map v, f, () =>
            if misc.len(successful_live) > 1 # if not stable (with ones with no err), do again.
                winston.debug("syncing again")
                @_sync(cb)
            else
                winston.debug("not syncing again since successful_live='#{misc.to_json(successful_live)}'")
                cb?()

sync_strings = {}
exports.syncstring = (opts) ->
    opts = defaults opts,
        string_id      : required
        session_id     : required
        push_to_client : required    # function that allows for sending a JSON message to remote client
    S = sync_strings[opts.string_id]
    if not S?
        S = sync_strings[opts.string_id] = new SynchronizedString()
    return S.new_browser_client(opts.session_id, opts.push_to_client)


# oldest first -- unlike in page/activity.coffee
timestamp_cmp = (a,b) ->
    if a.timestamp < b.timestamp
        return -1
    else if a.timestamp > b.timestamp
        return +1
    return 0

# Class that models storing a distributed collection of strings, indexed by a uuid,
# in an eventually consistent database (Cassandra).
# It queries periodically, with exponetial backoff, for updates about strings that
# we're watching.  It assembles the patch stream in the database together to give
# a consistent view for each string, and also writes patches to propogate that view.
INIT_POLL_INTERVAL = 1000
MAX_POLL_INTERVAL  = 2000   # for testing
POLL_DECAY_RATIO   = 1.3
TIMESTAMP_OVERLAP  = 60000  # assume that eventual consistency happens after this much time
class exports.StringsDB
    constructor : (@db) ->
        @dbg("constructor")
        if not @db?
            # temporary
            @db = new cass.Salvus
                hosts       : ['localhost']
                keyspace    : 'salvus'
                consistency : 1
                cb          : (err) =>
                    if err
                        console.log("FAILED to connect to db")
                    else
                        console.log("connected to db")
        misc.call_lock(obj:@)
        @strings = {}    # synchronized strings we're watching
        @poll_for_updates() # start polling

    dbg: (f, m) =>
        #winston.debug("StringsDB.#{f}: #{m}")
        console.log("StringsDB.#{f}: #{m}")

    get_string: (opts) =>
        opts = defaults opts,
            string_id : required
            cb        : required
        s = @strings[opts.string_id]
        if s?
            opts.cb(undefined, s)
        else
            # If this gets called multiple times, then do only once and call all callbacks
            if not @_get_string_queue?
                @_get_string_queue = {}
            if @_get_string_queue[opts.string_id]?
                @_get_string_queue[opts.string_id].push(opts.cb)
                return
            f = (args...) =>
                for cb in @_get_string_queue[opts.string_id]
                    cb(args...)

            @_get_string_queue[opts.string_id] = [opts.cb]

            @_read_updates_from_db [opts.string_id], 0, (err) =>
                if err
                    f(err)
                else
                    s = @strings[opts.string_id]
                    if not s?
                        s = @strings[opts.string_id] = {applied_patches:{}, db_string:'', live:'', timestamp:0}
                    s.live = s.db_string # start initialized to what is in db
                    f(undefined, s)

    poll_for_updates: (interval=INIT_POLL_INTERVAL) =>
        retry = (interval) =>
            next_interval = Math.max(INIT_POLL_INTERVAL,Math.min(MAX_POLL_INTERVAL, POLL_DECAY_RATIO*interval))
            setTimeout((()=>@poll_for_updates(next_interval)), interval)

        if misc.len(@strings) == 0
            # not watching for anything
            retry(interval); return

        @read_updates_from_db misc.keys(@strings), TIMESTAMP_OVERLAP, (err, new_updates) =>
            if err
                retry(interval)
            else
                if new_updates
                    # something new -- poll again soon
                    retry(0)
                else
                    # nothing new -- try again after further exponential decay
                    retry(interval)

    sync: (cb) =>
        @dbg("sync")
        @_call_with_lock(@_write_updates_to_db, cb)

    _write_updates_to_db: (cb) =>
        dbg = (m) => @dbg("_write_updates_to_db", m)
        if not @db?
            cb("database not initialized"); return
        dbg()
        f = (string_id, cb) =>
            dbg(string_id)
            string = @strings[string_id]
            dbg("string.db_string='#{string.db_string}'")
            dbg("string.live='#{string.live}'")
            if string.db_string == string.live
                dbg("nothing to do for #{string_id}")
                cb() # nothing to do
            else
                patch = diffsync.dmp.patch_make(string.db_string, string.live)
                dbg("patch for #{string_id} = #{misc.to_json(patch)}")
                timestamp = cass.now() - 0
                @db.update
                    table : 'syncstrings'
                    set   : {patch:misc.to_json(patch)}
                    where : {string_id:string_id, timestamp:timestamp}
                    cb    : (err) =>
                        if err
                            cb(err)
                        else
                            dbg("success for #{string_id}")
                            string.db_string = string.live
                            string.applied_patches[timestamp] = {patch:patch, timestamp:timestamp}
                            string.timestamp = timestamp
                            cb()
        async.map(misc.keys(@strings), f, (err) => cb(err))

    read_updates_from_db: (string_ids, age, cb) =>
        @_call_with_lock(((cb)=>@_read_updates_from_db(string_ids, age, cb)), cb)

    _read_updates_from_db: (string_ids, age, cb) =>
        #@dbg("_read_updates_from_db", misc.to_json(string_ids))
        if not @db?
            cb("database not initialized"); return
        where = {string_id:{'in':string_ids}}
        if age
            where.timestamp = {'>=' : cass.now() - age}
        @db.select
            table     : 'syncstrings'
            columns   : ['string_id','timestamp','patch','is_first']
            objectify : true
            where     : where
            cb        : (err, updates) =>
                if err
                    cb(err)
                else
                    new_updates = @_process_updates updates, (err) =>
                        # ignore err, since it would be in writing back
                        cb(undefined, new_updates)

    _process_updates: (updates, cb) =>
        #
        # updates is a list of {string_id:?,timestamp:?,patch:?,is_first:?} objects, where
        #
        #   string_id = string uuid
        #   timestamp = Date object
        #   patch     = string representation of a patch (since we don't want to de-JSON if not needed)
        #   is_first  = boolean; if true, start with this patch; used only to avoid race conditions when trimming history.

        # WARNING!
        # We first implement a very inefficient stupid version of this business, and
        # will later implement things to make faster.  If this database sync thing
        # turns out to be sensible.
        #  SIMPLIFIED: ignore is_first and never trim.
        new_patches = {}
        for update in updates
            update.timestamp = update.timestamp - 0  # better to key map based on string of timestamp as number
            string = @strings[update.string_id]
            if not string?
                string = @strings[update.string_id] = {applied_patches:{}, db_string:'', live:'', timestamp:0}
            if not string.applied_patches[update.timestamp]?
                # a new patch
                update.patch = misc.from_json(update.patch)
                if not new_patches[update.string_id]?
                    new_patches[update.string_id] = [update]
                else
                    new_patches[update.string_id].push(update)

        if misc.len(new_patches) == 0
            # nothing further to do
            cb()
            return false

        if updates.length > 0
            @dbg("_process_updates",misc.to_json(new_patches))

        # There are new patches
        write_updates = false
        for string_id, patches of new_patches
            string = @strings[string_id]
            db_string_before = string.db_string

            patches.sort(timestamp_cmp)
            if patches[0].timestamp > string.timestamp
                # If timestamps not all bigger than last patch time, we merge everything
                # together and apply all patches in order, starting from scratch.
                # (TODO: optimize this.)
                for _, patch of string.applied_patches
                    patches.push(patch)
                patches.sort(timestamp_cmp)
                # reset string
                string.db_string = ''
                string.timestamp = 0
                string.applied_patches = {}

            # Apply unapplied patches in order.
            for p in patches
                @dbg("_process_updates","applying unapplied patch #{misc.to_json(p.patch)}")
                string.db_string = diffsync.dmp.patch_apply(p.patch, string.db_string)[0]
                string.applied_patches[p.timestamp] = p
            # string's timestamp = Newest applied patch
            string.timestamp = patches[patches.length - 1].timestamp

            # apply effective changes from db to live.
            if db_string_before != string.db_string
                patch = diffsync.dmp.patch_make(db_string_before, string.db_string)
                string.live = diffsync.dmp.patch_apply(patch, string.live)[0]

            # If live != db_string, write changes back to database
            if string.live != string.db_string
                write_updates = true

        if write_updates
            @dbg("_process_updates","writing our own updates back")
            @_write_updates_to_db(cb)  # safe to call skipping lock, since we have the lock
        else
            @dbg("_process_updates","no further updates from us (stable)")
            cb()

        return true  # there were patches to apply

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





