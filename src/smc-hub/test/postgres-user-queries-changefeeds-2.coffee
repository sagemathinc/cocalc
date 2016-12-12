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
    #after(teardown)

    accounts = []
    projects = []
    it 'create account, project feed, a project, and see it appear', (done) ->
        changefeed_id = misc.uuid()
        async.series([
            (cb) ->
                create_accounts 1, (err, x) -> accounts=x; cb()
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
#
                            # Test actually deleting project completely from database
                            db._query
                                query : "DELETE FROM projects"
                                where : {"project_id = $::UUID":projects[1]}
                                cb    : cb
                        (x, cb) ->
                            expect(x).toEqual({ action: 'delete', old_val: { project_id: projects[1] } })
#
                            cb()
                    ], cb)
        ], done)


