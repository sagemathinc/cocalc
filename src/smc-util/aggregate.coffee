###
Async aggregate.

Given a function f that takes an object of the form {foo:?, bar:?, other:?,..., cb:..., aggregate:5}
and key_fields say ['foo', 'bar'] as input, call f only once with given input
foo/bar and aggregate<=5.
###

{copy_with} = require('./misc')
json_stable = require('json-stable-stringify')

exports.aggregate = (key_fields, f) ->
    state = {}  # in the closure, so scope is that of this function we are making below.
    # Construct and return new function: if called with aggregate not
    # set or false-ish, just calls f.  Othwerwise, aggregates calls.
    return (opts) ->
        if not opts.aggregate
            # default behavior, since aggregate not set
            f(opts)
            return
        key = json_stable(copy_with(opts, key_fields))
        current = state[key]
        if current?
            if current.aggregate >= opts.aggregate
                # already running with old enough aggregate value -- just wait and return as part of that
                current.callbacks.push(opts.cb)
            else
                # already running, but newer aggregate value.  We will run this one once the current one is done.
                current.next.push(opts)
            return
        # Nothing is going on right now with the given key.  Evaluate f.
        state[key] =
            aggregate : opts.aggregate   # aggregate value for current run
            next      : []               # things requested to be run in the future
            callbacks : [opts.cb]        # callbacks to call when this evaluation completes
        # TODO