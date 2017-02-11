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
SYNCSTRING_MAX_AGE_M = 20
#SYNCSTRING_MAX_AGE_M = 1 # TESTING

# CRITICAL: The above SYNCSTRING_MAX_AGE_M idle timeout does *NOT* apply to Sage worksheet
# syncstrings, since they also maintain the sage session, put output into the
# syncstring, etc.  It's critical that those only close when the user explicitly
# kills them, or the project is closed.
NEVER_CLOSE_SYNCSTRING_EXTENSIONS =
    sagews : true   # only sagews for now.

fs     = require('fs')
{join} = require('path')

{EventEmitter} = require('events')

async   = require('async')
winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

require('coffee-script/register')

message    = require('smc-util/message')
misc       = require('smc-util/misc')
misc_node  = require('smc-util-node/misc_node')
synctable  = require('smc-util/synctable')
syncstring = require('smc-util/syncstring')

sage_session = require('./sage_session')

{json} = require('./common')

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


class exports.Client extends EventEmitter
    constructor: (@project_id) ->
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
                            ss = @_open_syncstrings[string_id] = @sync_string(path:path)
                            ss.on 'error', (err) =>
                                dbg("ERROR creating syncstring '#{path}' -- #{err}; will try again later")
                                ss.close()
                            ss.on 'close', () =>
                                dbg("remove syncstring '#{path}' with id '#{string_id}' from cache due to close")
                                delete @_open_syncstrings[string_id]
                                # Wait at least 10s before re-opening this syncstring, in case deleted:true passed to db, etc.
                                @_wait_syncstrings[string_id] = true
                                setTimeout((()=>delete @_wait_syncstrings[string_id]), 10000)
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
            return (m) -> winston.debug("Client.#{f}: #{m}")
        else
            return (m) ->

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
        dbg = @dbg("active_socket(id=#{socket.id})")
        x = @_hub_client_sockets[socket.id]
        if not x?
            dbg()
            x = @_hub_client_sockets[socket.id] = {socket:socket, callbacks:{}, activity:new Date()}
            socket.on 'end', =>
                dbg("end")
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
        dbg = @dbg("handle_mesg(#{json(mesg)})")
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

    # Get a socket connection to the hub from one in our cache; choose the
    # connection that most recently sent us a message.  There is no guarantee
    # to get the same hub if you call this twice!  Returns undefined if there
    # are currently no connections from any hub to us (in which case, the project
    # must wait).
    get_hub_socket: () =>
        v = misc.values(@_hub_client_sockets)
        if v.length == 0
            return
        v.sort (a,b) -> misc.cmp(a.activity ? 0, b.activity ? 0)
        return v[v.length-1].socket

    # Return a list of *all* the socket connections from hubs to this local_hub
    get_all_hub_sockets = () =>
        return (x.socket for x in misc.values(@_hub_client_sockets))

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

    # Get a list of the ids of changefeeds that remote hubs are pushing to this project.
    # This just does its best and if there is an error/timeout trying to get ids from a hub,
    # assumes that hub isn't working anymore.
    query_get_changefeed_ids: (opts) =>
        opts = defaults opts,
            timeout : 30
            cb      : required    # opts.cb(undefined, [ids...])
        ids = []
        f = (socket, cb) =>
            @call  # getting a message back with this id cancels listening
                message : message.query_get_changefeed_ids()
                timeout : opts.timeout
                socket  : socket
                cb      : (err, resp) =>
                    if not err
                        ids = ids.concat(resp.changefeed_ids)
                    cb()
        async.map @get_all_hub_sockets(), f, () =>
            opts.cb(undefined, ids)

    # Get the synchronized table defined by the given query.
    sync_table: (query, options, debounce_interval=2000) =>
        return synctable.sync_table(query, options, @, debounce_interval)
        # TODO maybe change here and in misc-util and everything that calls this stuff...; or change sync_string.
        #opts = defaults opts,
        #    query             : required
        #    options           : undefined
        #    debounce_interval : 2000
        #return synctable.sync_table(opts.query, opts.options, @, opts.debounce_interval)

    # Get the synchronized string with the given path.
    sync_string: (opts) =>
        opts = defaults opts,
            path    : required
            default : ''
        opts.client = @
        opts.project_id = @project_id
        @dbg("sync_string(path='#{opts.path}')")()
        return new syncstring.SyncString(opts)

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
        if now - (@_file_io_lock[path] ? 0) < 15000  # lock expires after 15 seconds (see https://github.com/sagemathinc/smc/issues/1147)
            dbg("LOCK")
            opts.cb("write_file -- file is currently being read or written")
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
            cb         : required
        content = undefined
        path    = join(process.env.HOME, opts.path)
        dbg = @dbg("path_read(path='#{opts.path}', maxsize_MB=#{opts.maxsize_MB})")
        dbg()
        @_file_io_lock ?= {}

        now = new Date()
        if now - (@_file_io_lock[path] ? 0) < 15000  # lock expires after 15 seconds (see https://github.com/sagemathinc/smc/issues/1147)
            dbg("LOCK")
            opts.cb("path_read -- file is currently being read or written")
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
        @dbg("checking if path exists")(opts.path)
        fs.exists opts.path, (exists) =>
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

    # Watch for changes to the given file.  Returns obj, which
    # is an event emitter with events:
    #
    #    - 'change' - when file changes or is created
    #    - 'delete' - when file is deleted
    #
    # and a method .close().
    watch_file: (opts) =>
        opts = defaults opts,
            path     : required
            interval : 3000       # polling interval in ms
        path = require('path').join(process.env.HOME, opts.path)
        dbg = @dbg("watch_file(path='#{path}')")
        dbg("watching file '#{path}'")
        return new Watcher(path, opts.interval)

class Watcher extends EventEmitter
    constructor: (@path, @interval) ->
        fs.watchFile(@path, {interval: @interval}, @listen)

    close: () =>
        @removeAllListeners()
        fs.unwatchFile(@path, @listener)

    listen: (curr, prev) =>
        if curr.dev == 0
            @emit 'delete'
        else
            @emit 'change'



