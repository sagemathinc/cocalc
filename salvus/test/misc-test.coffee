misc = require('../misc.coffee')
expect = require('expect')

describe 'startswith', ->
    startswith = misc.startswith
    it 'checks that "foobar" starts with foo', ->
        expect(startswith("foobar",'foo')).toBe(true)
    it 'checks that "foobar" does not start with bar', ->
        expect(startswith("foobar",'bar')).toBe(false)

describe 'merge', ->
    merge = misc.merge
    it 'checks that {a:5} merged with {b:7} is {a:5,b:7}', ->
        expect(merge({a:5},{b:7})).toEqual({a:5,b:7})
    it 'checks that x={a:5} merged with {b:7} mutates x to be {a:5,b:7}', ->
        x = {a:5}; merge(x,{b:7})
        expect(x).toEqual({a:5,b:7})
    it 'checks that duplicate keys are overwritten by the second entry', ->
        a = {x:1, y:2}
        b = {x:3}
        merge(a, b)
        expect(a).toEqual({x:3, y:2})

describe 'cmp', ->
    cmp = misc.cmp
    it 'compares 4 and 10 and returns -1', ->
        expect(cmp(4, 10)).toBe(-1)
    it 'compares 10 and 4 and returns 1', ->
        expect(cmp(10, 4)).toBe(1)
    it 'compares 10 and 10 and returns 0', ->
        expect(cmp(10, 10)).toBe(0)
