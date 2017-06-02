###
Testing API functions relating to text files
###

api   = require('./apitest')
{setup, teardown} = api
misc = require('smc-util/misc')
expect = require('expect')

describe 'testing text file operations -- ', ->
    before(setup)
    after(teardown)

    project_id = undefined

    it "creates target project", (done) ->
        api.call
            event : 'create_project'
            body  :
                title       : 'TFTEST'
                description : 'Testing text file operations'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_created')
                project_id = resp.project_id
                done(err)

    it "creates a text file", (done) ->
        @timeout 10000
        api.call
            event : 'write_text_file_to_project'
            body  :
                project_id: project_id
                content   : 'hello\nworld'
                path      : 'A1/h1.txt'
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('file_written_to_project')
                done(err)
