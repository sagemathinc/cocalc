misc = require('../misc.coffee')

# ATTN: the order of these require statements is important,
# such that should & sinon work well together
assert  = require "assert"
expect  = require "expect"
sinon   = require "sinon"
should  = require "should"
require 'should-sinon'

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
        it "are working for withArgs", ->
            func = sinon.stub()
            func.withArgs(42).returns(1)
            func.throws()

            expect(func(42)).toEqual(1)
            expect(func).toThrow(Error)

        it "and for onCall", ->
            func = sinon.stub()
            func.onCall(0).throws
            func.onCall(1).returns(42)

            expect(func()).toThrow(Error)
            expect(func()).toEqual(42);

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
    it "also works without a target", ->
        mo(upper_bounds : {a : 42}).should.be.ok

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
            misc.walltime().should.be.below 100000000000

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
            "delme":
                 "yyyyy": "zzzzzzzzzzzzzz"
                 "aaaaa": "bbbbbbbbbbbbbb"
                 "ccccc": "dddddddddddddd"
                 "eeeee": "ffffffffffffff"
            "keep_me":
                 42
        exp = '{"delme":"[object]","keep_me":42}'
        tss(large).should.be.eql exp

describe "json circular export", =>
    @o1 =
        ref: @o2
    @o2 =
        ref: @o1
    @circular =
        name: "circular"
        data:
            left: @o1
            middle: "ok"
            right: @o2

    describe "to_json_circular", =>
        tjc = misc.to_json_circular
        it "uses censor to untangle circular references", =>
            exp = '{"name":"circular","data":{"left":{},"middle":"ok","right":{"ref":{}}}}'
            tjc(@circular).should.eql exp

    describe "censor", =>
        it "is private", ->

describe "dict is like in Python", ->
    dict = misc.dict
    it "converts a list of tuples to a mapping", ->
        input = [["a", 1], ["b", 2], ["c", 3]]
        dict(input).should.eql {"a":1, "b": 2, "c": 3}
    it "throws on tuples longer than 2", ->
        input = [["foo", 1, 2, 3]]
        (-> dict(input)).should.throw /unexpected length/

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
    it "and nothing else", ->
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
    it "and doesn't choke on empty objects", ->
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
# at least: the `done` callback of the mocha framework is called inside a a passed in cb inside the function f
describe "retry_until_success", ->

    beforeEach =>
        @log = sinon.spy()
        @fstub = sinon.stub()

    it "calls the function and callback exactly once", (done) =>
        @fstub.callsArgAsync(0)

        misc.retry_until_success
            f: @fstub #(cb) => cb()
            cb: () =>
                sinon.assert.notCalled(@log)
                done()
            start_delay : 1
            log = @log

    it "tests if calling the cb with an error is handled correctly", (done) =>
        # first, calls the cb with something != undefined
        @fstub.onCall(0).callsArgWithAsync(0, new Error("just a test"))
        # then calls the cb without anything
        @fstub.onCall(1).callsArgAsync(0)

        misc.retry_until_success
            f: @fstub
            cb: () =>
                sinon.assert.calledTwice(@fstub)
                sinon.assert.calledThrice(@log)
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
    it "returns empty when no valid hashtags", ->
        ph("no hashtags here!").length.should.be.exactly 0
    it "returns correctly for one hashtag", ->
        ph("one #hashtag here").should.eql [[4, 12]]
    it "works for many hashtags in one string", ->
        ph("#many #hashtags here #should #work").should.eql [[0, 5], [6, 15], [21, 28], [29, 34]]
    it "makes sure hash followed by noncharacter is not a hashtag", ->
        ph("#hashtag # not hashtag ##").should.eql [[0,8]]







