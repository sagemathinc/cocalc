##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015 -- 2016, SageMath, Inc.
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

{redux} = require('./smc-react')

# Calling set_window_title will set the title, but also put a notification
# count to the left of the title; if called with no arguments just updates
# the count, maintaining the previous title.
notify_count = undefined
exports.set_notify_count_function = (f) -> notify_count = f

last_title = ''
exports.set_window_title = (title) ->
    if not title?
        title = last_title
    last_title = title
    u = notify_count?()
    if u
        title = "(#{u}) #{title}"
    site_name = redux.getStore('customize').get('site_name')
    if title.length > 0
        document.title = title + " - " + site_name
    else
        document.title = site_name