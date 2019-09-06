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


############################################
# connection to back-end hub
############################################

if window? and window.location?
    # running in a web browser
    if not window.app_base_url?
        window.app_base_url = ""

    if window.location.hash.length > 1
        q = decodeURIComponent(window.location.hash.slice(1))
        # the location hash could again contain a query param, hence this
        i = q.indexOf('?')
        if i >= 0
            q = q.slice(0, i)
        window.smc_target = q

    client_browser = require('client_browser')
    exports.webapp_client = client_browser.connect()
