#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

api   = require('./apitest')
{setup, teardown} = api
misc = require('smc-util/misc')
expect = require('expect')

describe 'tests creating an auth token via the api -- ', ->
    before(setup)
    after(teardown)

    account_id2 = undefined

    it "uses api call to create a second account", (done) ->
        @timeout(10000)
        api.call
            event : 'create_account'
            body  :
                first_name      : "Sage2"
                last_name       : "CoCalc2"
                email_address   : "cocalc+2@sagemath.com"
                password        : "1234qwerty"
                agreed_to_terms : true
            cb    : (err, resp) ->
                expect(resp?.event).toBe('account_created')
                expect(misc.is_valid_uuid_string(resp?.account_id)).toBe(true)
                account_id2 = resp?.account_id
                done(err)

    auth_token = undefined
    it "obtains an auth token for the second account", (done) ->
        @timeout(10000)
        api.call
            event : 'user_auth'
            body  :
                account_id : account_id2
                password   : "1234qwerty"
            cb    : (err, resp) ->
                if err
                    done(err); return
                expect(resp.event).toBe('user_auth_token')
                expect(resp.auth_token.length).toBe(24)
                auth_token = resp.auth_token
                done()

    it "check in the database that the token would work", (done) ->
        @timeout(10000)
        api.db.get_auth_token_account_id
            auth_token : auth_token
            cb         : (err, account_id) ->
                if err
                    done(err)
                else
                    expect(account_id).toBe(account_id2)
                    done()

    it "check that a wrong token does not work", (done) ->
        fake_token = '12341234123'
        @timeout(10000)
        api.db.get_auth_token_account_id
            auth_token : fake_token
            cb         : (err, account_id) ->
                if err
                    done(err)
                else
                    expect(account_id).toBe(undefined)
                    done()

