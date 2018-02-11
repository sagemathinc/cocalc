###
NBGrader toolbar for configuring the cells.
###

{Button, FormControl, FormGroup, InputGroup} = require('react-bootstrap')
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon}     = require('../r_misc')
{COLORS}   = require('smc-util/theme')
misc       = require('smc-util/misc')

exports.NBGrader = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map.isRequired

    _get_cell_type : ->
        return @props.actions.store?.get_nbgrader_cell_type(@props.cell.get('id')) ? ''

    getInitialState: ->
        cell_id   : @props.cell.get('id')
        cell_type : @_get_cell_type()

    componentWillReceiveProps: (next) ->
        next_cell_id = next.cell.get('id')
        if next_cell_id != @state.cell_id
            @setState(cell_id: next_cell_id)
        if @props.cell.get('metadata') != next.cell.get('metadata')
            @setState(cell_type : @_get_cell_type())

    select_type: (val) ->
        @props.actions.nbgrader_set_cell_type(@state.cell_id, val)

    cell_type_options: ->
        {CELL_TYPES} = require('./nbgrader')
        for k, v of CELL_TYPES
            <option key={k} value={k}>{v}</option>

    cell_type: ->
        <div style={display: 'flex'}>
            Type:{' '}
            <FormControl
                componentClass = "select"
                placeholder    = "select"
                onChange       = {(e) => @select_type(e.target.value)}
                value          = {@state.cell_type}
            >
                {@cell_type_options()}
            </FormControl>
        </div>

    cell_info: ->
        grade_id = @props.cell.getIn(['metadata', 'nbgrader', 'grade_id']) ? 'N/A'
        <div>ID: {grade_id}</div>

    points: ->
        num = @props.cell.getIn(['metadata', 'nbgrader', 'points']) ? null
        return null if not num?
        <div>Points: {num}</div>

    render: ->
        style =
            display    : 'flex'

        <div style={style}>
            <div>NBGrader</div>
            {@points()}
            {@cell_info()}
            {@cell_type()}
        </div>
