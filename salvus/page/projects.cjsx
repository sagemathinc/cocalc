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


{salvus_client} = require('salvus_client')
{project_page}  = require('project')
{top_navbar}    = require('top_navbar')
{React, Actions, Store, Table, flux, rtypes, rclass, FluxComponent}  = require('flux')
_ = require('underscore')
misc = require('misc')
{required, defaults} = misc
{html_to_text} = require('misc_page')
{Row, Col, Well, Button, ButtonGroup, ButtonToolbar, Grid, Input} = require('react-bootstrap')
{ErrorDisplay, Icon, Saving} = require('r_misc')
TimeAgo = require('react-timeago')

# Returns a function g that stores its results in a cache for future calls.
# Clear its cache by calling g.clear_cache()
exports.cached_function = cached_function = (f) ->
    cache = {}
    g = (args...) ->
        key = misc.hash_string(JSON.stringify(args))
        a = cache[key]
        if a?
            return a
        else
            a = f(args...)
            cache[key] = a
            return a
    g.clear_cache = () -> cache = {}
    return g

###
# Projects
###

# Define projects actions
class ProjectsActions extends Actions
    setTo: (settings) ->
        if 'project' of settings
            console.log("Tried setting projects store in invalid way -- use built in methods for setting desired properties.")
        else
            return settings

    set_project_list: (project_list) ->
        project_list : project_list

    set_projects: (projects) =>
        # TODO: this is a quick shim to test out api
        v = misc.deep_copy(flux.getStore("projects").state.project_list) ? {}
        for project in projects
            v[project.project_id] = project
        flux.getActions('projects').set_project_list(v)

    delete_project: (project_id) =>
        # TODO: this is a quick shim to test out api
        v = misc.deep_copy(flux.getStore("projects").state.project_list) ? {}
        delete v[project_id]
        flux.getActions('projects').set_project_list(v)

# Register projects actions
flux.createActions('projects', ProjectsActions)

# Define projects store
class ProjectsStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('projects')
        @register(ActionIds.setTo, @setTo)
        @register(ActionIds.set_project_list, @setTo)
        @state = {}

    setTo: (message) ->
        @setState(message)

# Register projects store
flux.createStore('projects', ProjectsStore, flux)

store = flux.getStore('projects')

exports.get_project_info = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required
    project = opts.project_id
    if store.state.project_list?
        for p in store.state.project_list
            if p.project_id == project
                opts.cb(undefined, p)
                return
    # have to get info from database.
    salvus_client.project_info
        project_id : project
        cb         : opts.cb

# Return last downloaded project list
exports.get_project_list = (opts) ->
    opts = defaults opts,
        update   : false      # if false used cached local version if available, though it may be out of date
        hidden   : false      # whether to list hidden projects (if false don't list any hidden projects; if true list only hidden projects)
        select   : undefined  # if given, populate with selectable list of all projects
        select_exclude : undefined # if given, list of project_id's to exclude from select
        number_recent  : 7    # number of recent projects to include at top if selector is given.
        cb       : undefined  # cb(err, project_list)

    update_list = (cb) ->
        if not opts.update and ((store.state.project_list? and not opts.hidden) or (store.state.hidden_project_list? and opts.hidden))
            # done
            cb()
        else
            salvus_client.get_projects
                hidden : opts.hidden
                cb     : (err, mesg) ->
                    if err
                        cb(err)
                    else if mesg.event == 'error'
                        cb(mesg.error)
                    else
                        flux.getActions('projects').set_project_list(mesg.projects)
                        cb()
    update_list (err) ->
        if err
            opts.cb?(err)
        else
            console.log("NOT IMPLEMENTED")

# Create and register projects table, which gets automatically
# synchronized with the server.
class ProjectsTable extends Table
    constructor: ->
        super('projects')

    _change: (table, keys) =>
        # TODO: project_list is NOT a list!
        v = []
        for project_id, project of table.get(keys).toJS()
            if project?
                project.hashtags = parse_project_tags(project)
                v.push(project)
            else
                @flux.getActions('projects').delete_project(project_id)
        @flux.getActions('projects').set_projects(v)

flux.createTable('projects', ProjectsTable)


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
                    <div style={color:"#666"}> You can change the title and description at any time later. </div>
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

    delete_search_button: ->
        <Button onClick={=>flux.getActions('projects').setTo(search: '')}>
            <Icon name="times-circle" />
        </Button>

    render: ->
        <Input
            type        = "search"
            value       =  @props.search
            ref         = "search"
            placeholder = "Search for projects..."
            onChange    = {=>flux.getActions('projects').setTo(search: @refs.search.getValue())}
            buttonAfter = {@delete_search_button()} />

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
        project : rtypes.object.isRequired

    render_last_edited: ->
        try
            <TimeAgo date={(new Date(@props.project.last_edited)).toISOString()} />
        catch e
            console.log("error setting time of project #{@props.project.project_id} to #{@props.project.last_edited} -- #{e}; please report to wstein@gmail.com")

    render_user_list: ->
        users = []
        for user of @props.project.users
            if user.account_id != salvus_client.account_id
                users.push("#{user.first_name} #{user.last_name}")
        if users.length == 0
            return ''
        return '  ' + users.join(', ')

    open_project_from_list: (e) ->
        open_project
            project   : @props.project.project_id
            switch_to : not(e.which == 2 or (e.ctrlKey or e.metaKey))
            cb        : (err) ->
                if err
                    alert_message(type:"error", message:err)
        return false

    render: ->
        project_row_styles =
            backgroundColor : "#ffffff"
            marginBottom    : 0
            cursor          : "pointer"
            wordWrap        : "break-word"

        <Well style={project_row_styles} onClick={@open_project_from_list}>
            <Row>
                <Col sm=4 style={fontWeight: "bold", maxHeight: "7em", overflowY: "auto"}>
                    <a href="">
                        {html_to_text(@props.project.title)}
                    </a>
                </Col>
                <Col sm=2 style={color: "#666", maxHeight: "7em", overflowY: "auto"}>
                    {@render_last_edited()}
                </Col>
                <Col sm=3 style={color: "#666", maxHeight: "7em", overflowY: "auto"}>
                    {html_to_text(@props.project.description)}
                </Col>
                <Col sm=3 style={maxHeight: "7em", overflowY: "auto"}>
                    <a href=""><Icon name='user' style={fontSize: "16pt"}/></a>
                    {@render_user_list()}
                </Col>
            </Row>
        </Well>

ShowAllMatchingProjectsButton = rclass
    propTypes:
        search : rtypes.bool.isRequired

    show_all_projects: ->
        flux.getActions('projects').setTo
            show_all : not @props.show_all

    render: ->
        <Button onClick={@show_all_projects} bsStyle="info" bsSize="large">Show all matching projects...</Button>

ProjectList = rclass
    propTypes:
        projects : rtypes.array.isRequired

    getDefaultProps: ->
        projects : []

    render_row: (project, key) ->
        <ProjectRow project={project} key={key}/>

    render_list: ->
        MAX_DEFAULT_PROJECTS = 50
        listing = []
        i = 0
        for project in @props.projects
            #TODO
            if i >= MAX_DEFAULT_PROJECTS
                listing.push <ShowAllMatchingProjectsButton show_all={@props.show_all}/>
                break
            i += 1
            listing.push @render_row(project, i)
        return listing

    render: ->
        <div>
            {@render_list()}
        </div>

parse_project_tags = (project) ->
    project_information = (project.title + ' ' + project.description).toLowerCase()
    indices = misc.parse_hashtags(project_information)
    return (project_information.substring(i[0], i[1]) for i in indices)

parse_project_search_string = (project) ->
    search = (project.title + ' ' + project.description).toLowerCase()
    for k in misc.split(search)
        if k[0] == '#'
            tag = k.slice(1).toLowerCase()
            search += " [#{k}] "
    for user in project.users
        if user.account_id != salvus_client.account_id
            search += (' ' + user.first_name + ' ' + user.last_name + ' ').toLowerCase()
    return search



ProjectSelector = rclass
    getDefaultProps: ->
        project_list      : undefined    # an array of projects (or undefined = loading...)
        hidden            : false
        deleted           : false
        search            : ''
        selected_hashtags : {}


    parse_project_search_string: cached_function(parse_project_search_string)

    componentWillReceiveProps: (next) ->
        if next.project_update_tag != @props.project_update_tag
            parse_project_search_string.clear_cache()
            hashtags.clear_cache()


    # Takes a project and a list of search terms, returns true if all search terms exist in the project
    matches: (project, search_terms) ->
        project_search_string = parse_project_search_string(project)
        for word in search_terms
            if word[0] == '#'
                word = '[' + word + ']'
            if project_search_string.indexOf(word) == -1
                return false
        return true

    visible_projects: ->
        words = misc.split(@props.search).concat(k for k of @props.selected_hashtags[@filter()])
        return (project for _, project of @props.project_list when @project_is_in_filter(project, @props.hidden, @props.deleted) and @matches(project, words))

    toggle_hashtag: (tag) ->
        selected_hashtags = JSON.parse(JSON.stringify(@props.selected_hashtags))
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

    # All hashtags from visible projects
    hashtags: ->
        tags = {}
        for _, project of @props.project_list
            if @project_is_in_filter(project, @props.hidden, @props.deleted)
                for tag in parse_project_tags(project)
                    tags[tag] = true
        return misc.keys(tags).sort()

    # Returns true if the project should be visible with the current filters active
    project_is_in_filter: (project) ->
        account_id = require('account').account_settings.account_id()
        !!project.deleted == @props.deleted and !!project.users[account_id].hide == @props.hidden


    render_projects_title: ->
        projects_title_styles =
            color        : '#666'
            fontSize     : '24px'
            fontWeight   : '500'
            marginBottom : '1ex'
        <div style={projects_title_styles}><Icon name="thumb-tack" /> Projects </div>


    render: ->
        if not @props.project_list?
            # TODO
            return <div>Loading...</div>
        <Grid fluid className="constrained">
            <Well style={marginTop:'1em'}>
                <Row>
                    <Col sm=4>
                        <Row>
                            <Col sm=12>
                                {@render_projects_title()}
                            </Col>
                        </Row>
                        <Row>
                            <Col sm=12>
                                <ProjectsSearch search = {@props.search} />
                            </Col>
                        </Row>
                        <Row>
                            <Col sm=12>
                                <ProjectsFilterButtons
                                    hidden  = {@props.hidden}
                                    deleted = {@props.deleted} />
                            </Col>
                        </Row>
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
                        <ProjectList projects = {@visible_projects()} />
                    </Col>
                </Row>
            </Well>
        </Grid>




ProjectsPage = rclass
    render: ->
        <FluxComponent flux={flux} connectToStores = {'projects'}>
            <ProjectSelector />
        </FluxComponent>

React.render(<ProjectsPage />, document.getElementById("projects"))
