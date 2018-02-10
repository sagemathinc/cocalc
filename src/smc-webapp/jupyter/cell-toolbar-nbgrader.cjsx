###
NBGrader toolbar for configuring the cells.
###

{Button, FormControl, FormGroup, InputGroup} = require('react-bootstrap')
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon} = require('../r_misc')

misc = require('smc-util/misc')

exports.NBGrader = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map.isRequired

    getInitialState: ->
        input : ''

    render_ui: ->
        <div style={display:'flex'}>
            <span>NBGrader</span>
            <Button
                bsSize  = {'small'}
                onClick = {=>@props.actions.nbgrader()}
            >
                TEST
            </Button>
        </div>

    render: ->
        <div style={display:'flex'}>
            {@render_ui()}
        </div>
