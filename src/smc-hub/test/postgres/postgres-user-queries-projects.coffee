###
TESTING of user queries specifically involving projects

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

pgtest   = require('./pgtest')
db       = undefined
setup    = (cb) -> (pgtest.setup (err) -> db=pgtest.db; cb(err))
teardown = pgtest.teardown

{create_accounts, create_projects} = pgtest

async  = require('async')
expect = require('expect')

misc = require('smc-util/misc')

describe 'extensive tests of editing properties of a project', ->


