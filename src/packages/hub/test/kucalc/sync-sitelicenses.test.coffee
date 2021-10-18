#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# run this from the @cocalc/hub/test dir via
# $ SMC_DB_RESET=true SMC_TEST=true ../node_modules/.bin/mocha --require  coffeescript/register kucalc/sync-sitelicenses.test.coffee

init     = require('./init')
db       = undefined
setup    = (cb) -> (init.setup (err) -> db=init.db(); cb(err))
teardown = init.teardown

async  = require('async')
expect = require('expect')

misc = require('@cocalc/util/misc')

ss = require("@cocalc/database/site-license/sync-subscriptions")

setup_db = (cb) ->
    # TODO insert bogus data
    cb()

describe 'sync-sitelicenses', ->
    @timeout(30000) # could be stuck in precompiling typescript
    before(setup)
    after(teardown)

    it 'check', ->
        expect(db != null).toBe(true)
    it 'loaded the sync-subsciptions module', ->
        expect(ss.sync_site_license_subscriptions != null).toBe(true)

    it 'runs the function', ->
        setup_db ->
            expect(await ss.sync_site_license_subscriptions(db)).toBe(0)

