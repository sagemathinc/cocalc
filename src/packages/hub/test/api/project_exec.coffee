#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Using API to run shell command in project
###

api   = require('./apitest')
{setup, teardown} = api

expect = require('expect')

describe 'runs shell command in a project', ->
    before(setup)
    after(teardown)

    project_id = undefined

    it "creates test project", (done) ->
        api.call
            event : 'create_project'
            body  :
                title       : 'ADVTEST'
                description : 'Testing advanced API'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_created')
                project_id = resp.project_id
                done(err)

    it "does shell built-in", (done) ->
        @timeout 30000
        api.call
            event : 'project_exec'
            body  :
                project_id: project_id
                command   : 'pwd'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_exec_output')
                re = new RegExp project_id+'$'
                expect(resp?.stdout?.trim()).toMatch(re)
                done(err)

    it "runs command in different working directory", (done) ->
        api.call
            event : 'project_exec'
            body  :
                project_id: project_id
                command   : 'pwd'
                path      : '/etc'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_exec_output')
                expect(resp?.stdout?.trim()).toBe('/etc')
                done(err)

    it "runs command with args option", (done) ->
        api.call
            event : 'project_exec'
            body  :
                project_id: project_id
                command   : 'echo'
                args      : ['hello', 'world']
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_exec_output')
                expect(resp?.stdout?.trim()).toBe('hello world')
                done(err)

    it "limits output to 5 characters", (done) ->
        api.call
            event : 'project_exec'
            body  :
                project_id: project_id
                command   : 'echo'
                args      : ['hello', 'world']
                max_output: 5
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_exec_output')
                expect(resp?.stdout?.trim()).toMatch('hello')
                expect(resp?.stdout?.trim()).toNotMatch('world')
                expect(resp?.stdout?.trim()).toMatch('truncated at 5 characters')
                done(err)    

    it "sets execution timeout", (done) ->
        @timeout 10000
        api.call
            event : 'project_exec'
            body  :
                project_id: project_id
                command   : 'sleep 5;echo done'
                timeout   : 2
            cb    : (err, resp) ->
                expect(resp?.event).toBe('error')
                expect(resp?.error).toMatch('killed command')
                done(err)  
