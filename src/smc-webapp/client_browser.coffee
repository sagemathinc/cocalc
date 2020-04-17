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

{delay} = require('awaiting')

prom_client = require('./prom-client')

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
        #
        # **CRITICAL:** If the smc object isn't defined in your Google Chrome console session,
        # you have to change the context to *top*!   See
        # http://stackoverflow.com/questions/3275816/debugging-iframes-with-chrome-developer-tools/8581276#8581276
        #
        super(opts)
        @global_cocalc()

        # Start reporting metrics to the backend if requested.
        if prom_client.enabled
            @on('start_metrics', prom_client.start_metrics)

    # return latest ping/pong time (latency) if connected; otherwise, return undefined
    latency: () =>
        if @_connected
            return @_conn.latency

    alert_message: (args...) =>
        require('./alerts').alert_message(args...)

    global_cocalc: =>
        await delay(1)
        require('./client/console').setup_global_cocalc()

connection = undefined
exports.connect = (url) ->
    if connection?
        return connection
    else
        return connection = new Connection(url)

exports.connect()

