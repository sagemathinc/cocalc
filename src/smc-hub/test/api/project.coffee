###
Using API to interact with a project
###

api   = require('./apitest')
{setup, teardown} = api

expect = require('expect')


describe 'testing api calls with one project -- ', ->
    before(setup)
    after(teardown)

    project_id = undefined

    it "creates a project", (done) ->
        api.call
            event : 'create_project'
            body  :
                title       : 'Project Title'
                description : 'Project Description'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_created')
                project_id = resp.project_id
                done(err)

    it "queries database directly to confirm project is there", (done) ->
        api.db.get_project
            project_id : project_id
            cb         : (err, project) ->
                expect(project?.users?[api.account_id]?).toBe(true)
                expect(project?.title).toBe('Project Title')
                done(err)

    it "uses query api to get info about project", (done) ->
        api.call
            event : 'query'
            body :
                query : {projects:{project_id:project_id, title:null, description:null}}
            cb : (err, resp) ->
                expect(resp?.query?.projects?.title).toBe('Project Title')
                done(err)

    it "uses the query api to change the project title", (done) ->
        api.call
            event : 'query'
            body :
                query : {projects:{project_id:project_id, title:'New Title'}}
            cb : done

    it "confirm title change", (done) ->
        api.call
            event : 'query'
            body :
                query : {projects:{project_id:project_id, title:null}}
            cb : (err, resp) ->
                expect(resp?.query?.projects?.title).toBe('New Title')
                done(err)


