###
Entry point for the Landing Page -- sign up, sign in, learn more about.
###

# output some of the global variables
console.log("SMC_VERSION", SMC_VERSION)
console.log("SMC_GIT_REV", SMC_GIT_REV)
console.log("BUILD_DATE",  BUILD_DATE)
console.log("MATHJAX_URL", MATHJAX_URL)

# static html which gets progressively refined/used as templated by jQuery -- will go away with React.js rewrite
require('./html')

# Load/initialize Redux-based react functionality
require('./smc-react')

# Initialize server stats redux store
require('./redux_server_stats')

# Systemwide notifications that are broadcast to all users (or set by admins)
require('./system_notifications')

# Initialize some jquery plugins needed below (TODO: will obviously go away with react rewrite)
require('./jquery_plugins')

# Initialize the top navigation bar.
require('./top_navbar')

# Account redux store
require('./redux_account')

# The login page
require('./account')

# Enable the exit confirmation functionality -- checks if you really want to exit page
require('./exit_confirmation')

# Uncomment the below and everything gets loaded all at once, rather than lazy when
# other stuff gets opened.  Is faster in some ways and slower in others.
if true
    require('./projects')
    require('./editor')
    # putting everything to reduce weird caching issues until I can properly sort them out! :-(
    require('./r_help')
    require('./d3')
    require('./tasks')
    require('./course/main')
    require('./r_account.cjsx')
    require('./file_use.cjsx')
    require('./support.cjsx')

# TODO: temporary -- ensure that the help page is rendered: do this once only on load
# WE will remove this when we have a proper router.
require('./r_help').render_help_page()

# Should be loaded last -- this checks the url and opens up the relevant page, etc.
require('./last')
