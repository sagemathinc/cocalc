###
#
#  message=require('message'); c = require('client_node').connect("http://localhost:5000")
#
###
#
# NOTE: Automatic reconnect if the server is restarted does not work with this.
# It *does* work for client_browser.coffee though, which is what matters.

client = require('client')

exports.connect = (url) -> new Connection(url)

class Connection extends client.Connection
    _connect: (url, ondata) ->
        # TODO!!! Rewrite all this using Primus... https://github.com/primus/primus
        conn = require("sockjs-client-ws").create("#{url}/hub")  # note -- https is not supported
        @_conn = conn
        conn.on("connection", () =>
            @_last_pong = require('misc').walltime()
            @_connected = true
            @emit("connected", "websocket")
        )
        conn.on("data", ondata)
        conn.on("error", (err) => @emit("error", err))
        conn.on("close", () => @emit("close"))

        @_write = (data) -> conn.write(data)

