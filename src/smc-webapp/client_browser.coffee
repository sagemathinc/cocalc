###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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


client = require('smc-util/client')

class Connection extends client.Connection
    constructor: (opts) ->
        # Security note: not easily exposing this to the global scope would make it harder
        # for an attacker who is eval'ing dangerous code in a Sage worksheet (say).
        # However, even if it were not exposed, the attacker could just do
        #    "conn = new Primus(url, opts)"
        # and make a Primus connection, and start sending/receiving messages.  This would work,
        # because the primus connection authenticates based on secure https cookies,
        # which are there.   So we could make everything painful and hard to program and
        # actually get zero security gain.
        window.smc = {}
        window.smc.client = @
        window.smc.misc = require('smc-util/misc')
        super(opts)

    _connect: (url, ondata) ->
        @url = url
        console.log("websocket -- connecting...")
        if @ondata?
            # handlers already setup
            return

        @ondata = ondata

        opts =
            ping      : 6000   # used for maintaining the connection and deciding when to reconnect.
            pong      : 12000  # used to decide when to reconnect
            strategy  : 'disconnect,online,timeout'
            reconnect :
                max      : 15000
                min      : 500
                factor   : 1.5
                retries  : 100000  # why ever stop trying if we're only trying once every 15 seconds?

        conn = new Primus(url, opts)
        @_conn = conn
        conn.on 'open', () =>
            if @_conn_id?
                conn.write(@_conn_id)
            else
                conn.write("XXXXXXXXXXXXXXXXXXXX")
            @_connected = true
            if window.WebSocket?
                protocol = 'websocket'
            else
                protocol = 'polling'
            console.log("#{protocol} -- connected")

            @emit("connected", protocol)

            #console.log("installing ondata handler")
            conn.removeAllListeners('data')
            f = (data) =>
                @_conn_id = data.toString()
                conn.removeListener('data',f)
                conn.on('data', ondata)
            conn.on("data", f)


        conn.on 'message', (evt) =>
            #console.log("websocket -- message: ", evt)
            ondata(evt.data)

        conn.on 'error', (err) =>
            console.log("websocket -- error: ", err)
            @emit("error", err)

        conn.on 'close', () =>
            console.log("websocket -- closed")
            @_connected = false
            conn.removeAllListeners('data')
            @emit("connecting")

        conn.on 'reconnect scheduled', (opts) =>
            conn.removeAllListeners('data')
            console.log('websocket -- reconnecting in %d ms', opts.scheduled)
            console.log('websocket -- this is attempt %d out of %d', opts.attempt, opts.retries)

        conn.on 'incoming::pong', (time) =>
            #console.log("pong latency=#{conn.latency}")
            if not window.document.hasFocus? or window.document.hasFocus()
                # networking/pinging slows down when browser not in focus...
                @emit "ping", conn.latency

        #conn.on 'outgoing::ping', () =>
        #    console.log(new Date() - 0, "sending a ping")

        @_write = (data) =>
            conn.write(data)


    _fix_connection: () =>
        console.log("websocket --_fix_connection... ")
        @_conn.end()
        @_conn.open()

    _cookies: (mesg) =>
        $.ajax(url:mesg.url, data:{id:mesg.id, set:mesg.set, get:mesg.get, value:mesg.value})

connection = undefined
exports.connect = (url) ->
    if connection?
        return connection
    else
        return connection = new Connection(url)

exports.connect()

