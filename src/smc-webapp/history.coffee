###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
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

$ = window.$

###
Code related to the history and URL in the browser bar.

The URI schema is as follows:

    Overall help:
       https://cocalc.com/help

    Overall settings:
       https://cocalc.com/settings

    Account settings (default):
       https://cocalc.com/settings/account

    Billing:
       https://cocalc.com/settings/billing

    Upgrades:
       https://cocalc.com/settings/upgrades

    Support:
       https://cocalc.com/settings/support

    Projects page:
       https://cocalc.com/projects/

    Specific project:
       https://cocalc.com/projects/project-id/

    Create new file page (in given directory):
       https://cocalc.com/projects/project-id/new/path/to/dir

    Search (in given directory):
       https://cocalc.com/projects/project-id/search/path/to/dir

    Settings:
       https://cocalc.com/projects/project-id/settings

    Log:
       https://cocalc.com/projects/project-id/log

    Directory listing (must have slash at end):
      https://cocalc.com/projects/project-id/files/path/to/dir/

    Open file:
      https://cocalc.com/projects/project-id/files/path/to/file

    (From before) raw http:
      https://cocalc.com/projects/project-id/raw/path/...

    (From before) proxy server (supports websockets and ssl) to a given port.
      https://cocalc.com/projects/project-id/port/<number>/.

###

{redux} = require('./app-framework')

# Determine query params based on state of the project store
params = ->
    page = redux.getStore('page')
    if not page?  # unknown for now
        return ''
    v = []
    for param in ['fullscreen', 'session', 'get_api_key', 'test']
        val = page.get(param)
        if val?
            v.push("#{param}=#{encodeURIComponent(val)}")
    if v.length > 0
        return '?' + v.join('&')
    else
        return ''

# The last explicitly set url.
last_url = undefined

# Update what params are set to in the URL based on state of project store,
# leaving the rest of the URL the same.
exports.update_params = ->
    if last_url?
        exports.set_url(last_url)

exports.set_url = (url) ->
    last_url = url
    full_url = window.app_base_url + url + params()
    window.history.pushState("", "", full_url)
    {analytics_pageview} = require('./misc_page')
    analytics_pageview(window.location.pathname)

# Now load any specific page/project/previous state
exports.load_target = load_target = (target, ignore_kiosk=false) ->
    misc = require('smc-util/misc')
    #if DEBUG then console.log("history/load_target: #{misc.to_json(arguments)}")
    if not target
        return
    logged_in = redux.getStore('account')?.get('is_logged_in')
    segments = target.split('/')
    switch segments[0]
        when 'help'
            redux.getActions('page').set_active_tab('about')
        when 'projects'
            require.ensure [], =>
                if segments.length > 1
                    #if DEBUG then console.log("history/load_target → load_target: #{misc.to_json([segments.slice(1).join('/'), true, ignore_kiosk])}")
                    redux.getActions('projects').load_target(segments.slice(1).join('/'), true, ignore_kiosk)
                else
                    redux.getActions('page').set_active_tab('projects')
        when 'settings'
            if not logged_in
                return
            redux.getActions('page').set_active_tab('account')
            if segments[1] == 'account'
                redux.getActions('account').set_active_tab('account')
            if segments[1] == 'billing'
                redux.getActions('billing').update_customer()
                redux.getActions('account').set_active_tab('billing')
            if segments[1] == 'upgrades'
                redux.getActions('account').set_active_tab('upgrades')
            if segments[1] == 'support'
                redux.getActions('account').set_active_tab('support')
            if segments[1] == 'ssh-keys'
                redux.getActions('account').set_active_tab('ssh-keys')
        when 'file-use', 'admin'
            if not logged_in
                return
            redux.getActions('page').set_active_tab(segments[0])

window.onpopstate = (event) ->
    #console.log("location: " + document.location + ", state: " + JSON.stringify(event.state))
    load_target(decodeURIComponent(document.location.pathname.slice(window.app_base_url.length + 1)))
