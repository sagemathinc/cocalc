###
The Top Button bar -- basic editing functionality

-
###

{React, rclass, rtypes, redux} = require('../smc-react')
{ButtonGroup, Button}   = require('react-bootstrap')
{Icon, Space, VisibleMDLG, VisibleLG,
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

    shouldComponentUpdate: (next) ->
        return @props.has_unsaved_changes     != next.has_unsaved_changes or \
               @props.has_uncommitted_changes != next.has_uncommitted_changes or \
               @props.read_only               != next.read_only

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

    render_find_replace_group: ->
        <ButtonGroup key={'find-group'}>
            <Button
                key      = {'find'}
                onClick  = {@props.actions.find}
                >
                <Icon name='search' /> <VisibleMDLG>Find</VisibleMDLG>
            </Button>
            <Button
                key      = {'replace'}
                onClick  = {@props.actions.replace}
                disabled = {@props.read_only}
                >
                <Icon name='exchange' /> <VisibleMDLG>Replace</VisibleMDLG>
            </Button>
            <Button
                key      = {'goto-line'}
                onClick  = {@props.actions.goto_line}
                >
                <Icon name='bolt' /> <VisibleMDLG>Line</VisibleMDLG>
            </Button>
        </ButtonGroup>

    render_zoom: ->
        <ButtonGroup key={'zoom-group'}>
            <Button
                key     = {'font-increase'}
                onClick = {@props.actions.decrease_font_size}
                >
                <Icon style={fontSize:'7pt'} name={'font'} />
            </Button>
            <Button
                key     = {'font-decrease'}
                onClick = {@props.actions.increase_font_size}
                >
                <Icon style={fontSize:'11pt'} name={'font'} />
            </Button>
        </ButtonGroup>

    render_save_timetravel_group: ->
        disabled = not @props.has_unsaved_changes or @props.read_only
        <ButtonGroup key={'save-group'}>
            <Button
                key      = {'save'}
                bsStyle  = {'success'}
                disabled = {disabled}
                onClick  = {@props.actions.save} >
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

    render_copy_group: ->
        <ButtonGroup key={'copy'}>
            <Button
                key      = {'cut'}
                onClick  = {@props.actions.cut}
                disabled = {@props.read_only} >
                <Icon name={'scissors'} /> <VisibleLG>Cut</VisibleLG>
            </Button>
            <Button
                key      = {'copy'}
                onClick  = {@props.actions.copy} >
                <Icon name={'copy'} />  <VisibleLG>Copy</VisibleLG>
            </Button>
            <Button
                key     = {'paste'}
                onClick = {@props.actions.paste}
                disabled = {@props.read_only} >
                <Icon name={'paste'} />  <VisibleLG>Paste</VisibleLG>
            </Button>
        </ButtonGroup>

    render_print: ->
        <Button
            key      = {'print'}
            onClick  = {@props.actions.print}
            disabled = {@props.read_only} >
            <Icon name={'print'} /> <VisibleMDLG>Print</VisibleMDLG>
        </Button>

    render_split: ->
        <Button
            key     = {'split'}
            onClick = {@props.actions.split_view} >
            <Icon name='columns' /> <VisibleMDLG>Split</VisibleMDLG>
        </Button>

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
            {@render_copy_group()}
            <Space/>
            {@render_undo_redo_group()}
            <Space/>
            {@render_find_replace_group()}
            <Space/>
            {@render_zoom()}
            <Space/>
            {@render_split()}
            <Space/>
            {@render_print()}
            <Space/>
            {@render_save_timetravel_group()}
        </div>