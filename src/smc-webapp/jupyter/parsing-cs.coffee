###
Functions for parsing input, etc.
###

misc = require('smc-util/misc')

last_style = (code, mode='python') ->
    style = undefined
    CodeMirror.runMode code, mode, (text, s) ->
        style = s
    return style

exports.run_mode = (code, mode, language) ->
    if not code  # code assumed trimmed
        return 'empty'
    else if language != 'prolog'
        if last_style(code, mode) in ['comment', 'string']
            return 'execute'
        else if misc.endswith(code, '??')
            return 'show_source'
        else if misc.endswith(code, '?')
            return 'show_doc'
    return 'execute'
