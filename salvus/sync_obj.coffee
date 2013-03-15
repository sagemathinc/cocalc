async = require('async')
{defaults, required, uuid, keys} = require('misc')

# This is a sync'd JSON-able object, which establishes the API.
# The diff transforms the key/values for the state object a very simple way.
class exports.SyncObj
    constructor: () ->
        @id        = uuid()
        @listeners = {}
        @state     = {}

    _apply_diff: (diff) =>
        # Transform our state
        for k, v of opts.diff
            @state[k] = v

    add_listener: (id, f) =>   # f must be a function f(id:, diff:, timeout:, cb:), same as .change below.
        @listeners[id] = f

    change: (opts) =>
        opts = defaults opts,
            diff      : required
            id        : undefined     # id of object sending this change, or not defined if change originates here.
            timeout   : 30
            cb        : undefined     # cb(err)

        # Apply the diff to self -- this gets modified in the derived class.
        @_apply_diff(opts.diff)

        # Send state change to all listeners except sender_id
        sender_id = opts.id
        # Make sure that recipients know that this object is doing the sending.
        opts.id = @id

        that = @
        notify = (id) ->
            if id != sender_id
                that.listeners[id](opts)

        async.map(keys(@listeners), notify, ((err,results) -> cb?(err)))

