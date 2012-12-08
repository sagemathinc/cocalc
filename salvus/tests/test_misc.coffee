misc  = require("misc")
async = require("async")

exports.test_merge = (test) ->
    test.expect(2)
    async.series [
        (cb) -> test.deepEqual(misc.merge({}, {a:5}, {b:10}, {a:20, xyz:0}), {a:20, b:10, xyz:0}); cb()
        (cb) ->
            x = {a:5}; y = {b:10}; z = {a:20, xyz:0}
            misc.merge(x, y, z)
            test.deepEqual(x, {a:20, b:10, xyz:0})
            cb()
    ], () -> test.done()

exports.test_random_choice = (test) ->
    test.expect(2)
    async.series [
        (cb) -> test.equal(misc.random_choice([123]), 123); cb()
        (cb) -> v=[123, 'abc', 0, null]; test.ok(misc.random_choice(v) in v); cb()
    ], () -> test.done()

exports.test_min_object = (test) ->
    test.expect(1)
    target = {a:7, b:15, xyz:5.5}
    upper_bound = {a:5, b:20, xyz:-2}
    misc.min_object(target, upper_bound)
    test.deepEqual(target, {a:5, b:15, xyz:-2})
    test.done()

exports.test_defaults = (test) ->
    test.expect(4)
    required = misc.defaults.required
    async.series [
        (cb) -> test.deepEqual(misc.defaults({a:1, xyz:'hi'}, {a:5, b:7, xyz:required}), {a:1, b:7, xyz:'hi'}); cb()
        (cb) -> test.deepEqual(misc.defaults({a:1, xyz:'hi'}, {a:5, b:undefined, xyz:required}), {a:1, xyz:'hi'}); cb()        
        (cb) ->
            console.log("The traceback below is supposed to happen!")
            try
                misc.defaults({a:1}, {a:5, b:required})
                test.ok(false)
            catch err
                test.ok(true)
            cb()
        (cb) ->
            console.log("The traceback below is supposed to happen!")            
            try
                misc.defaults({a:1}, {b:7})
                test.ok(false)
            catch err
                test.ok(true)
            cb()
    ], () -> test.done()

exports.test_mswalltime = (test) ->
    test.expect(1)
    tm = misc.mswalltime()
    setTimeout((() -> test.ok(misc.mswalltime() - tm >= 1000); test.done()), 1500)

exports.test_walltime = (test) ->
    test.expect(1)
    tm = misc.walltime()
    setTimeout((() -> test.ok(misc.walltime() - tm <= 2 and misc.walltime() - tm >= 1.3); test.done()), 1500)

exports.test_uuid = (test) ->
    test.expect(2)
    u = misc.uuid()
    test.ok('-' in u and u.length==36)   # not really much of a test!
    test.ok(misc.uuid() != u)            # should be highly random
    test.done()

exports.test_times_per_second = (test) ->
    test.expect(1)
    test.ok(misc.times_per_second((x) -> x*x) > 100000)
    test.done()

exports.test_to_json = (test) ->
    test.expect(1)
    test.equal(misc.to_json(['hello', {a:5, b:37.5, xyz:'123'}]), '["hello",{"a":5,"b":37.5,"xyz":"123"}]')
    test.done()

exports.test_from_json = (test) ->
    test.expect(1)
    v = ['hello', {a:5, b:37.5, xyz:'123'}]
    test.deepEqual(misc.from_json(misc.to_json(v)), v)
    test.done()

exports.test_to_iso = (test) ->
    test.expect(4)
    s = misc.to_iso(new Date())
    test.ok('-' in s)
    test.ok(':' in s)
    test.ok('T' in s)
    s = misc.to_iso(new Date('2012-11-04T20:16:35-0800'))
    test.equal(s,'2012-11-04T20:16:35')
    test.done()

exports.test_is_empty_object = (test) ->
    test.expect(4)
    test.ok(misc.is_empty_object({}))
    test.ok(misc.is_empty_object([]))
    test.equal(misc.is_empty_object({a:5}), false)
    test.equal(misc.is_empty_object({a:undefined}), false)
    test.done()

exports.test_len = (test) ->
    test.expect(4)
    test.equal(misc.len({}), 0)
    test.equal(misc.len([]), 0)
    test.equal(misc.len({a:5}), 1)
    test.equal(misc.len({a:5, b:7, d:'hello'}), 3)
    test.done()

exports.test_keys = (test) ->
    test.expect(3)
    test.equal(misc.keys({a:5})[0], 'a')
    k = misc.keys({a:5, xyz:'10'})
    test.ok(k[0] == 'a')
    test.ok(k[1] == 'xyz')
    test.done()

exports.test_pairs_to_obj = (test) ->
    test.expect(1)
    test.deepEqual(misc.pairs_to_obj([['a',5], ['xyz','10']]), {a:5, xyz:'10'})
    test.done()

exports.test_filename_extension = (test) ->
    test.expect(4)
    test.equal(misc.filename_extension('foo.txt'), 'txt')
    test.equal(misc.filename_extension('a/b/c/foo.jpg'), 'jpg')
    test.equal(misc.filename_extension('a/b/c/foo.ABCXYZ'), 'ABCXYZ')
    test.equal(misc.filename_extension('a/b/c/foo'), undefined)
    test.done()
