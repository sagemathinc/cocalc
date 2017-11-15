require('node-cjsx').transform()
require('./jquery-support.coffee')

console.log("$.fn", $)

a = require('smc-webapp/misc_page.coffee')
