###
FrameTitleBar - title bar in a frame, in the frame tree
###

{debounce} = require('underscore')
{ButtonGroup, Button}   = require('react-bootstrap')
{React, rclass, rtypes, redux} = require('../smc-react')
{Icon, Space, Tip, VisibleMDLG,
 EditorFileInfoDropdown}= require('../r_misc')
{UncommittedChanges}    = require('../jupyter/uncommitted-changes')

{IS_TOUCH} = require('../feature')
misc       = require('smc-util/misc')

title_bar_style =
    background    : '#ddd'
    borderTop     : '1px solid rgb(204,204,204)'
    borderLeft    : '1px solid rgb(204,204,204)'
    borderRight   : '1px solid rgb(204,204,204)'
    verticalAlign : 'middle'
    lineHeight    : '20px'
    overflow      : 'hidden'
    textOverflow  : 'ellipsis'
    minHeight     : '24px'

path_style =
    whiteSpace  : 'nowrap'
    fontSize    : '13px'
    paddingLeft : '5px'
    color       : '#333'

button_size = 'small'
if IS_TOUCH
    close_style = undefined
else
    close_style =
        background  : 'transparent'
        borderColor : 'transparent'

exports.FrameTitleBar = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        active_id  : rtypes.string
        id         : rtypes.string
        path       : rtypes.string
        project_id : rtypes.string
        deletable  : rtypes.bool
        read_only  : rtypes.bool
        has_unsaved_changes : rtypes.bool
        is_full    : rtypes.bool
        is_only    : rtypes.bool    # is the only frame

    shouldComponentUpdate: (next) ->
        return @props.active_id  != next.active_id or \
               @props.id         != next.id or \
               @props.project_id != next.project_id or \
               @props.path       != next.path or \
               @props.deletable  != next.deletable or \
               @props.is_full    != next.is_full or \
               @props.is_only    != next.is_only or \
               @props.read_only  != next.read_only or \
               @props.has_unsaved_changes != next.has_unsaved_changes

    click_close: ->
        @props.actions.close_frame(@props.id)

    button_size: ->
        if @props.is_only or @props.is_full
            return
        else
            return 'xsmall'

    render_x: ->
        disabled = @props.is_full or @props.is_only or not @props.deletable
        <ButtonGroup style={marginLeft:'5px', float:'right'} key={'x'}>
            {@render_full() if @props.is_full or @props.active_id == @props.id}
            <Button
                style    = {close_style}
                disabled = {disabled}
                key      = {'close'}
                bsSize   = {@button_size()}
                onClick  = {@click_close} >
                <Icon name={'times'}/>
            </Button>
        </ButtonGroup>

    render_full: ->
        if @props.is_full
            <Button
                disabled = {@props.is_only}
                key     = {'compress'}
                bsSize  = {@button_size()}
                bsStyle = {'warning'}
                onClick = {=> @props.actions.set_frame_full()} >
                <Icon name={'compress'}/>
            </Button>
        else
            <Button
                disabled = {@props.is_only}
                key     = {'expand'}
                bsSize  = {@button_size()}
                onClick = {=> @props.actions.set_frame_full(@props.id)} >
                <Icon name={'expand'}/>
            </Button>

    render_split_row: ->
        <Button
            disabled = {@props.is_full}
            key      = {'split-row'}
            bsSize   = {@button_size()}
            onClick  = {=>@props.actions.split_frame('row', @props.id)} >
            <Icon name='columns' rotate={'90'} />
        </Button>

    render_split_col: ->
        <Button
            disabled = {@props.is_full}
            key      = {'split-col'}
            bsSize   = {@button_size()}
            onClick  = {=>@props.actions.split_frame('col', @props.id)} >
            <Icon name='columns' />
        </Button>

    render_zoom_out: ->
        <Button
            key     = {'font-increase'}
            bsSize  = {@button_size()}
            onClick = {=>@props.actions.decrease_font_size(@props.id)}
            >
            <Icon style={fontSize:'5pt'} name={'font'} />
        </Button>

    render_zoom_in: ->
        <Button
            key     = {'font-decrease'}
            onClick = {=>@props.actions.increase_font_size(@props.id)}
            bsSize  = {@button_size()}
            >
            <Icon style={fontSize:'9pt'} name={'font'} />
        </Button>

    render_find_replace_group: ->
        <ButtonGroup key={'find-group'}>
            <Button
                key      = {'find'}
                onClick  = {=>@props.actions.find(@props.id)}
                bsSize   = {@button_size()}>
                <Icon name='search' />
            </Button>
            <Button
                key      = {'replace'}
                onClick  = {=>@props.actions.replace(@props.id)}
                disabled = {@props.read_only}
                bsSize   = {@button_size()}>
                <Icon name='exchange' />
            </Button>
            <Button
                key      = {'goto-line'}
                onClick  = {=>@props.actions.goto_line(@props.id)}
                bsSize   = {@button_size()}>
                <Icon name='bolt' />
            </Button>
        </ButtonGroup>

    render_copy_group: ->
        <ButtonGroup key={'copy'}>
            <Button
                key      = {'cut'}
                onClick  = {=>@props.actions.cut(@props.id)}
                disabled = {@props.read_only}
                bsSize   = {@button_size()}>
                <Icon name={'scissors'} />
            </Button>
            <Button
                key      = {'copy'}
                onClick  = {=>@props.actions.copy(@props.id)}
                bsSize  = {@button_size()}>
                <Icon name={'copy'} />
            </Button>
            <Button
                key     = {'paste'}
                onClick = {debounce((=>@props.actions.paste(@props.id)), 200, true)}
                disabled = {@props.read_only}
                bsSize  = {@button_size()}>
                <Icon name={'paste'} />
            </Button>
        </ButtonGroup>

    render_zoom_group: ->
        <ButtonGroup key={'zoom'}>
            {@render_zoom_out()}
            {@render_zoom_in()}
        </ButtonGroup>

    render_split_group: ->
        <ButtonGroup  key={'split'}>
            {@render_split_row()}
            {@render_split_col()}
        </ButtonGroup>

    render_undo_redo_group: ->
        <ButtonGroup key={'undo-group'}>
            <Button
                key      = {'undo'}
                onClick  = {@props.actions.undo}
                disabled = {@props.read_only}
                bsSize   = {@button_size()}
                >
                <Icon name='undo' />
            </Button>
            <Button
                key      = {'redo'}
                onClick  = {@props.actions.redo}
                disabled = {@props.read_only}
                bsSize   = {@button_size()}
                >
                <Icon name='repeat' />
            </Button>
        </ButtonGroup>


    render_save_timetravel_group: ->
        disabled = not @props.has_unsaved_changes or @props.read_only
        <ButtonGroup key={'save-group'}>
            <Button
                key      = {'save'}
                bsStyle  = {'success'}
                bsSize   = {@button_size()}
                disabled = {disabled}
                onClick  = {=>@props.actions.save(true)} >
                <Icon name='save' /> {if @props.read_only then 'Readonly' else 'Save'}
                {<UncommittedChanges has_uncommitted_changes={@props.has_uncommitted_changes} delay_ms={8000} /> if not disabled}
            </Button>
            <Button
                key     = {'timetravel'}
                bsStyle = {'info'}
                bsSize  = {@button_size()}
                onClick = {@props.actions.time_travel} >
                <Icon name='history' />
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
                bsSize   = {@button_size()}
                key      = {'print'}
                onClick  = {@props.actions.print}
                disabled = {@props.read_only} >
                <Icon name={'print'} />
                {@render_print_spinner()}
            </Button>
        </Tip>

    render_file_info: ->
        <EditorFileInfoDropdown
            key       = {'info'}
            filename  = {@props.path}
            actions   = {redux.getProjectActions(@props.project_id)}
            is_public = {false}
            bsSize    = {@button_size()}
        />

    render_buttons: ->
        extra = @props.is_only or @props.is_full
        <span style={float:'right'}>
            {@render_file_info() if extra}
            {<Space/> if extra}
            {@render_save_timetravel_group()}
            <Space/>
            {@render_print() if extra}
            {<Space/> if extra}
            {@render_undo_redo_group() if extra}
            {<Space/> if extra}
            {@render_copy_group() if extra}
            {<Space /> if extra}
            {@render_find_replace_group()}
            <Space />
            {@render_zoom_group() if extra}
            {<Space /> if extra}
            {@render_split_group()}
        </span>

    render_path: ->
        <span style={path_style}>
            <Tip
                placement = {'bottom'}
                title     = {@props.path}
            >
                {misc.path_split(@props.path).tail}
            </Tip>
        </span>

    render: ->
        is_active = @props.id == @props.active_id
        if is_active
            style = misc.copy(title_bar_style)
            style.background = '#f8f8f8'
        else
            style = title_bar_style
        <div
            style = {style}
            >
            {@render_path()}
            {@render_x()}
            {@render_buttons() if is_active}
        </div>