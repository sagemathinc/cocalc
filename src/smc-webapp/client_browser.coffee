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

{Idle} = require('./external/idle')
misc_page = require("./misc_page")

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
        # Disable for now -- too many issues.  Need this soon though!
        #@_init_idle()
        super(opts)

    _init_idle: () =>
        # 15 min default in case it isn't set (it will get set when user account settings are loaded)
        @_idle_timeout ?= 15 * 60 * 1000
        away_if_not_visible = =>
            delete hidden_timer
            @emit('idle', 'away')
        clear_hidden_timer = =>
            if hidden_timer?
                clearTimeout(hidden_timer)
                delete hidden_timer
        opts =
            onHidden    : =>
                @emit('idle', 'hidden')
                if not hidden_timer? and @_connected
                    hidden_timer = setTimeout(away_if_not_visible, @_idle_timeout)
            onVisible   : =>
                @emit('idle', 'visible')
                clear_hidden_timer()
            onAway      : =>
                @emit('idle', 'away')
                clear_hidden_timer()
            onAwayBack  : =>
                @emit('idle', 'back')
                clear_hidden_timer()
            awayTimeout : @_idle_timeout
        @_idle = new Idle(opts)
        click_handler = undefined
        @on 'idle', (state) ->
            switch state
                when "away"
                    misc_page.idle_notification(true)
                    if not click_handler?
                        click_handler = $("#smc-idle-notification").click () =>
                            misc_page.idle_notification(false)
                            @_conn?.open()
                    if @_connected
                        @_conn?.end()
                when "back", "visible"
                    misc_page.idle_notification(false)
                    @_conn?.open()
        @_idle.start()

    reset_idle: =>
        console.log("idle: reset_idle got called")
        @_idle?.stop()
        @_idle?.start()

    set_standby_timeout_m: (time_m) =>
        @_idle_timeout = time_m * 60 * 1000
        @_idle?.setAwayTimeout(@_idle_timeout)
        @_idle?.start()

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
            misc_page.idle_notification(false)
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
            @emit("disconnected")

        conn.on 'reconnect scheduled', (opts) =>
            @emit("connecting")
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

