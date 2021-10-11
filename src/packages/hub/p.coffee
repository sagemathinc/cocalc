#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

global.db = require('./postgres').db()

misc = require '@cocalc/util/misc'
misc_node = require '@cocalc/backend/misc_node'
# TODO: this is purely for interactive debugging -- remove later.
global.done = global.d = misc.done
global.done1 = global.d1 = misc.done1
global.done2 = global.d2 = misc.done2
global.misc = misc; global.misc_node = misc_node; global.cb=done()
global.async = require('async')
