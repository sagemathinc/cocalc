#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

$ = window.$

# Code related to the history and URL in the browser bar.
#
# The URI schema is as follows:
#
#     Overall help:
#        https://cocalc.com/help
#
#     Overall settings:
#        https://cocalc.com/settings
#
#     Account settings (default):
#        https://cocalc.com/settings/account
#
#     Billing:
#        https://cocalc.com/settings/billing
#
#     Upgrades:
#        https://cocalc.com/settings/upgrades
#
#     Support:
#        https://cocalc.com/settings/support
#
#     Projects page:
#        https://cocalc.com/projects/
#
#     Specific project:
#        https://cocalc.com/projects/project-id/
#
#     Create new file page (in given directory):
#        https://cocalc.com/projects/project-id/new/path/to/dir
#
#     Search (in given directory):
#        https://cocalc.com/projects/project-id/search/path/to/dir
#
#     Settings:
#        https://cocalc.com/projects/project-id/settings
#
#     Log:
#        https://cocalc.com/projects/project-id/log
#
#     Directory listing (must have slash at end):
#       https://cocalc.com/projects/project-id/files/path/to/dir/
#
#     Open file:
#       https://cocalc.com/projects/project-id/files/path/to/file
#
#     (From before) raw http:
#       https://cocalc.com/projects/project-id/raw/path/...
#
#     (From before) proxy server (supports websockets and ssl) to a given port.
#       https://cocalc.com/projects/project-id/port/<number>/.

{redux} = require('./app-framework')
{QueryParams} = require('./misc/query-params')
{keys} = require('smc-util/misc')
query_string = require('query-string')

# Determine query params part of URL based on state of the project store.
# This also leaves unchanged any *other* params already there (i.e., not
# the "managed" params that are explicitly listed in the code below).
params = ->
    page = redux.getStore('page')
    current = QueryParams.get_all()
    if page?
        for param in ['fullscreen', 'session', 'get_api_key', 'test']
            val = page.get(param)
            if val
                current[param] = val
            else
                delete current[param]

    s = query_string.stringify(current)
    if s
        return '?' + s
    else
        return ''

# The last explicitly set url.
last_url = undefined
last_full_url = undefined

# Update what params are set to in the URL based on state of project store,
# leaving the rest of the URL the same.
exports.update_params = ->
    if last_url?
        exports.set_url(last_url)

exports.set_url = (url) ->
    last_url = url
    query_params = params()
    full_url = window.app_base_url + url + query_params
    if full_url == last_full_url
        # nothing to do
        return
    last_full_url = full_url
    window.history.pushState("", "", full_url)

# Now load any specific page/project/previous state
exports.load_target = load_target = (target, ignore_kiosk=false, change_history=true) ->
    misc = require('smc-util/misc')
    #if DEBUG then console.log("history/load_target: #{misc.to_json(arguments)}")
    if not target
        return
    logged_in = redux.getStore('account')?.get('is_logged_in')
    segments = target.split('/')
    switch segments[0]
        when 'help'
            redux.getActions('page').set_active_tab('about', change_history)
        when 'projects'
            if segments.length > 1
                #console.log("history/load_target → load_target: #{misc.to_json([segments.slice(1).join('/'), true, ignore_kiosk, change_history])}")
                redux.getActions('projects').load_target(segments.slice(1).join('/'), true, ignore_kiosk, change_history)
            else
                redux.getActions('page').set_active_tab('projects', change_history)
        when 'settings'
            if not logged_in
                return
            redux.getActions('page').set_active_tab('account', change_history)

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

        when 'notifications'
            if not logged_in
                return
            redux.getActions('page').set_active_tab('notifications', change_history)

            if segments[1] == 'mentions'
                redux.getActions('mentions').set_active_tab('mentions')

        when 'file-use', 'admin'
            if not logged_in
                return
            redux.getActions('page').set_active_tab(segments[0], change_history)

window.onpopstate = (event) ->
    #console.log("location: " + document.location + ", state: " + JSON.stringify(event.state))
    load_target(decodeURIComponent(document.location.pathname.slice(window.app_base_url.length + 1)), false, false)
