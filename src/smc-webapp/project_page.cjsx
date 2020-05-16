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
{SideChat}         = require('./side_chat')
{Explorer}         = require('./project/explorer')
{ProjectNew}       = require('./project/new')
{ProjectLog}       = require('./project/history')
{ProjectSearch}    = require('./project_search')
{ProjectSettings}  = require('./project/settings')
{DeletedFile}      = require('./project/deleted-file')
{ProjectStore}     = require('./project_store')
{DiskSpaceWarning, RamWarning, OOMWarning} = require('./project_warnings')
{KioskModeBanner} = require('./app_shared2')

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

# Children must define their own padding from navbar and screen borders
ProjectContentViewer = rclass
    displayName: 'ProjectContentViewer'

    shouldComponentUpdate: (nextProps) ->
        return @props.is_visible or nextProps.is_visible

    propTypes :
        is_visible      : rtypes.bool.isRequired
        project_id      : rtypes.string.isRequired
        project_name    : rtypes.string.isRequired
        active_tab_name : rtypes.string
        opened_file     : rtypes.object
        file_path       : rtypes.string
        group           : rtypes.string
        save_scroll     : rtypes.func
        show_new        : rtypes.bool
        fullscreen      : rtypes.oneOf(['default', 'kiosk'])

    getInitialState: -> # just for forcing updates sometimes
        counter : 0

    componentDidMount: ->
        @mounted = true
        @restore_scroll_position()

    componentWillUnmount: ->
        @mounted = false
        @save_scroll_position()

    componentDidUpdate: ->
        @restore_scroll_position()

    componentWillUpdate: ->
        @save_scroll_position()

    restore_scroll_position: ->
        saved_scroll = @props.opened_file?.get('component')?.scroll_position
        if saved_scroll?
            $(@refs.editor_inner_container).children()[0]?.scrollTop = saved_scroll

    save_scroll_position: ->
        if @refs.editor_inner_container? and @props.save_scroll?
            val = $(@refs.editor_inner_container).children()[0]?.scrollTop
            if val?
                @props.save_scroll(val)

    # TRULY HORRIBLE: force an update soon
    update_soon: ->
        await delay(500)
        if @mounted
            # -- sometimes the Editor getting
            # defined doesn't result in this component updating,
            # which is HORRIBLE for users, since they don't know
            # what is going on and stare at the Loading spinner
            # for a long time... For now, let's force that update to
            # happen.   Revisit this when rewriting this file
            # in typescript.
            @setState(counter : @state.counter+1)

    render_editor: (path) ->
        {Editor, redux_name} = @props.opened_file.get('component') ? {}
        if redux_name?
            editor_actions = redux.getActions(redux_name)
        if not Editor?
            if @props.is_visible
                @update_soon()
            <Loading theme={"medium"} />
        else
            <div
                ref       = {'editor_inner_container'}
                className = {'smc-vfill'}
                id        = {editor_id(@props.project_id, path)}
                style     = {height:'100%', willChange: 'transform'}>
                <Editor
                    name         = {redux_name}
                    path         = {path}
                    project_id   = {@props.project_id}
                    redux        = {redux}
                    actions      = {editor_actions}
                    project_name = {@props.project_name}
                />
            </div>

    render_side_chat: (path) ->
        <SideChat
            path       = {misc.meta_file(path, 'chat')}
            redux      = {redux}
            project_id = {@props.project_id}
            />

    render_drag_bar: (path) ->
        reset = () =>
            if not @refs.draggable?
                return
            # This is ugly and dangerous, but I don't know any other way to reset
            # the state of the bar, so it fits back into our flex display model, besides
            # writing something like the Draggable component from scratch for our purposes.
            # For now, this will do.
            @refs.draggable.state.x = 0
            $(ReactDOM.findDOMNode(@refs.draggable)).css('transform','')

        handle_drag_bar_stop = (evt, ui) =>
            clientX = ui.node.offsetLeft + ui.x + $(ui.node).width() + 2
            misc_page.drag_stop_iframe_enable()
            elt = $(ReactDOM.findDOMNode(@refs.editor_container))
            width = 1 - (clientX - elt.offset().left) / elt.width()
            reset()
            redux.getProjectActions(@props.project_id).set_chat_width({path:path, width:width})

        <Draggable
            ref    = 'draggable'
            axis   = "x"
            onStop = {handle_drag_bar_stop}
            onStart = {misc_page.drag_start_iframe_disable}
            >
            <div className="smc-vertical-drag-bar" style={if feature.IS_TOUCH then {width:'12px'}}> </div>
        </Draggable>


    render_editor_tab: ->
        if webapp_client.file_client.is_deleted(@props.file_path, @props.project_id)
            return <DeletedFile
                     project_id = {@props.project_id}
                     path       = {@props.file_path}
                     onOpen     = {=> @setState(counter : @state.counter+1)}/>

        if feature.IS_MOBILE
            # Side chat is not supported at all on mobile.
            is_chat_open = false
        else
            chat_width   = @props.opened_file.get('chat_width') ? DEFAULT_CHAT_WIDTH
            is_chat_open = @props.opened_file.get('is_chat_open')

        editor  = @render_editor(@props.file_path)

        # WARNING: every CSS style below is hard won.  Don't f!$k with them without knowing what
        # you are doing and testing on all supported browsers.  - wstein
        if is_chat_open
            # 2 column layout with chat
            content =\
                <div
                    style = {position: 'absolute', height:'100%', width:'100%', display:'flex'}
                    ref   = 'editor_container'
                >
                    <div style={flex:1, overflow:'hidden', height:'100%', width:'100%'}>
                        {editor}
                    </div>
                    {@render_drag_bar(@props.file_path)}
                    <div
                        ref = 'side_chat_container'
                        style={flexBasis:"#{chat_width*100}%", position:'relative'}>
                        {@render_side_chat(@props.file_path)}
                    </div>
                </div>
        else
            # just the editor
            content =\
                <div style={position: 'absolute', height:'100%', width:'100%'}>
                    {editor}
                </div>

        return content

    render_tab_content : ->
        # show the kiosk mode banner instead of anything besides a file editor
        if @props.fullscreen == 'kiosk' and not @props.active_tab_name.startsWith('editor-')
            return <KioskModeBanner />

        switch @props.active_tab_name
            when 'files'
                <Explorer name={@props.project_name} project_id={@props.project_id} actions={redux.getProjectActions(@props.project_id)} start_project={@actions("projects").start_project} />
            when 'new'
                <ProjectNew name={@props.project_name} project_id={@props.project_id} actions={redux.getProjectActions(@props.project_id)}/>
            when 'log'
                <ProjectLog name={@props.project_name} project_id={@props.project_id} actions={redux.getProjectActions(@props.project_id)} />
            when 'search'
                <ProjectSearch name={@props.project_name} />
            when 'settings'
                <ProjectSettings project_id={@props.project_id} name={@props.project_name} group={@props.group} />
            else  # @props.active_tab_name = "editor-<filename>"
                if not @props.opened_file? or not @props.active_tab_name?
                    <Loading />
                else
                    @render_editor_tab()

    render: ->
        style = {overflowY:'auto', overflowX:'hidden', flex:1, height:0, position:'relative'}
        if !@props.is_visible
            style.display = "none"
        # always make div remaining height,
        # except for on the files page when New is being displayed:
        if @props.active_tab_name == 'files' and @props.show_new
            className = undefined
        else
            className = 'smc-vfill'
        <div style={style} className={className}>
            {@render_tab_content()}
        </div>


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
            v.push <ProjectContentViewer
                key             = {tab_name}
                is_visible      = {@props.active_project_tab == tab_name}
                project_id      = {@props.project_id}
                project_name    = {@props.name}
                active_tab_name = {tab_name}
                opened_file     = {@props.open_files.get(path)}
                file_path       = {path}
                group           = {group}
                save_scroll     = {@actions(name).get_scroll_saver_for(tab_name)}
                fullscreen      = {@props.fullscreen}
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
            v.push <ProjectContentViewer
                key             = {@props.active_project_tab}
                is_visible      = {true}
                project_id      = {@props.project_id}
                project_name    = {@props.name}
                active_tab_name = {@props.active_project_tab}
                show_new        = {@props.show_new}
                opened_file     = {@props.open_files.get(active_path)}
                file_path       = {active_path}
                group           = {group}
                save_scroll     = {@actions(name).get_scroll_saver_for(active_path)}
                fullscreen      = {@props.fullscreen}
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

exports.MobileProjectPage = rclass ({name}) ->
    displayName : 'MobileProjectPage'

    reduxProps :
        projects :
            project_map  : rtypes.immutable
            get_my_group : rtypes.func
        page :
            fullscreen : rtypes.oneOf(['default', 'kiosk'])
        "#{name}" :
            active_project_tab  : rtypes.string
            open_files          : rtypes.immutable
            open_files_order    : rtypes.immutable
            free_warning_closed : rtypes.bool     # Makes bottom height update

    propTypes :
        project_id : rtypes.string

    render_files_dropdown: ->
        if not @props.open_files_order?
            return

        dropdown_title = "Open Files"
        path = misc.tab_to_path(@props.active_project_tab)
        if @props.open_files_order.includes(path)
            dropdown_title = misc.path_split(path).tail

        items = []
        @props.open_files_order.map (path, index) =>
            items.push(@file_menu_item(path, index))
        <NavDropdown
            id        = "smc-project-files-dropdown"
            className = "smc-project-files-dropdown"
            title     = {dropdown_title}
            style     = {width:'100%', fontSize:'17px', textAlign:'left'}
        >
            {items}
        </NavDropdown>

    close_file_item : (e, path) ->
        e.stopPropagation()
        e.preventDefault()
        @actions(project_id:@props.project_id).close_tab(path)

    file_menu_item: (path, index) ->
        filename        = misc.path_split(path).tail
        # get the file_associations[ext] just like it is defined in the editor
        {file_options}  = require('./editor')
        icon            = file_options(filename)?.icon ? 'code-o'
        display_name    = misc.trunc(filename, 64)

        label_styles =
            whiteSpace   : 'nowrap'
            overflow     : 'hidden'
            textOverflow : 'ellipsis'

        x_button_styles =
            float      : 'right'
            whiteSpace : 'nowrap'
            fontSize   : '12pt'

        <MenuItem
            key     = {path}
            onClick = {()=>@actions(project_id: @props.project_id).set_active_tab(misc.path_to_tab(path))}
        >
            <div style={width:'100%'}>
                <div style={x_button_styles}>
                    <Button bsStyle="warning" onClick={(e)=>@close_file_item(e, path)}>
                        <Icon
                            name = 'times'
                        />
                    </Button>
                </div>
                <div style={label_styles}>
                    <Icon style={fontSize:'10pt'} name={icon} /> {display_name}
                </div>
            </div>
        </MenuItem>

    render_one_file_item : ->
        path         = @props.open_files_order.get(0)
        ext          = misc.filename_extension(path).toLowerCase()
        icon         = file_associations[ext]?.icon ? 'code-o'
        display_name = misc.trunc(misc.path_split(path).tail, 64)
        <FileTab
            key        = {path}
            name       = {misc.path_to_tab(path)}
            label      = {display_name}
            icon       = {icon}
            tooltip    = {path}
            project_id = {@props.project_id}
            file_tab   = {true}
            is_active  = {@props.active_project_tab == misc.path_to_tab(path)}
        />

    render : ->
        if not @props.open_files_order?
            return <Loading />
        group = @props.get_my_group(@props.project_id)
        active_path = misc.tab_to_path(@props.active_project_tab)
        project = @props.project_map?.get(@props.project_id)

        <div className='container-content' style={display: 'flex', flexDirection: 'column', flex: 1, overflow:'auto'}>
            {<DeletedProjectWarning /> if project?.get('deleted')}
            <DiskSpaceWarning project_id={@props.project_id} />
            <TrialBanner project_id={@props.project_id} name={name} />
            {<div className="smc-file-tabs" ref="projectNav" style={width:"100%", height:"37px"}>
                <Nav bsStyle="pills" className="smc-file-tabs-fixed-mobile" style={float:'left'}>
                    {[<FileTab
                        name       = {k}
                        label      = {v.label}
                        icon       = {v.icon}
                        tooltip    = {v.tooltip}
                        project_id = {@props.project_id}
                        is_active  = {@props.active_project_tab == k}
                        shrink     = {@props.open_files_order.size != 0 or $(window).width() < 370}
                    /> for k, v of fixed_project_pages]}
                </Nav>
                <Nav bsStyle="pills" className="smc-file-tabs-files-mobile" style={display:'flex'}>
                    {@render_files_dropdown() if @props.open_files_order.size > 1}
                    {@render_one_file_item() if @props.open_files_order.size == 1}
                </Nav>
            </div> if not @props.fullscreen}
            <ErrorBoundary>
                <ProjectContentViewer
                    is_visible      = {true}
                    project_id      = {@props.project_id}
                    project_name    = {@props.name}
                    active_tab_name = {@props.active_project_tab}
                    opened_file     = {@props.open_files.getIn([active_path])}
                    file_path       = {active_path}
                    group           = {group}
                    save_scroll     = {@actions(name).get_scroll_saver_for(active_path)}
                    fullscreen      = {@props.fullscreen}
                />
            </ErrorBoundary>
        </div>
