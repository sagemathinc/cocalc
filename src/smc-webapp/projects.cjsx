#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

$          = window.$
immutable  = require('immutable')
underscore = require('underscore')
json_stable = require("json-stable-stringify")

{COCALC_MINIMAL} = require('./fullscreen')

{analytics_event} = require('./tracker')
{webapp_client} = require('./webapp_client')
{alert_message} = require('./alerts')
{once, callback2} = require('smc-util/async-utils')
{callback} = require('awaiting')

misc = require('smc-util/misc')
{required, defaults} = misc
{SiteName, PolicyPricingPageUrl} = require('./customize')

markdown = require('./markdown')

{Row, Col, Well, Button, ButtonGroup, ButtonToolbar, Grid, FormControl, FormGroup, InputGroup, Alert, Checkbox, Label} = require('react-bootstrap')
{VisibleMDLG, ErrorDisplay, Icon, Loading, LoginLink, Saving, Space , TimeAgo, Tip, UPGRADE_ERROR_STYLE, UpgradeAdjustor, A} = require('./r_misc')
{React, ReactDOM, Actions, Store, Table, redux, rtypes, rclass, Redux}  = require('./app-framework')
{UsersViewing} = require('./account/avatar/users-viewing')
{PROJECT_UPGRADES} = require('smc-util/schema')
{fromPairs} = require('lodash')
ZERO_QUOTAS = fromPairs(Object.keys(PROJECT_UPGRADES.params).map(((x) -> [x, 0])))
{DISCORD_INVITE} = require('smc-util/theme')

{ reuseInFlight } = require("async-await-utils/hof")

{UpgradeStatus} = require('./upgrades/status')

{has_internet_access} = require('./upgrades/upgrade-utils')

###
TODO:  This entire file should be broken into many small files/components,
which are in the projects/ subdirectory.
###
{NewProjectCreator} = require('./projects/create-project')
{ProjectRow}        = require('./projects/project-row')
{ProjectsFilterButtons} = require('./projects/projects-filter-buttons')

require('./projects/store')
store = redux.getStore('projects')


# Define projects actions
class ProjectsActions extends Actions
    # **THIS IS AN ASYNC FUNCTION!**
    projects_table_set: (obj, merge='deep') =>
        the_table = @redux.getTable('projects')
        if not the_table?  # silently fail???
            return
        await the_table.set(obj, merge)

    # Set whether the "add collaborators" component is displayed
    # for the given project in the project listing.
    set_add_collab: (project_id, enabled) =>
        add_collab = store.get('add_collab') ? immutable.Set()
        if enabled
            add_collab = add_collab.add(project_id)
        else
            add_collab = add_collab.delete(project_id)
        @setState(add_collab:add_collab)

    set_project_open: (project_id, err) =>
        x = store.get('open_projects')
        index = x.indexOf(project_id)
        if index == -1
            @setState(open_projects : x.push(project_id))

    # Do not call this directly to close a project.  Instead call
    #   redux.getActions('page').close_project_tab(project_id),
    # which calls this.
    set_project_closed: (project_id) =>
        x = store.get('open_projects')
        index = x.indexOf(project_id)
        if index != -1
            redux.removeProjectReferences(project_id)
            @setState(open_projects : x.delete(index))

    # Save all open files in all projects to disk
    save_all_files: () =>
        store.get('open_projects').filter (project_id) =>
            @redux.getProjectActions(project_id).save_all_files()
        return

    # Returns true only if we are a collaborator/user of this project and have loaded it.
    # Should check this before changing anything in the projects table!  Otherwise, bad
    # things will happen.
    # This may also trigger load_all_projects.
    # **THIS IS AN ASYNC FUNCTION!**
    have_project: (project_id) =>
        t = @redux.getTable('projects')?._table
        if not t? # called before initialization... -- shouldn't ever happen
            return false
        if t.get_state() != 'connected'
            # table isn't ready to be used yet -- wait for it.
            await once(t, 'connected')
        # now t is ready and we can query it.
        if t.get(project_id)?
            # we know this project
            return true
        if store.get('load_all_projects_done')
            return false
        # be sure by first loading all projects
        await @load_all_projects()
        # and try again.  Because we loaded all projects, we won't hit infinite recurse.
        return await @have_project(project_id)

    # **THIS IS AN ASYNC FUNCTION!**
    set_project_title: (project_id, title) =>
        if not await @have_project(project_id)
            console.warn("Can't set title -- you are not a collaborator on project '#{project_id}'.")
            return
        if store.get_title(project_id) == title
            # title is already set as requested; nothing to do
            return
        # set in the Table
        await @projects_table_set({project_id:project_id, title:title})
        # create entry in the project's log
        await @redux.getProjectActions(project_id).async_log
            event : 'set'
            title : title

    # **THIS IS AN ASYNC FUNCTION!**
    set_project_description: (project_id, description) =>
        if not await @have_project(project_id)
            console.warn("Can't set description -- you are not a collaborator on project '#{project_id}'.")
            return
        if store.get_description(project_id) == description
            # description is already set as requested; nothing to do
            return
        # set in the Table
        await @projects_table_set({project_id:project_id, description:description})
        # create entry in the project's log
        await @redux.getProjectActions(project_id).async_log
            event       : 'set'
            description : description

    add_ssh_key_to_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            fingerprint : required
            title       : required
            value       : required
        @projects_table_set
            project_id : opts.project_id
            users      :
                "#{@redux.getStore('account').get_account_id()}" :
                    ssh_keys:
                        "#{opts.fingerprint}":
                            title         : opts.title
                            value         : opts.value
                            creation_date : new Date() - 0

    delete_ssh_key_from_project: (opts) =>
        opts = defaults opts,
            project_id  : required
            fingerprint : required
        @projects_table_set
            project_id : opts.project_id
            users      :
                "#{@redux.getStore('account').get_account_id()}" :
                    ssh_keys:
                        "#{opts.fingerprint}": null

    # Apply default upgrades -- if available -- to the given project.
    # Right now this means upgrading to member hosting and enabling
    # network access.  Later this could mean something else, or be
    # configurable by the user.
    # **THIS IS AN ASYNC FUNCTION!**
    apply_default_upgrades: (opts) =>
        opts = defaults opts,
            project_id : required
        # WARNING/TODO: This may be invalid if redux.getActions('billing')?.update_customer() has
        # not been recently called. There's no big *harm* if it is out of date (since quotas will
        # just get removed when the project is started), but it could be mildly confusing.
        total = redux.getStore('account').get_total_upgrades()
        applied = store.get_total_upgrades_you_have_applied()
        to_upgrade = {}
        for quota in ['member_host', 'network']
            avail = (total[quota] ? 0) - (applied[quota] ? 0)
            if avail > 0
                to_upgrade[quota] = 1
        if misc.len(to_upgrade) > 0
            await @apply_upgrades_to_project(opts.project_id, to_upgrade)

    ###
    # See comment in db-schema.ts about projects_owner table.
    # only owner can set course description.
    # **THIS IS AN ASYNC FUNCTION!**
    set_project_course_info: (project_id, course_project_id, path, pay, account_id, email_address) =>
        if not await @have_project(project_id)
            msg = "Can't set course info -- you are not a collaborator on project '#{project_id}'."
            console.warn(msg)
            return
        course_info = store.get_course_info(project_id)?.toJS()
        if course_info? and course_info.project_id == course_project_id and course_info.path == path and misc.cmp_Date(course_info.pay, pay) == 0 and course_info.account_id == account_id and course_info.email_address == email_address
            # already set as required; do nothing
            return

        # Set in the database (will get reflected in table); setting directly in the table isn't allowed (due to backend schema).
        await callback2(webapp_client.query,
            query :
                projects_owner :
                    project_id : project_id
                    course     :
                        project_id    : course_project_id
                        path          : path
                        pay           : pay
                        account_id    : account_id
                        email_address : email_address)
    ###

    set_project_course_info: (project_id, course_project_id, path, pay, account_id, email_address) =>
        if not await @have_project(project_id)
            msg = "Can't set course info -- you are not a collaborator on project '#{project_id}'."
            console.warn(msg)
            return
        course_info = store.get_course_info(project_id)?.toJS()
        # pay is either a Date or the string "".
        course =
            project_id    : course_project_id
            path          : path
            pay           : pay
            account_id    : account_id
            email_address : email_address
        # json_stable -- I'm tired and this needs to just work for comparing.
        if json_stable(course_info) == json_stable(course)
            # already set as required; do nothing
            return
        await @projects_table_set({project_id, course})


    # Create a new project
    # **THIS IS AN ASYNC FUNCTION!**
    create_project: (opts) =>     # returns Promise<string>
        opts = defaults opts,
            title       : 'No Title'
            description : 'No Description'
            image       : undefined  # if given, sets the compute image (the ID string)
            start       : false      # immediately start on create
            token       : undefined  # if given, can use wait_until_project_created
        if opts.token?
            token = opts.token
            delete opts.token
        else
            token = false
        try
            project_id = await webapp_client.project_client.create(opts)
            if token
                _create_project_tokens[token] = {project_id:project_id}
        catch err
            if token
                _create_project_tokens[token] = {err:err}
            else
                throw err

        # At this point we know the project_id and that the project exists.
        # However, various code (e.g., setting the title) depends on the
        # project_map also having the project in it, which requires some
        # changefeeds to fire off and get handled.  So we wait for that.

        store = @redux.getStore('projects')
        while not store.getIn(['project_map', project_id])
            await once(store, 'change')
        return project_id


    # Open the given project
    # This is an ASYNC function, sort of...
    # at least in that it might have to load all projects...
    open_project: (opts) =>
        opts = defaults opts,
            project_id      : required  # string  id of the project to open
            target          : undefined # string  The file path to open
            anchor          : undefined # string  if given, an anchor tag in the editor that is opened.
            switch_to       : true      # bool    Whether or not to foreground it
            ignore_kiosk    : false     # bool    Ignore ?fullscreen=kiosk
            change_history  : true      # bool    Whether or not to alter browser history
            restore_session : true      # bool    Opens up previously closed editor tabs

        if not store.getIn(['project_map', opts.project_id])
            if COCALC_MINIMAL
                await switch_to_project(opts.project_id)
            else
                # trying to open a nogt-known project -- maybe
                # we have not yet loaded the full project list?
                await @load_all_projects()
        project_store = redux.getProjectStore(opts.project_id)
        project_actions = redux.getProjectActions(opts.project_id)
        relation = redux.getStore('projects').get_my_group(opts.project_id)
        if not relation? or relation in ['public', 'admin']
            @fetch_public_project_title(opts.project_id)
        project_actions.fetch_directory_listing()
        redux.getActions('page').set_active_tab(opts.project_id, opts.change_history) if opts.switch_to
        @set_project_open(opts.project_id)
        if opts.target?
            redux.getProjectActions(opts.project_id)?.load_target(opts.target, opts.switch_to, opts.ignore_kiosk, opts.change_history, opts.anchor)
        if opts.restore_session
            redux.getActions('page').restore_session(opts.project_id)
        # initialize project
        project_actions.init()

    # Clearly should be in top.cjsx
    # tab at old_index taken out and then inserted into the resulting array's new index
    move_project_tab: (opts) =>
        {old_index, new_index, open_projects} = defaults opts,
            old_index : required
            new_index : required
            open_projects: required # immutable

        x = open_projects
        item = x.get(old_index)
        temp_list = x.delete(old_index)
        new_list = temp_list.splice(new_index, 0, item)
        @setState(open_projects:new_list)
        redux.getActions('page').save_session()

    # should not be in projects...?
    load_target: (target, switch_to, ignore_kiosk=false, change_history=true, anchor=undefined) =>
        #if DEBUG then console.log("projects actions/load_target: #{target}")
        if not target or target.length == 0
            redux.getActions('page').set_active_tab('projects')
            return
        segments = target.split('/')
        if misc.is_valid_uuid_string(segments[0])
            t = segments.slice(1).join('/')
            project_id = segments[0]
            @open_project
                project_id     : project_id
                target         : t
                anchor         : anchor
                switch_to      : switch_to
                ignore_kiosk   : ignore_kiosk
                change_history : change_history
                restore_session: false

    # Put the given project in the foreground
    foreground_project: (project_id, change_history=true) =>
        redux.getActions('page').set_active_tab(project_id, change_history)

        redux.getStore('projects').wait # the database often isn't loaded at this moment (right when user refreshes)
            until : (store) => store.get_title(project_id)
            cb    : (err, title) =>
                if not err
                    require('./browser').set_window_title(title)  # change title bar

    # Given the id of a public project, make it so that sometime
    # in the future the projects store knows the corresponding title,
    # (at least what it is right now).  For convenience this works
    # even if the project isn't public if the user is an admin, and also
    # works on projects the user owns or collaborats on.
    fetch_public_project_title: (project_id) =>
        @redux.getStore('projects').wait
            until   : (s) => s.get_my_group(@project_id)
            timeout : 60
            cb      : (err, group) =>
                if err
                    group = 'public'
                switch group
                    when 'admin'
                        table = 'projects_admin'
                    when 'owner', 'collaborator'
                        table = 'projects'
                    else
                        table = 'public_projects'
                webapp_client.query
                    query :
                        "#{table}" : {project_id : project_id, title : null}
                    cb    : (err, resp) =>
                        if not err
                            title = resp?.query?[table]?.title
                        title ?= "No Title"
                        @setState(public_project_titles : store.get('public_project_titles').set(project_id, title))

    # If something needs the store to fill in
    #    directory_tree.project_id = {updated:time, error:err, tree:list},
    # call this function.
    fetch_directory_tree: (project_id, opts) =>
        opts = defaults opts,
            exclusions : undefined # Array<String> of sub-trees' root paths to omit
        # WARNING: Do not change the store except in a callback below.
        block = "_fetch_directory_tree_#{project_id}_#{opts.exclusions?.toString()}"
        if @[block]
            return
        @[block] = true
        error = undefined
        try
            resp = await webapp_client.project_client.find_directories
                include_hidden : false
                project_id     : project_id
                exclusions     : opts.exclusions
        catch err
            error = err
        # ignore calls to update_directory_tree for 5 more seconds
        setTimeout((()=>delete @[block]), 5000)
        x = store.get('directory_trees') ? immutable.Map()
        obj =
            error   : err
            tree    : resp?.directories.sort()
            updated : new Date()
        @setState(directory_trees: x.set(project_id, immutable.fromJS(obj)))

    # The next few actions below involve changing the users field of a project.
    # See the users field of schema.coffee for documentation of the structure of this.

    ###
    # Collaborators
    ###
    # **THIS IS AN ASYNC FUNCTION!**
    remove_collaborator: (project_id, account_id) =>
        name = redux.getStore('users').get_name(account_id)
        try
            await webapp_client.project_collaborators.remove
                project_id : project_id
                account_id : account_id
            await @redux.getProjectActions(project_id).async_log({event: 'remove_collaborator', removed_name : name})
        catch err
            # TODO: -- set error in store for this project...?
            err = "Error removing collaborator #{account_id} from #{project_id} -- #{err}"
            alert_message(type:'error', message:err)

    # this is for inviting existing users, the email is only known by the back-end
    # **THIS IS AN ASYNC FUNCTION!**
    invite_collaborator: (project_id, account_id, body, subject, silent, replyto, replyto_name) =>
        await @redux.getProjectActions(project_id).async_log
            event    : 'invite_user'
            invitee_account_id : account_id

        # TODO dedup code with what's in invite_collaborators_by_email below
        title = @redux.getStore('projects').get_title(project_id)
        #if not body?
        #    name  = @redux.getStore('account').get_fullname()
        #    body  = "Please collaborate with me using CoCalc on '#{title}'.\n\n\n--\n#{name}"

        link2proj = "https://#{window.location.hostname}/projects/#{project_id}/"

        # convert body from markdown to html, which is what the backend expects
        if body?
            body = markdown.markdown_to_html(body)

        try
            await webapp_client.project_collaborators.invite
                project_id   : project_id
                account_id   : account_id
                title        : title
                link2proj    : link2proj
                replyto      : replyto
                replyto_name : replyto_name
                email        : body         # no body? no email will be sent
                subject      : subject
        catch err
            if not silent
                 # TODO: -- set error in store for this project...?
                err = "Error inviting collaborator #{account_id} from #{project_id} -- #{JSON.stringify(err)}"
                alert_message(type:'error', message:err)


    # this is for inviting non-existing users, email is set via the UI
    # **THIS IS AN ASYNC FUNCTION!**
    invite_collaborators_by_email: (project_id, to, body, subject, silent, replyto, replyto_name) =>
        await @redux.getProjectActions(project_id).async_log
            event         : 'invite_nonuser'
            invitee_email : to

        # TODO dedup code with what's in invite_collaborator above
        title = @redux.getStore('projects').get_title(project_id)
        if not body?
            name  = @redux.getStore('account').get_fullname()
            body  = "Please collaborate with me using CoCalc on '#{title}'.\n\n\n--\n#{name}"

        link2proj = "https://#{window.location.hostname}/projects/#{project_id}/"

        # convert body from markdown to html, which is what the backend expects
        body = markdown.markdown_to_html(body)

        try
            resp = await webapp_client.project_collaborators.invite_noncloud
                project_id   : project_id
                title        : title
                link2proj    : link2proj
                replyto      : replyto
                replyto_name : replyto_name
                to           : to
                email        : body
                subject      : subject
            if not silent
                alert_message(message:resp.mesg)
        catch err
            if not silent
                alert_message(type:'error', message:err, timeout:60)

    ###
    # Upgrades
    ###
    # - upgrades is a map from upgrade parameters to integer values.
    # - The upgrades get merged into any other upgrades this user may have already applied,
    #   unless merge=false (the third option)
    # **THIS IS AN ASYNC FUNCTION!**
    apply_upgrades_to_project: (project_id, upgrades, merge=true) =>
        misc.assert_uuid(project_id)
        if not merge
            # explicitly set every field not specified to 0
            upgrades = misc.copy(upgrades)
            for quota, val of require('smc-util/schema').DEFAULT_QUOTAS
                upgrades[quota] ?= 0
        await @projects_table_set
            project_id : project_id
            users      :
                "#{@redux.getStore('account').get_account_id()}" : {upgrades: upgrades}
                # create entry in the project's log
        # log the change in the project log
        await @redux.getProjectActions(project_id).log
            event    : 'upgrade'
            upgrades : upgrades

    # Throws on project_id is not a valid UUID (why? I don't remember)
    # **THIS IS AN ASYNC FUNCTION!**
    clear_project_upgrades: (project_id) =>
        misc.assert_uuid(project_id)
        await @apply_upgrades_to_project(project_id, misc.map_limit(require('smc-util/schema').DEFAULT_QUOTAS, 0))
        await @remove_site_license_from_project(project_id)

    # **THIS IS AN ASYNC FUNCTION!**
    # Use a site license key to upgrade a project.  This only has an
    # impact when the project is restarted.
    add_site_license_to_project: (project_id, license_id) =>
        if not misc.is_valid_uuid_string(license_id)
            throw Error("invalid license key '#{license_id}' -- it must be a 36-character valid v4 uuid")
        project = store.getIn(['project_map', project_id])
        if not project?
            return
        site_license = project.get('site_license', immutable.Map()).toJS()
        if site_license[license_id]?
            return
        site_license[license_id] = {}
        await @projects_table_set({project_id:project_id, site_license:site_license}, "shallow")

    # Removes a given (or all) site licenses from a project. If license_id is not
    # set then removes all of them.
    remove_site_license_from_project: (project_id, license_id='') =>
        project = store.getIn(['project_map', project_id])
        if not project?
            return
        site_license = project.get('site_license', immutable.Map()).toJS()
        if not license_id and misc.len(site_license) == 0
            # common special case that is easy
            return
        # The null stuff here is confusing, but that's just because our SyncTable functionality
        # makes deleting things tricky.
        if license_id
            if not site_license[license_id]?
                return
            site_license[license_id] = null
        else
            for x of site_license
                site_license[x] = null
        await @projects_table_set({project_id:project_id, site_license:site_license}, "shallow")


    # **THIS IS AN ASYNC FUNCTION!**
    save_project: (project_id) =>
        await @projects_table_set
            project_id     : project_id
            action_request : {action:'save', time:webapp_client.server_time()}

    # **THIS IS AN ASYNC FUNCTION!**
    start_project: (project_id) ->
        await @projects_table_set
            project_id     : project_id
            action_request : {action:'start', time:webapp_client.server_time()}
        # Doing an exec further increases the chances project will be
        # definitely running in all environments.
        opts = { project_id:project_id, command: "pwd" }
        await callback2(webapp_client.exec.bind(webapp_client), opts)

    # **THIS IS AN ASYNC FUNCTION!**
    stop_project: (project_id) =>
        await @projects_table_set
            project_id     : project_id
            action_request : {action:'stop', time:webapp_client.server_time()}
        await @redux.getProjectActions(project_id).log
            event : 'project_stop_requested'

    # **THIS IS AN ASYNC FUNCTION!**
    close_project_on_server: (project_id) =>  # not used by UI yet - dangerous
        await @projects_table_set
            project_id     : project_id
            action_request : {action:'close', time:webapp_client.server_time()}

    # **THIS IS AN ASYNC FUNCTION!**
    restart_project: (project_id) ->
        await @projects_table_set
            project_id     : project_id
            action_request : {action:'restart', time:webapp_client.server_time()}
        await @redux.getProjectActions(project_id).log
            event : 'project_restart_requested'

    # Explcitly set whether or not project is hidden for the given account (state=true means hidden)
    # **THIS IS AN ASYNC FUNCTION!**
    set_project_hide: (account_id, project_id, state) =>
        await @projects_table_set
            project_id : project_id
            users      :
                "#{account_id}" :
                    hide : !!state

    # Toggle whether or not project is hidden project
    # **THIS IS AN ASYNC FUNCTION!**
    toggle_hide_project: (project_id) =>
        account_id = @redux.getStore('account').get_account_id()
        await @projects_table_set
            project_id : project_id
            users      :
                "#{account_id}" :
                    hide : not @redux.getStore('projects').is_hidden_from(project_id, account_id)

    # **THIS IS AN ASYNC FUNCTION!**
    delete_project: (project_id) =>
        await @projects_table_set
            project_id : project_id
            deleted    : true

    # Toggle whether or not project is deleted.
    # **THIS IS AN ASYNC FUNCTION!**
    toggle_delete_project: (project_id) =>
        is_deleted = @redux.getStore('projects').is_deleted(project_id)
        if not is_deleted
            await @clear_project_upgrades(project_id)

        await @projects_table_set
            project_id : project_id
            deleted    : not is_deleted

    display_hidden_projects: (should_display) =>
        @setState(hidden: should_display)

    display_deleted_projects: (should_display) =>
        @setState(deleted: should_display)

    # **THIS IS AN ASYNC FUNCTION!**
    load_all_projects: => # async
        if store.get('load_all_projects_done')
            return
        await load_all_projects()
        @setState(load_all_projects_done : true)

# Register projects actions
actions = redux.createActions('projects', ProjectsActions)
require('./projects/actions').init();

_create_project_tokens = require('./projects/actions').create_project_tokens;

{load_all_projects, switch_to_project} = require('./projects/table')

###

{ProjectsSearch} = require('./projects/search')
{Hashtags} = require('./projects/hashtags')
{ProjectsListingDescription} = require('./projects/project-list-desc');
{ProjectList} = require('./projects/project-list')

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
        if account_id != webapp_client.account_id
            info = user_map?.get(account_id)
            if info?
                search += (' ' + info.get('first_name') + ' ' + info.get('last_name') + ' ').toLowerCase()
    return search
###