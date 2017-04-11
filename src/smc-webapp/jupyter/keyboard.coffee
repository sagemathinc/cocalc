###
Keyboard event handler
###

misc = require('smc-util/misc')

actions = store = undefined
exports.enable_handler = (_actions) ->
    actions = _actions; store = actions.store
    actions.redux.getActions('page').set_active_key_handler(key_handler)

exports.disable_handler = (_actions) ->
    _actions.redux.getActions('page').erase_active_key_handler(key_handler)
    actions = undefined

key_handler = (evt) ->
    if not actions?
        return
    return handler(evt)

COMMANDS =
    'change cell to code' :
        k : [{which:89, mode:'escape'}]
        f : -> actions.set_selected_cell_type('code')

    'change cell to markdown' :
        k : [{which:77, mode:'escape'}]
        f : -> actions.set_selected_cell_type('markdown')

    'enter command mode' :
        k : [{which:27, mode:'edit'}]
        f : ->
            if store.get('mode') == 'escape' and store.get('introspect')?
                actions.clear_introspect()

            if store.getIn(['cm_options', 'options', 'keyMap']) == 'vim'
                # Vim mode is trickier...
                if (store.get("cur_cell_vim_mode") ? 'escape') != 'escape'
                    return
            actions.set_mode('escape')

    'enter edit mode' :
        k : [{which:13, mode:'escape'}]
        f : -> actions.set_mode('edit')

    'move cell down' : undefined

    'move cell up' : undefined

    'move cursor down' :
        k : [{which:40, mode:'escape'}, {which:74, mode:'escape'}]
        f : -> actions.move_cursor(1)

    'move cursor up' :
        k : [{which:38, mode:'escape'}, {which:75, mode:'escape'}]
        f : -> actions.move_cursor(-1)

    'run all cells ' : undefined

    'run all cells above' : undefined

    'run all cells below' : undefined

    'run cell' :
        k : [{which:13, ctrl:true}]
        f : -> actions.run_selected_cells(); actions.set_mode('escape')

    'run cell and insert below' :
        k : [{which:13, alt:true}]
        f : ->
            v = store.get_selected_cell_ids_list()
            actions.move_cursor_after_selected_cells()
            actions.run_selected_cells()
            if store.get('cur_id') in v
                actions.insert_cell(1)
            else
                actions.insert_cell(-1)
            actions.set_mode('edit')

    'run cell and select next' :
        k : [{which:13, shift:true}]
        f : -> actions.shift_enter_run_selected_cells()

    'save notebook' :
        k : [{which:83, ctrl:true}, {which:83, alt:true}]
        f : -> actions.save()

    'split cell at cursor' :
        k : [{ctrl:true, shift:true, which:189}]
        f : -> actions.set_mode('escape'); actions.split_current_cell()

    'zoom in' :
        k : [{ctrl:true, shift:true, which:190}]
        f : -> actions.zoom(1)

    'zoom out' :
        k : [{ctrl:true, shift:true, which:188}]
        f : -> actions.zoom(-1)


json = require('json-stable-stringify')
evt_to_shortcut = (evt) ->
    obj = {which: evt.which}
    for k in ['ctrl', 'shift', 'alt', 'meta']
        if evt[k+'Key']
            obj[k] = true
    obj.mode = store.get('mode')
    return json(obj)

shortcut_to_command = {}
add_shortcut = (s, name, val) ->
    if not s.mode?
        for mode in ['escape', 'edit']
            add_shortcut(misc.merge(s, {mode:mode}), name, val)
        return
    shortcut_to_command[json(s)] = {name:name, val:val}
    if s.alt
        s = misc.copy_without(s, 'alt')
        s.meta = true
        add_shortcut(s, name, val)

for name, val of COMMANDS
    if not val?.k?
        continue
    for s in val.k
        add_shortcut(s, name, val)


handler = (evt) ->
    shortcut = evt_to_shortcut(evt)
    cmd = shortcut_to_command[shortcut]
    console.log 'shortcut', shortcut, cmd
    if cmd?
        cmd.val.f()
        return false
