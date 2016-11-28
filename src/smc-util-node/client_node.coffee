###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


###
#
#  message=require('message'); c = require('client_node').connect("http://localhost:5000")
#
###
#
# NOTE: Automatic reconnect if the server is restarted does not work with this.
# It *does* work for client_browser.coffee though, which is what matters.

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

