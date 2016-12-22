###
TESTING of syncstring user and project queries

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

describe 'basic use of patches table from user -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = string_id = undefined
    path = 'a.txt'
    it 'creates 2 accounts', (done) ->
        create_accounts 2, (err, x) -> accounts=x; done(err)
    it 'creates 2 projects', (done) ->
        create_projects 2, accounts[0], (err, x) -> projects=x; done(err)

    it 'creates a syncstring', (done) ->
        string_id = db.sha1(projects[0], path)
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path, users:accounts}}
            cb    : done

    t0 = misc.minutes_ago(10)
    patch0 = misc.to_json({a:'patch'})
    it 'user creates a patch', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:{id:[string_id, t0], patch:patch0}}
            cb         : done

    it 'reads the patch back', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:{id:[string_id, t0], patch:null}}
            cb         : (err, x) ->
                expect(x).toEqual(patches:{id:[string_id, t0], patch:patch0})

                

