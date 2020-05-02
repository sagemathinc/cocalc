#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

#
#  message=require('message'); c = require('client_node').connect("http://localhost:5000")
#

#
# NOTE: Automatic reconnect if the server is restarted does not work with this.

client = require('client')

misc = require('smc-util/misc')

exports.connect = (url) -> new Connection(url)

class Connection extends client.Connection
    _connect: (url, ondata) ->
        # TODO!!! Rewrite all this using Primus... https://github.com/primus/primus
        conn = require("sockjs-client-ws").create("#{url}/hub")  # note -- https is not supported
        @_conn = conn
        conn.on("connection", () =>
            @_last_pong = misc.walltime()
            @_connected = true
            @emit("connected", "websocket")
        )
        conn.on("data", ondata)
        conn.on("error", (err) => @emit("error", err))
        conn.on("close", () => @emit("close"))

        @_write = (data) -> conn.write(data)
