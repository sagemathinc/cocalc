#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Test suite for backend KuCalc-related functionality.

WARNING: The server timezone **MUST BE** UTC everywhere, or tests will fail!

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

require('coffee2-cache')

pgtest = require('../postgres/pgtest')

DEBUG    = !!(process.env['SMC_DEBUG'] ? false)
if DEBUG
    log = (args...) -> console.log('kucalctest: ', args...)
else
    log = ->

exports.log = log
exports.db = -> return pgtest.db

# For now just re-export what is done in pgtest.  We may have to add more later.
exports.setup = pgtest.setup
exports.teardown = pgtest.teardown
exports.create_accounts = pgtest.create_accounts
exports.create_projects = pgtest.create_projects

