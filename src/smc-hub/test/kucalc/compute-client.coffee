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

describe 'create project client -- ', ->
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









