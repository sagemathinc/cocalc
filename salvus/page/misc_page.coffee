exports.is_shift_enter = (e) -> e.which is 13 and e.shiftKey
exports.is_enter       = (e) -> e.which is 13 and not e.shiftKey
exports.is_ctrl_enter  = (e) -> e.which is 13 and e.ctrlKey
exports.is_escape      = (e) -> e.which is 27

# jQuery plugin for spinner (/spin/spin.min.js)
$.fn.spin = (opts) ->
    @each ->
        $this = $(this)
        data = $this.data()
        if data.spinner
            data.spinner.stop()
            delete data.spinner
        if opts isnt false
            data.spinner = new Spinner($.extend({color: $this.css("color")}, opts)).spin(this)
    this



exports.local_diff = (before, after) ->
    # Return object 
    #
    #    {pos:index_into_before, orig:"substring of before starting at pos", repl:"what to replace string by"}
    #
    # that explains how to transform before into after via a substring
    # replace.  This addresses the case when before has been *locally*
    # edited to obtain after.
    #
    if not before?
        return {pos:0, orig:'', repl:after}
    i = 0
    while i < before.length and before[i] == after[i]
        i += 1
    # We now know that they differ at position i
    from = before.slice(i)
    to = after.slice(i)

    # Delete the biggest string in common at the end of from and to.
    # This works well for local edits, which is what this command is
    # aimed at.
    j = from.length - 1
    d = to.length - from.length
    while j >= 0 and d+j>=0 and from[j] == to[d+j]
        j -= 1
    # They differ at position j (resp., d+j)
    from = from.slice(0, j+1)
    to = to.slice(0, d+j+1)
    return {pos:i, from:from, to:to}

