# SASS Style file for SMC
require('./smc-webapp/index.sass')

require('./smc-webapp/client_browser.coffee')

FULLY_REACT = false  # set to true to enable a full react version of SMC

if FULLY_REACT
    require('./smc-webapp/landing-react')
else
    require('./smc-webapp/landing')
