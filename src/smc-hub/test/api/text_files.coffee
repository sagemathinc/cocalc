#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

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
    content = 'hello\nworld'

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

    it "creates a text file in a project", (done) ->
        @timeout(20000)
        api.call
            event : 'write_text_file_to_project'
            body  :
                project_id: project_id
                content   : content
                path      : 'A1/doc1.txt'
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('file_written_to_project')
                done(err)

    it "reads a text file in a project", (done) ->
        @timeout(20000)
        api.call
            event : 'read_text_file_from_project'
            body  :
                project_id: project_id
                path      : 'A1/doc1.txt'
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('text_file_read_from_project')
                expect(resp?.content).toBe(content)
                done(err)
   
    it "uses API query to make a file public", (done) ->
        api.call
            event : 'query'
            body  :
                query  : {public_paths:{project_id:project_id, path:'A1/doc1.txt', description:'Handout #1'}}
            cb : (err, resp) ->
                expect(resp?.event).toBe('query')
                done(err)

    it "uses API query to make a folder public", (done) ->
        api.call
            event : 'query'
            body  :
                query  : {public_paths:{project_id:project_id, path:'A1/', description:'public folder A1'}}
            cb : (err, resp) ->
                expect(resp?.event).toBe('query')
                done(err)

