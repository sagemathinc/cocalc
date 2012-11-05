misc  = require("misc")
async = require("async")

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
            try
                misc.defaults({a:1}, {a:5, b:required})
                test.ok(false)
            catch err
                test.ok(true)
            cb()
        (cb) ->
            try
                misc.defaults({a:1}, {b:7})
                test.ok(false)
            catch err
                test.ok(true)
            cb()
    ], () -> test.done()

    