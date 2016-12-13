###
TESTING of user queries specifically involving changefeeds - part 2 -- projects, ....?

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

describe 'very basic test of projects table', ->
    before(setup)
    after(teardown)

    it 'create account, project feed, a project, and see it appear', (done) ->
        changefeed_id = misc.uuid()
        accounts = undefined
        projects = []
        async.series([
            (cb) ->
                create_accounts 1, (err, x) -> accounts=x; cb(err)
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      : {projects:[{project_id:null, title:null, users:null}]}
                    changes    : changefeed_id
                    cb         : changefeed_series([
                        (x, cb) ->
                            expect(x.projects.length).toEqual(0)
                            create_projects 1, accounts[0], (err, v) ->
                                projects.push(v[0])
                                cb(err)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[0], title: 'Project 0', users:{"#{accounts[0]}":{group:"owner"}} } })

                            # Test removing user from the project
                            db.remove_user_from_project(account_id:accounts[0], project_id:projects[0], cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'update', new_val: { project_id: projects[0], title: 'Project 0', users: {} } })
                            cb()
                        (x, cb) ->
                            expect(x).toEqual({ action: 'delete', old_val: { project_id: projects[0] } })

                            # Test adding user back to the project
                            db.add_user_to_project(account_id:accounts[0], project_id:projects[0], cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[0], title: 'Project 0', users:{"#{accounts[0]}":{group:"collaborator"}} } })

                            # create another project
                            create_projects 1, accounts[0], (err, v) ->
                                projects.push(v[0])
                                cb(err)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[1], title: 'Project 0', users:{"#{accounts[0]}":{group:"owner"}} } })
                            cb()
                            # Test actually deleting project completely from database
                            db._query
                                query : "DELETE FROM projects"
                                where : {"project_id = $::UUID":projects[1]}
                                cb    : cb
                        (x, cb) ->
                            expect(x).toEqual({ action: 'delete', old_val: { project_id: projects[1] } })
                            db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({action:'close'})
                            cb()
                    ], cb)
        ], done)

describe 'create multiple projects with multiple collaborators', ->
    before(setup)
    after(teardown)

    it 'create 3 accounts and several projects, and see them appear in one projects feed properly', (done) ->
        accounts = undefined
        projects = []
        changefeed_id = misc.uuid()
        async.series([
            (cb) ->
                create_accounts 3, (err, x) -> accounts=x; cb(err)
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      : {projects:[{project_id:null, users:null}]}
                    changes    : changefeed_id
                    cb         : changefeed_series([
                        (x, cb) ->
                            expect(x.projects.length).toEqual(0)
                            create_projects 1, accounts[0], (err, v) ->
                                projects.push(v[0])
                                cb(err)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[0], users:{"#{accounts[0]}":{group:"owner"}} } })
                            create_projects 1, accounts[0], (err, v) ->
                                projects.push(v[0])
                                cb(err)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[1], users:{"#{accounts[0]}":{group:"owner"}} } })

                            # create a project that will get ignored by the feed...
                            create_projects 1, accounts[1], (err, v) ->
                                if err
                                    cb(err); return
                                projects.push(v[0])
                                # ... until we add the first user to it, in which case....
                                db.add_user_to_project(project_id:v[0], account_id:accounts[0], cb:cb)
                        (x, cb) ->
                            # ... it appears!
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[2], users:{"#{accounts[0]}":{group:"collaborator"}, "#{accounts[1]}":{group:"owner"}} } })

                            # Now add another collaborator
                            db.add_user_to_project(project_id:projects[2], account_id:accounts[2], cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'update', new_val: { project_id: projects[2], users:{"#{accounts[0]}":{group:"collaborator"}, "#{accounts[1]}":{group:"owner"}, "#{accounts[2]}":{group:"collaborator"}} } })

                            # Now take first user back off
                            db.remove_user_from_project(project_id:projects[2], account_id:accounts[0], cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'update', new_val: { project_id: projects[2], users:{"#{accounts[1]}":{group:"owner"}, "#{accounts[2]}":{group:"collaborator"}} } })
                            cb()
                        (x, cb) ->
                            expect(x).toEqual({ action: 'delete', old_val: { project_id: projects[2] }})

                            db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({action:'close'})
                            cb()
                    ], cb)
            ], done)

describe 'changefeed on a single project', ->
    before(setup)
    after(teardown)

    it 'make 2 projects, feed on single, remove and add user', (done) ->
        changefeed_id = misc.uuid()
        accounts = projects = undefined
        async.series([
            (cb) ->
                create_accounts 1, (err, x) -> accounts=x; cb(err)
            (cb) ->
                # make 2 projects; one will be comletely ignored
                create_projects 2, accounts[0], (err, v) ->
                    projects = v
                    cb(err)
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      : {projects:[{project_id:projects[0], description:null}]}
                    changes    : changefeed_id
                    cb         : changefeed_series([
                        (x, cb) ->
                            expect(x.projects.length).toEqual(1)

                            db.remove_user_from_project(project_id:projects[0], account_id:accounts[0], cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'delete', old_val: { project_id: projects[0]} })

                            db.add_user_to_project(project_id:projects[0], account_id:accounts[0], cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[0], description: "Description 0"} })
                            db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({action:'close'})
                            cb()
                    ], cb)
        ], done)

describe 'changefeed testing all projects fields', ->
    before(setup)
    after(teardown)

    it 'make 2 projects, feed, and edit all fields', (done) ->
        changefeed_id = misc.uuid()
        accounts = projects = undefined
        obj0 = undefined
        last_edited = undefined
        user_query = (opts) ->
            opts.account_id = accounts[0]
            db.user_query(opts)
        async.series([
            (cb) ->
                create_accounts 1, (err, x) -> accounts=x; cb(err)
            (cb) ->
                # make 2 projects
                create_projects 2, accounts[0], (err, v) ->
                    projects = v
                    cb(err)
            (cb) ->
                user_query
                    query  : {projects:[{ project_id: null, title: null, description: null, users: null, invite: null, invite_requests:null, deleted: null, host: null, settings: null, status: null, state: null, last_edited: null, last_active: null, action_request: null, course: null}]}
                    changes: changefeed_id
                    cb     : changefeed_series([
                        (x, cb) ->
                            expect(x.projects.length).toEqual(2)
                            for p in x.projects
                                if p.project_id == projects[0]
                                    obj0 = p

                            user_query
                                query : {projects:{project_id:projects[0], title:"Foo", description:"bar"}}
                                cb    : cb
                        (x, cb) ->
                            obj0.title = 'Foo'
                            obj0.description = 'bar'
                            expect(x).toEqual( { action: 'update', new_val: obj0 })

                            user_query
                                query : {projects:{project_id:projects[0], deleted:true}}
                                cb    : cb
                        (x, cb) ->
                            obj0.deleted = true
                            expect(x).toEqual( { action: 'update', new_val: obj0 })

                            obj0.action_request = {action:'test', started:new Date()}
                            user_query
                                query : {projects:{project_id:projects[0], action_request:obj0.action_request}}
                                cb    : cb
                        (x, cb) ->
                            expect(x).toEqual( { action: 'update', new_val:obj0 })

                            obj0.last_edited = new Date()
                            db._query
                                query : "UPDATE projects"
                                set   : {last_edited : obj0.last_edited}
                                where : {project_id : projects[0]}
                                cb    : cb
                        (x, cb) ->
                            expect(x).toEqual( { action: 'update', new_val:obj0 })

                            set =
                                invite          : {a:'map'}
                                invite_requests : {b:'map2'}
                                host            : {host:'compute0-us'}
                                status          : {c:'map3'}
                                state           : {d:'map4'}
                                last_active     : {"#{accounts[0]}":new Date()}
                                course          : {project_id:obj0.project_id}
                            misc.merge(obj0, set)
                            db._query
                                query : "UPDATE projects"
                                set   : set
                                where : {project_id : projects[0]}
                                cb    : cb
                        (x, cb) ->
                            expect(x).toEqual( { action: 'update', new_val:obj0 })

                            db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({action:'close'})
                            cb()
                ], cb)
        ], done)

describe 'testing a changefeed from a project (instead of account)', ->
    before(setup)
    after(teardown)

    it 'makes a projects, has project get a feed and see changes', (done) ->
        changefeed_id = misc.uuid()
        accounts = projects = obj = undefined
        async.series([
            (cb) ->
                create_accounts 1, (err, x) -> accounts=x; cb(err)
            (cb) ->
                create_projects 1, accounts[0], ((err, v) -> projects = v; cb(err))
            (cb) ->
                db.user_query
                    project_id : projects[0]
                    query      : {projects:[{project_id:projects[0], title:null, description:null}]}
                    changes    : changefeed_id
                    cb         : changefeed_series([
                        (x, cb) ->
                            obj = { description: 'Description 0', project_id: projects[0], title: 'Project 0' }
                            expect(x.projects).toEqual([obj])

                            obj.title = 'Title'; obj.description = 'Description'
                            db.user_query
                                project_id : projects[0]
                                query      : {projects:obj}
                                cb         : cb
                        (x, cb) ->
                            expect(x).toEqual({action:'update', new_val:obj})

                            db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({action:'close'})

                            cb()
                    ], cb)
        ], done)

describe 'test changefeed admin-only access to project', ->
    before(setup)
    after(teardown)

    accounts = project_id = undefined

    it 'set things up', (done) ->
        async.series([
            (cb) ->
                create_accounts 3, (err, x) -> accounts=x; cb(err)
            (cb) ->
                db.make_user_admin(account_id: accounts[0], cb:cb)
            (cb) ->
                create_projects 1, accounts[2], ((err, v) -> project_id = v[0]; cb(err))
        ], done)

    it 'tests writing to project as admin user', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {projects:{project_id:project_id, title:"Better Title"}}
            cb         : done

    it 'tests writing to project_admin as admin user', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {projects_admin:{project_id:project_id, title:"Better Title"}}
            cb         : (err) ->
                expect(err).toEqual("user set queries not allowed for table 'projects_admin'")
                done()

    it 'tests project title changed properly (so reading as admin)', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {projects:{project_id:project_id, title:null}}
            cb         : (err, x) ->
                expect(x).toEqual(projects:{project_id:project_id, title:"Better Title"})
                done(err)

    it 'tests writing to project as non-collab', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {projects:{project_id:project_id, title:"Even Better Title"}}
            cb         : (err) ->
                expect(err).toEqual('user must be an admin')
                done()

    it 'tests reading from project as non-collab', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {projects:{project_id:project_id, title:null}}
            cb         : (err) ->
                expect(err).toEqual('you do not have read access to this project')
                done()

    it 'tests writing to project as anonymous', (done) ->
        db.user_query
            query      : {projects:{project_id:project_id, title:null}}
            cb         : (err) ->
                expect(err).toEqual("anonymous get queries not allowed for table 'projects'")
                done()

    it 'tests admin changefeed on projects_admin table', (done) ->
        changefeed_id = misc.uuid()
        db.user_query
            account_id : accounts[0]  # our admin
            query      : {projects_admin:[{project_id:project_id, title:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x.projects_admin).toEqual([{ project_id: project_id, title: 'Better Title' }])

                    db.user_query
                        account_id : accounts[0]
                        query      : {projects:{project_id:project_id, title:"WAY Better Title"}}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:{project_id:project_id, title:"WAY Better Title"}})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})

                    cb()
                ], done)

    it 'tests that user must be an admin to read from (or get changefeed on) projects_admin table', (done) ->
        changefeed_id = misc.uuid()
        db.user_query
            account_id : accounts[1]  # NOT admin
            query      : {projects_admin:[{project_id:project_id, title:null}]}
            changes    : changefeed_id
            cb         : (err) ->
                expect(err).toEqual('user must be an admin')
                done()


