client = require('client')

exports.connect = (url, cb) -> new Connection(url, cb)

class Connection extends client.Connection
    constructor: (url, cb) ->
        @on("open", cb) if cb?  # register cb to get called when connection is opened
        conn = new SockJS("#{url}/hub")
        super(
            send: (data) -> conn.send(data)
            set_onmessage: (cb) -> conn.onmessage = (evt) -> cb(evt.data)
            set_onerror: (cb) -> conn.onerror = (evt) -> cb(evt.data)
        )
        conn.onopen = () => @emit("open")
        conn.onclose = () => @emit("close")
            
        
    