###
FrameTitleBar - title bar in a frame, in the frame tree
###

{ButtonGroup, Button}   = require('react-bootstrap')
{React, rclass, rtypes} = require('../smc-react')
{Icon}                  = require('../r_misc')

title_bar_style =
    background  : '#eee'
    fontSize    : '10pt'
    paddingLeft : '1em'
    color       : '#666'

exports.FrameTitleBar = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        active_id  : rtypes.string
        id         : rtypes.string
        title      : rtypes.string
        deletable  : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.active_id  != next.active_id or \
               @props.id         != next.id or \
               @props.path       != next.path

    click_close: ->
        @props.actions.close_frame(@props.id)

    render_x: ->
        if @props.deletable
            <Button
                key     = {'close'}
                bsSize  = {"xsmall"}
                onClick = {@click_close} >
                <Icon name={'times'}/>
            </Button>

    render_split_row: ->
        <Button
            key     = {'split-row'}
            bsSize  = {"xsmall"}
            onClick = {=>@props.actions.split_frame('row', @props.id)} >
            <Icon name='columns' rotate={'90'} />
        </Button>

    render_split_col: ->
        <Button
            key     = {'split-col'}
            bsSize  = {"xsmall"}
            onClick = {=>@props.actions.split_frame('col', @props.id)} >
            <Icon name='columns' />
        </Button>

    render_zoom_out: ->
        <Button
            key     = {'font-increase'}
            bsSize  = {"xsmall"}
            onClick = {=>@props.actions.decrease_font_size(@props.id)}
            >
            <Icon style={fontSize:'5pt'} name={'font'} />
        </Button>

    render_zoom_in: ->
        <Button
            key     = {'font-decrease'}
            onClick = {=>@props.actions.increase_font_size(@props.id)}
            bsSize  = {"xsmall"}
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
                {@render_x()}
            </ButtonGroup>
        </span>


    render: ->
        <div style={title_bar_style}>
            {@props.title}
            {@render_buttons()}
        </div>
