###
Comprehensive list of Jupyter notebook (version 5) command,
   f : implementation of each using our actions/store
   k : default keyboard shortcut for that command
###

exports.commands = (actions) ->
    store = actions.store

    obj =
        'change cell to code' :
            k : [{which:89, mode:'escape'}]
            f : -> actions.set_selected_cell_type('code')

        'change cell to heading 1' : undefined
        'change cell to heading 2' : undefined
        'change cell to heading 3' : undefined
        'change cell to heading 4' : undefined
        'change cell to heading 5' : undefined
        'change cell to heading 6' : undefined

        'change cell to markdown' :
            k : [{which:77, mode:'escape'}]
            f : -> actions.set_selected_cell_type('markdown')

        'change cell to raw' :
            k : [{which:82, mode:'escape'}]
            f : -> actions.set_selected_cell_type('raw')

        'clear all cells output' : undefined

        'clear cell output' : undefined

        'close pager' :
            k : [{which:27, mode:'escape'}]
            f : -> actions.clear_introspect() if store.get('introspect')?

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

        'extend selection above' : undefined

        'extend selection below' : undefined

        'find and replace' : undefined

        'hide all line numbers' : undefined

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

        'paste cell above' : undefined

        'paste cell attachments' : undefined

        'paste cell below' : undefined

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

        'scroll cell center' : undefined

        'scroll cell top' : undefined

        'scroll notebook down' : undefined

        'scroll notebook up' : undefined

        'select next cell' : 
            k : [{which:40, mode:'escape'}, {which:74, mode:'escape'}]
            f : -> actions.move_cursor(1)

        'select previous cell' :
            k : [{which:38, mode:'escape'}, {which:75, mode:'escape'}]
            f : -> actions.move_cursor(-1)

        'show all line numbers': undefined

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

        'toggle all line numbers': undefined

        'toggle cell line numbers': undefined

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
