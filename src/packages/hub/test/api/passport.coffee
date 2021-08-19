#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Using API to unlink passport
###

api   = require('./apitest')
{setup, teardown} = api

expect = require('expect')


describe 'tests for unlinking passport -- ', ->
    before(setup)
    after(teardown)

    it 'creates a passport', (done) ->
        api.db.create_passport
            account_id : api.account_id
            strategy   : 'google'
            id         : '929304823048'
            profile    : {email_address:"sage@example.com", avatar:'James Cameron'}
            cb         : done

    it "uses query api to verify passport is there", (done) ->
        api.call
            event : 'query'
            body :
                query : {accounts:{account_id:api.account_id, passports:null}}
            cb : (err, resp) ->
                expect(resp?.event).toBe('query')
                expect(resp?.query?.accounts?.passports).toIncludeKey('google-929304823048')
                done(err)
                
    it "unlinks a passport", (done) ->
        api.call
            event : 'unlink_passport'
            body :
                strategy   : 'google'
                id         : '929304823048'
            cb : (err, resp) ->
                expect(resp?.event).toBe('success')
                expect(resp?.id).toBe('929304823048')
                done(err)

    it "verifies passport is unlinked", (done) ->
        api.call
            event : 'query'
            body :
                query : {accounts:{account_id:api.account_id, passports:null}}
            cb : (err, resp) ->
                expect(resp?.event).toBe('query')
                expect(resp?.query?.accounts?.passports).toEqual({})
                done(err)
