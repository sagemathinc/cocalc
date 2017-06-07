require('coffee-script/register') /* so we can require coffeescript */
require('coffee-cache').setCacheDir('.coffee/cache') /* two level is NECESSARY; coffeescript doesn't get recompiled every time we require it */
program = require('commander')
program._name = 'storage'
require('../storage.coffee')
