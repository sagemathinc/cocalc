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

$ = window.$

###
Code related to the history and URL in the browser bar.

The URI schema is as follows:

    Overall help:
       https://cloud.sagemath.com/help

    Overall settings:
       https://cloud.sagemath.com/settings

    Account settings (default):
       https://cloud.sagemath.com/settings/account

    Billing:
       https://cloud.sagemath.com/settings/billing

    Upgrades:
       https://cloud.sagemath.com/settings/upgrades

    Support:
       https://cloud.sagemath.com/settings/support

    Projects page:
       https://cloud.sagemath.com/projects/

    Specific project:
       https://cloud.sagemath.com/projects/project-id/

    Create new file page (in given directory):
       https://cloud.sagemath.com/projects/project-id/new/path/to/dir

    Search (in given directory):
       https://cloud.sagemath.com/projects/project-id/search/path/to/dir

    Settings:
       https://cloud.sagemath.com/projects/project-id/settings

    Log:
       https://cloud.sagemath.com/projects/project-id/log

    Directory listing (must have slash at end):
      https://cloud.sagemath.com/projects/project-id/files/path/to/dir/

    Open file:
      https://cloud.sagemath.com/projects/project-id/files/path/to/file

    (From before) raw http:
      https://cloud.sagemath.com/projects/project-id/raw/path/...

    (From before) proxy server (supports websockets and ssl) to a given port.
      https://cloud.sagemath.com/projects/project-id/port/<number>/.

###

{redux} = require('./smc-react')
exports.set_url = (url) ->
    window.history.pushState("", "", window.smc_base_url + url)
    {analytics_pageview} = require('./misc_page')
    analytics_pageview(window.location.pathname)

# Now load any specific page/project/previous state
exports.load_target = load_target = (target) ->
    logged_in = redux.getStore('account').is_logged_in()
    if not target
        return
    segments = target.split('/')
    switch segments[0]
        when 'help'
            redux.getActions('page').set_active_tab('about')
        when 'projects'
            require.ensure [], =>
                if segments.length > 1
                    redux.getActions('projects').load_target(segments.slice(1).join('/'), true)
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



window.onpopstate = (event) ->
    #console.log("location: " + document.location + ", state: " + JSON.stringify(event.state))
    load_target(decodeURIComponent(document.location.pathname.slice(window.smc_base_url.length + 1)))
