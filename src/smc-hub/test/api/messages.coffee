#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Test message and message2 definitions
###

messages = require('../../../smc-util/message.js')

expect = require('expect')


describe 'checking message definition for ping', ->
    it "checks existence of ping api message", ->
        expect(messages.api_messages.ping).toBe(true)

    it "checks nonexistence of xxping api message", ->
        expect(messages.api_messages.xxping?).toBe(false)

    it "gets definition for ping message", ->
        expect(messages.ping({})).toEqual({'event':'ping'})

describe 'checking message2 documentation', ->
    it "ping", ->
        expect(messages.documentation.events.ping.description).toInclude("curl -X POST")
    it "get_usernames", ->
        expect(messages.documentation.events.get_usernames.description).toInclude("/api/v1/get_usernames")
    it "create_account", ->
        expect(messages.documentation.events.create_account.description).toInclude("/api/v1/create_account")
    it "delete_account", ->
        expect(messages.documentation.events.delete_account.description).toInclude("/api/v1/delete_account")
    it "create_project", ->
        expect(messages.documentation.events.create_project.description).toInclude("/api/v1/create_project")
    it "query", ->
        expect(messages.documentation.events.query.description).toInclude("/api/v1/query")
    it "change_email_address", ->
        expect(messages.documentation.events.change_email_address.description).toInclude("set a new email address")
        expect(messages.documentation.events.change_email_address.fields.account_id).toMatch('required')
        expect(messages.documentation.events.change_email_address.fields.new_email_address).toMatch('required')
    it "create_support_ticket", ->
        expect(messages.documentation.events.create_support_ticket.description).toInclude("/api/v1/create_support_ticket")
        expect(messages.documentation.events.create_support_ticket.fields.email_address).toMatch('required')
        expect(messages.documentation.events.create_support_ticket.fields.subject).toMatch('required')
        expect(messages.documentation.events.create_support_ticket.fields.body).toMatch('required')
    it "get_support_tickets", ->
        expect(messages.documentation.events.get_support_tickets.description).toInclude("/api/v1/get_support_tickets")
    it "get_available_upgrades", ->
        expect(messages.documentation.events.get_available_upgrades.description).toInclude("/api/v1/get_available_upgrades")

