misc = require('../misc.coffee')

assert = require("assert")
expect = require('expect')
sinon = require("sinon")
should = require("should")
require("should-sinon") # should-sinon is broken and everything I tried with "chai" is even more broken

describe 'startswith', ->
    startswith = misc.startswith
    it 'checks that "foobar" starts with foo', ->
        startswith("foobar",'foo').should.be.true
    it 'checks that "foobar" does not start with bar', ->
        startswith("foobar",'bar').should.be.false
    it 'checks that "bar" starts in any of the given strings (a list)', ->
        startswith("barbatz", ["aa", "ab", "ba", "bb"]).should.be.true
    it 'checks that "catz" does not start with any of the given strings (a list)', ->
        startswith("catz", ["aa", "ab", "ba", "bb"]).should.be.false

describe 'random_choice and random_choice_from_obj', ->
    rc = misc.random_choice
    rcfo = misc.random_choice_from_obj
    it 'checks that a randomly chosen element is in the given list', ->
        for i in [1..10]
            l = ["a", 5, 9, {"ohm": 123}, ["batz", "bar"]]
            l.should.containEql rc(l)
    it 'checks that random choice works with only one element', ->
        rc([123]).should.be.eql 123
    it 'checks that random choice with no elements is also fine', ->
        should(rc([])).be.undefined # i.e. undefined or something like that
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
    it "and returns zero if nothing has been found", ->
        cnt("'", '"').should.eql 0

describe "min_object of target and upper_bound", ->
    mo = misc.min_object
    upper_bound = {a:5, b:20, xyz:-2}
    it "modifies target in place", ->
        target = {a:7, b:15, xyz:5.5}
        # the return value are just the values
        mo(target, upper_bound).should.eql [ 5, 15, -2 ]
        target.should.eql {a:5, b:15, xyz:-2}

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
    it 'compares 4 and 10 and returns -1', ->
        cmp(4, 10).should.be.exactly -1
    it 'compares 10 and 4 and returns 1', ->
        cmp(10, 4).should.be.exactly 1
    it 'compares 10 and 10 and returns 0', ->
        cmp(10, 10).should.be.exactly 0

describe "uuid", ->
    uuid = misc.uuid
    cnt = misc.count
    uuid_test = (uid) ->
        cnt(uid, "-") == 3 and u.length == 36
    it "generates random stuff in a certain pattern", ->
        ids = []
        for i in [1..100]
            u = uuid()
            ids.should.not.containEql u
            ids.push(u)
            u.should.have.lengthOf(36)
            cnt(u, "-").should.be.exactly 4

describe "test_times_per_second", ->
    it "checks that x*x runs really fast", ->
        misc.times_per_second((x) -> x*x).should.be.greaterThan 100000

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
    it "and throws an error for garbage", ->
        (-> from_json '{"x": ]').should.throw /^Unexpected token/

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
        ie({}).should.be.ok
        ie([]).should.be.ok
    it "and nothing else", ->
        #ie("x").should.not.be.ok
        ie({a:5}).should.not.be.ok
        ie(b:undefined).should.not.be.ok
        #ie(undefined).should.not.be.ok
        #ie(null).should.not.be.ok
        #ie(false).should.not.be.ok

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
    it "and doesn't choke on empty objects", ->
        k([]).should.be.eql []
        k({}).should.be.eql []

describe "pairs_to_obj", ->
    pto = misc.pairs_to_obj
    it "convert an array of 2-element arrays to an object", ->
        pto([['a',5], ['xyz','10']]).should.be.eql({a:5, xyz:'10'}).and.be.an.object
    it "doesn't fail for empty lists", ->
        pto([]).should.be.eql({}).and.be.an.object
    it "and properly throws errors for wrong arguments", ->
        (-> pto [["x", 1], ["y", 2, 3]]).should.throw

describe "filename_extension", ->
    fe = misc.filename_extension
    it "properly returns the remainder of a filename", ->
        fe("abc.def.ghi").should.be.exactly "ghi"
        fe("a/b/c/foo.jpg").should.be.exactly "jpg"
        fe('a/b/c/foo.ABCXYZ').should.be.exactly 'ABCXYZ'
    it "and an empty string if there is no extension", ->
        fe("uvw").should.have.lengthOf(0).and.be.a.string
        fe('a/b/c/ABCXYZ').should.be.exactly ""

describe "should-sinon", ->
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

        ( -> assert(spy.withArgs(1).calledOnce)).should.raise

    it "unit test", ->
        callback = sinon.spy();
        callback.callCount.should.be.exactly 0
        callback();
        callback.calledOnce.should.be.true
        callback.calledOnce.should.be.false

# TODO not really sure what retry_until_success should actually take care of
# at least: the `done` callback of the mocha framework is called inside a a passed in cb inside the function f
describe "retry_until_success", ->
    rus = misc.retry_until_success
    it "calls the function and callback exactly once", (done) ->
        f = (cb) ->
            cb()
        cb = () =>
            done()
        what =
            f: f
            cb: cb
        rus(what)