#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Tests of view menu related functionality
###

actions = store = undefined
setup = (cb) -> (require('./setup').setup (err, x) -> actions=x; store=x?.store; cb(err))
{teardown} = require('./setup')

expect  = require('expect')

describe 'toggle the toolbar -- ', ->
    before(setup)
    after(teardown)

    it 'checks that toolbar starts visible', ->
        expect(store.get('toolbar')).toBe(true)

    it 'toggles the toolbar', ->
        actions.toggle_toolbar()
        expect(store.get('toolbar')).toBe(false)

describe 'tests the zoom -- ', ->
    before(setup)
    after(teardown)

    global.localStorage={}

    it 'verifies the default zoom of 14', ->
        expect(store.get('font_size')).toBe(14)

    it 'zooms in', ->
        actions.zoom(1)
        expect(store.get('font_size')).toBe(15)

    it 'zooms in more', ->
        actions.zoom(2)
        expect(store.get('font_size')).toBe(17)

    it 'zooms out', ->
        actions.zoom(-1)
        expect(store.get('font_size')).toBe(16)

    it 'zooms out more', ->
        actions.zoom(-2)
        expect(store.get('font_size')).toBe(14)


