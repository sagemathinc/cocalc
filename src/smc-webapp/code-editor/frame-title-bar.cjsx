###
FrameTitleBar - title bar in a frame, in the frame tree
###

{ButtonGroup, Button}   = require('react-bootstrap')
{React, rclass, rtypes} = require('../smc-react')
{Icon, Space, Tip}      = require('../r_misc')
misc = require('smc-util/misc')

title_bar_style =
    background    : '#eee'
    borderTop     : '1px solid rgb(204,204,204)'
    borderLeft    : '1px solid rgb(204,204,204)'
    borderRight   : '1px solid rgb(204,204,204)'
    verticalAlign : 'middle'
    lineHeight    : '20px'
    whiteSpace    : 'nowrap'
    overflow      : 'hidden'
    textOverflow  : 'ellipsis'

path_style =
    fontSize    : '13px'
    paddingLeft : '5px'
    color       : '#333'

button_size = 'xsmall'  # or small

exports.FrameTitleBar = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        active_id  : rtypes.string
        id         : rtypes.string
        path       : rtypes.string
        deletable  : rtypes.bool
        is_full    : rtypes.bool
        is_only    : rtypes.bool    # is the only frame -- so don't show delete or full buttons at all.

    shouldComponentUpdate: (next) ->
        return @props.active_id  != next.active_id or \
               @props.id         != next.id or \
               @props.path       != next.path or \
               @props.deletable  != next.deletable or \
               @props.is_full    != next.is_full or \
               @props.is_only    != next.is_only

    click_close: ->
        @props.actions.close_frame(@props.id)

    render_x: ->
        disabled = @props.is_full or @props.is_only or not @props.deletable
        <span style={marginLeft:'5px', float:'right'} key={'close'}>
            <Button
                style    = {background:'transparent', border:'transparent'}
                disabled = {disabled}
                key      = {'close'}
                bsSize   = {button_size}
                onClick  = {@click_close} >
                <Icon name={'times'}/>
            </Button>
        </span>

    render_full: ->
        if @props.is_full
            <Button
                disabled = {@props.is_only}
                key     = {'compress'}
                bsSize  = {button_size}
                bsStyle = {'warning'}
                onClick = {=> @props.actions.set_frame_full()} >
                <Icon name={'compress'}/>
            </Button>
        else
            <Button
                disabled = {@props.is_only}
                key     = {'expand'}
                bsSize  = {button_size}
                onClick = {=> @props.actions.set_frame_full(@props.id)} >
                <Icon name={'expand'}/>
            </Button>

    render_split_row: ->
        <Button
            disabled = {@props.is_full}
            key      = {'split-row'}
            bsSize   = {button_size}
            onClick  = {=>@props.actions.split_frame('row', @props.id)} >
            <Icon name='columns' rotate={'90'} />
        </Button>

    render_split_col: ->
        <Button
            disabled = {@props.is_full}
            key      = {'split-col'}
            bsSize   = {button_size}
            onClick  = {=>@props.actions.split_frame('col', @props.id)} >
            <Icon name='columns' />
        </Button>

    render_zoom_out: ->
        <Button
            key     = {'font-increase'}
            bsSize  = {button_size}
            onClick = {=>@props.actions.decrease_font_size(@props.id)}
            >
            <Icon style={fontSize:'5pt'} name={'font'} />
        </Button>

    render_zoom_in: ->
        <Button
            key     = {'font-decrease'}
            onClick = {=>@props.actions.increase_font_size(@props.id)}
            bsSize  = {button_size}
            >
            <Icon style={fontSize:'9pt'} name={'font'} />
        </Button>

    render_buttons: ->
        <span style={float:'right'}>
            <ButtonGroup>
                {@render_zoom_out()}
                {@render_zoom_in()}
                {@render_split_row()}
                {@render_split_col()}
                {@render_full()}
            </ButtonGroup>
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
        <div style={title_bar_style}>
            {@render_path()}
            {@render_x()}
            {@render_buttons()}
        </div>
