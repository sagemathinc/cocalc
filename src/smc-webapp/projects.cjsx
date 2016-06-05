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

{salvus_client} = require('./salvus_client')
{top_navbar}    = require('./top_navbar')
{alert_message} = require('./alerts')

misc = require('smc-util/misc')
{required, defaults} = misc
{html_to_text} = require('./misc_page')
{SiteName, PolicyPricingPageUrl} = require('./customize')

markdown = require('./markdown')

{Row, Col, Well, Button, ButtonGroup, ButtonToolbar, Grid, Input, Alert} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, LoginLink, ProjectState, Saving, Space, TimeAgo, Tip, UPGRADE_ERROR_STYLE, Footer, r_join} = require('./r_misc')
{React, ReactDOM, Actions, Store, Table, redux, rtypes, rclass, Redux}  = require('./smc-react')
{User} = require('./users')
{BillingPageSimplifiedRedux} = require('./billing')
{UpgradeAdjustorForUncreatedProject} = require('./project_settings')

MAX_DEFAULT_PROJECTS = 50

_create_project_tokens = {}
_create_project_with_upgrades_tokens = {}

# Define projects actions
class ProjectsActions extends Actions
    # Local state events
    set_project_state : (project_id, name, value) =>
        x = store.getIn(['project_state', project_id]) ? immutable.Map()
        @setState(project_state: store.get('project_state').set(project_id, x.set(name, immutable.fromJS(value))))

    delete_project_state : (project_id, name) =>
        x = store.getIn(['project_state', project_id])
        if x?
            @setState(project_state: store.get('project_state').set(project_id, x.delete(name)))

    set_project_state_open : (project_id, err) =>
        @set_project_state(project_id, 'open', {time:salvus_client.server_time(), err:err})

    set_project_state_close : (project_id) =>
        @delete_project_state(project_id, 'open')

    # Returns true only if we are a collaborator/user of this project and have loaded it.
    # Should check this before changing anything in the projects table!  Otherwise, bad
    # things will happen.
    have_project: (project_id) =>
        return @redux.getTable('projects')?._table?.get(project_id)?  # dangerous use of _table!

    set_project_title : (project_id, title) =>
        if not @have_project(project_id)
            alert_message(type:'error', message:"Can't set title -- you are not a collaborator on this project.")
            return
        if store.get_title(project_id) == title
            # title is already set as requested; nothing to do
            return
        # set in the Table
        @redux.getTable('projects').set({project_id:project_id, title:title})
        # create entry in the project's log
        @redux.getProjectActions(project_id).log
            event : 'set'
            title : title

    set_project_description : (project_id, description) =>
        if not @have_project(project_id)
            alert_message(type:'error', message:"Can't set description -- you are not a collaborator on this project.")
            return
        if store.get_description(project_id) == description
            # description is already set as requested; nothing to do
            return
        # set in the Table
        @redux.getTable('projects').set({project_id:project_id, description:description})
        # create entry in the project's log
        @redux.getProjectActions(project_id).log
            event       : 'set'
            description : description

    # only owner can set course description.
    set_project_course_info : (project_id, course_project_id, path, pay, account_id, email_address) =>
        if not @have_project(project_id)
            alert_message(type:'error', message:"Can't set description -- you are not a collaborator on this project.")
            return
        course_info = store.get_course_info(project_id)?.toJS()
        if course_info? and course_info.project_id == course_project_id and course_info.path == path and misc.cmp_Date(course_info.pay, pay) == 0 and course_info.account_id == account_id and course_info.email_address == email_address
            # already set as required; do nothing
            return

        # Set in the database (will get reflected in table); setting directly in the table isn't allowed (due to backend schema).
        salvus_client.query
            query :
                projects_owner :
                    project_id : project_id
                    course     :
                        project_id    : course_project_id
                        path          : path
                        pay           : pay
                        account_id    : account_id
                        email_address : email_address

    set_project_course_info_paying: (project_id, cb) =>
        salvus_client.query
            query :
                projects_owner :
                    project_id : project_id
                    course     :
                        paying     : salvus_client.server_time()
            cb : cb

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
    
    # Create a new project
    create_project_with_upgrades : (opts) =>
        opts = defaults opts,
            title       : 'No Title'
            description : 'No Description'
            token       : undefined  # if given, can use wait_until_project_is_created
        if opts.token?
            token = opts.token; delete opts.token
            opts.cb = (err, project_id) =>
                _create_project_with_upgrades_tokens[token] = {err:err, project_id:project_id}
                
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
        if opts.switch_to
            @foreground_project(opts.project_id)

    close_project : (project_id) ->
        top_navbar.remove_page(project_id)

    # Put the given project in the foreground
    foreground_project : (project_id) =>
        top_navbar.switch_to_page(project_id)  # TODO: temporary
        @redux.getStore('projects').wait # the database often isn't loaded at this moment (right when user refreshes)
            until : (store) => store.get_title(project_id)
            cb    : (err, title) =>
                if not err
                    require('./browser').set_window_title(title)  # change title bar
        @setState(foreground_project: project_id)  # TODO: temporary-- this is also set directly in project.coffee on_show

    # Given the id of a public project, make it so that sometime
    # in the future the projects store knows the corresponding title,
    # (at least what it is right now).
    fetch_public_project_title: (project_id) =>
        salvus_client.query
            query :
                public_projects : {project_id : project_id, title : null}
            cb    : (err, resp) =>
                if not err
                    # TODO: use the store somehow to report error?
                    title = resp?.query?.public_projects?.title
                    if title?
                        @setState(public_project_titles : store.get('public_project_titles').set(project_id, title))

    # If something needs the store to fill in
    #    directory_tree.project_id = {updated:time, error:err, tree:list},
    # call this function.  Used by the DirectoryListing component.
    fetch_directory_tree: (project_id) =>
        # WARNING: Do not change the store except in a callback below.
        block = "_fetch_directory_tree_#{project_id}"
        if @[block]
            return
        @[block] = true
        salvus_client.find_directories
            include_hidden : false
            project_id     : project_id
            cb             : (err, resp) =>
                # ignore calls to update_directory_tree for 5 more seconds
                setTimeout((()=>delete @[block]), 5000)
                x = store.get('directory_trees') ? immutable.Map()
                obj =
                    error   : err
                    tree    : resp?.directories.sort()
                    updated : new Date()
                @setState(directory_trees: x.set(project_id, immutable.fromJS(obj)))

    # The next few actions below involve changing the users field of a project.
    # See the users field of schema.coffee for documentaiton of the structure of this.

    ###
    # Collaborators
    ###
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

    invite_collaborators_by_email : (project_id, to, body, subject, silent) =>
        title = @redux.getStore('projects').get_title(project_id)
        if not body?
            name  = @redux.getStore('account').get_fullname()
            body  = "Please collaborate with me using SageMathCloud on '#{title}'.\n\n\n--\n#{name}"

        link2proj = "https://#{window.location.hostname}/projects/#{project_id}/"

        # convert body from markdown to html, which is what the backend expects
        body = markdown.markdown_to_html(body).s

        salvus_client.invite_noncloud_collaborators
            project_id : project_id
            title      : title
            link2proj  : link2proj
            to         : to
            email      : body
            subject    : subject
            cb         : (err, resp) =>
                if not silent
                    if err
                        alert_message(type:'error', message:err)
                    else
                        alert_message(message:resp.mesg)

    ###
    # Upgrades
    ###
    # - upgrades is a map from upgrade parameters to integer values.
    # - The upgrades get merged into any other upgrades this user may have already applied.
    apply_upgrades_to_project: (project_id, upgrades) =>
        @redux.getTable('projects').set
            project_id : project_id
            users      :
                "#{@redux.getStore('account').get_account_id()}" : {upgrades: upgrades}
                # create entry in the project's log
        # log the change in the project log
        @redux.getProjectActions(project_id).log
            event    : 'upgrade'
            upgrades : upgrades

    save_project: (project_id) =>
        @redux.getTable('projects').set
            project_id     : project_id
            action_request : {action:'save', time:salvus_client.server_time()}

    stop_project: (project_id) =>
        @redux.getTable('projects').set
            project_id     : project_id
            action_request : {action:'stop', time:salvus_client.server_time()}

    close_project_on_server: (project_id) =>  # not used by UI yet - dangerous
        @redux.getTable('projects').set
            project_id     : project_id
            action_request : {action:'close', time:salvus_client.server_time()}

    restart_project : (project_id) ->
        @redux.getTable('projects').set
            project_id     : project_id
            action_request : {action:'restart', time:salvus_client.server_time()}

    start_project : (project_id) ->
        @redux.getTable('projects').set
            project_id     : project_id
            action_request : {action:'start', time:salvus_client.server_time()}

    # Toggle whether or not project is hidden project
    set_project_hide : (account_id, project_id, state) =>
        @redux.getTable('projects').set
            project_id : project_id
            users      :
                "#{account_id}" :
                    hide : !!state

    # Toggle whether or not project is hidden project
    toggle_hide_project : (project_id) =>
        account_id = @redux.getStore('account').get_account_id()
        @redux.getTable('projects').set
            project_id : project_id
            users      :
                "#{account_id}" :
                    hide : not @redux.getStore('projects').is_hidden_from(project_id, account_id)

    delete_project : (project_id) =>
        @redux.getTable('projects').set
            project_id : project_id
            deleted    : true

    # Toggle whether or not project is deleted.
    toggle_delete_project : (project_id) =>
        @redux.getTable('projects').set
            project_id : project_id
            deleted    : not @redux.getStore('projects').is_deleted(project_id)

# Register projects actions
actions = redux.createActions('projects', ProjectsActions)

# Define projects store
class ProjectsStore extends Store
    get_project : (project_id) =>
        return @getIn(['project_map', project_id])?.toJS()

    # Given an array of objects with an account_id field, sort it by the
    # corresponding last_active timestamp for these users on the given project,
    # starting with most recently active.
    # Also, adds the last_active timestamp field to each element of users
    # given their timestamp for activity *on this project*.
    # For global activity (not just on a project) use
    # the sort_by_activity of the users store.
    sort_by_activity : (users, project_id) =>
        last_active = @getIn(['project_map', project_id, 'last_active'])
        if not last_active? # no info
            return users
        for user in users
            user.last_active = last_active.get(user.account_id) ? 0
        # the code below sorts by last-active in reverse order, if defined; otherwise by last name (or as tie breaker)
        last_name = (account_id) =>
            @redux.getStore('users').get_last_name(account_id)

        return users.sort (a,b) =>
            c = misc.cmp(b.last_active, a.last_active)
            if c then c else misc.cmp(last_name(a.account_id), last_name(b.account_id))

    get_users : (project_id) =>
        # return users as an immutable JS map.
        return @getIn(['project_map', project_id, 'users'])

    get_last_active : (project_id) =>
        # return users as an immutable JS map.
        return @getIn(['project_map', project_id, 'last_active'])

    get_title : (project_id) =>
        return @getIn(['project_map', project_id, 'title'])

    get_description : (project_id) =>
        return @getIn(['project_map', project_id, 'description'])

    # Immutable.js info about a student project that is part of a
    # course (will be undefined if not a student project)
    get_course_info : (project_id) =>
        return @getIn(['project_map', project_id, 'course'])

    # If a course payment is required for this project from the signed in user, returns time when
    # it will be required; otherwise, returns undefined.
    date_when_course_payment_required: (project_id) =>
        account = @redux.getStore('account')
        if not account?
            return
        info = @get_course_info(project_id)
        if not info?
            return
        is_student = info?.get?('account_id') == salvus_client.account_id or info?.get?('email_address') == account.get('email_address')
        if is_student and not @is_deleted(project_id)
            # signed in user is the student
            pay = info.get('pay')
            if pay
                if salvus_client.server_time() >= misc.months_before(-3, pay)
                    # It's 3 months after date when sign up required, so course likely over,
                    # and we no longer require payment
                    return
                # payment is required at some point
                if @get_total_project_quotas(project_id)?.member_host
                    # already paid -- thanks
                    return
                else
                    # need to pay, but haven't -- this is the time by which they must pay
                    return pay

    is_deleted : (project_id) =>
        return !!@getIn(['project_map', project_id, 'deleted'])

    is_hidden_from : (project_id, account_id) =>
        return !!@getIn(['project_map', project_id, 'users', account_id, 'hide'])

    get_project_select_list : (current, show_hidden=true) =>
        map = @get('project_map')
        if not map?
            return
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
        return @getIn(['project_state', project_id, name])

    get_project_open_state : (project_id) =>
        return @get_project_state(project_id, 'open')

    # Return the group that the current user has on this project, which can be one of:
    #    'owner', 'collaborator', 'public', 'admin' or undefined, where
    # undefined -- means the information needed to determine group hasn't been loaded yet
    # 'owner' - the current user owns the project
    # 'collaborator' - current user is a collaborator on the project
    # 'public' - user is possibly not logged in or is not an admin and not on the project at all
    # 'admin' - user is not owner/collaborator but is an admin, hence has rights
    get_my_group : (project_id) =>
        account_store = @redux.getStore('account')
        if not account_store?
            return
        user_type = account_store.get_user_type()
        if user_type == 'public'
            # Not logged in -- so not in group.
            return 'public'
        if not @get('project_map')?  # signed in but waiting for projects store to load
            return
        p = @getIn(['project_map', project_id])
        if not p?
            if account_store.is_admin()
                return 'admin'
            else
                return 'public'
        u = p.get('users')
        me = u?.get(account_store.get_account_id())
        if not me?
            if account_store.is_admin()
                return 'admin'
            else
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
            until   : => @getIn(['project_map', project_id])?
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
                    if @get('project_map').has(project_id)
                        return {project_id:project_id}
            timeout : timeout
            cb      : (err, x) =>
                if err
                    cb(err)
                else
                    cb(x.err, x.project_id)
                    
    wait_until_project_with_upgrades_created : (token, timeout, cb) =>
        @wait
            until   : =>
                x = _create_project_with_upgrades_tokens[token]
                return if not x?
                {project_id, err} = x
                if err
                    return {err:err}
                else
                    if @get('project_map').has(project_id)
                        return {project_id:project_id}
            timeout : timeout
            cb      : (err, x) =>
                if err
                    cb(err)
                else
                    cb(x.err, x.project_id)

    # Returns the total amount of upgrades that this user has allocated
    # across all their projects.
    get_total_upgrades_you_have_applied : =>
        if not @get('project_map')?
            return
        total = {}
        @get('project_map').map (project, project_id) =>
            total = misc.map_sum(total, project.getIn(['users', salvus_client.account_id, 'upgrades'])?.toJS())
        return total

    get_upgrades_you_applied_to_project: (project_id) =>
        return @getIn(['project_map', project_id, 'users', salvus_client.account_id, 'upgrades'])?.toJS()

    # Get the individual users contributions to the project's upgrades
    get_upgrades_to_project: (project_id) =>
        # mapping (or undefined)
        #    {memory:{account_id:1000, another_account_id:2000, ...}, network:{account_id:1, ...}, ...}
        users = @getIn(['project_map', project_id, 'users'])?.toJS()
        if not users?
            return
        upgrades = {}
        for account_id, info of users
            for prop, val of info.upgrades ? {}
                if val > 0
                    upgrades[prop] ?= {}
                    upgrades[prop][account_id] = val
        return upgrades

    # Get the sum of all the upgrades given to the project by all users
    get_total_project_upgrades: (project_id) =>
        # mapping (or undefined)
        #    {memory:3000, network:2, ...}
        users = @getIn(['project_map', project_id, 'users'])?.toJS()
        if not users?
            return
        upgrades = {}
        for account_id, info of users
            for prop, val of info.upgrades ? {}
                upgrades[prop] = (upgrades[prop] ? 0) + val
        return upgrades

    # Get the total quotas for the given project, including free base values and all user upgrades
    get_total_project_quotas : (project_id) =>
        base_values = @getIn(['project_map', project_id, 'settings'])?.toJS()
        if not base_values?
            return
        misc.coerce_codomain_to_numbers(base_values)
        upgrades = @get_total_project_upgrades(project_id)
        return misc.map_sum(base_values, upgrades)

    # Return javascript mapping from project_id's to the upgrades for the given projects.
    # Only includes projects with at least one upgrade
    get_upgraded_projects: =>
        if not @get('project_map')?
            return
        v = {}
        @get('project_map').map (project, project_id) =>
            upgrades = @get_upgrades_to_project(project_id)
            if misc.len(upgrades)
                v[project_id] = upgrades
        return v

    # Return javascript mapping from project_id's to the upgrades the user with the given account_id
    # applied to projects.  Only includes projects that they upgraded that you are a collaborator on.
    get_projects_upgraded_by: (account_id) =>
        if not @get('project_map')?
            return
        account_id ?= salvus_client.account_id
        v = {}
        @get('project_map').map (project, project_id) =>
            upgrades = @getIn(['project_map', project_id, 'users', account_id, 'upgrades'])?.toJS()
            if misc.len(upgrades)
                v[project_id] = upgrades
        return v

init_store =
    project_map   : undefined        # when loaded will be an immutable.js map that is synchronized with the database
    project_state : immutable.Map()  # information about state of projects in the browser
    public_project_titles : immutable.Map()

store = redux.createStore('projects', ProjectsStore, init_store)

# Create and register projects table, which gets automatically
# synchronized with the server.
class ProjectsTable extends Table
    query : ->
        return 'projects'

    _change : (table, keys) =>
        actions.setState(project_map: table.get())

redux.createTable('projects', ProjectsTable)

exports.open_project = open_project = (opts) ->
    opts = defaults opts,
        project_id : required
        item       : undefined
        target     : undefined
        switch_to  : true
        cb         : undefined   # cb(err, project)

    require.ensure [], ->
        {project_page}  = require('./project')
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
        redux.getActions('projects').open_project
            project_id: project_id
            target    : t
            switch_to : switch_to

NewProjectCreator = rclass
    displayName : 'Projects-NewProjectCreator'

    propTypes :
        nb_projects : rtypes.number.isRequired
        customer    : rtypes.object
        upgrades_you_can_use                 : rtypes.object
        upgrades_you_applied_to_all_projects : rtypes.object
        quota_params                         : rtypes.object.isRequired # from the schema
        actions                              : rtypes.object.isRequired # projects actions

    getDefaultProps : ->
        upgrades_you_can_use                 : {}
        upgrades_you_applied_to_all_projects : {}
        upgrades_you_applied_to_this_project : {}

    getInitialState : ->
        state =
            upgrading : true
            has_subbed       : false
            state            : 'view'    # view --> edit --> saving --> view
            title_text       : ''
            description_text : ''
            error            : ''
            
    getInitialUpgraderState : ->
        state =
            upgrading : true
            
        current = @props.upgrades_you_applied_to_this_project
        
        # how much upgrade you have used between all projects
        used_upgrades = @props.upgrades_you_applied_to_all_projects
        
        # how much unused upgrade you have remaining
        remaining = misc.map_diff(@props.upgrades_you_can_use, used_upgrades)

        # maximums you can use, including the upgrades already on this project
        limits = misc.map_sum(current, remaining)
        
        for name, data of @props.quota_params
            factor = data.display_factor
            if name == 'network' or name == 'member_host'
                limit = if limits[name] > 0 then 1 else 0
                current_value = current[name] ? limit
            else
                current_value = current[name] ? limits[name]
            state["upgrade_#{name}"] = misc.round2(current_value * factor)
            upgrades = {}
        
        return state

    show_upgrade_quotas : ->
        @setState(upgrading : true)

    cancel_upgrading : ->
        state =
            upgrading : false

        current = @props.upgrades_you_applied_to_this_project

        for name, data of @props.quota_params
            factor = data.display_factor
            current_value = current[name] ? 0
            state["upgrade_#{name}"] = misc.round2(current_value * factor)

        @setState(state)

    is_upgrade_input_valid : (input, max) ->
        val = misc.parse_number_input(input, round_number=false)
        if not val? or val > Math.max(0, max)
            return false
        else
            return true

    # the max button will set the upgrade input box to the number given as max
    render_max_button : (name, max) ->
        <Button
            bsSize  = 'xsmall'
            onClick = {=>@setState("upgrade_#{name}" : max)}
            style   = {padding:'0px 5px'}
        >
            Max
        </Button>
        
    render_upgrade_row : (name, data, remaining=0, current=0, limit=0) ->
        if not data?
            return

        {display, desc, display_factor, display_unit, input_type} = data

        if input_type == 'checkbox'

            # the remaining count should decrease if box is checked
            show_remaining = remaining + current - @state["upgrade_#{name}"]
            show_remaining = Math.max(show_remaining, 0)

            val = @state["upgrade_#{name}"]

            if not @is_upgrade_input_valid(val, limit)
                label = <div style=UPGRADE_ERROR_STYLE>Uncheck this: you do not have enough upgrades</div>
            else
                label = if val == 0 then 'Enable' else 'Enabled'

            <Row key={name}>
                <Col sm=6>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong><Space/>
                    </Tip>
                    ({show_remaining} {misc.plural(show_remaining, display_unit)} remaining)
                </Col>
                <Col sm=6>
                    <form>
                        <Input
                            ref      = {"upgrade_#{name}"}
                            type     = 'checkbox'
                            checked  = {val > 0}
                            label    = {label}
                            onChange = {=>@setState("upgrade_#{name}" : if @refs["upgrade_#{name}"].getChecked() then 1 else 0)}
                            />
                    </form>
                </Col>
            </Row>


        else if input_type == 'number'
            remaining = misc.round2(remaining * display_factor)
            display_current = current * display_factor # current already applied
            if current != 0 and misc.round2(display_current) != 0
                current = misc.round2(display_current)
            else
                current = display_current

            limit = misc.round2(limit * display_factor)
            current_input = misc.parse_number_input(@state["upgrade_#{name}"]) ? 0 # current typed in

            # the amount displayed remaining subtracts off the amount you type in
            show_remaining = misc.round2(remaining + current - current_input)

            val = @state["upgrade_#{name}"]
            if not @is_upgrade_input_valid(val, limit)
                bs_style = 'error'
                if misc.parse_number_input(val)?
                    label = <div style=UPGRADE_ERROR_STYLE>Reduce the above: you do not have enough upgrades</div>
                else
                    label = <div style=UPGRADE_ERROR_STYLE>Please enter a number</div>
            else
                label = <span></span>

            <Row key={name}>
                <Col sm=6>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong><Space/>
                    </Tip>
                    ({Math.max(show_remaining, 0)} {misc.plural(show_remaining, display_unit)} remaining)
                </Col>
                <Col sm=6>
                    <Input
                        ref        = {"upgrade_#{name}"}
                        type       = 'text'
                        value      = {val}
                        bsStyle    = {bs_style}
                        onChange   = {=>@setState("upgrade_#{name}" : @refs["upgrade_#{name}"].getValue())}
                        
                    />
                    {label}
                </Col>
            </Row>
        else
            console.warn('Invalid input type in render_upgrade_row: ', input_type)
            return

    # Returns true if the inputs are valid and different:
    #    - at least one has changed
    #    - none are negative
    #    - none are empty
    #    - none are higher than their limit
    valid_changed_upgrade_inputs : (current, limits) ->
        for name, data of @props.quota_params
            factor = data.display_factor

            # the highest number the user is allowed to type
            limit = Math.max(0, misc.round2((limits[name] ? 0) * factor))  # max since 0 is always allowed

            # the current amount applied to the project
            cur_val = misc.round2((current[name] ? 0) * factor)

            # the current number the user has typed (undefined if invalid)
            new_val = misc.parse_number_input(@state["upgrade_#{name}"])
            if not new_val? or new_val > limit
                return false
            if cur_val isnt new_val
                changed = true
        return changed

    render_upgrades_adjustor : ->
        if misc.is_zero_map(@props.upgrades_you_can_use)
            # user has no upgrades on their account
            <NoUpgrades cancel={@cancel_upgrading} />
        else
            # NOTE : all units are currently 'internal' instead of display, e.g. seconds instead of hours

            # how much upgrade you have used between all projects
            used_upgrades = @props.upgrades_you_applied_to_all_projects

            # how much upgrade you currently use on this one project
            current = @props.upgrades_you_applied_to_this_project

            # how much unused upgrade you have remaining
            remaining = misc.map_diff(@props.upgrades_you_can_use, used_upgrades)

            # maximums you can use, including the upgrades already on this project
            limits = misc.map_sum(current, remaining)

            <Alert bsStyle='info'>
                <h3><Icon name='arrow-circle-up' /> Adjust your project quota contributions</h3>

                <span style={color:"#666"}>Adjust <i>your</i> contributions to the quotas on this project (disk space, memory, cores, etc.).  The total quotas for this project are the sum of the contributions of all collaborators and the free base quotas.</span>
                <hr/>
                <Row>
                    <Col md=6>
                        <b style={fontSize:'12pt'}>Quota</b>
                    </Col>
                    <Col md=6>
                        <b style={fontSize:'12pt'}>Your contribution</b>
                    </Col>
                </Row>
                <hr/>

                {@render_upgrade_row(n, data, remaining[n], current[n], limits[n]) for n, data of @props.quota_params}
            </Alert>

    render_upgrades_button : ->
        <Row>
            <Col sm=12>
                <Button bsStyle='primary' onClick={@show_upgrade_quotas} style={float: 'right', marginBottom : '5px'}>
                    <Icon name='arrow-circle-up' /> Adjust your quotas...
                </Button>
            </Col>
        </Row>

    start_editing : ->
        redux.getActions('billing')?.update_customer()
        @setState
            state           : 'edit'
            title_text      : ''
            description_text: ''

    cancel_editing : ->
        @setState
            state            : 'view'
            title_text       : ''
            description_text : ''
            error            : ''

    toggle_editing: ->
        if @state.state == 'view'
            @start_editing()
        else
            @cancel_editing()

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
                @cancel_editing()

    save_upgrade_quotas : (project_id) ->
        # how much upgrade you have used between all projects
        used_upgrades = redux.getStore('projects').get_total_upgrades_you_have_applied()

        # how much unused upgrade you have remaining
        remaining = misc.map_diff(redux.getStore('account').get_total_upgrades(), used_upgrades)
        new_upgrade_quotas = {}
        new_upgrade_state  = {}
        for name, data of require('smc-util/schema').PROJECT_UPGRADES.params
            factor = data.display_factor
            remaining_val = Math.max(misc.round2((remaining[name] ? 0) * factor), 0) # everything is now in display units
            if data.input_type is 'checkbox'
                input = @state["upgrade_#{name}"] ? 0
                if input and (remaining_val > 0)
                    val = 1
                else
                    val = 0

            else
                # parse the current user input, and default to the current value if it is (somehow) invalid
                input = misc.parse_number_input(@state["upgrade_#{name}"]) ? 0
                input = Math.max(input, 0)
                limit = remaining_val
                val = Math.min(input, limit)

            new_upgrade_state["upgrade_#{name}"] = val
            new_upgrade_quotas[name] = misc.round2(val / factor) # only now go back to internal units
        actions.apply_upgrades_to_project(project_id, new_upgrade_quotas)

        # set the state so that the numbers are right if you click upgrade again
        @setState(new_upgrade_state)
        @setState(upgrading : false)

    create_project_with_upgrades : ->
        token = misc.uuid()
        @setState(state:'saving')
        actions.create_project_with_upgrades
            title       : @state.title_text
            description : @state.description_text
            token       : token
        store.wait_until_project_with_upgrades_created token, 30, (err, project_id) =>
            if err?
                @setState
                    state : 'edit'
                    error : "Error creating project -- #{err}"
            else
                @save_upgrade_quotas(project_id)
                @cancel_editing()
                open_project(project_id:project_id)

    handle_keypress : (e) ->
        if e.keyCode == 13 and @state.title_text != ''
            @create_project()

    render_upgrade_before_create : ->
        subs = @props.customer?.subscriptions?.total_count ? 0
        console.log(subs)
        if subs > 0 and not @state["has_subbed"]
            @setState(@getInitialUpgraderState())
            @setState(has_subbed: true)
        <Col sm=12>
            <h3>Upgrade to give your project internet access and more resources</h3>
            <p>To prevent abuse the free version doesn't have internet access. 
            Installing software from the internet, using Github/Bitbucket/Gitlab/etc, and/or 
            any other internet resources
            is not possible with the free version.
            Starting at just $7/month you can give your project(s)
            internet access, members only hosting, 1 day Idle timeout,
            3 GB Memory, 5 GB Disk space, and half CPU share. You can share upgrades
            with any project you are a collaborator on.</p>
            <div>
                <BillingPageSimplifiedRedux redux={redux} />
                {@render_upgrades_adjustor() if subs > 0}
            </div>
        </Col>

    render_input_section : ->
        <Well style={backgroundColor: '#FFF', color:'#666'}>
            <Row>
                <Col sm=5>
                    <h4>Title</h4>
                    <Input
                        ref         = 'new_project_title'
                        type        = 'text'
                        placeholder = 'Title'
                        disabled    = {@state.state == 'saving'}
                        value       = {@state.title_text}
                        onChange    = {=>@setState(title_text:@refs.new_project_title.getValue())}
                        onKeyDown   = {@handle_keypress}
                        autoFocus   />
                </Col>

                <Col sm=7>
                    <h4>Description</h4>
                    <Input
                        ref         = 'new_project_description'
                        type        = 'text'
                        placeholder = 'Project description'
                        disabled    = {@state.state == 'saving'}
                        value       = {@state.description_text}
                        onChange    = {=>@setState(description_text:@refs.new_project_description.getValue())}
                        onKeyDown   = {@handle_keypress} />
                </Col>

                <Col sm=2>
                    {# potentially add users before creating a project?}
                </Col>
            </Row>

            <Row>
                <Col sm=5>
                    <ButtonToolbar>
                        <Button
                            disabled = {@state.title_text == '' or @state.state == 'saving'}
                            bsStyle  = 'success'
                            onClick  = {@create_project} >
                            Create project without upgrades
                        </Button>
                        <Button
                            disabled = {@state.state is 'saving'}
                            onClick  = {@cancel_editing} >
                            {if @state.state is 'saving' then <Saving /> else 'Cancel'}
                        </Button>
                    </ButtonToolbar>
                    {@render_error()}
                </Col>
                <Col sm=7>
                    <div style={marginBottom: '12px'}>You can <b>very easily</b> change the title and description at any time later.</div>
                </Col>
            </Row>
            <Space/>
            <Row>
                <Col sm=12 style={color:'#555'}>
                    <div>
                        A <b>project</b> is your own private computational workspace that you can
                        share with others and <a target="_blank" href=PolicyPricingPageUrl>upgrade</a>.
                    </div>
                </Col>
            </Row>
            <Row>
                {@render_upgrade_before_create()}
            </Row>
            <Row>
                <Col sm=5>
                    <ButtonToolbar>
                        <Button
                            disabled = {@state.title_text == '' or @state.state == 'saving'}
                            bsStyle  = 'success'
                            onClick  = {@create_project_with_upgrades} >
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
        new_proj_btn =  <Col sm=4>
                            <Button
                                bsStyle  = 'success'
                                active   = {@state.state != 'view'}
                                disabled = {@state.state != 'view'}
                                block
                                type     = 'submit'
                                onClick  = {@toggle_editing}>
                                <Icon name='plus-circle' /> Create new project...
                            </Button>
                        </Col>

        new_proj_dialog = <Col sm=12>
                            <Space/>
                            {@render_input_section()}
                          </Col>

        <Row>
            {new_proj_btn}
            {if @state.state != 'view' then new_proj_dialog}
        </Row>

ProjectsFilterButtons = rclass
    displayName : 'ProjectsFilterButtons'

    propTypes :
        hidden              : rtypes.bool.isRequired
        deleted             : rtypes.bool.isRequired
        show_hidden_button  : rtypes.bool
        show_deleted_button : rtypes.bool

    getDefaultProps : ->
        hidden  : false
        deleted : false
        show_hidden_button : false
        show_deleted_button : false

    render_deleted_button : ->
        style = if @props.deleted then 'warning' else "default"
        if @props.show_deleted_button
            <Button onClick={=>redux.getActions('projects').setState(deleted: not @props.deleted)} bsStyle={style}>
                <Icon name={if @props.deleted then 'check-square-o' else 'square-o'} fixedWidth /> Deleted
            </Button>
        else
            return null

    render_hidden_button : ->
        style = if @props.hidden then 'warning' else "default"
        if @props.show_hidden_button
            <Button onClick = {=>redux.getActions('projects').setState(hidden: not @props.hidden)} bsStyle={style}>
                <Icon name={if @props.hidden then 'check-square-o' else 'square-o'} fixedWidth /> Hidden
            </Button>

    render : ->
        <ButtonGroup>
            {@render_deleted_button()}
            {@render_hidden_button()}
        </ButtonGroup>

ProjectsSearch = rclass
    displayName : 'Projects-ProjectsSearch'

    propTypes :
        search : rtypes.string.isRequired

    getDefaultProps : ->
        search             : ''
        open_first_project : undefined

    clear_and_focus_input : ->
        redux.getActions('projects').setState(search: '')
        @refs.projects_search.getInputDOMNode().focus()

    delete_search_button : ->
        s = if @props.search?.length > 0 then 'warning' else "default"
        <Button onClick={@clear_and_focus_input} bsStyle={s}>
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
                onChange    = {=>redux.getActions('projects').setState(search: @refs.projects_search.getValue())}
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
        deleted             : rtypes.bool
        hidden              : rtypes.bool
        selected_hashtags   : rtypes.object
        search              : rtypes.string
        nb_projects         : rtypes.number.isRequired
        nb_projects_visible : rtypes.number.isRequired

    getDefaultProps : ->
        deleted           : false
        hidden            : false
        selected_hashtags : {}
        search            : ''

    render_header : ->
        if @props.nb_projects > 0 and (@props.hidden or @props.deleted)
            d = if @props.deleted then 'deleted ' else ''
            h = if @props.hidden then 'hidden ' else ''
            a = if @props.hidden and @props.deleted then ' and ' else ''
            n = @props.nb_projects_visible
            desc = "Only showing #{n} #{d}#{a}#{h} #{misc.plural(n, 'project')}"
            <h3 style={color:'#666', wordWrap:'break-word'}>{desc}</h3>

    render_alert_message : ->
        query = @props.search.toLowerCase()
        hashtags_string = (name for name of @props.selected_hashtags).join(' ')
        if query != '' and hashtags_string != '' then query += ' '
        query += hashtags_string

        if query isnt '' or @props.deleted or @props.hidden
            <Alert bsStyle='warning'>
                Only showing<Space/>
                <strong>{"#{if @props.deleted then 'deleted ' else ''}#{if @props.hidden then 'hidden ' else ''}"}</strong>
                projects<Space/>
                {if query isnt '' then <span>whose title, description or users contain <strong>{query}</strong></span>}
            </Alert>

    render : ->
        <div>
            <Space/>
            {@render_header()}
            {@render_alert_message()}
        </div>

ProjectRow = rclass
    displayName : 'Projects-ProjectRow'

    propTypes :
        project : rtypes.object.isRequired
        index   : rtypes.number
        redux   : rtypes.object

    getDefaultProps : ->
        user_map : undefined

    render_status : ->
        state = @props.project.state?.state
        if state?
            <span style={color: '#666'}>
                <ProjectState state={state} />
            </span>

    render_last_edited : ->
        try
            <TimeAgo date={(new Date(@props.project.last_edited)).toISOString()} />
        catch e
            console.log("error setting time of project #{@props.project.project_id} to #{@props.project.last_edited} -- #{e}; please report to wstein@gmail.com")

    render_user_list : ->
        other = ({account_id:account_id} for account_id,_ of @props.project.users)
        @props.redux.getStore('projects').sort_by_activity(other, @props.project.project_id)
        users = []
        for i in [0...other.length]
            users.push <User
                           key         = {other[i].account_id}
                           last_active = {other[i].last_active}
                           account_id  = {other[i].account_id}
                           user_map    = {@props.user_map} />
        return r_join(users)

    open_project_from_list : (e) ->
        @props.redux.getActions('projects').open_project
            project_id : @props.project.project_id
            switch_to  : not(e.which == 2 or (e.ctrlKey or e.metaKey))
        e.preventDefault()

    open_edit_collaborator : (e) ->
        @props.redux.getActions('projects').open_project
            project_id : @props.project.project_id
            switch_to  : not(e.which == 2 or (e.ctrlKey or e.metaKey))
            target     : 'settings'
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
        projects    : rtypes.array.isRequired
        show_all    : rtypes.bool.isRequired
        redux       : rtypes.object

    getDefaultProps : ->
        projects : []
        user_map : undefined

    show_all_projects : ->
        redux.getActions('projects').setState(show_all : not @props.show_all)

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
                             redux    = {@props.redux} />
            i += 1

        return listing

    render : ->
        if @props.nb_projects == 0
            <Alert bsStyle='info'>
                You have not created any projects yet.
                Click on "Create a new project" above to start working with <SiteName/>!
            </Alert>
        else
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
            info = user_map?.get(account_id)
            if info?
                search += (' ' + info.get('first_name') + ' ' + info.get('last_name') + ' ').toLowerCase()
    return search

# Returns true if the project should be visible with the given filters selected
project_is_in_filter = (project, hidden, deleted) ->
    account_id = salvus_client.account_id
    if not account_id?
        throw Error('project page should not get rendered until after user sign-in and account info is set')
    return !!project.deleted == deleted and !!project.users?[account_id]?.hide == hidden

ProjectSelector = rclass
    displayName : 'Projects-ProjectSelector'

    reduxProps :
        users :
            user_map : rtypes.immutable
        projects :
            project_map       : rtypes.immutable
            hidden            : rtypes.bool
            deleted           : rtypes.bool
            search            : rtypes.string
            selected_hashtags : rtypes.object
            show_all          : rtypes.bool
        billing :
            customer      : rtypes.object

    propTypes :
        redux             : rtypes.object

    getDefaultProps : ->
        project_map       : undefined
        user_map          : undefined
        hidden            : false
        deleted           : false
        search            : ''
        selected_hashtags : {}
        show_all          : false

    componentWillReceiveProps : (next) ->
        if not @props.project_map?
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
                if not immutable.is(user_map?.get(account_id), next_user_map?.get(account_id))
                    @_compute_project_derived_data(project, next_user_map)
                    break

    update_project_list : (project_map, next_project_map, user_map) ->
        user_map ?= @props.user_map   # if user_map is not defined, use last known one.
        if not project_map?
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
        @props.redux.getActions('projects').setState(selected_hashtags: selected_hashtags)

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
            open_project(project_id: project.project_id)
    ###
    # Consolidate the next two functions.
    ###

    # Returns true if the user has any hidden projects
    has_hidden_projects : ->
        for project in @project_list()
            if project_is_in_filter(project, true, false) or project_is_in_filter(project, true, true)
                return true
        return false


    # Returns true if this project has any deleted files
    has_deleted_projects : ->
        for project in @project_list()
            if project_is_in_filter(project, false, true) or project_is_in_filter(project, true, true)
                return true
        return false

    render : ->
        if not @props.project_map?
            if @props.redux.getStore('account')?.get_user_type() == 'public'
                return <LoginLink />
            else
                return <div style={fontSize:'40px', textAlign:'center', color:'#999999'} > <Loading />  </div>

        visible_projects = @visible_projects()
        <div>
        <Grid fluid className='constrained' style={minHeight:"75vh"}>
            <Well style={marginTop:'1em',overflow:'hidden'}>
                <Row>
                    <Col sm=4>
                        {@render_projects_title()}
                    </Col>
                    <Col sm=8>
                        <ProjectsFilterButtons
                            hidden  = {@props.hidden}
                            deleted = {@props.deleted}
                            show_hidden_button = {@has_hidden_projects() or @props.hidden}
                            show_deleted_button = {@has_deleted_projects() or @props.deleted} />
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
                        <NewProjectCreator
                            nb_projects = {@project_list().length}
                            customer    = {@props.customer}
                            upgrades_you_can_use                 = {redux.getStore('account').get_total_upgrades()}
                            upgrades_you_applied_to_all_projects = {redux.getStore('projects').get_total_upgrades_you_have_applied()}
                            quota_params                         = {require('smc-util/schema').PROJECT_UPGRADES.params}
                            actions                              = {redux.getActions('projects')} />
                    </Col>
                </Row>
                <Row>
                    <Col sm=12>
                        <ProjectsListingDescription
                            nb_projects         = {@project_list().length}
                            nb_projects_visible = {visible_projects.length}
                            hidden              = {@props.hidden}
                            deleted             = {@props.deleted}
                            search              = {@props.search}
                            selected_hashtags   = {@props.selected_hashtags[@filter()]} />
                    </Col>
                </Row>
                <Row>
                    <Col sm=12>
                        <ProjectList
                            projects    = {visible_projects}
                            show_all    = {@props.show_all}
                            user_map    = {@props.user_map}
                            redux       = {@props.redux} />
                    </Col>
                </Row>
            </Well>
        </Grid>
        <Footer/>
        </div>

ProjectsPage = rclass
    displayName : 'Projects-ProjectsPage'

    render : ->
        <Redux redux={redux}>
            <ProjectSelector redux={redux} />
        </Redux>

exports.ProjectTitle = ProjectTitle = rclass
    displayName : 'Projects-ProjectTitle'

    reduxProps :
        projects :
            project_map  : rtypes.immutable

    propTypes :
        project_id   : rtypes.string.isRequired
        handle_click : rtypes.func

    shouldComponentUpdate : (nextProps) ->
        nextProps.project_map?.get(@props.project_id)?.get('title') != @props.project_map?.get(@props.project_id)?.get('title')

    render : ->
        if not @props.project_map?
            return <Loading />
        title = @props.project_map?.get(@props.project_id)?.get('title')
        if title?
            <a onClick={@props.handle_click} href=''>{html_to_text(title)}</a>
        else
            <span>(Private project)</span>

exports.ProjectTitleAuto = rclass
    displayName : 'Projects-ProjectTitleAuto'

    propTypes :
        project_id  : rtypes.string.isRequired

    render : ->
        <Redux redux={redux}>
            <ProjectTitle project_id={@props.project_id} />
        </Redux>

is_mounted = false
mount = ->
    if not is_mounted
        #console.log('mount projects')
        ReactDOM.render(<ProjectsPage />, document.getElementById('projects'))
        is_mounted = true

unmount = ->
    if is_mounted
        ReactDOM.unmountComponentAtNode(document.getElementById('projects'))
        is_mounted = false

top_navbar.on 'switch_to_page-projects', () ->
    window.history.pushState('', '', window.smc_base_url + '/projects')
    mount()

top_navbar.on 'switch_from_page-projects', () ->
    setTimeout(unmount,50)

