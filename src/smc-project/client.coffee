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

# close our copy of syncstring (so stop watching it for changes, etc) if
# not active for this long (should be at least 5 minutes).  Longer is better since
# it reduces how long a user might have to wait for save, etc.,
# but it slightly increases database work (managing a changefeed).
SYNCSTRING_MAX_AGE_M = 7
#SYNCSTRING_MAX_AGE_M = 1 # TESTING

{PROJECT_HUB_HEARTBEAT_INTERVAL_S} = require('smc-util/heartbeat')

# CRITICAL: The above SYNCSTRING_MAX_AGE_M idle timeout does *NOT* apply to Sage worksheet
# syncstrings, since they also maintain the sage session, put output into the
# syncstring, etc.  It's critical that those only close when the user explicitly
# kills them, or the project is closed.
NEVER_CLOSE_SYNCSTRING_EXTENSIONS =
    sagews          : true
    'sage-jupyter2' : true

fs     = require('fs')
{join} = require('path')

{EventEmitter} = require('events')

async   = require('async')
winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

require('coffeescript/register')

message    = require('smc-util/message')
misc       = require('smc-util/misc')
misc_node  = require('smc-util-node/misc_node')
synctable  = require('smc-util/synctable')
syncstring = require('smc-util/syncstring')
db_doc     = require('smc-util/db-doc')
schema     = require('smc-util/schema')

sage_session = require('./sage_session')

jupyter = require('./jupyter/jupyter')
{get_kernel_data} = require('./jupyter/kernel-data')

{json} = require('./common')

kucalc = require('./kucalc')

{Watcher} = require('./watcher')

blobs = require('./blobs')

{defaults, required} = misc

DEBUG = false
#DEBUG = true

# Easy way to enable debugging in any project anywhere.
DEBUG_FILE = process.env.HOME + '/.smc-DEBUG'
if fs.existsSync(DEBUG_FILE)
    winston.debug("'#{DEBUG_FILE}' exists, so enabling very verbose logging")
    DEBUG = true
else
    winston.debug("'#{DEBUG_FILE}' does not exist; minimal logging")

ALREADY_CREATED = false
class exports.Client extends EventEmitter
    constructor: (project_id) ->
        super()
        if ALREADY_CREATED
            throw Error("BUG: Client already created!")
        ALREADY_CREATED = true
        @project_id = project_id
        @dbg('constructor')()
        @setMaxListeners(300)  # every open file/table/sync db listens for connect event, which adds up.
        # initialize two caches
        @_hub_callbacks = {}
        @_hub_client_sockets = {}
        @_changefeed_sockets = {}
        @_connected = false

        # Start listening for syncstrings that have been recently modified, so that we
        # can open them and porivde filesystem and computational support.
        @_init_recent_syncstrings_table()

        if kucalc.IN_KUCALC
            kucalc.init(@)
            # always make verbose in kucalc, since logs are taken care of by the k8s
            # logging infrastructure...
            DEBUG = true

    ###
    _test_ping: () =>
        dbg = @dbg("_test_ping")
        test = () =>
            dbg("ping")
            t0 = new Date()
            @call
                message : message.ping()
                timeout : 3
                cb      : (err, resp) =>
                    dbg("pong: #{new Date()-t0}ms; got err=#{err}, resp=#{json(resp)}")
        setInterval(test, 7*1000)

    _test_query_set: () =>
        dbg = @dbg("_test_query_set")
        test = () =>
            dbg("query")
            @query
                query   :
                    projects : {title:"the project takes over!", description:"description set too"}
                cb      : (err, resp) =>
                    dbg("got: err=#{err}, resp=#{json(resp)}")
        setInterval(test, 6*1000)

    _test_query_get: () =>
        dbg = @dbg("_test_query_get")
        test = () =>
            dbg("query")
            @query
                query   :
                    projects : [{project_id:null, title:null, description:null}]
                timeout : 3
                cb      : (err, resp) =>
                    dbg("got: err=#{err}, resp=#{json(resp)}")
        setInterval(test, 5*1000)

    _test_sync_table: () =>
        dbg = @dbg("_test_sync_table")
        table = @sync_table(projects : [{project_id:null, title:null, description:null}])
        table.on 'change', (x) =>
            dbg("table=#{json(table.get().toJS())}")
            #table.set({title:'foo'})

    _test_sync_string: () =>
        dbg = @dbg("_test_sync_string")
        dbg()
        s = @sync_string(id:'5039592f55e13b2d1b78c55ae4a4d3188f3e98a6')
        s.on 'change', () =>
            dbg("sync_string changed to='#{s.version()}'")
        return s
    ###

    _init_recent_syncstrings_table: () =>
        dbg = @dbg("_init_recent_syncstrings_table")
        dbg()
        obj =
            project_id  : @project_id
            max_age_m   : SYNCSTRING_MAX_AGE_M
            path        : null
            last_active : null
            deleted     : null
            doctype     : null

        @_open_syncstrings = {}
        @_recent_syncstrings = @sync_table(recent_syncstrings_in_project:[obj])
        @_recent_syncstrings.on 'change', =>
            @_update_recent_syncstrings()

        @_recent_syncstrings.once 'change', =>
            # We have to do this interval check since syncstrings no longer satisfying the max_age_m query
            # do NOT automatically get removed from the table (that's just not implemented yet).
            # This interval check is also important in order to detect files that were deleted then
            # recreated.
            @_recent_syncstrings_interval = setInterval(@_update_recent_syncstrings, 300)

    _update_recent_syncstrings: () =>
        dbg = @dbg("update_recent_syncstrings")
        cutoff = misc.minutes_ago(SYNCSTRING_MAX_AGE_M)
        @_wait_syncstrings ?= {}
        keys = {}
        x = @_recent_syncstrings.get()
        if not x?
            return
        log_message = "open_syncstrings: #{misc.len(@_open_syncstrings)}; recent_syncstrings: #{x.size}"
        if log_message != @_update_recent_syncstrings_last
            winston.debug(log_message)
            @_update_recent_syncstrings_last = log_message
        x.map (val, key) =>
            string_id = val.get('string_id')
            path = val.get('path')
            if path == '.smc/local_hub/local_hub.log'
                # do NOT open this file, since opening it causes a feedback loop!  The act of opening
                # it is logged in it, which results in further logging ...!
                return
            #winston.debug("LAST_ACTIVE: #{val.get('last_active')}, typeof=#{typeof(val.get('last_active'))}")
            if val.get("last_active") > cutoff
                keys[string_id] = true   # anything not set here gets closed below.
                #dbg("considering '#{path}' with id '#{string_id}'")
                if @_open_syncstrings[string_id]? or @_wait_syncstrings[string_id]
                    # either already open or waiting a bit before opening
                    return
                if not @_open_syncstrings[string_id]?
                    deleted = val.get('deleted')
                    dbg("path='#{path}', deleted=#{deleted}, string_id='#{string_id}'")
                    async.series([
                        (cb) =>
                            if not deleted
                                # sync file (in database) is not deleted so we will open
                                cb()
                                return
                            dbg("check if '#{path}' exists")  # if so, undelete, obviously.
                            @path_exists
                                path : path
                                cb   : (err, exists) =>
                                    if err
                                        cb(err)
                                    else
                                        deleted = not exists
                                        cb()
                    ], (err) =>
                        if err
                            dbg("SERIOUS ERROR -- #{err}")
                        else if deleted
                            # do nothing -- don't open
                            dbg("ignoring deleted path '#{path}'")
                        else if not @_open_syncstrings[string_id]?
                            dbg("open syncstring '#{path}' with id '#{string_id}'")

                            ext = misc.separate_file_extension(path).ext

                            doctype = val.get('doctype')
                            if doctype?
                                dbg("using doctype='#{doctype}'")
                                doctype   = misc.from_json(doctype)
                                opts      = doctype.opts ? {}
                                opts.path = path
                                type      = doctype.type
                            else
                                opts = {path:path}
                                type = 'string'

                            if ext == 'sage-ipython'
                                opts.change_throttle = opts.patch_interval = 5
                                opts.save_interval = 25

                            ss = @_open_syncstrings[string_id] = @["sync_#{type}"](opts)

                            ss.on 'error', (err) =>
                                dbg("ERROR creating syncstring '#{path}' -- #{err}; will try again later")
                                ss.close()

                            ss.on 'close', () =>
                                dbg("remove syncstring '#{path}' with id '#{string_id}' from cache due to close")
                                delete @_open_syncstrings[string_id]
                                # Wait at least 10s before re-opening this syncstring, in case deleted:true passed to db, etc.
                                @_wait_syncstrings[string_id] = true
                                setTimeout((()=>delete @_wait_syncstrings[string_id]), 10000)

                            switch ext
                                when 'sage-jupyter2'
                                    jupyter.jupyter_backend(ss, @)

                    )
            return  # so map doesn't terminate due to funny return value

        for string_id, val of @_open_syncstrings
            path = val._path
            if not keys[string_id] and not NEVER_CLOSE_SYNCSTRING_EXTENSIONS[misc.filename_extension(path)]
                dbg("close syncstring '#{path}' with id '#{string_id}'")
                val.close()
                delete @_open_syncstrings[string_id]

    # use to define a logging function that is cleanly used internally
    dbg: (f) =>
        if DEBUG
            return (m...) ->
                switch m.length
                    when 0
                        s = ''
                    when 1
                        s = m[0]
                    else
                        s = JSON.stringify(m)
                winston.debug("Client.#{f}: #{misc.trunc_middle(s,1000)}")
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
            f(mesg)
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
    query_cancel: (opts) =>
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

    # Get the synchronized table defined by the given query.
    sync_table: (query, options, debounce_interval=2000, throttle_changes=undefined) =>
        return synctable.sync_table(query, options, @, debounce_interval, throttle_changes)
        # TODO maybe change here and in misc-util and everything that calls this stuff...; or change sync_string.
        #opts = defaults opts,
        #    query             : required
        #    options           : undefined
        #    debounce_interval : 2000
        #return synctable.sync_table(opts.query, opts.options, @, opts.debounce_interval)

    # WARNING: making two of the exact same sync_string or sync_db will definitely
    # lead to corruption!  The backend code currently only makes these in _update_recent_syncstrings,
    # right now, so we are OK.  Will need to improve this in the longrun!

    # Get the synchronized string with the given path.
    sync_string: (opts) =>
        opts = defaults opts,
            path            : required
            save_interval   : 500    # amount to debounce saves (in ms)
            patch_interval  : 500    # debouncing of incoming patches
            reference_only  : false  # if true returns undefined if syncstring is not already opened -- do NOT close what is returned
        if opts.reference_only
            string_id = schema.client_db.sha1(@project_id, opts.path)
            @dbg("sync_string")("string_id='#{string_id}', keys=#{JSON.stringify(misc.keys(@_open_syncstrings))}")
            return @_open_syncstrings[string_id]
        delete opts.reference_only
        opts.client = @
        opts.project_id = @project_id
        @dbg("sync_string(path='#{opts.path}')")()
        return new syncstring.SyncString(opts)

    sync_db: (opts) =>
        opts = defaults opts,
            path            : required
            primary_keys    : required
            string_cols     : []
            change_throttle : 0      # amount to throttle change events (in ms)
            save_interval   : 500    # amount to debounce saves (in ms)
            patch_interval  : 500    # debouncing of incoming patches
            reference_only  : false  # if true returns undefined if syncstring is not already opened -- do NOT close what is returned
        if opts.reference_only
            string_id = schema.client_db.sha1(@project_id, opts.path)
            return @_open_syncstrings[string_id]
        delete opts.reference_only
        opts.client = @
        opts.project_id = @project_id
        @dbg("sync_db(path='#{opts.path}')")()
        return new db_doc.SyncDB(opts)

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
    # If file is currently being written or read in this process, will result in error (instead of silently corrupt data).
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
                                cb("file '#{opts.path}' size (=#{size/1000000}MB) too large (must be at most #{opts.maxsize_MB}MB); try opening it in a Terminal with vim instead or write to help@sagemath.com")
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
            interval : 3000     # polling interval in ms
            debounce : 1000     # don't fire until at least this many ms after the file has REMAINED UNCHANGED
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

