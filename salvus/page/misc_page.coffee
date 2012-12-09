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



exports.diff = (before, after) ->
    # Return sequence of replacements {at:, change:, to:}
    # that transform the string before to the string after.
    # This is an absured (!) naive implementation for testing; something much
    # more optimized should be done (or find a library).
    if not before?
        return [{at:0, replace:'', with:after}]
    diff = []
    i = 0
    while i < before.length and before[i] == after[i]
        i += 1
    # We now know that they differ at position i
    if i <= after.length
        diff.push({at:i, replace:before.slice(i), with:after.slice(i)})
    return diff
