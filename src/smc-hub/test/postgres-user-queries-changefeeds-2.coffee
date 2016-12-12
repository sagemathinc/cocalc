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
                            cb()
                    ], cb)
        ], done)



