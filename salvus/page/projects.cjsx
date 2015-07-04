###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
###############################################################################

immutable  = require('immutable')
underscore = require('underscore')

{salvus_client} = require('salvus_client')
{project_page}  = require('project')
{top_navbar}    = require('top_navbar')
{alert_message} = require('alerts')

misc = require('misc')
{required, defaults} = misc
{html_to_text} = require('misc_page')

{Row, Col, Well, Button, ButtonGroup, ButtonToolbar, Grid, Input} = require('react-bootstrap')
{ErrorDisplay, Icon, Saving} = require('r_misc')
{React, Actions, Store, Table, flux, rtypes, rclass, FluxComponent}  = require('flux')
{User} = require('users')

TimeAgo = require('react-timeago')


MAX_DEFAULT_PROJECTS = 50

# Define projects actions
class ProjectsActions extends Actions
    setTo: (settings) ->
        return settings

    restart_project_server: (project_id) ->
        salvus_client.restart_project_server(project_id : project_id)

# Register projects actions
flux.createActions('projects', ProjectsActions)

# Define projects store
class ProjectsStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('projects')
        @register(ActionIds.setTo, @setTo)
        @state = {}

    setTo: (message) ->
        @setState(message)

    get_project: (project_id) =>
        return @state.project_map[project_id]?.toJS()

# Register projects store
flux.createStore('projects', ProjectsStore, flux)

store = flux.getStore('projects')

# Create and register projects table, which gets automatically
# synchronized with the server.
class ProjectsTable extends Table
    query: ->
        return 'projects'

    _change: (table, keys) =>
        @flux.getActions('projects').setTo(project_map: table.get())

    toggle_hide_project: (project_id) =>
        account_id = salvus_client.account_id
        hide = !!@_table.get(project_id).get('users').get(account_id).get('hide')
        @set(project_id:project_id, users:{"#{account_id}":{hide:not hide}})

    toggle_delete_project: (project_id) =>
        @set(project_id:project_id, deleted: not @_table.get(project_id).get('deleted'))

    remove_collaborator: (project_id, account_id) =>
        salvus_client.project_remove_collaborator
            project_id : project_id
            account_id : account_id
            cb         : (err, resp) =>
                if err # TODO: -- set error in store for this project...
                    alert_message(type:"error", message:err)

    invite_collaborator: (project_id, account_id) =>
        salvus_client.project_invite_collaborator
            project_id : project_id
            account_id : account_id
            cb         : (err, resp) =>
                if err # TODO: -- set error in store for this project...
                    alert_message(type:"error", message:err)

flux.createTable('projects', ProjectsTable)



exports.get_project_info = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required
    project = store.state.project_map?[opts.project_id]
    if project?
        opts.cb(undefined, project)
    else
        # have to get info from server
        salvus_client.project_info
            project_id : opts.project_id
            cb         : opts.cb

# The following is obviously very non-react and horrid.  It is
# used only in the dialog for "Copy to Another Project" in project.coffee,
# and will of course be changed when project is Reactified.  There's also
# a reference in the stripe billing code, but that's not live...
exports.get_project_list = (opts) ->
    opts = defaults opts,
        update   : false  # ignored/deprecated
        hidden   : false  # whether to list hidden projects (if false don't list any hidden projects; if true list only hidden projects)
        select   : undefined  # if given, populate with selectable list of all projects
        select_exclude : undefined # if given, list of project_id's to exclude from select
        number_recent : 7     # number of recent projects to include at top if selector is given.
        cb       : undefined  # cb(err, project_list)

    project_list = underscore.values(store.state.project_map.toJS())
    account_id = salvus_client.account_id
    projects = (x for x in project_list when (!!(x.users[account_id].hide)) == opts.hidden)
    if opts.select?
        select = opts.select
        exclude = {}
        if opts.select_exclude?
            for project_id in opts.select_exclude
                exclude[project_id] = true
        v = ({project_id:x.project_id, title:x.title.slice(0,80)} for x in projects when not exclude[x.project_id])
        # First list newest projects
        for project in v.slice(0,opts.number_recent)
            select.append("<option value='#{project.project_id}'>#{project.title}</option>")
        v.sort (a,b) ->
            if a.title < b.title
                return -1
            else if a.title > b.title
                return 1
            return 0
        # Now list all projects, if there are any more
        if v.length > opts.number_recent
            select.append('<option class="select-dash" disabled="disabled">----</option>')
            for project in v
                select.append("<option value='#{project.project_id}'>#{project.title}</option>")
    opts.cb?(undefined, projects)

exports.open_project = open_project = (opts) ->
    opts = defaults opts,
        project   : required
        item      : undefined
        target    : undefined
        switch_to : true
        cb        : undefined   # cb(err, project)

    project = opts.project
    if typeof(project) == 'string'
        # actually a project id
        x = undefined
        if store.state.project_list?
            for p in store.state.project_list
                if p.project_id == project
                    x = p
                    break
        if not x?
            # have to get info from database.
            salvus_client.project_info
                project_id : project
                cb         : (err, p) ->
                    if err
                        # try again as a public project
                        salvus_client.public_project_info
                            project_id : project
                            cb         : (err, p) ->
                                if err
                                    opts.cb?("You do not have access to the project with id '#{project}'")
                                else
                                    open_project
                                        project   : p
                                        item      : opts.item
                                        target    : opts.target
                                        switch_to : opts.switch_to
                                        cb        : opts.cb
                    else
                        open_project
                            project   : p
                            item      : opts.item
                            target    : opts.target
                            switch_to : opts.switch_to
                            cb        : opts.cb
            return
        else
            project = x

    proj = project_page(project)
    top_navbar.resize_open_project_tabs()
    if opts.switch_to
        top_navbar.switch_to_page(project.project_id)
    if opts.target?
        proj.load_target(opts.target, opts.switch_to)

    opts.cb?(undefined, proj)

create_new_project_dialog = exports.create_new_project_dialog = () ->
    create_project.modal('show')
    create_project.find("#projects-create_project-title").focus()

exports.load_target = load_target = (target, switch_to) ->
    if not target or target.length == 0
        top_navbar.switch_to_page("projects")
        return
    segments = target.split('/')
    if misc.is_valid_uuid_string(segments[0])
        t = segments.slice(1).join('/')
        project_id = segments[0]
        open_project
            project   : project_id
            target    : t
            switch_to : switch_to
            cb        : (err) ->
                if err
                    alert_message(type:"error", message:err)

NewProjectCreator = rclass

    getInitialState: ->
        state            : 'view'    # view --> edit --> saving --> view
        title_text       : ''
        description_text : ''
        error            : ''

    start_editing: ->
        @setState
            state : 'edit'

    cancel_editing: ->
        @setState
            state            : 'view'
            title_text       : ''
            description_text : ''
            error            : ''

    create_project: ->
        @setState(state:'saving')
        salvus_client.create_project
            title       : @state.title_text
            description : @state.description_text
            public      : false
            cb          : (err, resp) =>
                if not err and resp.error
                    err = misc.to_json(resp.error)
                if err?
                    @setState
                        state : 'edit'
                        error : "Error creating project -- #{err}"
                else
                    @setState
                        state            : 'view'
                        title_text       : ''
                        description_text : ''
                        error            : ''

    render_create_project_button: ->
        if @state.title_text == '' or @state.state == 'saving'
            <Button disabled bsStyle="primary"> Create project </Button>
        else
            <Button onClick={@create_project} bsStyle="primary"> Create project </Button>

    render_cancel_project_button: ->
        if @state.state == 'saving'
            <Button disabled> <Saving /> </Button>
        else
            <Button onClick={@cancel_editing}> Cancel </Button>

    render_input_section: ->
        <Well style={backgroundColor : "#ffffff"}>
            <Row>
                <Col sm=12 style={color: "#666", fontWeight: "bold", fontSize: "15pt"}>
                    <Icon name="plus-circle" /> Create a New Project
                </Col>
            </Row>
            <Row>
                <Col sm=5 style={color: "#666"}>
                    <h4>Title:</h4>
                    <Input ref         = "new_project_title"
                           type        = "text"
                           placeholder = "Title (you can easily change this later)"
                           disabled    = {@state.state == 'saving'}
                           onChange    = {=>@setState(title_text:@refs.new_project_title.getValue())}
                           autoFocus   />
                </Col>

                <Col sm=5 style={color: "#666"}>
                    <h4>Description:</h4>
                    <Input ref         = "new_project_description"
                           type        = "text"
                           placeholder = "No description"
                           disabled    = {@state.state == 'saving'}
                           onChange    = {=>@setState(description_text:@refs.new_project_description.getValue())} />
                </Col>

                <Col sm=2>
                    {# potentially add users before creating a project?}
                </Col>
            </Row>

            <Row>
                <Col sm=12>
                    <div style={color:"#666", marginBottom: '6px'}> You can change the title and description at any time later. </div>
                </Col>
            </Row>

            <Row>
                <Col sm=12>
                    <ButtonToolbar>
                        {@render_create_project_button()}
                        {@render_cancel_project_button()}
                    </ButtonToolbar>
                    {@render_error()}
                </Col>
            </Row>
        </Well>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render: ->
        switch @state.state
            when 'view'
                <Row>
                    <Col sm=3>
                        <NewProjectButton on_click={@start_editing} />
                    </Col>
                </Row>
            when 'edit', 'saving'
                <Row>
                    <Col sm=12>
                        {@render_input_section()}
                    </Col>
                </Row>

NewProjectButton = rclass
    propTypes:
        on_click = rtypes.func.isRequired

    render: ->
        <Button bsStyle="primary" block type="submit" onClick={@props.on_click}>
            <Icon name="plus-circle" /> New Project...
        </Button>


ProjectsFilterButtons = rclass
    propTypes:
        hidden  : rtypes.bool.isRequired
        deleted : rtypes.bool.isRequired

    getDefaultProps: ->
        hidden  : false
        deleted : false

    render: ->
        <ButtonGroup>
            <Button bsStyle={if @props.deleted then 'warning' else 'info'}
                    onClick={=>flux.getActions('projects').setTo(deleted: not @props.deleted)}>
                <Icon name="trash" /> Deleted
            </Button>
            <Button bsStyle={if @props.hidden then 'warning' else 'info'}
                    onClick={=>flux.getActions('projects').setTo(hidden: not @props.hidden)}>
                <Icon name="eye-slash" /> Hidden
            </Button>
        </ButtonGroup>

ProjectsSearch = rclass
    propTypes:
        search : rtypes.string.isRequired

    getDefaultProps: ->
        search : ""
        open_first_project : undefined

    delete_search_button: ->
        <Button onClick={=>flux.getActions('projects').setTo(search: '')}>
            <Icon name="times-circle" />
        </Button>

    open_first_project: (e) ->
        e.preventDefault()
        @props.open_first_project?()

    render: ->
        <form onSubmit={@open_first_project}>
            <Input
                autoFocus
                type        = "search"
                value       =  @props.search
                ref         = "search"
                placeholder = "Search for projects..."
                onChange    = {=>flux.getActions('projects').setTo(search: @refs.search.getValue())}
                buttonAfter = {@delete_search_button()} />
        </form>

HashtagGroup = rclass
    propTypes:
        hashtags          : rtypes.array.isRequired
        toggle_hashtag    : rtypes.func.isRequired
        selected_hashtags : rtypes.object

    getDefaultProps: ->
        selected_hashtags : {}

    render_hashtag: (tag) ->
        color = "info"
        if @props.selected_hashtags and @props.selected_hashtags[tag]
            color = "warning"
        <Button key={tag} onClick={=>@props.toggle_hashtag(tag)} bsSize="small" bsStyle={color}>
            {misc.trunc(tag, 100)}
        </Button>

    render: ->
        <ButtonGroup style={maxHeight:'18ex', overflowY:'auto'}>
            {@render_hashtag(tag) for tag in @props.hashtags}
        </ButtonGroup>

ProjectsListingDescription = rclass
    propTypes:
        deleted           : rtypes.bool
        hidden            : rtypes.bool
        selected_hashtags : rtypes.object
        search            : rtypes.string

    getDefaultProps: ->
        deleted           : false
        hidden            : false
        selected_hashtags : {}
        search            : ""

    description: ->
        query = @props.search.toLowerCase()
        #TODO: cached function
        hashtags_string = (name for name of @props.selected_hashtags).join(" ")
        if query != "" and hashtags_string != "" then query += " "
        query += hashtags_string
        desc = "Showing "
        if @props.deleted
            desc += "deleted "
        if @props.hidden
            desc += "hidden "
        desc += "projects "
        if query != ""
            desc += "whose title, description or users contain '#{query}'."
        desc

    render: ->
        project_listing_description_styles =
            color    : "#666"
            wordWrap : "break-word"

        <h3 style={project_listing_description_styles}>
            {@description()}
        </h3>

ProjectRow = rclass
    propTypes:
        project  : rtypes.object.isRequired

    getDefaultProps: ->
        user_map : undefined

    render_status: ->
        <span>
            {@props.project.state?.state}
        </span>

    render_last_edited: ->
        try
            <TimeAgo date={(new Date(@props.project.last_edited)).toISOString()} />
        catch e
            console.log("error setting time of project #{@props.project.project_id} to #{@props.project.last_edited} -- #{e}; please report to wstein@gmail.com")

    render_user_list: ->
        other = (account_id for account_id,_ of @props.project.users when account_id != salvus_client.account_id)
        sep = <span>, </span>
        users = []
        for i in [0...other.length]
            users.push(<User key={other[i]} account_id={other[i]} user_map={@props.user_map} />)
            if i < other.length-1
                users.push(<span key={i}>, </span>)
        return users

    open_project_from_list: (e) ->
        open_project
            project   : @props.project.project_id
            switch_to : not(e.which == 2 or (e.ctrlKey or e.metaKey))
            cb        : (err) ->
                if err
                    alert_message(type:"error", message:err)
        e.preventDefault()

    open_edit_collaborator: (e) ->
        open_project
            project : @props.project.project_id
            cb      : (err, proj) ->
                if err
                    alert_message(type:"error", message:err)
                else
                    proj.show_add_collaborators_box()
        e.stopPropagation()

    render: ->
        project_row_styles =
            backgroundColor : "#ffffff"
            marginBottom    : 0
            cursor          : "pointer"
            wordWrap        : "break-word"

        <Well style={project_row_styles} onClick={@open_project_from_list}>
            <Row>
                <Col sm=4 style={fontWeight: "bold", maxHeight: "7em", overflowY: "auto"}>
                    <a>{html_to_text(@props.project.title)}</a>
                </Col>
                <Col sm=2 style={color: "#666", maxHeight: "7em", overflowY: "auto"}>
                    {@render_last_edited()}
                </Col>
                <Col sm=3 style={color: "#666", maxHeight: "7em", overflowY: "auto"}>
                    {html_to_text(@props.project.description)}
                </Col>
                <Col sm=2 style={maxHeight: "7em", overflowY: "auto"}>
                    <a onClick={@open_edit_collaborator}>
                        <Icon name='user' style={fontSize: "16pt", marginRight:"10px"}/>
                        {@render_user_list()}
                    </a>
                </Col>
                <Col sm=1>
                    {@render_status()}
                </Col>
            </Row>
        </Well>

ShowAllMatchingProjectsButton = rclass
    propTypes:
        show_all : rtypes.bool.isRequired
        more     : rtypes.number.isRequired

    show_all_projects: ->
        flux.getActions('projects').setTo(show_all : not @props.show_all)

    render: ->
        <Button onClick={@show_all_projects} bsStyle="info" bsSize="large">Show {if @props.show_all then "#{@props.more} less" else "#{@props.more} more"} matching projects...</Button>

ProjectList = rclass
    propTypes:
        projects : rtypes.array.isRequired
        show_all : rtypes.bool.isRequired

    getDefaultProps: ->
        projects : []
        user_map : undefined

    render_row: (project) ->
        <ProjectRow project={project} key={project.project_id} user_map={@props.user_map} />

    render_list: ->
        listing = []
        i = 0
        for project in @props.projects
            if i >= MAX_DEFAULT_PROJECTS and not @props.show_all
                break
            i += 1
            listing.push(@render_row(project))

        if @props.projects.length > MAX_DEFAULT_PROJECTS
            listing.push <br key="bottom_space" />
            listing.push <ShowAllMatchingProjectsButton more={@props.projects.length-MAX_DEFAULT_PROJECTS} show_all={@props.show_all} key='show_all'/>
        return listing

    render: ->
        <div>
            {@render_list()}
        </div>

parse_project_tags = (project) ->
    project_information = (project.title + ' ' + project.description).toLowerCase()
    indices = misc.parse_hashtags(project_information)
    return (project_information.substring(i[0], i[1]) for i in indices)

parse_project_search_string = (project, user_map) ->
    search = (project.title + ' ' + project.description).toLowerCase()
    for k in misc.split(search)
        if k[0] == '#'
            tag = k.slice(1).toLowerCase()
            search += " [#{k}] "
    for account_id in misc.keys(project.users)
        if account_id != salvus_client.account_id
            info = user_map.get(account_id)
            if info?
                search += (' ' + info.get('first_name') + ' ' + info.get('last_name') + ' ').toLowerCase()
    return search

# Returns true if the project should be visible with the given filters selected
project_is_in_filter = (project, hidden, deleted) ->
    account_id = salvus_client.account_id
    if not account_id?
        throw "project page shouldn't get rendered until after user sign-in and account info is set"

    return !!project.deleted == deleted and !!project.users[account_id].hide == hidden

ProjectSelector = rclass
    getDefaultProps: ->
        project_map       : undefined
        user_map          : undefined
        hidden            : false
        deleted           : false
        search            : ''
        selected_hashtags : {}
        show_all          : false

    componentWillReceiveProps: (next) ->
        if not @props.user_map? or not @props.project_map?
            return
        # Only update project_list if the project_map actually changed.  Other
        # props such as the filter or search string might have been set,
        # but not the project_map.  This avoids recomputing any hashtag, search,
        # or possibly other derived cached data.
        if not immutable.is(@props.project_map, next.project_map)
            @update_project_list(@props.project_map, next.project_map, next.user_map)
            projects_changed = true
        # Update the hashtag list if the project_map changes *or* either
        # of the filters change.
        if projects_changed or @props.hidden != next.hidden or @props.deleted != next.deleted
            @update_hashtags(next.hidden, next.deleted)
        # If the user map changes, update the search info for the projects with
        # users that changed.
        if not immutable.is(@props.user_map, next.user_map)
            @update_user_search_info(@props.user_map, next.user_map)

    _compute_project_derived_data: (project, user_map) ->
        #console.log("computing derived data of #{project.project_id}")
        # compute the hashtags
        project.hashtags = parse_project_tags(project)
        # compute the search string
        project.search_string = parse_project_search_string(project, user_map)
        return project

    update_user_search_info: (user_map, next_user_map) ->
        if not user_map? or not next_user_map? or not @_project_list?
            return
        for project in @_project_list
            for account_id,_ of project.users
                if not immutable.is(user_map.get(account_id), next_user_map.get(account_id))
                    @_compute_project_derived_data(project, next_user_map)
                    break

    update_project_list: (project_map, next_project_map, user_map) ->
        user_map ?= @props.user_map   # user_map not defined, so use last known one.
        if not project_map? or not user_map?
            # can't do anything without these.
            return
        if next_project_map? and @_project_list?
            # Use the immutable next_project_map to tell the id's of the projects that changed.
            next_project_list = []
            # Remove or modify existing projects
            for project in @_project_list
                id = project.project_id
                next = next_project_map.get(id)
                if next?
                    if project_map.get(id).equals(next)
                        # include as-is in new list
                        next_project_list.push(project)
                    else
                        # include new version with derived data in list
                        next_project_list.push(@_compute_project_derived_data(next.toJS(), user_map))
            # Include newly added projects
            next_project_map.map (project, id) =>
                if not project_map.get(id)?
                    next_project_list.push(@_compute_project_derived_data(project.toJS(), user_map))
        else
            next_project_list = (@_compute_project_derived_data(project.toJS(), user_map) for project in project_map.toArray())

        @_project_list = next_project_list
        # resort by when project was last edited. (feature idea: allow sorting by title or description instead)
        return @_project_list.sort((p0, p1) -> -misc.cmp(p0.last_edited, p1.last_edited))

    project_list: ->
        return @_project_list ? @update_project_list(@props.project_map)

    update_hashtags: (hidden, deleted) ->
        #console.log("(re-)computing hashtags list")
        tags = {}
        for project in @project_list()
            if project_is_in_filter(project, hidden, deleted)
                for tag in project.hashtags
                    tags[tag] = true
        return @_hashtags = misc.keys(tags).sort()

    # All hashtags of projects in this filter
    hashtags: ->
        return @_hashtags ? @update_hashtags()

    # Takes a project and a list of search terms, returns true if all search terms exist in the project
    matches: (project, search_terms) ->
        project_search_string = project.search_string
        for word in search_terms
            if word[0] == '#'
                word = '[' + word + ']'
            if project_search_string.indexOf(word) == -1
                return false
        return true

    visible_projects: ->
        selected_hashtags = underscore.intersection(misc.keys(@props.selected_hashtags[@filter()]), @hashtags())
        words = misc.split(@props.search.toLowerCase()).concat(selected_hashtags)
        return (project for project in @project_list() when project_is_in_filter(project, @props.hidden, @props.deleted) and @matches(project, words))

    toggle_hashtag: (tag) ->
        selected_hashtags = @props.selected_hashtags
        filter = @filter()
        if not selected_hashtags[filter]
            selected_hashtags[filter] = {}
        if selected_hashtags[filter][tag]
            # disable the hashtag
            delete selected_hashtags[filter][tag]
        else
            # enable the hashtag
            selected_hashtags[filter][tag] = true
        flux.getActions('projects').setTo(selected_hashtags: selected_hashtags)

    filter: ->
        "#{@props.hidden}-#{@props.deleted}"

    render_projects_title: ->
        projects_title_styles =
            color        : '#666'
            fontSize     : '24px'
            fontWeight   : '500'
            marginBottom : '1ex'
        <div style={projects_title_styles}><Icon name="thumb-tack" /> Projects </div>

    open_first_project: ->
        project = @visible_projects()[0]
        if project?
            open_project(project: project.project_id)

    render: ->
        if not @props.project_map? or not @props.user_map?
            return <div>Loading...</div>
        <Grid fluid className="constrained">
            <Well style={marginTop:'1em'}>
                <Row>
                    <Col sm=4>
                        {@render_projects_title()}
                    </Col>
                    <Col sm=8>
                        <ProjectsFilterButtons
                            hidden  = {@props.hidden}
                            deleted = {@props.deleted} />
                    </Col>
                </Row>
                <Row>
                    <Col sm=4>
                        <ProjectsSearch search={@props.search} open_first_project={@open_first_project} />
                    </Col>
                    <Col sm=8>
                        <HashtagGroup
                            hashtags          = {@hashtags()}
                            selected_hashtags = {@props.selected_hashtags[@filter()]}
                            toggle_hashtag    = {@toggle_hashtag} />
                    </Col>
                </Row>
                <Row>
                    <Col sm=12 style={marginTop:'1ex'}>
                        <NewProjectCreator />
                    </Col>
                </Row>
                <Row>
                    <Col sm=12>
                        <ProjectsListingDescription
                            hidden            = {@props.hidden}
                            deleted           = {@props.deleted}
                            search            = {@props.search}
                            selected_hashtags = {@props.selected_hashtags[@filter()]} />
                    </Col>
                </Row>
                <Row>
                    <Col sm=12>
                        <ProjectList
                            projects={@visible_projects()}
                            show_all={@props.show_all}
                            user_map={@props.user_map} />
                    </Col>
                </Row>
            </Well>
        </Grid>

ProjectsPage = rclass
    render: ->
        <FluxComponent flux={flux} connectToStores={['users', 'projects']}>
            <ProjectSelector />
        </FluxComponent>

focus_search = (delay) ->
    # horrible hack for now until everything uses react.
    setTimeout((()->$("#projects").find("input").focus()),delay)

React.render(<ProjectsPage />, document.getElementById("projects"))
focus_search(400)

top_navbar.on "switch_to_page-projects", () ->
    window.history.pushState("", "", window.salvus_base_url + '/projects')
    focus_search(200)
