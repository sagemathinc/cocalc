###
TESTING of user queries specifically involving changefeeds - part 2 -- projects, ....?

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

describe 'very basic test of projects table', ->
    before(setup)
    after(teardown)

    it 'creates account, project feed, a project, and see it appear', (done) ->
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

    #log = console.log
    log = ->
    it 'create 3 accounts and several projects, and see them appear in one projects feed properly', (done) ->
        accounts = undefined
        projects = []
        changefeed_id = misc.uuid()
        async.series([
            (cb) ->
                create_accounts 3, (err, x) ->
                    accounts=x; cb(err)
            (cb) ->
                db.user_query
                    account_id : accounts[0]
                    query      : {projects:[{project_id:null, users:null}]}
                    changes    : changefeed_id
                    cb         : changefeed_series([
                        (x, cb) ->
                            expect(x.projects.length).toEqual(0)

                            log 'create first project'
                            create_projects 1, accounts[0], (err, v) ->
                                projects.push(v[0])
                                cb(err)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[0], users:{"#{accounts[0]}":{group:"owner"}} } })
                            log 'create another project'
                            create_projects 1, accounts[0], (err, v) ->
                                projects.push(v[0])
                                cb(err)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[1], users:{"#{accounts[0]}":{group:"owner"}} } })

                            log 'create a project that will get ignored by the feed...'
                            create_projects 1, accounts[1], (err, v) ->
                                if err
                                    cb(err); return
                                projects.push(v[0])
                                log '... until we add the first user to it, in which case....'
                                db.add_user_to_project(project_id:v[0], account_id:accounts[0], cb:cb)
                        (x, cb) ->
                            log '... it appears!'
                            expect(x).toEqual({ action: 'insert', new_val: { project_id: projects[2], users:{"#{accounts[0]}":{group:"collaborator"}, "#{accounts[1]}":{group:"owner"}} } })

                            log 'Now add another collaborator'
                            db.add_user_to_project(project_id:projects[2], account_id:accounts[2], cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'update', new_val: { project_id: projects[2], users:{"#{accounts[0]}":{group:"collaborator"}, "#{accounts[1]}":{group:"owner"}, "#{accounts[2]}":{group:"collaborator"}} } })

                            log 'Now take first user back off'
                            db.remove_user_from_project(project_id:projects[2], account_id:accounts[0], cb:cb)
                        (x, cb) ->
                            expect(x).toEqual({ action: 'update', new_val: { project_id: projects[2], users:{"#{accounts[1]}":{group:"owner"}, "#{accounts[2]}":{group:"collaborator"}} } })
                            cb()
                        (x, cb) ->
                            expect(x).toEqual({ action: 'delete', old_val: { project_id: projects[2] }})

                            log 'cancel feed'
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


describe 'test public_projects table -- ', ->
    before(setup)
    after(teardown)

    accounts = project_id = undefined

    it 'set things up', (done) ->
        async.series([
            (cb) ->
                create_accounts 2, (err, x) -> accounts=x; cb(err)
            (cb) ->
                create_projects 1, accounts[0], ((err, v) -> project_id = v[0]; cb(err))
        ], done)

    it 'get error if project is not public, i.e., has no public paths', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {public_projects:{project_id:project_id, title:null, description:null}}
            cb         : (err, x) ->
                expect(err).toEqual("project does not have any public paths")
                done()

    it 'adds a public paths', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {public_paths:{project_id:project_id, path:"foo.txt"}}
            cb         : done

    it 'tests owner can now get title and description of project', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {public_projects:{project_id:project_id, title:null, description:null}}
            cb         : (err, x) ->
                expect(x).toEqual(public_projects:{project_id:project_id, title:'Project 0', description:'Description 0'})
                done(err)

    it 'tests other user can get title and description of project', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {public_projects:{project_id:project_id, title:null, description:null}}
            cb         : (err, x) ->
                expect(x).toEqual(public_projects:{project_id:project_id, title:'Project 0', description:'Description 0'})
                done(err)

    it 'tests anonymous user can get title and description of project', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {public_projects:{project_id:project_id, title:null, description:null}}
            cb         : (err, x) ->
                expect(x).toEqual(public_projects:{project_id:project_id, title:'Project 0', description:'Description 0'})
                done(err)


    it 'tests that project_id must be specified', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {public_projects:{project_id:null, title:null, description:null}}
            cb         : (err, x) ->
                expect(err).toEqual('must specify project_id')
                done()

    tests = (account_id, done) ->
        id = misc.uuid()
        db.user_query
            account_id : account_id
            query      : {public_projects:[{project_id:project_id, title:null, description:null}]}
            changes    : id
            cb         : changefeed_series([
                    (x, cb) ->
                        expect(x).toEqual(public_projects:[{project_id:project_id, title:'Project 0', description:'Description 0'}])
                        db.user_query
                            account_id : accounts[0]
                            query      : {projects:{project_id:project_id, title:'TITLE', description:'DESC'}}
                            cb         : cb
                    (x, cb) ->
                        expect(x).toEqual({ action: 'update', new_val: { project_id: project_id, description: 'DESC', title: 'TITLE' } })
                        db.user_query
                            account_id : accounts[0]
                            query      : {projects:{project_id:project_id, title:'Project 0', description:'Description 0'}}
                            cb         : cb
                    (x, cb) ->
                        db.user_query_cancel_changefeed(id:id, cb:cb)
                    (x, cb) ->
                        expect(x).toEqual({action:'close'})
                        cb()
                ], done)

    it 'tests non-anonymous user on project can get a changefeed on public project', (done) ->
        tests(accounts[0], done)

    it 'tests non-anonymous NON-user on project can get a changefeed on public project', (done) ->
        tests(accounts[1], done)

    it 'tests anonymous can get a changefeed on public project', (done) ->
        tests(undefined, done)


describe 'test public_paths table -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = undefined

    it 'set things up', (done) ->
        async.series([
            (cb) ->
                create_accounts 3, (err, x) -> accounts=x; cb(err)
            (cb) ->
                db.make_user_admin(account_id: accounts[2], cb:cb)
            (cb) ->
                create_projects 2, accounts[0], ((err, v) -> projects = v; cb(err))
        ], done)

    it 'adds a public path to a project', (done) ->
        db.user_query
            account_id : accounts[0]
            query      : {public_paths:{project_id:projects[0], path:"foo.txt", description:"foo"}}
            cb         : done

    it 'adds a public path to a project not on as admin', (done) ->
        db.user_query
            account_id : accounts[2]
            query      : {public_paths:{project_id:projects[0], path:"bar.txt", description:'bar', disabled:true}}
            cb         : done

    it 'fail to add a public path to a project user is not on', (done) ->
        db.user_query
            account_id : accounts[1]
            query      : {public_paths:{project_id:projects[0], path:"bar2.txt"}}
            cb         : (err) ->
                expect(err).toEqual('user must be an admin')
                done()

    it 'fail to add a public path when not logged in', (done) ->
        db.user_query
            query      : {public_paths:{project_id:projects[0], path:'foo2.txt'}}
            cb         : (err) ->
                expect(err).toEqual('no anonymous set queries')
                done()

    read_public_paths = (done) ->
        f = (account_id, cb) ->
            db.user_query
                account_id : account_id
                query      : {public_paths:[{project_id:projects[0], path:null, description:null, disabled:null}]}
                options    : [{order_by:'path'}]
                cb         : (err, x) ->
                    expect(x).toEqual({ public_paths: [ { description: 'bar', disabled: true, \
                                path: 'bar.txt', project_id: projects[0] },  { description: 'foo', \
                                path: 'foo.txt', project_id: projects[0] } ] })
                    cb(err)
        async.map([accounts[0], accounts[1], undefined], f, done)

    it 'reads public paths as owner, non-collab, and anon', (done) ->
        read_public_paths(done)

    it 'verifies that changefeed required id field (the primary key)', (done) ->
        db.user_query
            query      : {public_paths:[{project_id:projects[0], path:null}]}
            changes    : misc.uuid()
            cb         : (err) =>
                expect(err).toEqual("changefeed MUST include primary key (='id') in query")
                done()

    changefeed_pub_paths = (done) ->
        f = (account_id, cb) ->
            changefeed_id = misc.uuid()
            v = undefined
            db.user_query
                account_id : account_id
                query      : {public_paths:[{id:null, project_id:projects[0], path:null, description:null, disabled:null}]}
                options    : [order_by:'path']
                changes    : changefeed_id
                cb         : changefeed_series([
                    (x, cb) ->
                        v = x.public_paths
                        expect(v.length).toEqual(2)
                        db.user_query
                            account_id : accounts[0]
                            query      : {public_paths:{project_id:projects[0], path:"foo.txt",\
                                                        description:"foo2", disabled:true}}
                            cb         : cb
                    (x, cb) ->
                        expect(x).toEqual({ action: 'update', new_val: {id:v[1].id, project_id:projects[0],  \
                                                                        path:"foo.txt", description:"foo2", disabled:true} })

                        db.user_query
                            account_id : accounts[0]
                            query      : {public_paths:{project_id:projects[0], path:"foo.txt",  \
                                                        description:"foo", disabled:false}}
                            cb         : cb
                    (x, cb) ->
                        expect(x).toEqual({ action: 'update', new_val: {id:v[1].id, project_id:projects[0], path:"foo.txt",  \
                                                                        description:"foo", disabled:false} })

                        db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                    (x, cb) ->
                        expect(x).toEqual({action:'close'})
                        cb()
                ], cb)
        async.mapSeries([accounts[0], accounts[1], undefined], f, done)

    it 'makes a changefeed and verifies modifying existing entry works', (done) ->
        changefeed_pub_paths(done)

describe 'test site_settings table -- ', ->
    before(setup)
    after(teardown)

    accounts = undefined

    it 'make an admin and non-admin account', (done) ->
        async.series([
            (cb) ->
                create_accounts 2, (err, x) -> accounts=x; cb(err)
            (cb) ->
                db.make_user_admin(account_id: accounts[0], cb:cb)
        ], done)

    it "check writing to wrong field gives an error", (done) ->
        db.user_query
            account_id : accounts[0]
            query : {site_settings:{site_name:'Hacker Site!'}}
            cb    : (err) ->
                expect(err).toEqual("error setting 'name' -- Error: setting name='undefined' not allowed")
                done()

    it "check writing to not allowed row", (done) ->
        db.user_query
            account_id : accounts[0]
            query : {site_settings:{name:'foobar', value:'stuff'}}
            cb    : (err) ->
                expect(err).toEqual("error setting 'name' -- Error: setting name='foobar' not allowed")
                done()

    it "check anon can't write", (done) ->
        db.user_query
            query : {site_settings:{name:'site_name', value:'Hacker Site!'}}
            cb    : (err) ->
                expect(err).toEqual("no anonymous set queries")
                done()

    it "check anon can't read", (done) ->
        db.user_query
            query : {site_settings:{name:'site_name', value:null}}
            cb    : (err) ->
                expect(err).toEqual("anonymous get queries not allowed for table 'site_settings'")
                done()

    it "check non-admin can't write", (done) ->
        db.user_query
            account_id : accounts[1]
            query : {site_settings:{name:'site_name', value:'Hacker Site!'}}
            cb    : (err) ->
                expect(err).toEqual("user must be an admin")
                done()

    it "check non-admin can't read", (done) ->
        db.user_query
            account_id : accounts[1]
            query : {site_settings:{name:'site_name', value:null}}
            cb    : (err) ->
                expect(err).toEqual("user must be an admin")
                done()

    it "check admin can write", (done) ->
        db.user_query
            account_id : accounts[0]
            query : {site_settings:{name:'site_name', value:'Hacker Site!'}}
            cb    : done

    it "check admin can read", (done) ->
        db.user_query
            account_id : accounts[0]
            query : {site_settings:{name:'site_name', value:null}}
            cb    : (err, x) ->
                expect(x).toEqual({ site_settings: { name: 'site_name', value: 'Hacker Site!' } } )
                done()

    it 'create admin changefeed and write some things to it', (done) ->
        id = misc.uuid()
        user_query = (query, cb) ->
            db.user_query(account_id:accounts[0], query:{site_settings:query}, cb:cb)
        db.user_query
            account_id : accounts[0]
            query      : {site_settings:[{name:null, value:null}]}
            changes    : id
            cb         : changefeed_series([
                    (x, cb) ->
                        expect(x).toEqual(site_settings:[{name:'site_name', value:'Hacker Site!'}])

                        user_query({name:'site_name', value:'CoCalc'}, cb)
                    (x, cb) ->
                        expect(x).toEqual({ action: 'update', new_val: {name:'site_name', value:'CoCalc'} })

                        user_query({name:'site_description', value:'The collaborative site'}, cb)
                    (x, cb) ->
                        expect(x).toEqual({ action: 'insert', new_val: {name:'site_description', value:'The collaborative site'} })

                        user_query({name:'terms_of_service', value:'Do nice things'}, cb)
                    (x, cb) ->
                        expect(x).toEqual({ action: 'insert', new_val: {name:'terms_of_service', value:'Do nice things'} })

                        user_query({name:'account_creation_email_instructions', value:'Create account'}, cb)
                    (x, cb) ->
                        expect(x).toEqual({ action: 'insert', new_val: {name:'account_creation_email_instructions', value:'Create account'} })
                        user_query({name:'help_email', value:'h@a.b.c'}, cb)
                    (x, cb) ->
                        expect(x).toEqual({ action: 'insert', new_val: {name:'help_email', value:'h@a.b.c'} })

                        user_query({name:'commercial', value:'yes'}, cb)
                    (x, cb) ->
                        expect(x).toEqual({ action: 'insert', new_val: {name:'commercial', value:'yes'} })

                        db.user_query_cancel_changefeed(id:id, cb:cb)
                    (x, cb) ->
                        expect(x).toEqual({action:'close'})
                        cb()
                ], done)


describe 'test stats changefeed: ', ->
    before(setup)
    after(teardown)

    obj = {id: null, time: null, accounts: null, accounts_created: null, \
           projects: null, projects_created: null, projects_edited: null, hub_servers:null}

    account_id = undefined
    it 'make an account', (done) ->
        async.series([
            (cb) ->
                create_accounts 1, (err, x) -> account_id=x[0]; cb(err)
        ], done)

    it 'query the stats table anonymously (get nothing, no error)', (done) ->
        db.user_query
            query : {stats:[obj]}
            cb    : (err, x) ->
                expect(x).toEqual({ stats: [] })
                done(err)

    it 'query the stats table as user (get nothing, no error)', (done) ->
        db.user_query
            account_id : account_id
            query      : {stats:[obj]}
            cb         : (err, x) ->
                expect(x).toEqual({ stats: [] })
                done(err)

    it 'insert some entries in the stats table', (done) ->
        db.get_stats(cb:done)

    it 'query the stats table as user and gets the one entry', (done) ->
        db.user_query
            account_id : account_id
            query      : {stats:[obj]}
            cb         : (err, x) ->
                expect(x).toEqual({ stats: [ { accounts: 1, accounts_created: { '1d': 1, '1h': 1, '30d': 1, '7d': 1 }, hub_servers: [], id:x.stats[0].id, projects: 0, projects_created: { '1d': 0, '1h': 0, '30d': 0, '7d': 0 }, projects_edited: { '1d': 0, '1h': 0, '30d': 0, '5min': 0, '7d': 0 }, time:x.stats[0].time } ] })
                done(err)

    it 'query the stats table as anon and gets the one entry', (done) ->
        db.user_query
            query      : {stats:[obj]}
            cb         : (err, x) ->
                expect(x).toEqual({ stats: [ { accounts: 1, accounts_created: { '1d': 1, '1h': 1, '30d': 1, '7d': 1 }, hub_servers: [], id:x.stats[0].id, projects: 0, projects_created: { '1d': 0, '1h': 0, '30d': 0, '7d': 0 }, projects_edited: { '1d': 0, '1h': 0, '30d': 0, '5min': 0, '7d': 0 }, time:x.stats[0].time } ] })
                done(err)

    it 'creates some more accounts and projects and add another stats entry', (done) ->
        async.series([
            (cb) ->
                create_accounts 100, 1, (err, x) -> account_id=x[0]; cb(err)
            (cb) ->
                create_projects 100, account_id, cb
            (cb) ->
                db.get_stats(cb:cb, ttl:-1)
            (cb) ->
                db.user_query
                    query      : {stats:[obj]}
                    cb         : (err, x) ->
                        expect(x.stats[0]).toEqual({ accounts: 101, accounts_created: { '1d': 101, '1h': 101, '30d': 101, '7d': 101 }, hub_servers: [], id:x.stats[0].id, projects: 100, projects_created: { '1d': 100, '1h': 100, '30d': 100, '7d': 100 }, projects_edited: { '1d': 100, '1h': 100, '30d': 100, '5min': 100, '7d': 100 }, time:x.stats[0].time })
                        cb(err)
        ], done)

    it 'create anonymous changefeed on stats and see new entry appear', (done) ->
        changefeed_id = misc.uuid()
        remove_id = undefined
        db.user_query
            query      : {stats:[obj]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x.stats.length).toEqual(2)
                    async.series([
                        (cb) ->
                            create_projects(10, account_id, cb)
                        (cb) ->
                            db.get_stats(ttl:0, cb:cb)
                    ], cb)
                (x, cb) ->
                    expect(x).toEqual({ action: 'insert', new_val: { accounts: 101, accounts_created: { '1d': 101, '1h': 101, '30d': 101, '7d': 101 }, hub_servers: [], id:x.new_val.id, projects: 110, projects_created: { '1d': 110, '1h': 110, '30d': 110, '7d': 110 }, projects_edited: { '1d': 110, '1h': 110, '30d': 110, '5min': 110, '7d': 110 }, time: x.new_val.time } })

                    db._query
                        query : "UPDATE stats"
                        set   : {projects:150}
                        where : {id:x.new_val.id}
                        cb    : cb

                (x, cb) ->
                    expect(x).toEqual({ action: 'update', new_val: { accounts: 101, accounts_created: { '1d': 101, '1h': 101, '30d': 101, '7d': 101 }, hub_servers: [], id:x.new_val.id, projects: 150, projects_created: { '1d': 110, '1h': 110, '30d': 110, '7d': 110 }, projects_edited: { '1d': 110, '1h': 110, '30d': 110, '5min': 110, '7d': 110 }, time: x.new_val.time } })

                    # remove something from the changefeed by editing its timestamp to be old
                    remove_id = x.new_val.id
                    db._query
                        query : "UPDATE stats"
                        set   : {time:misc.hours_ago(2)}
                        where : {id:remove_id}
                        cb    : cb
                (x, cb) ->
                    expect(x.action).toEqual('delete')
                    expect(x.old_val.id).toEqual(remove_id)
                    expect(x.new_val).toEqual(undefined)

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})

                    cb()
            ], done)


describe 'test system_notifications ', ->
    before(setup)
    after(teardown)

    obj = {id:null, time:null, text:null, priority:null, done:null}

    accounts= undefined
    it 'make two accounts', (done) ->
        async.series([
            (cb) ->
                create_accounts 2, (err, x) -> accounts=x; cb(err)
            (cb) ->
                db.make_user_admin(account_id: accounts[0], cb:cb)
        ], done)

    it 'reads empty table as admin, non-admin, and anon', (done) ->
        f = (account_id, cb) ->
            db.user_query
                account_id : account_id
                query      : {system_notifications: [obj]}
                cb         : (err, x) ->
                    expect(x).toEqual(system_notifications: [])
                    cb(err)
        async.map([accounts[0], accounts[1], undefined], f, done)

    obj0 = {id:misc.uuid(), time:new Date(), text:"watch out!", done:true}
    it 'tries to write as admin, non-admin and anon to system_notifications table', (done) ->
        f = (x, cb) ->
            db.user_query
                account_id : x.account_id
                query      : {system_notifications: obj0}
                cb         : (err, result) ->
                    expect(err).toEqual(x.err)
                    cb()
        async.map([{account_id:accounts[0]}, {account_id:accounts[1], err:'user must be an admin'}, {err:'no anonymous set queries'}], f, done)

    it 'reads non-empty table as admin, non-admin, and anon', (done) ->
        # fill in the defaults from the schema
        obj0.priority = 'low'
        f = (account_id, cb) ->
            db.user_query
                account_id : account_id
                query      : {system_notifications: [obj]}
                cb         : (err, x) ->
                    expect(x).toEqual(system_notifications: [obj0])
                    cb(err)
        async.map([accounts[0], accounts[1], undefined], f, done)


    it 'create changefeed, insert entry, and see it appear (as admin, non-admin, and anon)', (done) ->
        f = (account_id, cb) ->
            obj1 = {id:misc.uuid(), time:new Date(), text:'crazy alert!', priority:'medium', done:false}
            changefeed_id = misc.uuid()
            db.user_query
                account_id : account_id
                query      : {system_notifications: [obj]}
                changes    : changefeed_id
                cb         : changefeed_series([
                    (x, cb) ->
                        expect(x.system_notifications.length).toEqual(1)

                        db.user_query
                            account_id : accounts[0]  # as admin
                            query      : {system_notifications: [obj1]}
                            cb         : cb
                    (x, cb) ->
                        expect(x).toEqual( { action: 'insert', new_val: obj1 })

                        obj1.done = true
                        db.user_query
                            account_id : accounts[0]  # as admin
                            query      : {system_notifications: [obj1]}
                            cb         : cb
                    (x, cb) ->
                        expect(x).toEqual( { action: 'update', new_val: obj1 })

                        db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                    (x, cb) ->
                        expect(x).toEqual({action:'close'})
                        cb()
                ], done)

        async.mapSeries([accounts[0], accounts[1], undefined], f, done)


