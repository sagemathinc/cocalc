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
{ SITE_NAME } = require("smc-util/theme")

{do_anonymous_setup, should_do_anonymous_setup} = require('./client/anonymous-setup')


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

