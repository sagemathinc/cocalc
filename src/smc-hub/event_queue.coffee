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
PgBoss  = require('pg-boss')

winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

{pg_connect_info} = require('./postgres-base')
misc_node = require('smc-util-node/misc_node')
{defaults, required} = misc = require('smc-util/misc')
required = defaults.required



class EventQueue
    constructor: (opts) ->
        pg_info = pg_connect_info()
        opts = defaults opts,
            timeout        : 1 * 60 * 1000
            db_database    : pg_info.database
            db_host        : pg_info.host
            db_user        : pg_info.user
            db_password    : pg_info.password
            db_port        : pg_info.port
            logger         : undefined
            cb             : required

        opts.logger?.debug("initializing event queue processing")

        @logger   = opts.logger
        @timeout  = opts.timeout
        @boss     = new PgBoss(
            database  : opts.db_database
            host      : opts.db_host
            user      : opts.db_user
            password  : opts.db_password
            port      : opts.db_port
            uuid      : 'v4'
        )
        @dbg = (f, msg) ->
            @logger?.debug("EventQueue::#{f}: #{msg}")
        @boss.start().then(-> opts.cb?())

    # called by the hub when in --event_queue mode
    start_worker : (cb) ->
        dbg = (m) => @dbg('worker', m)
        dbg('started')
        sub = @boss.subscribe 'project_exec', (job) ->
            dbg("got 'project_exec' data: #{misc.to_json(job.data)}")
            job.done()

        sub.then ->
            dbg('subscription created')
            cb?()

    publish : (name, payload, options) ->
        status = @boss.publish(name, payload, options)
        status.then (jobId) ->
            console.log("job #{jobId} submitted")

# ---

_event_queue = undefined
exports.init = (opts) ->
    return _event_queue if _event_queue?
    _event_queue = new EventQueue(opts)
    return _event_queue

exports.get = ->
    _event_queue