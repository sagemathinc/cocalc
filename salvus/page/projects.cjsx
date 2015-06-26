{salvus_client} = require('salvus_client')
{project_page}  = require('project')
{top_navbar}    = require('top_navbar')
{React, Actions, Store, flux, rtypes, rclass, FluxComponent}  = require('flux')
_ = require('underscore')
misc = require('misc')
{required, defaults} = misc
{html_to_text} = require('misc_page')
{Row, Col, Well, Button, ButtonGroup, Grid, Input} = require('react-bootstrap')
{Icon} = require('r_misc')
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
        project_update_flag : Math.random()
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

update_project_list = exports.update_project_list = (cb) ->
    salvus_client.get_projects
        hidden : (if store? then store.state.hidden else false)
        cb: (error, mesg) ->
            if error or mesg.event != 'all_projects'
                if not error and mesg?.event == 'error'
                    error = mesg.error
                alert_message(type:"error", message:"Unable to update project list (#{error})")
            flux.getActions('projects').set_project_list(mesg.projects)
            cb?()

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

ProjectsRefresh = rclass
    getInitialState: ->
        loading : false

    on_refresh: ->
        if not @state.loading
            @setState(loading : true)
            update_project_list (err) =>
                @setState(loading: false)
                if err
                    console.log("an error happened when loading! -- ", err)

    render: ->
        <Col sm=4>
            <h3 style={margin: 0, marginTop: "1ex"}>
                <span style={color: "#428bca", textDecoration: "none", cursor: "pointer"} onClick={@on_refresh}>
                    <Icon name="refresh" spin={@state.loading} />
                </span>
                &nbsp;Projects
            </h3>
        </Col>

NewProjectButton = rclass
    render: ->
        <Col sm=3>
            <Button bsStyle="primary" style={width: "100%", marginTop: "1ex"} type="submit">
                <Icon name="plus-circle" /> Create New Project...
            </Button>
        </Col>

ProjectsFilterButtons = rclass
    propTypes:
        hidden        : rtypes.bool.isRequired
        deleted       : rtypes.bool.isRequired

    getDefaultProps: ->
        hidden : false
        deleted : false

    render: ->
        <Col sm=5>
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
        </Col>

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
        <Col sm=4>
            <Input
                type="search"
                value = @props.search
                ref="search"
                placeholder="Search for projects..."
                onChange={=>flux.getActions('projects').setTo(search: @refs.search.getValue())}
                buttonAfter={@delete_search_button()} />
        </Col>

HashtagGroup = rclass
    propTypes:
        hashtags : rtypes.array.isRequired
        selected_hashtags : rtypes.object.isRequired
        toggle_hashtag : rtypes.func.isRequired

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
        deleted : rtypes.bool.isRequired
        hidden : rtypes.bool.isRequired
        selected_hashtags : rtypes.object.isRequired
        search : rtypes.string.isRequired

    getDefaultProps: ->
        deleted : false
        hidden : false
        selected_hashtags : {}
        search : ""

    description: ->
        query = @props.search.toLowerCase()
        #TODO: cached function
        for tag of @props.selected_hashtags
            query += " " + tag
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
        project       : rtypes.object.isRequired

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
        project_list          : undefined    # an array of projects (or undefined = loading...)
        hidden                : false
        deleted               : false
        search                : ''
        selected_hashtags     : {}

        parse_project_tags          : parse_project_tags    # function that takes project as input and returns its hashtags
        parse_project_search_string : parse_project_search_string  # function that takes project and strings and returns true on match

    getInitialState: ->
        @parse_project_search_string = cached_function(@props.parse_project_search_string)
        @hashtags = cached_function((hidden, deleted) =>
            tags = {}
            for project in @props.project_list
                if @project_is_in_filter(project, hidden, deleted)
                    for tag in @props.parse_project_tags(project)
                        tags[tag] = true
            return misc.keys(tags).sort())
        return {}

    componentWillReceiveProps: (next) ->
        if next.project_update_tag != @props.project_update_tag
            @parse_project_search_string.clear_cache()
            @hashtags.clear_cache()

    project_is_in_filter: (project, hidden, deleted) ->
        !!project.hidden == hidden and !!project.deleted == deleted

    matches: (project, words) ->
        search = @parse_project_search_string(project)
        for word in words
            if word[0] == '#'
                word = '[' + word + ']'
            if search.indexOf(word) == -1
                return false
        return true

    visible_projects: ->
        words = misc.split(@props.search).concat((k for k of @props.selected_hashtags[@filter()]))
        return (project for project in @props.project_list when @project_is_in_filter(project, @props.hidden, @props.deleted) and @matches(project, words))

    toggle_hashtag: (tag) ->
        selected_hashtags = JSON.parse(JSON.stringify(@props.selected_hashtags))
        filter = @filter()
        if not selected_hashtags[filter]
            selected_hashtags[filter] = {}
        if selected_hashtags[filter][tag]
            delete selected_hashtags[filter][tag]
        else
            selected_hashtags[filter][tag] = true

    filter: ->
        "#{@props.hidden}-#{@props.deleted}"

    render: ->
        if not @props.project_list?
            # TODO
            return <div>Loading...</div>
        <Grid fluid className="constrained">
            <Well style={overflow:"hidden"}>
                <Row>
                    <ProjectsRefresh />
                    <NewProjectButton />
                    <ProjectsFilterButtons hidden={@props.hidden} deleted={@props.deleted} />
                </Row>
                <Row>
                    <ProjectsSearch search={@props.search} />
                    <Col sm=8>
                        <HashtagGroup hashtags={@hashtags(@props.hidden, @props.deleted)} selected_hashtags={@props.selected_hashtags[@filter()]} toggle_hashtag={@toggle_hashtag} />
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