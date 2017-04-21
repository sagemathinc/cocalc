expect  = require('expect')

misc = require('smc-util/misc')
util = require('../util')

immutable = require('immutable')

describe 'tests computing the sorted list of cell ids -- ', ->
    it 'a first simple test with two cells', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}})
        cell_list = util.sorted_cell_list(cells)
        expect(immutable.List.isList(cell_list)).toBe(true)
        expect(cell_list.toJS()).toEqual(['xyz', 'abc'])

    it 'test with 5 cells', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}, 'a5':{pos:-10}, 'b7':{pos:11}, 'x':{pos:0}})
        cell_list = util.sorted_cell_list(cells)
        expect(cell_list.toJS()).toEqual(['a5', 'xyz', 'x', 'abc', 'b7'])








