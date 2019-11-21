# Library file for CoCalc Main Webapp

require("./webapp-shared")

# after this lib.js package, the real smc.js app starts loading
window.smcLoadStatus("Starting main application ...")

require('./smc-webapp/client_browser.coffee')

require('./smc-webapp/start-main')
