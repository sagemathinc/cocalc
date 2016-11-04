
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


############################################################
# Account Settings
############################################################

{salvus_client} = require('./salvus_client')
{alert_message} = require('./alerts')
account_page    = require('./account_page')

misc     = require("misc")
{redux}   = require('./smc-react')

################################################
# Account creation
################################################

first_login = true

# load more of the app now that user is logged in.
load_app = (cb) ->
    require.ensure [], ->
        require('./r_account.cjsx')  # initialize react-related account page
        require('./projects.cjsx')   # initialize project listing
        require('./file_use.cjsx')   # initialize file_use notifications
        cb()

signed_in = (mesg) ->
    {analytics_event} = require('./misc_page')
    analytics_event('account', 'signed_in')    # user signed in
    # Record which hub we're connected to.
    redux.getActions('account').setState(hub: mesg.hub)
    load_file = window.smc_target and window.smc_target != 'login'
    if first_login
        first_login = false
        if not load_file
            load_app ->
                require('./history').load_target('projects')

    if load_file
        # wait until account settings get loaded, then show target page
        # HACK: This is hackish!, and will all go away with a more global use of React (and routing).
        # The underscore below should make it clear that this is hackish.
        redux.getTable('account')._table.once 'connected', ->
            load_app ->
                    require('./history').load_target(window.smc_target)
                    window.smc_target = ''


# Listen for pushed sign_in events from the server.  This is one way that
# the sign_in function above can be activated, but not the only way.
salvus_client.on("signed_in", signed_in)

################################################
# Automatically log in
################################################
remember_me = salvus_client.remember_me_key()
if misc.get_local_storage(remember_me)
    redux.getActions('account').setState(remember_me: true)
    # just in case, always show manual login screen after 45s.
    setTimeout (->
        redux.getActions('account').setState(remember_me: false)
    ), 45000
salvus_client.on "remember_me_failed", () ->
    redux.getActions('account').setState(remember_me: false)
    if redux.getStore('account').is_logged_in()  # if we thought user was logged in, but the cookie was invalid, force them to sign in again
        f = ->
            if not misc.get_local_storage(remember_me)
                alert_message(type:'info', message:'You might have to sign in again.', timeout:1000000)
        setTimeout(f, 15000)  # give it time to possibly resolve itself.  SMELL: confused about what is going on here...

# Return a default filename with the given ext (or not extension if ext not given)
# FUTURE: make this configurable with different schemas.
exports.default_filename = (ext, is_folder) ->
    return default_filename_iso(ext)
    #return default_filename_mac(ext)

default_filename_iso = (ext, is_folder) ->
    base = misc.to_iso(new Date()).replace('T','-').replace(/:/g,'')
    if ext
        base += '.' + ext
    return base

# This isn't used yet -- will not a config option in account settings.
default_filename_mac = (ext, is_folder) ->
    switch ext
        when 'zip'
            return 'Archive.zip'
        else
            return 'untitled ' + (if is_folder then 'folder' else 'file')
