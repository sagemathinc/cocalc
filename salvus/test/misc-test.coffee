misc = require('../misc.coffee')
expect = require('expect')

describe 'startswith', ->
    startswith = misc.startswith
    it 'checks that "foobar" starts with foo', ->
        expect(startswith("foobar",'foo')).toBe(true)
    it 'checks that "foobar" does not start with bar', ->
        expect(startswith("foobar",'bar')).toBe(false)
    it 'checks that "bar" starts in any of the given strings (a list)', ->
        expect(startswith("barbatz", ["aa", "ab", "ba", "bb"])).toBe(true)
    it 'checks that "catz" does not start with any of the given strings (a list)', ->
        expect(startswith("catz", ["aa", "ab", "ba", "bb"])).toBe(false)

describe 'random_choice and random_choice_from_obj', ->
    rc = misc.random_choice
    rcfo = misc.random_choice_from_obj
    it 'checks that a randomly chosen element is in the given list', ->
        l = ["a", 5, 9]
        el = rc(l)
        expect(l).toContain(el)
    it 'checks that random choice works with only one element', ->
        expect(rc([123])).toBe(123)
    it 'checks that random choice with no elements is also fine', ->
        expect(rc([])).toBe(undefined)
    it 'checks that a randomly chosen key/value pair from an object exists', ->
        o = {abc : [1, 2, 3], cdf : {a: 1, b:2}}
        expect([["abc", [1, 2, 3]], ["cdf" , {a: 1, b:2}]]).toContain(rcfo(o))

describe 'the Python flavoured randint function', ->
    randint = misc.randint
    it 'checks probabilistically that randint is inclusive', ->
        lb = -4; ub = 7
        xmin = xmax = 0
        for i in [1..1000]
            x = randint(lb, ub)
            expect(lb <= x <= ub).toBe(true)
            xmin = Math.min(xmin, x)
            xmax = Math.max(xmax, x)
        expect(xmin).toBe(lb)
        expect(xmax).toBe(ub)
    it 'checks randint behaves well for tight intervals', ->
        expect(randint(91, 91)).toBe(91)
    # note: in python, this fails
    it 'checks how randint behaves with flipped intervals bounds', ->
        lb = 4; ub = -7
        for i in [1..100]
            x = randint(lb, ub)
            expect(lb >= x >= ub).toBe(true)

describe 'the Python flavoured split function', ->
    split = misc.split
    it 'checks splits on whitespace', ->
        s = "this is a   sentence"
        expect(split(s)).toEqual(["this", "is", "a", "sentence"])
    it "checks split's behaviour on linebreaks and special characters", ->
        s2 = """we'll have
               a lot (of)
               fun with sp|äci|al cħæ¶ä¢ŧ€rß"""
        expect(split(s2)).toEqual(["we'll", "have", "a", "lot", "(of)",
                                   "fun", "with", "sp|äci|al", "cħæ¶ä¢ŧ€rß"])

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
    it 'variable number of arguments are supported', ->
        a = {x:1}; b = {y:2}; c = {z:3}; d = {u:4}; w ={v:5, x:0}
        r = merge(a, b, c, d, w)
        res = {x:0, y:2, z:3, u:4, v:5}
        expect(r).toEqual(res)
        expect(a).toEqual(res)

describe 'cmp', ->
    cmp = misc.cmp
    it 'compares 4 and 10 and returns -1', ->
        expect(cmp(4, 10)).toBe(-1)
    it 'compares 10 and 4 and returns 1', ->
        expect(cmp(10, 4)).toBe(1)
    it 'compares 10 and 10 and returns 0', ->
        expect(cmp(10, 10)).toBe(0)
