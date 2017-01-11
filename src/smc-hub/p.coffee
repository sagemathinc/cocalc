global.db = require('./postgres').db()

misc = require 'smc-util/misc'
misc_node = require 'smc-util-node/misc_node'
# TODO: this is purely for interactive debugging -- remove later.
global.done = global.d = misc.done
global.done1 = global.d1 = misc.done1
global.done2 = global.d2 = misc.done2
global.misc = misc; global.misc_node = misc_node; global.cb=done()
global.async = require('async')
