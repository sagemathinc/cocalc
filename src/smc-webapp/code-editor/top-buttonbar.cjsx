###
The Top Button bar -- basic editing functionality

-
###

{React, rclass, rtypes, redux} = require('../smc-react')
{ButtonGroup, Button}   = require('react-bootstrap')
{Icon, Space, Spinner, Tip, VisibleMDLG, VisibleLG,
EditorFileInfoDropdown} = require('../r_misc')
{UncommittedChanges}    = require('../jupyter/uncommitted-changes')

exports.ButtonBar = rclass
    propTypes :
        actions                 : rtypes.object.isRequired
        read_only               : rtypes.bool
        has_unsaved_changes     : rtypes.bool
        has_uncommitted_changes : rtypes.bool
        path                    : rtypes.string  # used for file info only
        project_id              : rtypes.string
        printing                : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.has_unsaved_changes     != next.has_unsaved_changes or \
               @props.has_uncommitted_changes != next.has_uncommitted_changes or \
               @props.read_only               != next.read_only or \
               @props.printing                != next.printing

    render_undo_redo_group: ->
        <ButtonGroup key={'undo-group'}>
            <Button
                key      = {'undo'}
                onClick  = {@props.actions.undo}
                disabled = {@props.read_only}
                >
                <Icon name='undo' /> <VisibleMDLG>Undo</VisibleMDLG>
            </Button>
            <Button
                key      = {'redo'}
                onClick  = {@props.actions.redo}
                disabled = {@props.read_only}
                >
                <Icon name='repeat' /> <VisibleMDLG>Redo</VisibleMDLG>
            </Button>
        </ButtonGroup>


    render_save_timetravel_group: ->
        disabled = not @props.has_unsaved_changes or @props.read_only
        <ButtonGroup key={'save-group'}>
            <Button
                key      = {'save'}
                bsStyle  = {'success'}
                disabled = {disabled}
                onClick  = {=>@props.actions.save(true)} >
                <Icon name='save' /> {if @props.read_only then 'Readonly' else 'Save'}
                {<UncommittedChanges has_uncommitted_changes={@props.has_uncommitted_changes} delay_ms={8000} /> if not disabled}
            </Button>
            <Button
                key     = {'timetravel'}
                bsStyle = {'info'}
                onClick = {@props.actions.time_travel} >
                <Icon name='history' /> <VisibleMDLG>TimeTravel</VisibleMDLG>
            </Button>
        </ButtonGroup>

    render_print_spinner: ->
        if @props.printing
            <span>
                <Space />
                <Spinner />
            </span>

    render_print: ->
        <Tip
            placement = {'left'}
            title     = {'Print file to PDF.'}>
            <Button
                key      = {'print'}
                onClick  = {@props.actions.print}
                disabled = {@props.read_only} >
                <Icon name={'print'} /> <VisibleMDLG>Print</VisibleMDLG>
                {@render_print_spinner()}
            </Button>
        </Tip>

    render_file_info: ->
        <EditorFileInfoDropdown
            key       = {'info'}
            filename  = {@props.path}
            actions   = {redux.getProjectActions(@props.project_id)}
            is_public = {false}
        />

    render: ->
        <div style={padding: '2px'}>
            {@render_file_info()}
            <Space/>
            {@render_undo_redo_group()}
            <Space/>
            {@render_print()}
            <Space/>
            {@render_save_timetravel_group()}
        </div>