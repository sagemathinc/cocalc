###
Using API to interact with a project
###

api   = require('./apitest')
{setup, teardown} = api
misc = require('smc-util/misc')
expect = require('expect')


describe 'testing calls relating to creating user accounts -- ', ->
    before(setup)
    after(teardown)

    it "gets names for empty list of users", (done) ->
        api.call
            event : 'get_usernames'
            body  :
                account_ids    : []
            cb    : (err, resp) ->
                expect(resp?.event).toBe('usernames')
                expect(resp?.usernames).toEqual({})
                done(err)

    it "gets names for api test account", (done) ->
        api.call
            event : 'get_usernames'
            body  :
                account_ids    : [api.account_id]
            cb    : (err, resp) ->
                expect(resp?.event).toBe('usernames')
                expect(resp?.usernames).toEqual
                    "#{api.account_id}":
                        first_name: 'Sage'
                        last_name: 'CoCalc'
                done(err)

    it "uses api call to create a second account", (done) ->
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
                done(err)

    it "tries to create the same account again", (done) ->
        api.call
            event : 'create_account'
            body  :
                first_name      : "Sage2"
                last_name       : "CoCalc2"
                email_address   : "cocalc+2@sagemath.com"
                password        : "1234qwerty"
                agreed_to_terms : true
            cb    : (err, resp) ->
                expect(resp?.event).toBe('account_creation_failed')
                done(err)
