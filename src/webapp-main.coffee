# Library file for CoCalc Main Webapp

require("./webapp-shared")

# after this lib.js package, the real smc.js app starts loading
window.smcLoadStatus("Starting main application ...")

# SASS Style file for CoCalc
require('./smc-webapp/index.sass')

require('./smc-webapp/client_browser.coffee')

require('./smc-webapp/entry-point')
