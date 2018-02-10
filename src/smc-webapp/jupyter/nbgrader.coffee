##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
Functionality that mimics aspects of nbgrader
###

{JupyterActions} = require('./actions')
misc = require('smc-util/misc')
md5  = require('md5')

# compute the checksum of a cell just like nbgrader does
# utils.compute_checksum is here https://github.com/jupyter/nbgrader/blob/master/nbgrader/utils.py#L92

is_grade = (cell) ->
    # Returns True if the cell is a grade cell.
    return !!(cell.metadata?.nbgrader?.grade)

is_solution = (cell) ->
    # Returns True if the cell is a solution cell.
    return !!(cell.metadata?.nbgrader?.solution)

is_locked = (cell) ->
    # Returns True if the cell source is locked (will be overwritten).
    return false if not cell.metadata?.nbgrader?
    return false if is_solution(cell)
    return true if is_grade(cell)
    return !!(cell.metadata?.nbgrader?.locked)

to_bytes = (s) ->
    # string to utf-8 encoded byte vector or whatever ...
    return "#{s}"

exports.compute_checksum = (cell) ->
    ###
        m = hashlib.md5()
    # add the cell source and type
    m.update(to_bytes(cell.source))
    m.update(to_bytes(cell.cell_type))

    # add whether it's a grade cell and/or solution cell
    m.update(to_bytes(str(is_grade(cell))))
    m.update(to_bytes(str(is_solution(cell))))
    m.update(to_bytes(str(is_locked(cell))))

    # include the cell id
    m.update(to_bytes(cell.metadata.nbgrader['grade_id']))

    # include the number of points that the cell is worth, if it is a grade cell
    if is_grade(cell):
        m.update(to_bytes(str(float(cell.metadata.nbgrader['points']))))

    return m.hexdigest()
    ###
    return md5('0xNOTIMPLEMENTED')


JupyterActions::nbgrader = ->
    cur_id = @store.get('cur_id')
    @set_cell_input(cur_id, "test #{Math.random()}")

