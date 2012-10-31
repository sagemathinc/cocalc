###
#
#  c = require('client_node').connect("http://localhost:5000")
# 
###

client = require('client')

exports.connect = (url, cb) -> new Connection(url, cb)

class Connection extends client.Connection
    _connect: (url, ondata) ->
        conn = require("sockjs-client-ws").create("#{url}/hub")  # note -- https is not supported
        @_conn = conn
        conn.on("connection", () => @emit("open", "websocket"))
        conn.on("data", ondata)
        conn.on("error", (err) => @emit("error", err))
        conn.on("close", () => @emit("close"))
        return (data) -> conn.write(data)
