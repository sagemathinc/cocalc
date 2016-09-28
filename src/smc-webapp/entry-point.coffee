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

{IS_MOBILE} = require('./feature')

if IS_MOBILE or $(window).width() < 600
    # Mobile
    require('./mobile_app')
else
    # Primary desktop app
    require('./desktop_app')

# Should be loaded last -- this checks the url and opens up the relevant page, etc.
require('./last')