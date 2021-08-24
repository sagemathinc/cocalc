#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

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

