##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
##############################################################################

# External Libraries
{SortableContainer, SortableElement} = require('react-sortable-hoc')
{Button, Nav, NavDropdown, MenuItem, NavItem} = require('react-bootstrap')

# SMC Libraries
misc = require('smc-util/misc')
feature = require('./feature')
{set_window_title} = require('./browser')
{COLORS} = require('smc-util/theme')

# SMC Components
{React, ReactDOM, rclass, rtypes} = require('./app-framework')
{Loading, Icon, Tip} = require('./r_misc')
{NavTab} = require('./app_shared')

{WebsocketIndicator} = require('./project/websocket/websocket-indicator')

NavWrapper = ({style, children, id, className}) ->
    React.createElement(Nav, {style:style, id:id, className:className}, children)

SortableNavTab = SortableElement(NavTab)
SortableNav = SortableContainer(NavWrapper)

GhostTab = (props) ->
    <NavItem
        style = {flexShrink:'1', width:'200px', height:'36px', overflow: 'hidden'}
    />

# Future: Combine ProjectTab and OpenProjectMenuItem into a HOC which takes NavItem and MenuItem respectively...
ProjectTab = rclass
    reduxProps:
        projects:
            public_project_titles : rtypes.immutable.Map
            project_websockets : rtypes.immutable.Map
        account:
            is_anonymous : rtypes.bool

    propTypes:
        project        : rtypes.immutable.Map
        index          : rtypes.number
        project_id     : rtypes.string
        active_top_tab : rtypes.string

    getInitialState: ->
        x_hovered : false

    ###
    This strip_href is a hack below to workaround issues with Firefox.  In particular, without this hack:
    In the project bar in the dev app, I can grab the tab for a project and pull it down
    from the bar. Just the label, not the whole browser tab. And when I let go, the
    tab returns to the project bar but its horizontal motion still tracks mouse
    cursor position. Clicking mouse releases the tab to a correct position in the
    project bar. That does not happen in with Chrome.
    ###
    strip_href: ->
        @refs.tab?.node.children[0].removeAttribute('href')
    componentDidMount: ->
        @strip_href()
    componentDidUpdate: () ->
        @strip_href()

    close_tab: (e) ->
        e.stopPropagation()
        e.preventDefault()
        @actions('page').close_project_tab(@props.project_id)

    # middle mouse click closes (?) -- evidently too confusing??
    onMouseDown: (e) ->
        #if e.button == 1
        #    @close_tab(e)

    render_websocket_indicator: ->
        if not @props.project?
            # public project, so we know nothing, so better not show an indicator (we can't connect anyways).
            return
        <span style={{paddingRight:'5px'}}>
            <WebsocketIndicator state={@props.project_websockets?.get(@props.project_id)} />
        </span>

    render_close_x: ->
        if @props.is_anonymous
            # you have one project and you can't close it.
            return
        <Icon
            name        = 'times'
            onClick     = {@close_tab}
            onMouseOver = {(e)=>@setState(x_hovered:true)}
            onMouseOut  = {(e)=>@actions('page').clear_ghost_tabs();@setState(x_hovered:false)}
        />


    render: ->
        title  = @props.project?.get('title') ? @props.public_project_titles?.get(@props.project_id)
        if not title?
            if @props.active_top_tab == @props.project_id
                set_window_title("Loading")
            return <Loading key={@props.project_id} />

        if @props.active_top_tab == @props.project_id
            set_window_title(title)

        desc = misc.trunc(@props.project?.get('description') ? '', 128)
        project_state = @props.project?.getIn(['state', 'state'])
        icon = require('smc-util/schema').COMPUTE_STATES[project_state]?.icon ? 'bullhorn'

        project_name_styles =
            whiteSpace: 'nowrap'
            overflow: 'hidden'
            #textOverflow: 'ellipsis'

        if @props.project_id == @props.active_top_tab
            text_color = COLORS.TOP_BAR.TEXT_ACTIVE

        if @state.x_hovered
            x_color = COLORS.TOP_BAR.X_HOVER
        else
            x_color = COLORS.TOP_BAR.X

        <SortableNavTab
            index          = {@props.index}
            name           = {@props.project_id}
            actions        = {@actions('page')}
            active_top_tab = {@props.active_top_tab}
            style          = {flexShrink:'1', width:'200px', maxWidth:'200px', height:'36px', overflow: 'hidden', lineHeight:'1.75em', color:text_color}
            ref            = 'tab'
            is_project     = {true}
        >
            <div style = {float:'right', whiteSpace:'nowrap', color:x_color}>
                {@render_websocket_indicator()}
                {@render_close_x()}
            </div>
            <div style={project_name_styles}>
                <Tip title={misc.trunc(title,32)} tip={desc} placement='bottom' size='small' always_update={true}>
                    <Icon name={icon} />
                    <span style={marginLeft: 5, position:'relative'}>{misc.trunc(title,24)}</span>
                </Tip>
            </div>
        </SortableNavTab>

FullProjectsNav = rclass
    reduxProps :
        projects :
            open_projects  : rtypes.immutable.List # List of open projects and their state
            project_map    : rtypes.immutable.Map  # All projects available to the user
            public_project_titles : rtypes.immutable
        page :
            active_top_tab    : rtypes.string    # key of the active tab
            num_ghost_tabs    : rtypes.number

    getDefaultProps: ->
        num_ghost_tabs : 0

    on_sort_end: ({oldIndex, newIndex}) ->
        @actions('projects').move_project_tab({old_index:oldIndex, new_index:newIndex, open_projects:@props.open_projects})

    render_project_tabs: ->
        v = []
        if not @props.open_projects?
            return
        @props.open_projects.map (project_id, index) =>
            v.push(@render_project_tab(project_id, index))

        if @props.num_ghost_tabs == 0
            return v

        num_real_tabs = @props.open_projects.size
        num_tabs = num_real_tabs + @props.num_ghost_tabs
        for index in [num_real_tabs..(num_tabs-1)]
            v.push(<GhostTab index={index} key={index}/>)
        return v

    render_project_tab: (project_id, index) ->
        <ProjectTab
            index                 = {index}
            key                   = {project_id}
            project_id            = {project_id}
            active_top_tab        = {@props.active_top_tab}
            project               = {@props.project_map?.get(project_id)}
            public_project_titles = {@props.public_project_titles}
        />

    render: ->
        # NOTE!!! The margin:'0' in the style in SortableNav below is critical; without
        # it, when you make the screen skinny, the tabs get mangled looking.  DO NOT
        # delete without being aware of this!
        <div
            style = {display:'flex', flex:'1', overflow:'hidden', height:'36px', margin:'0'}
        >
            <SortableNav
                className            = "smc-project-tab-sorter"
                style                = {display:'flex', overflow: 'hidden', margin:'0'}
                helperClass          = {'smc-project-tab-floating'}
                onSortEnd            = {@on_sort_end}
                axis                 = {'x'}
                lockAxis             = {'x'}
                lockToContainerEdges = {true}
                distance             = {3 if not feature.IS_TOUCH}
                pressDelay           = {200 if feature.IS_TOUCH}
            >
                {@render_project_tabs()}
            </SortableNav>
        </div>

OpenProjectMenuItem = rclass
    propTypes:
        project               : rtypes.immutable.Map
        open_projects         : rtypes.immutable.List
        public_project_titles : rtypes.immutable.Map
        index                 : rtypes.number
        project_id            : rtypes.string
        active_top_tab        : rtypes.string

    getInitialState: ->
        x_hovered : false

    close_tab: (e) ->
        e.stopPropagation()
        e.preventDefault()
        @actions('page').close_project_tab(@props.project_id)

    open_project: (e) ->
        e.stopPropagation()
        e.preventDefault()
        @actions('page').set_active_tab(@props.project_id)

    render: ->
        title = @props.project?.get('title')
        title ?= @props.public_project_titles?.get(@props.project_id)
        if not title?
            # Ensure that at some point we'll have the title if possible (e.g., if public)
            @actions('projects').fetch_public_project_title(@props.project_id)
            return <Loading key={@props.project_id} />

        desc = misc.trunc(@props.project?.get('description') ? '', 128)
        project_state = @props.project?.getIn(['state', 'state'])
        icon = require('smc-util/schema').COMPUTE_STATES[project_state]?.icon ? 'bullhorn'

        menu_item_project_name_styles =
            whiteSpace   : 'nowrap'
            overflow     : 'hidden'
            #textOverflow : 'ellipsis'
            marginRight  : '3px'
            width        : '100%'

        if @props.project_id == @props.active_top_tab
            text_color = COLORS.TOP_BAR.TEXT_ACTIVE

        if @state.x_hovered
            x_color = COLORS.TOP_BAR.X_HOVER
        else
            x_color = COLORS.TOP_BAR.X

        <MenuItem onClick={@open_project} style={lineHeight:'1.75em', color:text_color}>
            <Tip style={menu_item_project_name_styles} title={misc.trunc(title,32)} tip={desc} placement='bottom' size='small'>
                <div style={height: '36px', padding: [7, 5], fontSize: '18px'}>
                    <Icon name={icon} style={fontSize:'20px'} />
                    <span style={marginLeft: "5px"}>{misc.trunc(title,24)}</span>
                </div>
            </Tip>
            <Button
                bsStyle="warning"
                onClick={@close_tab}
                style = {height: '34px', paddingTop: '4px', whiteSpace:'nowrap', fontSize:'16px', color:x_color}
            >
                <Icon name='times'/>
            </Button>
        </MenuItem>

DropdownProjectsNav = rclass
    reduxProps :
        projects :
            open_projects  : rtypes.immutable.List # Open projects and their state
            project_map    : rtypes.immutable.Map  # All projects available to the user
            public_project_titles : rtypes.immutable.Map
        page :
            active_top_tab    : rtypes.string    # key of the active tab

    project_menu_items: ->
        v = []
        @props.open_projects.map (project_id, index) =>
            v.push(@project_tab(project_id, index))
        return v

    project_tab: (project_id, index) ->
        <OpenProjectMenuItem
            index          = {index}
            key            = {project_id}
            project_id     = {project_id}
            active_top_tab = {@props.active_top_tab}
            project        = {@props.project_map?.get(project_id)}
            open_projects  = {@props.open_projects}
            public_project_titles = {@props.public_project_titles}
        />

    render_projects_dropdown: ->
        if @props.open_projects.includes(@props.active_top_tab)
            project_id = @props.active_top_tab

            title = null
            title ?= @props.project_map.getIn([project_id, 'title'])
            title ?= @props.public_project_titles?.get(project_id)
            title ?= <Loading key={@props.project_id} />
        else
            title = "Open projects"

        <Nav
            className = 'smc-dropdown-projects'
            style     = {display:'flex', margin:'0', flex:'1', fontSize:'25px', textAlign:'center', padding:'5px', zIndex: 1, background: 'white'}
            >
            <NavDropdown
                id        = "smc-top-project-nav-dropdown"
                title     = {title}
                className = "smc-projects-tabs"
                style     = {flex:'1'}
            >
                {@project_menu_items()}
            </NavDropdown>
        </Nav>

    render_one_project_item: (project_id) ->
        project_name_styles =
            whiteSpace   : 'nowrap'
            overflow     : 'hidden'
            #textOverflow : 'ellipsis'
            marginRight  : '3px'

        title = @props.project_map?.getIn([project_id, 'title'])

        desc = misc.trunc(@props.project_map?.getIn([@props.project_id, 'description']) ? '', 128)
        project_state = @props.project_map?.getIn([@props.project_id, 'state', 'state'])
        icon = require('smc-util/schema').COMPUTE_STATES[project_state]?.icon ? 'bullhorn'

        <Nav style={margin:'0', flex:'1', fontSize:'20px', padding:'15px'}>
            <NavItem onClick={(e)=>e.stopPropagation();e.preventDefault();@actions('page').set_active_tab(project_id)}>
                <div style={project_name_styles}>
                    <Icon name={icon} style={fontSize:'20px'} />
                    <span style={marginLeft: "5px"}>{misc.trunc(title,24)}</span>
                </div>
                <Icon
                    name = 'times'
                    style = {whiteSpace:'nowrap', fontSize:'12pt'}
                    onClick={(e)=>e.stopPropagation();e.preventDefault();@actions('page').close_project_tab(project_id)}
                />
            </NavItem>
        </Nav>

    render: ->
        switch @props.open_projects.size
            when 0
                <div style={flex:'1'}> </div>
            when 1
                @render_one_project_item(@props.open_projects.get(0))
            else
                @render_projects_dropdown()

exports.ProjectsNav = ({dropdown}) ->
    if dropdown
        <DropdownProjectsNav />
    else
        <FullProjectsNav />
