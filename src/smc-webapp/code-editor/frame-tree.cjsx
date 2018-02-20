###
FrameTree -- a binary tree of editor frames.

For the first version, these will all be codemirror editors on the same file.
However, the next version will potentially be a mix of editors, output
places, terminals, etc.

The frame_tree prop is:

    id        : a UUID that uniquely determines this particular node in the frame tree
    type      : 'frame_tree'
    scroll    : optional scroll position info
    direction : 'row' = frame is split via horizontal line; 'col' = frame is split via vert line
    first     : NOT optional -- another object with id, type, etc.
    second    : another object with id, type, etc.
    pos       : optional; if given, is position of drag bar, as number from 0 to 1 (representation proportion of width or height).

or

    id        : a UUID that uniquely determines this particular node in the frame tree
    type      : 'cm'
    scroll    : optional scroll position info
    path      : path to file being edited
    font_size : font size of this file
    read_only : is it read only or not?

###

Draggable                         = require('react-draggable')
misc                              = require('smc-util/misc')
{React, ReactDOM, rclass, rtypes} = require('../smc-react')
{CodemirrorEditor}                = require('./codemirror-editor')
feature                           = require('../feature')

bar_color = '#eee'
drag_offset = if feature.IS_TOUCH then 5 else 1

cols_drag_bar =
    border       : "#{drag_offset}px solid #{bar_color}"
    zIndex       : 10
    padding      : 0.5
    cursor       : 'ew-resize'
    borderRadius : '2px'

rows_drag_bar = misc.merge(misc.copy(cols_drag_bar), {cursor:'ns-resize'})

active_border = '2px solid #77b6e8'

exports.FrameTree = FrameTree = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        active_id  : rtypes.string
        frame_tree : rtypes.immutable.isRequired

    shouldComponentUpdate: (next) ->
        return @props.frame_tree != next.frame_tree or \
               @props.active_id  != next.active_id

    render_frame_tree: (desc) ->
        <FrameTree
            actions    = {@props.actions}
            frame_tree = {desc}
            active_id  = {@props.active_id}
        />

    render_codemirror: (desc) ->
        <CodemirrorEditor
            actions   = {@props.actions}
            id        = {desc.get('id')}
            read_only = {desc.get('read_only')}
            font_size = {desc.get('font_size')}
            path      = {desc.get('path')}
            scroll    = {desc.get('scroll')}
        />

    render_one: (desc) ->
        switch desc?.get('type')
            when 'frame_tree'
                return @render_frame_tree(desc)
            when 'cm'
                return @render_codemirror(desc)
            else
                return <div>Invalid frame tree {misc.to_json(desc)}</div>

    render_first: ->
        desc = @props.frame_tree.get('first')
        if @props.active_id == desc.get('id')
            style = {border: active_border}
        else
            style = undefined
        <div style={style} className='smc-vfill'>
            @render_one(desc)
        </div>

    render_cols_drag_bar: ->
        reset = =>
            if @refs.cols_drag_bar?
                @refs.cols_drag_bar.state.x = 0
                $(ReactDOM.findDOMNode(@refs.cols_drag_bar)).css('transform','')

        handle_stop = (evt, ui) =>
            clientX = ui.node.offsetLeft + ui.x + drag_offset
            elt     = ReactDOM.findDOMNode(@refs.cols_container)
            pos     = (clientX - elt.offsetLeft) / elt.offsetWidth
            reset()
            @props.actions.set_frame_tree(id:@props.frame_tree.get('id'), pos:pos)

        <Draggable
            ref     = {'cols_drag_bar'}
            axis    = {'x'}
            onStop  = {handle_stop}
            >
            <div style={cols_drag_bar}> </div>
        </Draggable>

    get_pos: ->
        pos = parseFloat(@props.frame_tree.get('pos')) ? 0.5
        if isNaN(pos)
            pos = 0.5
        return pos

    get_data: (flex_direction) ->
        pos = @get_pos()
        data =
            pos          : pos
            first        : @props.frame_tree.get('first')
            style_first  : {flex:pos,   flexDirection:flex_direction, border:'2px solid transparent'}
            second       : @props.frame_tree.get('second')
            style_second : {flex:1-pos, flexDirection:flex_direction, border:'2px solid transparent'}
        if data.first.get('id') == @props.active_id
            data.style_first.border = active_border
        else if data.second.get('id') == @props.active_id
            data.style_second.border = active_border
        return data

    render_cols: ->
        data = @get_data('row')
        <div
            style = {display:'flex', flexDirection:'row'}
            ref   = {'cols_container'}>
            <div className={'smc-vfill'} style={data.style_first}>
                {@render_one(data.first)}
            </div>
            {@render_cols_drag_bar()}
            <div className={'smc-vfill'} style={data.style_second}>
                {@render_one(data.second)}
            </div>
        </div>

    render_rows_drag_bar: ->
        reset = =>
            if @refs.rows_drag_bar?
                @refs.rows_drag_bar.state.y = 0
                $(ReactDOM.findDOMNode(@refs.rows_drag_bar)).css('transform','')

        handle_stop = (evt, ui) =>
            clientY = ui.node.offsetTop + ui.y + drag_offset
            elt     = ReactDOM.findDOMNode(@refs.rows_container)
            pos     = (clientY - elt.offsetTop) / elt.offsetHeight
            reset()
            @props.actions.set_frame_tree(id:@props.frame_tree.get('id'), pos:pos)

        <Draggable
            ref     = {'rows_drag_bar'}
            axis    = {'y'}
            onStop  = {handle_stop}
            >
            <div style={rows_drag_bar}> </div>
        </Draggable>

    render_rows: ->
        data = @get_data('column')
        <div
            className = {'smc-vfill'}
            ref       = {'rows_container'} >
            <div className={'smc-vfill'} style={data.style_first}>
                {@render_one(data.first)}
            </div>
            {@render_rows_drag_bar()}
            <div className={'smc-vfill'} style={data.style_second}>
                {@render_one(data.second)}
            </div>
        </div>

    render: ->
        if @props.frame_tree.get('type') != 'frame_tree'
            return @render_one(@props.frame_tree)
        else if @props.frame_tree.get('direction') == 'col'
            return @render_cols()
        else
            return @render_rows()
