###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
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

# these times in minutes are used for active/recently edited projects and accounts in postgres-server-queries.coffee's get_stats
exports.RECENT_TIMES =
    active     : 5
    last_hour  : 60
    last_day   : 60*24
    last_week  : 60*24*7
    last_month : 60*24*30

# this translates the semantic meanings to the keys used in the DB, also prevents typos!
exports.RECENT_TIMES_KEY =
    active     : "5min"
    last_hour  : "1h"
    last_day   : "1d"
    last_week  : "7d"
    last_month : "30d"


db_schema                  = require('./db-schema')
schema = exports.SCHEMA    = db_schema.SCHEMA
exports.client_db          = db_schema.client_db
exports.site_settings_conf = db_schema.site_settings_conf

# Load the syncstring extensions to the schema
require('./syncstring_schema')


# Will import some other modules and make them available here, since the code
# used to be in this file, and this is assumed in code elsewhere.  Will change later.

exports.COMPUTE_STATES = require('./compute-states').COMPUTE_STATES

upgrade_spec = require('./upgrade-spec')
exports.PROJECT_UPGRADES = upgrade_spec.upgrades

exports.DEFAULT_QUOTAS = upgrade_spec.DEFAULT_QUOTAS
