###
Node.js client for CoCalc.

# url could be: ws://cocalc.com or ws://localhost:54249/45f4aab5-7698-4ac8-9f63-9fd307401ad7/port/54249

###

async = require('async')
require('coffee-cache').setCacheDir('/tmp/coffee-cache/')

Primus = require('primus') # Primus library from npm install primus

client = require('smc-util/client')
misc = require('smc-util/misc')
{defaults, required} = misc

message = require('smc-util/message')

exports.client = (opts) ->
    opts = defaults opts,
        url        : required
        auth_token : undefined
        api_key    : undefined
    if not opts.auth_token and not opts.api_key
        raise Error("at least one of auth_token or api_key must be defined")
    return new Connection(opts.url, opts.auth_token, opts.api_key)

class Connection extends client.Connection
    constructor: (url, @_auth_token, @_api_key) ->
        super(url)

    dbg: (name) =>
        return (args...) => console.log("Client.#{name}", args...)

    destroy: =>
        @_destroyed = true
        @_conn?.removeAllListeners()
        @_conn?.end()
        delete @_conn


    _connect: (url, ondata) =>
        if @_destroyed
            return
        dbg = @dbg("_connect")
        dbg()

        @url = url
        if @ondata?
            # handlers already setup
            return

        @ondata = ondata

        i = url.indexOf('://')
        a = url.slice(i+3)
        i = a.indexOf('/')
        if i == -1
            pathname = '/hub'
        else
            pathname = require('path').join(a.slice(i+1), 'hub')
        dbg("pathname='#{pathname}'")
        Socket = Primus.createSocket(pathname : pathname)
        conn = new Socket(url)

        @_conn = conn
        conn.on 'open', () =>
            @_connected = true
            @_connection_is_totally_dead = false
            if @_conn_id?
                conn.write(@_conn_id)
            else
                conn.write("XXXXXXXXXXXXXXXXXXXX")
            protocol = 'websocket'
            @emit("connected", protocol)
            dbg("connected")

            conn.removeAllListeners('data')
            f = (data) =>
                @_conn_id = data.toString()
                conn.removeListener('data',f)
                conn.on('data', ondata)
            conn.on("data", f)

            @_sign_in()

        conn.on 'outgoing::open', (evt) =>
            dbg("connecting")
            @emit("connecting")

        conn.on 'offline', (evt) =>
            dbg("offline")
            @_connected = false
            @emit("disconnected", "offline")

        conn.on 'online', (evt) =>
            dbg("online")

        conn.on 'offline', (evt) =>
            dbg("offline")
            @_connected = false
            @emit("disconnected", "offline")

        conn.on 'online', (evt) =>
            dbg("online")

        conn.on 'message', (evt) =>
            ondata(evt.data)

        conn.on 'error', (err) =>
            dbg("error: ", err)

        conn.on 'close', () =>
            dbg("closed")
            @_connected = false
            @emit("disconnected", "close")

        conn.on 'end', =>
            @_connection_is_totally_dead = true

        conn.on 'reconnect scheduled', (opts) =>
            @_num_attempts = opts.attempt
            @emit("disconnected", "close") # This just informs everybody that we *are* disconnected.
            @emit("connecting")
            conn.removeAllListeners('data')
            dbg("reconnect scheduled in #{opts.scheduled} ms  (attempt #{opts.attempt} out of #{opts.retries})")

        conn.on 'incoming::pong', (time) =>
            dbg("pong latency=#{conn.latency}")
            @emit("ping", conn.latency)

        @_write = (data) =>
            #dbg("@_write '#{data}'", data.length)
            conn.write(data)

    _sign_in: =>
        dbg = @dbg('_sign_in')
        if @_auth_token
            dbg('using auth token')
            auth_token = @_auth_token
            delete @_auth_token
            @sign_in_using_auth_token
                auth_token : auth_token
                cb         : (err, resp) ->
                    if err
                        dbg("failed")
                    else
                        dbg("success")
        else
            dbg('using api key')
            api_key = @_api_key
            #delete @_api_key
            @sign_in_using_api_key
                api_key : api_key
                cb      : (err, resp) ->
                    if err
                        dbg("failed")
                    else
                        dbg("success")

    # we do this mainly for stress testing
    get_sync_tables: (opts) =>
        opts = defaults opts,
            tables : ['accounts', 'projects', 'file_use', 'stats', 'collaborators', 'system_notifications']
            cb     : undefined
        v = {}
        f = (table, cb) =>
            v[table] = t = @sync_table(table, undefined, 2000, undefined, false)
            t.once('connected', (=>cb()))
        async.map opts.tables, f, (err) =>
            opts.cb?(err, v)
        return


###
Sign into the given server nclients times in parallel, call get_sync_tables to
setup the standard synctable (record how long that takes), then disconnect.
###
exports.bench = (opts) ->
    opts = defaults opts,
        url        : required
        api_key    : undefined   # one of api_key or auth_token must be given
        auth_token : undefined
        nclients   : 1           # number of distinct clients to connect at once.
        wait_s     : 0
        cb         : undefined   # (err, data)
    data = {}
    clients = {}
    i = 0
    f = (n, cb) ->
        info = data[n] = {}
        t0 = new Date()
        console.log("*** #{n}: ...")
        clients[n] = exports.client
            url        : opts.url
            auth_token : opts.auth_token
            api_key    : opts.api_key
        clients[n].once 'signed_in', ->
            clients[n].get_sync_tables
                cb : (err) ->
                    if err
                        info.err = err
                    info.time = new Date() - t0
                    i += 1
                    console.log("*** #{i}/#{opts.nclients}", info)
                    f = ->
                        clients[n].destroy()
                        cb()
                    setTimeout(f, opts.wait_s*1000)

    tm = new Date()
    async.map [0...opts.nclients], f, =>
        total = new Date() - tm
        console.log(data)
        console.log("DONE -- total time ", total)
        console.log("DONE -- average time ", total/opts.nclients)
        opts.cb(undefined, data)



