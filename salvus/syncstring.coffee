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
{EventEmitter} = require('events')
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

class SyncStringBrowser extends diffsync.DiffSync
    constructor : (@syncstring, @session_id, @push_to_client) ->
        misc.call_lock(obj:@)
        @init(doc:@syncstring.head)
        @last_sync = @shadow

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
                @last_sync = @shadow
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
                            @last_sync = @shadow
                        else
                            cb?()

    sync: (cb) =>
        @push_edits_to_browser(undefined, cb)

# A string that is synchronized amongst all connected clients.
class SynchronizedString
    constructor: (@string_id) ->
        misc.call_lock(obj:@)
        @clients = {}
        @head = ''

    new_browser_client: (session_id, push_to_client, cb) =>
        client = new SyncStringBrowser(@, session_id, push_to_client)
        client.id = session_id
        @clients[session_id] = client
        cb(undefined, client)

    new_in_memory_client: (session_id, cb) =>
        # Used so that the hub itself (the process where this code is running)
        # can modify this SynchronizedString, rather than just remote clients.
        client = new diffsync.DiffSync(doc:@head)
        client.id = session_id
        client.sync = (cb) =>
            client.shadow    = client.live
            client.last_sync = client.live
            client.emit('sync')
            @sync()
            cb?()
        @clients[session_id] = client
        cb(undefined, client)

    new_database_client: (session_id, cb) =>
        # Used for synchronizing/persisting the string using the database, so
        # it gets sync'd across all hubs (across data centers).
        syncstring_db.get_string
            string_id : @string_id
            cb        : (err, client) =>
                if err
                    cb(err)
                else
                    @clients[session_id] = client
                    cb(undefined, client)

    sync: (cb) =>
        @_call_with_lock(@_sync, cb)

    _sync: (cb) =>
        last = @head
        #winston.debug("sync: last='#{last}'")
        all = {}
        all[last] = true
        for _, client of @clients
            all[client.live] = true
        if misc.len(all) <= 1
            # nothing to do
            #winston.debug("sync: nothing to do")
            cb?()
            return

        v = []
        for _, client of @clients
            v.push(client)
            patch = diffsync.dmp.patch_make(last, client.live)
            @head = diffsync.dmp.patch_apply(patch, @head)[0]
            #winston.debug("sync: new head='#{@head}' from patch=#{misc.to_json(patch)}")
        for _, client of @clients
            client.live = @head

        # Sync any that changed (all at once, in parallel).
        successful_live = {}
        successful_live[@head] = true
        f = (client, cb) =>
            if client.last_sync != @head
                #winston.debug("syncing '#{client.last_sync}' <--> '#{@head}'")
                t = misc.mswalltime()
                client.sync (err) =>
                    #winston.debug("sync time=#{misc.mswalltime(t)}")
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
                #winston.debug("syncing again")
                @_sync(cb)
            else
                #winston.debug("not syncing again since successful_live='#{misc.to_json(successful_live)}'")
                cb?()

sync_strings = {}

get_syncstring = (string_id, cb) ->
    S = sync_strings[string_id]
    if S?
        cb(undefined, S); return

    S = new SynchronizedString(string_id)
    async.series([
        (cb) =>
            S.new_database_client misc.uuid(), (err, client) ->
                if err
                    cb(err)
                else
                    S.db_client = client
                    S.head = client.live
                    client.on 'change', S.sync  # whenever database changes, sync everything
                    cb()
        (cb) =>
            S.new_in_memory_client misc.uuid(), (err, client) ->
                if err
                    cb(err)
                else
                    S.in_memory_client = client
                    cb()
    ], (err) =>
        if err
            # TODO: undo any other harm
            cb(err)
        else
            sync_strings[string_id] = S
            cb(undefined, S)
    )

exports.syncstring = (opts) ->
    opts = defaults opts,
        string_id      : required
        session_id     : required
        push_to_client : required    # function that allows for sending a JSON message to remote client
        cb             : required
    get_syncstring opts.string_id, (err, S) =>
        if err
            opts.cb(err)
        else
            S.new_browser_client opts.session_id, opts.push_to_client, (err, client) ->
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, client)

# The hub has to call this on startup in order for syncstring to work.
syncstring_db = undefined
exports.init_syncstring_db = (database, cb) ->
    if not database?  # for debugging/testing on command line
        database = new cass.Salvus
            hosts       : ['localhost']
            keyspace    : 'salvus'
            username    : 'hub'
            cb          : (err) ->
                if not err
                    syncstring_db = new StringsDB(database)
                cb?(err)
    else
        syncstring_db = new StringsDB(database)
        cb?()





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
# Times below are in milliseconds.

# Polling parameters:
INIT_POLL_INTERVAL     = 1000
MAX_POLL_INTERVAL      = 2000   # TODO: for testing -- for deploy make longer!
POLL_DECAY_RATIO       = 1.3

# We grab patches that are up to TIMESTAMP_OVERLAP old from db each time polling.
# We are assuming a write to the database propogates to
# all DC's after this much time.  Any change that failed to
# propogate after this long may be lost.  This way we still eventually see
# patches that were written to the database, but that we missed
# due to them not being propogates to all data centers.
TIMESTAMP_OVERLAP      = 60000

# If there are more than DB_PATCH_SQUASH_THRESH patches for a given string,
# we squash the old patch history into a single patch the first time
# we read the given synchronized string from the database.  This avoids
# having to apply hundreds of patches when opening a string, and saves
# space.   (Of course, having the complete history could also be
# interesting...)
DB_PATCH_SQUASH_THRESH = 100

# emits a 'change' event whenever live is changed as a result of syncing with the database
class StringsDBString extends EventEmitter
    constructor: (@strings_db, @string_id) ->
        @applied_patches = {}
        @last_sync = ''
        @live = ''
        @timestamp = 0

    sync: (cb) =>
        @strings_db.sync(cb)   # NOTE: actually sync's all strings to db that have changed (not just this one)

class StringsDB
    constructor : (@db) ->
        if not @db?
            # TODO: for testing only
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

    # DO NOT CHANGE THESE TWO FUNCTIONS, ever!  It'll break everything in the db
    patch_to_string: (patch) => JSON.stringify(diffsync.compress_patch(patch))
    string_to_patch: (patch) => diffsync.decompress_patch(JSON.parse(patch))

    dbg: (f, m) =>
        winston.debug("StringsDB.#{f}: #{m}")
        #console.log("StringsDB.#{f}: #{m}")

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
                        s = @strings[opts.string_id] = new StringsDBString(@, opts.string_id)
                    s.live = s.last_sync # start initialized to what is in db
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
        @_call_with_lock(@_write_updates_to_db, cb)

    _write_updates_to_db: (cb) =>
        #dbg = (m) => @dbg("_write_updates_to_db", m)
        if not @db?
            cb("database not initialized"); return
        #dbg()
        f = (string_id, cb) =>
            #dbg(string_id)
            string = @strings[string_id]
            #dbg("string.last_sync='#{string.last_sync}'")
            #dbg("string.live='#{string.live}'")
            if string.last_sync == string.live
                #dbg("nothing to do for #{string_id}")
                cb() # nothing to do
            else
                patch = diffsync.dmp.patch_make(string.last_sync, string.live)
                #dbg("patch for #{string_id} = #{misc.to_json(patch)}")
                timestamp = cass.now() - 0
                @db.update
                    table : 'syncstrings'
                    set   : {patch:@patch_to_string(patch)}
                    where : {string_id:string_id, timestamp:timestamp}
                    cb    : (err) =>
                        if err
                            cb(err)
                        else
                            #dbg("success for #{string_id}")
                            string.last_sync = string.live
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
                string = @strings[update.string_id] = new StringsDBString(@, update.string_id)
            if not string.applied_patches[update.timestamp]?
                # a new patch
                update.patch = @string_to_patch(update.patch)
                if not new_patches[update.string_id]?
                    new_patches[update.string_id] = [update]
                else
                    new_patches[update.string_id].push(update)

        if misc.len(new_patches) == 0
            # nothing further to do
            cb()
            return false

        #if updates.length > 0
        #    @dbg("_process_updates",misc.to_json(new_patches))

        # There are new patches
        write_updates = false
        for string_id, patches of new_patches
            string = @strings[string_id]
            last_sync_before = string.last_sync

            patches.sort(timestamp_cmp)

            # If any patch has the is_first property set, ignore
            # all the patches before it.  Note that since we only trim older
            # patches, if this happens we are initializing the string from
            # scratch.   This trimming would only happen in extremely rare
            # conditions where the squashed patch has been written to the db,
            # but the older patches haven't yet been removed (it's only necessary
            # due to lack of transactions).
            i = patches.length - 1
            while i > 0
                if patches[i].is_first
                    patches = patches.slice(i)
                    break
                i -= 1

            if patches[0].timestamp < string.timestamp
                #@dbg("_process_updates", "timestamps not all bigger than last patch time (=#{misc.to_json(string.timestamp)}): patches=#{misc.to_json(patches)}")
                # If timestamps not all bigger than last patch time, we make list of all patches
                # apply all in order, starting from scratch.  (TODO: optimize)
                for _, patch of string.applied_patches
                    patches.push(patch)
                patches.sort(timestamp_cmp)
                # reset string
                string.last_sync = ''
                string.timestamp = 0
                string.applied_patches = {}

            # Apply unapplied patches in order.
            if string.last_sync == '' and patches.length > DB_PATCH_SQUASH_THRESH
                squash = true
                squash_time = new Date() - 1.2*TIMESTAMP_OVERLAP
            else
                squash = false

            #@dbg("_process_updates", "squash=#{squash}; squash_time=#{squash_time}")

            i = 0
            for p in patches
                #@dbg("_process_updates","applying unapplied patch #{misc.to_json(p.patch)}")
                string.last_sync = diffsync.dmp.patch_apply(p.patch, string.last_sync)[0]
                string.applied_patches[p.timestamp] = p
                if squash and p.timestamp <= squash_time and (i == patches.length-1 or patches[i+1].timestamp > squash_time)
                    @_squash_patches
                        to_delete : patches.slice(0, i)
                        string_id : string_id
                        last_sync    : string.last_sync
                        timestamp : p.timestamp
                i += 1


            # string's timestamp = Newest applied patch
            string.timestamp = patches[patches.length - 1].timestamp

            # apply effective changes from db to live.
            if last_sync_before != string.last_sync
                patch = diffsync.dmp.patch_make(last_sync_before, string.last_sync)
                string.live = diffsync.dmp.patch_apply(patch, string.live)[0]
                string.emit('change')

            # If live != last_sync, write changes back to database
            if string.live != string.last_sync
                write_updates = true

        if write_updates
            #@dbg("_process_updates","writing our own updates back")
            @_write_updates_to_db(cb)  # safe to call skipping lock, since we have the lock
        else
            #@dbg("_process_updates","no further updates from us (stable)")
            cb()

        return true  # there were patches to apply

    _squash_patches: (opts) =>
        opts = defaults opts,
            to_delete : required
            string_id : required
            last_sync    : required
            timestamp : required
            cb        : undefined
        @dbg("_squash_patches", misc.to_json(opts))
        async.series([
            (cb) =>
                # write big new patch
                patch = diffsync.dmp.patch_make('', opts.last_sync)
                @db.update
                    table : 'syncstrings'
                    set   :
                        patch    : misc.to_json(patch)
                        is_first : true
                    where :
                        string_id : opts.string_id
                        timestamp : opts.timestamp
                    cb    : cb
            (cb) =>
                # delete now-redundant old patches (in parallel)
                f = (patch, cb) =>
                    @db.delete
                        table : 'syncstrings'
                        where :
                            string_id : opts.string_id
                            timestamp : patch.timestamp
                        cb    : cb
                async.map opts.to_delete, f, (err) => cb(err)
        ], (err) => opts.cb?(err))



#---------------------------------------------------------------------
# Synchronized document-oriented database, based on SynchronizedString
# This is the version run by hubs.
# There is a corresponding implementation run by clients.
#---------------------------------------------------------------------

_syncdb_cache = {}
exports.syncdb = (opts) ->
    opts = defaults opts,
        string_id      : required
        cb             : required
    d = _syncdb_cache[opts.string_id]
    if d?
        opts.cb(undefined, d)
        return
    get_syncstring opts.string_id, (err, S) =>
        if err
            opts.cb(err)
        else
            doc = new diffsync.SynchronizedDB_DiffSyncWrapper(S.in_memory_client)
            S.db_client.on 'changed', () =>
                doc.emit("sync")
            d = _syncdb_cache[opts.string_id] = new diffsync.SynchronizedDB(doc)
            d.string_id = opts.string_id
            opts.cb(undefined, d)


