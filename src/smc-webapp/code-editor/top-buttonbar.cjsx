###
The Top Button bar -- basic editing functionality

-
###

{React, rclass, rtypes} = require('../smc-react')
{ButtonGroup, Button}   = require('react-bootstrap')
{Icon, Space}           = require('../r_misc')
{UncommittedChanges}    = require('../jupyter/uncommitted-changes')

exports.ButtonBar = rclass
    propTypes :
        actions                 : rtypes.object.isRequired
        read_only               : rtypes.bool
        has_unsaved_changes     : rtypes.bool
        has_uncommitted_changes : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.has_unsaved_changes     != next.has_unsaved_changes or \
               @props.has_uncommitted_changes != next.has_uncommitted_changes or \
               @props.read_only               != next.read_only

    render_undo_redo_group: ->
        <ButtonGroup>
            <Button
                key      = 'undo'
                onClick  = {@props.actions.undo}
                disabled = {@props.read_only}
                >
                <Icon name='undo' /> Undo
            </Button>
            <Button
                key      = 'redo'
                onClick  = {@props.actions.redo}
                disabled = {@props.read_only}
                >
                <Icon name='repeat' /> Redo
            </Button>
        </ButtonGroup>

    render_save_timetravel_group: ->
        <ButtonGroup key='editor'>
            <Button
                key      = 'save'
                bsStyle  = 'success'
                disabled = {not @props.has_unsaved_changes or @props.read_only}
                onClick  = {@props.actions.save} >
                <Icon name='save' /> {if @props.read_only then 'Readonly' else 'Save'}
                <UncommittedChanges has_uncommitted_changes={@props.has_uncommitted_changes} />
            </Button>
            <Button
                key     = 'timetravel'
                bsStyle = 'info'
                onClick = {@props.actions.time_travel} >
                <Icon name='history' /> TimeTravel
            </Button>
        </ButtonGroup>

    render: ->
        <div style={padding: '0px 5px 5px'}>
            {@render_undo_redo_group()}
            <Space/>
            {@render_save_timetravel_group()}
        </div>