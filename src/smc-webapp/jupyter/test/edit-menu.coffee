#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Tests of editing the cells in a notebook
###

actions = store = undefined
setup = (cb) -> (require('./setup').setup (err, x) -> actions=x; store=x?.store; cb(err))
{teardown} = require('./setup')

expect  = require('expect')

describe 'tests inserting and deleting a cell -- ', ->
    before(setup)
    after(teardown)

    it 'inserts a new cell', ->
        actions.insert_cell(1)
        expect(store.get('cells').size).toBe(2)

    it 'deletes the selected cell', ->
        id = store.get('cur_id')
        expect(store.get('cell_list').size).toBe(2)
        actions.delete_selected_cells()
        expect(store.get('cell_list').size).toBe(1)

    it 'verify consistency checks after deleting cell', ->
        cell_list = store.get('cell_list')
        expect(cell_list.get(0)).toBe(store.get('cur_id'))

    it 'undo deleting that cell', ->
        actions.undo()
        expect(store.get('cell_list').size).toBe(2)

    it 'redo deleting that cell', ->
        actions.redo()
        expect(store.get('cell_list').size).toBe(1)

    it 'delete the only remaining cell', ->
        cell_list = store.get('cell_list')
        id = store.get('cur_id')
        expect(cell_list.get(0)).toBe(id)
        actions.set_cell_input(id, 'xyz')
        actions.delete_selected_cells()
        new_cell_list = store.get('cell_list')
        expect(new_cell_list.size).toBe(0)
        actions.ensure_there_is_a_cell()

        new_cell_list = store.get('cell_list')
        expect(new_cell_list.size).toBe(1)
        expect(store.getIn(['cells', new_cell_list.get(0), 'input'])).toBe('')
        expect(store.get('cur_id')).toBe(new_cell_list.get(0))

describe 'tests inserting several cells, selecting several, and deleting all that are selected -- ', ->
    before(setup)
    after(teardown)

    it 'inserts three new cells (for a total of 4)', ->
        actions.insert_cell(1)
        actions.insert_cell(1)
        actions.insert_cell(1)
        expect(store.get('cells').size).toBe(4)

    it 'select cells 0-2 with the current at position 0', ->
        actions.set_cur_id(store.get('cell_list').get(0))
        actions.select_cell(store.get('cell_list').get(1))
        actions.select_cell(store.get('cell_list').get(2))

    it 'deletes selected cells leaving only cell 3', ->
        id = store.get('cell_list').get(3)
        actions.delete_selected_cells()
        expect(store.get('cell_list').toJS()).toEqual([id])
        expect(store.get('cur_id')).toBe(id)

    it 'undo deleting those 3 cells', ->
        actions.undo()
        expect(store.get('cell_list').size).toBe(4)

    it 'redo deleting those 3 cells', ->
        actions.redo()
        expect(store.get('cell_list').size).toBe(1)

describe 'tests inserting several cells, selecting several, and cut/paste/copy them -- ', ->
    before(setup)
    after(teardown)

    it 'inserts four new cells (for a total of 5)', ->
        actions.insert_cell(1)
        actions.insert_cell(1)
        actions.insert_cell(1)
        actions.insert_cell(1)
        expect(store.get('cells').size).toBe(5)

    it 'put content in the 5 cells', ->
        for i, id of store.get('cell_list').toJS()
            actions.set_cell_input(id, "#{i}")

    before_cut = undefined
    it 'select cells 1-3 with the current at position 0', ->
        before_cut = list = store.get('cell_list').toJS()
        actions.set_cur_id(list[1])
        actions.select_cell(list[2])
        actions.select_cell(list[3])

    after_cut = undefined
    it 'cut selected cells leaving only 2 cells', ->
        actions.cut_selected_cells()
        after_cut = list = store.get('cell_list').toJS()
        expect(list.length).toBe(2)
        expect(store.get('cur_id')).toBe(list[1])

    it 'paste those 3 cells we just cut at the bottom, and verify content', ->
        actions.paste_cells(1)
        list = store.get('cell_list').toJS()
        cells = store.get('cells')
        v = (cells.getIn([id, 'input']) for id in list)
        expect(v).toEqual(['0','4','1','2','3'])

    it 'paste those 3 more in again at the very top', ->
        actions.set_cur_id(store.get('cell_list').get(0))
        actions.paste_cells(-1)
        list = store.get('cell_list').toJS()
        cells = store.get('cells')
        v = (cells.getIn([id, 'input']) for id in list)
        expect(v).toEqual(['1','2','3','0','4','1','2','3'])

    it 'now change content of all cells, then copy/paste some, replacing target selection', ->
        list = store.get('cell_list').toJS()
        for i, id of list
            actions.set_cell_input(id, "#{i}")
        actions.set_cur_id(list[0])
        actions.select_cell_range(list[3])   # 0,1,2,3
        actions.copy_selected_cells()

        v = (x.input for x in store.get_global_clipboard().toJS())
        expect(v).toEqual(['0','1','2','3'])

        actions.set_cur_id(list[1])
        actions.select_cell_range(list[list.length-1])   # select all but first
        # paste replacing all but first.
        actions.paste_cells(0)
        list = store.get('cell_list').toJS()
        cells = store.get('cells')
        v = (cells.getIn([id, 'input']) for id in list)
        expect(v).toEqual(['0', '0', '1','2','3'])

describe 'creates and splits cells in various ways', ->
    before(setup)
    after(teardown)

    it 'puts some input and output in a code cell then splits it', ->
        id = store.get('cur_id')
        actions.set_cell_input(id, 'abc123')
        actions.set_cell_output(id, [{foo:'bar'}])
        actions.set_cursor_locs([{id:id, x:3, y:0}])
        actions.split_current_cell()

    it 'checks that there are now 2 cells and they have the right content', ->
        list = store.get('cell_list')
        expect(list.size).toBe(2)
        expect(store.getIn(['cells', list.get(0), 'input'])).toBe('abc')
        expect(store.getIn(['cells', list.get(0), 'output'])).toBe(undefined)
        expect(store.getIn(['cells', list.get(1), 'input'])).toBe('123')
        expect(store.getIn(['cells', list.get(1), 'output']).toJS()).toEqual([{foo:'bar'}])

    it 'verifies that cursor is now in the second cell', ->
        expect(store.get('cur_id')).toBe(store.get('cell_list').get(1))

    it 'puts several lines of content in first cell, then splits it in the middle', ->
        id = store.get('cell_list').get(0)
        actions.set_cur_id(id)
        actions.set_cell_input(id, 'a1\nb2\nc3\nd4')
        actions.set_cursor_locs([{id:id, x:1, y:1}])   # cursor is between b and 2 above.
        actions.split_current_cell()
        list = store.get('cell_list')
        expect(list.size).toBe(3)
        expect(store.getIn(['cells', list.get(0), 'input'])).toBe('a1\nb')
        expect(store.getIn(['cells', list.get(1), 'input'])).toBe('2\nc3\nd4')

    it 'puts several lines of content in first cell, makes it a markdown cell, then splits it at very top', ->
        id = store.get('cell_list').get(0)
        actions.set_cur_id(id)
        actions.set_cell_type(id, 'markdown')
        actions.set_cell_input(id, '# foo\n- bar\n-stuff')
        actions.set_cursor_locs([{id:id, x:0, y:0}])   # cursor is at very start
        actions.split_current_cell()
        list = store.get('cell_list')
        expect(list.size).toBe(4)
        expect(store.getIn(['cells', list.get(0), 'input'])).toBe('')
        expect(store.getIn(['cells', list.get(1), 'input'])).toBe('# foo\n- bar\n-stuff')
        expect(store.getIn(['cells', list.get(0), 'cell_type'])).toBe('markdown')
        expect(store.getIn(['cells', list.get(1), 'cell_type'])).toBe('markdown')

describe 'merge cell with cell above', ->
    before(setup)
    after(teardown)

    it 'puts some input in a code cell then splits it', ->
        id = store.get('cur_id')
        actions.set_cell_input(id, 'abc123')
        actions.set_cursor_locs([{id:id, x:3, y:0}])
        actions.split_current_cell()

    it 'now merge cells back together above', ->
        actions.merge_cell_above()
        list = store.get('cell_list')
        expect(list.size).toBe(1)
        expect(store.getIn(['cells', list.get(0), 'input'])).toBe('abc\n123')

describe 'merge cell with cell below', ->
    before(setup)
    after(teardown)

    it 'puts some input in a code cell then splits it', ->
        id = store.get('cur_id')
        actions.set_cell_input(id, 'abc123')
        actions.set_cursor_locs([{id:id, x:3, y:0}])
        actions.split_current_cell()

    it 'now merge cells back together below', ->
        actions.set_cur_id(store.get('cell_list').get(0))
        actions.merge_cell_below()
        list = store.get('cell_list')
        expect(list.size).toBe(1)
        expect(store.getIn(['cells', list.get(0), 'input'])).toBe('abc\n123')

describe 'inserting a cell in various ways', ->
    before(setup)
    after(teardown)

    it 'inserts a cell after default first cell', ->
        id = store.get('cur_id')
        actions.set_cell_input(id, 'cell 0')
        actions.insert_cell(1)
        list = store.get('cell_list')
        expect(list.size).toBe(2)
        expect(list.get(0)).toBe(id)
        expect(store.get('cur_id')).toBe(list.get(1))
        expect(store.getIn(['cells', list.get(0), 'input'])).toBe('cell 0')
        expect(store.getIn(['cells', list.get(1), 'input'])).toBe('')

    it 'inserts another cell after first cell', ->
        list = store.get('cell_list')
        actions.set_cur_id(list.get(0))
        actions.set_cell_input(list.get(1), 'cell 1')
        actions.insert_cell(1)
        list = store.get('cell_list')
        expect(list.size).toBe(3)
        expect(store.get('cur_id')).toBe(list.get(1))
        expect(store.getIn(['cells', list.get(1), 'input'])).toBe('')
        actions.set_cell_input(list.get(2), 'cell 2')
        actions.set_cur_id(list.get(2))

    it 'inserts a cell before the last cell', ->
        actions.insert_cell(-1)
        list = store.get('cell_list')
        expect(list.size).toBe(4)
        expect(store.get('cur_id')).toBe(list.get(2))
        expect(store.getIn(['cells', list.get(2), 'input'])).toBe('')
        actions.set_cur_id(list.get(0))

    it 'inserts a new cell before the first cell', ->
        actions.insert_cell(-1)
        list = store.get('cell_list')
        expect(list.size).toBe(5)
        expect(store.getIn(['cells', list.get(0), 'input'])).toBe('')
        expect(store.getIn(['cells', list.get(1), 'input'])).toBe('cell 0')

