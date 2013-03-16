#################################################################################################
#
# Sync'ed objects -- used to support simultaneous multiple editing sessions by different clients
#
#################################################################################################

async = require('async')
{defaults, required, uuid, keys, assert, to_json} = require('misc')

# This is a sync'd JSON-able object, which establishes the API.
# The diff transforms the key/values for the state object a very simple way.
class exports.SyncObj
    constructor: () ->
        @init()

    init: (opts={}) =>
        opts = defaults opts,
            id : undefined        # if you specify this, it must be a string that defines the object!
        if opts.id?
            @id = opts.id
        else
            @id = uuid()
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
            cb        : undefined     # cb(false) or cb([array of id's of failed listeners])

        # Apply the diff to self -- this gets modified in the derived class.
        @_apply_diff(opts.diff)

        # Send state change to all listeners except sender_id
        sender_id = opts.id
        # Make sure that recipients know that this object is doing the sending.
        opts.id = @id

        # We push to *all* listeners even if an error occurs along the way.
        errors = []
        that = @
        notify = (id, cb) ->
            if id != sender_id
                that.listeners[id].change opts, (err) ->
                    if err
                        errors.push(id)
                    cb()
            else
                cb()

        async.map keys(@listeners), notify,  () ->
            if errors.length > 0 and opts.cb?
                opts.cb(errors)
            else
                opts.cb?()

class exports.CodeMirrorSession extends exports.SyncObj
    constructor: (opts) ->
        opts = defaults opts,
            content : ''   # a string -- the starting value of the editor
        @init()
        @state.lines= opts.content.split('\n')

    getValue: () =>
        return @state.lines.join('\n')

    _apply_diff: (diff) =>
        # Transform our state
        if diff.changeObj?
            @_apply_changeObj(diff.changeObj)
        # that's all that is implemented at present.

    _apply_changeObj: (changeObj) =>
        # changeObj must be a change object, exactly as defined by CodeMirror 3,
        # so it is {from, to, text, removed, next}.

        @replaceRange(changeObj.text, changeObj.from, changeObj.to)
        if changeObj.next
            @_apply_changeObj(changeObj.next)

    delete_range: (from, to) =>
        if not to?
            return

        if from.line > to.line
            # nothing at all to delete
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

    insert_at: (text, pos) =>
        # NOTE -- this function must not modify the array text.
        # Insert string at the given position pos = {line:?, ch:?}
        lines = @state.lines
        # Add blank lines at the end, as needed
        while lines.length <= pos.line
            lines.push("")

        if text.length == 0
            # nothing more to do
            return

        m = lines[pos.line]
        at_end = m.slice(pos.ch)
        if text.length == 1
            # Modify the given line
            lines[pos.line] = m.slice(0, pos.ch) + text[0] + at_end
        else
            lines[pos.line] = m.slice(0, pos.ch) + text[0]
            for i in [1...text.length-1]
                lines.splice(pos.line+i, 0, text[i])  # insert a new line
            lines.splice(pos.line+i, 0, text[text.length-1] + at_end)

    replaceRange: (text, from, to) =>
        assert(from.ch? and from.line?, "replaceRange -- second argument 'from' must have ch and line properties")
        if not to?
            @insert_at(text, from)
        else
            assert(to.ch? and to.line?, "replaceRange -- third argument 'to' must have ch and line properties")
            @delete_range(from, to)
            @insert_at(text, from)
