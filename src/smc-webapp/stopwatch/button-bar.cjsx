###
Some buttons
###

{React, rclass, rtypes} = require('../smc-react')

{Button, ButtonGroup}   = require('react-bootstrap')
{Icon, Space}           = require('../r_misc')

exports.ButtonBar = rclass ({name}) ->
    propTypes :
        actions    : rtypes.object.isRequired

    render_time_travel_button: ->
        <Button
            key = {'time-travel'}
            bsStyle = {'info'}
            onClick = {=>@props.actions.time_travel()}>
            <Icon name='history'/> TimeTravel
        </Button>

    render_undo_redo_group: ->
        <ButtonGroup key={'undo-group'}>
            <Button
                key      = {'undo'}
                title    = {'Undo last thing you did'}
                onClick  = {@props.actions.undo}
                >
                <Icon name='undo' /> Undo
            </Button>
            <Button
                key      = {'redo'}
                title    = {'Redo last thing you did'}
                onClick  = {@props.actions.redo}
                >
                <Icon name='repeat' /> Redo
            </Button>
        </ButtonGroup>

    render: ->
        <div style={margin:'1px'}>
            {@render_time_travel_button()}
            <Space />
            {@render_undo_redo_group()}
        </div>

