###
TESTING of server-side synctable

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) 2016 SageMath, Inc.
**

###

async  = require('async')
expect = require('expect')

pgtest   = require('./pgtest')
db       = undefined
setup    = (cb) -> (pgtest.setup (err) -> db=pgtest.db; cb(err))
teardown = pgtest.teardown
{create_accounts, create_projects, changefeed_series} = pgtest
misc = require('smc-util/misc')

describe 'test storage_server synctable', ->
    before(setup)
    after(teardown)

    synctable = undefined
    it 'creates a synctable on the storage_servers', (done) ->
        db.synctable
            table : 'storage_servers'
            cb    : (err, x) ->
                synctable = x; done(err)


