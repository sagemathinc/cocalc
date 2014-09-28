client = require('client')

exports.connect = (url) -> new Connection(url)

class Connection extends client.Connection
    _connect: (url, ondata) ->
        console.log("primus_client: connecting to '#{url}'")
        conn = new Primus(url)
        @_conn = conn
        conn.on 'open', () =>
            console.log("primus_client: open -- successfully connected")
            @_last_pong = require('misc').walltime()
            @_connected = true
            @emit("connected", 'websocket')

        conn.on 'message', (evt) =>
            console.log("primus_client -- message: ", evt)
            ondata(evt.data)

        conn.on 'error', (err) =>
            console.log("primus_client -- error: ", evt)
            @emit("error", err)

        conn.on 'close', () =>
            console.log("primus_client: close")
            @emit("connecting")
            if @_connected
                console.log("Primus connection just closed, so trying to make a new one...")
                @_connected = false
            else
                console.log("Failed to create a Primus connection; trying again.")
            setTimeout((() => @_connect(url, ondata)), 1000)

        @_write = (data) -> conn.send(data)

    _fix_connection: () ->
        console.log("connection is not working... attempting to fix.")
        @_conn.close()

    _cookies: (mesg) ->
        $.ajax(url:mesg.url, data:{id:mesg.id, set:mesg.set, get:mesg.get})
