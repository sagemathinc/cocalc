#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

######
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

expect = require('expect')

{key_value_store} = require('../key-value-store')

describe "create a simple key value store with various single keys -- ", ->
    k = undefined

    it 'creates the store', ->
        k = key_value_store()

    it 'saves "x":{foo:3}', ->
        k.set('x', {foo:3})
        expect(k.get('x')).toEqual({foo:3})
        k.delete('x')
        expect(k.get('x')).toEqual(undefined)

    it "saves {foo:3, bar:5}:'x' (so non-string key)", ->
        k.set({foo:3, bar:5}, 'x')
        expect(k.get({bar:5, foo:3})).toEqual('x')
        k.delete({bar:5, foo:3})
        expect(k.get({bar:5, foo:3})).toEqual(undefined)

    it "closes k", ->
        expect(k._data?).toBe(true)
        k.close()
        expect(k._data?).toBe(false)
        try
            k.set('a',1)
            expect(true).toBe(false)
        catch
            # good
        try
            k.get('a')
            expect(true).toBe(false)
        catch
            # good
        try
            k.delete('a')
            expect(true).toBe(false)
        catch
            # good




