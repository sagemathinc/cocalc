client = require('client')

exports.connect = (url) ->
    new Connection(url)

class Connection extends client.Connection
    _connect: (url, ondata) ->
        @url = url
        @ondata = ondata
        console.log("client: connecting to '#{url}'...")

        opts =
            ping      : 9000
            pong      : 7000
            strategy  : 'disconnect,online,timeout'
            reconnect :
              maxDelay : 20000
              minDelay : 500
              retries  : 100

        conn = new Primus(url, opts)
        @_conn = conn
        conn.on 'open', () =>
            console.log("client -- open")
            @_connected = true
            @emit("connected", 'websocket')

        conn.on 'message', (evt) =>
            #console.log("client -- message: ", evt)
            ondata(evt.data)

        conn.on 'error', (err) =>
            console.log("client -- error: ", evt)
            @emit("error", err)

        conn.on 'close', () =>
            console.log("client: closed")
            @_connected = false
            @emit("connecting")

        conn.on 'data', (data) =>
            # console.log("client: data='#{data}'")
            ondata(data)

        conn.on 'reconnecting', (opts) =>
            console.log('client: reconnecting in %d ms', opts.timeout)
            console.log('client: this is attempt %d out of %d', opts.attempt, opts.retries)

        conn.on 'incoming::pong', () =>
            # console.log("pong latency=#{conn.latency}")
            @emit "ping", conn.latency

        @_write = (data) =>
            conn.write(data)

    _fix_connection: () =>
        console.log("client: _fix_connection...")
        @_conn.end()
        @_connect(@url, @ondata)

    _cookies: (mesg) =>
        $.ajax(url:mesg.url, data:{id:mesg.id, set:mesg.set, get:mesg.get})
