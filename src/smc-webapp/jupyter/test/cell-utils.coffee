#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

expect  = require('expect')

cell_utils = require('../cell-utils')

immutable = require('immutable')



describe 'tests computing positions_between -- ', ->
    it 'three integers', ->
        v = cell_utils.positions_between(0, 4, 3)
        expect(v).toEqual([ 1, 2, 3 ])

    it 'three integers with one negative', ->
        v = cell_utils.positions_between(-2, 2, 3)
        expect(v).toEqual([ -1, 0, 1 ])

    it 'three equal intervals', ->
        v = cell_utils.positions_between(-2, 2.5, 3)
        expect(v).toEqual([ -0.875, 0.25, 1.375 ])

describe 'generate many intervals and lengths at random --', ->

    it 'tries many random intervals', ->
        for i in [0...1000]
            left = Math.random()
            right = left + Math.random()
            n = 2+Math.floor(Math.random()*100)
            v = cell_utils.positions_between(left, right, n)
            expect(v.length).toBe(n)
            expect(v[0] < v[n-1]).toBe(true)

describe 'extreme cases -- ', ->
    it 'tests before bigger than after', ->
        v = cell_utils.positions_between(7, 3, 3)
        expect(v).toEqual([4,5,6])

    it 'tests before not defined', ->
        v = cell_utils.positions_between(undefined, 3, 3)
        expect(v).toEqual([0,1,2])

    it 'tests after not defined', ->
        v = cell_utils.positions_between(0, undefined, 3)
        expect(v).toEqual([1,2,3])

    it 'neither defined', ->
        v = cell_utils.positions_between(undefined, undefined, 3)
        expect(v).toEqual([0,1,2])


describe 'tests computing the sorted list of cell ids -- ', ->
    it 'a first simple test with two cells', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}})
        cell_list = cell_utils.sorted_cell_list(cells)
        expect(immutable.List.isList(cell_list)).toBe(true)
        expect(cell_list.toJS()).toEqual(['xyz', 'abc'])

    it 'test with 5 cells', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}, 'a5':{pos:-10}, 'b7':{pos:11}, 'x':{pos:0}})
        cell_list = cell_utils.sorted_cell_list(cells)
        expect(cell_list.toJS()).toEqual(['a5', 'xyz', 'x', 'abc', 'b7'])

describe 'test code for ensuring positions are unique -- ', ->
    it 'test with undefined input', ->
        expect(cell_utils.ensure_positions_are_unique()).toBe(undefined)

    it 'test with distinct pos', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}})
        expect(cell_utils.ensure_positions_are_unique(cells)).toBe(undefined)

    it 'test with non-distinct pos', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}, 'qaz':{pos:1}})
        expect(cell_utils.ensure_positions_are_unique(cells)).toEqual({ abc: 1, qaz: 2, xyz: 0 })

describe 'test new_cell_pos -- ', ->
    it 'tests some undefined', ->
        expect(cell_utils.new_cell_pos()).toBe(undefined)
        expect(cell_utils.new_cell_pos(undefined, immutable.List(), 'abc', 1)).toBe(undefined)
        expect(cell_utils.new_cell_pos(immutable.Map(), immutable.List(), undefined, 1)).toBe(undefined)
        expect(cell_utils.new_cell_pos(immutable.Map(), immutable.List(), 'abc', undefined)).toBe(undefined)

    it 'tests an undefined that works', ->
        expect(cell_utils.new_cell_pos(immutable.fromJS({abc:{pos:0}}), undefined, 'abc', 1)).toBe(1)

    it 'test a real insert in the middle', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}})
        cell_list = cell_utils.sorted_cell_list(cells)
        expect(cell_utils.new_cell_pos(cells, cell_list, 'xyz', 1)).toBe(0)

    it 'test a real insert in the beginning above', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}})
        cell_list = cell_utils.sorted_cell_list(cells)
        expect(cell_utils.new_cell_pos(cells, cell_list, 'xyz', -1)).toBe(-2)

    it 'test a real insert at the end below', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}})
        cell_list = cell_utils.sorted_cell_list(cells)
        expect(cell_utils.new_cell_pos(cells, cell_list, 'abc', 1)).toBe(2)

describe 'test move_selected_cells --', ->
    it 'some undef cases', ->
        expect(cell_utils.move_selected_cells()).toBe(undefined)
        expect(cell_utils.move_selected_cells(['a', 'b', 'x'])).toBe(undefined)
        expect(cell_utils.move_selected_cells(['a', 'b', 'x'], {a:true})).toBe(undefined)
        expect(cell_utils.move_selected_cells(['a', 'b', 'x'], {a:true}, 0)).toBe(undefined)
        expect(cell_utils.move_selected_cells(['a', 'b', 'x'], {a:true}, 10)).toBe(undefined)  # since moves out of doc
        expect(cell_utils.move_selected_cells(['a', 'b', 'x'], {}, 1)).toBe(undefined)

    it 'some cases with 1 selected', ->
        expect(cell_utils.move_selected_cells(['a', 'b', 'x'], {a:true}, 1)).toEqual(['b', 'a', 'x'])
        expect(cell_utils.move_selected_cells(['a', 'b', 'x'], {a:true}, 2)).toEqual(['b', 'x', 'a'])

    it 'some cases with 2 selected', ->
        expect(cell_utils.move_selected_cells(['a', 'b', 'x'], {a:true, b:true}, 1)).toEqual(['x', 'a', 'b'])
        expect(cell_utils.move_selected_cells(['a', 'b', 'x'], {b:true, x:true}, -1)).toEqual(['b', 'x', 'a'])





