###
Some very, very basic API tests
###

api   = require('./apitest')
{setup, teardown} = api

expect = require('expect')


describe 'does a ping api call', ->
    before(setup)
    after(teardown)

    it "does the ping", (done) ->
        api.call
            event : 'ping'
            cb    : (err, resp) ->
                expect(resp?.event).toBe('pong')
                done(err)

