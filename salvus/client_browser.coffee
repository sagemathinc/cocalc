client = require('client')

exports.connect = (url, cb) -> new Connection(url, cb)

class Connection extends client.Connection
    _connect: (url, ondata) ->
        conn = new SockJS("#{url}/hub")
        @_conn = conn
        conn.onopen = () => @emit("open", conn.protocol)
        conn.onmessage = (evt) -> ondata(evt.data)
        conn.onerror = (err) => @emit("error", err)
        conn.onclose = () => @emit("close")
        return (data) -> conn.send(data)
        
        
    