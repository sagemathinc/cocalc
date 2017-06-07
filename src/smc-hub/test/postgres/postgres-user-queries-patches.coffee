###
TESTING of patches table

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
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
            query      : {patches:{string_id:string_id, time:t0, user_id:0, patch:patch0}}
            cb         : done

    it 'reads the patch back', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:{string_id:string_id, time:t0, user_id:null, patch:null}}
            cb         : (err, x) ->
                expect(x).toEqual(patches:{string_id:string_id, time:t0, user_id:0, patch:patch0})
                done(err)

    t1 = misc.minutes_ago(11)
    t2 = misc.minutes_ago(12)
    t3 = misc.minutes_ago(20)
    it 'user creates a patch with all fields', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:{string_id:string_id, time:t3, user_id:1, patch:patch0, snapshot:'foo', prev:t1, sent:t2}}
            cb         : done

    it 'reads the patch with all fields back', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:{string_id:string_id, time:t3, user_id:1, patch:null, snapshot:null, prev:null, sent:null}}
            cb         : (err, x) ->
                expect(x).toEqual(patches:{string_id:string_id, time:t3, user_id:1, patch:patch0, snapshot:'foo', prev:t1, sent:t2})
                done(err)

    it 'reads all patches so far', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:[{string_id:string_id, time:null, user_id:null, patch:null}]}
            cb         : (err, x) ->
                expect(x.patches.length).toEqual(2)
                done(err)

    it 'reads only the more recent patch', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:[{string_id:string_id, time:{'>=':t0}, user_id:null, patch:null}]}
            cb         : (err, x) ->
                expect(x.patches.length).toEqual(1)
                expect(x.patches[0].time).toEqual(t0)
                done(err)

    it 'reads only the older patch', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:[{string_id:string_id, time:{'<':t0}, user_id:null, patch:null}]}
            cb         : (err, x) ->
                expect(x.patches.length).toEqual(1)
                expect(x.patches[0].time).toEqual(t3)
                done(err)

describe 'access control tests on patches table -- ', ->
    before(setup)
    after(teardown)

    # SETUP
    accounts = projects = string_id = undefined
    path = 'a.txt'
    it 'creates 3 accounts', (done) ->
        create_accounts 3, (err, x) -> accounts=x; done(err)
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
    it 'creates a patch', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {patches:{string_id:string_id, time:t0, user_id:0, patch:patch0}}
            cb         : done

    it 'tries to read as anon to patches table and fails', (done) ->
        db.user_query
            query : {patches:{string_id:null, time:null, user_id:null, patch:null}}
            cb    : (err) ->
                expect(err).toEqual("anonymous get queries not allowed for table 'patches'")
                done()

    it 'tries to write as anon to patches table and fails', (done) ->
        db.user_query
            query : {patches:{string_id:string_id, time:new Date(), user_id:0, patch:patch0}}
            cb    : (err) ->
                expect(err).toEqual("no anonymous set queries")
                done()

    it 'tries to write as user not on the project and fails', (done) ->
        db.user_query
            account_id : accounts[1]
            query : {patches:{string_id:string_id, time:new Date(), user_id:0, patch:patch0}}
            cb    : (err) ->
                expect(err).toEqual("user must be an admin")
                done()

    it 'tries to write as different project and fails', (done) ->
        db.user_query
            project_id : projects[1]
            query : {patches:{string_id:string_id, time:new Date(), user_id:0, patch:patch0}}
            cb    : (err) ->
                expect(err).toEqual("project not allowed to write to syncstring in different project")
                done()

    it 'makes account1 an admin', (done) ->
        db.make_user_admin(account_id:accounts[1], cb:done)

    it 'tries to write as admin and succeeds', (done) ->
        db.user_query
            account_id : accounts[1]
            query : {patches:{string_id:string_id, time:misc.minutes_ago(2), user_id:0, patch:patch0}}
            cb    : done

    it 'makes account2 a collab', (done) ->
        db.add_user_to_project(project_id:projects[0], account_id:accounts[2], cb:done)

    it 'tries to write as collab and succeeds', (done) ->
        db.user_query
            account_id : accounts[2]
            query      : {patches:{string_id:string_id, time:misc.minutes_ago(3), user_id:0, patch:patch0}}
            cb         : done

    it 'tries to write as same project and succeeds', (done) ->
        db.user_query
            project_id : projects[0]
            query : {patches:{string_id:string_id, time:misc.minutes_ago(1), user_id:0, patch:patch0}}
            cb    : (err) ->
                done(err)

    ###
    # NOTE: I removed this constraint, since code handles the undefined case fine,
    # and it was causing problems.  We should revisit this later.
    it 'tries to write negative user number and fails', (done) ->
        db.user_query
            project_id : projects[0]
            query : {patches:{string_id:string_id, time:misc.minutes_ago(4), user_id:-1, patch:patch0}}
            cb    : (err) ->
                expect(err).toContain('new row for relation "patches" violates check constraint')
                done()

    it 'tries to write without including user field at all (and fails)', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {patches:{string_id:string_id, time:t0, patch:patch0}}
            cb         : (err) ->
                expect(err).toContain('null value in column "user_id" violates not-null constraint')
                done()

    ###

    it 'tries to write invalid string_id and fails', (done) ->
        db.user_query
            project_id : projects[0]
            query : {patches:{string_id:'sage', time:misc.minutes_ago(4), user_id:0, patch:patch0}}
            cb    : (err) ->
                expect(err).toEqual("string_id (='sage') must be a string of length 40")
                done()

    it 'tries to write invalid time and fails', (done) ->
        db.user_query
            project_id : projects[0]
            query : {patches:{string_id:string_id, time:'sage', user_id:0, patch:patch0}}
            cb    : (err) ->
                expect(err).toContain('invalid input syntax for type timestamp')
                done()

    it 'tries to write invalid sent type and fails', (done) ->
        db.user_query
            project_id : projects[0]
            query : {patches:{string_id:string_id, time:misc.minutes_ago(4), user_id:0, sent:'sage', patch:patch0}}
            cb    : (err) ->
                expect(err).toContain('invalid input syntax for type timestamp')
                done()

    it 'tries to write invalid prev type and fails', (done) ->
        db.user_query
            project_id : projects[0]
            query : {patches:{string_id:string_id, time:misc.minutes_ago(4), user_id:0, prev:'sage', patch:patch0}}
            cb    : (err) ->
                expect(err).toContain('invalid input syntax for type timestamp')
                done()

    it 'tries to change past author and fails', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {patches:{string_id:string_id, time:t0, user_id:1, patch:patch0}}
            cb         : (err) ->
                expect(err).toEqual('you may not change the author of a patch from 0 to 1')
                done()

    it 'tries to write without including time field at all (and fails)', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {patches:{string_id:string_id, user_id:1, patch:patch0}}
            cb         : (err) ->
                expect("#{err}").toEqual("query must specify (primary) key 'time'")
                done()

    it 'tries to write without including string field at all (and fails)', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {patches:{time:t0, user_id:1, patch:patch0}}
            cb         : (err) ->
                expect(err).toEqual("string_id (='undefined') must be a string of length 40")
                done()


describe 'changefeed tests on patches table', ->
    before(setup)
    after(teardown)

    accounts = projects = string_id = undefined
    path = 'a.txt'
    t = (misc.minutes_ago(10-i) for i in [0...10])
    patch0 = misc.to_json({a:'patch'})
    it 'creates 2 accounts', (done) ->
        create_accounts 2, (err, x) -> accounts=x; done(err)
    it 'creates 1 projects', (done) ->
        create_projects 1, accounts[0], (err, x) -> projects=x; done(err)
    it 'creates a syncstring', (done) ->
        string_id = db.sha1(projects[0], path)
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path, users:accounts}}
            cb    : done

    it 'creates a changefeed as user', (done) ->
        changefeed_id = misc.uuid()
        db.user_query
            account_id : accounts[0]
            query      : {patches:[{string_id:string_id, time:null, user_id:null, patch:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x?.patches?.length).toEqual(0)

                    # insert a new patch
                    db.user_query
                        account_id : accounts[0]
                        query      : {patches:{string_id:string_id, time:t[0], user_id:0, patch:patch0}}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{string_id:string_id, time:t[0], user_id:0, patch:patch0}})

                    # modify the just-inserted patch -- should not fire anything off since sent isn't a field we're watching
                    db.user_query
                        account_id : accounts[0]
                        query      : {patches:{string_id:string_id, time:t[0], user_id:0, patch:patch0, sent:t[1]}}
                        cb         : (err) ->
                            if err
                                cb(err)
                            else
                                # insert new patch
                                db.user_query
                                    account_id : accounts[0]
                                    query      : {patches:{string_id:string_id, time:t[2], user_id:0, patch:'foo'}}
                                    cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{string_id:string_id, time:t[2], user_id:0, patch:'foo'}})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})
                    cb()
            ], done)

    it 'creates a changefeed as project', (done) ->
        changefeed_id = misc.uuid()
        db.user_query
            project_id : projects[0]
            query      : {patches:[{string_id:string_id, time:{'>=':t[2]}, user_id:null, patch:null, sent:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x?.patches?.length).toEqual(1)

                    # insert a new enough patch to notice
                    db.user_query
                        account_id : accounts[0]
                        query      : {patches:{string_id:string_id, time:t[3], user_id:1, patch:patch0}}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{string_id:string_id, time:t[3], user_id:1, patch:patch0}})

                    # modify the just-inserted patch -- should fire since we *are* watching sent column
                    db.user_query
                        account_id : accounts[0]
                        query      : {patches:{string_id:string_id, time:t[3], user_id:1, sent:t[1]}}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:{string_id:string_id, time:t[3], user_id:1, patch:patch0, sent:t[1]}})

                    # deletes an older patch -- shouldn't fire changefeed
                    db._query
                        query : "DELETE FROM patches"
                        where : {string_id:string_id, time:t[0]}
                        cb    : (err) ->
                            if err
                                cb(err)
                            else
                                # delete newer patch -- should fire changefeed
                                db._query
                                    query : "DELETE FROM patches"
                                    where : {string_id:string_id, time:t[3]}
                                    cb    : cb
                (x, cb) ->
                    expect(x).toEqual({action:'delete', old_val:{string_id:string_id, time:t[3]}})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})
                    cb()
            ], done)



