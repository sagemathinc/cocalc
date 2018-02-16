###
Top-level react component for editing code
###

{React, rclass, rtypes} = require('../smc-react')
{Loading}               = require('../r_misc')
{ButtonBar}             = require('./top-buttonbar')
{CodeEditor}            = require('./codemirror-editor')

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
            load_time_estimate      : rtypes.immutable.Map
            is_loaded               : rtypes.bool
            local_view_state        : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return @props.has_unsaved_changes     != next.has_unsaved_changes or \
               @props.has_uncommitted_changes != next.has_uncommitted_changes or \
               @props.read_only               != next.read_only or \
               @props.local_view_state        != next.local_view_state

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
            />

    render_loading: ->
        <div style={fontSize: '40px', textAlign: 'center', padding: '15px', color: '#999'}>
            <Loading estimate={@props.load_time_estimate} />
        </div>

    render_editor: ->
        if not @props.is_loaded
            return @render_loading()
        <CodeEditor
            actions   = {@props.actions}
            read_only = {@props.read_only}
            font_size = {@props.local_view_state?.get('font_size')}
            path      = {@props.path}
            scroll    = {@props.local_view_state?.get('scroll')}
            />

    render: ->
        <div className={'smc-vfill'}>
            {@render_button_bar()}
            {@render_editor()}
        </div>