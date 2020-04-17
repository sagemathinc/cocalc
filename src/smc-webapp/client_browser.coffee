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
{QueryParams} = require('./misc/query-params')
misc = require('smc-util/misc')

{APP_LOGO_WHITE} = require('./art')

{do_anonymous_setup, should_do_anonymous_setup} = require('./client/anonymous-setup')

# these idle notifications were in misc_page, but importing it here failed

idle_notification_html = ->
    {redux}   = require('./app-framework')
    customize = redux.getStore('customize')
    """
    <div>
    <img src="#{APP_LOGO_WHITE}">
    <h1>Collaborative Calculation</h1>
    &mdash; click to reconnect &mdash;
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
        super(opts)
        @_setup_window_smc()

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

        # Disable POST by default since:
        # (1) we're having weird cloudflare issues
        # (2) it was designed to address an efficiency issue that we may have already addressed
        #     more effectively via an architectural change (project websocket).
        # One can still test this by typing "enable_post()" in the console (even in production).
        @_enable_post = false

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

    # return latest ping/pong time (latency) if connected; otherwise, return undefined
    latency: () =>
        if @_connected
            return @_conn.latency

    alert_message: (args...) =>
        require('./alerts').alert_message(args...)


connection = undefined
exports.connect = (url) ->
    if connection?
        return connection
    else
        return connection = new Connection(url)

exports.connect()

