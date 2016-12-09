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

# Used to test a sequence of results from a changefeed (see usage below)
changefeed_series = (v, cb) ->
    n = -1
    done = (err) ->
        cb?(err)
        cb = undefined
    f = (err, x) ->
        n += 1
        if err
            done(err)
            return
        h = v[n]
        if not h?
            done()
            return
        if typeof(h) != 'function'
            throw Error("each element of v must be a function, but v[#{n}]='#{h}' is not!")
        h x, (err) ->
            if err
                done(err)
            else
                if n+1 >= v.length
                    # success
                    done()
    return f

describe 'test the accounts table changefeed', ->
    before(setup)
    after(teardown)
    account_id = undefined
    changefeed_id = misc.uuid()

    it 'writes to user accounts table and verify that change automatically appears in changefeed', (done) ->
        async.series([
            (cb) ->
                db.create_account(first_name:"Sage", last_name:"Math", created_by:"1.2.3.4",\
                      email_address:"sage@example.com", password_hash:"blah", cb:\
                      (err, x) -> account_id=x; cb(err))
            (cb) ->
                db.user_query
                    account_id : account_id
                    query      : {accounts:[{account_id:account_id, first_name:null}]}
                    changes    : changefeed_id
                    cb         : changefeed_series([
                        (x, cb) ->
                            db.user_query
                                account_id : account_id
                                query      : {accounts:{account_id:account_id, first_name:'SAGE!'}}
                                cb         : cb
                        (x, cb) ->
                            expect(x).toEqual({ update: { account_id:account_id, first_name:'SAGE!'}})
                            db.delete_account(account_id:account_id, cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({ delete: { account_id:account_id } })
                            db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                        ], cb)
        ], (err) ->
            if err
                done(err)
            else
                done()
        )

describe 'test changefeeds involving the file_use table on one project with one user', ->
    before(setup)
    after(teardown)

    accounts = []
    projects = []
    it 'create accounts and projects', (done) ->
        async.series([
            (cb) ->
                create_accounts 1, (err, x) -> accounts=x; cb()
            (cb) ->
                create_projects 1, accounts[0], (err, x) -> projects.push(x...); cb(err)
        ], done)

    it 'tests a changefeed on the file_use table for a single project', (done) ->
        id   = misc.uuid()
        t0   = new Date()
        t1   = t2 = undefined
        obj  = {project_id:projects[0], path: 'foo.txt', users:{"#{accounts[0]}":{'read':t0}, last_edited:t0}}
        obj2 = {project_id:projects[0], path: 'foo2.txt', last_edited:new Date()}
        db.user_query
            account_id : accounts[0]
            query      : {file_use:[{id: null, project_id:projects[0], path: null, users: null, last_edited: null}]}
            changes    : id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x).toEqual({ file_use: [] })  # how it starts
                    db.user_query
                        account_id : accounts[0]
                        query      : {file_use:obj}
                        cb         : cb
                (x, cb) ->
                    obj.id = db.sha1(obj.project_id, obj.path)
                    expect(x).toEqual({insert: obj })

                    # now mutate it by chatting on it
                    t1 = new Date()
                    db.user_query
                        account_id : accounts[0]
                        query      : {file_use:{project_id:projects[0], path: 'foo.txt', users:{"#{accounts[0]}":{'chat':t1}}}}
                        cb         : cb
                (x, cb) ->
                    # note how chat gets recursively MERGED IN -- not replacing users. (so tricky under the hood to implement...)
                    obj.users["#{accounts[0]}"].chat = t1
                    expect(x).toEqual({update: obj})

                    # now mutate it by updating last_edited
                    t2 = new Date()
                    db.user_query
                        account_id : accounts[0]
                        query      : {file_use:{project_id:projects[0], path: 'foo.txt', last_edited:t2}}
                        cb         : cb
                (x, cb) ->
                    # note how chat gets recursively MERGED IN -- not replacing users. (so tricky under the hood to implement...)
                    obj.last_edited = t2
                    expect(x).toEqual({update: obj})

                    # add a second file_use entry
                    db.user_query
                        account_id : accounts[0]
                        query      : {file_use:obj2}
                        cb         : cb

                (x, cb) ->
                    obj2.id = db.sha1(obj2.project_id, obj2.path)
                    expect(x).toEqual({insert:obj2})

                    # now delete the first entry (not through file_use, but directly)
                    db._query
                        query : "DELETE FROM file_use"
                        where : {'id = $': obj.id}
                        cb    : cb
                (x, cb) ->
                    expect(x).toEqual({"delete": {id:obj.id, project_id:projects[0]}})

                    # and the second
                    db._query
                        query : "DELETE FROM file_use"
                        where : {'id = $': obj2.id}
                        cb    : cb

                (x, cb) ->
                    expect(x).toEqual({"delete": {id:obj2.id, project_id:projects[0]}})

                    db.user_query_cancel_changefeed(id:id, cb:cb)
            ], done)


describe 'test file_use changefeeds with multiple projects', ->
    before(setup)
    after(teardown)

    accounts = []
    projects = []
    it 'create an account and two projects', (done) ->
        async.series([
            (cb) ->
                create_accounts 1, (err, x) -> accounts=x; cb()
            (cb) ->
                create_projects 2, accounts[0], (err, x) -> projects.push(x...); cb(err)
        ], done)

    it 'test...', (done) ->
        id   = misc.uuid()
        t   = [misc.minutes_ago(10), misc.minutes_ago(5)]
        obj  = [
            {project_id:projects[0], path: 'file1.txt', users:{"#{accounts[0]}":{'read':t[0]}}},
            {project_id:projects[1], path: 'file2.txt', users:{"#{accounts[0]}":{'chat':t[1]}}}
        ]
        for x in obj
            x.id = db.sha1(x.project_id, x.path)
        
        db.user_query
            account_id : accounts[0]
            query      : {file_use:[{id: null, project_id:null, path: null, users: null, last_edited: null}]}
            changes    : id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x).toEqual({ file_use: [] })  # how it starts
                    db.user_query   # insert first object
                        account_id : accounts[0]
                        query      : {file_use:obj[0]}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({insert: obj[0]})

                    db.user_query   # insert first object
                        account_id : accounts[0]
                        query      : {file_use:obj[1]}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({insert: obj[1]})
                    cb()
            ], done)


