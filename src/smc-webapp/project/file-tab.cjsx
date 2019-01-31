###
A single file tab that

There is one of these for each open file in a project.
###

{React, ReactDOM, rclass, rtypes} = require('../app-framework')

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
        file_tab     : rtypes.bool      # Whether or not this tab holds a file
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
            analytics_event('project_navigation', 'opened_a_file')
            # shift/ctrl/option clicking on *file* tab opens in a new popout window.
            actions.open_file
                path               : misc.tab_to_path(@props.name)
                new_browser_window : true
        else
            analytics_event('project_navigation', 'opened_' + @props.name)
            actions.set_active_tab(@props.name)

    # middle mouse click closes
    onMouseDown: (e) ->
        if e.button == 1
            @close_file(e, misc.tab_to_path(@props.name))

    render : ->
        styles = {}

        if @props.file_tab
            styles = misc.copy(exports.DEFAULT_FILE_TAB_STYLES)
            if @props.is_active
                styles.backgroundColor = COLORS.BLUE_BG
        else
            styles.flex = 'none'

        icon_style =
            fontSize: '15pt'

        if @props.file_tab
            icon_style.fontSize = '10pt'

        if @props.has_activity
            icon_style.color = 'orange'

        label_styles =
            whiteSpace   : 'nowrap'
            overflow     : 'hidden'
            # textOverflow : 'ellipsis'   # removed, since it ends up wasting precious space!

        x_button_styles =
            float      : 'right'
            whiteSpace : 'nowrap'

        if @state.x_hovered
            x_button_styles.color = 'lightblue'

        text_color = 'white' if @props.is_active

        if @props.file_tab
            label = <>{@props.label}</>
        else
            label = <HiddenXS>{@props.label if not @props.shrink}</HiddenXS>

        content = <><Icon style={icon_style} name={@props.icon} /> {label} </>

        if @props.file_tab
            # ONLY show for filenames, name file/new/find, etc. since stable.
            content = <Tip title={@props.tooltip} stable={true} placement={'bottom'} size={'small'}> {content} </Tip>

        <NavItem
            ref         = 'tab'
            style       = {styles}
            active      = {@props.is_active}
            onClick     = {@click}
            onMouseDown = {@onMouseDown}
        >
            <div style={width:'100%', color:text_color, cursor : 'pointer'}>
                <div style={x_button_styles}>
                    {<Icon
                        onMouseOver = {@mouse_over_x} onMouseOut={@mouse_out_x}
                        name        = 'times'
                        onClick     = {(e)=>@close_file(e, misc.tab_to_path(@props.name))}
                    /> if @props.file_tab}
                </div>
                <div style={label_styles}>
                    {content}
                </div>
            </div>
        </NavItem>
