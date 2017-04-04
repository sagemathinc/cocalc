###
Keyboard event handler
###

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
    #console.log evt.which
    switch evt.which
        when 13   # enter for evaluate
            if evt.ctrlKey
                actions.run_selected_cells()
                actions.set_mode('escape')
                return false
            else if evt.shiftKey
                actions.shift_enter_run_selected_cells()
                return false
            else if evt.altKey or evt.metaKey
                v = store.get_selected_cell_ids_list()
                actions.move_cursor_after_selected_cells()
                actions.run_selected_cells()
                if store.get('cur_id') in v
                    actions.insert_cell(1)
                else
                    actions.insert_cell(-1)
                actions.set_mode('edit')
                return false
            else if store.get('mode') == 'escape'
                actions.set_mode('edit')
                id = store.get('cur_id')
                if store.getIn(['cells', id, 'cell_type']) == 'markdown'
                    actions.set_md_cell_editing(id)
                return false

        when 27  # escape key
            if store.get('mode') == 'escape' and store.get('introspect')?
                actions.clear_introspect()
            actions.set_mode('escape')

        when 83  # s for save
            if evt.ctrlKey or evt.metaKey or evt.altKey
                actions.save()
                return false

        when 38, 75  # up
            if store.get('mode') == 'escape'
                actions.move_cursor(-1)

        when 40, 74  # down
            if store.get('mode') == 'escape'
                actions.move_cursor(1)

        when 190 # >
            if evt.ctrlKey and evt.shiftKey
                actions.zoom(1)
                return false

        when 188 # <
            if evt.ctrlKey and evt.shiftKey
                actions.zoom(-1)
                return false


