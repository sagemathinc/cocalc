{salvus_client} = require('salvus_client')
{project_page}  = require('project')
{top_navbar}    = require('top_navbar')
{React, Actions, Store, flux, rtypes, rclass, FluxComponent}  = require('flux')
_ = require('underscore')
misc = require('misc')
{required, defaults} = misc
{html_to_text} = require('misc_page')
{Row, Col, Well, Button, ButtonGroup, ButtonToolbar, Grid, Input} = require('react-bootstrap')
{ErrorDisplay, Icon, Saving} = require('r_misc')
TimeAgo = require('react-timeago')

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
        update   : false      # if false used cached local version if available,
                              # though it may be out of date
        hidden   : false      # whether to list hidden projects (if false don't list any hidden projects; if true list only hidden projects)
        select   : undefined  # if given, populate with selectable list of all projects
        select_exclude : undefined # if given, list of project_id's to exclude from select
        number_recent : 7     # number of recent projects to include at top if selector is given.
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
query =
    project_id: null
    last_edited: null
    title: null
    description: null
    deleted: null
    users: null

salvus_client.query
    query : projects:[query]
    changes : true
    cb : (err, result) ->
        if err?
            console.log(err)
        else
            flux.getActions('projects').set_project_list(_.object([p.project_id, p] for p in result.get()))
            result.on 'change', (e) ->
                old = JSON.parse(JSON.stringify(store.state.project_list))
                old[e.old_val.project_id] = e.new_val
                flux.getActions('projects').set_project_list(old)

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

    create_project: ->
        @setState(state:'saving')
        console.log("Creating project: title=" + @state.title_text + " desc=" + @state.description_text)
        @setState(state:'view')
        # Actually create the project here

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
                    <Input ref = "new_project_title"
                           type = "text"
                           placeholder = "Title (you can easily change this later)" />
                </Col>

                <Col sm=5 style={color: "#666"}>
                    <h4>Description:</h4>
                    <Input ref = "new_project_description"
                           type = "text"
                           placeholder = "No description" />
                </Col>

                <Col sm=2 style={marginLeft: 0, maxHeight: "7em", overflowY: "auto"}>
                    <a href=""><Icon name='user' style={fontSize: "16pt"}/></a>
                    {#@render_user_list()}
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    <span> You can change the title and description at any time later. </span>
                    <ButtonToolbar>
                        <Button onClick={@create_project} bsStyle="primary">Create project</Button>
                        <Button onClick={@cancel_editing}>Cancel</Button>
                    </ButtonToolbar>
                    {@render_error()}
                    {@render_saving()}
                </Col>
            </Row>
        </Well>

    render_saving: ->
        if @state.state == 'saving'
            <Saving />

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
        <Button bsStyle="primary" style={width: "100%", marginTop: "1ex"} type="submit" onClick={@props.on_click}>
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
        <ButtonGroup style={marginTop: "1ex"} className="pull-right">
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
            type="search"
            value = @props.search
            ref="search"
            placeholder="Search for projects..."
            onChange={=>flux.getActions('projects').setTo(search: @refs.search.getValue())}
            buttonAfter={@delete_search_button()} />

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
        <Button key={tag} onClick={=>@props.toggle_hashtag(tag)} bsSize="small" bsStyle={color}>{tag}</Button>

    render: ->
        <ButtonGroup>
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
        <Col sm=12
             style={color: "#666", marginBottom: "1ex", marginTop: "1ex", fontWeight: "bold", fontSize: "15pt"}
        >
        {@description()}
        </Col>

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
        for group in misc.PROJECT_GROUPS
            if @props.project[group]?
                for user in @props.project[group]
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
            marginTop       : 0
            marginBottom    : 0
            paddingTop      : "1.5em"
            paddingBottom   : "1.5em"
            paddingLeft     : "1em"
            cursor          : "pointer"
            wordWrap        : "break-word"

        <Well style={project_row_styles} onClick={@open_project_from_list}>
            <Row>
                <Col sm=4>
                    <a href="" style={fontWeight: "bold", maxHeight: "7em", overflowY: "auto"}>{misc.trunc(html_to_text(@props.project.title), 128)}</a>
                </Col>
                <Col sm=2 style={fontSize: "10pt", color: "#666", maxHeight: "7em", overflowY: "auto"}>
                    {@render_last_edited()}
                </Col>
                <Col sm=3 style={marginLeft: 0, color: "#666", maxHeight: "7em", overflowY: "auto"}>
                    {misc.trunc(html_to_text(@props.project.description),128)}
                </Col>
                <Col sm=3 style={marginLeft: 0, maxHeight: "7em", overflowY: "auto"}>
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
        <Col sm=12>
            <div>
                {@render_list()}
            </div>
        </Col>

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
    for group in misc.PROJECT_GROUPS
        if project[group]?
            for user in project[group]
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

    getInitialState: ->
        # Doing this in getInitialState so we can access @props
        @hashtags = cached_function((hidden, deleted) =>
            tags = {}
            for _, project of @props.project_list
                if @project_is_in_filter(project, hidden, deleted)
                    for tag in parse_project_tags(project)
                        tags[tag] = true
            return misc.keys(tags).sort())
        return {}

    parse_project_search_string: cached_function(parse_project_search_string)

    componentWillReceiveProps: (next) ->
        if next.project_update_tag != @props.project_update_tag
            @parse_project_search_string.clear_cache()
            @hashtags.clear_cache()

    # Returns true if the project should be visible with the given filters active
    project_is_in_filter: (project, hidden, deleted) ->
        account_id = require('account').account_settings.account_id()
        !!project.deleted == deleted and !!project.users[account_id].hide == hidden

    matches: (project, words) ->
        search = @parse_project_search_string(project)
        for word in words
            if word[0] == '#'
                word = '[' + word + ']'
            if search.indexOf(word) == -1
                return false
        return true

    visible_projects: ->
        words = misc.split(@props.search).concat(k for k of @props.selected_hashtags[@filter()])
        return (project for _, project of @props.project_list when @project_is_in_filter(project, @props.hidden, @props.deleted) and @matches(project, words))

    toggle_hashtag: (tag) ->
        console.log(tag)
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

    render: ->
        if not @props.project_list?
            # TODO
            return <div>Loading...</div>
        <Grid fluid className="constrained">
            <Well style={overflow:"hidden"}>
                <Row>
                    <Col sm=4>
                        <ProjectsSearch search={@props.search} />
                    </Col>
                    <Col sm=5>
                        <HashtagGroup hashtags={@hashtags(@props.hidden, @props.deleted)} selected_hashtags={@props.selected_hashtags[@filter()]} toggle_hashtag={@toggle_hashtag} />
                    </Col>
                    <Col sm=3>
                        <ProjectsFilterButtons hidden={@props.hidden} deleted={@props.deleted} />
                    </Col>
                </Row>
                <Row>
                    <Col sm=12>
                        <NewProjectCreator />
                    </Col>
                </Row>
                <Row>
                    <ProjectsListingDescription hidden={@props.hidden} deleted={@props.deleted} search={@props.search} selected_hashtags={@props.selected_hashtags[@filter()]} />
                </Row>
                <ProjectList projects={@visible_projects()} />
            </Well>
        </Grid>


ProjectsPage = rclass
    render: ->
        <FluxComponent flux={flux} connectToStores={'projects'}>
            <ProjectSelector />
        </FluxComponent>


React.render(<ProjectsPage />,  document.getElementById("projects"))