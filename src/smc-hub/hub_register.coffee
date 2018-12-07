##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2017, Sagemath Inc.
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

###
Hub Registration (recording number of clients)
###

winston = require('./winston-metrics').get_logger('hub')
misc    = require('smc-util/misc')
{defaults, required} = misc

# Global variables
database_is_working = false
the_database = undefined
the_host     = undefined
the_port     = undefined
the_interval = undefined
the_clients  = {}

number_of_clients = () ->
    return misc.len(the_clients)

exports.number_of_clients = () ->
    if not the_database?
        throw new Error("database not yet set")
    return number_of_clients()

register_hub = (cb) ->
    winston.debug("register_hub")
    if not the_database?
        database_is_working = false
        winston.debug("register_hub -- no database, so FAILED")
        cb?("database not yet set")
        return
    if not the_database._clients?
        database_is_working = false
        winston.debug("register_hub -- not connected, so FAILED")
        cb?()
        return
    if the_database.is_standby
        winston.debug("register_hub -- doing read query of site settings")
        the_database.get_site_settings
            cb : (err, settings) ->
                if err
                    winston.debug("register_hub -- FAILED read query")
                    database_is_working = false
                else
                    winston.debug("register_hub -- read query worked")
                    database_is_working = true
        return

    winston.debug("register_hub -- doing db query")
    the_database.register_hub
        host    : the_host
        port    : the_port
        clients : number_of_clients()
        ttl     : 3*the_interval
        cb      : (err) ->
            if err
                database_is_working = false
                winston.debug("register_hub -- fail - #{err}")
            else
                database_is_working = true
                winston.debug("register_hub -- success")
            cb?(err)

exports.database_is_working = ->
    return database_is_working

exports.start = (opts) ->
    opts = defaults opts,
        database   : required
        clients    : required
        host       : required
        port       : required
        interval_s : required
        cb         : undefined
    winston.debug("hub_register.start...")
    the_database = opts.database
    the_clients  = opts.clients
    the_host     = opts.host
    the_port     = opts.port
    the_interval = opts.interval_s
    register_hub(opts.cb)
    setInterval(register_hub, the_interval*1000)
