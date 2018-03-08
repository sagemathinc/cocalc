###
Top-level react component for editing code
###

misc                    = require('smc-util/misc')

{React, rclass, rtypes} = require('../smc-react')
{Loading}               = require('../r_misc')
{FrameTree}             = require('./frame-tree')
{IS_IPAD}               = require('../feature')

exports.Editor = rclass ({name}) ->
    displayName: 'CodeEditor-Editor'

    propTypes :
        actions    : rtypes.object.isRequired
        path       : rtypes.string.isRequired
        project_id : rtypes.string.isRequired

    reduxProps :
        "#{name}" :
            has_unsaved_changes     : rtypes.bool
            has_uncommitted_changes : rtypes.bool
            read_only               : rtypes.bool
            load_time_estimate      : rtypes.immutable.Map
            is_loaded               : rtypes.bool
            local_view_state        : rtypes.immutable.Map.isRequired
            error                   : rtypes.string
            cursors                 : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['has_unsaved_changes', 'has_uncommitted_changes', 'read_only',
                        'load_time_estimate', 'is_loaded', 'error', 'cursors', 'local_view_state'])

    componentDidMount: ->
        @props.actions.enable_key_handler()

    componentWillUnmount: ->
        @props.actions.disable_key_handler()
        @props.actions.set_syncstring_to_codemirror()

    render_loading: ->
        <div style={fontSize: '40px', textAlign: 'center', padding: '15px', color: '#999'}>
            <Loading estimate={@props.load_time_estimate} />
        </div>

    render_frame_tree: ->
        local = @props.local_view_state
        frame_tree = local.get('frame_tree')
        cm_state   = local.get('cm_state')
        if not @props.is_loaded or not frame_tree? or not cm_state?
            return @render_loading()
        <div
            className = {'smc-vfill'}
            style     = {background: 'lightgrey'}
            >
            <FrameTree
                actions             = {@props.actions}
                frame_tree          = {frame_tree}
                cm_state            = {cm_state}
                project_id          = {@props.project_id}
                active_id           = {local.get('active_id')}
                full_id             = {local.get('full_id')}
                font_size           = {local.get('font_size')}
                is_only             = {frame_tree.get('type') != 'node'}
                cursors             = {@props.cursors}
                has_unsaved_changes = {@props.has_unsaved_changes}
                />
        </div>

    render_error: ->
        if not @props.error
            return
        # TODO
        <div style={color:'red'}>{@props.error}</div>

    render_ipad_footer: ->
        if IS_IPAD
            <div style={height:'90px'}></div>

    render: ->
        <div className={'smc-vfill'} style={background:'#efefef'}>
            {@render_error()}
            {@render_frame_tree()}
            {@render_ipad_footer()}
        </div>