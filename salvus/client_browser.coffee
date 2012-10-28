client = require('client')

exports.connect = (url) -> new Connection(url)

class Connection extends client.Connection
    constructor: (url) ->
        conn = new SockJS("#{url}/hub")
        super(
            send: (data) -> conn.send(data)
            set_onmessage: (cb) -> conn.onmessage = cb
            set_onerror: (cb) -> conn.onerror = cb
        )
            
        
    