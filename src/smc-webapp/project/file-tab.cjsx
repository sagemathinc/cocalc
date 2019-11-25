###
A single file tab that

There is one of these for each open file in a project.
###

{React, ReactDOM, rclass, rtypes, Fragment} = require('../app-framework')

misc = require('smc-util/misc')

{NavItem} = require('react-bootstrap')

{COLORS, HiddenXS, Icon, Tip} = require('../r_misc')

{analytics_event} = require("../tracker")

exports.DEFAULT_FILE_TAB_STYLES =
    width        : 250
    borderRadius : "5px 5px 0px 0px"
    flexShrink   : '1'
    overflow     : 'hidden'


exports.FileTab = rclass
    displayName : 'FileTab'

    propTypes :
        name         : rtypes.string
        label        : rtypes.string    # rendered tab title
        icon         : rtypes.string    # Affiliated icon
        project_id   : rtypes.string
        tooltip      : rtypes.string
        is_active    : rtypes.bool
        file_tab     : rtypes.bool      # Whether or not this tab holds a file *editor*
        shrink       : rtypes.bool      # Whether or not to shrink to just the icon
        has_activity : rtypes.bool      # Whether or not some activity is happening with the file

    getInitialState : ->
        x_hovered : false

    componentDidMount : ->
        @strip_href()

    componentDidUpdate : ->
        @strip_href()

    strip_href : ->
        ReactDOM.findDOMNode(@refs.tab)?.children[0].removeAttribute('href')

    mouse_over_x: ->
        @setState(x_hovered:true)

    mouse_out_x: ->
        @setState(x_hovered:false)
        @actions(project_id: @props.project_id).clear_ghost_file_tabs()

    close_file : (e, path) ->
        e.stopPropagation()
        e.preventDefault()
        @actions(project_id: @props.project_id).close_tab(path)

    click: (e) ->
        actions = @actions(project_id: @props.project_id)
        if @props.file_tab and (e.ctrlKey or e.shiftKey or e.metaKey)
            # shift/ctrl/option clicking on *file* tab opens in a new popout window.
            actions.open_file
                path               : misc.tab_to_path(@props.name)
                new_browser_window : true
        else
            actions.set_active_tab(@props.name)

        if @props.file_tab
            analytics_event('project_navigation', 'opened_a_file', misc.filename_extension(@props.name))
        else
            analytics_event('project_navigation', 'opened_project_' + @props.name)

    # middle mouse click closes
    onMouseDown: (e) ->
        if e.button == 1
            @close_file(e, misc.tab_to_path(@props.name))

    render : ->
        style = {}

        if @props.file_tab
            style = misc.copy(exports.DEFAULT_FILE_TAB_STYLES)
            if @props.is_active
                style.backgroundColor = COLORS.BLUE_BG
        else
            style.flex = 'none'

        icon_style =
            fontSize: '15pt'

        if @props.file_tab
            icon_style.fontSize = '10pt'

        if @props.has_activity
            icon_style.color = 'orange'

        content_style =
            whiteSpace   : 'nowrap'
            overflow     : 'hidden'

        if @props.file_tab
            content_style.display = 'flex'

        label_style =
            flex         : 1
            textOverflow : 'ellipsis'
            direction    : 'rtl'
            padding      : '0 1px'
            overflow     : 'hidden'

        x_button_style =
            float      : 'right'
            whiteSpace : 'nowrap'

        if @state.x_hovered
            x_button_style.color = 'lightblue'

        text_color = 'white' if @props.is_active

        if @props.file_tab
            label = <Fragment>{@props.label}</Fragment>
        else
            label = <HiddenXS>{@props.label if not @props.shrink}</HiddenXS>

        if @props.file_tab
            # ONLY show tooltip for filename (it provides the full path).
            label = <Tip title={@props.tooltip} stable={true} placement={'bottom'}> {label} </Tip>
            label = <div style={label_style}>{label}</div>

        body = <div style={width:'100%', color:text_color, cursor : 'pointer'}>
                <div style={x_button_style}>
                    {<Icon
                        onMouseOver = {@mouse_over_x} onMouseOut={@mouse_out_x}
                        name        = 'times'
                        onClick     = {(e)=>@close_file(e, misc.tab_to_path(@props.name))}
                    /> if @props.file_tab}
                </div>
                <div style={content_style}>
                    <Icon style={icon_style} name={@props.icon} /> {label}
                </div>
            </div>

        <NavItem
            ref         = 'tab'
            style       = {style}
            active      = {@props.is_active}
            onClick     = {@click}
            cocalc-test = {@props.label}
            onMouseDown = {@onMouseDown}
        >
            {body}
        </NavItem>
