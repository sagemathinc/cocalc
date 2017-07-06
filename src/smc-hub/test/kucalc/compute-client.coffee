###
Simplest possible interesting test.
###


init     = require('./init')
db       = undefined
setup    = (cb) -> (init.setup (err) -> db=init.db(); cb(err))
teardown = init.teardown

async  = require('async')
expect = require('expect')

misc = require('smc-util/misc')

wait = (project, cb) ->
    project.once 'change', ->
        cb?()
    (err) ->
        if err
            cb(err)
            cb = undefined

describe 'creating compute client -- ', ->
    @timeout(5000)
    before(setup)
    after(teardown)

    it 'creates compute client', ->
        client = init.compute_client()

    it 'but with no database', ->
        try
            require('../../kucalc/compute-client').compute_client()
        catch
            # success -- there should be an exception
            return
        throw Error("there should be an exception")

describe 'test basic foundations of project client -- ', ->
    @timeout(5000)
    before(setup)
    after(teardown)

    client = undefined
    it 'creates compute client', ->
        client = init.compute_client()

    account_id = undefined
    it 'creates an account', (done) ->
        db.create_account(first_name:"Sage", last_name:"Math", created_by:"1.2.3.4",\
                          email_address:"sage@example.com", \
                          password_hash:"blah", cb:(err, x) -> account_id=x; done(err))

    project_id = undefined
    it 'creates a project', (done) ->
        db.create_project(account_id:account_id, title:"Test project", description:"The description",\
                    cb:(err, x) -> project_id=x; done(err))

    project = undefined
    it 'creates compute client project object', (done) ->
        client.project(project_id: project_id, cb: (err, x) ->
            project = x; done(err))

    it 'confirm the host is correct', ->
        expect(project.host).toBe("project-#{project_id}")

    it 'confirms nothing is set yet in the synctable', ->
        expect(project.get().toJS()).toEqual({project_id:project_id})

    it 'gets unitialized state', (done) ->
        project.state
            cb : (err, state) ->
                expect(state).toBe(undefined)
                done(err)

    state = undefined
    it 'sets the state', (done) ->
        state = {state:'closed', time:new Date()}
        project._query
            jsonb_set : {state : state}
            cb        : wait(project, done)

    it 'confirms state is set as required synctable', (done) ->
        project.state
            cb : (err, state) ->
                expect(state).toEqual(state)
                done(err)

    it 'get the default status', (done) ->
        project.status
            cb : (err, status) ->
                expect(status).toEqual({ 'console_server.port': 6003, 'local_hub.port': 6000, 'raw.port': 6001, 'sage_server.port': 6002 })
                done(err)

    it 'add some info to the status', (done) ->
        project._query
            jsonb_merge : {status:{secret_token:'top-secret'}}
            cb : wait(project, done)

    it 'verify the secret is in the status', (done) ->
        project.status
            cb : (err, status) ->
                expect(status.secret_token).toBe('top-secret')
                done(err)

    it 'close the project client and verifies that host is no longer defined ', ->
        project.close()
        expect(project.host).toBe(undefined)




describe 'test the lifecyle of project client (mocking the manager) -- ', ->
    @timeout(5000)
    before(setup)
    after(teardown)

    client = account_id = project_id = project = undefined
    it 'creates client, account and project', (done) ->
        client = init.compute_client()
        async.series([
            (cb) -> db.create_account(first_name:"Sage", last_name:"Math", created_by:"1.2.3.4",\
                                  email_address:"sage@example.com", \
                                  password_hash:"blah", cb:(err, x) -> account_id=x; cb(err))
            (cb) -> db.create_project(account_id:account_id, title:"Test project", description:"The description",\
                            cb:(err, x) -> project_id=x; cb(err))
            (cb) -> client.project(project_id: project_id, cb: (err, x) ->
                    project = x; cb(err))
        ], done)

    it 'opens the project', (done) ->
        # start project opening
        project.open
            cb : (err) ->
                done(err)
        # all that did was change the db, which we confirm now
        project.once 'change', ->
            expect(project.getIn(['action_request','action'])).toBe('open')
            # Now set the state to opened; this is what the project manager will do....
            project._query
                jsonb_merge : {state : {state:'opened', time:new Date()}}
                cb          : (err) ->
                    expect(!!err).toBe(false)
                    # this will trigger the callback of project.open above
