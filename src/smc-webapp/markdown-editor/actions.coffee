###
Markdown Editor Actions
###

{Actions}       = require('../code-editor/actions')

class exports.Actions extends Actions
    format_action: (cmd, args) ->
        console.log 'format_action', cmd, args
        cm = @_get_cm()
        if not cm?
            return
        cm.edit_selection({cmd:cmd, args:args})
        cm.focus()