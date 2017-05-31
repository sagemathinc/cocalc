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
                expect(err).toEqual(null)
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

    account_id2 = undefined
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
                account_id2 = resp?.account_id
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
                expect(resp?.reason).toEqual({"email_address":"This e-mail address is already taken."})
                done(err)

    it "deletes the second account", (done) ->
        api.call
            event : 'delete_account'
            body  :
                account_id      : account_id2
            cb    : (err, resp) ->
                expect(resp?.event).toBe('account_deleted')
                done(err)

describe 'testing invalid input to creating user accounts -- ', ->
    before(setup)
    after(teardown)

    it "leaves off the first name", (done) ->
        api.call
            event : 'create_account'
            body  :
                last_name       : "CoCalc3"
                email_address   : "cocalc+3@sagemath.com"
                password        : "god"
                agreed_to_terms : true
            cb    : (err, resp) ->
                expect(misc.startswith(err, 'invalid parameters')).toBe(true)
                done()

    it "leaves first name blank", (done) ->
        api.call
            event : 'create_account'
            body  :
                first_name      : ""
                last_name       : "xxxx"
                email_address   : "cocalc+3@sagemath.com"
                password        : "xyz123"
                agreed_to_terms : true
            cb    : (err, resp) ->
                delete resp?.id
                expect(resp).toEqual(event:'account_creation_failed', reason: { first_name: 'Enter your first name.' })
                done(err)

    it "leaves last name blank", (done) ->
        api.call
            event : 'create_account'
            body  :
                first_name      : "C"
                last_name       : ""
                email_address   : "cocalc+3@sagemath.com"
                password        : "xyz123"
                agreed_to_terms : true
            cb    : (err, resp) ->
                delete resp?.id
                expect(resp).toEqual(event:'account_creation_failed', reason: { last_name: 'Enter your last name.' })
                done(err)

describe 'testing user_search -- ', ->
    before(setup)
    after(teardown)

    it "searches by email", (done) ->
        api.call
            event : 'user_search'
            body  :
                query : 'cocalc@sagemath.com'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('user_search_results')
                expect(resp?.results?.length).toBe(1)
                expect(resp?.results?[0].first_name).toBe('Sage')
                expect(resp?.results?[0].last_name).toBe('CoCalc')
                expect(resp?.results?[0].email_address).toBe('cocalc@sagemath.com')
                done(err)


    it "searches by first and last name prefixes", (done) ->
        api.call
            event : 'user_search'
            body  :
                query : 'coc sag'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('user_search_results')
                expect(resp?.results?.length).toBe(1)
                expect(resp?.results?[0].first_name).toBe('Sage')
                expect(resp?.results?[0].last_name).toBe('CoCalc')
                expect(resp?.results?[0]).toExcludeKey('email_address')
                done(err)

    it "searches by email and first and last name prefixes", (done) ->
        api.call
            event : 'user_search'
            body  :
                query : 'coc sag,cocalc@sagemath.com'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('user_search_results')
                expect(resp?.results?.length).toBe(2)
                done(err)
