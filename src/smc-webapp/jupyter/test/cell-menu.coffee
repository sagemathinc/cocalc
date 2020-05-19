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

describe 'test setting cell type -- ', ->
    before(setup)
    after(teardown)

    it 'creates three cells', ->
        actions.insert_cell(1)
        actions.insert_cell(1)
        expect(store.get('cells').size).toBe(3)

    it 'sets the type of the first to markdown', ->
        id = store.get('cell_list').get(0)
        actions.set_cell_type(id, 'markdown')
        expect(store.getIn(['cells', id, 'cell_type'])).toBe('markdown')

    it 'sets the type of the second to code', ->
        id = store.get('cell_list').get(1)
        actions.set_cell_type(id, 'code')
        expect(store.getIn(['cells', id, 'cell_type'])).toBe('code')
        # first is still markdown
        expect(store.getIn(['cells', store.get('cell_list').get(0), 'cell_type'])).toBe('markdown')

    it 'sets the type of the third to raw', ->
        id = store.get('cell_list').get(2)
        actions.set_cell_type(id, 'raw')
        expect(store.getIn(['cells', id, 'cell_type'])).toBe('raw')

    it 'anything else is an error', ->
        try
            id = store.get('cell_list').get(2)
            actions.set_cell_type(id, 'nonsense')
            expect(true).toEqual(false)
        catch e
            expect("#{e}").toEqual("Error: cell type (='nonsense') must be 'markdown', 'raw', or 'code'")

describe 'test setting cell type for multiple selected cells -- ', ->
    before(setup)
    after(teardown)

    it 'creates three cells', ->
        actions.insert_cell(1)
        actions.insert_cell(1)
        expect(store.get('cells').size).toBe(3)

    it 'selects cells 1 and 2 (of the 3)', ->
        list = store.get('cell_list').toJS()
        actions.select_cell_range(list[1])
        actions.set_selected_cell_type('markdown')
        v = ( store.getIn(['cells', id, 'cell_type']) for id in list)
        expect(v).toEqual([ undefined, 'markdown', 'markdown' ])


describe 'test clearing output of cells -- ', ->
    before(setup)
    after(teardown)

    list = undefined
    it 'creates three cells', ->
        actions.insert_cell(1)
        actions.insert_cell(1)
        list = store.get('cell_list').toJS()
        for i in [0,1,2]
            actions.set_cell_output(list[i], [i])

    it 'clear last cell output (it is selected)', ->
        actions.clear_selected_outputs()
        v = ( store.getIn(['cells', id, 'output'])?.toJS() for id in list)
        expect(v).toEqual([[0], [1], undefined])

    it 'select first two cells and clear their output', ->
        actions.set_cur_id(list[0])
        actions.select_cell_range(list[1])
        actions.clear_selected_outputs()
        v = ( store.getIn(['cells', id, 'output'])?.toJS() for id in list)
        expect(v).toEqual([undefined, undefined, undefined])

    it 'set output again and clear all', ->
        for i in [0,1,2]
            actions.set_cell_output(list[i], [i])
        actions.clear_all_outputs()
        v = ( store.getIn(['cells', id, 'output'])?.toJS() for id in list)
        expect(v).toEqual([undefined, undefined, undefined])


#describe 'test collapsing output of cells -- ', ->

#describe 'test scrolling output of cells -- ', ->

