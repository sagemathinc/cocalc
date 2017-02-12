##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
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
{isMobile} = require('./feature')
{set_window_title} = require('./browser')

# SMC Components
{React, ReactDOM, rclass, rtypes} = require('./smc-react')
{Loading, Icon, Tip} = require('./r_misc')
{NavTab} = require('./app_shared')

NavWrapper = ({style, children, id, className}) ->
    React.createElement(Nav, {style:style, id:id, className:className}, children)

SortableNavTab = SortableElement(NavTab)
SortableNav = SortableContainer(NavWrapper)

GhostTab = (props) ->
    <NavItem
        style = {flexShrink:'1', width:'200px', height:'41px', overflow: 'hidden'}
    />

# Future: Combine ProjectTab and OpenProjectMenuItem into a HOC which takes NavItem and MenuItem respectively...
ProjectTab = rclass
    reduxProps:
        projects:
            get_title : rtypes.func
            public_project_titles : rtypes.immutable.Map

    propTypes:
        project        : rtypes.immutable.Map
        index          : rtypes.number
        project_id     : rtypes.string
        active_top_tab : rtypes.string

    getInitialState: ->
        x_hovered : false

    componentDidMount: ->
        @strip_href()

    componentDidUpdate: () ->
        @strip_href()

    strip_href: ->
        @refs.tab?.node.children[0].removeAttribute('href')

    close_tab: (e) ->
        e.stopPropagation()
        e.preventDefault()
        @actions('page').close_project_tab(@props.project_id)

    render: ->
        title = @props.get_title(@props.project_id)
        title ?= @props.public_project_titles?.get(@props.project_id)
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
            textOverflow: 'ellipsis'

        if @props.project_id == @props.active_top_tab
            text_color = 'rgb(85, 85, 85)'

        if @state.x_hovered
            x_color = "white"

        <SortableNavTab
            index={@props.index}
            name={@props.project_id}
            actions={@actions('page')}
            active_top_tab={@props.active_top_tab}
            style={flexShrink:'1', width:'200px', maxWidth:'200px', height:'41px', overflow: 'hidden', lineHeight:'1.75em', color:text_color}
            ref='tab'
        >
            <div style = {float:'right', whiteSpace:'nowrap', fontSize:'12pt', color:x_color}>
                <Icon
                    name = 'times'
                    onClick = {@close_tab}
                    onMouseOver = {(e)=>@setState(x_hovered:true)}
                    onMouseOut = {(e)=>@actions('page').clear_ghost_tabs();@setState(x_hovered:false)}
                />
            </div>
            <div style={project_name_styles}>
                <Tip title={misc.trunc(title,32)} tip={desc} placement='bottom' size='small'>
                    <Icon name={icon} style={fontSize:'20px'} />
                    <span style={marginLeft: "5px"}>{misc.trunc(title,24)}</span>
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

    project_tabs: ->
        v = []
        if not @props.open_projects?
            return
        @props.open_projects.map (project_id, index) =>
            v.push(@project_tab(project_id, index))

        if @props.num_ghost_tabs == 0
            return v

        num_real_tabs = @props.open_projects.size
        num_tabs = num_real_tabs + @props.num_ghost_tabs
        for index in [num_real_tabs..(num_tabs-1)]
            v.push(<GhostTab index={index} key={index}/>)
        return v

    project_tab: (project_id, index) ->
        <ProjectTab
            index          = {index}
            key            = {project_id}
            project_id     = {project_id}
            active_top_tab = {@props.active_top_tab}
            project        = {@props.project_map?.get(project_id)}
            public_project_titles = {@props.public_project_titles}
        />

    render: ->
        shim_style =
            position    : 'absolute'
            left        : '0'
            marginRight : '0px'
            marginLeft  : '0px'
            paddingLeft : '0px'
            width       : '100%'
            display     : 'flex'

        <SortableNav style={display:'flex', flex:'1', overflow: 'hidden', height:'41px', margin:'0'}
            helperClass={'smc-project-tab-floating'}
            onSortEnd={@on_sort_end}
            axis={'x'}
            lockAxis={'x'}
            lockToContainerEdges={true}
            distance={3 if not isMobile.tablet()}
        >
            {@project_tabs()}
        </SortableNav>

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

        project_name_styles =
            whiteSpace: 'nowrap'
            overflow: 'hidden'
            textOverflow: 'ellipsis'

        if @props.project_id == @props.active_top_tab
            text_color = 'rgb(85, 85, 85)'

        if @state.x_hovered
            x_color = "white"

        <MenuItem onClick={@open_project} style={width:'100%', lineHeight:'1.75em', color:text_color}>
            <Button
                bsStyle="warning"
                onClick={@close_tab}
                style = {float:'right', whiteSpace:'nowrap', fontSize:'12pt', color:x_color}
            >
                <Icon name='times'/>
            </Button>
            <Tip style={project_name_styles} title={misc.trunc(title,32)} tip={desc} placement='bottom' size='small'>
                <div style={height: '36px', padding: '7px 5px', fontSize: '18px'}>
                    <Icon name={icon} style={fontSize:'20px'} />
                    <span style={marginLeft: "5px"}>{misc.trunc(title,24)}</span>
                </div>
            </Tip>
        </MenuItem>

DropdownProjectsNav = rclass
    reduxProps :
        projects :
            open_projects  : rtypes.immutable.List # Open projects and their state
            project_map    : rtypes.immutable.Map  # All projects available to the user
            get_title      : rtypes.func
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
            title ?= @props.get_title(project_id)
            title ?= @props.public_project_titles?.get(project_id)
            title ?= <Loading key={@props.project_id} />
        else
            title = "Open projects"

        <Nav className='smc-dropdown-projects' style={display:'flex', margin:'0', flex:'1', fontSize:'25px', textAlign:'center', padding:'15px'}>
            <NavDropdown title=title className="smc-projects-tabs" style={flex:'1'}>
                {@project_menu_items()}
            </NavDropdown>
        </Nav>

    render_one_project_item: (project_id) ->
        project_name_styles =
            whiteSpace: 'nowrap'
            overflow: 'hidden'
            textOverflow: 'ellipsis'
        title = @props.get_title(project_id)

        desc = misc.trunc(@props.project_map?.getIn([@props.project_id, 'description']) ? '', 128)
        project_state = @props.project_map?.getIn([@props.project_id, 'state', 'state'])
        icon = require('smc-util/schema').COMPUTE_STATES[project_state]?.icon ? 'bullhorn'

        <Nav style={margin:'0', flex:'1', fontSize:'20px', padding:'15px'}>
            <NavItem onClick={(e)=>e.stopPropagation();e.preventDefault();@actions('page').set_active_tab(project_id)}>
                <Icon
                    name = 'times'
                    style = {float:'right', whiteSpace:'nowrap', fontSize:'12pt'}
                    onClick={(e)=>e.stopPropagation();e.preventDefault();@actions('page').close_project_tab(project_id)}
                />
                <div style={project_name_styles}>
                    <Icon name={icon} style={fontSize:'20px'} />
                    <span style={marginLeft: "5px"}>{misc.trunc(title,24)}</span>
                </div>
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
