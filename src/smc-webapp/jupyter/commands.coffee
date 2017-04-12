###
Comprehensive list of Jupyter notebook (version 5) command,
   f : implementation of each using our actions/store
   k : default keyboard shortcut for that command
###

exports.commands = (actions) ->
    store = actions.store
    id = -> store.get('cur_id')

    'cell toolbar none':
        m : 'None'

    'cell toolbar metadata':
        m : 'Edit Metadata'

    'cell toolbar slideshow':
        m : 'Slideshow'

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

    'close and halt' :
        m : 'Close and Halt'
        f : ->
            actions.signal('SIGKILL')
            actions.file_open()
            actions.file_action('close_file')

    'close pager' :
        k : [{which:27, mode:'escape'}]
        f : -> actions.clear_introspect() if store.get('introspect')?

    'confirm restart kernel' :
        k : [{"mode":"escape","which":48,twice:true}]
        f : ->
            actions.confirm_dialog
                title   : 'Restart kernel?'
                body    : 'Do you want to restart the current kernel?  All variables will be lost.'
                choices : [{title:'Continue Running'}, {title:'Restart', style:'danger', default:true}]
                cb      : (choice) ->
                    if choice == 'Restart'
                        actions.signal('SIGKILL')

    'confirm restart kernel and clear output' :
        f : ->
            actions.confirm_dialog
                title   : 'Restart kernel and clear all output?'
                body    : 'Do you want to restart the current kernel and clear all output?  All variables and outputs will be lost, though most past output is always available in TimeTravel.'
                choices : [{title:'Continue Running'}, {title:'Restart and Clear All Outputs', style:'danger', default:true}]
                cb      : (choice) ->
                    if choice == 'Restart and Clear All Outputs'
                        actions.signal('SIGKILL')
                        actions.clear_all_outputs()

    'confirm restart kernel and run all cells' :
        f : ->
            actions.confirm_dialog
                title   : 'Restart kernel and re-run the whole notebook?'
                body    : 'Are you sure you want to restart the current kernel and re-execute the whole notebook?  All variables and output will be lost, though most past output is always available in TimeTravel.'
                choices : [{title:'Continue Running'}, {title:'Restart and Run All Cells', style:'danger', default:true}]
                cb      : (choice) ->
                    if choice == 'Restart and Run All Cells'
                        actions.signal('SIGKILL')
                        actions.run_all_cells()

    'confirm shutdown kernel' :
        f : ->
            actions.confirm_dialog
                title   : 'Shutdown kernel?'
                body    : 'Do you want to shutdown the current kernel?  All variables will be lost.'
                choices : [{title:'Continue Running'}, {title:'Shutdown', style:'danger', default:true}]
                cb      : (choice) ->
                    if choice == 'Shutdown'
                        actions.signal('SIGKILL')

    'copy cell' :
        m : 'Copy cells'
        k : [{"mode":"escape","which":67, alt:true}, {"mode":"escape","which":67}, {"mode":"escape","which":67, ctrl:true}]
        f : -> actions.copy_selected_cells()

    'copy cell attachments' : undefined   # no clue what this means or is for... but I can guess...

    'cut cell' :
        m : 'Cut cells'
        k : [{"mode":"escape","which":88, alt:true}, {"mode":"escape","which":88}, {"mode":"escape","which":88, ctrl:true}]
        f : -> actions.cut_selected_cells()

    'cut cell attachments' : undefined    # no clue

    'delete cell' :  # jupyter has this but with d,d as shortcut, since they have no undo.
        m : 'Delete Cells'
        k : [{"mode":"escape","which":8,twice:true}, {"mode":"escape","which":68,twice:true}]
        f : -> actions.delete_selected_cells()

    'duplicate notebook' :
        m : 'Make a Copy...'
        f : -> actions.file_action('duplicate')

    'edit keyboard shortcuts' :
        f : -> actions.show_keyboard_shortcuts()

    'edit notebook metadata' :  # TODO
        m : 'Edit Notebook Metadata'

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
        m : 'Find and Replace'
        k : [{"mode":"escape","which":70}, {"alt":true,"mode":"escape","which":70}]
        f : -> actions.show_find_and_replace()

    'global undo':
        m : 'Undo'
        d : 'Global user-aware undo.  Undo the last change *you* made to the notebook.'
        k : [{alt:true,"mode":"escape","which":90}, {ctrl:true,"mode":"escape","which":90}]
        f : -> actions.undo()

    'global redo':
        m : 'Redo'
        d : 'Global user-aware redo.  Redo the last change *you* made to the notebook.'
        k : [{alt:true,"mode":"escape","which":90, shift:true}, {ctrl:true,"mode":"escape","which":90, shift:true}]
        f : -> actions.redo()

    'hide all line numbers' :
        f : -> actions.set_line_numbers(false)

    'hide header' :
        f : -> actions.set_header_state(true)

    'hide toolbar' :
        f : -> actions.set_toolbar_state(false)

    'ignore' : undefined   # no clue what this means

    'insert cell above' :
        k : [{"mode":"escape","which":65}]
        f : -> actions.insert_cell(-1)

    'insert cell below' :
        k : [{"mode":"escape","which":66}]
        f : -> actions.insert_cell(1)

    'insert image' :
        f : -> actions.insert_image()

    'interrupt kernel' :
        k : [{"mode":"escape","which":73,twice:true}]
        f : -> actions.signal('SIGINT')

    'merge cell with next cell' :
        m : 'Merge Cell Below'
        f : -> actions.merge_cell_below()

    'merge cell with previous cell' :
        m : 'Merge Cell Above'
        f : -> actions.merge_cell_above()

    'merge cells' :
        m : 'Merge Selected Cells'
        k : [{"mode":"escape","shift":true,"which":77}]
        f : -> actions.merge_cells()

    'merge selected cells' :   # why is this in jupyter; it's the same as the above?
        f : -> actions.merge_cells()

    'move cell down' :
        m : 'Move Cell Down'
        k : [{"alt":true,"mode":"escape","which":40}]
        f : -> actions.move_selected_cells(1)

    'move cell up' :
        m : 'Move Cell Up'
        k : [{"alt":true,"mode":"escape","which":38}]
        f : -> actions.move_selected_cells(-1)

    'move cursor down' :
        f : -> actions.move_edit_cursor(1)

    'move cursor up' :
        f : -> actions.move_edit_cursor(-1)

    'new notebook' :
        m : "New..."
        f : -> actions.file_new()

    'open file':
        m : 'Open...'
        f : -> actions.file_open()

    'paste cell above' :
        m : 'Paste Cells Above'
        k : [{"mode":"escape","shift":true,"which":86}, {"mode":"escape","shift":true,ctrl:true,"which":86},{"mode":"escape","shift":true,alt:true,"which":86}]
        f : -> actions.paste_cells(-1)

    'paste cell attachments' : undefined   # TODO ? not sure what the motivation is...

    'paste cell below' :  # jupyter has this with the keyboard shortcut for paste; clearly because they have no undo
        m : 'Paste Cells Below'
        f : -> actions.paste_cells(1)

    'paste cell and replace' :   # jupyter doesn't have this but it's supposed to be normal paste behavior
        m : 'Paste Cells & Replace'
        k : [{"mode":"escape",alt:true,"which":86}, {"mode":"escape","which":86}, {"mode":"escape",ctrl:true,"which":86}]
        f : ->
            if store.get('sel_ids')?.size > 0
                actions.paste_cells(0)
            else
                actions.paste_cells(1)

    'print preview' :
        m : 'Print Preview...'
        f : -> actions.print_preview()

    'rename notebook' :
        m : 'Rename...'
        f : -> actions.file_action('rename')

    'restart kernel' :
        f : -> actions.signal('SIGKILL')

    'restart kernel and clear output' :
        f : ->
            actions.signal('SIGKILL')
            actions.clear_all_outputs()

    'restart kernel and run all cells' :
        f : ->
            actions.signal('SIGKILL')
            actions.run_all_cells()

    'run all cells ' :
        f : -> actions.run_all_cells()

    'run all cells above' :
        f : -> actions.run_all_cells_above()

    'run all cells below' :
        f : -> actions.run_all_cells_below()

    'run cell' :
        k : [{which:13, ctrl:true}]
        f : -> actions.run_selected_cells(); actions.set_mode('escape'); actions.scroll('cell visible')

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
            actions.scroll('cell visible')

    'run cell and select next' :
        k : [{which:13, shift:true}]
        f : -> actions.shift_enter_run_selected_cells(); actions.scroll('cell visible')

    'save notebook' :
        m : 'Save'
        k : [{which:83, alt:true}, {which:83, ctrl:true}]
        f : -> actions.save()

    'scroll cell center' :
        f : -> actions.scroll('cell center')

    'scroll cell top' :
        f : -> actions.scroll('cell top')

    'scroll cell bottom' :
        f : -> actions.scroll('cell bottom')

    'scroll cell visible' :
        f : -> actions.scroll('cell visible')

    'scroll notebook down' :
        k : [{"mode":"escape","which":32}]
        f : -> actions.scroll('list down')

    'scroll notebook up' :
        k : [{"mode":"escape","shift":true,"which":32}]
        f : -> actions.scroll('list up')

    'select all cells' :
        k : [{"alt":true,"mode":"escape","which":65}, {"ctrl":true,"mode":"escape","which":65}]
        f : -> actions.select_all_cells()

    'select next cell' :
        k : [{which:40, mode:'escape'}, {which:74, mode:'escape'}]
        f : -> actions.move_cursor(1); actions.unselect_all_cells(); actions.scroll('cell visible')

    'select previous cell' :
        k : [{which:38, mode:'escape'}, {which:75, mode:'escape'}]
        f : -> actions.move_cursor(-1); actions.unselect_all_cells(); actions.scroll('cell visible')

    'show all line numbers':
        f : -> actions.set_line_numbers(false)

    'show command palette':
        k : [{"alt":true,"mode":"escape","shift":true,"which":80}]
        f : -> actions.show_keyboard_shortcuts()

    'show header':
        f : -> actions.set_header_state(false)

    'show keyboard shortcuts':
        k : [{"mode":"escape","which":72}]
        f : -> actions.show_keyboard_shortcuts()

    'show toolbar':
        f : -> actions.set_toolbar_state(true)

    'shutdown kernel':
        f : -> actions.signal('SIGKILL')

    'split cell at cursor' :
        m : 'Split Cell'
        k : [{ctrl:true, shift:true, which:189}]
        f : -> actions.set_mode('escape'); actions.split_current_cell()

    'time travel' :
        m : 'Time Travel...'
        f : -> actions.show_history_viewer()

    'toggle all cells output collapsed':
        f : -> actions.toggle_all_outputs('collapsed')

    'toggle all cells output scrolled':
        f : -> actions.toggle_all_outputs('scrolled')

    'toggle all line numbers':
        m : 'Toggle Line Numbers'
        k : [{"mode":"escape","shift":true,"which":76}]
        f : -> actions.toggle_line_numbers()

    'toggle cell line numbers':
        k : [{"mode":"escape","which":76}]
        f : -> actions.toggle_cell_line_numbers(id())

    'toggle cell output collapsed':
        k : [{"mode":"escape","which":79}]
        f : -> actions.toggle_selected_outputs('collapsed')

    'toggle cell output scrolled':
        k : [{"mode":"escape","which":79, shift:true}]
        f : -> actions.toggle_selected_outputs('scrolled')

    'toggle header':
        m : 'Toggle Header'
        f : -> actions.toggle_header()

    'toggle rtl layout': undefined

    'toggle toolbar':
        f : -> actions.toggle_toolbar()

    'trust notebook':
        m : 'Trust Notebook'
        f : -> actions.trust_notebook()

    'undo cell deletion':
        k : [{"mode":"escape","which":90}]
        f : -> actions.undo()

    'user interface tour' : undefined

    'zoom in' :
        m : 'Zoom In'
        k : [{ctrl:true, shift:true, which:190}]
        f : -> actions.zoom(1)

    'zoom out' :
        m : 'Zoom Out'
        k : [{ctrl:true, shift:true, which:188}]
        f : -> actions.zoom(-1)

