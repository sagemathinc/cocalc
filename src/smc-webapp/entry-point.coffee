###
Complete 100% top-level react rewrite of CoCalc.

Explicitly set FULLY_REACT=true in src/webapp-smc.coffee to switch to this.
###

# FUTURE: This is needed only for the old non-react editors; will go away.
html = require('./console.html') + require('./editor.html') + require('./jupyter.html') + require('./sagews/interact.html') + require('./sagews/3d.html') + require('./sagews/d3.html')
$('body').append(html)

# deferred initialization of buttonbars until after global imports -- otherwise, the sagews sage mode bar might be blank
{init_buttonbars} = require('./buttonbar')
init_buttonbars()

# Load/initialize Redux-based react functionality
{redux} = require('./app-framework')

# Initialize server stats redux store
require('./redux_server_stats')

# Systemwide notifications that are broadcast to all users (or set by admins)
require('./system_notifications')

# Makes some things work. Like the save button
require('./jquery_plugins')

# Initialize app stores, actions, etc.
require('./init_app')

# Initialize the account store.
require('./account')

require('./notifications').init(redux)

require('./widget-markdown-input/main').init(redux)

mobile = require('./mobile_app')
desktop = require('./desktop_app')

# Feature must be loaded before account and anything that might use cookies or localStorage,
# but after app-framework and the basic app definition.
{IS_MOBILE, isMobile} = require('./feature')

if IS_MOBILE and not isMobile.tablet()
    # Cell-phone version of site, with different
    # navigation system for selecting projects and files.
    mobile.render()
else
    desktop.render()

$(window).on('beforeunload', redux.getActions('page').check_unload)

# Should be loaded last -- this checks the url and opens up the relevant page, etc.
require('./last')

# adding a banner in case react crashes (it will be revealed)
crash = require('./crash.html')
{ HELP_EMAIL } = require('smc-util/theme')
$('body').append(crash.replace(/HELP_EMAIL/g, HELP_EMAIL))

