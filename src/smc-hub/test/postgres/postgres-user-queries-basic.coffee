###
TESTING of User (and project) client queries

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
{SCHEMA} = require('smc-util/schema')

describe 'some basic testing of user_queries', ->
    before(setup)
    after(teardown)
    account_id = undefined
    # First create an account, so we can do some queries.
    it 'creates an account', (done) ->
        db.create_account(first_name:"Sage", last_name:"Math", created_by:"1.2.3.4",\
                          email_address:"sage@example.com", password_hash:"blah", cb:(err, x) -> account_id=x; done(err))
    it 'queries for the first_name and account_id property', (done) ->
        db.user_query
            account_id : account_id
            query      : {accounts:{account_id:account_id, first_name:null}}
            cb         : (err, result) ->
                expect(result).toEqual({accounts:{ account_id:account_id, first_name: 'Sage' }})
                done(err)

    it 'query for the evaluate key fills in the correct default', (done) ->
        db.user_query
            account_id : account_id
            query      : {accounts:{account_id:account_id, evaluate_key:null}}
            cb         : (err, result) ->
                x = SCHEMA.accounts.user_query.get.fields.evaluate_key
                expect(result).toEqual({accounts:{ account_id:account_id, evaluate_key:x }})
                done(err)

    it 'queries the collaborators virtual table before there are any projects', (done) ->
        db.user_query
            account_id : account_id
            query : {collaborators:[{account_id:null, first_name:null, last_name:null}]}
            cb    : (err, collabs) ->
                if err
                    done(err); return
                expect(collabs).toEqual({collaborators:[]})
                done()

    project_id = undefined
    it 'creates a project that we will query about soon', (done) ->
        db.create_project(account_id:account_id, title:"Test project", description:"The description",\
                    cb:(err, x) -> project_id=x; done(err))

    it 'queries the collaborators virtual table after making one project', (done) ->
        db.user_query
            account_id : account_id
            query : {collaborators:[{account_id:null, first_name:null, last_name:null}]}
            cb    : (err, collabs) ->
                if err
                    done(err); return
                user = {account_id:account_id, first_name:'Sage', last_name:'Math'}
                expect(collabs).toEqual({collaborators:[user]})
                done()

    it 'queries the projects table and ensures there is one project with the correct title and description.', (done) ->
        db.user_query
            account_id : account_id
            query      : {projects:[{project_id:project_id, title:null, description:null}]}
            cb         : (err, projects) ->
                expect(projects).toEqual(projects:[{description: 'The description', project_id: project_id, title: 'Test project' }])
                done(err)

    it 'changes the title of the project', (done) ->
        db.user_query
            account_id : account_id
            query      : {projects:{project_id:project_id, title:'The new title', description:'The new description'}}
            cb         : done

    it 'and checks that the title/desc did indeed change', (done) ->
        db.user_query
            account_id : account_id
            query      : {projects:[{project_id:project_id, title:null, description:null}]}
            cb         : (err, projects) ->
                expect(projects).toEqual(projects:[{description: 'The new description', project_id: project_id, title: 'The new title' }])
                done(err)

    account_id2 = undefined
    it 'create a second account...', (done) ->
        db.create_account(first_name:"Elliptic", last_name:"Curve", created_by:"3.1.3.4",\
                          email_address:"other@example.com", password_hash:"blahblah", cb:(err, x) -> account_id2=x; done(err))
    it 'queries with second account for the first_name and account_id property of first account', (done) ->
        db.user_query
            account_id : account_id2
            query      : {accounts:{account_id:account_id, first_name:null}}
            cb         : (err, result) ->
                # we get undefined, meaning no results in the data we know about that match the query
                expect(result).toEqual({accounts:undefined})
                done(err)

    it 'queries for first user project but does not see it', (done) ->
        db.user_query
            account_id : account_id2
            query      : {projects:[{project_id:project_id, title:null, description:null}]}
            cb         : (err, projects) ->
                expect(err).toEqual('you do not have read access to this project')
                done()

    it 'queries the collaborators virtual table before there are any projects for the second user', (done) ->
        db.user_query
            account_id : account_id2
            query : {collaborators:[{account_id:null, first_name:null, last_name:null}]}
            cb    : (err, collabs) ->
                if err
                    done(err); return
                expect(collabs).toEqual({collaborators:[]})
                done()


    it 'add second user as a collaborator', (done) ->
        db.add_user_to_project
            project_id : project_id
            account_id : account_id2
            group      : 'collaborator'
            cb         : done

    it 'queries again and finds that the second user can see the first project', (done) ->
        db.user_query
            account_id : account_id2
            query      : {projects:[{project_id:project_id, title:null, description:null, users:null}]}
            cb         : (err, projects) ->
                users =
                    "#{account_id}":{group:'owner'}
                    "#{account_id2}":{group:'collaborator'}
                expect(projects).toEqual(projects:[{description: 'The new description', project_id: project_id, title: 'The new title', users:users}])
                done(err)

    it 'queries the collaborators virtual table for the first user', (done) ->
        db.user_query
            account_id : account_id
            query : {collaborators:[{account_id:null, first_name:null, last_name:null}]}
            cb    : (err, collabs) ->
                if err
                    done(err); return
                collabs.collaborators.sort (a,b)->misc.cmp(a.last_name, b.last_name) # make canonical
                user1 = {account_id:account_id2, first_name:'Elliptic', last_name:'Curve'}
                user2 = {account_id:account_id, first_name:'Sage', last_name:'Math'}
                expect(collabs).toEqual({collaborators:[user1,user2]})
                done(err)


describe 'testing file_use -- ', ->
    before(setup)
    after(teardown)
    # Create two users and two projects
    accounts = []
    projects = []
    it 'setup accounts and projects', (done) ->
        async.series([
            (cb) ->
                create_accounts 2, (err, x) -> accounts=x; cb()
            (cb) ->
                create_projects 1, accounts[0], (err, x) -> projects.push(x...); cb(err)
            (cb) ->
                create_projects 1, accounts[1], (err, x) -> projects.push(x...); cb(err)
        ], done)

    time0 = new Date()
    it 'writes a file_use entry via a user query (and gets it back)', (done) ->
        obj =
            project_id  : projects[0]
            path        : 'foo'
            users       : {"#{accounts[0]}":{edit:time0}}
            last_edited : time0
        async.series([
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      : {file_use : obj}
                    cb         : cb
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      :
                        file_use :
                            project_id  : projects[0]
                            path        : 'foo'
                            users       : null
                            last_edited : null
                    cb         : (err, result) ->
                        expect(result).toEqual(file_use:obj)
                        cb(err)
        ], done)

    it 'writes another file_use entry and verifies that json is properly *merged*', (done) ->
        obj =
            project_id  : projects[0]
            path        : 'foo'
            users       : {"#{accounts[0]}":{read:time0}}
        async.series([
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      : {file_use : obj}
                    cb         : cb
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      :
                        file_use :
                            project_id  : projects[0]
                            path        : 'foo'
                            users       : null
                            last_edited : null
                    cb         : (err, result) ->
                        # add rest of what we expect from previous insert in test above:
                        obj.last_edited = time0
                        obj.users["#{accounts[0]}"] = {read:time0, edit:time0}
                        expect(result).toEqual(file_use:obj)
                        cb(err)
        ], done)

    it 'tries to read file use entry as user without project access and fails', (done) ->
        db.user_query
            account_id : accounts[1]
            query      :
                file_use :
                    project_id  : projects[0]
                    path        : 'foo'
                    users       : null
            cb         : (err, result) ->
                expect(err).toEqual('you do not have read access to this project')
                done()

    it 'adds second user to first project, then reads and finds one file_use match', (done) ->
        async.series([
            (cb) ->
                db.add_user_to_project
                    project_id : projects[0]
                    account_id : accounts[1]
                    cb         : cb
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      :
                        file_use : [{project_id:projects[0], path:'foo', users:null}]
                    cb : (err, x) ->
                        expect(x?.file_use?.length).toEqual(1)
                        cb(err)
            ], done)


    it 'add a second file_use notification for first project (different path)', (done) ->
        t = new Date()
        obj =
            project_id  : projects[0]
            path        : 'foo2'
            users       : {"#{accounts[1]}":{read:t}}
            last_edited : t
        async.series([
            (cb) ->
                db.user_query
                    account_id : accounts[1]
                    query      : {file_use : obj}
                    cb         : cb
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      :
                        file_use : [{project_id:projects[0], path:'foo', users:null}]
                    cb : (err, x) ->
                        expect(x?.file_use?.length).toEqual(1)
                        cb(err)
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      :
                        file_use : [{project_id:projects[0], path:null, users:null}]
                    cb : (err, x) ->
                        if err
                            cb(err); return
                        expect(x.file_use.length).toEqual(2)
                        expect(x.file_use[0].path).toEqual('foo2')  # order will be this way due to sort of last_edited
                        expect(x.file_use[1].path).toEqual('foo')
                        cb()
        ], done)

    it 'add a file_use notification for second project as second user', (done) ->
        obj =
            project_id  : projects[1]
            path        : 'bar'
            last_edited : new Date()
        db.user_query
            account_id : accounts[1]
            query      : {file_use : obj}
            cb         : done

    it 'confirm total of 3 file_use entries', (done) ->
        db.user_query
            account_id : accounts[1]
            query      :
                file_use : [{project_id:null, path:null, last_edited: null}]
            cb : (err, x) ->
                if err
                    done(err)
                else
                    expect(x.file_use.length).toEqual(3)
                    done()

    it 'also check limit option works', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : file_use : [{project_id:null, path:null}]
            options    : [{limit:2}]
            cb : (err, x) ->
                if err
                    done(err)
                else
                    expect(x.file_use.length).toEqual(2)
                    done()

    it 'verify that account 0 cannot write file_use notification to project 1; but as admin can.', (done) ->
        obj =
            project_id  : projects[1]
            path        : 'bar'
            last_edited : new Date()
        async.series([
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      : {file_use : obj}
                    cb         : (err) ->
                        expect(err).toEqual('user must be an admin')
                        cb()
            (cb) ->
                # now make account 0 an admin
                db.make_user_admin
                    account_id : accounts[0]
                    cb         : cb
            (cb) ->
                # verify user 0 is admin
                db.is_admin
                    account_id : accounts[0]
                    cb         : (err, is_admin) ->
                        expect(is_admin).toEqual(true)
                        cb(err)
            (cb) ->
                # ... but 1 is not
                db.is_admin
                    account_id : accounts[1]
                    cb         : (err, is_admin) ->
                        expect(is_admin).toEqual(false)
                        cb(err)
            (cb) ->
                # ... , and see that it can write to project not on
                db.user_query
                    account_id : accounts[0]
                    query      : {file_use : obj}
                    cb         : cb
        ], done)


describe 'test project_log table', ->
    before(setup)
    after(teardown)

    # Create two users and one project
    accounts = []
    projects = []
    it 'setup accounts and projects', (done) ->
        async.series([
            (cb) ->
                create_accounts 3, (err, x) -> accounts=x; cb()
            (cb) ->
                create_projects 3, accounts[0], (err, x) -> projects.push(x...); cb(err)
        ], done)

    it 'writes a project_log entry via a user query (and gets it back)', (done) ->
        obj =
            id         : misc.uuid()
            project_id : projects[0]
            time       : new Date()
            event      : {test:'thing'}
        async.series([
            (cb) ->
                db.user_query(account_id : accounts[0], query:{project_log:obj}, cb:cb)
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      :
                        project_log :
                            project_id  : projects[0]
                            time        : null
                            event       : null
                            id          : null
                    cb         : (err, result) ->
                        expect(result).toEqual(project_log:obj)
                        cb(err)
        ], done)

    it 'write two project_log entries with the same timestamp (but different ids)', (done) ->
        t = new Date()
        obj0 =
            id         : misc.uuid()
            project_id : projects[0]
            time       : t
            event      : {test:'stuff', a:['x', 'y']}
        obj1 =
            id         : misc.uuid()
            project_id : projects[0]
            time       : t  # SAME TIME
            event      : {test:'other stuff'}
        async.series([
            (cb) ->
                db.user_query(account_id : accounts[0], query:[{project_log:obj0}, {project_log:obj1}], cb:cb)
            (cb) ->
                # get everything with the given time t
                db.user_query
                    account_id : accounts[0]
                    query      :
                        project_log : [{project_id:projects[0], time:t, id:null}]
                    cb         : (err, result) ->
                        if err
                            cb(err)
                        else
                            expect(result.project_log.length).toEqual(2)
                            expect(result.project_log[0].time).toEqual(t)
                            expect(result.project_log[1].time).toEqual(t)
                            cb()
        ], done)

    it "confirm other user can't read log of first project", (done) ->
        db.user_query
            account_id : accounts[1]
            query      :
                project_log : [{project_id:projects[0], time:null, id:null}]
            cb         : (err, result) ->
                expect(err).toEqual('you do not have read access to this project')
                done()

    it 'make third user an admin and verify can read log of first project', (done) ->
        async.series([
            (cb) ->
                # now make account 2 an admin
                db.make_user_admin
                    account_id : accounts[2]
                    cb         : cb
            (cb) ->
                db.user_query
                    account_id : accounts[2]
                    query      : project_log : [{project_id:projects[0], time:null, id:null}]
                    cb         : (err, result) ->
                        if err
                            cb(err)
                        else
                            expect(result.project_log.length).toEqual(3)
                            cb()
        ], done)

    it "add other user, and confirm other user now *CAN* read log", (done) ->
        async.series([
            (cb) ->
                db.add_user_to_project
                    project_id : projects[0]
                    account_id : accounts[1]
                    cb         : cb
            (cb) ->
                db.user_query
                    account_id : accounts[1]
                    query      : project_log : [{project_id:projects[0], time:null, id:null}]
                    cb         : (err, result) ->
                        expect(result.project_log.length).toEqual(3)
                        cb(err)
        ], done)

    it "confirm other project doesn't have any log entries (testing that reads are by project)", (done) ->
        db.user_query
            account_id : accounts[0]
            query      :
                project_log : [{project_id:projects[1], time:null, id:null}]
            cb         : (err, result) ->
                expect(result.project_log.length).toEqual(0)
                done(err)

    it "add three entries to second project log and verify that they come back in the right order", (done) ->
        f = (t, id, cb) ->
            obj =
                id         : id
                project_id : projects[2]
                time       : t
                event      : {test:'0'}
            db.user_query(account_id:accounts[0], query:{project_log:obj}, cb:cb)
        ids = (misc.uuid() for _ in [0,1,2])
        async.series([
            (cb) -> f(misc.minutes_ago(5), ids[0], cb)
            (cb) -> f(misc.minutes_ago(1), ids[2], cb)
            (cb) -> f(misc.minutes_ago(3), ids[1], cb)
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      :
                        project_log : [{project_id:projects[2], time:null, id:null}]
                    cb         : (err, result) ->
                        if err
                            cb(err)
                        else
                            expect(result.project_log.length).toEqual(3)
                            expect(result.project_log[0].id).toEqual(ids[2])
                            expect(result.project_log[1].id).toEqual(ids[1])
                            expect(result.project_log[2].id).toEqual(ids[0])
                            cb()
        ], done)


describe 'nonexistent tables', ->
    before(setup)
    after(teardown)

    account_id = undefined
    it 'creates account', (done) ->
        create_accounts 1, (err, accounts) ->
            account_id = accounts?[0]; done(err)

    it 'write to non-existent table', (done) ->
        db.user_query
            account_id : account_id
            query      : {nonexistent_table: {foo:'bar'}}
            cb         : (err) ->
                expect(err).toEqual("table 'nonexistent_table' does not exist")
                done(not err)

    it 'read from non-existent table (single thing)', (done) ->
        db.user_query
            account_id : account_id
            query      : {nonexistent_table: {foo:null}}
            cb         : (err) ->
                expect(err).toEqual("get queries not allowed for table 'nonexistent_table'")
                done(not err)

    it 'read from non-existent table (multiple)', (done) ->
        db.user_query
            account_id : account_id
            query      : {nonexistent_table: [{foo:null}]}
            cb         : (err) ->
                expect(err).toEqual("get queries not allowed for table 'nonexistent_table'")
                done(not err)


describe 'test the get_account server query', ->
    before(setup)
    after(teardown)

    accounts = undefined
    it 'create two accounts', (done) ->
        create_accounts 2, (err, x) ->
            accounts = x; done(err)

    it 'calls get_account with some columns for first account', (done) ->
        db.get_account
            account_id : accounts[0]
            columns    : ['account_id', 'email_address', 'password_is_set']
            cb         : (err, x) ->
                expect(x).toEqual({account_id: accounts[0], email_address: "sage+0@sagemath.com", password_is_set:false})
                done(err)

    hash = 'sha512$4477684995985fb6bd2c9020d3f35c69$1000$41cc46a70ba52ade010b56ccbdca942af9271b256763479eb2d8d8283d1023e43745f4cc6fe7a970ce1cf28df6c9edb47d315d92b837a0c7db4fafbc38ed099a'

    it 'sets the password hash', (done) ->
        db.change_password
            account_id : accounts[0]
            password_hash : hash
            cb : done

    it 'checks that the password is now set', (done) ->
        columns = ['password_is_set']
        db.get_account
            account_id : accounts[0]
            columns    : columns
            cb         : (err, x) ->
                expect(x).toEqual({password_is_set:true})
                expect(columns).toEqual(['password_is_set'])  # ensure no mutation
                done(err)

    it 'calls get_account with some columns again', (done) ->
        db.get_account
            account_id : accounts[0]
            columns    : ['account_id', 'email_address', 'password_hash']
            cb         : (err, x) ->
                expect(x).toEqual({account_id: accounts[0], email_address: "sage+0@sagemath.com", password_hash:hash})
                done(err)

    it 'calls get_account with some columns yet again', (done) ->
        db.get_account
            account_id : accounts[0]
            columns    : ['account_id', 'email_address', 'password_hash', 'password_is_set']
            cb         : (err, x) ->
                expect(x).toEqual({account_id: accounts[0], email_address: "sage+0@sagemath.com", password_hash:hash, password_is_set:true})
                done(err)

    it 'calls get_account on the other account', (done) ->
        db.get_account
            account_id : accounts[1]
            columns    : ['account_id', 'email_address', 'password_hash', 'password_is_set']
            cb         : (err, x) ->
                expect(x).toEqual({account_id: accounts[1], email_address: "sage+1@sagemath.com", password_is_set:false})
                done(err)

    it 'changes the email address of the first account', (done) ->
        db.change_email_address
            account_id    : accounts[0]
            email_address : 'awesome@sagemath.com'
            cb            : done

    it 'confirms the change', (done) ->
        db.get_account
            account_id : accounts[0]
            columns    : ['email_address']
            cb         : (err, x) ->
                expect(x).toEqual({email_address: "awesome@sagemath.com"})
                done(err)


describe 'test of automatic first and last name truncation', ->
    before(setup)
    after(teardown)
    account_id = undefined
    it 'creates an account', (done) ->
        db.create_account(first_name:"Sage", last_name:"Math", created_by:"1.2.3.4",\
                          email_address:"sage@example.com", password_hash:"blah", cb:(err, x) -> account_id=x; done(err))

    long_first = (Math.random().toString(36) for _ in [0..15]).join('')
    long_last  = (Math.random().toString(36) for _ in [0..15]).join('')
    it 'sets first_name and last_name to long character strings', (done) ->
        db.user_query
            account_id : account_id
            query      : {accounts:{account_id:account_id, first_name:long_first, last_name:long_last}}
            cb         : done

    # NOTE: this is entirely to prevent malicious/idiotic clients.
    it 'reads back and sees they were (silently!) truncated to 254 characters', (done) ->
        db.user_query
            account_id : account_id
            query      : {accounts:{account_id:account_id, first_name:null, last_name:null}}
            cb         : (err, x) ->
                expect(x?.accounts).toEqual({account_id:account_id, first_name:long_first.slice(0,254), last_name:long_last.slice(0,254)})
                done(err)
