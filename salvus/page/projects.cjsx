###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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
{ErrorDisplay, Icon, Loading, LoginLink, Saving, TimeAgo, r_join} = require('r_misc')
{React, Actions, Store, Table, flux, rtypes, rclass, FluxComponent}  = require('flux')
{User} = require('users')


MAX_DEFAULT_PROJECTS = 50

_create_project_tokens = {}

# Define projects actions
class ProjectsActions extends Actions
    # Local state events
    set_project_state : (project_id, name, value) =>
        x = store.state.project_state.get(project_id) ? immutable.Map()
        @setTo(project_state: store.state.project_state.set(project_id, x.set(name, immutable.fromJS(value))))

    delete_project_state : (project_id, name) =>
        x = store.state.project_state.get(project_id)
        if x?
            @setTo(project_state: store.state.project_state.set(project_id, x.delete(name)))

    set_project_state_open : (project_id, err) =>
        @set_project_state(project_id, 'open', {time:new Date(), err:err})

    set_project_state_close : (project_id) =>
        @delete_project_state(project_id, 'open')

    setTo : (settings) ->
        return settings

    restart_project_server : (project_id) ->
        salvus_client.restart_project_server(project_id : project_id)

    set_project_title : (project_id, title) =>
        # set in the Table
        @flux.getTable('projects').set({project_id:project_id, title:title})
        # create entry in the project's log
        require('project_store').getActions(project_id, @flux).log({event:'set',title:title})

    set_project_description : (project_id, description) =>
        # set in the Table
        @flux.getTable('projects').set({project_id:project_id, description:description})
        # create entry in the project's log
        require('project_store').getActions(project_id, @flux).log({event:'set',description:description})

    # Create a new project
    create_project : (opts) =>
        opts = defaults opts,
            title       : 'No Title'
            description : 'No Description'
            token       : undefined  # if given, can use wait_until_project_is_created
        if opts.token?
            token = opts.token; delete opts.token
            opts.cb = (err, project_id) =>
                _create_project_tokens[token] = {err:err, project_id:project_id}
        salvus_client.create_project(opts)

    # Open the given project
    open_project : (opts) =>
        opts = defaults opts,
            project_id : required
            target     : undefined
            switch_to  : undefined
        opts.cb = (err) =>
            @set_project_state_open(opts.project_id, err)
        open_project(opts)
        @foreground_project(opts.project_id)

    close_project : (project_id) ->
        top_navbar.remove_page(project_id)

    # Put the given project in the foreground
    foreground_project : (project_id) =>
        #console.log("foreground_project #{project_id}")
        top_navbar.switch_to_page(project_id)  # TODO: temporary
        require('misc_page').set_window_title(@flux.getStore('projects').get_title(project_id))  # change title bar
        @setTo(foreground_project: project_id)  # TODO: temporary-- this is also set directly in project.coffee on_show

    remove_collaborator : (project_id, account_id) =>
        salvus_client.project_remove_collaborator
            project_id : project_id
            account_id : account_id
            cb         : (err, resp) =>
                if err # TODO: -- set error in store for this project...
                    alert_message(type:'error', message:err)

    invite_collaborator : (project_id, account_id) =>
        salvus_client.project_invite_collaborator
            project_id : project_id
            account_id : account_id
            cb         : (err, resp) =>
                if err # TODO: -- set error in store for this project...
                    alert_message(type:'error', message:err)

    invite_collaborators_by_email : (project_id, to, body) =>
        if not body?
            title = @flux.getStore('projects').get_title(project_id)
            name  = @flux.getStore('account').get_fullname()
            body  = "Please collaborate with me using SageMathCloud on '#{title}'.  Sign up at\n\n    https://cloud.sagemath.com\n\n--\n#{name}"
        salvus_client.invite_noncloud_collaborators
            project_id : project_id
            to         : to
            email      : body
            cb         : (err, resp) =>
                if err
                    alert_message(type:'error', message:err)
                else
                    alert_message(message:resp.mesg)

    # TODO: getting into a bit of a mess here - have toggle_project below.  This is using the API, but
    # toggle_project's uses the database query language.  Using api here due to query language not being
    # sufficiently done to.
    set_project_hide : (project_id, account_id, hide_state) =>
        f = 'hide_project_from_user'
        if not hide_state
            f = 'un' + f
        salvus_client[f]
            project_id : project_id
            account_id : account_id
            cb         : (err) =>
                if err
                    alert_message(type:'error', message:err)

# Register projects actions
actions = flux.createActions('projects', ProjectsActions)

# Define projects store
class ProjectsStore extends Store
    constructor : (flux) ->
        super()
        ActionIds = flux.getActionIds('projects')
        @register(ActionIds.setTo, @setTo)
        @state =
            project_map   : undefined        # when loaded will be an immutable.js map that is synchronized with the database
            project_state : immutable.Map()  # information about state of projects in the browser
        @flux = flux

    setTo : (message) ->
        @setState(message)

    get_project : (project_id) =>
        return @state.project_map.get(project_id)?.toJS()

    # Given an array of objects with an account_id field, sort it by the
    # corresponding last_active timestamp for these users on the given project,
    # starting with most recently active.
    # Also, adds the last_active timestamp field to each element of users
    # given their timestamp for activity *on this project*.
    # For global activity (not just on a project) use
    # the sort_by_activity of the users store.
    sort_by_activity : (users, project_id) =>
        last_active = @state.project_map?.get(project_id)?.get('last_active')
        if not last_active? # no info
            return users
        for user in users
            user.last_active = last_active.get(user.account_id) ? 0
        # the code below sorts by last-active in reverse order, if defined; otherwise by last name (or as tie breaker)
        last_name = (account_id) =>
            @flux.getStore('users').get_last_name(account_id)

        return users.sort (a,b) =>
            c = misc.cmp(b.last_active, a.last_active)
            if c then c else misc.cmp(last_name(a.account_id), last_name(b.account_id))

    get_users : (project_id) =>
        # return users as an immutable JS map.
        @state.project_map?.get(project_id)?.get('users')

    get_last_active : (project_id) =>
        # return users as an immutable JS map.
        @state.project_map?.get(project_id)?.get('last_active')

    get_title : (project_id) =>
        return @state.project_map?.get(project_id)?.get('title')

    get_description : (project_id) =>
        return @state.project_map?.get(project_id)?.get('description')

    get_project_select_list : (current, show_hidden=true) =>
        map = @state.project_map
        account_id = salvus_client.account_id
        list = []
        if current? and map.has(current)
            list.push(id:current, title:map.get(current).get('title'))
            map = map.delete(current)
        v = map.toArray()
        v.sort (a,b) ->
            if a.get('last_edited') < b.get('last_edited')
                return 1
            else if a.get('last_edited') > b.get('last_edited')
                return -1
            return 0
        others = []
        for i in v
            if not i.deleted and (show_hidden or not i.get('users').get(account_id).get('hide'))
                others.push(id:i.get('project_id'), title:i.get('title'))
        list = list.concat others
        return list

    get_project_state : (project_id, name) =>
        return @state.project_state.get(project_id)?.get(name)

    get_project_open_state : (project_id) =>
        return @get_project_state(project_id, 'open')

    # Return the group that the current user has on this project, which can be one of:
    #    'owner', 'collaborator', 'public' or undefined, where undefined means the
    # information needed to determine group hasn't been loaded yet.  Group is considered
    # 'public' if user isn't logged in.
    get_my_group: (project_id) =>
        account_store = @flux.getStore('account')
        if not account_store?
            return
        user_type = account_store.get_user_type()
        if user_type == 'public'
            # Not logged in -- so not in group.
            return 'public'
        if not @state.project_map?  # signed in but waiting for projects store to load
            return
        p = @state.project_map.get(project_id)
        if not p?
            return 'public'
        u = p.get('users')
        me = u.get(account_store.get_account_id())
        if not me?
            return 'public'
        return me.get('group')

    is_project_open : (project_id) =>
        x = @get_project_state(project_id, 'open')
        if not x?
            return false
        return not x.get('err')

    wait_until_project_is_open : (project_id, timeout, cb) =>  # timeout in seconds
        @wait
            until   : => @get_project_open_state(project_id)
            timeout : timeout
            cb      : (err, x) =>
                cb(err or x?.err)

    wait_until_project_exists : (project_id, timeout, cb) =>
        @wait
            until   : => @state.project_map.get(project_id)?
            timeout : timeout
            cb      : cb

    wait_until_project_created : (token, timeout, cb) =>
        @wait
            until   : =>
                x = _create_project_tokens[token]
                return if not x?
                {project_id, err} = x
                if err
                    return {err:err}
                else
                    if @state.project_map.has(project_id)
                        return {project_id:project_id}
            timeout : timeout
            cb      : (err, x) =>
                if err
                    cb(err)
                else
                    cb(x.err, x.project_id)

# Register projects store
store = flux.createStore('projects', ProjectsStore)

# Create and register projects table, which gets automatically
# synchronized with the server.
class ProjectsTable extends Table
    query : ->
        return 'projects'

    _change : (table, keys) =>
        actions.setTo(project_map: table.get())

    toggle_hide_project : (project_id) =>
        account_id = salvus_client.account_id
        hide = !!@_table.get(project_id).get('users').get(account_id).get('hide')
        @set(project_id:project_id, users:{"#{account_id}":{hide:not hide}})

    toggle_delete_project : (project_id) =>
        @set(project_id:project_id, deleted: not @_table.get(project_id).get('deleted'))


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


exports.open_project = open_project = (opts) ->
    opts = defaults opts,
        project_id: required
        item      : undefined
        target    : undefined
        switch_to : true
        cb        : undefined   # cb(err, project)

    proj = project_page(opts.project_id)
    top_navbar.resize_open_project_tabs()
    if opts.switch_to
        top_navbar.switch_to_page(opts.project_id)
    if opts.target?
        proj.load_target(opts.target, opts.switch_to)
    opts.cb?(undefined, proj)

exports.load_target = load_target = (target, switch_to) ->
    if not target or target.length == 0
        top_navbar.switch_to_page('projects')
        return
    segments = target.split('/')
    if misc.is_valid_uuid_string(segments[0])
        t = segments.slice(1).join('/')
        project_id = segments[0]
        require('flux').flux.getActions('projects').open_project
            project_id: project_id
            target    : t
            switch_to : switch_to

NewProjectCreator = rclass
    displayName : 'Projects-NewProjectCreator'

    getInitialState : ->
        state            : 'view'    # view --> edit --> saving --> view
        title_text       : ''
        description_text : ''
        error            : ''

    start_editing : ->
        @setState
            state : 'edit'

    cancel_editing : ->
        @setState
            state            : 'view'
            title_text       : ''
            description_text : ''
            error            : ''

    create_project : ->
        token = misc.uuid()
        @setState(state:'saving')
        actions.create_project
            title       : @state.title_text
            description : @state.description_text
            token       : token
        store.wait_until_project_created token, 30, (err) =>
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

    render_input_section : ->
        <Well style={backgroundColor: '#ffffff'}>
            <Row>
                <Col sm=12 style={color: '#666', fontWeight: 'bold', fontSize: '15pt'}>
                    <Icon name='plus-circle' /> Create a New Project
                </Col>
            </Row>
            <Row>
                <Col sm=5 style={color: '#666'}>
                    <h4>Title:</h4>
                    <Input
                        ref         = 'new_project_title'
                        type        = 'text'
                        placeholder = 'Title (you can easily change this later)'
                        disabled    = {@state.state == 'saving'}
                        onChange    = {=>@setState(title_text:@refs.new_project_title.getValue())}
                        autoFocus   />
                </Col>

                <Col sm=5 style={color: '#666'}>
                    <h4>Description:</h4>
                    <Input
                        ref         = 'new_project_description'
                        type        = 'text'
                        placeholder = 'No description'
                        disabled    = {@state.state == 'saving'}
                        onChange    = {=>@setState(description_text:@refs.new_project_description.getValue())} />
                </Col>

                <Col sm=2>
                    {# potentially add users before creating a project?}
                </Col>
            </Row>

            <Row>
                <Col sm=12>
                    <div style={color:'#666', marginBottom: '6px'}> You can change the title and description at any time later. </div>
                </Col>
            </Row>

            <Row>
                <Col sm=12>
                    <ButtonToolbar>
                        <Button
                            disabled = {@state.title_text == '' or @state.state == 'saving'}
                            bsStyle  = 'primary'
                            onClick  = {@create_project} >
                            Create project
                        </Button>
                        <Button
                            disabled = {@state.state is 'saving'}
                            onClick  = {@cancel_editing} >
                            {if @state.state is 'saving' then <Saving /> else 'Cancel'}
                        </Button>
                    </ButtonToolbar>
                    {@render_error()}
                </Col>
            </Row>
        </Well>

    render_error : ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render : ->
        switch @state.state
            when 'view'
                <Row>
                    <Col sm=3>
                        <Button
                            bsStyle = 'primary'
                            block
                            type    = 'submit'
                            onClick = {@start_editing}>
                            <Icon name='plus-circle' /> New Project...
                        </Button>
                    </Col>
                </Row>
            when 'edit', 'saving'
                <Row>
                    <Col sm=12>
                        {@render_input_section()}
                    </Col>
                </Row>

ProjectsFilterButtons = rclass
    displayName : 'ProjectsFilterButtons'

    propTypes :
        hidden  : rtypes.bool.isRequired
        deleted : rtypes.bool.isRequired

    getDefaultProps : ->
        hidden  : false
        deleted : false

    render : ->
        <ButtonGroup>
            <Button onClick = {=>flux.getActions('projects').setTo(deleted: not @props.deleted)}>
                <Icon name={if @props.deleted then 'check-square-o' else 'square-o'} /> Deleted
            </Button>
            <Button onClick={=>flux.getActions('projects').setTo(hidden: not @props.hidden)}>
                <Icon name={if @props.hidden then 'check-square-o' else 'square-o'} /> Hidden
            </Button>
        </ButtonGroup>

ProjectsSearch = rclass
    displayName : 'Projects-ProjectsSearch'

    propTypes :
        search : rtypes.string.isRequired

    getDefaultProps : ->
        search             : ''
        open_first_project : undefined

    clear_and_focus_input : ->
        flux.getActions('projects').setTo(search: '')
        @refs.projects_search.getInputDOMNode().focus()

    delete_search_button : ->
        <Button onClick={@clear_and_focus_input}>
            <Icon name='times-circle' />
        </Button>

    open_first_project : (e) ->
        e.preventDefault()
        @props.open_first_project?()

    render : ->
        <form onSubmit={@open_first_project}>
            <Input
                ref         = 'projects_search'
                autoFocus
                type        = 'search'
                value       =  @props.search
                placeholder = 'Search for projects...'
                onChange    = {=>flux.getActions('projects').setTo(search: @refs.projects_search.getValue())}
                buttonAfter = {@delete_search_button()} />
        </form>

HashtagGroup = rclass
    displayName : 'Projects-HashtagGroup'

    propTypes :
        hashtags          : rtypes.array.isRequired
        toggle_hashtag    : rtypes.func.isRequired
        selected_hashtags : rtypes.object

    getDefaultProps : ->
        selected_hashtags : {}

    render_hashtag : (tag) ->
        color = 'info'
        if @props.selected_hashtags and @props.selected_hashtags[tag]
            color = 'warning'
        <Button key={tag} onClick={=>@props.toggle_hashtag(tag)} bsSize='small' bsStyle={color}>
            {misc.trunc(tag, 60)}
        </Button>

    render : ->
        <ButtonGroup style={maxHeight:'18ex', overflowY:'auto', overflowX:'hidden'}>
            {@render_hashtag(tag) for tag in @props.hashtags}
        </ButtonGroup>

ProjectsListingDescription = rclass
    displayName : 'Projects-ProjectsListingDescription'

    propTypes :
        deleted           : rtypes.bool
        hidden            : rtypes.bool
        selected_hashtags : rtypes.object
        search            : rtypes.string

    getDefaultProps : ->
        deleted           : false
        hidden            : false
        selected_hashtags : {}
        search            : ''

    description : ->
        query = @props.search.toLowerCase()
        #TODO: cached function
        hashtags_string = (name for name of @props.selected_hashtags).join(' ')
        if query != '' and hashtags_string != '' then query += ' '
        query += hashtags_string
        desc = 'Showing '
        if @props.deleted
            desc += 'deleted '
        if @props.hidden
            desc += 'hidden '
        desc += 'projects '
        if query != ''
            desc += "whose title, description or users contain '#{query}'."
        desc

    render : ->
        project_listing_description_styles =
            color    : '#666'
            wordWrap : 'break-word'

        <h3 style={project_listing_description_styles}>
            {@description()}
        </h3>

ProjectRow = rclass
    displayName : 'Projects-ProjectRow'

    propTypes :
        project : rtypes.object.isRequired
        index   : rtypes.number
        flux    : rtypes.object

    getDefaultProps : ->
        user_map : undefined

    render_status : ->
        <span>
            {misc.capitalize(@props.project.state?.state)}
        </span>

    render_last_edited : ->
        try
            <TimeAgo date={(new Date(@props.project.last_edited)).toISOString()} />
        catch e
            console.log("error setting time of project #{@props.project.project_id} to #{@props.project.last_edited} -- #{e}; please report to wstein@gmail.com")

    render_user_list : ->
        other = ({account_id:account_id} for account_id,_ of @props.project.users)
        @props.flux.getStore('projects').sort_by_activity(other, @props.project.project_id)
        users = []
        for i in [0...other.length]
            users.push <User
                           key         = {other[i].account_id}
                           last_active = {other[i].last_active}
                           account_id  = {other[i].account_id}
                           user_map    = {@props.user_map} />
        return r_join(users)

    open_project_from_list : (e) ->
        @props.flux.getActions('projects').open_project
            project_id: @props.project.project_id
            switch_to : not(e.which == 2 or (e.ctrlKey or e.metaKey))
        e.preventDefault()

    open_edit_collaborator : (e) ->
        open_project
            project : @props.project.project_id
            cb      : (err, proj) ->
                if err
                    alert_message(type:'error', message:err)
                else
                    proj.show_add_collaborators_box()
        e.stopPropagation()

    render : ->
        project_row_styles =
            backgroundColor : if (@props.index % 2) then '#eee' else 'white'
            marginBottom    : 0
            cursor          : 'pointer'
            wordWrap        : 'break-word'

        <Well style={project_row_styles} onClick={@open_project_from_list}>
            <Row>
                <Col sm=3 style={fontWeight: 'bold', maxHeight: '7em', overflowY: 'auto'}>
                    <a>{html_to_text(@props.project.title)}</a>
                </Col>
                <Col sm=2 style={color: '#666', maxHeight: '7em', overflowY: 'auto'}>
                    {@render_last_edited()}
                </Col>
                <Col sm=3 style={color: '#666', maxHeight: '7em', overflowY: 'auto'}>
                    {html_to_text(@props.project.description)}
                </Col>
                <Col sm=3 style={maxHeight: '7em', overflowY: 'auto'}>
                    <a onClick={@open_edit_collaborator}>
                        <Icon name='user' style={fontSize: '16pt', marginRight:'10px'}/>
                        {@render_user_list()}
                    </a>
                </Col>
                <Col sm=1>
                    {@render_status()}
                </Col>
            </Row>
        </Well>

ProjectList = rclass
    displayName : 'Projects-ProjectList'

    propTypes :
        projects : rtypes.array.isRequired
        show_all : rtypes.bool.isRequired
        flux     : rtypes.object

    getDefaultProps : ->
        projects : []
        user_map : undefined

    show_all_projects : ->
        flux.getActions('projects').setTo(show_all : not @props.show_all)

    render_show_all : ->
        if @props.projects.length > MAX_DEFAULT_PROJECTS
            more = @props.projects.length - MAX_DEFAULT_PROJECTS
            <br />
            <Button
                onClick={@show_all_projects}
                bsStyle='info'
                bsSize='large'>
                Show {if @props.show_all then "#{more} less" else "#{more} more"} matching projects...
            </Button>

    render_list : ->
        listing = []
        i = 0
        for project in @props.projects
            if i >= MAX_DEFAULT_PROJECTS and not @props.show_all
                break
            listing.push <ProjectRow
                             project  = {project}
                             user_map = {@props.user_map}
                             index    = {i}
                             key      = {i}
                             flux     = {@props.flux} />
            i += 1

        return listing

    render : ->
        <div>
            {@render_list()}
            {@render_show_all()}
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
        throw 'project page should not get rendered until after user sign-in and account info is set'

    return !!project.deleted == deleted and !!project.users[account_id].hide == hidden

ProjectSelector = rclass
    displayName : 'Projects-ProjectSelector'

    propTypes :
        project_map       : rtypes.object
        user_map          : rtypes.object
        hidden            : rtypes.bool
        deleted           : rtypes.bool
        search            : rtypes.string
        selected_hashtags : rtypes.object
        show_all          : rtypes.bool
        flux              : rtypes.object

    getDefaultProps : ->
        project_map       : undefined
        user_map          : undefined
        hidden            : false
        deleted           : false
        search            : ''
        selected_hashtags : {}
        show_all          : false

    componentWillReceiveProps : (next) ->
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

    _compute_project_derived_data : (project, user_map) ->
        #console.log("computing derived data of #{project.project_id}")
        # compute the hashtags
        project.hashtags = parse_project_tags(project)
        # compute the search string
        project.search_string = parse_project_search_string(project, user_map)
        return project

    update_user_search_info : (user_map, next_user_map) ->
        if not user_map? or not next_user_map? or not @_project_list?
            return
        for project in @_project_list
            for account_id,_ of project.users
                if not immutable.is(user_map.get(account_id), next_user_map.get(account_id))
                    @_compute_project_derived_data(project, next_user_map)
                    break

    update_project_list : (project_map, next_project_map, user_map) ->
        user_map ?= @props.user_map   # if user_map is not defined, use last known one.
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

    project_list : ->
        return @_project_list ? @update_project_list(@props.project_map)

    update_hashtags : (hidden, deleted) ->
        tags = {}
        for project in @project_list()
            if project_is_in_filter(project, hidden, deleted)
                for tag in project.hashtags
                    tags[tag] = true
        @_hashtags = misc.keys(tags).sort()
        return @_hashtags

    # All hashtags of projects in this filter
    hashtags : ->
        return @_hashtags ? @update_hashtags(@props.hidden, @props.deleted)

    # Takes a project and a list of search terms, returns true if all search terms exist in the project
    matches : (project, search_terms) ->
        project_search_string = project.search_string
        for word in search_terms
            if word[0] == '#'
                word = '[' + word + ']'
            if project_search_string.indexOf(word) == -1
                return false
        return true

    visible_projects : ->
        selected_hashtags = underscore.intersection(misc.keys(@props.selected_hashtags[@filter()]), @hashtags())
        words = misc.split(@props.search.toLowerCase()).concat(selected_hashtags)
        return (project for project in @project_list() when project_is_in_filter(project, @props.hidden, @props.deleted) and @matches(project, words))

    toggle_hashtag : (tag) ->
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

    filter : ->
        "#{@props.hidden}-#{@props.deleted}"

    render_projects_title : ->
        projects_title_styles =
            color        : '#666'
            fontSize     : '24px'
            fontWeight   : '500'
            marginBottom : '1ex'
        <div style={projects_title_styles}><Icon name='thumb-tack' /> Projects </div>

    open_first_project : ->
        project = @visible_projects()[0]
        if project?
            open_project(project: project.project_id)

    render : ->
        if not @props.project_map? or not @props.user_map?
            if @props.flux.getStore('account')?.get_user_type() == 'public'
                return <LoginLink />
            else
                return <div style={fontSize:'40px', textAlign:'center', color:'#999999'} > <Loading />  </div>
        <Grid fluid className='constrained'>
            <Well style={marginTop:'1em',overflow:'hidden'}>
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
                            projects = {@visible_projects()}
                            show_all = {@props.show_all}
                            user_map = {@props.user_map}
                            flux     = {@props.flux} />
                    </Col>
                </Row>
            </Well>
        </Grid>

ProjectsPage = rclass
    displayName : 'Projects-ProjectsPage'

    render : ->
        <FluxComponent flux={flux} connectToStores={['users', 'projects']}>
            <ProjectSelector />
        </FluxComponent>

exports.ProjectTitle = ProjectTitle = rclass
    displayName : 'Projects-ProjectTitle'

    propTypes :
        project_id  : rtypes.string.isRequired
        project_map : rtypes.object

    shouldComponentUpdate : (nextProps) ->
        nextProps.project_map?.get(@props.project_id)?.get('title') != @props.project_map?.get(@props.project_id)?.get('title')

    render : ->
        if not @props.project_map?
            return <Loading />
        title = @props.project_map?.get(@props.project_id)?.get('title')
        if title?
            <a onClick={@handle_click} href=''>{html_to_text(title)}</a>
        else
            <span>(Private project)</span>

exports.ProjectTitleAuto = rclass
    displayName : 'Projects-ProjectTitleAuto'

    propTypes :
        project_id  : rtypes.string.isRequired

    render : ->
        <FluxComponent flux={flux} connectToStores={['projects']}>
            <ProjectTitle project_id={@props.project_id} />
        </FluxComponent>

is_mounted = false
mount = ->
    #console.log('mount projects')
    React.render(<ProjectsPage />, document.getElementById('projects'))
    is_mounted = true

unmount = ->
    #console.log('unmount projects')
    if is_mounted
        React.unmountComponentAtNode(document.getElementById('projects'))
        is_mounted = false

top_navbar.on 'switch_to_page-projects', () ->
    window.history.pushState('', '', window.salvus_base_url + '/projects')
    mount()

top_navbar.on 'switch_from_page-projects', () ->
    window.history.pushState('', '', window.salvus_base_url + '/projects')
    unmount()

