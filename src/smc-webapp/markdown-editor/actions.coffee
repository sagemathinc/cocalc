###
Markdown Editor Actions
###

{Actions}       = require('../code-editor/actions')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        console.log 'install syncstring change handler'
        @_syncstring.on 'change', =>
            @setState(value: @_syncstring.to_str())

        @setState
            types: [{name:'Edit', type:'cm', icon:'edit'}, {name:'View', type:'md', icon:'eye'}]

    format_action: (cmd, args) =>
        console.log 'format_action', cmd, args
        cm = @_get_cm()
        if not cm?
            return
        cm.edit_selection({cmd:cmd, args:args})
        cm.focus()
        @set_syncstring_to_codemirror()