#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

expect  = require('expect')

{find_matches} = require('../find')

describe 'test several searches -- ', ->

    it 'a basic search with one match', ->
        expect(find_matches('a', 'xyz\nabc')).toEqual({ matches: [ { start: 4, stop: 5 } ] } )

    it 'an empty search', ->
        expect(find_matches('', 'xyzabc')).toEqual({ matches: [ ] } )

    it 'an empty regexp search', ->
        expect(find_matches('', 'xyzabc', false, false)).toEqual({ matches: [ ] } )

    it 'a case insensitive search', ->
        expect(find_matches('A', 'xyzabcA', false)).toEqual({ matches: [ { start: 3, stop: 4 }, { start: 6, stop: 7 } ] } )

    it 'a case sensitive search', ->
        expect(find_matches('A', 'xyzabc', true)).toEqual({ matches: [ ] } )

    it 'another case sensitive search', ->
        expect(find_matches('A', 'xyzabcA', true)).toEqual({ matches: [ { start: 6, stop: 7 } ] } )

    it 'an invalid regexp', ->
        expect(find_matches('\\', 'xyzabc', false, true)).toEqual( { error: 'SyntaxError: Invalid regular expression: /\\/: \\ at end of pattern' }  )

    it 'a regexp search for all the non whitespace', ->
        expect(find_matches('\\S+', 'ab 123\t z', false, true)).toEqual(
            { matches: [ { start: 0, stop: 2 }, { start: 3, stop: 6 }, { start: 8, stop: 9 } ] })
