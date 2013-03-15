async = require('async')
{defaults, required, uuid, keys, assert} = require('misc')

# This is a sync'd JSON-able object, which establishes the API.
# The diff transforms the key/values for the state object a very simple way.
class exports.SyncObj
    constructor: () ->
        @init()

    init: () =>
        @id        = uuid()
        @listeners = {}
        @state     = {}

    _apply_diff: (diff) =>
        # Transform our state
        for k, v of diff
            @state[k] = v

    add_listener: (obj) =>   # f must be a function f(id:, diff:, timeout:, cb:), same as .change below.
        @listeners[obj.id] = obj

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
                that.listeners[id].change(opts)

        async.map(keys(@listeners), notify, ((err,results) -> cb?(err)))

class exports.CodeMirrorSession extends exports.SyncObj
    constructor: (opts) ->
        opts = defaults opts,
            content : ''   # a string -- the starting value of the editor
        @init()
        @state.lines= opts.content.split('\n')

    _apply_diff: (diff) =>
        # Transform our state
        if diff.changeObj
            @_apply_changeObj(diff.changeObj)
        # that's all that is implemented at present.

    _apply_changeObj: (changeObj) =>
        # changeObj mustbe a change object, exactly as defined by CodeMirror 3,
        # so it is {from, to, text, removed, next}.

        @_replaceRange(changeObj.text, changeObj.from, changeObj.to)
        if changeObj.next
            @_apply_changeObj(changeObj.next)

    delete_range: (from, to) =>
        if not to?
            return

        if from.line > to.line
            # nothing at all
            return

        lines = @state.lines
        if from.line >= lines.length
            # nothing to do -- beyond the buffer
            return

        if from.line == to.line
            # all on one line
            if from.ch < to.ch
                m = lines[from.line]
                if not m?
                    return
                lines[from.line] = m.slice(0,from.ch) + m.slice(to.ch)
            return
        else
            # Multiple lines:
            # Get content of the line that will remain after deletion.
            remaining = lines[from.line].slice(0, from.ch)
            if lines[to.line]?
                remaining += lines[to.line].slice(to.ch)
            # Delete all lines in the range (except first)
            lines.splice(from.line+1, to.line-from.line)
            if remaining.length > 0
                lines[from.line] = remaining
            else
                lines.splice(from.line, 1)   # just delete it completely.

    insert_at: (string, pos) =>
        # Insert string at the given position pos = {line:?, ch:?}
        lines = @state.lines
        # Add blank lines at the end, as needed
        while lines.length <= pos.line
            lines.push("")

        if string.length == ''
            # nothing more to do
            return

        v = string.split('\n')
        m = lines[pos.line]
        at_end = m.slice(pos.ch)
        if v.length == 1
            # Modify the given line
            lines[pos.line] = m.slice(0, pos.ch) + v[0] + at_end
        else
            v[v.length-1] += at_end
            lines[pos.line] = m.slice(0, pos.ch) + v[0]
            for i in [1...v.length]
                lines.splice(pos.line+i, 0, v[i])  # insert a new line

    replaceRange: (string, from, to) =>
        assert(typeof string == "string", "replaceRange -- first argument must be a string")
        assert(from.ch? and from.line?, "replaceRange -- second argument 'from' must have ch and line properties")
        if not to?
            @insert_at(string, from)
        else
            assert(to.ch? and to.line?, "replaceRange -- third argument 'to' must have ch and line properties")
            @delete_range(from, to)
            @insert_at(string, from)
