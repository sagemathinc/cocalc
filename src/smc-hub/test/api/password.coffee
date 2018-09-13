###
Testing password reset, change, email_address change, etc. related functionality
###

api   = require('./apitest')
{setup, teardown, reset} = api

misc  = require('smc-util/misc')

expect = require('expect')

auth = require('../../auth')


describe 'test changing password -- ', ->
    before(setup)
    after(teardown)
    beforeEach(reset)

    it 'changes the password', (done) ->
        api.call
            event : 'change_password'
            body :
                account_id   : api.account_id
                old_password : 'blah'
                new_password : 'new-blah'
            cb    : (err, resp) ->
                if err
                    done(err)
                    return
                expect(resp?.event).toBe('changed_password')
                done()

    it "tries with invalid old password and fails (this also confirms that password was changed)", (done) ->
        api.call
            event : 'change_password'
            body :
                account_id   : api.account_id
                old_password : 'blah'
                new_password : 'new2-blah'
            cb    : (err, resp) ->
                expect(resp?.error).toBe('invalid old password')
                done(err)

    it 'change it back, which confirms it was changed to what we think', (done) ->
        api.call
            event : 'change_password'
            body :
                account_id   : api.account_id
                old_password : 'new-blah'
                new_password : 'blah'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('changed_password')
                done(err)

    account_id2 = undefined
    it "create another account with no password set", (done) ->
        api.db.create_account
            first_name    : "Sage2"
            last_name     : "CoCalc2"
            created_by    : "1.2.3.5"
            email_address : "cocalc2@sagemath.com"
            cb            : (err, account_id) ->
                account_id2 = account_id
                done(err)

    it "tries -- AND FAILS -- to change that other user's password", (done) ->
        api.call
            event : 'change_password'
            body :
                account_id   : account_id2
                new_password : 'blah'
            cb    : (err, resp) ->
                expect(resp?.error).toEqual('invalid old password')  # invalid since not auth'd as them - a generic response
                done(err)

    api_key2 = undefined
    it "get api key of user with no password", (done) ->
        api.db.regenerate_api_key
            account_id : account_id2
            cb         : (err, api_key) ->
                api_key2 = api_key
                done(err)

    it "tries and fails for a good reason", (done) ->
        api.call
            event : 'change_password'
            api_key : api_key2
            body :
                account_id   : account_id2
                new_password : 'blah'
            cb    : (err, resp) ->
                expect(resp?.error).toEqual(new_password: 'Password must be between 6 and 64 characters in length.')
                done(err)

    it "tries and fails for a good reason", (done) ->
        api.call
            event : 'change_password'
            api_key : api_key2
            body :
                account_id   : account_id2
                new_password : 'blahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblah'
            cb    : (err, resp) ->
                expect(resp?.error).toEqual(new_password: 'Password must be between 6 and 64 characters in length.')
                done(err)

    it "tries -- AND SUCCEEDS -- to change that other user's password", (done) ->
        api.call
            event : 'change_password'
            api_key : api_key2
            body :
                account_id   : account_id2
                new_password : 'blahblah'
            cb    : (err, resp) ->
                expect(resp?.error).toBe(undefined)
                done(err)

describe 'test changing email address -- ', ->
    before(setup)
    after(teardown)
    beforeEach(reset)

    it "changes it", (done) ->
        api.call
            event : 'change_email_address'
            body :
                new_email_address : "cocalc+1@sagemath.com"
                password          : 'blah'
                account_id        : api.account_id
            cb    : (err, resp) ->
                expect(resp?.event).toBe('changed_email_address')
                done(err)

    it 'confirms it really changed', (done) ->
        api.call
            event : 'query'
            body :
                query : {accounts:{email_address:null}}
            cb : (err, resp) ->
                expect(resp?.query?.accounts?.email_address).toBe('cocalc+1@sagemath.com')
                done(err)

    it 'tries to change with wrong password', (done) ->
        api.call
            event : 'change_email_address'
            body :
                new_email_address : "cocalc+2@sagemath.com"
                password          : 'blahblah'
                account_id        : api.account_id
            cb    : (err, resp) ->
                expect(resp?.error).toBe('invalid_password')
                done(err)

    it 'confirms it did NOT change', (done) ->
        api.call
            event : 'query'
            body :
                query : {accounts:{email_address:null}}
            cb : (err, resp) ->
                expect(resp?.query?.accounts?.email_address).toBe('cocalc+1@sagemath.com')
                done(err)

    account_id2 = undefined
    it "create another account", (done) ->
        api.db.create_account
            first_name    : "Sage2"
            last_name     : "CoCalc2"
            created_by    : "1.2.3.5"
            email_address : "cocalc389@sagemath.com"
            cb            : (err, account_id) ->
                account_id2 = account_id
                done(err)

    it 'tries to change to that email address', (done) ->
        api.call
            event : 'change_email_address'
            body :
                new_email_address : "cocalc389@sagemath.com"
                password          : 'blah'
                account_id        : api.account_id
            cb    : (err, resp) ->
                expect(resp?.error).toBe('email_already_taken')
                done(err)


describe 'tests sending a forgot password email --', ->
    before(setup)
    after(teardown)
    beforeEach(reset)

    it 'sends a forgot password email for an address that does not exist', (done) ->
        api.call
            event : 'forgot_password'
            body :
                email_address : 'cocalc+17@sagemath.com'
            cb : (err, resp) ->
                expect(resp?.error).toBe('No account with e-mail address cocalc+17@sagemath.com')
                done(err)


    reset_code = undefined
    it 'sends a forgot password email', (done) ->
        api.call
            event : 'forgot_password'
            body  :
                email_address : 'cocalc@sagemath.com'
            cb : (err, resp) ->
                expect(resp.error).toBe(false)
                expect(api.last_email?.subject).toBe('CoCalc Password Reset')
                i = api.last_email?.body.indexOf('#forgot-')
                reset_code = api.last_email?.body.slice(i+'#forgot-'.length, i+'#forgot-'.length+36)
                expect(misc.is_valid_uuid_string(reset_code)).toBe(true)
                done(err)

    it 'uses the forgot password token', (done) ->
        api.call
            event : 'reset_forgot_password'
            body  :
                reset_code   : reset_code
                new_password : 'foobar'
            cb : (err, resp) ->
                expect(!!resp?.error).toBe(false)
                done(err)

    it 'verifies that password was properly reset', (done) ->
        auth.is_password_correct
            database             : api.db
            account_id           : api.account_id
            password             : 'foobar'
            cb                   : (err, is_correct) ->
                expect(is_correct).toBe(true)
                done(err)

