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

###
Test functionality in the client module.
###

require('ts-node').register()

client = require('../client')
expect = require('expect')

describe 'test password checking -- ', ->
    it 'inputs a valid password', ->
        expect(client.is_valid_password('foobar')).toEqual([true, ''])

    it 'inputs nothing', ->
        expect(client.is_valid_password()).toEqual([false, 'Password must be specified.'])

    it 'inputs an object', ->
        expect(client.is_valid_password({foo:'bar'})).toEqual([false, 'Password must be specified.'])

    it 'inputs something too short', ->
        expect(client.is_valid_password('barxx')).toEqual([false, 'Password must be between 6 and 64 characters in length.'])

    it 'inputs something too long', ->
        s = ('x' for _ in [0..65]).join('')
        expect(client.is_valid_password(s)).toEqual([false, 'Password must be between 6 and 64 characters in length.'])


