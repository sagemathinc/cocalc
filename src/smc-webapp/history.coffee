###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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
Code related to the history and URL in the browser bar.

The URI schema is as follows:

    Overall help:
       https://cloud.sagemath.com/projects/help

    Overall settings:
       https://cloud.sagemath.com/projects/settings

    Projects Page:
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

{top_navbar} = require('./top_navbar')
{redux} = require('./smc-react')
exports.set_url = (url) ->
    window.history.pushState("", "", window.smc_base_url + url)

# Now load any specific page/project/previous state
exports.load_target = load_target = (target) ->
    $('body').scrollTop(0) #temporary hack
    # console.log("load_target('#{target}')")
    if not target
        return
    segments = target.split('/')
    switch segments[0]
        when 'help'
            top_navbar.switch_to_page("salvus-help")
        when 'projects'
            require.ensure [], =>
                if segments.length > 1
                    require('./projects').load_target(segments.slice(1).join('/'), true)
                else
                    top_navbar.switch_to_page("projects")
        when 'settings'
            top_navbar.switch_to_page("account")
            if segments[1] == 'billing'
                redux.getActions('billing').update_customer()
                redux.getActions('account').setState(active_page : 'billing')
            if segments[1] == 'upgrades'
                redux.getActions('account').setState(active_page : 'upgrades')


window.onpopstate = (event) ->
    #console.log("location: " + document.location + ", state: " + JSON.stringify(event.state))
    load_target(decodeURIComponent(document.location.pathname.slice(window.smc_base_url.length + 1)))
