###
Comprehensive list of Jupyter notebook (version 5) command,
   f : implementation of each using our actions/store
   k : default keyboard shortcut for that command
###

exports.commands = (actions) ->
    store = actions.store
    id = -> store.get('cur_id')

    'change cell to code' :
        k : [{which:89, mode:'escape'}]
        f : -> actions.set_selected_cell_type('code')

    'change cell to heading 1' :
        k : [{which:49, mode:'escape'}]
        f : -> actions.change_cell_to_heading(id(), 1)
    'change cell to heading 2' :
        k : [{which:50, mode:'escape'}]
        f : -> actions.change_cell_to_heading(id(), 2)
    'change cell to heading 3' :
        k : [{which:51, mode:'escape'}]
        f : -> actions.change_cell_to_heading(id(), 3)
    'change cell to heading 4' :
        k : [{which:52, mode:'escape'}]
        f : -> actions.change_cell_to_heading(id(), 4)
    'change cell to heading 5' :
        k : [{which:53, mode:'escape'}]
        f : -> actions.change_cell_to_heading(id(), 5)
    'change cell to heading 6' :
        k : [{which:54, mode:'escape'}]
        f : -> actions.change_cell_to_heading(id(), 6)

    'change cell to markdown' :
        k : [{which:77, mode:'escape'}]
        f : -> actions.set_selected_cell_type('markdown')

    'change cell to raw' :
        k : [{which:82, mode:'escape'}]
        f : -> actions.set_selected_cell_type('raw')

    'clear all cells output' :
        f : -> actions.clear_all_outputs()

    'clear cell output' :
        f : -> actions.clear_selected_outputs()

    'close pager' :
        k : [{which:27, mode:'escape'}]
        f : -> actions.clear_introspect() if store.get('introspect')?

    'confirm restart kernel' : undefined

    'confirm restart kernel and clear output' : undefined

    'confirm restart kernel and run all cells' : undefined

    'confirm shutdown kernel' : undefined

    'copy cell' :
        k : [{"mode":"escape","which":67}, {"mode":"escape","which":67, alt:true}, {"mode":"escape","which":67, ctrl:true}]
        f : -> actions.copy_selected_cells()

    'copy cell attachments' : undefined

    'cut cell' :
        k : [{"mode":"escape","which":88}, {"mode":"escape","which":88, alt:true}, {"mode":"escape","which":88, ctrl:true}]
        f : -> actions.cut_selected_cells()

    'cut cell attachments' : undefined

    'delete cell' :  # jupyter has this but with d,d as shortcut, since they have no undo.
        k : [{"mode":"escape","which":68}, {"mode":"escape","which":8}]
        f : -> actions.delete_selected_cells()

    'duplicate notebook' : undefined

    'edit keyboard shortcuts' : undefined

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

    'extend selection above' :
        k : [{"mode":"escape","shift":true,"which":75}, {"mode":"escape","shift":true,"which":38}]
        f : -> actions.extend_selection(-1)

    'extend selection below' :
        k : [{"mode":"escape","shift":true,"which":74}, {"mode":"escape","shift":true,"which":40}]
        f : -> actions.extend_selection(1)

    'find and replace' :
        k : [{"mode":"escape","which":70}, {"alt":true,"mode":"escape","which":70}]
        f : -> actions.show_find_and_replace()

    'global undo':
        d : 'Global user-aware undo.  Undo the last change *you* made to the notebook.'
        k : [{alt:true,"mode":"escape","which":90}, {ctrl:true,"mode":"escape","which":90}]
        f : -> actions.undo()

    'global redo':
        d : 'Global user-aware redo.  Redo the last change *you* made to the notebook.'
        k : [{alt:true,"mode":"escape","which":90, shift:true}, {ctrl:true,"mode":"escape","which":90, shift:true}]
        f : -> actions.redo()

    'hide all line numbers' :
        f : -> actions.set_line_numbers(false)

    'hide header' : undefined

    'hide toolbar' : undefined

    'ignore' : undefined

    'insert cell above' : undefined

    'insert cell below' : undefined

    'insert cell image' : undefined

    'interrupt kernel' : undefined

    'merge cell with next cell' : undefined

    'merge cell with previous cell' : undefined

    'merge cells' : undefined

    'merge selected cells' : undefined

    'move cell down' : undefined

    'move cell up' : undefined

    'move cursor down' : undefined

    'move cursor up' : undefined

    'paste cell above' :
        k : [{"mode":"escape","shift":true,"which":86}, {"mode":"escape","shift":true,ctrl:true,"which":86},{"mode":"escape","shift":true,alt:true,"which":86}]
        f : -> actions.paste_cells(-1)

    'paste cell attachments' : undefined

    'paste cell below' :  # jupyter has this with the keyboard shortcut for paste; clearly because they have no undo
        f : -> actions.paste_cells(1)

    'paste cell and replace' :   # jupyter doesn't have this but it's supposed to be normal paste behavior
        k : [{"mode":"escape","which":86}, {"mode":"escape",ctrl:true,"which":86},{"mode":"escape",alt:true,"which":86}]
        f : ->
            if store.get('sel_ids')?.size > 0
                actions.paste_cells(0)
            else
                actions.paste_cells(1)

    'rename notebook' : undefined

    'restart kernel' : undefined

    'restart kernel and clear output' : undefined

    'restart kernel and run all cells' : undefined

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
            if id() in v
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

    'scroll cell center' : undefined

    'scroll cell top' : undefined

    'scroll notebook down' : undefined

    'scroll notebook up' : undefined

    'select next cell' :
        k : [{which:40, mode:'escape'}, {which:74, mode:'escape'}]
        f : -> actions.move_cursor(1); actions.unselect_all_cells()

    'select previous cell' :
        k : [{which:38, mode:'escape'}, {which:75, mode:'escape'}]
        f : -> actions.move_cursor(-1); actions.unselect_all_cells()

    'show all line numbers':
        f : -> actions.set_line_numbers(false)

    'show command palette': undefined

    'show header': undefined

    'show keyboard shortcuts': undefined

    'show toolbar': undefined

    'shutdown kernel': undefined

    'split cell at cursor' :
        k : [{ctrl:true, shift:true, which:189}]
        f : -> actions.set_mode('escape'); actions.split_current_cell()

    'toggle all cells output collapsed': undefined

    'toggle all cells output scrolled': undefined

    'toggle all line numbers':
        k : [{"mode":"escape","shift":true,"which":76}]
        f : -> actions.toggle_line_numbers()

    'toggle cell line numbers':
        k : [{"mode":"escape","which":76}]
        f : -> actions.toggle_cell_line_numbers(id())

    'toggle cell output collapsed': undefined

    'toggle cell output scrolled': undefined

    'toggle header': undefined

    'toggle rtl layout': undefined

    'toggle toolbar': undefined

    'trust notebook': undefined

    'undo cell deletion': undefined

    'zoom in' :
        k : [{ctrl:true, shift:true, which:190}]
        f : -> actions.zoom(1)

    'zoom out' :
        k : [{ctrl:true, shift:true, which:188}]
        f : -> actions.zoom(-1)
