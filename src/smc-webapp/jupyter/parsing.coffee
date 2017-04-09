###
Functions for parsing input, etc.
###

misc = require('smc-util/misc')

exports.run_mode = (code, last_type) ->
    if not code  # code assumed trimmed
        return 'empty'
    else if last_type != 'comment' and misc.endswith(code, '??')
        return 'show_source'
    else if last_type != 'comment' and misc.endswith(code, '?')
        return 'show_doc'
    else
        return 'execute'