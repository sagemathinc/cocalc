###
#
#    c = require('client_node').connect("http://localhost:5000")
# 
###

client = require('client')

exports.connect = (url, cb) -> new Connection(url, cb)

class Connection extends client.Connection
    constructor: (url, cb) ->
        conn = require("sockjs-client-ws").create("#{url}/hub")  # note -- https is not supported
        conn.on("connection", cb) if cb? # register cb to be called when initial connection is made
        super(
            send: (data) -> conn.write(data)
            set_onmessage: (cb) -> conn.on('data', cb)
            set_onerror: (cb) -> conn.on('error', cb)
        )
        conn.on("close", () => @emit("close"))

        
        
