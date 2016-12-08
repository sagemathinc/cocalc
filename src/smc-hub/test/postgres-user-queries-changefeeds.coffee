###
TESTING of user queries specifically involving changefeeds

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) 2016 SageMath, Inc.
**

###

pgtest   = require('./pgtest')
db       = undefined
setup    = (cb) -> (pgtest.setup (err) -> db=pgtest.db; cb(err))
teardown = pgtest.teardown

{create_accounts, create_projects} = pgtest

async  = require('async')
expect = require('expect')

misc = require('smc-util/misc')

describe 'test the accounts table changefeed', ->
    before(setup)
    after(teardown)
    account_id = undefined
    changefeed_id = misc.uuid()
    it 'creates a user', (done) ->
        db.create_account(first_name:"Sage", last_name:"Math", created_by:"1.2.3.4",\
                          email_address:"sage@example.com", password_hash:"blah", cb:\
                          (err, x) -> account_id=x; done(err))

    it 'writes to user accounts table and verify that change automatically appears in changefeed', (done) ->
        result = undefined
        async.series([
            (cb) ->
                f = (err, x) ->
                    if cb?
                        # first time
                        cb(err)
                        cb = undefined
                        result = x
                    else
                        # not first time - update
                        console.log 'got update!', x
                db.user_query
                    account_id : account_id
                    query      : {accounts:[{account_id:account_id, first_name:null}]}
                    changes    : changefeed_id
                    cb         : f
        ], (err) ->
            if err
                done(err)
            else
                done()
        )


