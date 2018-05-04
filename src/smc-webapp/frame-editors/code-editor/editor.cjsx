###
Top-level react component for editing code
###

misc                    = require('smc-util/misc')

{React, rclass, rtypes} = require('smc-webapp/smc-react')
{ErrorDisplay, Loading} = require('smc-webapp/r_misc')
{FrameTree}             = require('./frame-tree')
{IS_IPAD}               = require('smc-webapp/feature')

{StatusBar}             = require('./status-bar')

exports.set = (v) ->  # used for specifying buttons...
    s = {}
    for x in v
        s[x] = true
    return s

###

NOTES:
  - editor_spec is an optional map from type names to react components (changing doesn't update component).
    Set this when there are non-codemirror editor leafs in the frame tree.
###
exports.Editor = rclass ({name}) ->
    displayName: 'CodeEditor-Editor'

    propTypes :
        actions     : rtypes.object.isRequired
        path        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        editor_spec : rtypes.object

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
            is_public               : rtypes.bool
            value                   : rtypes.string
            content                 : rtypes.string

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['has_unsaved_changes', 'has_uncommitted_changes', 'read_only',
                        'load_time_estimate', 'is_loaded', 'error', 'cursors', 'local_view_state', 'is_public',
                        'content', 'value'])

    componentDidMount: ->
        # @props.actions.enable_key_handler()

    componentWillUnmount: ->
        # @props.actions.disable_key_handler()
        @props.actions.set_syncstring_to_codemirror()

    render_loading: ->
        <div style={fontSize: '40px', textAlign: 'center', padding: '15px', color: '#999'}>
            <Loading estimate={@props.load_time_estimate} />
        </div>

    render_frame_tree: ->
        local        = @props.local_view_state
        if not local?
            return
        frame_tree   = local.get('frame_tree')
        editor_state = local.get('editor_state')
        if not @props.is_loaded or not frame_tree? or not editor_state? or (@props.is_public and not @props.content?)
            return @render_loading()
        <div
            className = {'smc-vfill'}
            >
            <FrameTree
                name                = {name}
                actions             = {@props.actions}
                frame_tree          = {frame_tree}
                editor_state        = {editor_state}
                project_id          = {@props.project_id}
                path                = {@props.path}
                active_id           = {local.get('active_id')}
                full_id             = {local.get('full_id')}
                font_size           = {local.get('font_size')}
                is_only             = {frame_tree.get('type') != 'node'}
                cursors             = {@props.cursors}
                read_only           = {@props.read_only}
                is_public           = {@props.is_public}
                content             = {@props.content}
                value               = {@props.value}
                editor_spec         = {@props.editor_spec}
                />
        </div>

    render_error: ->
        if not @props.error
            return
        <ErrorDisplay
            error   = {@props.error}
            onClose = {=>@props.actions.set_error('')}
            style   = {maxWidth: '100%', margin: '1ex', maxHeight: '30%', overflowY: 'scroll'}
        />

    #render_ipad_footer: ->
    #    if IS_IPAD
    #        <div style={height:'90px'}></div>

    render_status_bar: ->
        <StatusBar name={name} />

    render: ->
        <div className={'smc-vfill'}>
            {@render_error()}
            {@render_frame_tree()}
            {@render_status_bar()}
            {### @render_ipad_footer() ###}
        </div>
