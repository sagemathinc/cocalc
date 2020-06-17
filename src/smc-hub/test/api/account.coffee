#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Testing API functions relating to users and user accounts

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

api   = require('./apitest')
{setup, teardown, reset, winston} = api

misc = require('smc-util/misc')

email = require('../../email')

async  = require('async')
expect = require('expect')

describe 'testing calls relating to creating user accounts -- ', ->
    @timeout(15000)
    before(setup)
    after(teardown)
    beforeEach(reset)

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
                console.log('EMAIL', email.send_email)
                opts0 = email.send_email.args[0][0]
                expect(opts0.subject.indexOf('Welcome to CoCalc') == 0).toBe(true)
                done(err)

    project_id = undefined
    it "creates test project", (done) ->
        api.call
            event : 'create_project'
            body  :
                title       : 'COLLABTEST'
                description : 'Testing collaboration ops'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('project_created')
                project_id = resp.project_id
                done(err)

    it "invites collaborator to project", (done) ->
        api.call
            event : 'invite_collaborator'
            body  :
                account_id : account_id2
                project_id : project_id
            cb    : (err, resp) ->
                expect(resp?.event).toBe('success')
                done(err)

    project_id2 = undefined
    account_id3 = undefined
    it "invites a collaborator to a project via an email message", (done) ->
        # create new account and then invite
        async.series([
            (cb) ->
                api.call
                    event : 'create_project'
                    body  :
                        title       : 'COLLABTEST2'
                        description : 'Testing collaboration ops'
                    cb    : (err, resp) ->
                        expect(resp?.event).toBe('project_created')
                        project_id2 = resp.project_id
                        expect(misc.is_valid_uuid_string(project_id2)).toBe(true)
                        #winston.info("project_id2: #{project_id2}")
                        cb(err)

            (cb) ->
                api.call
                    event : 'create_account'
                    body  :
                        first_name      : "Sage3"
                        last_name       : "CoCalc3"
                        email_address   : "cocalc+3@sagemath.com"
                        password        : "1234qwerty"
                        agreed_to_terms : true
                    cb    : (err, resp) ->
                        expect(resp?.event).toBe('account_created')
                        expect(misc.is_valid_uuid_string(resp?.account_id)).toBe(true)
                        account_id3 = resp?.account_id
                        expect(misc.is_valid_uuid_string(account_id3)).toBe(true)
                        console.log("account created: #{account_id3}")
                        cb(err)

            (cb) ->
                api.call
                    event : 'invite_collaborator'
                    body  :
                        account_id     : account_id3
                        project_id     : project_id2
                        title          : 'PROJECT_TITLE'
                        link2proj      : 'https://link.to.project/'
                        replyto        : 'cocalc+3@sagemath.com'
                        replyto_name   : 'Sage3 CoCalc3'
                        email          : 'BODY_OF_EMAIL_1'
                        subject        : 'SUBJECT_OF_EMAIL_1'
                    cb    : (err, resp) ->
                        winston.info("invites a collaborator to a project with an email message: #{misc.to_json(resp)}")
                        # maybe actual email is sent async, hence we wait a bit...
                        setTimeout((-> cb(err)), 100)

            # there shouldn't be a second email (during a week or so) upon inviting again
            (cb) ->
                api.call
                    event : 'invite_collaborator'
                    body  :
                        account_id     : account_id3
                        project_id     : project_id2
                        title          : 'PROJECT_TITLE'
                        link2proj      : 'https://link.to.project/'
                        replyto        : 'cocalc+3@sagemath.com'
                        replyto_name   : 'Sage3 CoCalc3'
                        email          : 'BODY_OF_EMAIL_2'
                        subject        : 'SUBJECT_OF_EMAIL_2'
                    cb    : (err, resp) ->
                        # maybe actual email is sent async, hence we wait a bit...
                        setTimeout((-> cb(err)), 100)

        ], (err) ->
            expect(err?).toBe(false)
            opts0 = email.send_email.args[0][0]
            #console.log(misc.to_json(opts0))
            expect(opts0.subject.indexOf('Welcome to') >= 0).toBe(true)

            opts1 = email.send_email.args[1][0]
            #console.log(misc.to_json(opts1))
            expect(opts1.subject).toBe('SUBJECT_OF_EMAIL_1')
            expect(opts1.from).toBe('invites@sagemath.com')
            expect(opts1.to).toBe('cocalc+3@sagemath.com')
            expect(opts1.replyto_name).toBe('Sage3 CoCalc3')
            expect(opts1.body.indexOf('BODY_OF_EMAIL_1') == 0).toBe(true)
            # no second email
            winston.info("email.send_email.args: #{misc.to_json(email.send_email.args)}")
            #console.log("email3: #{misc.to_json(opts2)}")
            expect(email.send_email.args.length).toBe(2) # only two, because the second invite is not going through in client/mesg_invite_collaborator
            done(err)
        )

    it "lists project collaborators", (done) ->
        api.call
            event : 'query'
            body  :
                query : {projects:{project_id:project_id, users:null}}
            cb    : (err, resp) ->
                expect(resp?.event).toBe('query')
                expect(resp?.query?.projects?.users[account_id2]).toEqual( group: 'collaborator' )
                done(err)

    base_url = 'https://cocalc.com'
    it "invites non-cloud collaborators", (done) ->
        # TODO: this test cannot check contents of the email message sent,
        # because api.last_email isn't set until after this test runs.
        # See TODO in smc-hub/client.coffee around L1216, where cb() is called before
        # email is sent.
        api.call
            event : 'invite_noncloud_collaborators'
            body  :
                project_id : project_id
                to         :  'someone@m.local'
                email      :  'Plese sign up and join this project.'
                title      :  'Team Project'
                link2proj  :  "#{base_url}/projects/#{project_id}"
            cb    :  (err, resp) ->
                check = (err, resp) ->
                    opts0 = email.send_email.args[0][0]
                    expect(resp?.event).toBe('invite_noncloud_collaborators_resp')
                    expect(opts0?.subject).toBe('CoCalc Invitation')
                    done()
                # sending email is probably async, wait a bit
                setTimeout((-> check(err, resp)), 100)


    it "removes collaborator", (done) ->
        api.call
            event : 'remove_collaborator'
            body  :
                account_id : account_id2
                project_id : project_id
            cb    : (err, resp) ->
                expect(resp?.event).toBe('success')
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
    @timeout(15000)
    before(setup)
    after(teardown)
    beforeEach(reset)

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
    @timeout(15000)
    before(setup)
    after(teardown)
    beforeEach(reset)

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
