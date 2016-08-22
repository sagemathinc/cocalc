###
Complete 100% top-level react rewrite of SMC.

Explicitly set FULLY_REACT=true in src/webapp-smc.coffee to switch to this.
###

console.log 'loading landing-react'

# Load/initialize Redux-based react functionality
require('./smc-react')

# Initialize server stats redux store
require('./redux_server_stats')

require('./top')

# Should be loaded last -- this checks the url and opens up the relevant page, etc.
require('./last')