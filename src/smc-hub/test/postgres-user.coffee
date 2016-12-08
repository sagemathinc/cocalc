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
                    cb:(err, x) => project_id=x; done(err))

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
                expect(projects).toEqual(projects:[])
                done(err)

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


describe 'testing file_use', ->
    before(setup)
    after(teardown)
    # Create two users and two projects
    accounts = []
    projects = []
    it 'setup accounts and projects', (done) ->
        async.series([
            (cb) =>
                create_accounts 2, (err, x) => accounts=x; cb()
            (cb) =>
                create_projects 1, accounts[0], (err, x) => projects.push(x...); cb(err)
            (cb) =>
                create_projects 1, accounts[1], (err, x) => projects.push(x...); cb(err)
        ], done)

    time0 = new Date()
    it 'writes a file_use entry via a user query (and gets it back)', (done) ->
        obj =
            project_id  : projects[0]
            path        : 'foo'
            users       : {"#{accounts[0]}":{edit:time0}}
            last_edited : time0
        async.series([
            (cb) =>
                db.user_query
                    account_id : accounts[0]
                    query      : {file_use : obj}
                    cb         : cb
            (cb) =>
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
            (cb) =>
                db.user_query
                    account_id : accounts[0]
                    query      : {file_use : obj}
                    cb         : cb
            (cb) =>
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
