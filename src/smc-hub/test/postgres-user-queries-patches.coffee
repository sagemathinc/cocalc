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
            query      : {patches:{string_id:string_id, time:t0, user:0, patch:patch0}}
            cb         : done

    it 'reads the patch back', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:{string_id:string_id, time:t0, user:null, patch:null}}
            cb         : (err, x) ->
                expect(x).toEqual(patches:{string_id:string_id, time:t0, user:0, patch:patch0})
                done(err)

    t1 = misc.minutes_ago(11)
    t2 = misc.minutes_ago(12)
    t3 = misc.minutes_ago(20)
    it 'user creates a patch with all fields', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:{string_id:string_id, time:t3, user:1, patch:patch0, snapshot:'foo', prev:t1, sent:t2}}
            cb         : done

    it 'reads the patch with all fields back', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:{string_id:string_id, time:t3, user:1, patch:null, snapshot:null, prev:null, sent:null}}
            cb         : (err, x) ->
                expect(x).toEqual(patches:{string_id:string_id, time:t3, user:1, patch:patch0, snapshot:'foo', prev:t1, sent:t2})
                done(err)

    it 'reads all patches so far', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:[{string_id:string_id, time:null, user:null, patch:null}]}
            cb         : (err, x) ->
                expect(x.patches.length).toEqual(2)
                done(err)

    it 'reads only the more recent patch', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:[{string_id:string_id, time:{'>=':t0}, user:null, patch:null}]}
            cb         : (err, x) ->
                expect(x.patches.length).toEqual(1)
                expect(x.patches[0].time).toEqual(t0)
                done(err)

    it 'reads only the older patch', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:[{string_id:string_id, time:{'<':t0}, user:null, patch:null}]}
            cb         : (err, x) ->
                expect(x.patches.length).toEqual(1)
                expect(x.patches[0].time).toEqual(t3)
                done(err)

