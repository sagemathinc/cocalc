###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
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
    setTimeout((->window.location.reload()), 1000)

$ = window.$
_ = require('underscore')

prom_client = require('./prom-client')

client = require('smc-util/client')

misc_page = require('./misc_page')

{APP_LOGO_WHITE} = require('./art')

# these idle notifications were in misc_page, but importing it here failed

idle_notification_html = ->
    {redux}   = require('./app-framework')
    customize = redux.getStore('customize')
    """
    <div>
    <img src="#{APP_LOGO_WHITE}">
    <h1>... is on standby</h1>
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

auth_token = misc_page.get_query_param('auth_token')

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
        super(opts)
        @_setup_window_smc()

        # This is used by the base class for marking file use notifications.
        @_redux = require('./app-framework').redux

        # 60 min default. Correct val will get set when user account settings are loaded.
        # Set here rather than in @_init_idle to avoid any potential race.
        @_idle_timeout = 15 * 60 * 1000

        setTimeout(@_init_idle, 15 * 1000)

        # Start reporting metrics to the backend if requested.
        if prom_client.enabled
            @on('start_metrics', prom_client.start_metrics)

    _setup_window_smc: () =>
        # if we are in DEBUG mode, inject the client into the global window object
        window.enable_post = =>
            @_enable_post = true
        window.disable_post = =>
            @_enable_post = false

        # Make this the default now.
        @_enable_post = true

        if not DEBUG
            return
        window.smc                     ?= {}
        window.smc.client              = @
        window.smc.misc                = require('smc-util/misc')
        window.smc.misc_page           = require('./misc_page')
        window.smc.immutable           = require('immutable')
        window.smc.done                = window.smc.misc.done
        window.smc.sha1                = require('sha1')
        window.smc.schema              = require('smc-util/schema')
        # use to enable/disable verbose synctable logging
        window.smc.synctable_debug     = require('smc-util/synctable').set_debug
        window.smc.idle_trigger        = => @emit('idle', 'away')
        window.smc.prom_client         = prom_client
        window.smc.redux               = require('./app-framework').redux

        if require('./feature').IS_TOUCH
            # Debug mode and on a touch device -- e.g., iPad -- so make it possible to get a
            # devel console via https://github.com/liriliri/eruda
            # This pulls eruda from a CDN.
            document.write('<script src="//cdn.jsdelivr.net/npm/eruda"></script>')
            document.write('<script>eruda.init();</script>')

    _init_idle: () =>
        # Do not bother on mobile, since mobile devices already automatically disconnect themselves
        # very aggressively to save battery life.
        if require('./feature').IS_TOUCH
            return

        ###
        The @_init_time is a timestamp in the future.
        It is pushed forward each time @_idle_reset is called.
        The setInterval timer checks every minute, if the current time is past this @_init_time.
        If so, the user is 'idle'.
        To keep 'active', call webapp_client.idle_reset as often as you like:
        A document.body event listener here and one for each jupyter iframe.body (see jupyter.coffee).
        ###

        @_idle_reset()
        setInterval(@_idle_check, 60 * 1000)

        # call this idle_reset like a function
        # will reset timer on *first* call and then every 15secs while being called
        @idle_reset = _.throttle(@_idle_reset, 15 * 1000)

        # activate a listener on our global body (universal sink for bubbling events, unless stopped!)
        $(document).on('click mousemove keydown focusin touchstart', @idle_reset)
        $('#smc-idle-notification').on('click mousemove keydown focusin touchstart', @_idle_reset)

        delayed_disconnect = undefined

        reconn = =>
            if @_connection_is_totally_dead # CRITICAL: See https://github.com/primus/primus#primusopen !!!!!
                @_conn?.open()
        reconn = _.throttle(reconn, 10*1000)  # never attempt to reconnect more than once per 10s, no matter what.

        disconn = =>
            if @_connected
                @_conn?.end()

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
                    reconn()
                    setTimeout(reconn, 5000) # avoid race condition???

    # This is called periodically. If the user hasn't been active
    # for @_idle_timeout ms, then we emit an idle event.
    _idle_check: =>
        if not @_idle_time?
            return
        now = (new Date()).getTime()
        #console.log("idle: checking idle #{@_idle_time} < #{now}")
        if @_idle_time < now
            @emit('idle', 'away')

    # Set @_idle_time to the **moment in in the future** at which the user will be
    # considered idle, and also emit event indicating that user is currently active.
    _idle_reset: =>
        @_idle_time = (new Date()).getTime() + @_idle_timeout + 1000
        #console.log '_idle_reset', new Date(@_idle_time), ' _idle_timeout=', @_idle_timeout
        @emit('idle', 'active')

    # Change the standby timeout to a particular time in minutes.
    # This gets called when the user configuration settings are set/loaded.
    set_standby_timeout_m: (time_m) =>
        # console.log 'set_standby_timeout_m', time_m
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

        ###
        opts =
            ping      : 25000  # used for maintaining the connection and deciding when to reconnect.
            pong      : 12000  # used to decide when to reconnect
            strategy  : 'disconnect,online,timeout'
            reconnect :
                max      : 5000
                min      : 1000
                factor   : 1.25
                retries  : 100000  # why ever stop trying...?
        conn = new Primus(url, opts)
        ###

        opts =
            reconnect:
                max     : 10000
                min     : 1000
                factor  : 1.3
                retries : 100000

        misc_page.delete_cookie('SMCSERVERID3')
        @_delete_websocket_cookie()
        conn = new Primus(url, opts)

        @_conn = conn
        conn.on 'open', () =>
            @_connected = true
            @_connection_is_totally_dead = false
            protocol = if window.WebSocket? then 'websocket' else 'polling'
            @emit("connected", protocol)
            log("connected; protocol='#{protocol}'")
            @_num_attempts = 0

            conn.removeAllListeners('data')
            conn.on("data", ondata)

            if auth_token?
                @sign_in_using_auth_token
                    auth_token : auth_token
                    cb         : (err, resp) ->
                        auth_token = undefined

        conn.on 'outgoing::open', (evt) =>
            log("connecting")
            @emit("connecting")

        conn.on 'offline', (evt) =>
            log("offline")
            @_connected = @_signed_in = false
            @emit("disconnected", "offline")

        conn.on 'online', (evt) =>
            log("online")

        conn.on 'message', (evt) =>
            ondata(evt.data)

        conn.on 'error', (err) =>
            log("error: ", err)
            # NOTE: we do NOT emit an error event in this case!  See
            # https://github.com/sagemathinc/cocalc/issues/1819
            # for extensive discussion.

        conn.on 'close', () =>
            log("closed")
            @_connected = @_signed_in = false
            @emit("disconnected", "close")

        conn.on 'end', =>
            @_connection_is_totally_dead = true

        conn.on 'reconnect scheduled', (opts) =>
            @_num_attempts = opts.attempt
            @emit("disconnected", "close") # This just informs everybody that we *are* disconnected.
            conn.removeAllListeners('data')
            @_delete_websocket_cookie()
            log("reconnect scheduled (attempt #{opts.attempt} out of #{opts.retries})")

        conn.on 'reconnect', =>
            @emit("connecting")

        conn.on 'incoming::pong', (time) =>
            #log("pong latency=#{conn.latency}")
            if not window.document.hasFocus? or window.document.hasFocus()
                # networking/pinging slows down when browser not in focus...
                if conn.latency > 10000
                    # We get some ridiculous values from Primus when the browser
                    # tab gains focus after not being in focus for a while (say on ipad but on many browsers)
                    # that throttle.  Just discard them, since otherwise they lead to ridiculous false
                    # numbers displayed in the browser.
                    return
                @emit "ping", conn.latency

        #conn.on 'outgoing::ping', () =>
        #    log(new Date() - 0, "sending a ping")

        @_write = (data) =>
            conn.write(data)

    # return latest ping/pong time (latency) if connected; otherwise, return undefined
    latency: () =>
        if @_connected
            return @_conn.latency

    _delete_websocket_cookie: =>
        console.log('websocket -- delete cookie')
        misc_page.delete_cookie('SMCSERVERID3')

    _fix_connection: =>
        console.log("websocket --_fix_connection... ")
        @_delete_websocket_cookie()
        @_conn.end()
        @_conn.open()

    _cookies: (mesg, cb) =>
        j = $.ajax
            url     : mesg.url
            data    : {id:mesg.id, set:mesg.set, get:mesg.get, value:mesg.value}
        j.done(=> cb?())
        j.fail(=> cb?('failed'))

    alert_message: (args...) =>
        require('./alerts').alert_message(args...)

connection = undefined
exports.connect = (url) ->
    if connection?
        return connection
    else
        return connection = new Connection(url)

exports.connect()

