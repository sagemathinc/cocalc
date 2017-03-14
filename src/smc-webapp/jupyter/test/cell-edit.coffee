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

describe 'tests inserting several cells, selecting several, and deleting all that are selected -- ', ->
    before(setup)
    after(teardown)

    it 'inserts three new cells (for a total of 4)', ->
        actions.insert_cell(1)
        actions.insert_cell(1)
        actions.insert_cell(1)
        expect(store.get('cells').size).toBe(4)


