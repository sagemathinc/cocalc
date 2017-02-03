###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014 -- 2016, SageMath, Inc.
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

if not Primus?
    alert("Library not fully built (Primus not defined) -- refresh your browser")
    window.location.reload()

$ = window.$
_ = require('underscore')

client = require('smc-util/client')

#{SMC_ICON_URL} = require('./misc_page')
SMC_ICON_URL = require('salvus-icon.svg')

# these idle notifications were in misc_page, but importing it here failed

idle_notification_html = ->
    {redux}   = require('./smc-react')
    customize = redux.getStore('customize')
    site_name = customize?.get('site_name') ? "SageMathCloud"
    """
    <div>
    <img src="#{SMC_ICON_URL}">
    <h1>#{site_name}<br> is on standby</h1>
    &mdash; click to resume &mdash;
    </div>
    """

idle_notification_state = undefined

idle_notification = (show) ->
    if idle_notification_state? and idle_notification_state == show
        return
    $idle = $("#smc-idle-notification")
    if show
        if $idle.length == 0
            box = $("<div/>", id: "smc-idle-notification" ).html(idle_notification_html())
            $("body").append(box)
            # quick slide up, just to properly slide down on the fist time
            box.slideUp 0, ->
                box.slideDown "slow"
        else
            $idle.slideDown "slow"
    else
        $idle.slideUp "slow"
    idle_notification_state = show

# end idle notifications

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
        #
        # **CRITICAL:** If the smc object isn't defined in your Google Chrome console session,
        # you have to change the context to *top*!   See
        # http://stackoverflow.com/questions/3275816/debugging-iframes-with-chrome-developer-tools/8581276#8581276
        #
        setTimeout(@_init_idle, 15 * 1000)
        super(opts)
        @_setup_window_smc()

        # This is used by the base class for marking file use notifications.
        @_redux = require('./smc-react').redux

    _setup_window_smc: () =>
        # if we are in DEBUG mode, inject the client into the global window object
        if not DEBUG
            return
        window.smc                     ?= {}
        window.smc.client              = @
        window.smc.misc                = require('smc-util/misc')
        window.smc.done                = window.smc.misc.done
        window.smc.sha1                = require('sha1')
        window.smc.schema              = require('smc-util/schema')
        # use to enable/disable verbose synctable logging
        window.smc.synctable_debug     = require('smc-util/synctable').set_debug
        window.smc.idle_trigger        = => @emit('idle', 'away')

        # Client-side testing code -- we use require.ensure so this stuff only
        # ever gets loaded by the browser if actually used.
        window.smc.test = (modules) ->
            require.ensure ['./test-client/init'], ->
                require('./test-client/init').run(modules)
        window.smc.test_clear = () ->
            require.ensure ['./test-client/init'], ->
                require('./test-client/init').clear()

    _init_idle: () =>
        ###
        The @_init_time is a timestamp in the future.
        It is pushed forward each time @_idle_reset is called.
        The setInterval timer checks every minute, if the current time is past this @_init_time.
        If so, the user is 'idle'.
        To keep 'active', call salvus_client.idle_reset as often as you like:
        A document.body event listener here and one for each jupyter iframe.body (see jupyter.coffee).
        ###

        # 15 min default in case it isn't set (it will get set when user account settings are loaded)
        @_idle_timeout ?= 15 * 60 * 1000
        @_idle_reset()
        setInterval(@_idle_check, 60 * 1000)

        # call this idle_reset like a function
        # will reset timer on *first* call and then every 15secs while being called
        @idle_reset = _.throttle(@_idle_reset, 15 * 1000)

        # activate a listener on our global body (universal sink for bubbling events, unless stopped!)
        $(document).on('click mousemove keydown focusin touchstart', @idle_reset)
        $('#smc-idle-notification').on('click mousemove keydown focusin touchstart', @_idle_reset)

        delayed_disconnect = undefined

        recconn = (=> if not @_connected then @_conn?.open())
        disconn = (=> if @_connected then @_conn?.end())

        @on 'idle', (state) ->
            #console.log("idle state: #{state}")
            switch state

                when "away"
                    idle_notification(true)
                    delayed_disconnect ?= setTimeout(disconn, 15 * 1000)

                when "active"
                    idle_notification(false)
                    if delayed_disconnect?
                        clearTimeout(delayed_disconnect)
                        delayed_disconnect = undefined
                    recconn()
                    setTimeout(recconn, 2000) # avoid race condition???

    # periodically check if the user hasn't been active
    _idle_check: =>
        now = (new Date()).getTime()
        # console.log("idle: checking idle #{@_idle_time} < #{now}")
        if @_idle_time < now
            @emit('idle', 'away')
            true
        else
            false

    # ATTN use @reset_idle, not this one here (see constructor above)
    _idle_reset: =>
        #if DEBUG
        #    console.log("idle: client_browser._idle_reset got called")
        @_idle_time = (new Date()).getTime() + @_idle_timeout + 1000
        @emit('idle', 'active')

    # called when the user configuration settings are set
    set_standby_timeout_m: (time_m) =>
        @_idle_timeout = time_m * 60 * 1000
        @_idle_reset()

    _connect: (url, ondata) ->
        log = (mesg) ->
            console.log("websocket -", mesg)
        log("connect")

        @url = url
        if @ondata?
            # handlers already setup
            return

        @ondata = ondata

        opts =
            ping      : 25000   # used for maintaining the connection and deciding when to reconnect.
            pong      : 12000  # used to decide when to reconnect
            strategy  : 'disconnect,online,timeout'
            reconnect :
                max      : 5000
                min      : 1000
                factor   : 1.25
                retries  : 100000  # why ever stop trying if we're only trying once every 5 seconds?

        conn = new Primus(url, opts)
        @_conn = conn
        conn.on 'open', () =>
            if @_conn_id?
                conn.write(@_conn_id)
            else
                conn.write("XXXXXXXXXXXXXXXXXXXX")
            @_connected = true
            protocol = if window.WebSocket? then 'websocket' else 'polling'
            @emit("connected", protocol)
            log("connected; protocol='#{protocol}'")
            @_num_attempts = 0

            conn.removeAllListeners('data')
            f = (data) =>
                @_conn_id = data.toString()
                conn.removeListener('data',f)
                conn.on('data', ondata)
            conn.on("data", f)


        conn.on 'outgoing::open', (evt) =>
            log("connecting")
            @emit("connecting")

        conn.on 'offline', (evt) =>
            log("offline")
            @_connected = false
            @emit("disconnected", "offline")

        conn.on 'online', (evt) =>
            log("online")

        conn.on 'message', (evt) =>
            ondata(evt.data)

        conn.on 'error', (err) =>
            log("error: ", err)
            @emit("error", err)

        conn.on 'close', () =>
            log("closed")
            @_connected = false
            @emit("disconnected", "close")

        conn.on 'reconnect scheduled', (opts) =>
            @_num_attempts = opts.attempt
            @emit("disconnected", "close") # This just informs everybody that we *are* disconnected.
            @emit("connecting")
            conn.removeAllListeners('data')
            log("reconnect scheduled in #{opts.scheduled} ms  (attempt #{opts.attempt} out of #{opts.retries})")

        conn.on 'incoming::pong', (time) =>
            #log("pong latency=#{conn.latency}")
            if not window.document.hasFocus? or window.document.hasFocus()
                # networking/pinging slows down when browser not in focus...
                @emit "ping", conn.latency

        #conn.on 'outgoing::ping', () =>
        #    log(new Date() - 0, "sending a ping")

        @_write = (data) =>
            conn.write(data)

    # return latest ping/pong time (latency) if connected; otherwise, return undefined
    latency: () =>
        if @_connected
            return @_conn.latency

    _fix_connection: (delete_cookies) =>
        if delete_cookies
            console.log("websocket -- deleting haproxy cookies")
            document.cookie = 'SMCSERVERID3=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
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
