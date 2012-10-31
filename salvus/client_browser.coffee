client = require('client')

exports.connect = (url) -> new Connection(url)

class Connection extends client.Connection
    _connect: (url, ondata) ->
            conn = new SockJS("#{url}/hub")
            @_conn = conn
            conn.onopen = () =>
                @_last_pong = require('misc').walltime()
                @_connected = true
                @emit("connected", conn.protocol)
            conn.onmessage = (evt) -> ondata(evt.data)
            conn.onerror = (err) => @emit("error", err)
            
            conn.onclose = () =>
                @emit("connecting")
                if @_connected
                    console.log("SockJS connection just closed, so trying to make a new one...")
                    @_connected = false
                else
                    console.log("Failed to create a SockJS connection; trying again.")
                @_connect(url, ondata)
                
            @_write = (data) -> conn.send(data)
    
    _fix_connection: () ->
        console.log("connection is not working... attempting to fix.")
        @_conn.close()
        
        
    