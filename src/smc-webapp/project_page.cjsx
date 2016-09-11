###
project page react component


###

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{ProjectFiles}    = require('./project_files')
{ProjectNew}      = require('./project_new')
{ProjectLog}      = require('./project_log')
{ProjectSearch}   = require('./project_search')
{ProjectSettings} = require('./project_settings')
project_file = require('./project_file')
{file_associations} = require('./editor')
{ProjectStore} = require('./project_store')
{NavItem, Nav, Alert, Col, Row} = require('react-bootstrap')
{Icon, Tip, SAGE_LOGO_COLOR} = require('./r_misc')
misc = require('misc')

ProjectTab = rclass
    displayName : 'ProjectTab'

    propTypes :
        name               : rtypes.string    # key
        label              : rtypes.string    # rendered tab title
        icon               : rtypes.string    # Affiliated icon
        project_id         : rtypes.string
        tooltip            : rtypes.string
        active_project_tab : rtypes.string
        file_tab           : rtypes.bool      # Whether or not this tab holds a file
        open_files_order   : rtypes.object

    close_file : (e, path) ->
        e.stopPropagation()
        e.preventDefault()
        if misc.path_to_tab(path) == @props.active_project_tab
            index = @props.open_files_order.indexOf(path)
            size = @props.open_files_order.size
            next_active_tab = 'files'
            console.log("You just closed a tab!", index, size)
            if index == 0 or size <= 1
                next_active_tab = 'files'
            else
                if index == size - 1
                    next_active_tab = misc.path_to_tab(@props.open_files_order.get(index - 1))
                else
                    next_active_tab = misc.path_to_tab(@props.open_files_order.get(index + 1))
            @actions(project_id: @props.project_id).set_active_tab(next_active_tab)
        @actions(project_id: @props.project_id).close_file(path)

    render : ->
        styles =
            borderRadius: "5px 5px 0px 0px"

        is_active_tab = @props.name == @props.active_project_tab
        if is_active_tab
            styles.backgroundColor = SAGE_LOGO_COLOR

        if @props.file_tab
            styles.width = 250
        else
            styles.flex = 'none'

        filename_styles =
            whiteSpace: 'nowrap'
            overflow: 'hidden'
            textOverflow: 'ellipsis'

        <NavItem
            style={styles}
            key={@props.name}
            active={is_active_tab}
            onClick={=>@actions(project_id: @props.project_id).set_active_tab(@props.name)}
        >
            {# Truncated file name}
            {# http://stackoverflow.com/questions/7046819/how-to-place-two-divs-side-by-side-where-one-sized-to-fit-and-other-takes-up-rem}
            <div style={width:'100%', lineHeight:'1.75em', marginBottom:'-6px'}> {# -6px for not being able to access underlying <a> tag}
                <div style = {float:'right', whiteSpace:'nowrap', fontSize:'12pt'}>
                    {<Icon
                        name = 'times'
                        onClick = {(e)=>@close_file(e, misc.tab_to_path(@props.name))}
                    /> if @props.file_tab}
                </div>
                <div style={filename_styles}>
                    <Tip title={@props.tooltip} placement='bottom' size='small'>
                        <Icon style={fontSize: if @props.file_tab then '10pt' else '15pt'} name={@props.icon} /> {@props.label}
                    </Tip>
                </div>
            </div>
        </NavItem>

FreeProjectWarning = rclass ({name}) ->
    displayName : 'FreeProjectWarning'

    reduxProps :
        projects :
            get_total_project_quotas : rtypes.func
        "#{name}" :
            free_warning_extra_shown : rtypes.bool
            free_warning_closed : rtypes.bool

    propTypes :
        project_id : rtypes.string

    extra : (host, internet) ->
        {PolicyPricingPageUrl} = require('./customize')
        if not @props.free_warning_extra_shown
            return null
        <div>
            {<span>This project runs on a heavily loaded randomly rebooted free server. Please upgrade your project to run on a members-only server for more reliability and faster code execution.</span> if host}

            {<span>This project does not have external network access, so you cannot use internet resources directly from this project; in particular, you cannot install software from the internet, download from sites like GitHub, or download data from public data portals.</span> if internet}
            <ul>
                <li>Learn about <a href="#{PolicyPricingPageUrl}" target='_blank'>Pricing and Subscriptions</a></li>
                <li>Read the billing <a href="#{PolicyPricingPageUrl}#faq" target='_blank'>Frequently Asked Questions</a></li>
                <li>Visit <a onClick={=>@actions('page').set_active_tab('account');@actions('account').set_active_tab('billing')}>Billing</a> to <em>subscribe</em> to a plan</li>
                <li>Upgrade <em>this</em> project in <a onClick={=>@actions(project_id: @props.project_id).set_active_tab('settings')}>Project Settings</a></li>
            </ul>
        </div>

    render : ->
        window.wprops = @props
        if @props.free_warning_closed
            return null
        quotas = @props.get_total_project_quotas(@props.project_id)
        if not quotas?
            return null
        host = not quotas.member_host
        internet = not quotas.network
        if not host and not internet
            return null
        styles =
            padding : 2
            paddingLeft : 7
            paddingRight : 7
            cursor : 'pointer'
            marginBottom : 0
            fontSize : 12
        dismiss_styles =
            display : 'inline-block'
            float : 'right'
            fontWeight : 700
            top : -5
            fontSize : 18
            color : 'gray'
            position : 'relative'
        <Alert bsStyle='warning' style={styles}>
            <Icon name='exclamation-triangle' /> WARNING: This project runs {<span>on a <b>free server</b></span> if host} {<span>without <b>internet access</b></span> if internet} &mdash;
            <a onClick={=>@actions(project_id: @props.project_id).show_extra_free_warning()}> learn more...</a>
            <a style={dismiss_styles} onClick={@actions(project_id: @props.project_id).close_free_warning}>×</a>
            {@extra(host, internet)}
        </Alert>

exports.ProjectPage = ProjectPage = rclass ({name}) ->
    displayName : 'ProjectPage'

    reduxProps :
        projects :
            project_map : rtypes.immutable
            get_my_group : rtypes.func
        page :
            fullscreen : rtypes.bool
        "#{name}" :
            active_project_tab : rtypes.string
            open_files  : rtypes.immutable
            open_files_order : rtypes.immutable
            free_warning_closed : rtypes.bool     # Makes bottom height update

    propTypes :
        project_id      : rtypes.string

    componentDidMount : ->
        @set_bottom_height()

    componentDidUpdate : ->
        @set_bottom_height()

    set_bottom_height : ->
        node = ReactDOM.findDOMNode(@refs.projectNav)
        if node?
            @actions(project_id : @props.project_id).set_editor_top_position(node.offsetTop + node.offsetHeight)
        else
            @actions(project_id : @props.project_id).set_editor_top_position(0)

    file_tabs: ->
        if not @props.open_files_order?
            return
        tabs = []
        @props.open_files_order.map (path) =>
            tabs.push(@file_tab(path))
        return tabs

    file_tab: (path) ->
        ext = misc.filename_extension(path)
        icon = file_associations[ext]?.icon ? 'code-o'
        display_name = misc.trunc(misc.path_split(path).tail, 64)
        <ProjectTab
            key={path}
            name={misc.path_to_tab(path)}
            label={display_name}
            icon={icon}
            tooltip={path}
            project_id={@props.project_id}
            file_tab={true}
            active_project_tab={@props.active_project_tab}
            open_files_order={@props.open_files_order}
        />

    render_page : ->
        active = @props.active_project_tab
        switch active
            when 'files'
                return <ProjectFiles name={@props.name} project_id={@props.project_id} actions={@actions(project_id : @props.project_id)} redux={redux}/>
            when 'new'
                return <ProjectNew name={@props.name} project_id={@props.project_id} actions={@actions(project_id : @props.project_id)} />
            when 'log'
                return <ProjectLog actions={@actions(project_id : @props.project_id)} name={@props.name}/>
            when 'search'
                return <ProjectSearch actions={@actions(project_id : @props.project_id)} name={@props.name} />
            when 'settings'
                group = @props.get_my_group(@props.project_id)
                return <ProjectSettings project_id={@props.project_id} name={@props.name} group={group} />
            else
                active = misc.tab_to_path(active)
                if @props.open_files?.has(active)
                    Page = @props.open_files.get(active)
                    console.log("Page id", Page.redux_name)
                    # ideally: name, path, project_id is all we pass down here to any editor
                    <Page
                        path={active}
                        project_id={@props.project_id}
                        redux={redux}
                        actions={@actions(Page.redux_name)}
                        name={Page.redux_name}
                        project_name={"#{name}"}
                    />
                else
                    <div>You should not be here! {@props.active_project_tab}</div>

    render : ->
        project_pages =
            files :
                label : 'Files'
                icon : 'folder-open-o'
                tooltip : 'Browse files'
            new :
                label : 'New'
                icon : 'plus-circle'
                tooltip : 'Create new file, folder, worksheet or terminal'
            log:
                label : 'Log'
                icon : 'history'
                tooltip : 'Log of project activity'
            search :
                label : 'Search'
                icon : 'search'
                tooltip : 'Search files in the project'
            settings :
                label : 'Settings'
                icon : 'wrench'
                tooltip : 'Project settings and controls'
        <div className='container-content' style={flex:'1', display:'flex', flexDirection:'column'}>
            <FreeProjectWarning project_id={@props.project_id} name={name} />
            {<Nav bsStyle="pills" id="project-tabs" ref="projectNav">
                {[<ProjectTab name={k} label={v.label} icon={v.icon} tooltip={v.tooltip} project_id={@props.project_id} active_project_tab={@props.active_project_tab} /> for k, v of project_pages]}
                {@file_tabs()}
            </Nav> if not @props.fullscreen}
            {# Children must define their own padding from navbar and screen borders}
            {@render_page()}
        </div>