###
Functions for parsing input, etc.
###

misc = require('smc-util/misc')

last_style = (code, mode='python') ->
    style = undefined
    CodeMirror.runMode code, mode, (text, s) ->
        style = s
    return style

exports.run_mode = (code, mode) ->
    if not code  # code assumed trimmed
        return 'empty'
    else if misc.endswith(code, '??')
        if last_style(code, mode) in ['comment', 'string']
            return 'execute'
        else
            return 'show_source'
    else if misc.endswith(code, '?')
        if last_style(code, mode) in ['comment', 'string']
            return 'execute'
        else
            return 'show_doc'
    else
        return 'execute'
