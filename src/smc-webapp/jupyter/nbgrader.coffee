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
{JupyterStore}   = require('./store')

misc      = require('smc-util/misc')
md5       = require('md5')
immutable = require('immutable')

exports.CELL_TYPES = CELL_TYPES =
    ''        : '-'
    manual    : 'Manually graded answer'
    solution  : 'Autograded answer'
    tests     : 'Autograder test'
    readonly  : 'Read-only'


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

###

nbgrader metadata fields (4 types)

manually graded answer, 3 points

  "nbgrader": {
    "schema_version": 1,
    "solution": true,
    "grade": true,
    "locked": false,
    "points": 3,
    "grade_id": "cell-a1baa9e8d10a4e0b"
  }

autograded answer

  "nbgrader": {
    "schema_version": 1,
    "solution": true,
    "grade": false,
    "locked": false,
    "grade_id": "cell-1509e19eff29d205"
  }

autograder test, 2 points

  "nbgrader": {
    "schema_version": 1,
    "solution": false,
    "grade": true,
    "locked": true,
    "points": 2,
    "grade_id": "cell-058f430d8dbb7c79"
  }

read only

  "nbgrader": {
    "schema_version": 1,
    "solution": false,
    "grade": false,
    "locked": true,
    "grade_id": "cell-4301bc9b1c3e88b1"
  }

###

### ACTIONS ###

JupyterActions::nbgrader_set_cell_type = (id, val) ->
    data =
        schema_version    : 1
        grade_id          : "cell-#{id}"
    switch val
        when 'manual'
            data.solution = true
            data.grade    = true
            data.locked   = false
            data.points   = 1
        when 'solution'
            data.solution = true
            data.grade    = false
            data.locked   = false
        when 'tests'
            data.solution = false
            data.grade    = true
            data.locked   = true
            data.points   = 1
        when 'readonly'
            data.solution = false
            data.grade    = false
            data.locked   = true
        else
            @nbgrader_delete_data(id)
            return

    @nbgrader_set_data(id, immutable.fromJS(data))

JupyterActions::nbgrader_set_data = (id, data) ->
    # TODO: this should be merge = true, or just set the nbgrader field, and not touch the other ones
    if DEBUG then console.log("JupyterActions::nbgrader_set_data", id, data.toJS())
    @set_cell_metadata(id, {nbgrader : data})

JupyterActions::nbgrader_delete_data = (id) ->
    # get rid of the nbgrader metadata
    metadata = @store.getIn(['cells', id, 'metadata'])
    metadata = metadata.delete('nbgrader')
    @set_cell_metadata(id, metadata)

JupyterActions::nbgrader_set_points = (id, num) ->
    data = @store.get_nbgrader(id)
    data = data.set('grade', num)
    @nbgrader_set_data(data)

### STORE ###

JupyterStore::get_nbgrader = (id) ->
    return @getIn(['cells', id, 'metadata', 'nbgrader'])

JupyterStore::get_nbgrader_cell_type = (id) ->
    data     =  @getIn(['cells', id])
    return '' if not (data?.getIn(['metadata', 'nbgrader']) ? false)
    data     = data.toJS()
    solution = is_solution(data)
    grade    = is_grade(data)
    return 'manual'   if solution  and grade
    return 'solution' if solution  and !grade
    return 'tests'    if !solution and grade
    return 'readonly' if !solution and !grade
