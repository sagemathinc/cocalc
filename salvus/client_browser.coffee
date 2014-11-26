client = require('client')
exports.connect = (url) ->
    new Connection(url)

{walltime} = require('misc')
t = walltime()

class Connection extends client.Connection
    _connect: (url, ondata) ->
        @url = url
        @ondata = ondata
        console.log("websocket -- connecting to '#{url}'...")

        opts =
            ping      : 6000   # used for maintaining the connection and deciding when to reconnect.
            pong      : 12000  # used to decide when to reconnect
            strategy  : 'disconnect,online,timeout'
            reconnect :
              maxDelay : 15000
              minDelay : 500
              retries  : 100000  # why ever stop trying if we're only trying once every 15 seconds?

        conn = new Primus(url, opts)
        @_conn = conn
        conn.on 'open', () =>
            @_connected = true
            if window.WebSocket?
                protocol = 'websocket'
            else
                protocol = 'polling'
            console.log("#{protocol} -- connected in #{walltime(t)} seconds")
            @emit("connected", protocol)

        conn.on 'message', (evt) =>
            #console.log("websocket -- message: ", evt)
            ondata(evt.data)

        conn.on 'error', (err) =>
            console.log("websocket -- error: ", err)
            @emit("error", err)

        conn.on 'close', () =>
            console.log("websocket -- closed")
            @_connected = false
            t = walltime()
            @emit("connecting")

        conn.on 'data', (data) =>
            # console.log("websocket --data='#{data}'")
            ondata(data)

        conn.on 'reconnecting', (opts) =>
            console.log('websocket --reconnecting in %d ms', opts.timeout)
            console.log('websocket --this is attempt %d out of %d', opts.attempt, opts.retries)

        conn.on 'incoming::pong', (time) =>
            #console.log("pong latency=#{conn.latency}")
            if not window.document.hasFocus? or window.document.hasFocus()
                # networking/pinging slows down when browser not in focus...
                @emit "ping", conn.latency

        #conn.on 'outgoing::ping', () =>
        #    console.log(new Date() - 0, "sending a ping")

        @_write = (data) =>
            conn.write(data)


    _fix_connection: () =>
        console.log("websocket --_fix_connection...")
        @_conn.end()
        @_connect(@url, @ondata)

    _cookies: (mesg) =>
        $.ajax(url:mesg.url, data:{id:mesg.id, set:mesg.set, get:mesg.get, value:mesg.value})
