{EventEmitter} = require('events')

async   = require('async')
winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

require('coffee-script/register')

message    = require('smc-util/message')
misc       = require('smc-util/misc')
synctable  = require('smc-util/synctable')
syncstring = require('smc-util/syncstring')

{defaults, required} = misc

class exports.Client extends EventEmitter
    constructor : () ->
        @dbg('constructor')()
        # initialize two caches
        @_hub_callbacks = {}
        @_hub_client_sockets = {}
        @_changefeed_sockets = {}
        @_connected = false

        #@_test_sync_table()
        @_test_sync_string()

    _test_ping: () =>
        dbg = @dbg("_test_ping")
        test = () =>
            dbg("ping")
            t0 = new Date()
            @call
                message : message.ping()
                timeout : 3
                cb      : (err, resp) =>
                    dbg("pong: #{new Date()-t0}ms; got err=#{err}, resp=#{misc.to_json(resp)}")
        setInterval(test, 7*1000)

    _test_query_set: () =>
        dbg = @dbg("_test_query_set")
        test = () =>
            dbg("query")
            @query
                query   :
                    projects : {title:"the project takes over!", description:"description set too"}
                cb      : (err, resp) =>
                    dbg("got: err=#{err}, resp=#{misc.to_json(resp)}")
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
                    dbg("got: err=#{err}, resp=#{misc.to_json(resp)}")
        setInterval(test, 5*1000)

    _test_sync_table: () =>
        dbg = @dbg("_test_sync_table")
        table = @sync_table(projects : [{project_id:null, title:null, description:null}])
        table.on 'change', (x) =>
            dbg("table=#{misc.to_json(table.get().toJS())}")
            #table.set({title:'foo'})

    _test_sync_string: () =>
        dbg = @dbg("_test_sync_string")
        dbg()
        s = @sync_string(id:'5039592f55e13b2d1b78c55ae4a4d3188f3e98a6')
        s.on 'change', () =>
            dbg("sync_string changed to='#{s.version()}'")

    # use to define a logging function that is cleanly used internally
    dbg: (f) =>
        return (m) -> winston.debug("Client.#{f}: #{m}")

    is_signed_in: () => return true

    # declare that this socket is active right now and can be used for communication with some hub
    active_socket: (socket) =>
        dbg = @dbg("active_socket(id=#{socket.id})")
        dbg()
        x = @_hub_client_sockets[socket.id]
        if not x?
            x = @_hub_client_sockets[socket.id] = {socket:socket, callbacks:{}, activity:new Date()}
            socket.on 'end', =>
                dbg("end")
                for id, cb of x.callbacks
                    cb('socket closed')
                delete @_hub_client_sockets[socket.id]
            if  misc.len(@_hub_client_sockets) == 1
                dbg("CONNECTED!")
                @_connected = true
                @emit('connected')
                @emit('signed_in')  # of course
        else
            x.activity = new Date()

    # Handle a mesg coming back from some hub. If we have a callback we call it
    # for the given message, then return true. Otherwise, return
    # false, meaning something else should try to handle this message.
    handle_mesg: (mesg, socket) =>
        dbg = @dbg("handle_mesg(#{misc.to_json(mesg)})")
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
    # to get the same hub if you call this twice!
    get_hub_socket: () =>
        v = misc.values(@_hub_client_sockets)
        if v.length == 0
            return
        v.sort (a,b) -> misc.cmp(a.activity ? 0, b.activity ? 0)
        return v[v.length-1].socket

    # Return a list of *all* the socket connections from hubs to this local_hub
    get_all_hub_sockets = () =>
        return (x.socket for x in misc.values(@_hub_client_sockets))

    # Send a message to some hub server and await a response.
    call: (opts) =>
        opts = defaults opts,
            message     : required
            timeout     : undefined    # timeout in seconds; if specified call will error out after this much time
            socket      : undefined    # if specified, use this socket
            cb          : required
        dbg = @dbg("call(message=#{misc.to_json(opts.messgae)})")
        dbg()
        socket = opts.socket ?= @get_hub_socket() # set socket to best one if no socket specified
        if not socket?
            dbg("no sockets")
            # currently, due to the security model, there's no way out of this; that will change...
            opts.cb("no hubs currently connected to this project")
            return
        if opts.timeout
            dbg("configure timeout")
            fail = () =>
                delete @_hub_callbacks[opts.message.id]
                opts.cb("timeout after #{opts.timeout}s")
            timer = setTimeout(fail, opts.timeout*1000)
        opts.message.id ?= misc.uuid()
        cb = @_hub_callbacks[opts.message.id] = (resp) =>
            dbg("got response: #{misc.to_json(resp)}")
            clearTimeout(timer)
            if resp.event == 'error'
                opts.cb(if resp.error then resp.error else 'error')
            else
                opts.cb(undefined, resp)
        @_hub_client_sockets[socket.id].callbacks[opts.message.id] = cb
        dbg("writing mesg")
        socket.write_mesg('json', opts.message)

    # Do a project_query
    query: (opts) =>
        opts = defaults opts,
            query   : required      # a query (see schema.coffee)
            changes : undefined     # whether or not to create a changefeed
            options : undefined     # options to the query (e.g., limits, sorting)
            timeout : 30            # how long to wait for initial result
            cb      : required
        mesg = message.query
            id             : misc.uuid()
            query          : opts.query
            options        : opts.options
            changes        : opts.changes
            multi_response : opts.changes
        socket = @get_hub_socket()
        @call
            message     : mesg
            timeout     : opts.timeout
            socket      : socket
            cb          : (err, resp) =>
                # Record socket for this changefeed in @_changefeed_sockets
                @_changefeed_sockets[mesg.id] = socket
                opts.cb(err, resp)

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
        return new synctable.SyncTable(query, options, @, debounce_interval)
        # TODO maybe change here and in misc-util and everything that calls this stuff...; or change sync_string.
        #opts = defaults opts,
        #    query             : required
        #    options           : undefined
        #    debounce_interval : 2000
        #return new synctable.SyncTable(opts.query, opts.options, @, opts.debounce_interval)

    # Get the synchronized string with the given id.
    sync_string: (opts) =>
        opts = defaults opts,
            id      : required
            default : ''
        opts.client = @
        return new syncstring.SyncString(opts)


