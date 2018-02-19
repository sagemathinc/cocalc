###
FrameTree -- a binary tree of editor frames.

For the first version, these will all be codemirror editors on the same file.
However, the next version will potentially be a mix of editors, output
places, terminals, etc.

The frame_tree prop is:

    id        : a UUID that uniquely determines this particular node in the frame tree
    type      : 'frame_tree'
    direction : 'row' = frame is split via horizontal line; 'col' = frame is split via vert line
    first     : if object, it's another frame_tree object (so direction, first, second, pos);
                if string, is id of some codemirror editor.
    second    : optional; if given, frame is split
    pos       : optional; if given, is position of drag bar, as number from 0 to 1 (representation proportion of width or height).

or

    id        : a UUID that uniquely determines this particular node in the frame tree
    type      : 'cm'
    path      : path to file being edited
    font_size : font size of this file
    read_only : is it read only or not?
    scroll    : info about scroll

###

Draggable                         = require('react-draggable')
misc                              = require('smc-util/misc')
{React, ReactDOM, rclass, rtypes} = require('../smc-react')
{CodemirrorEditor}                = require('./codemirror-editor')
feature                           = require('../feature')

bar_color = '#eee'
drag_offset = if feature.IS_TOUCH then 5 else 1

cols_drag_bar =
    border  : "#{drag_offset}px solid #{bar_color}"
    zIndex  : 10
    padding : 0.5
    cursor  : 'ew-resize'

rows_drag_bar = misc.merge(misc.copy(cols_drag_bar), {cursor:'ns-resize'})

exports.FrameTree = FrameTree = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        frame_tree : rtypes.immutable.isRequired

    shouldComponentUpdate: (next) ->
        return @props.frame_tree != next.frame_tree

    render_frame_tree: (desc) ->
        <FrameTree
            actions    = {@props.actions}
            frame_tree = {desc}
        />

    render_codemirror: (desc) ->
        <CodemirrorEditor
            actions   = {@props.actions}
            read_only = {desc.get('read_only')}
            font_size = {desc.get('font_size')}
            path      = {desc.get('path')}
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
        @render_one(@props.frame_tree.get('first'))

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

    render_cols: ->
        pos = @get_pos()
        <div
            style = {display:'flex', flexDirection:'row'}
            ref   = {'cols_container'}>
            <div className={'smc-vfill'} style={flex:pos}>
                {@render_one(@props.frame_tree.get('first'))}
            </div>
            {@render_cols_drag_bar()}
            <div className={'smc-vfill'} style={flex:1-pos}>
                {@render_one(@props.frame_tree.get('second'))}
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
        pos = @get_pos()
        <div
            className = {'smc-vfill'}
            ref       = {'rows_container'} >
            <div className={'smc-vfill'} style={flex:pos, flexDirection:'column'}>
                {@render_one(@props.frame_tree.get('first'))}
            </div>
            {@render_rows_drag_bar()}
            <div className={'smc-vfill'} style={flex:1-pos, flexDirection:'column'}>
                {@render_one(@props.frame_tree.get('second'))}
            </div>
        </div>

    render: ->
        if @props.frame_tree.get('type') != 'frame_tree'
            return @render_one(@props.frame_tree)
        else if not @props.frame_tree.get('second')?
            # frame tree, but with only a first (so a leaf)
            return @render_first()
        else if @props.frame_tree.get('direction') == 'col'
            return @render_cols()
        else
            return @render_rows()
