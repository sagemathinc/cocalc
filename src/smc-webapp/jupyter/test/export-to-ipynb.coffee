actions = store = undefined
setup = (cb) -> (require('./setup').setup (err, x) -> actions=x; store=x?.store; cb(err))
{teardown} = require('./setup')

expect  = require('expect')

{export_to_ipynb} = require('../export-to-ipynb')

describe 'tests exporting the most basic ipynb file -- ', ->
    before(setup)
    after(teardown)

    it 'by directly calling export_to_ipynb', ->
        ipynb = export_to_ipynb(cell_list:actions.store.get('cell_list'), cells:actions.store.get('cells'), kernelspec:{})
        expect(ipynb).toEqual({ cells: [ { cell_type: 'code', execution_count: 0, metadata: {}, outputs: [], source: '' } ], metadata: { kernelspec: {} }, nbformat: 4, nbformat_minor: 0 } )

    it 'by calling function in the store', ->
        ipynb = export_to_ipynb(cell_list:actions.store.get('cell_list'), cells:actions.store.get('cells'))
        expect(store.get_ipynb()).toEqual(ipynb)

    it 'modifies the cell and exports', ->
        id = store.get('cur_id')
        actions.set_cell_input(id, 'a=2\nb=3\na+b')
        actions.set_cell_output(id, {0:{data:{'text/plain':'5'}}})
        ipynb = export_to_ipynb(cell_list:actions.store.get('cell_list'), cells:actions.store.get('cells'), kernelspec:{})
        expect(ipynb).toEqual( { cells: [ { cell_type: 'code', execution_count: 0, metadata: {}, outputs: [ { data: {"text/plain": "5"}, execution_count: 0, metadata: {}, output_type: 'execute_result' } ], source: 'a=2\nb=3\na+b' } ], metadata: { kernelspec: {} }, nbformat: 4, nbformat_minor: 0 } )

describe 'tests exporting the most basic ipynb file -- ', ->
    before(setup)
    after(teardown)

    it 'adds more cells and set input to id so we can test later', ->
        for i in [0...10]
            actions.insert_cell(-1)
            actions.insert_cell(1)
        for id in store.get('cell_list')?.toJS()
            actions.set_cell_input(id, id)

    it 'exports and confirms order is right', ->
        ipynb = store.get_ipynb()
        inputs = (cell.source for cell in ipynb.cells)
        expect(inputs).toEqual(store.get('cell_list')?.toJS())



        