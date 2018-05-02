###
Keyboard shortcuts that are not handled by CodeMirror itself.
###

exports.create_key_handler = (actions) ->
    return (evt) ->

        read_only = !!actions.store.get('read_only')
        mod = evt.ctrlKey or evt.metaKey or evt.altKey or evt.shiftKey

        if read_only
            return

        return