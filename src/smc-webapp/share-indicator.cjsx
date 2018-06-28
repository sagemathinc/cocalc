###
Indicator about whether or not file or path is publicly shared.
###

misc = require('smc-util/misc')

{React, ReactDOM, rclass, redux, rtypes, Redux, COLOR} = require('./app-framework')
{Icon, Loading, Space} = require('./r_misc')

SHARE_INDICATOR_STYLE =
    fontSize     : '14pt'
    borderRadius : '3px'
    marginTop    : '3px'
    display      : 'flex'
    top          : '-30px'
    right        : '3px'

exports.ShareIndicator = rclass ({name}) ->

    propTypes :
        project_id        : rtypes.string.isRequired
        path              : rtypes.string.isRequired
        shrink_fixed_tabs : rtypes.bool

    reduxProps :
        "#{name}" :
            public_paths : rtypes.immutable

    render_label: (is_public) ->
        if @props.shrink_fixed_tabs
            return
        if is_public
            label = "Public"
        else
            label = "Share"
        <span style={fontSize:'10.5pt', marginLeft:'5px'}>
            {label}
        </span>

    show_share_control: ->
        @actions(name).show_file_action_panel
            path   : @props.path
            action : 'share'

    render_share_button: (is_public) ->
        if is_public
            icon = 'bullhorn'
        else
            icon = 'share-square-o'
        <div style={cursor: 'pointer', color: COLOR.FG_BLUE, marginLeft:'5px', marginRight:'5px'} >
            <span onClick={@show_share_control}>
                <Icon name={icon} />
                {@render_label(is_public)}
            </span>
        </div>

    is_public: ->
        paths = []
        @props.public_paths.forEach (info, k) ->
            if not info.get('disabled')
                paths.push(info.get('path'))
            return
        x = misc.containing_public_path(@props.path, paths)
        return x?

    render: ->
        if not @props.public_paths?
            return <Loading />
        if @props.fullscreen
            return <span />
        is_public = @is_public()
        <div style={SHARE_INDICATOR_STYLE}>
            {@render_share_button(is_public)}
        </div>


