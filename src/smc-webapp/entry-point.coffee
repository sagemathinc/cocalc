###
Complete 100% top-level react rewrite of SMC.

Explicitly set FULLY_REACT=true in src/webapp-smc.coffee to switch to this.
###

# FUTURE: This is needed only for the old non-react editors; will go away.
html = require('./console.html') + require('./editor.html') + require('./tasks.html') + require('./jupyter.html') + require('./interact.html') + require('./3d.html') + require('./d3.html') + require('./misc_page.html')
$('body').append(html)

# Load/initialize Redux-based react functionality
{redux} = require('./smc-react')

# Initialize server stats redux store
require('./redux_server_stats')

# Systemwide notifications that are broadcast to all users (or set by admins)
require('./system_notifications')

# Makes some things work. Like the save button
require('./jquery_plugins')

# Initializes app stores, actions, etc.
require('./init_app')

mobile = require('./mobile_app')
desktop = require('./desktop_app')

# Feature must be loaded before account and anything that might use cookies or localStorage,
# but after smc-react and the basic app definition.
{IS_MOBILE, isMobile} = require('./feature')

# Is this terrible for performance? I don't know.
render = () =>
    if not isMobile.tablet() and IS_MOBILE or $(window).width() < 770
        mobile.render()
        # This is a hack for now until we figure out how to get the flex box model
        # to work on mobile. The problem is setting the flex styles on Sidebar in mobile_app.cjsx.
        setTimeout((()->$(".container-content").maxheight()), 1)
    else
        desktop.render()

render()

$(window).on('resize', render)
$(window).on('beforeunload', redux.getActions('page').check_unload)

# Should be loaded last -- this checks the url and opens up the relevant page, etc.
require('./last')