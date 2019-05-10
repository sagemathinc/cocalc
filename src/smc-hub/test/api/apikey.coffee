###
Testing API functions relating to api keys itself

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

api   = require('./apitest')
{setup, teardown, reset, winston} = api
{http_message_api_v1} = require('../../api/handler')

misc = require('smc-util/misc')

async  = require('async')
expect = require('expect')

describe 'api key tests -- ', ->
    @timeout(5000)
    before(setup)
    after(teardown)
    beforeEach(reset)

    it 'correct api key', (done) ->
        http_message_api_v1
            event         : 'ping'
            database      : api.db
            compute_server: api.compute_server
            api_key       : api.api_key
            ip_address    : '2.3.4.5'
            logger        : api.logger
            body          : {}
            cb            : (err, resp) ->
                winston.info(err, resp)
                done(err)

    it 'allows a wrong api key to ping', (done) ->
        fake_key = 'sk_173r2rj32'

        http_message_api_v1
            event         : 'ping'
            database      : api.db
            compute_server: api.compute_server
            api_key       : fake_key
            ip_address    : '2.3.4.5'
            logger        : api.logger
            body          : {}
            cb            : (err, resp) ->
                winston.info(err, resp)
                #if not err?
                #    done('there was no error')
                #else
                #    expect(err).toInclude('No account found.')
                #    done()
                expect(resp.event).toBe('pong')
                expect(resp.now).toExist()
                done(err)

    it 'blocks a wrong api key from creating a project', (done) ->
        fake_key = 'sk_173nsmeje32'

        http_message_api_v1
            event         : 'create_project'
            database      : api.db
            compute_server: api.compute_server
            api_key       : fake_key
            ip_address    : '3.4.5.6'
            logger        : api.logger
            body          : {start: true}
            cb            : (err, resp) ->
                winston.info(err, resp)
                expect(resp.event).toBe('error')
                expect(resp.error).toInclude('You must be signed in')
                done(err)

    it 'blocks banned users, even for pings', (done) ->
        async.series([
            (cb) ->
                api.db.ban_user
                    account_id     : api.account_id
                    cb             : (err) ->
                        cb(err)

            (cb) ->
                http_message_api_v1
                    event         : 'ping'
                    database      : api.db
                    compute_server: api.compute_server
                    api_key       : api.api_key
                    ip_address    : '7.8.9.10'
                    logger        : api.logger
                    body          : {}
                    cb            : (err, resp) ->
                        winston.info(err, resp)
                        if err?
                            expect(err).toInclude('BANNED')
                            cb()
                        else
                            cb('no banning error')

        ], (err, resp) ->
            winston.info(err, resp)
            done(err)
        )



