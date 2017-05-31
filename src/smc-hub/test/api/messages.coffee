###
Test message and message2 definitions
###

messages = require('../../../smc-util/message.coffee')

expect = require('expect')


describe 'checking message definition for ping', ->
    it "checks existence of ping api message", ->
        expect(messages.api_messages.ping).toBe(true)

    it "checks nonexistence of xxping api message", ->
        expect(messages.api_messages.xxping?).toBe(false)

    it "gets definition for ping message", -> 
        expect(messages.ping({})).toEqual({'event':'ping'})

describe 'checking message2 features', ->
    it "checks ping documentation", ->
        expect(messages.documentation.ping.description).toInclude("curl -X POST")
    it "checks get_usernames documentation", ->
        expect(messages.documentation.get_usernames.description).toInclude("/api/v1/get_usernames")
    it "checks create_account documentation", ->
        expect(messages.documentation.create_account.description).toInclude("/api/v1/create_account")
    it "checks delete_account documentation", ->
        expect(messages.documentation.delete_account.description).toInclude("/api/v1/delete_account")
    it "checks create_project documentation", ->
        expect(messages.documentation.create_project.description).toInclude("/api/v1/create_project")
    it "checks query documentation", ->
        expect(messages.documentation.query.description).toInclude("/api/v1/query")
    it "checks change_email_address documentation", ->
        expect(messages.documentation.change_email_address.description).toInclude("set a new email address")
        expect(messages.documentation.change_email_address.fields.account_id).toMatch('required')
        expect(messages.documentation.change_email_address.fields.new_email_address).toMatch('required')
        
