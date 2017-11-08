##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016 -- 2017, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

# This manages processing the event queue

async   = require('async')

winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

misc_node = require('smc-util-node/misc_node')
{defaults, required} = misc = require('smc-util/misc')
required = defaults.required


class EventQueue
    constructor: (opts) ->
        opts = defaults opts,
            database       : required
            timeout        : 1 * 60 * 1000
            logger         : undefined
            cb             : required

        opts.logger?.debug("initializing event queue processing")

        @logger   = opts.logger
        @timeout  = opts.timeout
        @database = opts.database

        @dbg = (f, msg) ->
            @logger?.debug("EventQueue: main loop")

        cb?()

    start: ->
        @dbg('main loop')
        setTimeout(@start, @timeout)


_started = false
exports.start = (opts) ->

    if _started
        opts.logger?.warn("event queue already initialized")
        return
    _started = true

    event_queue = new EventQueue(opts)
    event_queue.start()
