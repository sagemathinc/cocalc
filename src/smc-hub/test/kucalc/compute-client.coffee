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

    it 'get address of project', (done) ->
        project.address
            cb : (err, address) ->
                expect(err).toBe(undefined)
                expect(address).toEqual({ host: "project-#{project_id}", port: 6000, secret_token: 'top-secret' })
                done()

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
                x = project._action_request()
                expect((new Date() - x.finished) < 500).toBe(true)
                done(err)
        # all that did was change the db, which we confirm now
        project.once 'change', ->
            x = project._action_request()
            expect(x.action).toBe('open')
            expect((new Date() - x.started) < 500).toBe(true)
            expect(x.finished).toBe(undefined)
            # Now set the state to opened; this is what the project manager will do....
            project._query
                jsonb_merge :
                    state          : {state:'opened', time:new Date()}
                    action_request : {finished:new Date()}
                cb          : (err) ->
                    expect(!!err).toBe(false)
                    # this will trigger the callback of project.open above

    it 'start the project running', (done) ->
        project.start
            cb : (err) ->
                x = project._action_request()
                expect((new Date() - x.finished) < 500).toBe(true)
                done(err)
        project.once 'change', ->
            x = project._action_request()
            expect(x.action).toBe('start')
            expect((new Date() - x.started) < 500).toBe(true)
            expect(x.finished).toBe(undefined)
            project._query
                jsonb_merge :
                    state          : {state:'running', time:new Date(), error:undefined}
                    action_request : {finished:new Date()}
                cb          : (err) ->
                    expect(!!err).toBe(false)

    it 'stop the project', (done) ->
        project.stop
            cb : done
        project.once 'change', ->
            x = project._action_request()
            expect(x.action).toBe('stop')
            project._query
                jsonb_merge :
                    state          : {state:'opened', time:new Date(), error:undefined}
                    action_request : {finished:new Date()}
                cb          : (err) ->
                    expect(!!err).toBe(false)

    it 'start the project again', (done) ->
        project.start
            cb : done
        project.once 'change', ->
            project._query
                jsonb_merge :
                    state          : {state:'running', time:new Date(), error:undefined}
                    action_request : {finished:new Date()}
                cb          : (err) ->
                    expect(!!err).toBe(false)

    it 'restart the project', (done) ->
        project.restart
            cb : done
        # NOW mock --
        project.once 'change', ->
            # first stop it.
            project._query
                jsonb_merge :
                    state          : {state:'opened', time:new Date(), error:undefined}
                    action_request : {finished:new Date()}
                cb          : (err) ->
                    expect(!!err).toBe(false)
                    # then start it back up.
                    project.once 'change', ->
                        project._query
                            jsonb_merge :
                                state          : {state:'running', time:new Date(), error:undefined}
                                action_request : {finished:new Date()}
                            cb          : (err) ->
                                expect(!!err).toBe(false)

    it 'close the project (means moving it to longterm storage)', (done) ->
        project.ensure_closed
            cb : done
        project.once 'change', ->
            project._query
                jsonb_merge :
                    state          : {state:'closed', time:new Date(), error:undefined}
                    action_request : {finished:new Date()}
                cb          : (err) ->
                    expect(!!err).toBe(false)

    it 'move gives an error', (done) ->
        project.move
            cb : (err) ->
                expect(err).toBe("move makes no sense for Kubernetes")
                done()


    it 'close the project client (i.e., free up usage)', ->
        project.close()
        expect(project.synctable).toBe(undefined)








