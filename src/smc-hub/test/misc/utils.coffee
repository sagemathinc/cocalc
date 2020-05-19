#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

expect  = require('expect')
utils = require('../../utils')


describe 'parse retention strings', ->
    {EXTRAS} = require('smc-util/db-schema/site-settings-extras')
    retentions = EXTRAS.pii_retention.valid
    parser = EXTRAS.pii_retention.to_val
    displayer = EXTRAS.pii_retention.to_display

    it 'all valid values work', ->
        cnt = 0
        for s in retentions
            continue if s == 'never'
            cnt += 1
            secs = parser(s)
            expect(isNaN(secs)).toBe(false)
            expect(secs > 0).toBe(true)
        # make sure there are at least some available
        expect(cnt > 3).toBe(true)

    it 'parses correctly', ->
        expect(parser('30 days')).toBe(30 * 24 * 60 * 60)
        expect(parser('6 months')).toBe(6 * 30 * 24 * 60 * 60)
        expect(parser('1 year')).toBe(365 * 24 * 60 * 60)
        expect(parser('10 years')).toBe(10 * 365 * 24 * 60 * 60)

    it 'displays them', ->
        expect(displayer('never').indexOf('never expire') > 0).toBe(true)
        expect(displayer('30 days').length > 10).toBe(true)

