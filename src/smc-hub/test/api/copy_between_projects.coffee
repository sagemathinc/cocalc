#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Testing API functions that copy from one project to another
###

api   = require('./apitest')
{setup, teardown} = api
misc = require('smc-util/misc')
expect = require('expect')

describe 'testing copy between projects -- ', ->
    before(setup)
    after(teardown)

    project_id  = undefined
    project_id2 = undefined

    path1 = 'doc1.txt'
    path2 = 'B2/doc2.txt'
    path3 = 'FOO/abc.txt'

    content  = 'TEST CONTENT'
    src_dir  = 'TEST_DIR'

    it "creates source project", (done) ->
        api.call
            event : 'create_project'
            body  :
                title       : 'TEST1'
                description : 'Source Project'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_created')
                project_id = resp.project_id
                done(err)

    it "creates target project", (done) ->
        api.call
            event : 'create_project'
            body  :
                title       : 'TEST2'
                description : 'Target Project'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_created')
                project_id2 = resp.project_id
                done(err)


    it "creates file in source project", (done) ->
        @timeout(25000)
        api.call
            event : 'write_text_file_to_project'
            body  :
                project_id: project_id
                content   : content
                path      : path1
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('file_written_to_project')
                done(err)

    it "copies file to a private target", (done) ->
        @timeout(25000)
        api.call
            event : 'copy_path_between_projects'
            body  :
                src_project_id   : project_id
                src_path         : path1
                target_project_id: project_id2
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('success')
                done(err)

    it "reads target file 1", (done) ->
        @timeout(25000)
        api.call
            event : 'read_text_file_from_project'
            body  :
                project_id: project_id2
                path      : path1
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('text_file_read_from_project')
                expect(resp?.content).toBe(content)
                done(err)

    it "creates folder with text file in source project", (done) ->
        @timeout(25000)
        api.call
            event : 'write_text_file_to_project'
            body  :
                project_id: project_id
                content   : content
                path      : path2
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('file_written_to_project')
                done(err)

    it "copies src with directory and file", (done) ->
        @timeout(25000)
        api.call
            event : 'copy_path_between_projects'
            body  :
                src_project_id   : project_id
                src_path         : path2
                target_project_id: project_id2
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('success')
                done(err)

    it "reads target file 2", (done) ->
        @timeout(25000)
        api.call
            event : 'read_text_file_from_project'
            body  :
                project_id: project_id2
                path      : path2
            cb    : (err, resp) ->
                expect(resp?.event).toBe('text_file_read_from_project')
                expect(resp?.content).toBe(content)
                done(err)

    it "copies file to directory", (done) ->
        # src:'B2/doc2.txt' tgt:'DIR3/ result:'DIR3/doc2.txt'
        @timeout(25000)
        api.call
            event : 'copy_path_between_projects'
            body  :
                src_project_id   : project_id
                src_path         : path2
                target_project_id: project_id2
                target_path      : 'DIR3/'
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('success')
                done(err)

    it "reads target file 3", (done) ->
        @timeout(25000)
        api.call
            event : 'read_text_file_from_project'
            body  :
                project_id: project_id2
                path      : 'DIR3/doc2.txt'
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('text_file_read_from_project')
                expect(resp?.content).toBe(content)
                done(err)

    it "copies directory to directory", (done) ->
        # src:'B2/' tgt:'DIR4/ result:'DIR4/doc2.txt'
        @timeout(25000)
        api.call
            event : 'copy_path_between_projects'
            body  :
                src_project_id   : project_id
                src_path         : 'B2/'
                target_project_id: project_id2
                target_path      : 'DIR4/'
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('success')
                done(err)

    it "reads target file 4", (done) ->
        @timeout(25000)
        api.call
            event : 'read_text_file_from_project'
            body  :
                project_id: project_id2
                path      : 'DIR4/doc2.txt'
            cb    : (err, resp) ->
                expect(err).toEqual(null)
                expect(resp?.event).toBe('text_file_read_from_project')
                expect(resp?.content).toBe(content)
                done(err)

    it "uses API query to make a file public", (done) ->
        api.call
            event : 'query'
            body  :
                query  : {public_paths:{project_id:project_id, path:path2, description:'Doc #2'}}
            cb : (err, resp) ->
                expect(resp?.event).toBe('query')
                done(err)

    it "copies a public file to different target dir", (done) ->
        # src:'B2/doc2.txt'(public) tgt:'FOO/abc.txt'
        @timeout(25000)
        api.call
            event : 'copy_public_path_between_projects'
            body  :
                src_project_id   : project_id
                src_path         : path2
                target_project_id: project_id2
                target_path      : path3
            cb    : (err, resp) ->
                expect(resp?.event).toBe('success')
                done(err)

    it "reads copied public file", (done) ->
        @timeout(25000)
        api.call
            event : 'read_text_file_from_project'
            body  :
                project_id: project_id2
                path      : path3
            cb    : (err, resp) ->
                expect(resp?.event).toBe('text_file_read_from_project')
                expect(resp?.content).toBe(content)
                done(err)
