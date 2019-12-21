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

###
# DEPRECATED
# ** If at all possible, use webapp-client.ts instead! **
# A lot of code still uses this...
###


{ handle_hash_url } = require("./client/handle-hash-url");


############################################
# connection to back-end hub
############################################
if window? and window.location?
    # running in a web browser
    if not window.app_base_url?
        window.app_base_url = ""

    handle_hash_url()
    client_browser = require('client_browser')
    exports.webapp_client = client_browser.connect()
