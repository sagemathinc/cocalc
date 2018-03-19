###
Markdown Editor Actions
###

{Actions}       = require('../code-editor/actions')

class exports.Actions extends Actions
    format_action: (name, param) ->
        console.log 'format_action', name, param