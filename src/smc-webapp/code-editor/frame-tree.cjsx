###
FrameTree -- a binary tree of editor frames.

For the first version, these will all be codemirror editors on the same file.
However, the next version will potentially be a mix of editors, output
places, terminals, etc.

The frame_tree prop is:

    type      : 'frame_tree'
    direction : 'row' = frame is split via horizontal line; 'col' = frame is split via vert line
    first     : if object, it's another frame_tree object (so direction, first, second, pos);
                if string, is id of some codemirror editor.
    second    : optional; if given, frame is split
    pos       : optional; if given, is percent position of drag bar, as number from 0 to 100.

or

    type      : 'cm'
    path      : path to file being edited
    font_size : font size of this file
    read_only : is it read only or not?

###

{React, ReactDOM, rclass, rtypes} = require('../smc-react')

{CodemirrorEditor} = require('./codemirror-editor')


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

    render_cols: ->
        <div style={display:'flex', flexDirection:'row'}>
            <div className={'smc-vfill'}>
                {@render_one(@props.frame_tree.get('first'))}
            </div>
            <div className={'smc-vfill'}>
                {@render_one(@props.frame_tree.get('second'))}
            </div>
        </div>

    render_rows: ->
        <div className={'smc-vfill'}>
            {@render_one(@props.frame_tree.get('first'))}
            {@render_one(@props.frame_tree.get('second'))}
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
