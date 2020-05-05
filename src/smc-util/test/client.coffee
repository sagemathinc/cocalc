#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Test functionality in the client module.
###

require('ts-node').register()

expect = require('expect')

describe 'test password checking -- ', ->
    {is_valid_password} = require('smc-hub/client/create-account')
    it 'inputs a valid password', ->
        expect(is_valid_password('foobar')).toEqual([true, ''])

    it 'inputs nothing', ->
        expect(is_valid_password()).toEqual([false, 'Password must be specified.'])

    it 'inputs an object', ->
        expect(is_valid_password({foo:'bar'})).toEqual([false, 'Password must be specified.'])

    it 'inputs something too short', ->
        expect(is_valid_password('barxx')).toEqual([false, 'Password must be between 6 and 64 characters in length.'])

    it 'inputs something too long', ->
        s = ('x' for _ in [0..65]).join('')
        expect(is_valid_password(s)).toEqual([false, 'Password must be between 6 and 64 characters in length.'])


