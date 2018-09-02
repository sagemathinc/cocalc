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

winston = require('winston')
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
    if not the_database?
        cb?("database not yet set")
        return
    if the_database.is_standby
        winston.debug("not registering -- is only using a standby server")
        cb?()
        return
    the_database.register_hub
        host    : the_host
        port    : the_port
        clients : number_of_clients()
        ttl     : 3*the_interval
        cb      : (err) ->
            if err
                database_is_working = false
                winston.debug("Error registering with database - #{err}")
            else
                database_is_working = true
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
    the_database = opts.database
    the_clients  = opts.clients
    the_host     = opts.host
    the_port     = opts.port
    the_interval = opts.interval_s
    register_hub()
    setInterval(register_hub, the_interval*1000)
