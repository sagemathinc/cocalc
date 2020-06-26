#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

$ = window.$

###
project page react component
###
feature = require('./feature')

# 3rd party Libraries
{Button, Nav, NavItem, NavDropdown, MenuItem, Alert, Col, Row} = require('react-bootstrap')
{SortableContainer, SortableElement} = require('react-sortable-hoc')
{delay} = require('awaiting')
{webapp_client} = require('./webapp_client')

Draggable = require('react-draggable')

# CoCalc Libraries
{SideChat}         = require('./chat/side-chat')
{Explorer}         = require('./project/explorer')
{ProjectNew}       = require('./project/new')
{ProjectLog}       = require('./project/history')
{ProjectSearch}    = require('./project/search/search')
{ProjectSettings}  = require('./project/settings')
{DeletedFile}      = require('./project/deleted-file')
{ProjectStore}     = require('./project_store')
{OOMWarning} = require('./project/warnings/oom')
{RamWarning} = require('./project/warnings/ram')
{DiskSpaceWarning} = require('./project/warnings/disk-space')
{KioskModeBanner} = require('./app/kiosk-mode-banner')

project_file = require('./project_file')
{file_associations} = require('./file-associations')

{React, ReactDOM, rclass, redux, rtypes, Redux, Fragment} = require('./app-framework')
{DeletedProjectWarning, ErrorBoundary, Icon, Loading, Space} = require('./r_misc')

{ChatIndicator} = require('./chat/chat-indicator')

{ShareIndicator} = require('./share/share-indicator')

{TrialBanner} = require('./project/trial-banner')

{FileTab, DEFAULT_FILE_TAB_STYLES} = require('./project/file-tab')
{file_tab_labels} = require('./project/file-tab-labels')

{editor_id} = require('./project/utils')

file_editors = require('./file-editors')

misc = require('misc')
misc_page = require('./misc_page')

DEFAULT_CHAT_WIDTH = 0.3

CHAT_INDICATOR_STYLE = SHARE_INDICATOR_STYLE =
    paddingTop  : '1px'
    overflow    : 'hidden'
    paddingLeft : '5px'
    height      : '32px'


NavWrapper = ({style, children, id, className, bsStyle}) ->
    React.createElement(Nav, {style:style, id:id, className:className, bsStyle:bsStyle}, children)

GhostTab = (props) ->
    <NavItem
        style={DEFAULT_FILE_TAB_STYLES}
    />

SortableFileTab = SortableElement(FileTab)
SortableNav = SortableContainer(NavWrapper)


# is_public below -- only show this tab if this is true

fixed_project_pages =
    files :
        label     : 'Files'
        icon      : 'folder-open-o'
        tooltip   : 'Browse files'
        is_public : true
    new :
        label     : 'New'
        icon      : 'plus-circle'
        tooltip   : 'Create new file, folder, worksheet or terminal'
        is_public : false
        no_anonymous : true
    log:
        label     : 'Log'
        icon      : 'history'
        tooltip   : 'Log of project activity'
        is_public : false
        no_anonymous : true
    search :
        label     : 'Find'
        icon      : 'search'
        tooltip   : 'Search files in the project'
        is_public : false
        no_anonymous : true
    settings :
        label     : 'Settings'
        icon      : 'wrench'
        tooltip   : 'Project settings and controls'
        is_public : false
        no_anonymous : true

{Content} = require('./project/page/content')

exports.ProjectPage = ProjectPage = rclass ({name}) ->
    displayName : 'ProjectPage'

    reduxProps :
        projects :
            project_map  : rtypes.immutable
            get_my_group : rtypes.func
        page :
            fullscreen : rtypes.oneOf(['default', 'kiosk'])
        "#{name}" :
            active_project_tab    : rtypes.string
            open_files            : rtypes.immutable
            open_files_order      : rtypes.immutable
            free_warning_closed   : rtypes.bool     # Makes bottom height update
            num_ghost_file_tabs   : rtypes.number
            current_path          : rtypes.string
            show_new              : rtypes.bool
        account:
            is_anonymous          : rtypes.bool

    propTypes :
        project_id : rtypes.string
        is_active : rtypes.bool

    on_sort_end : ({oldIndex, newIndex}) ->
        @actions(name).move_file_tab({old_index:oldIndex, new_index:newIndex})

    file_tabs: ->
        if not @props.open_files_order?
            return
        tabs = []
        paths = []
        @props.open_files_order.map (path) =>
            if not path?  # see https://github.com/sagemathinc/cocalc/issues/3450
                # **This should never fail** so be loud if it does.
                throw Error("BUG -- each entry in open_files_order must be defined -- " + JSON.stringify(@props.open_files_order.toJS()))
            paths.push(path)
        labels = file_tab_labels(paths)
        for index in [0...labels.length]
            tabs.push(@file_tab(paths[index], index, labels[index]))
        if @props.num_ghost_file_tabs == 0
            return tabs

        num_real_tabs = @props.open_files_order.size
        num_tabs = num_real_tabs + @props.num_ghost_file_tabs
        for index in [num_real_tabs..(num_tabs-1)]
            tabs.push(<GhostTab index={index} key={index}/>)
        return tabs

    file_tab: (path, index, label) ->
        filename         = misc.path_split(path).tail
        # get the file_associations[ext] just like it is defined in the editor
        {file_options}   = require('./editor')
        icon             = file_options(filename)?.icon ? 'code-o'
        <SortableFileTab
            index        = {index}
            key          = {path}
            name         = {misc.path_to_tab(path)}
            label        = {label}
            icon         = {icon}
            tooltip      = {path}
            project_id   = {@props.project_id}
            file_tab     = {true}
            has_activity = {@props.open_files.getIn([path, 'has_activity'])}
            is_active    = {@props.active_project_tab == misc.path_to_tab(path)}
        />

    render_chat_indicator: (shrink_fixed_tabs) ->
        if @props.is_anonymous  # no possibility to chat
            return
        if @props.active_project_tab?.slice(0,7) != 'editor-'
            # TODO: This is the case where we would support project-wide side chat, or side chats
            # for each individual Files/Search, etc. page (not clear!)
            return
        path = misc.tab_to_path(@props.active_project_tab)
        is_chat_open = @props.open_files.getIn([path, 'is_chat_open'])
        <div style = {CHAT_INDICATOR_STYLE}>
            <ChatIndicator
                project_id        = {@props.project_id}
                path              = {path}
                is_chat_open      = {is_chat_open}
                shrink_fixed_tabs = {shrink_fixed_tabs}
            />
        </div>

    render_share_indicator: (shrink_fixed_tabs) ->
        if @props.is_anonymous
            # anon users can't share anything
            return
        if @props.active_project_tab == 'files'
            path = @props.current_path
        else
            path = misc.tab_to_path(@props.active_project_tab)
        if not path? # nothing specifically to share
            return
        if path == ''  # sharing whole project not implemented
            return
        <div style = {SHARE_INDICATOR_STYLE}>
            <ShareIndicator
                name              = {name}
                path              = {path}
                project_id        = {@props.project_id}
                shrink_fixed_tabs = {shrink_fixed_tabs}
            />
        </div>

    fixed_tabs_array: (is_public, shrink_fixed_tabs) ->
        tabs = []
        for k, v of fixed_project_pages
            if @props.is_anonymous and v.no_anonymous
                continue
            if (is_public and v.is_public) or (not is_public)
                tab = <FileTab
                        key        = {k}
                        name       = {k}
                        label      = {v.label}
                        icon       = {v.icon}
                        tooltip    = {v.tooltip}
                        project_id = {@props.project_id}
                        is_active  = {@props.active_project_tab == k}
                        shrink     = {shrink_fixed_tabs}
                    />
                tabs.push(tab)
        return tabs

    render_file_tabs: (is_public) ->
        shrink_fixed_tabs = $(window).width() < (376 + (@props.open_files_order.size + @props.num_ghost_file_tabs) * 250)
        fixed_tabs = @fixed_tabs_array(is_public, shrink_fixed_tabs)

        <div className="smc-file-tabs" ref="projectNav" style={width:'100%', height:'32px', borderBottom: "1px solid #e1e1e1"}>
            <div style={display:'flex'}>
                {<Nav
                    bsStyle   = "pills"
                    className = "smc-file-tabs-fixed-desktop"
                    style     = {overflow:'hidden', float:'left'} >
                    {fixed_tabs}
                </Nav> if (@props.fullscreen != 'kiosk')}
                <div
                    style = {display:'flex', overflow:'hidden', flex: 1}
                >
                    <SortableNav
                        className            = "smc-file-tabs-files-desktop"
                        helperClass          = {'smc-file-tab-floating'}
                        onSortEnd            = {@on_sort_end}
                        axis                 = {'x'}
                        lockAxis             = {'x'}
                        lockToContainerEdges = {true}
                        distance             = {3 if not feature.IS_TOUCH}
                        pressDelay           = {200 if feature.IS_TOUCH}
                        bsStyle              = "pills"
                        style                = {display:'flex', overflow:'hidden'}
                    >
                        {@file_tabs()}
                    </SortableNav>
                </div>
                <div style={borderLeft: '1px solid lightgrey',  display: 'inline-flex'}>
                    {@render_chat_indicator(shrink_fixed_tabs) if not is_public}
                    {@render_share_indicator(shrink_fixed_tabs) if not is_public}
                </div>
            </div>
        </div>

    render_editor_tabs: (active_path, group) ->
        v = []

        @props.open_files_order.map (path, index) =>
            if not path
                return
            tab_name = 'editor-' + path
            v.push <Content
                key             = {tab_name}
                is_visible      = {@props.active_project_tab == tab_name}
                project_id      = {@props.project_id}
                tab_name = {tab_name}
            />
        return v

    render_project_content: (active_path, group) ->
        v = []
        if @props.active_project_tab.slice(0, 7) != 'editor-'  # fixed tab
            if !@props.is_active
                # see https://github.com/sagemathinc/cocalc/issues/3799
                # Some of the fixed project tabs (none editors) are hooked
                # into redux and moronic about rendering everything on every
                # tiny change... Until that is fixed, it is critical to NOT
                # render these pages at all, unless the tab is active
                # and they are visible.
                return
            v.push <Content
                key             = {@props.active_project_tab}
                is_visible      = {true}
                project_id      = {@props.project_id}
                tab_name = {@props.active_project_tab}
                />
        return v.concat(@render_editor_tabs(active_path, group))

    render : ->
        if not @props.open_files_order?
            return <Loading />
        group = @props.get_my_group(@props.project_id)
        active_path = misc.tab_to_path(@props.active_project_tab)
        project = @props.project_map?.get(@props.project_id)
        style =
            display       : 'flex'
            flexDirection : 'column'
            flex          : 1
            overflow      : 'auto'
        if not @props.fullscreen
            style.paddingTop = '3px'

        <div className='container-content' style={style}>
            <DiskSpaceWarning project_id={@props.project_id} />
            <RamWarning project_id={@props.project_id} />
            <OOMWarning project_id={@props.project_id} name={name} />
            <TrialBanner project_id={@props.project_id} name={name} />
            {@render_file_tabs(group == 'public') if not @props.fullscreen}
            {<DeletedProjectWarning /> if project?.get('deleted')}
            {@render_project_content(active_path, group)}
        </div>


