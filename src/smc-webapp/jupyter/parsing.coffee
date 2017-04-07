###
Functions for parsing input, etc.
###

misc = require('smc-util/misc')

exports.run_mode = (code) ->
    if not code
        return 'empty'
    else if misc.endswith(code, '??')  # naive for now!
        return 'show_source'
    else if misc.endswith(code, '?')  # naive for now!
        return 'show_doc'
    else
        return 'execute'