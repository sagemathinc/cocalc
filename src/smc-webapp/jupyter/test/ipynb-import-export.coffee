actions = store = undefined
setup = (cb) -> (require('./setup').setup (err, x) -> actions=x; store=x?.store; cb(err))
{teardown} = require('./setup')

expect  = require('expect')

{export_to_ipynb} = require('../ipynb-import-export')

describe 'tests exporting the most basic ipynb file -- ', ->
    before(setup)
    after(teardown)

    it 'by directly calling export_to_ipynb', ->
        ipynb = export_to_ipynb(cell_list:actions.store.get('cell_list'), cells:actions.store.get('cells'), kernelspec:{})
        expect(ipynb).toEqual({ cells: [ { cell_type: 'code', execution_count: 0, metadata: {}, outputs: [], source: '' } ], metadata: { kernelspec: {} }, nbformat: 4, nbformat_minor: 0 } )