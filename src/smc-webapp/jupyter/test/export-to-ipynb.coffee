#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

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
        expect(ipynb).toEqual({ cells: [ { cell_type: 'code', execution_count: 0, metadata: { collapsed: false }, outputs: [], source: [] } ], metadata: { kernelspec: {} }, nbformat: 4, nbformat_minor: 0 })

    it 'by calling function in the store', ->
        ipynb = export_to_ipynb(cell_list:actions.store.get('cell_list'), cells:actions.store.get('cells'))
        expect(store.get_ipynb()).toEqual(ipynb)

    it 'modifies the cell and exports', ->
        id = store.get('cur_id')
        actions.set_cell_input(id, 'a=2\nb=3\na+b')
        actions.set_cell_output(id, {0:{data:{'text/plain':'5'}}})
        ipynb = export_to_ipynb(cell_list:actions.store.get('cell_list'), cells:actions.store.get('cells'), kernelspec:{})
        expect(ipynb).toEqual({"cells":[{"cell_type":"code","source":["a=2\n","b=3\n","a+b"],"metadata":{"collapsed":false},"execution_count":0,"outputs":[{"data":{"text/plain":["5"]},"output_type":"execute_result","metadata":{},"execution_count":0}]}],"metadata":{"kernelspec":{} },"nbformat":4,"nbformat_minor":0})

describe 'tests exporting a file with many cells -- ', ->
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
        inputs = (cell.source[0] for cell in ipynb.cells)
        expect(inputs).toEqual(store.get('cell_list')?.toJS())

describe 'tests simple use of more_output ', ->
    before(setup)
    after(teardown)

    it 'sets a more_output message', ->
        id = store.get('cur_id')
        actions.set_cell_output(id, {0:{more_output:true}})

    it 'tests that export removes and replaces by error', ->
        expect(store.get_ipynb().cells[0].outputs).toEqual([ { name: 'stderr', output_type: 'stream', text: [ 'WARNING: Some output was deleted.\n' ] } ] )

    it 'tests when there is more than one message', ->
        id = store.get('cur_id')
        actions.set_cell_output(id, {0:{data:{'text/plain':'5'}}, 1:{data:{'text/plain':'2'}}, 2:{more_output:true}})
        expect(store.get_ipynb().cells[0].outputs[2]).toEqual({ name: 'stderr', output_type: 'stream', text: [ 'WARNING: Some output was deleted.\n' ] } )

describe 'tests exporting custom metadata -- ', ->
    before(setup)
    after(teardown)

    it 'sets custom metadata', ->
        actions.setState(metadata:{custom:{data:389}})

    it 'exports and checks it is there', ->
        expect(store.get_ipynb().metadata.custom).toEqual({data:389})




