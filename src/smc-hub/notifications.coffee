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

# This manages notifications

async   = require('async')

winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

misc_node = require('smc-util-node/misc_node')
{defaults, required} = misc = require('smc-util/misc')
required = defaults.required

make_dbg: (f, msg) ->
    if debug
        return (m) -> winston.debug("Notifications.#{f}: #{misc.trunc_middle(JSON.stringify(msg), 1000)}")
    else
        return ->

exports.new_project_collaborator = (opts) ->
    opts = defaults opts,
        database         : required
        project_id       : required
        new_collaborator : required
    dbg = make_dbg('new_project_collaborator')
    dbg(opts)
