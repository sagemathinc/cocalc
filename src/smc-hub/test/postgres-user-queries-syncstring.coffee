###
TESTING of syncstring user queries

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

describe 'basic use of syncstring table -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = undefined
    path = 'a.txt'
    it 'creates 2 accounts', (done) ->
        create_accounts 2, (err, x) -> accounts=x; done(err)
    it 'creates 2 projects', (done) ->
        create_projects 2, accounts[0], (err, x) -> projects=x; done(err)

    it 'verifies anonymous set queries are not allowed', (done) ->
        db.user_query
            query : {syncstrings:{project_id:projects[0], path:path, users:accounts}}
            cb    : (err) ->
                expect(err).toEqual("no anonymous set queries")
                done()

    it 'creates a syncstring entry', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path, users:accounts}}
            cb    : done

    it 'verifies that entry has the documented string_id', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path, users:null, string_id:null}}
            cb    : (err, result) ->
                string_id = db.sha1(projects[0], path)
                expect(result?.syncstrings).toEqual({project_id:projects[0], path:path, users:accounts, string_id:string_id})
                done(err)

    it "verifies that account1 can't write to project it isn't on", (done) ->
        db.user_query
            account_id : accounts[1]
            query : {syncstrings:{project_id:projects[0], path:'b.txt'}}
            cb    : (err) ->
                expect(err).toEqual('user must be an admin')
                done()

    it 'makes account1 an admin', (done) ->
        db.make_user_admin
            account_id : accounts[1]
            cb : done

    it "verifies that account1 as admin *can* write to project it isn't on", (done) ->
        db.user_query
            account_id : accounts[1]
            query : {syncstrings:{project_id:projects[0], path:'b.txt'}}
            cb    : done

    ss_every = undefined
    it 'writes a syncstring with every field set', (done) ->
        ss_every =
            project_id        : projects[1]
            path              : path
            users             : accounts
            last_snapshot     : misc.hours_ago(5)
            snapshot_interval : 100
            deleted           : true
            save              : {state:'requested'}
            last_active       : misc.hours_ago(2)
            init              : {time:new Date()}
            read_only         : true
            last_file_change  : misc.hours_ago(3)
        db.user_query
            account_id : accounts[0]
            query      : {syncstrings:ss_every}
            cb         : done

    it 'reads back syncstring with every field set', (done) ->
        t = misc.copy(ss_every)
        for k of t
            if k == 'project_id' or k == 'path'
                continue
            t[k] = null
        db.user_query
            account_id : accounts[0]
            query      : {syncstrings:t}
            cb         : (err, result) ->
                ss_every.string_id = db.sha1(projects[1], path)
                expect(result?.syncstrings).toEqual(ss_every)
                done(err)

    it 'modifies a field of the syncstring we just created', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {syncstrings:{project_id:projects[1], path:path, read_only:false}}
            cb         : done

    it 'verifies the modification', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {syncstrings:{project_id:projects[1], path:path, read_only:null}}
            cb         : (err, result) ->
                expect(result?.syncstrings).toEqual({project_id:projects[1], path:path, read_only:false, string_id:db.sha1(projects[1], path)})
                done(err)

    it 'confirms that project_id must be given in set query', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {syncstrings:{path:path, read_only:true}}
            cb         : (err) ->
                expect(err).toEqual('project_id must be a valid uuid')
                done()

    it 'confirms that path does NOT have to be given (this would be the project-wide syncstring)', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {syncstrings:{project_id:projects[1], read_only:true}}
            cb         : done

    it 'confirms that project_id must be given in get query', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {syncstrings:{path:path, read_only:null}}
            cb         : (err) ->
                expect(err).toEqual('project_id must be a valid uuid')
                done()

    it 'confirms that path does NOT have to be given in get query either', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {syncstrings:{project_id:projects[1], read_only:null}}
            cb         : done

    it 'check that there are two syncstrings in second project', (done) ->
        db._count
            table : 'syncstrings'
            where : {project_id:projects[1]}
            cb    : (err, n) ->
                expect(n).toEqual(2)
                done(err)

    it 'check two syncstring in first project', (done) ->
        db._count
            table : 'syncstrings'
            where : {project_id:projects[0]}
            cb    : (err, n) ->
                expect(n).toEqual(2)
                done(err)

describe 'syncstring changefeed -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = undefined
    path = 'a.txt'
    it 'creates 2 accounts', (done) ->
        create_accounts 2, (err, x) -> accounts=x; done(err)
    it 'creates 2 projects', (done) ->
        create_projects 2, accounts[0], (err, x) -> projects=x; done(err)

    changefeed_id = misc.uuid()
    it 'creates a changefeed', (done) ->
        obj = {project_id:projects[0], path:path, read_only:true, users:accounts}
        db.user_query
            account_id : accounts[0]
            query      : {syncstrings:[{project_id:projects[0], path:path, read_only:null, users:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x.syncstrings.length).toEqual(0)

                    # create an entry matching the condition
                    db.user_query(account_id: accounts[0], query: {syncstrings: obj}, cb: cb)
                (x, cb) ->
                    obj.string_id = db.sha1(projects[0], path)
                    expect(x).toEqual({action:'insert', new_val:obj})

                    # modify the read_only field
                    obj.read_only = false
                    db.user_query(account_id: accounts[0], query: {syncstrings: obj}, cb: cb)
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:obj})

                    # modify the users field
                    obj.users = [accounts[0]]
                    db.user_query(account_id: accounts[0], query: {syncstrings: obj}, cb: cb)
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:obj})

                    # change an irrelevant field and get no update, then change the read_only field back so we see something
                    db.user_query
                        account_id : accounts[0]
                        query      : {syncstrings: {string_id:obj.string_id, project_id:obj.project_id, path:obj.path, last_active:new Date()}}
                        cb         : (err) ->
                            if err
                                cb(err)
                            else
                                delete obj.last_active
                                obj.read_only = true
                                db.user_query(account_id: accounts[0], query: {syncstrings: obj}, cb: cb)
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:obj})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})
                    cb()
            ], done)


