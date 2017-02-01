###
TESTING of cursors table

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

t = (misc.minutes_ago(10-i) for i in [0...10])

describe 'basic use of cursors table  -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = string_id = undefined
    path = 'a.txt'
    it 'creates 1 accounts', (done) ->
        create_accounts 1, (err, x) -> accounts=x; done(err)
    it 'creates 1 projects', (done) ->
        create_projects 1, accounts[0], (err, x) -> projects=x; done(err)
    it 'creates a syncstring', (done) ->
        string_id = db.sha1(projects[0], path)
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path, users:accounts}}
            cb    : done

    it 'user creates a cursor entry', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {cursors:{string_id:string_id, user_id:0, time:t[0], locs:[{x:1, y:2}, {x:5,y:3}]}}
            cb         : done

    it 'reads back the cursor entry', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {cursors:{string_id:string_id, user_id:0, time:null, locs:null}}
            cb         : (err, x) ->
                expect(x).toEqual(cursors:{string_id:string_id, user_id:0, time:t[0], locs:[{x:1, y:2}, {x:5,y:3}]})
                done(err)

    it 'creates another cursor entry', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {cursors:{string_id:string_id, user_id:1, time:t[1], locs:[{x:10, y:25}]}}
            cb         : done

    it 'reads back all cursors for the given document', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {cursors:[{string_id:string_id, user_id:null, time:null, locs:null}]}
            options    : [order_by:'time']
            cb         : (err, x) ->
                expect(x).toEqual(cursors:[{string_id:string_id, user_id:0, time:t[0], locs:[{x:1, y:2}, {x:5,y:3}]},
                                           {string_id:string_id, user_id:1, time:t[1], locs:[{x:10, y:25}]}
                                          ])
                done(err)

    it 'reads back recent cursors for the given document', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {cursors:[{string_id:string_id, user_id:null, time:{'>=':t[1]}, locs:null}]}
            options    : [order_by:'time']
            cb         : (err, x) ->
                expect(x).toEqual(cursors:[{string_id:string_id, user_id:1, time:t[1], locs:[{x:10, y:25}]}])
                done(err)

    it 'changes a cursor position', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {cursors:{string_id:string_id, user_id:1, time:t[1], locs:[{x:3, y:15}]}}
            cb         : done

    it 'verifies the change', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {cursors:{string_id:string_id, user_id:null, time:t[1], locs:null}}
            cb         : (err, x) ->
                expect(x).toEqual(cursors:{string_id:string_id, user_id:1, time:t[1], locs:[{x:3, y:15}]})
                done(err)


describe 'access control tests on cursors table -- ', ->
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

    it 'user creates a cursor entry', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {cursors:{string_id:string_id, user_id:0, time:t[0], locs:[{x:1, y:2}]}}
            cb         : done

    it 'reads back the cursor entry', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {cursors:{string_id:string_id, user_id:0, time:null, locs:null}}
            cb         : (err, x) ->
                expect(x).toEqual(cursors:{string_id:string_id, user_id:0, time:t[0], locs:[{x:1, y:2}]})
                done(err)

    it 'fails to reads back as project (since no project access to cursors table!)', (done) ->
        db.user_query
            project_id : projects[0]
            query      : {cursors:{string_id:string_id, user_id:0, time:t[0], locs:null}}
            cb         : (err, x) ->
                expect(err).toEqual("get queries not allowed for table 'cursors'")
                done()

    it 'fails to reads back as user not on project', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {cursors:{string_id:string_id, user_id:0, time:t[0], locs:null}}
            cb         : (err, x) ->
                expect(err).toEqual("user must be an admin")
                done()

    it 'tries to read as anon and fails', (done) ->
        db.user_query
            query : {cursors:{string_id:string_id, time:t[0], user_id:0, locs:null}}
            cb    : (err) ->
                expect(err).toEqual("anonymous get queries not allowed for table 'cursors'")
                done()

    it 'tries to write as anon and fails', (done) ->
        db.user_query
            query : {cursors:{string_id:string_id, time:new Date(), user_id:0, locs:[{x:1, y:2}]}}
            cb    : (err) ->
                expect(err).toEqual("no anonymous set queries")
                done()

    it 'tries to write as user not on the project and fails', (done) ->
        db.user_query
            account_id : accounts[1]
            query : {cursors:{string_id:string_id, time:t[1], user_id:0, locs:null}}
            cb    : (err) ->
                expect(err).toEqual("user must be an admin")
                done()

    it 'tries to write as different project and fails', (done) ->
        db.user_query
            project_id : projects[1]
            query : {cursors:{string_id:string_id, time:t[1], user_id:0, locs:[{x:5,y:10}]}}
            cb    : (err) ->
                expect(err).toEqual("user set queries not allowed for table 'cursors'")
                done()

    it 'makes account1 an admin', (done) ->
        db.make_user_admin(account_id:accounts[1], cb:done)

    it 'tries to write as admin user and succeeds', (done) ->
        db.user_query
            account_id : accounts[1]
            query : {cursors:{string_id:string_id, time:t[5], user_id:0, locs:[{x:5,y:10}]}}
            cb    : done

    it 'try to read as admin and succeed', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {cursors:{string_id:string_id, user_id:0, time:t[0], locs:null}}
            cb         : done

    it 'makes account2 a collab', (done) ->
        db.add_user_to_project(project_id:projects[0], account_id:accounts[2], cb:done)

    it 'tries to write as collab and succeeds', (done) ->
        db.user_query
            account_id : accounts[2]
            query      : {cursors:{string_id:string_id, time:t[2], user_id:1, locs:[{x:15,y:20}]}}
            cb         : done

    it 'try to read as collab and succeed', (done) ->
        db.user_query
            account_id : accounts[2]
            query      : {cursors:{string_id:string_id, user_id:0, time:t[0], locs:null}}
            cb         : done

    it 'tries to write as same project and fails', (done) ->
        db.user_query
            project_id : projects[0]
            query      : {cursors:{string_id:string_id, time:t[3], user_id:2, locs:[{x:20,y:25}]}}
            cb         : (err) ->
                expect(err).toEqual("user set queries not allowed for table 'cursors'")
                done()

    it 'tries to write non-array locs and fail', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {cursors:{string_id:string_id, time:t[4], user_id:0, locs:'foo bar'}}
            cb    : (err) ->
                expect(err).toContain('malformed array literal')
                done()

    it 'tries to write invalid string_id and fails', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {cursors:{string_id:'sage', time:t[4], user_id:2, locs:[{x:20,y:25}]}}
            cb    : (err) ->
                expect(err).toEqual("string_id (='sage') must be a string of length 40")
                done()

    it 'tries to write with missing locs and fail', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {cursors:{string_id:string_id, time:t[4], user_id:2}}
            cb    : (err) ->
                expect(err).toContain('violates not-null constraint')
                done()

    it 'tries to write invalid time and fails', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {cursors:{string_id:string_id, time:'sage', user_id:2, locs:[{x:20,y:25}]}}
            cb    : (err) ->
                expect(err).toContain('invalid input syntax for type timestamp')
                done()

describe 'changefeed tests on cursors table', ->
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
    it 'adds other user to project', (done) ->
        db.add_user_to_project(account_id: accounts[1], project_id:projects[0], cb:done)

    it 'creates a changefeed as user', (done) ->
        changefeed_id = misc.uuid()
        db.user_query
            account_id : accounts[0]
            query      : {cursors:[{string_id:string_id, time:null, user_id:null, locs:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x?.cursors?.length).toEqual(0)

                    # insert a new cursor
                    db.user_query
                        account_id : accounts[0]
                        query      : {cursors:{string_id:string_id, time:t[0], user_id:0, locs:[{x:1,y:2}]}}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{string_id:string_id, time:t[0], user_id:0, locs:[{x:1,y:2}]}})

                    # insert another cursor
                    db.user_query
                        account_id : accounts[1]
                        query      : {cursors:{string_id:string_id, time:t[1], user_id:1, locs:[{x:5,y:10}, {x:3,y:5}]}}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{string_id:string_id, time:t[1], user_id:1, locs:[{x:5,y:10}, {x:3,y:5}]}})

                    # move cursor
                    db.user_query
                        account_id : accounts[0]
                        query      : {cursors:{string_id:string_id, user_id:0, time:t[2], locs:[{x:10,y:20}]}}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:{string_id:string_id, user_id:0, time:t[2], locs:[{x:10,y:20}]}})

                    # delete cursor
                    db._query
                        query : "DELETE FROM cursors"
                        where :
                            string_id : string_id
                            user_id   : 0
                        cb    : cb
                (x, cb) ->
                    expect(x).toEqual({action:'delete', old_val:{string_id:string_id, user_id:0}})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})
                    cb()
            ], done)