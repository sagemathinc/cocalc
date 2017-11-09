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
{DOMAIN_NAME, HELP_EMAIL, SITE_NAME} = require('smc-util/theme')


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
            database                    : opts.db_database
            host                        : opts.db_host
            user                        : opts.db_user
            password                    : opts.db_password
            port                        : opts.db_port
            monitorStateIntervalMinutes : 1
            uuid                        : 'v4'
        )
        @dbg = (f, msg) ->
            @logger?.debug("EventQueue::#{f}: #{misc.to_json(msg)}")
        @boss.start().then(-> opts.cb?())
        @boss.on 'monitor-states', (states) =>
            @dbg('monitor-states', states)

    # called by the hub when in --event_queue mode
    start_worker : (cb) ->
        dbg = (m) => @dbg('start_worker', m)
        dbg('started')
        async.series([
            (cb) => @worker_test(cb)
            (cb) => @worker_email_new_user(cb)
        ],
            (err, mesg) ->
                dbg('init done')
                cb?(err, mesg)
        )

    worker_test: (cb) =>
        dbg = (m) => @dbg('worker_test', m)
        sub = @boss.subscribe 'project_exec', (job) =>
            dbg("got 'project_exec' data: #{misc.to_json(job.data)}")

            ## TODO remove this, only for debugging
            #if job.data.command?
            #    l1 = job.data.command.split('\n')[0]
            #    if misc.startswith(l1, 'echo pgboss') #  signup asdf@asdf
            #        tokens = l1.split(/\s+/)
            #        @publish('email_new_user', {email_address: tokens[2]})

            job.done()
        sub.then ->
            dbg('worker_test created')
            cb?()

    worker_email_new_user: (cb) =>
        dbg = (m) => @dbg('email_new_user', m)

        sub = @boss.subscribe 'email_new_user', (job) ->
            dbg("got 'email_new_user' data: #{misc.to_json(job.data)}")
            data = job.data
            if not data.email_address?
                job.done()
                return

            body = """
            <h2>Hello #{data.first_name} #{data.last_name}!</h2>
            <br/>
            <p>
            Your account id is <code>#{data.account_id}</code>.
            </p>
            """

            {send_email} = require('./email')
            send_email
                subject    : "Welcome to #{SITE_NAME}"
                body       : body
                from       : "CoCalc <#{HELP_EMAIL}>"
                to         : data.email_address
                category   : "new_signup"
                asm_group  : 147985
                cb         : job.done

        sub.then ->
            dbg('worker_email_new_user created')
            cb?()

    send_notification_email_to_user: (account_id, cb) ->
        payload =
            singletonKey    : account_id
        options =
            singletonHours  : 24   # only one job every 24 hours max
        job = @publish('notify_user_via_email', payload, options)
        return job

    publish : (name, payload, options, cb) ->
        job = @boss.publish(name, payload, options)
        job.then cb ? (jobId) ->
            console.log("job #{jobId} submitted")
        return job

# ---

_event_queue = undefined
exports.init = (opts) ->
    return _event_queue if _event_queue?
    _event_queue = new EventQueue(opts)
    return _event_queue

exports.get = ->
    _event_queue