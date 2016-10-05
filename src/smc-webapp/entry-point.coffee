###
Complete 100% top-level react rewrite of SMC.

Explicitly set FULLY_REACT=true in src/webapp-smc.coffee to switch to this.
###

# FUTURE: This is needed only for the old non-react editors; will go away.
html = require('./console.html') + require('./editor.html') + require('./tasks.html') + require('./jupyter.html') + require('./interact.html') + require('./3d.html') + require('./d3.html')
$('body').append(html)

# Load/initialize Redux-based react functionality
require('./smc-react')

# Initialize server stats redux store
require('./redux_server_stats')

# Systemwide notifications that are broadcast to all users (or set by admins)
require('./system_notifications')

{IS_MOBILE, isMobile} = require('./feature')

mobile = require('./mobile_app')
desktop = require('./desktop_app')

# Is this terrible for performance? I don't know.
render = () =>
    if not isMobile.tablet() and IS_MOBILE or $(window).width() < 600
        mobile.render()
    else
        desktop.render()

render()

$(window).on('resize', render)

# Should be loaded last -- this checks the url and opens up the relevant page, etc.
require('./last')