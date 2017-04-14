###
Keyboard event handler
###

json = require('json-stable-stringify')

misc = require('smc-util/misc')

commands = require('./commands')

exports.evt_to_obj = evt_to_obj = (evt, mode) ->
    obj = {which: evt.which}
    for k in ['ctrl', 'shift', 'alt', 'meta']
        if evt[k+'Key']
            obj[k] = true
    if mode?
        obj.mode = mode
    return obj

evt_to_shortcut = (evt, mode) ->
    return json(evt_to_obj(evt, mode))

exports.create_key_handler = (actions) ->
    shortcut_to_command = {}
    add_shortcut = (s, name, val) ->
        delete s.twice  # TODO: not implemented yet.
        if not s.mode?
            for mode in ['escape', 'edit']
                add_shortcut(misc.merge(s, {mode:mode}), name, val)
            return
        shortcut_to_command[json(s)] = {name:name, val:val}
        if s.alt
            s = misc.copy_without(s, 'alt')
            s.meta = true
            add_shortcut(s, name, val)

    for name, val of commands.commands(actions)
        if not val?.k?
            continue
        for s in val.k
            add_shortcut(s, name, val)

    handler = (evt) ->
        shortcut = evt_to_shortcut(evt, actions.store.get('mode'))
        cmd = shortcut_to_command[shortcut]
        #console.log 'shortcut', shortcut, cmd
        if cmd?
            cmd.val.f()
            return false

    return handler
