###
TESTING of syncstring user and project queries

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

describe 'basic use of syncstring table from user -- ', ->
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

    it 'verifies anonymous get queries are not allowed', (done) ->
        db.user_query
            query : {syncstrings:{project_id:projects[0], path:path, users:null}}
            cb    : (err) ->
                expect(err).toEqual("anonymous get queries not allowed for table 'syncstrings'")
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

describe 'syncstring changefeed from account -- ', ->
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

describe 'basic use of syncstring table from project -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = undefined
    path = 'a.txt'
    it 'creates 2 accounts', (done) ->
        create_accounts 2, (err, x) -> accounts=x; done(err)
    it 'creates 2 projects', (done) ->
        create_projects 2, accounts[0], (err, x) -> projects=x; done(err)

    it 'creates a syncstring entry', (done) ->
        db.user_query
            project_id : projects[0]
            query      : {syncstrings:{project_id:projects[0], path:path, users:accounts}}
            cb         : done

    it 'verifies that entry has the documented string_id', (done) ->
        db.user_query
            project_id : projects[0]
            query      : {syncstrings:{project_id:projects[0], path:path, users:null, string_id:null}}
            cb         : (err, result) ->
                string_id = db.sha1(projects[0], path)
                expect(result?.syncstrings).toEqual({project_id:projects[0], path:path, users:accounts, string_id:string_id})
                done(err)

    it "verifies that project1 can't write to syncstring for other project", (done) ->
        db.user_query
            project_id : projects[1]
            query : {syncstrings:{project_id:projects[0], path:'b.txt'}}
            cb    : (err) ->
                expect(err).toEqual('projects can only access their own syncstrings')
                done()

    ss_every = undefined
    it 'project1 writes a syncstring with every field set', (done) ->
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
            project_id : projects[1]
            query      : {syncstrings:ss_every}
            cb         : done

    it 'reads back syncstring with every field set', (done) ->
        t = misc.copy(ss_every)
        for k of t
            if k == 'project_id' or k == 'path'
                continue
            t[k] = null
        db.user_query
            project_id : projects[1]
            query      : {syncstrings:t}
            cb         : (err, result) ->
                ss_every.string_id = db.sha1(projects[1], path)
                expect(result?.syncstrings).toEqual(ss_every)
                done(err)

    it 'modifies a field of the syncstring we just created', (done) ->
        db.user_query
            project_id : projects[1]
            query      : {syncstrings:{project_id:projects[1], path:path, read_only:false}}
            cb         : done

    it 'verifies the modification', (done) ->
        db.user_query
            project_id : projects[1]
            query      : {syncstrings:{project_id:projects[1], path:path, read_only:null}}
            cb         : (err, result) ->
                expect(result?.syncstrings).toEqual({project_id:projects[1], path:path, read_only:false, string_id:db.sha1(projects[1], path)})
                done(err)

    it 'confirms that project_id must be given in set query', (done) ->
        db.user_query
            project_id : projects[1]
            query      : {syncstrings:{path:path, read_only:true}}
            cb         : (err) ->
                expect(err).toEqual('project_id must be a valid uuid')
                done()

    it 'confirms that path does NOT have to be given (this would be the project-wide syncstring)', (done) ->
        db.user_query
            project_id : projects[1]
            query      : {syncstrings:{project_id:projects[1], read_only:true}}
            cb         : done

    it 'confirms that project_id must be given in get query', (done) ->
        db.user_query
            project_id : projects[1]
            query      : {syncstrings:{path:path, read_only:null}}
            cb         : (err) ->
                expect(err).toEqual('project_id must be a valid uuid')
                done()

    it 'confirms that path does NOT have to be given in get query either', (done) ->
        db.user_query
            project_id : projects[1]
            query      : {syncstrings:{project_id:projects[1], read_only:null}}
            cb         : done

describe 'syncstring changefeed from project -- ', ->
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
            project_id : projects[0]
            query      : {syncstrings:[{project_id:projects[0], path:path, read_only:null, users:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x.syncstrings.length).toEqual(0)

                    # create an entry matching the condition
                    db.user_query(project_id: projects[0], query: {syncstrings: obj}, cb: cb)
                (x, cb) ->
                    obj.string_id = db.sha1(projects[0], path)
                    expect(x).toEqual({action:'insert', new_val:obj})

                    # modify the read_only field (as user not project...)
                    obj.read_only = false
                    db.user_query(account_id: accounts[0], query: {syncstrings: obj}, cb: cb)
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:obj})

                    # modify the users field
                    obj.users = [accounts[0]]
                    db.user_query(project_id: projects[0], query: {syncstrings: obj}, cb: cb)
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:obj})

                    # change an irrelevant field and get no update, then change the read_only field back so we see something
                    db.user_query
                        project_id : projects[0]
                        query      : {syncstrings: {string_id:obj.string_id, project_id:obj.project_id, path:obj.path, last_active:new Date()}}
                        cb         : (err) ->
                            if err
                                cb(err)
                            else
                                delete obj.last_active
                                obj.read_only = true
                                db.user_query(project_id: projects[0], query: {syncstrings: obj}, cb: cb)
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:obj})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})
                    cb()
            ], done)

describe 'test syncstrings_delete -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = undefined
    path = 'a.txt'
    it 'creates 1 accounts', (done) ->
        create_accounts 1, (err, x) -> accounts=x; done(err)
    it 'creates 1 projects', (done) ->
        create_projects 1, accounts[0], (err, x) -> projects=x; done(err)

    it 'creates a syncstring entry', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path, users:accounts}}
            cb    : done

    it 'confirms syncstring was properly written', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path, users:null}}
            cb    : (err, result) ->
                expect(result).toEqual({syncstrings:{project_id:projects[0], path:path, users:accounts, string_id:db.sha1(projects[0], path)}})
                done(err)

    it "verifies that account can't delete (since not admin)", (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings_delete:{project_id:projects[0], path:path}}
            cb    : (err) ->
                expect(err).toEqual('user must be an admin')
                done()

    it 'makes account an admin', (done) ->
        db.make_user_admin(account_id: accounts[0], cb: done)

    it 'verifies that admin can delete', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings_delete:{project_id:projects[0], path:path}}
            cb    : done

    it 'confirms syncstring was deleted', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path, users:null}}
            cb    : (err, result) ->
                expect(result).toEqual({syncstrings:undefined})
                done(err)

describe 'test access roles for recent_syncstrings_in_project', ->
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
            query : {recent_syncstrings_in_project:{project_id:projects[0], path:'foo.txt'}}
            cb    : (err) ->
                expect(err).toEqual("no anonymous set queries")
                done()

    it 'verifies anonymous get queries are not allowed', (done) ->
        db.user_query
            query : {recent_syncstrings_in_project:{project_id:projects[0], max_age_m:15, string_id:null}}
            cb    : (err) ->
                expect(err).toEqual("anonymous get queries not allowed for table 'recent_syncstrings_in_project'")
                done()

    it 'account do a valid get query and confirms no recent syncstrings', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {recent_syncstrings_in_project:{project_id:projects[0], max_age_m:15, string_id:null}}
            cb    : (err, result) ->
                expect(result).toEqual(recent_syncstrings_in_project:undefined)
                done(err)

    it 'project does a valid get query and confirms no recent syncstrings', (done) ->
        db.user_query
            project_id : projects[0]
            query : {recent_syncstrings_in_project:{project_id:projects[0], max_age_m:15, string_id:null}}
            cb    : (err, result) ->
                expect(result).toEqual(recent_syncstrings_in_project:undefined)
                done(err)

    it 'project does an invalid get query and confirms get error', (done) ->
        db.user_query
            project_id : projects[1]
            query : {recent_syncstrings_in_project:{project_id:projects[0], max_age_m:15, string_id:null}}
            cb    : (err, result) ->
                expect(err).toEqual('projects can only access their own syncstrings')
                done()

    it 'account do invalid get query and error', (done) ->
        db.user_query
            account_id : accounts[1]
            query : {recent_syncstrings_in_project:{project_id:projects[0], max_age_m:15, string_id:null}}
            cb    : (err, result) ->
                expect(err).toEqual('user must be an admin')
                done()

    it 'makes account1 an admin', (done) ->
        db.make_user_admin
            account_id : accounts[1]
            cb : done

    it 'admin does previously disallowed get query and it works', (done) ->
        db.user_query
            account_id : accounts[1]
            query : {recent_syncstrings_in_project:{project_id:projects[0], max_age_m:15, string_id:null}}
            cb    : (err, result) ->
                expect(result).toEqual(recent_syncstrings_in_project:undefined)
                done(err)

describe 'test writing and reading for recent_syncstrings_in_project -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = undefined
    it 'creates 2 accounts', (done) ->
        create_accounts 2, (err, x) -> accounts=x; done(err)

    path0 = '1.txt'
    path1 = '2.txt'
    time0 = misc.minutes_ago(10)
    time1 = misc.minutes_ago(20)
    string_id0 = string_id1 = undefined
    it 'creates 2 projects', (done) ->
        create_projects 2, accounts[0], (err, x) ->
            projects=x
            string_id0 = db.sha1(projects[0], path0)
            string_id1 = db.sha1(projects[0], path1)
            done(err)

    it 'creates a syncstring entry', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path0, users:accounts, last_active:time0}}
            cb    : done

    it 'creates an older syncstring entry', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:path1, users:accounts, last_active:time1}}
            cb    : done

    it 'as user, queries for recent syncstrings and gets it', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {recent_syncstrings_in_project:[{project_id:projects[0], max_age_m:15, last_active:null, string_id:null}]}
            cb    : (err, result) ->
                expect(result).toEqual(recent_syncstrings_in_project:[{project_id:projects[0], last_active:time0, string_id:string_id0}])
                done(err)

    it 'as project, queries for recent syncstrings and gets it', (done) ->
        db.user_query
            project_id : projects[0]
            query : {recent_syncstrings_in_project:[{project_id:projects[0], max_age_m:15, last_active:null, string_id:null}]}
            cb    : (err, result) ->
                expect(result).toEqual(recent_syncstrings_in_project:[{project_id:projects[0], last_active:time0, string_id:string_id0}])
                done(err)

    it 'query for older syncstrings', (done) ->
        db.user_query
            project_id : projects[0]
            query : {recent_syncstrings_in_project:[{project_id:projects[0], max_age_m:30, last_active:null, string_id:null}]}
            cb    : (err, result) ->
                expect(result).toEqual(recent_syncstrings_in_project:[{project_id:projects[0], last_active:time0, string_id:string_id0}, {project_id:projects[0], last_active:time1, string_id:string_id1}])
                done(err)

    it 'ensure other project syncstrings are separate', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {recent_syncstrings_in_project:[{project_id:projects[1], max_age_m:30, last_active:null, string_id:null}]}
            cb    : (err, result) ->
                expect(result).toEqual(recent_syncstrings_in_project:[])
                done(err)

    changefeed_id = misc.uuid()
    time2 = new Date()
    time3 = new Date()
    it 'creates and works with a changefeed', (done) ->
        obj0 = undefined
        db.user_query
            project_id : projects[0]
            query      :
                recent_syncstrings_in_project:
                    [{project_id:projects[0], max_age_m:15, last_active:null, string_id:null, deleted:null}]
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x.recent_syncstrings_in_project.length).toEqual(1)
                    obj0 = x.recent_syncstrings_in_project[0]

                    # change time of syncstring
                    db.user_query
                        account_id : accounts[0]
                        query : {syncstrings:{project_id:projects[0], path:path0, last_active:time2}}
                        cb    : cb
                (x, cb) ->
                    obj0.last_active = time2
                    expect(x).toEqual({action:'update', new_val:obj0, old_val:{last_active:time0}})

                    # change time introducing a syncstring that was old
                    db.user_query
                        project_id : projects[0]
                        query : {syncstrings:{project_id:projects[0], path:path1, last_active:time3}}
                        cb    : cb
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:{last_active:time3, project_id:projects[0], string_id:string_id1}, old_val:{last_active:time1}})

                    # create new syncstring
                    db.user_query
                        project_id : projects[0]
                        query : {syncstrings:{project_id:projects[0], path:'xyz', last_active:time3}}
                        cb    : cb
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{last_active:time3, project_id:projects[0], string_id:db.sha1(projects[0], 'xyz')}})

                    # make obj0 have old time and see get deleted
                    db.user_query
                        account_id : accounts[0]
                        query : {syncstrings:{project_id:projects[0], path:path0, last_active:time1}}
                        cb    : cb
                (x, cb) ->
                    expect(x).toEqual({action:'delete', old_val:{last_active:time3, project_id:projects[0], string_id:string_id0}})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})

                    cb()
            ], done)


