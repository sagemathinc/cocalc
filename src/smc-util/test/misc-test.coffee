###############################################################################
#                                                                             #
#    SageMathCloud: A collaborative web-based interface to                    #
#                   Sage, IPython, LaTeX and the Terminal.                    #
#                                                                             #
#    Copyright (C) 2015, The Authors of SageMathCloud                         #
#                                                                             #
#    This program is free software: you can redistribute it and/or modify     #
#    it under the terms of the GNU General Public License as published by     #
#    the Free Software Foundation, either version 3 of the License, or        #
#    (at your option) any later version.                                      #
#                                                                             #
#    This program is distributed in the hope that it will be useful,          #
#    but WITHOUT ANY WARRANTY; without even the implied warranty of           #
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the            #
#    GNU General Public License for more details.                             #
#                                                                             #
#    You should have received a copy of the GNU General Public License        #
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.    #
#                                                                             #
###############################################################################

misc = require('../misc.coffee')

# ATTN: the order of these require statements is important,
# such that should & sinon work well together
assert  = require('assert')
expect  = require('expect')
sinon   = require('sinon')
should  = require('should')
require('should-sinon')

# introduction to the testing frameworks

# documentation
# mocha: http://mochajs.org/
# should.js: http://shouldjs.github.io/
# sinon.js: http://sinonjs.org/docs/
# should-sinon: https://github.com/shouldjs/sinon/blob/master/test.js
# general notes: http://www.kenpowers.net/blog/testing-in-browsers-and-node/

describe "should.js (http://shouldjs.github.io/)", ->
    it "tests that should.js throws errors", ->
        # ATTN don't forget the () after true and similar!
        expect(-> (false).should.be.true()).toThrow()
        # because otherwise no error:
        expect(-> (false).should.be.true).toNotThrow()

describe "expect (https://github.com/mjackson/expect)", ->
    # ATTN when you want to check for an error, wrap it in (-> call())...
    (-> expect(false).toBe(true)).should.throw()

describe "sinon", ->
    it "is working", ->
        object = method: () -> {}
        spy = sinon.spy(object, "method");
        spy.withArgs(42);
        spy.withArgs(1);

        object.method(1);
        object.method(42);
        object.method(1);

        assert(spy.withArgs(42).calledOnce)
        assert(spy.withArgs(1).calledTwice)

    it "unit test", ->
        callback = sinon.spy();
        expect(callback.callCount).toEqual 0
        callback.should.have.callCount 0

        callback();
        expect(callback.calledOnce).toBe true
        callback.should.be.calledOnce()
        callback("xyz");
        expect(callback.callCount).toEqual 2
        callback.should.have.callCount 2
        expect(callback.getCall(1).args[0]).toEqual "xyz"
        (-> expect(callback.getCall(1).args[0]).toEqual "1").should.throw()
        callback.getCall(1).args[0].should.eql "xyz"

    describe "sinon's stubs", ->
    # also see the test for console.debug /w the console.log stub below
        it "are working for withArgs", ->
            func = sinon.stub()
            func.withArgs(42).returns(1)
            func.throws()

            expect(func(42)).toEqual(1)
            expect(func).toThrow(Error)

        it "and for onCall", ->
            func = sinon.stub()
            #func.onCall(0).throws()  # what the heck is this testing!?
            func.onCall(1).returns(42)

            #expect(func()).toThrow(Error)  # i don't even understand this test
            #expect(func()).toEqual(42);

# start testing misc.coffee

describe 'startswith', ->
    startswith = misc.startswith
    it 'checks that "foobar" starts with foo', ->
        startswith("foobar",'foo').should.be.true()
    it 'checks that "foobar" does not start with bar', ->
        startswith("foobar",'bar').should.be.false()
    it "works well with too long search strings", ->
        startswith("bar", "barfoo").should.be.false()
    it 'checks that "bar" starts in any of the given strings (a list)', ->
        startswith("barbatz", ["aa", "ab", "ba", "bb"]).should.be.true()
    it 'checks that "catz" does not start with any of the given strings (a list)', ->
        startswith("catz", ["aa", "ab", "ba", "bb"]).should.be.false()

describe "endswith", ->
    endswith = misc.endswith
    it 'checks that "foobar" ends with "bar"', ->
        endswith("foobar", "bar").should.be.true()
    it 'checks that "foobar" does not end with "foo"', ->
        endswith("foobar", "foo").should.be.false()
    it "works well with too long search strings", ->
        endswith("foo", "foobar").should.be.false()
    it "doesn't work with arrays", ->
        (-> endswith("foobar", ["aa", "ab"])).should.not.throw()

describe 'random_choice and random_choice_from_obj', ->
    rc = misc.random_choice
    rcfo = misc.random_choice_from_obj
    it 'checks that a randomly chosen element is in the given list', ->
        for i in [1..10]
            l = ["a", 5, 9, {"ohm": 123}, ["batz", "bar"]]
            l.should.containEql rc(l)
    it "random_choice properly selects *all* available elements", ->
        l = [3, 1, "x", "uvw", 1, [1,2,3]]
        while l.length > 0
            l.pop(rc(l))
        l.should.have.length 0
    it 'checks that random choice works with only one element', ->
        rc([123]).should.be.eql 123
    it 'checks that random choice with no elements is also fine', ->
        should(rc([])).be.undefined() # i.e. undefined or something like that
    it 'checks that a randomly chosen key/value pair from an object exists', ->
        o = {abc : [1, 2, 3], cdf : {a: 1, b:2}}
        [["abc", [1, 2, 3]], ["cdf" , {a: 1, b:2}]].should.containEql rcfo(o)

describe 'the Python flavoured randint function', ->
    randint = misc.randint
    it 'includes both interval bounds', ->
        lb = -4; ub = 7
        xmin = xmax = 0
        for i in [1..1000]
            x = randint(lb, ub)
            x.should.be.within(lb, ub)
            xmin = Math.min(xmin, x)
            xmax = Math.max(xmax, x)
            break if xmin == lb and xmax == ub
        xmin.should.be.exactly lb
        xmax.should.be.exactly ub
    it 'behaves well for tight intervals', ->
        randint(91, 91).should.be.exactly 91
    it 'behaves badly with flipped intervals bounds', ->
        # note about using should:
        # this -> function invocation is vital to capture the error
        (-> randint(5, 2)).should.throw /lower is larger than upper/

describe 'the Python flavoured split function', ->
    split = misc.split
    it 'splits correctly on whitespace', ->
        s = "this is a   sentence"
        split(s).should.eql ["this", "is", "a", "sentence"]
    it "splits also on linebreaks and special characters", ->
        s2 = """we'll have
               a lot (of)
               fun\nwith sp|äci|al cħæ¶ä¢ŧ€rß"""
        split(s2).should.eql ["we'll", "have", "a", "lot", "(of)",
                              "fun", "with", "sp|äci|al", "cħæ¶ä¢ŧ€rß"]
    it "handles empty and no matches correctly", ->
        split("").should.be.eql []
        split("\t").should.be.eql []

describe 'search_split is like split, but quoted terms are grouped together', ->
    ss = misc.search_split
    it "correctly with special characters", ->
        s1 = """Let's check how "quotation marks" and "sp|äci|al cħæ¶ä¢ŧ€rß" behave."""
        ss(s1).should.eql ["Let's", 'check','how', 'quotation marks', 'and', 'sp|äci|al cħæ¶ä¢ŧ€rß', 'behave.']
    it "correctly splits across line breaks", ->
        s2 = """this "text in quotes\n with a line-break" ends here"""
        ss(s2).should.eql ["this", "text in quotes\n with a line-break", "ends", "here"]
    it "also doesn't stumble over uneven quotations", ->
        s3 = """1 "a b c" d e f "g h i" "j k"""
        ss(s3).should.eql ["1", "a b c", "d", "e", "f", "g h i", "j", "k"]

describe "count", ->
    cnt = misc.count
    it "correctly counts the number of occurrences of X in Y", ->
        X = "bar"
        Y = "bar batz barbar abar rabarbar"
        cnt(Y, X).should.be.exactly 6
    it "counts special characters", ->
        cnt("we ¢ount ¢oins", "¢").should.eql 2
    it "returns zero if nothing has been found", ->
        cnt("'", '"').should.eql 0

describe "min_object of target and upper_bound", ->
    mo = misc.min_object
    upper_bound = {a:5, b:20, xyz:-2}
    it "modifies target in place", ->
        target = {a:7, b:15, xyz:5.5}
        # the return value are just the values
        mo(target, upper_bound).should.eql [ 5, 15, -2 ]
        target.should.eql {a:5, b:15, xyz:-2}
    it "works without a target", ->
        mo(upper_bounds : {a : 42}).should.be.ok
    it "returns empty object if nothing is given", ->
        mo().should.be.eql []


# Returns a new object with properties determined by those of obj1 and
# obj2.  The properties in obj1 *must* all also appear in obj2.  If an
# obj2 property has value "defaults.required", then it must appear in
# obj1.  For each property P of obj2 not specified in obj1, the
# corresponding value obj1[P] is set (all in a new copy of obj1) to
# be obj2[P].

describe "default", ->
    d = misc.defaults
    required = misc.required

    before =>
        @debug_orig = global.DEBUG
        global.DEBUG = true

    after =>
        global.DEBUG = @debug_orig

    beforeEach =>
        @console_debug_stub = sinon.stub(global.console, "debug")
        @console_trace_stub = sinon.stub(global.console, "trace")

    afterEach =>
        @console_trace_stub.restore()
        @console_debug_stub.restore()

    it "returns a new object", ->
        o1 = {}; o2 = {}
        d(o1, o2).should.not.be.exactly(o1).and.not.exactly(o2)

    it "properties of obj1 must appear in obj2", ->
        obj1 =
            foo: 1
            bar: [1, 2, 3]
            baz:
                foo: "bar"
        obj2 =
            foo: 2
            bar: [1, 2, 3]
            baz:
                foo: "bar"
        exp =
            foo: 1
            bar: [1, 2, 3]
            baz:
                foo: "bar"
        d(obj1, obj2).should.be.eql exp

    it "raises exception for extra arguments", =>
        obj1 = extra: true
        obj2 = {}
        (-> d(obj1, obj2)).should.throw /got an unexpected argument 'extra'/
        @console_trace_stub.calledOnce.should.be.true()
        @console_debug_stub.getCall(0).args[0].should.match /(obj1={"extra":true}, obj2={})/

    it "doesn't raises exception if extra arguments are allowed", =>
        obj1 = extra: true
        obj2 = {}
        d(obj1, obj2, true)
        @console_trace_stub.should.have.callCount 0
        @console_debug_stub.should.have.callCount 0

    it "raises an exception if obj2 has a `required` property but nothing in obj1", =>
        obj1 = {}
        obj2 =
            r: required
        (-> d(obj1, obj2)).should.throw /property \'r\' must be specified/
        @console_trace_stub.calledOnce.should.be.true()
        @console_debug_stub.getCall(0).args[0].should.match /(obj1={}, obj2={"r":"__!!!!!!this is a required property!!!!!!__"})/

    it "raises an exception if obj2 has a `required` property but is undefined in obj1", =>
        obj1 =
            r: undefined
        obj2 =
            r: required
        (-> d(obj1, obj2)).should.throw /property \'r\' must be specified/
        @console_trace_stub.calledOnce.should.be.true()
        @console_debug_stub.getCall(0).args[0].should.match /(obj1={}, obj2={"r":"__!!!!!!this is a required property!!!!!!__"})/


describe 'merge', ->
    merge = misc.merge
    it 'checks that {a:5} merged with {b:7} is {a:5,b:7}', ->
        merge({a:5},{b:7}).should.eql {a:5,b:7}
    it 'checks that x={a:5} merged with {b:7} mutates x to be {a:5,b:7}', ->
        x = {a:5}; merge(x,{b:7})
        x.should.eql {a:5,b:7}
    it 'checks that duplicate keys are overwritten by the second entry', ->
        a = {x:1, y:2}
        b = {x:3}
        merge(a, b)
        a.should.eql {x:3, y:2}
    it 'variable number of arguments are supported', ->
        a = {x:1}; b = {y:2}; c = {z:3}; d = {u:4}; w ={v:5, x:0}
        r = merge(a, b, c, d, w)
        res = {x:0, y:2, z:3, u:4, v:5}
        r.should.eql res
        a.should.eql res

describe 'cmp', ->
    cmp = misc.cmp
    it 'compares 4 and 10 and returns a negative number', ->
        cmp(4, 10).should.be.below 0
    it 'compares 10 and 4 and returns a positive number', ->
        cmp(10, 4).should.be.above 0
    it 'compares 10 and 10 and returns 0', ->
        cmp(10, 10).should.be.exactly 0

describe "walltime functions", ->
    @t0 = 10000000
    describe "mswalltime measures in milliseconds", =>
        it "should be in milliseconds", =>
            misc.mswalltime().should.be.below 10000000000000
        it "computes differences", =>
            misc.mswalltime(@t0).should.be.above 1000000000000
    describe "walltime measures in seconds", =>
        it "should be in seconds", =>
            misc.walltime().should.be.above 1435060052
            misc.walltime(1000 * @t0).should.be.below 100000000000

describe "uuid", ->
    uuid = misc.uuid
    cnt = misc.count
    uuid_test = (uid) ->
        cnt(uid, "-") == 3 and u.length == 36
    ivuuid = misc.is_valid_uuid_string
    it "generates random stuff in a certain pattern", ->
        ids = []
        for i in [1..100]
            u = uuid()
            ids.should.not.containEql u
            ids.push(u)
            u.should.have.lengthOf(36)
            cnt(u, "-").should.be.exactly 4
            ivuuid(u).should.be.true()

    describe "is_valid_uuid_string", ->
        ivuuid = misc.is_valid_uuid_string
        it "checks the UUID pattern", ->
            ivuuid('C56A4180-65AA-42EC-A945-5FD21DEC').should.be.false()
            ivuuid("").should.be.false()
            ivuuid("!").should.be.false()
            ivuuid("c56a4180-65aa-4\nec-a945-5fd21dec0538").should.be.false()
            ivuuid("77897c43-dbbc-4672 9a16-6508f01e0039").should.be.false()
            ivuuid("c56a4180-65aa-42ec-a945-5fd21dec0538").should.be.true()
            ivuuid("77897c43-dbbc-4672-9a16-6508f01e0039").should.be.true()

describe "test_times_per_second", ->
    it "checks that x*x runs really fast", ->
        misc.times_per_second((x) -> x*x).should.be.greaterThan 10000

describe "to_json", ->
    to_json = misc.to_json
    it "converts a list of objects to json", ->
        input = ['hello', {a:5, b:37.5, xyz:'123'}]
        exp = '["hello",{"a":5,"b":37.5,"xyz":"123"}]'
        to_json(input).should.be.eql(exp).and.be.a.string
    it "behaves fine with empty arguments", ->
        to_json([]).should.be.eql('[]')

describe "from_json", ->
    from_json = misc.from_json
    it "parses a JSON string", ->
        input = '["hello",{"a":5,"b":37.5,"xyz":"123"}]'
        exp = ['hello', {a:5, b:37.5, xyz:'123'}]
        from_json(input).should.eql(exp).and.be.an.object
    it "converts from a string to Javascript and properly deals with ISO dates", ->
        # TODO what kind of string should this match?
        dstr = '"2015-01-02T03:04:05+00:00"'
        exp = new Date(2015, 0, 2, 3, 2, 5)
        #expect(from_json(dstr)).toBeA(Date).toEqual exp
    it "throws an error for garbage", ->
        (-> from_json '{"x": ]').should.throw /^Unexpected token/

describe "to_safe_str", ->
    tss = misc.to_safe_str
    it "removes keys containing pass", ->
        exp = '{"remove_pass":"(unsafe)","me":"not"}'
        tss({"remove_pass": "yes", "me": "not"}).should.eql exp
    it "removes key where the value starts with sha512$", ->
        exp = '{"delme":"(unsafe)","x":42}'
        tss({"delme": "sha512$123456789", "x": 42}).should.eql exp
    it "truncates long string values when serializing an object", ->
        large =
            delme:
                yyyyy: "zzzzzzzzzzzzzz"
                aaaaa: "bbbbbbbbbbbbbb"
                ccccc: "dddddddddddddd"
                eeeee: "ffffffffffffff"
            keep_me: 42
        exp = '{"delme":"[object]","keep_me":42}'
        tss(large).should.be.eql exp

describe "dict, like in Python", ->
    dict = misc.dict
    it "converts a list of tuples to a mapping", ->
        input = [["a", 1], ["b", 2], ["c", 3]]
        dict(input).should.eql {"a":1, "b": 2, "c": 3}
    it "throws on tuples longer than 2", ->
        input = [["foo", 1, 2, 3]]
        (-> dict(input)).should.throw /unexpected length/

describe "remove, like in python", ->
    rm = misc.remove
    it "removes the first occurrance in a list", ->
        input = [1, 2, "x", 8, "y", "x", "zzz", [1, 2], "x"]
        exp = [1, 2, 8, "y", "x", "zzz", [1, 2], "x"]
        rm(input, "x")
        input.should.be.eql exp
    it "throws an exception if val not in list", ->
        input = [1, 2, "x", 8, "y", "x", "zzz", [1, 2], "x"]
        exp   = [1, 2, "x", 8, "y", "x", "zzz", [1, 2], "x"]
        (-> rm(input, "z")).should.throw /item not in array/
        input.should.eql exp
    it "works with an empty argument", ->
        (-> rm([], undefined)).should.throw /item not in array/

describe "to_iso", ->
    iso = misc.to_iso
    it "correctly creates a truncated date string according to the ISO standard", ->
        d1 = new Date()
        iso(d1).should.containEql(":").and.containEql(":").and.containEql("T")
        d2 = new Date(2015, 2, 3, 4, 5, 6)
        iso(d2).should.eql "2015-03-03T04:05:06"

describe "is_empty_object", ->
    ie = misc.is_empty_object
    it "detects empty objects", ->
        ie({}).should.be.ok()
        ie([]).should.be.ok()
    it "doesn't detect anything else", ->
        #ie("x").should.not.be.ok()
        ie({a:5}).should.not.be.ok()
        ie(b:undefined).should.not.be.ok()
        #ie(undefined).should.not.be.ok()
        #ie(null).should.not.be.ok()
        #ie(false).should.not.be.ok()

describe "len", ->
    l = misc.len
    it "counts the number of keys of an object", ->
        l({}).should.be.exactly 0
        l([]).should.be.exactly 0
        l(a:5).should.be.exactly 1
        l(x:1, y:[1,2,3], z:{a:1, b:2}).should.be.exactly 3

describe "keys", ->
    k = misc.keys
    it "correctly returns the keys of an object", ->
        k({a:5, xyz:'10'}).should.be.eql ['a', 'xyz']
        k({xyz:'10', a:5}).should.be.eql ['xyz', 'a']
    it "doesn't choke on empty objects", ->
        k([]).should.be.eql []
        k({}).should.be.eql []

describe "pairs_to_obj", ->
    pto = misc.pairs_to_obj
    it "convert an array of 2-element arrays to an object", ->
        pto([['a',5], ['xyz','10']]).should.be.eql({a:5, xyz:'10'}).and.be.an.object
    it "doesn't fail for empty lists", ->
        pto([]).should.be.eql({}).and.be.an.object
    #it "and properly throws errors for wrong arguments", ->
    #    (-> pto [["x", 1], ["y", 2, 3]]).should.throw()

describe "obj_to_pairs", ->
    otp = misc.obj_to_pairs
    it "converts an object to a list of pairs", ->
        input =
            a: 12
            b: [4, 5, 6]
            c:
                foo: "bar"
                bar: "foo"
        exp = [["a", 12], ["b", [4,5,6]], ["c", {"bar": "foo", "foo": "bar"}]]
        otp(input).should.be.eql exp

describe "substring_count", =>
    @ssc = misc.substring_count
    @string = "Foofoofoo Barbarbar   BatztztztzTatzDatz  Katz"
    @substr1 = "oofoo"
    @substr2 = "tztz"
    @substr3 = "  "
    it "number of occurrances of a string in a substring", =>
        @ssc(@string, @substr1).should.be.exactly 1
        @ssc(@string, @substr2).should.be.exactly 2
        @ssc(@string, @substr3).should.be.exactly 2
    it "number of occurrances of a string in a substring /w overlapping", =>
        @ssc(@string, @substr1, true).should.be.exactly 2
        @ssc(@string, @substr2, true).should.be.exactly 3
        @ssc(@string, @substr3, true).should.be.exactly 3
    it "counts empty strings", =>
        @ssc(@string, "").should.be.exactly 47


describe "min/max of array", =>
    @a1 = []
    @a2 = ["f", "bar", "batz"]
    @a3 = [6, -3, 7, 3, -99, 4, 9, 9]
    it "minimum works", =>
        misc.min(@a3).should.be.exactly -99
    it "maximum works", =>
        misc.max(@a3).should.be.exactly 9
    it "doesn't work for strings", =>
        misc.max(@a2).should.be.eql NaN
        misc.min(@a2).should.be.eql NaN
    it "fails for empty arrays", =>
        (-> misc.min(@a1)).should.throw /Cannot read property 'reduce' of undefined/
        (-> misc.max(@a1)).should.throw /Cannot read property 'reduce' of undefined/


describe "copy flavours:", =>
    @mk_object= ->
            o1 = {}
            o2 = {ref: o1}
            o = a: o1, b: [o1, o2], c: o2
            [o, o1]
    describe "copy", =>
        c = misc.copy
        it "creates a shallow copy of a map", =>
            [o, o1] = @mk_object()
            co = c(o)
            co.should.have.properties ["a", "b", "c"]
            co.a.should.be.exactly o1
            co.b[0].should.be.exactly o1
            co.c.ref.should.be.exactly o1

    describe "copy", =>
        c = misc.copy
        it "copies a string", =>
            c("foobar").should.be.exactly "foobar"

    describe "copy_without", =>
        it "creates a shallow copy of a map but without some keys", =>
            [o, o1] = @mk_object()
            co = misc.copy_without(o, "b")
            co.should.have.properties ["a", "c"]
            co.a.should.be.exactly o1
            co.c.ref.should.be.exactly o1

        it "also works for an array of filtered keys", =>
            [o, o1] = @mk_object()
            misc.copy_without(o, ["a", "c"]).should.have.properties ["b"]

        it "and doesn't throw for unknown keys", =>
            # TODO: maybe it should
            [o, o1] = @mk_object()
            (-> misc.copy_without(o, "d")).should.not.throw()

    describe "copy_with", =>
        it "creates a shallow copy of a map but only with some keys", =>
            [o, o1] = @mk_object()
            misc.copy_with(o, "a").should.have.properties ["a"]

        it "also works for an array of included keys", =>
            [o, o1] = @mk_object()
            co = misc.copy_with(o, ["a", "c"])
            co.should.have.properties ["a", "c"]
            co.a.should.be.exactly o1
            co.c.ref.should.be.exactly o1

        it "and does not throw for unknown keys", =>
            # TODO: maybe it should
            [o, o1] = @mk_object()
            (-> misc.copy_with(o, "d")).should.not.throw()

    describe "deep_copy", =>
        it "copies nested objects, too", =>
            [o, o1] = @mk_object()
            co = misc.deep_copy(o)
            co.should.have.properties ["a", "b", "c"]

            co.a.should.not.be.exactly o1
            co.b[0].should.not.be.exactly o1
            co.c.ref.should.not.be.exactly o1

            co.a.should.be.eql o1
            co.b[0].should.be.eql o1
            co.c.ref.should.be.eql o1


        it "handles RegExp and Date", =>
            d = new Date(2015,1,1)
            # TODO not sure if those regexp modes are copied correctly
            # this is just a working case, probably not relevant
            r = new RegExp("x", "gim")
            o = [1, 2, {ref: [d, r]}]
            co = misc.deep_copy(o)

            co[2].ref[0].should.be.a.Date
            co[2].ref[1].should.be.a.RegExp

            co[2].ref[0].should.not.be.exactly d
            co[2].ref[1].should.not.be.exactly r

            co[2].ref[0].should.be.eql d
            co[2].ref[1].should.be.eql r


describe "path_split", ->
    ps = misc.path_split
    it "returns {head:..., tail:...} where tail is everything after the final slash", ->
        ps("/").should.be.eql {head: "", tail: ""}
        ps("/HOME/USER").should.be.eql {head: "/HOME", tail: "USER"}
        ps("foobar").should.be.eql {head: "", tail: "foobar"}
        ps("/home/user/file.ext").should.be.eql {head: "/home/user", tail: "file.ext"}


describe "meta_file", ->
    mf = misc.meta_file
    it "constructs a metafile to a given file", ->
        mf("foo", "history").should.be.eql ".foo.sage-history"
        mf("/", "batz").should.be.eql "..sage-batz"
        mf("/home/user/file.ext", "chat").should.be.eql "/home/user/.file.ext.sage-chat"


describe "trunc", ->
    t = misc.trunc
    input = "abcdefghijk"
    it "shortens a string", ->
        exp = "abcde..."
        t(input, 8).should.be.eql exp
    it "raises an error when requested length below 3", ->
        t(input, 3).should.be.eql "..."
        (-> t(input, 2)).should.throw /must be >= 3/
    it "defaults to lenght 1024", ->
        long = ("x" for [1..10000]).join("")
        t(long).should.endWith("...").and.has.length 1024
    it "and handles empty strings", ->
        t("").should.be.eql ""
    it "handles missing argument", ->
        should(t()).be.eql undefined

describe "trunc_left", ->
    tl = misc.trunc_left
    input = "abcdefghijk"
    it "shortens a string from the left", ->
        exp = "...ghijk"
        tl(input, 8).should.be.eql exp
    it "raises an error when requested length below 3", ->
        tl(input, 3).should.be.eql "..."
        (-> tl(input, 2)).should.throw /must be >= 3/
    it "defaults to lenght 1024", ->
        long = ("x" for [1..10000]).join("")
        tl(long).should.startWith("...").and.has.length 1024
    it "handles empty strings", ->
        tl("").should.be.eql ""
    it "handles missing argument", ->
        should(tl()).be.eql undefined

describe "git_author", ->
    it "correctly formats the author tag", ->
        fn = "John"
        ln = "Doe"
        em = "jd@noreply.com"
        misc.git_author(fn, ln, em).should.eql "John Doe <jd@noreply.com>"

describe "canonicalize_email_address", ->
    cea = misc.canonicalize_email_address
    it "removes +bar@", ->
        cea("foo+bar@example.com").should.be.eql "foo@example.com"
    it "does work fine with objects", ->
        cea({foo: "bar"}).should.be.eql '{"foo":"bar"}'

describe "lower_email_address", ->
    lea = misc.lower_email_address
    it "converts email addresses to lower case", ->
        lea("FOO@BAR.COM").should.be.eql "foo@bar.com"
    it "does work fine with objects", ->
        lea({foo: "bar"}).should.be.eql '{"foo":"bar"}'

describe "parse_user_search", ->
    pus = misc.parse_user_search
    it "reads in a name, converts to lowercase tokens", ->
        exp = {email_queries: [], string_queries: [["john", "doe"]]}
        pus("John Doe").should.be.eql exp
    it "reads in a comma separated list of usernames", ->
        exp = {email_queries: [], string_queries: [["j", "d"], ["h", "s", "y"]]}
        pus("J D, H S Y").should.be.eql exp
    it "reads in a angle bracket wrapped email addresses", ->
        exp = {email_queries: ["foo+bar@baz.com"], string_queries: []}
        pus("<foo+bar@baz.com>").should.be.eql exp
    it "reads in email addresses", ->
        exp = {email_queries: ["foo+bar@baz.com"], string_queries: []}
        pus("foo+bar@baz.com").should.be.eql exp
    it "also handles mixed queries and spaces", ->
        exp = {email_queries: ["foo+bar@baz.com", "xyz@mail.com"], string_queries: [["john", "doe"]]}
        pus("   foo+bar@baz.com   , John   Doe  ; <xyz@mail.com>").should.eql exp

describe "delete_trailing_whitespace", ->
    dtw = misc.delete_trailing_whitespace
    it "removes whitespace in a string", ->
        dtw("     ]   łæđ}²đµ·    ").should.be.eql "     ]   łæđ}²đµ·"
        dtw("   bar     ").should.be.eql "   bar"
        dtw("batz  ").should.be.eql "batz"
        dtw("").should.be.eql ""

describe "misc.assert", ->
    it "is throws an Error when condition is not met", ->
        (-> misc.assert(false, new Error("x > 0"))).should.throw "x > 0"
    it "does nothing when condition is met", ->
        (-> misc.assert(true, new Error("x < 0"))).should.not.throw()
    it "is throws a msg wrapped in Error when condition is not met", ->
        (-> misc.assert(false, "x > 0")).should.throw "x > 0"

describe "filename_extension", ->
    fe = misc.filename_extension
    it "properly returns the remainder of a filename", ->
        fe("abc.def.ghi").should.be.exactly "ghi"
        fe("a/b/c/foo.jpg").should.be.exactly "jpg"
        fe('a/b/c/foo.ABCXYZ').should.be.exactly 'ABCXYZ'
    it "and an empty string if there is no extension", ->
        fe("uvw").should.have.lengthOf(0).and.be.a.string
        fe('a/b/c/ABCXYZ').should.be.exactly ""

# TODO not really sure what retry_until_success should actually take care of
# at least: the `done` callback of the mocha framework is called inside a passed in cb inside the function f
describe "retry_until_success", ->

    beforeEach =>
        @log = sinon.spy()
        @fstub = sinon.stub()

    it "calls the function and callback exactly once", (done) =>
        @fstub.callsArgAsync(0)

        misc.retry_until_success
            f: @fstub #(cb) => cb()
            cb: () =>
                sinon.assert.calledTwice(@log)
                done()
            start_delay : 1
            log : @log

    it "tests if calling the cb with an error is handled correctly", (done) =>
        # first, calls the cb with something != undefined
        @fstub.onCall(0).callsArgWithAsync(0, new Error("just a test"))
        # then calls the cb without anything
        @fstub.onCall(1).callsArgAsync(0)

        misc.retry_until_success
            f: @fstub
            cb: () =>
                sinon.assert.calledTwice(@fstub)
                @log.getCall(1).args[0].should.match /err=Error: just a test/
                @log.getCall(2).args[0].should.match /try 2/
                done()
            start_delay : 1
            log: @log

    it "fails after `max_retries`", (done) =>
        # always error
        @fstub.callsArgWithAsync(0, new Error("just a test"))

        misc.retry_until_success
            f: @fstub
            cb: () =>
                @fstub.should.have.callCount 5
                @log.should.have.callCount 10
                @log.getCall(1).args[0].should.match /err=Error: just a test/
                @log.getCall(8).args[0].should.match /try 5\/5/
                done()
            start_delay : 1
            log: @log
            max_tries: 5

describe "retry_until_success_wrapper", ->

    it "is a thin wrapper around RetryUntilSuccess", (done) =>
        ret = misc.retry_until_success_wrapper
            f: () =>
                done()
        ret()

describe "Retry Until Success", ->
    # TODO: there is obvisouly much more to test, or to mock-out and check in detail

    it "will retry to execute a function", (done) =>
        fstub = sinon.stub()
        fstub.callsArg(0)

        ret = misc.retry_until_success_wrapper
            f: fstub
            start_delay  : 1

        ret(() =>
            fstub.should.have.callCount 1
            done())

describe "eval_until_defined", ->
    # TODO

# TODO: this is just a stub
describe "StringCharMapping", ->

    beforeEach =>
        @scm = new misc.StringCharMapping()

    it "the constructor' intial state", =>
        @scm._to_char.should.be.empty()
        @scm._next_char.should.be.eql "B"

    it "works with calling to_string", =>
        # HSY: this just records what it does
        @scm.to_string(["A", "K"]).should.be.eql "BC"

describe "uniquify_string", ->
    it "removes duplicated characters", ->
        s = "aabb ŋ→wbſß?- \nccccccccc\txxxöä"
        res = misc.uniquify_string(s)
        exp = "ab ŋ→wſß?-\nc\txöä"
        res.should.eql exp

describe "PROJECT_GROUPS", ->
    it "checks that there has not been an accedental edit of this array", ->
        act = misc.PROJECT_GROUPS
        exp = ['owner', 'collaborator', 'viewer', 'invited_collaborator', 'invited_viewer']
        act.should.be.eql exp

describe "make_valid_name", ->
    it "removes non alphanumeric chars to create an identifyer fit for using in an URL", ->
        s = "make_valid_name øf th1s \nſŧ¶→”ŋ (without) chöcking on spe\tial ¢ħæ¶æ¢ŧ€¶ſ"
        act = misc.make_valid_name(s)
        exp = "make_valid_name__f_th1s__________without__ch_cking_on_spe_ial___________"
        act.should.be.eql(exp).and.have.length exp.length

describe "parse_bup_timestamp", ->
    it "reads e.g. 2014-01-02-031508 and returns a date object", ->
        input = "2014-01-02-031508"
        act = misc.parse_bup_timestamp("2014-01-02-031508")
        act.should.be.instanceOf Date
        # month starts at 0, but not the day?
        exp = new Date(2014, 0, 2, 3, 15, 8, 0)
        act.should.be.eql exp

describe "hash_string", ->
    hs = misc.hash_string
    it "returns 0 for an empty string", ->
        hs("").should.be.exactly 0
    it "deterministically hashes a string", ->
        s1 = "foobarblablablaöß\næ\tx"
        h1 = hs(s1)
        h1.should.be.eql hs(s1)
        for i in [2..s1.length-1]
            hs(s1.substring(i)).should.not.be.eql h1

describe "parse_hashtags", ->
    ph = misc.parse_hashtags
    it "returns empty array for nothing", ->
        ph().should.eql []
    it "returns empty when no valid hashtags", ->
        ph("no hashtags here!").length.should.be.exactly 0
    it "returns empty when empty string", ->
        ph("").length.should.be.exactly 0
    it "returns correctly for one hashtag", ->
        ph("one #hashtag here").should.eql [[4, 12]]
    it "works for many hashtags in one string", ->
        ph("#many #hashtags here #should #work").should.eql [[0, 5], [6, 15], [21, 28], [29, 34]]
    it "makes sure hash followed by noncharacter is not a hashtag", ->
        ph("#hashtag # not hashtag ##").should.eql [[0,8]]

describe "mathjax_escape", ->
    me = misc.mathjax_escape
    it "correctly escapes the right characters", ->
        me("& < > \" \'").should.eql "&amp; &lt; &gt; &quot; &#39;"
    it "doesn't escape already escaped sequences", ->
        me("&dont;escape").should.eql "&dont;escape"

describe "path_is_in_public_paths", ->
    p = misc.path_is_in_public_paths
    it "returns false for a path with no public paths", ->
        p("path", []).should.be.false()
    it "returns false if path is undefined and there are no public paths -- basically avoid possible hack", ->
        p(null, []).should.be.false()
    it "returns false if path is undefined and there is a public path  -- basically avoid possible hack", ->
        p(null, ["/public/path"]).should.be.false()
    it "returns true if the entire project is public", ->
        p("path", [""]).should.be.true()
    it "returns true if the path matches something in the list", ->
        p("path", ["path_name", "path"]).should.be.true()
    it "returns true if the path is within a public path", ->
        p("path/name", ["path_name", "path"]).should.be.true()
    it "returns true if path ends with .zip and is within a public path", ->
        p("path/name.zip", ["path_name", "path"]).should.be.true()
    it "handles path.zip correctly if it is not in the path", ->
        p("foo/bar.zip", ["foo/baz"]).should.be.false()
    it "returns false if the path is not in the public paths", ->
        p("path", ["path_name", "path/name"]).should.be.false()
    it "doesn't allow relativ path trickery", ->
        p("../foo", ["foo"]).should.be.false()


describe "call_lock", =>
    before =>
        @clock = sinon.useFakeTimers()

    after =>
        @clock.restore()

    beforeEach =>
        @objspy = sinon.spy()
        @o = obj: @objspy, timeout_s: 5

    it "adds a call lock to a given object", =>
        misc.call_lock(@o)
        @objspy.should.have.properties ["_call_lock", "_call_unlock", "_call_with_lock"]

        fspy = sinon.spy()
        @objspy._call_with_lock(fspy)
        @objspy.should.have.properties __call_lock: true
        fspy.should.have.callCount 1

        fspy2 = sinon.spy()
        cbspy2 = sinon.spy()
        @objspy._call_with_lock(fspy2, cbspy2)

        # check that the cb has been called with the error message
        cbspy2.getCall(0).args[0].should.eql "error -- hit call_lock"
        # and the function hasn't been called
        fspy2.should.have.callCount 0

    it "unlocks after the given timeout_s time", =>
        misc.call_lock(@o)

        fspy = sinon.spy()
        @objspy._call_with_lock(fspy)

        # turn clock 6 secs ahead
        @clock.tick 6*1000
        fspy3 = sinon.spy()
        cbspy3 = sinon.spy()
        @objspy._call_with_lock(fspy3, cbspy3)

        cbspy3.should.have.callCount 0
        fspy3.should.have.callCount 1

    it "unlocks when function is called", =>
        fcl = misc.call_lock(@o)

        fspy = sinon.spy()
        cbspy2 = sinon.spy()
        f = () -> fspy()
        @objspy._call_with_lock(f, cbspy2)

        cbspy2.should.have.callCount 0
        fspy.should.have.callCount 1

        # TODO I have no idea how to actually call it in such a way,
        # that this is false
        @objspy.should.have.properties __call_lock: true


describe "timestamp_cmp", ->
    tcmp = misc.timestamp_cmp
    a = timestamp: new Date("2015-01-01")
    b = timestamp: new Date("2015-01-02")

    it "correctly compares timestamps", ->
        tcmp(a, b).should.eql 1
        tcmp(b, a).should.eql -1
        tcmp(a, a).should.eql 0

    it "handles missing timestamps gracefully", ->
        tcmp(a, {}).should.eql -1
        tcmp({}, b).should.eql 1

describe "ActivityLog", =>
    beforeEach =>
        # e1 and e2 are deliberately on the same file
        @e1 =
            id: "1234"
            timestamp: new Date("2015-01-01T12:34:55")
            project_id: "c26db83a-7fa2-44a4-832b-579c18fac65f"
            path: "foo/bar.baz"

        @e2 =
            id: "2345"
            timestamp: new Date("2015-01-02T12:34:56")
            project_id: "c26db83a-7fa2-44a4-832b-579c18fac65f"
            path: "foo/bar.baz"

        @e3 =
            id: "3456"
            timestamp: new Date("2015-01-01T12:34:55")
            project_id: "c26db83a-7fa2-44a4-832b-579c18fac65f"
            path: "x/y.z"
            action: 'c26db83a-7fa2-44a4-832b-579c18fac65f/foo/bar.baz'
            seen_by: "123456789"
            read_by: "123456789"

        @al = misc.activity_log
                    events: [@e1, @e2, @e3]
                    account_id: "123456789"
                    notifications: {}

    describe "constructor", =>
        it "works correctly", =>
            @al.should.have.properties
                notifications:
                    'c26db83a-7fa2-44a4-832b-579c18fac65f/foo/bar.baz':
                        id: '2345'
                        timestamp: new Date("2015-01-02T12:34:56")
                    'c26db83a-7fa2-44a4-832b-579c18fac65f/x/y.z':
                        id: '3456'
                        timestamp: new Date("2015-01-01T12:34:55")
                        "c26db83a-7fa2-44a4-832b-579c18fac65f/foo/bar.baz":
                            "undefined": new Date("2015-01-01T12:34:55")
                        read: new Date("2015-01-01T12:34:55")
                        seen: new Date("2015-01-01T12:34:55")
                account_id: "123456789"

    describe "obj", =>
        it "returns a map with the last notification", =>
            @al.obj().should.eql
                notifications:
                    "c26db83a-7fa2-44a4-832b-579c18fac65f/foo/bar.baz":
                        id: "2345"
                        timestamp: new Date("2015-01-02T12:34:56")
                    "c26db83a-7fa2-44a4-832b-579c18fac65f/x/y.z":
                        id: "3456"
                        timestamp: new Date("2015-01-01T12:34:55")
                        "c26db83a-7fa2-44a4-832b-579c18fac65f/foo/bar.baz":
                            "undefined": new Date("2015-01-01T12:34:55")
                        read: new Date("2015-01-01T12:34:55")
                        seen: new Date("2015-01-01T12:34:55")
                account_id: "123456789"

    describe "process", =>
        it "correctly processes additional events", =>
            @al.process([
                id: "4567"
                timestamp: new Date("2015-01-03T12:34:56")
                project_id: "c26db83a-7fa2-44a4-832b-579c18fac65h"
                path: "x/y.z"
            ])
            @al.notifications.should.eql
                    "c26db83a-7fa2-44a4-832b-579c18fac65f/foo/bar.baz":
                        id: "2345"
                        timestamp: new Date("2015-01-02T12:34:56")
                    "c26db83a-7fa2-44a4-832b-579c18fac65f/x/y.z":
                        id: "3456"
                        timestamp: new Date("2015-01-01T12:34:55")
                        "c26db83a-7fa2-44a4-832b-579c18fac65f/foo/bar.baz":
                            "undefined": new Date("2015-01-01T12:34:55")
                        read: new Date("2015-01-01T12:34:55")
                        seen: new Date("2015-01-01T12:34:55")
                    "c26db83a-7fa2-44a4-832b-579c18fac65h/x/y.z":
                        id: "4567"
                        timestamp: new Date("2015-01-03T12:34:56")

describe "encode_path", ->
    e = misc.encode_path
    it "escapes # and ?", ->
        e("file.html?param#anchor").should.eql "file.html%3Fparam%23anchor"
    it "doesn't escape other path characters", ->
        e("a/b,&$:@=+").should.eql "a/b,&$:@=+"


describe "remove_c_comments", ->
    r = misc.remove_c_comments
    it "removes a /* c style */ comment", ->
        r("start/* remove me */ end").should.eql "start end"
    it "doesn't touch a normal string", ->
        r("foo").should.eql "foo"
    it "removes multiple comments in one string", ->
        r("/* */foo/*remove*/bar").should.eql "foobar"
    it "discards one-sided comments", ->
        r("foo /* bar").should.be.eql "foo /* bar"
        r("foo */ bar").should.be.eql "foo */ bar"
        r("foo */ bar /* baz").should.be.eql "foo */ bar /* baz"


describe "capitalize", ->
    c = misc.capitalize
    it "capitalizes the first letter of a word", ->
        c("foo").should.eql "Foo"
    it "works with non ascii characters", ->
        c("å∫ç").should.eql "Å∫ç"

describe "parse_mathjax returns list of index position pairs (i,j)", ->
    pm = misc.parse_mathjax
    it "but no indices when called on nothing", ->
        pm().should.eql []
    it "correctly for $", ->
        pm("foo $bar$ batz").should.eql [[4, 9]]
    it "correctly works for multiline strings", ->
        s = """
            This is a $formula$ or a huge $$formula$$
            \\begin{align}
            formula
            \\end{align}
            \\section{that's it}
        """
        pm(s).should.be.eql([[ 10, 19 ], [ 30, 41 ], [ 42, 75 ]])
             .and.matchEach (x) -> s.slice(x[0], x[1]).should.containEql "formula"
    it "detects brackets", ->
        s = "\\(foo\\) and \\[foo\\]"
        pm(s).should.eql([[0, 7], [12, 19]])
             .and.matchEach (x) -> s.slice(x[0]+2, x[1]-2).should.eql "foo"
    it "works for other environments", ->
        pm("\\begin{equation}foobar\\end{equation}").should.eql [[0, 36]]
        pm("\\begin{equation*}foobar\\end{equation*}").should.eql [[0, 38]]
        pm('\\begin{align}foobar\\end{align}').should.eql [[0, 30]]
        pm('\\begin{align*}foobar\\end{align*}').should.eql [[0, 32]]
        pm('\\begin{eqnarray}foobar\\end{eqnarray}').should.eql [[0, 36]]
        pm('\\begin{eqnarray*}foobar\\end{eqnarray*}').should.eql [[0, 38]]

describe "replace_all", ->
    ra = misc.replace_all
    it "replaces all occurrences of a string in a string", ->
        ra("foobarbaz", "bar", "-").should.eql "foo-baz"
        ra("x y z", " ", "").should.eql "xyz"
        ra(ra("foo\nbar\tbaz", "\n", ""), "\t", "").should.eql "foobarbaz"
        ra("ſþ¨€¢→æł ¢ħæ¶æ¢ŧ€¶ſ", "æ", "a").should.eql "ſþ¨€¢→ał ¢ħa¶a¢ŧ€¶ſ"


#describe "stripe_date", ->
#    sd = misc.stripe_date
#    it "creates a 'stripe date' (?) out of a timestamp (seconds since epoch)", ->
#        sd(1000000000).should.containEql('Sunday')
#                             .containEql('September')
#                             .containEql("9")
#                             .containEql('2001')


describe "date_to_snapshot_format", ->
    dtsf = misc.date_to_snapshot_format
    it "correctly converts a number-date to the snapshot format", ->
        dtsf(1000000000000).should.be.eql "2001-09-09-014640"
    it "assumes timestamp 0 for no argument", ->
        dtsf().should.be.eql "1970-01-01-000000"
    it "works correctly for Date instances", ->
        dtsf(new Date("2015-01-02T03:04:05+0600")).should.be.eql "2015-01-01-210405"

describe "smileys", ->
    it "replaces strings", ->
        misc.smiley(s : "hey :-) you !!!").should.be.eql "hey 😁 you ⚠"
    it "wraps for html", ->
        res = misc.smiley
            s : "foo :-) bar"
            wrap : ["<span class='x'>", "</span>"]
        res.should.be.eql "foo <span class='x'>😁</span> bar"

describe "human readable list", ->
    thl = misc.to_human_list
    it "handles small lists", ->
        thl([]).should.be.eql ""
    it "single value lists", ->
        thl([1]).should.be.eql "1"
    it "converts longer lists well", ->
        arr = ["a", ["foo", "bar"], 99]
        exp = 'a, foo,bar and 99'
        thl(arr).should.be.eql exp
