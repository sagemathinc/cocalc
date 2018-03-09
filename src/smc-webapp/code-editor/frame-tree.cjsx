###
FrameTree -- a binary tree of editor frames.

For the first version, these will all be codemirror editors on the same file.
However, the next version will potentially be a mix of editors, output
places, terminals, etc.

The frame_tree prop is:

    id        : a UUID that uniquely determines this particular node in the frame tree
    type      : 'node'
    direction : 'row' = frame is split via horizontal line; 'col' = frame is split via vert line
    first     : NOT optional -- another object with id, type, etc.
    second    : another object with id, type, etc.
    pos       : optional; if given, is position of drag bar, as number from 0 to 1 (representation proportion of width or height).
    deletable : bool

or

    id        : a UUID that uniquely determines this particular node in the frame tree
    type      : 'cm'
    path      : path to file being edited
    font_size : font size of this file
    read_only : is it read only or not?
    deletable : bool
###

Draggable                         = require('react-draggable')
misc                              = require('smc-util/misc')
{React, ReactDOM, rclass, rtypes} = require('../smc-react')
{CodemirrorEditor}                = require('./codemirror-editor')
feature                           = require('../feature')
{FrameTitleBar}                   = require('./frame-title-bar')
tree_ops                          = require('./tree-ops')


drag_offset = if feature.IS_TOUCH then 5 else 2

cols_drag_bar =
    padding      : "#{drag_offset}px"
    background   : "#efefef"
    zIndex       : 20
    cursor       : 'ew-resize'

drag_hover =
    background:'darkgrey'
    opacity:.8

cols_drag_bar_drag_hover = misc.merge(misc.copy(cols_drag_bar), drag_hover)

rows_drag_bar = misc.merge(misc.copy(cols_drag_bar), {cursor:'ns-resize'})

rows_drag_bar_drag_hover = misc.merge(misc.copy(rows_drag_bar), drag_hover)

exports.FrameTree = FrameTree = rclass
    displayName: 'CodeEditor-FrameTree'

    propTypes               :
        actions             : rtypes.object.isRequired
        project_id          : rtypes.string        # assumed to never change -- all frames in same project
        active_id           : rtypes.string
        full_id             : rtypes.string
        frame_tree          : rtypes.immutable.isRequired
        cm_state            : rtypes.immutable.isRequired    # IMPORTANT: change does NOT cause re-render (uncontrolled); only used for full initial render, on purpose
        font_size           : rtypes.number.isRequired
        is_only             : rtypes.bool
        cursors             : rtypes.immutable.Map
        has_unsaved_changes : rtypes.bool

    getInitialState: ->
        drag_hover: false

    shouldComponentUpdate: (next, state) ->
        return @state.drag_hover != state.drag_hover or \
               misc.is_different(@props, next, ['frame_tree', 'active_id', 'full_id', 'is_only', \
                      'cursors', 'has_unsaved_changes'])

    render_frame_tree: (desc) ->
        <FrameTree
            actions             = {@props.actions}
            frame_tree          = {desc}
            cm_state            = {@props.cm_state}
            active_id           = {@props.active_id}
            project_id          = {@props.project_id}
            font_size           = {@props.font_size}
            is_only             = {false}
            cursors             = {@props.cursors}
            has_unsaved_changes = {@props.has_unsaved_changes}
        />

    render_titlebar: (desc) ->
        <FrameTitleBar
            actions             = {@props.actions}
            active_id           = {@props.active_id}
            project_id          = {desc.get('project_id') ? @props.project_id}
            is_full             = {desc.get('id') == @props.full_id and not @props.is_only}
            is_only             = {@props.is_only}
            id                  = {desc.get('id')}
            path                = {desc.get('path')}
            deletable           = {desc.get('deletable') ? true}
            read_only           = {desc.get('read_only')}
            has_unsaved_changes = {@props.has_unsaved_changes}
        />

    render_codemirror: (desc) ->
        <CodemirrorEditor
            actions     = {@props.actions}
            id          = {desc.get('id')}
            read_only   = {desc.get('read_only')}
            font_size   = {desc.get('font_size') ? @props.font_size}
            path        = {desc.get('path')}
            cm_state    = {@props.cm_state.get(desc.get('id'))}
            is_current  = {desc.get('id') == @props.active_id}
            cursors     = {@props.cursors}
        />

    render_one: (desc) ->
        switch desc?.get('type')
            when 'node'
                return @render_frame_tree(desc)
            when 'cm'
                child = @render_codemirror(desc)
            else
                # fix this disaster next time around.
                setTimeout((=>@props.actions?.reset_frame_tree()), 1)
                return <div>Invalid frame tree {misc.to_json(desc)}</div>
        <div
            className    = {'smc-vfill'}
            onClick      = {=>@props.actions.set_active_id(desc.get('id'))}
            onTouchStart = {=>@props.actions.set_active_id(desc.get('id'))}
        >
            {@render_titlebar(desc)}
            {child}
        </div>

    render_first: ->
        desc = @props.frame_tree.get('first')
        <div className={'smc-vfill'}>
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

        # the preventDefault below prevents the text and scroll of what is in the frame from getting messed up during the drag.
        <Draggable
            ref     = {'cols_drag_bar'}
            axis    = {'x'}
            onStop  = {handle_stop}
            onMouseDown = {(e) => e.preventDefault()}
            >
            <div
                style        = {if @state.drag_hover then cols_drag_bar_drag_hover else cols_drag_bar}
                onMouseEnter = {=> @setState(drag_hover: true)}
                onMouseLeave = {=> @setState(drag_hover: false)}>
            </div>
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
            style_first  : {display:'flex', flex:pos}
            second       : @props.frame_tree.get('second')
            style_second : {display:'flex', flex:1-pos}

        if flex_direction == 'row'
            data.outer_style = {display:'flex', flexDirection:'row', flex:1}
        else
            data.outer_style = undefined
        return data

    render_cols: ->
        data = @get_data('row')
        <div
            ref   = {'cols_container'}
            style = {data.outer_style}>
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
            onMouseDown = {(e) => e.preventDefault()}
            >
            <div
                style        = {if @state.drag_hover then rows_drag_bar_drag_hover else rows_drag_bar}
                onMouseEnter = {=> @setState(drag_hover: true)}
                onMouseLeave = {=> @setState(drag_hover: false)}
                >
            </div>
        </Draggable>

    render_rows: ->
        data = @get_data('column')
        <div
            className = {'smc-vfill'}
            ref       = {'rows_container'}
            style     = {data.outer_style} >
            <div className={'smc-vfill'} style={data.style_first}>
                {@render_one(data.first)}
            </div>
            {@render_rows_drag_bar()}
            <div className={'smc-vfill'} style={data.style_second}>
                {@render_one(data.second)}
            </div>
        </div>

    render: ->
        if @props.full_id
            # A single frame is full-tab'd:
            node = tree_ops.get_node(@props.frame_tree, @props.full_id)
            if node?
                # only render it if it actually exists, of course.
                return @render_one(node)

        if @props.frame_tree.get('type') != 'node'
            return @render_one(@props.frame_tree)
        else if @props.frame_tree.get('direction') == 'col'
            return @render_cols()
        else
            return @render_rows()
