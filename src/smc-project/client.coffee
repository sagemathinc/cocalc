#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
client.coffee -- A project viewed as a client for a hub.

For security reasons, a project does initiate a TCP connection to a hub,
but rather hubs initiate TCP connections to projects:

 * MINUS: This makes various things more complicated, e.g., a project
   might not have any open connection to a hub, but still "want" to write
   something to the database; in such a case it is simply out of luck
   and must wait.

 * PLUS: Security is simpler since a hub initiates the connection to
   a project.   A hub doesn't have to receive TCP connections and decide
   whether or not to trust what is on the other end of those connections.

That said, this architecture could change, and very little code would change
as a result.
###

{PROJECT_HUB_HEARTBEAT_INTERVAL_S} = require('smc-util/heartbeat')

fs     = require('fs')
{join} = require('path')
{EventEmitter} = require('events')

{callback2, once} = require("smc-util/async-utils");
async   = require('async')

message    = require('smc-util/message')
misc       = require('smc-util/misc')
misc_node  = require('smc-util-node/misc_node')
synctable2 = require('smc-util/sync/table')
syncdb2    = require('smc-util/sync/editor/db')
schema     = require('smc-util/schema')

sage_session = require('./sage_session')

jupyter = require('./jupyter/jupyter')
{get_kernel_data} = require('./jupyter/kernel-data')

{json} = require('./common')

kucalc = require('./kucalc')

{Watcher} = require('./watcher')

blobs = require('./blobs')

{get_syncdoc} = require('./sync/sync-doc')
{get_listings_table} = require('./sync/listings')

{defaults, required} = misc

{getLogger} = require('./logger')
winston = getLogger('Client')

DEBUG = false
# Easy way to enable debugging in any project anywhere.
DEBUG_FILE = process.env.HOME + '/.smc-DEBUG'
if fs.existsSync(DEBUG_FILE)
    DEBUG = true
else if kucalc.IN_KUCALC
    # always make verbose in kucalc, since logs are taken care of by the k8s
    # logging infrastructure...
    DEBUG = true

exports.init = () =>
    exports.client = new exports.Client()

ALREADY_CREATED = false
class exports.Client extends EventEmitter
    constructor: () ->
        super()
        if ALREADY_CREATED
            throw Error("BUG: Client already created!")
        ALREADY_CREATED = true
        project_id = require('./data').project_id
        @project_id = project_id
        @dbg('constructor')()
        @setMaxListeners(300)  # every open file/table/sync db listens for connect event, which adds up.
        # initialize two caches
        @_hub_callbacks = {}
        @_hub_client_sockets = {}
        @_changefeed_sockets = {}
        @_connected = false
        @_winston = winston

        # Start listening for syncstrings that have been recently modified, so that we
        # can open them and provide filesystem and computational support.
        # TODO: delete this code.
        ## @_init_recent_syncstrings_table()

        if kucalc.IN_KUCALC
            kucalc.init(@)

    # use to define a logging function that is cleanly used internally
    dbg: (f, trunc=1000) =>
        if DEBUG and @_winston
            return (m...) =>
                switch m.length
                    when 0
                        s = ''
                    when 1
                        s = m[0]
                    else
                        s = JSON.stringify(m)
                @_winston.debug("Client.#{f}: #{misc.trunc_middle(s,trunc)}")
        else
            return (m) ->

    alert_message: (opts) =>
        opts = defaults opts,
            type    : 'default'
            title   : undefined
            message : required
            block   : undefined
            timeout : undefined  # time in seconds
        @dbg('alert_message')(opts.title, opts.message)

    # todo: more could be closed...
    close: () =>
        for _, s of misc.keys(@_open_syncstrings)
            s.close()
        delete @_open_syncstrings
        clearInterval(@_recent_syncstrings_interval)

    # account_id or project_id of this client
    client_id: () =>
        return @project_id

    # true since this client is a project
    is_project: () =>
        return true

    # false since this client is not a user
    is_user: () =>
        return false

    is_signed_in: () =>
        return true

    is_connected: =>
        return @_connected

    # We trust the time on our own compute servers (unlike random user's browser).
    server_time: () =>
        return new Date()

    # Declare that the given socket is active right now and can be used for
    # communication with some hub (the one the socket is connected to).
    active_socket: (socket) =>
        dbg = @dbg("active_socket(id=#{socket.id},ip='#{socket.remoteAddress}')")
        x = @_hub_client_sockets[socket.id]
        if not x?
            dbg()
            x = @_hub_client_sockets[socket.id] = {socket:socket, callbacks:{}, activity:new Date()}
            locals =
                heartbeat_interval : undefined
            socket_end = =>
                if not locals.heartbeat_interval?
                    return
                dbg("ending socket")
                clearInterval(locals.heartbeat_interval)
                locals.heartbeat_interval = undefined
                if x.callbacks?
                    for id, cb of x.callbacks
                        cb?('socket closed')
                    delete x.callbacks  # so additional trigger of end doesn't do anything
                delete @_hub_client_sockets[socket.id]
                dbg("number of active sockets now equals #{misc.len(@_hub_client_sockets)}")
                if misc.len(@_hub_client_sockets) == 0
                    @_connected = false
                    dbg("lost all active sockets")
                    @emit('disconnected')
                socket.end()

            socket.on('end', socket_end)
            socket.on('error', socket_end)

            check_heartbeat = =>
                if not socket.heartbeat? or new Date() - socket.heartbeat >= 1.5*PROJECT_HUB_HEARTBEAT_INTERVAL_S*1000
                    dbg("heartbeat failed")
                    socket_end()
                else
                    dbg("heartbeat -- socket is working")

            locals.heartbeat_interval = setInterval(check_heartbeat, 1.5*PROJECT_HUB_HEARTBEAT_INTERVAL_S*1000)

            if misc.len(@_hub_client_sockets) >= 1
                dbg("CONNECTED!")
                @_connected = true
                @emit('connected')
        else
            x.activity = new Date()

    # Handle a mesg coming back from some hub. If we have a callback we call it
    # for the given message, then return true. Otherwise, return
    # false, meaning something else should try to handle this message.
    handle_mesg: (mesg, socket) =>
        dbg = @dbg("handle_mesg(#{misc.trunc_middle(json(mesg),512)})")
        f = @_hub_callbacks[mesg.id]
        if f?
            dbg("calling callback")
            if not mesg.multi_response
                delete @_hub_callbacks[mesg.id]
                delete @_hub_client_sockets[socket.id].callbacks[mesg.id]
            try
                f(mesg)
            catch err
                dbg("WARNING: error handling message from client. -- #{err}")
            return true
        else
            dbg("no callback")
            return false

    # Get a socket connection to the hub from one in our cache; choose one at random.
    # There is obviously no guarantee to get the same hub if you call this twice!
    # Returns undefined if there are currently no connections from any hub to us
    # (in which case, the project must wait).
    get_hub_socket: =>
        socket_ids = misc.keys(@_hub_client_sockets)
        @dbg("get_hub_socket")("there are #{socket_ids.length} sockets -- #{JSON.stringify(socket_ids)}")
        if socket_ids.length == 0
            return
        return @_hub_client_sockets[misc.random_choice(socket_ids)].socket

    # Send a message to some hub server and await a response (if cb defined).
    call: (opts) =>
        opts = defaults opts,
            message     : required
            timeout     : undefined    # timeout in seconds; if specified call will error out after this much time
            socket      : undefined    # if specified, use this socket
            cb          : undefined    # awaits response if given
        dbg = @dbg("call(message=#{json(opts.message)})")
        dbg()
        socket = opts.socket ?= @get_hub_socket() # set socket to best one if no socket specified
        if not socket?
            dbg("no sockets")
            # currently, due to the security model, there's no way out of this; that will change...
            opts.cb?("no hubs currently connected to this project")
            return
        if opts.cb?
            if opts.timeout
                dbg("configure timeout")
                fail = () =>
                    dbg("failed")
                    delete @_hub_callbacks[opts.message.id]
                    opts.cb?("timeout after #{opts.timeout}s")
                    delete opts.cb
                timer = setTimeout(fail, opts.timeout*1000)
            opts.message.id ?= misc.uuid()
            cb = @_hub_callbacks[opts.message.id] = (resp) =>
                #dbg("got response: #{misc.trunc(json(resp),400)}")
                if timer?
                    clearTimeout(timer)
                    timer = undefined
                if resp.event == 'error'
                    opts.cb?(if resp.error then resp.error else 'error')
                else
                    opts.cb?(undefined, resp)
            @_hub_client_sockets[socket.id].callbacks[opts.message.id] = cb
        # Finally, send the message
        socket.write_mesg('json', opts.message)

    # Do a project_query
    query: (opts) =>
        opts = defaults opts,
            query   : required      # a query (see schema.coffee)
            changes : undefined     # whether or not to create a changefeed
            options : undefined     # options to the query, e.g., [{limit:5}] )
            standby : false         # **IGNORED**
            timeout : 30            # how long to wait for initial result
            cb      : required
        if opts.options? and not misc.is_array(opts.options)
            throw Error("options must be an array")
            return
        mesg = message.query
            id             : misc.uuid()
            query          : opts.query
            options        : opts.options
            changes        : opts.changes
            multi_response : opts.changes
        socket = @get_hub_socket()
        if not socket?
            # It will try later when one is available...
            opts.cb("no hub socket available")
            return
        if opts.changes
            # Record socket for this changefeed in @_changefeed_sockets
            @_changefeed_sockets[mesg.id] = socket
            # CRITICAL: On error or end, send an end error to the synctable, so that it will
            # attempt to reconnect (and also stop writing to the socket).
            # This is important, since for project clients
            # the disconnected event is only emitted when *all* connections from
            # hubs to the local_hub end.  If two connections s1 and s2 are open,
            # and s1 is used for a sync table, and s1 closes (e.g., hub1 is restarted),
            # then s2 is still open and no 'disconnected' event is emitted.  Nonetheless,
            # it's important for the project to consider the synctable broken and
            # try to reconnect it, which in this case it would do using s2.
            socket.on 'error', =>
                opts.cb('socket-end')
            socket.on 'end', =>
                opts.cb('socket-end')
        @call
            message     : mesg
            timeout     : opts.timeout
            socket      : socket
            cb          : opts.cb

    # Cancel an outstanding changefeed query.
    _query_cancel: (opts) =>
        opts = defaults opts,
            id : required           # changefeed id
            cb : undefined
        socket = @_changefeed_sockets[opts.id]
        if not socket?
            # nothing to do
            opts.cb?()
        else
            @call
                message : message.query_cancel(id:opts.id)
                timeout : 30
                socket  : socket
                cb      : opts.cb

    # ASYNC version
    query_cancel: (id) =>
        return await callback2(@_query_cancel, {id:id})

    sync_table: (query, options, throttle_changes=undefined) =>
        return synctable2.synctable(query, options, @, throttle_changes)

    # We leave in the project_id for consistency with the browser UI.
    # And maybe someday we'll have tables managed across projects (?).
    synctable_project: (project_id, query, options) =>
        # TODO: this is ONLY for syncstring tables (syncstrings, patches, cursors).
        # Also, options are ignored -- since we use whatever was selected by the frontend.
        the_synctable = await require('./sync/open-synctables').get_synctable(query, @)
        # To provide same API, must also wait until done initializing.
        if the_synctable.get_state() != 'connected'
            await once(the_synctable, 'connected')
        if the_synctable.get_state() != 'connected'
            throw Error("Bug -- state of synctable must be connected " + JSON.stringify(query))
        return the_synctable

    # WARNING: making two of the exact same sync_string or sync_db will definitely
    # lead to corruption!

    # Get the synchronized doc with the given path.  Returns undefined
    # if currently no such sync-doc.
    syncdoc: (opts) =>
        opts = defaults opts,
            path : required
        return get_syncdoc(opts.path)

    symmetric_channel: (name) =>
        return require('./browser-websocket/symmetric_channel').symmetric_channel(name)

    # Write a file to a given path (relative to env.HOME) on disk; will create containing directory.
    # If file is currently being written or read in this process, will result in error (instead of silently corrupt data).
    write_file: (opts) =>
        opts = defaults opts,
            path : required
            data : required
            cb   : required
        path = join(process.env.HOME, opts.path)
        @_file_io_lock ?= {}
        dbg = @dbg("write_file(path='#{opts.path}')")
        dbg()
        now = new Date()
        if now - (@_file_io_lock[path] ? 0) < 15000  # lock automatically expires after 15 seconds (see https://github.com/sagemathinc/cocalc/issues/1147)
            dbg("LOCK")
            # Try again in about 1s.
            setTimeout((() => @write_file(opts)), 500 + 500*Math.random())
            return
        @_file_io_lock[path] = now
        dbg("@_file_io_lock = #{misc.to_json(@_file_io_lock)}")
        async.series([
            (cb) =>
                misc_node.ensure_containing_directory_exists(path, cb)
            (cb) =>
                fs.writeFile(path, opts.data, cb)
        ], (err) =>
            delete @_file_io_lock[path]
            if err
                dbg("error -- #{err}")
            else
                dbg("success")
            opts.cb(err)
        )

    # Read file as a string from disk.
    # If file is currently being written or read in this process,
    # will retry until it isn't, so we do not get an error and we
    # do NOT get silently corrupted data.
    path_read: (opts) =>
        opts = defaults opts,
            path       : required
            maxsize_MB : undefined   # in megabytes; if given and file would be larger than this, then cb(err)
            cb         : required    # cb(err, file content as string (not Buffer!))
        content = undefined
        path    = join(process.env.HOME, opts.path)
        dbg = @dbg("path_read(path='#{opts.path}', maxsize_MB=#{opts.maxsize_MB})")
        dbg()
        @_file_io_lock ?= {}

        now = new Date()
        if now - (@_file_io_lock[path] ? 0) < 15000  # lock expires after 15 seconds (see https://github.com/sagemathinc/cocalc/issues/1147)
            dbg("LOCK")
            # Try again in 1s.
            setTimeout((() => @path_read(opts)), 500 + 500*Math.random())
            return
        @_file_io_lock[path] = now

        dbg("@_file_io_lock = #{misc.to_json(@_file_io_lock)}")
        async.series([
            (cb) =>
                if opts.maxsize_MB?
                    dbg("check if file too big")
                    @file_size
                        filename : opts.path
                        cb   : (err, size) =>
                            if err
                                dbg("error checking -- #{err}")
                                cb(err)
                            else if size > opts.maxsize_MB * 1000000
                                dbg("file is too big!")
                                cb("file '#{opts.path}' size (=#{size/1000000}MB) too large (must be at most #{opts.maxsize_MB}MB); try opening it in a Terminal with vim instead or click Help in the upper right to open a support request")
                            else
                                dbg("file is fine")
                                cb()
                else
                    cb()
            (cb) =>
                fs.readFile path, (err, data) =>
                    if err
                        dbg("error reading file -- #{err}")
                        cb(err)
                    else
                        dbg('read file')
                        content = data.toString()
                        cb()
        ], (err) =>
            delete @_file_io_lock[path]
            opts.cb(err, content)
        )

    path_access: (opts) =>
        opts = defaults opts,
            path : required    # string
            mode : required    # string -- sub-sequence of 'rwxf' -- see https://nodejs.org/api/fs.html#fs_class_fs_stats
            cb   : required    # cb(err); err = if any access fails; err=undefined if all access is OK
        access = 0
        for s in opts.mode
            access |= fs[s.toUpperCase() + '_OK']
        fs.access(opts.path, access, opts.cb)

    # TODO: exists is deprecated.  "To check if a file exists
    # without manipulating it afterwards, fs.access() is
    # recommended."
    path_exists: (opts) =>
        opts = defaults opts,
            path : required
            cb   : required
        dbg = @dbg("checking if path (='#{opts.path}') exists")
        dbg()
        fs.exists opts.path, (exists) =>
            dbg("returned #{exists}")
            opts.cb(undefined, exists)  # err actually never happens with node.js, so we change api to be more consistent

    path_stat: (opts) =>  # see https://nodejs.org/api/fs.html#fs_class_fs_stats
        opts = defaults opts,
            path : required
            cb   : required
        fs.stat(opts.path, opts.cb)

    # Size of file in bytes (divide by 1000 for K, by 10^6 for MB.)
    file_size: (opts) =>
        opts = defaults opts,
            filename : required
            cb       : required
        @path_stat
            path : opts.filename
            cb   : (err, stat) =>
                opts.cb(err, stat?.size)

    # execute a command using the shell or a subprocess -- see docs for execute_code in misc_node.
    shell: (opts) =>
        misc_node.execute_code(opts)

    # return new sage session
    sage_session: (opts) =>
        opts = defaults opts,
            path : required
        return sage_session.sage_session(path:opts.path, client:@)

    # returns a Jupyter kernel session
    jupyter_kernel: (opts) =>
        opts.client = @
        return jupyter.kernel(opts)

    jupyter_kernel_info: =>
        return await get_kernel_data()

    # See the file watcher.coffee for docs
    watch_file: (opts) =>
        opts = defaults opts,
            path     : required
            interval : 1500     # polling interval in ms
            debounce : 500     # don't fire until at least this many ms after the file has REMAINED UNCHANGED
        path = require('path').join(process.env.HOME, opts.path)
        dbg = @dbg("watch_file(path='#{path}')")
        dbg("watching file '#{path}'")
        return new Watcher(path, opts.interval, opts.debounce)

    # Save a blob to the central db blobstore.
    # The sha1 is optional.
    save_blob: (opts) =>
        opts = defaults opts,
            blob : required   # Buffer of data
            sha1 : undefined
            uuid : undefined  # if given is uuid derived from sha1
            cb   : undefined  # (err, resp)
        if opts.uuid?
            uuid = opts.uuid
        else
            uuid = misc_node.uuidsha1(opts.blob, opts.sha1)
        dbg = @dbg("save_blob(uuid='#{uuid}')")
        hub = @get_hub_socket()
        if not hub?
            dbg("fail -- no global hubs")
            opts.cb?('no global hubs are connected to the local hub, so nowhere to send file')
            return
        dbg("sending blob mesg")
        hub.write_mesg('blob', {uuid:uuid, blob:opts.blob})
        dbg("waiting for response")
        blobs.receive_save_blob_message
            sha1 : uuid
            cb   : (resp) =>
                if resp?.error
                    dbg("fail -- '#{resp.error}'")
                    opts.cb?(resp.error, resp)
                else
                    dbg("success")
                    opts.cb?(undefined, resp)

    get_blob: (opts) =>
        opts = defaults opts,
            blob : required   # Buffer of data
            sha1 : undefined
            uuid : undefined  # if given is uuid derived from sha1
            cb   : undefined  # (err, resp)
        dbg = @dbg("get_blob")
        dbg(opts.sha1)
        opts.cb?('get_blob: not implemented')


    # no-op; assumed async api
    touch_project: (project_id) =>

    # async
    get_syncdoc_history: (string_id, patches=false) =>
        dbg = @dbg("get_syncdoc_history")
        dbg(string_id, patches)
        mesg = message.get_syncdoc_history
            string_id : string_id
            patches   : patches
        return await callback2(@call, {message:mesg})

    # NOTE: returns false if the listings table isn't connected.
    is_deleted: (filename, project_id) => # project_id is ignored, of course
        try
            listings = get_listings_table();
            return listings.is_deleted(filename)
        catch
            # is_deleted can raise an exception if the table is
            # not yet initialized, in which case we fall back
            # to actually looking.  We have to use existsSync
            # because is_deleted is not an async function.
            return not fs.existsSync(join(process.env.HOME, filename))

    set_deleted: (filename, project_id) => # project_id is ignored
        listings = get_listings_table();
        await listings.set_deleted(filename)
