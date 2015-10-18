###
Entry point for the Landing Page -- sign up, sign in, learn more about.
###

# Load/initialize React-related flux functionality
require('./flux')

require('./system_notifications')

# Initialize some jquery plugins needed below (TODO: will obviously go away with react rewrite)
require('./jquery_plugins')

# Initialize the top navigation bar.
require('./top_navbar')

# Account flux store
require('./account_flux')

# The login page
require('./account')

require('./last')



