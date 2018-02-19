###
Top-level react component for editing code
###

{React, rclass, rtypes} = require('../smc-react')
{Loading}               = require('../r_misc')
{ButtonBar}             = require('./top-buttonbar')
{FrameTree}             = require('./frame-tree')

exports.Editor = rclass ({name}) ->
    propTypes :
        actions    : rtypes.object.isRequired
        path       : rtypes.string.isRequired
        project_id : rtypes.string.isRequired

    reduxProps :
        "#{name}" :
            has_unsaved_changes     : rtypes.bool
            has_uncommitted_changes : rtypes.bool
            read_only               : rtypes.bool
            printing                : rtypes.bool
            load_time_estimate      : rtypes.immutable.Map
            is_loaded               : rtypes.bool
            local_view_state        : rtypes.immutable.Map
            error                   : rtypes.string

    shouldComponentUpdate: (next) ->
        return @props.has_unsaved_changes     != next.has_unsaved_changes or \
               @props.has_uncommitted_changes != next.has_uncommitted_changes or \
               @props.read_only               != next.read_only or \
               @props.local_view_state        != next.local_view_state or \
               @props.printing                != next.printing or \
               @props.error                   != next.error

    componentDidMount: ->
        @props.actions.enable_key_handler()

    componentWillUnmount: ->
        @props.actions.disable_key_handler()

    render_button_bar: ->
        <ButtonBar
            actions                 = {@props.actions}
            read_only               = {@props.read_only}
            has_unsaved_changes     = {@props.has_unsaved_changes}
            has_uncommitted_changes = {@props.has_uncommitted_changes}
            project_id              = {@props.project_id}
            path                    = {@props.path}
            printing                = {@props.printing}
            />

    render_loading: ->
        <div style={fontSize: '40px', textAlign: 'center', padding: '15px', color: '#999'}>
            <Loading estimate={@props.load_time_estimate} />
        </div>

    render_frame_tree: ->
        frame_tree = @props.local_view_state?.get('frame_tree')
        if not @props.is_loaded or not frame_tree?
            return @render_loading()
        <FrameTree
            actions     = {@props.actions}
            frame_tree  = {frame_tree}
            active_id   = {@props.local_view_state.get('active_id')}
            />

    render_error: ->
        if not @props.error
            return
        # TODO
        <div style={color:'red'}>{@props.error}</div>

    render: ->
        <div className={'smc-vfill'} style={background:'white'}>
            {@render_button_bar()}
            {@render_error()}
            {@render_frame_tree()}
        </div>