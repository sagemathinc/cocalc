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

# Course Management

###
TODO:

- [x] (0:30?) (0:09) create function to render course in a DOM element with basic rendering; hook into editor.coffee
- [x] (0:30?) (0:36) create proper 4-tab pages using http://react-bootstrap.github.io/components.html#tabs
- [x] (0:45?) (1:35) create dynamically created store attached to a project_id and course filename, which updates on sync of file.
- [x] (0:30?) (1:15) fill in very rough content components (just panels/names)
- [x] (0:45?) settings: title & description
- [x] (1:00?) (2:02) add student
- [x] (1:00?) (0:22) render student row
- [x] (0:45?) (0:30) search students
- [x] (0:45?) (2:30+) create student projects
- [x] (1:00?) nice error displays of error in the store.
- [x] (1:00?) (1:21) add assignment
- [x] (1:00?) (0:27) render assignment row

- [ ] (0:30?) search assignments
- [ ] (1:30?) assign all... (etc.) button/menu
- [ ] (1:30?) collect all... (etc.) button/menu
- [ ] (1:00?) return graded button

---

- [ ] (0:45?) counter for each page heading (num students, num assignments)
- [ ] (0:45?) delete student; show deleted students; permanently delete students
- [ ] (0:45?) delete assignment; show deleted assignments; permanently delete assignment
- [ ] (1:00?) show deleted assignments (and purge)
- [ ] (1:00?) help page
- [ ] (1:00?) clean up after flux/react when closing the editor
- [ ] (1:30?) cache stuff/optimize
- [ ] (1:00?) make it look pretty
- [ ] (3:00?) bug searching / testing / debugging

###

immutable = require('immutable')

misc = require('misc')
{salvus_client} = require('salvus_client')

{React, rclass, rtypes, FluxComponent, Actions, Store}  = require('flux')
{Button, ButtonToolbar, Input, Row, Col, Panel, TabbedArea, TabPane, Well} = require('react-bootstrap')
{ErrorDisplay, Icon, LabeledRow, Loading, SelectorInput, TextInput} = require('r_misc')
{User} = require('users')
TimeAgo = require('react-timeago')


{synchronized_db} = require('syncdb')

flux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

primary_key =
    students    : 'student_id'
    assignments : 'assignment_id'

init_flux = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    if flux.getActions(name)?
        # already initalized
        return
    syncdb = undefined

    project = require('project').project_page(project_id:project_id)
    class CourseActions extends Actions
        # INTERNAL API
        _set_to: (payload) =>
            payload

        _loaded: =>
            if not syncdb?
                @set_error("attempt to set syncdb before loading")
                return false
            return true

        _update: (opts) =>
            if not @_loaded() then return
            syncdb.update(opts)
            syncdb.save()

        _syncdb_change: (changes) =>
            t = misc.copy(store.state)
            remove = (x.remove for x in changes when x.remove?)
            insert = (x.insert for x in changes when x.insert?)
            # first remove, then insert (or we could loose things!)
            for x in remove
                if x.table != 'settings'
                    y = misc.copy_without(x, ['table', 'student_id', 'assignment_id'])
                    t[x.table] = t[x.table].remove(x[primary_key[x.table]])
            for x in insert
                if x.table == 'settings'
                    for k, v of misc.copy_without(x, 'table')
                        t.settings = t.settings.set(k, immutable.fromJS(v))
                else
                    y = immutable.fromJS(misc.copy_without(x, ['table', 'student_id', 'assignment_id']))
                    t[x.table] = t[x.table].set(x[primary_key[x.table]], y)
            for k, v of t
                if not v.equals(store.state[k])
                    @_set_to("#{k}":v)

        # PUBLIC API

        project: => return project

        set_error: (error) =>
            @_set_to(error:error)

        set_project_error: (project_id, error) =>
            # ignored for now
        set_student_error: (student_id, error) =>
            # ignored for now

        # Settings
        set_title: (title) =>
            @_update(set:{title:title}, where:{table:'settings'})

        set_description: (description) =>
            @_update(set:{description:description}, where:{table:'settings'})

        # Students
        add_students: (students) =>
            # students = array of account_id or email_address
            # New student_id's will be constructed randomly for each student
            for id in students
                obj = {table:'students', student_id:misc.uuid()}
                if '@' in id
                    obj.email_address = id
                else
                    obj.account_id = id
                syncdb.update(set:{}, where:obj)
            syncdb.save()

        # Student projects
        create_student_project: (student_id) =>
            console.log("create_student_project")
            if not store.state.students? or not store.state.settings?
                @set_error("attempt to create when stores not yet initialized")
                return
            @_update(set:{create_project:new Date()}, where:{table:'students',student_id:student_id})
            # Create the project
            flux.getActions('projects').create_project
                title       : store.state.settings.get('title')
                description : store.state.settings.get('description')
                cb          : (err, project_id) =>
                    if err
                        @set_error("error creating student project -- #{err}")
                    else
                        @_update(set:{create_project:undefined, project_id:project_id}, where:{table:'students',student_id:student_id})
                        @configure_project(student_id)

        configure_project_users: (student_project_id, student_id) =>
            # Add student and all collaborators on this project to the project with given project_id.
            # Who is currently a user of the student's project?
            users = flux.getStore('projects').get_users(student_project_id)  # immutable.js map
            # Define function to invite or add collaborator
            invite = (x) ->
                if '@' in x
                    title = flux.getStore("projects").get_title(student_project_id)
                    name  = flux.getStore('account').get_fullname()
                    body  = "Please use SageMathCloud for the course -- '#{title}'.  Sign up at\n\n    https://cloud.sagemath.com\n\n--\n#{name}"
                    flux.getActions('projects').invite_collaborators_by_email(student_project_id, x, body)
                else
                    flux.getActions('projects').invite_collaborator(student_project_id, x)
            # Make sure the student is on the student's project:
            student = store.get_student(student_id)
            student_account_id = student.get('account_id')
            if not student_account_id?  # no account yet
                invite(student.get('email_address'))
            else if not users.get(student_account_id)?
                invite(student_account_id)
            # Make sure all collaborators on course project are on the student's project:
            target_users = flux.getStore('projects').get_users(project_id)
            target_users.map (_, account_id) =>
                if not users.get(account_id)?
                    invite(account_id)
            # Make sure nobody else is on the student's project (anti-cheating measure)
            flux.getStore('projects').get_users(student_project_id).map (_,account_id) =>
                if not target_users.get(account_id)? and account_id != student_account_id
                    flux.getActions('projects').remove_collaborator(student_project_id, account_id)

        configure_project_visibility: (student_project_id) =>
            users_of_student_project = flux.getStore('projects').get_users(student_project_id)
            # Make project not visible to any collaborator on the course project.
            flux.getStore('projects').get_users(project_id).map (_, account_id) =>
                x = users_of_student_project.get(account_id)
                if x? and not x.get('hide')
                    flux.getActions('projects').set_project_hide(student_project_id, account_id, true)

        configure_project_title_description: (project_id, student_id) =>
            account_id = store.state.students.get(student_id).get('account_id')
            if account_id?
                student_name = (flux.getStore('users').get_name(account_id) ? '') + ' - '
            else
                student_name = ''
            title = student_name + store.state.settings.get('title')
            description = store.state.settings.get('description')
            a = flux.getActions('projects')
            a.set_project_title(project_id, title)
            a.set_project_description(project_id, description)

        configure_project: (student_id) =>
            # Configure project for the given student so that it has the right title,
            # description, and collaborators for belonging to the indicated student.
            # - Add student and collaborators on project containing this course to the new project.
            # - Hide project from owner/collabs of the project containing the course.
            # - Set the title to [Student name] + [course title] and description to course description.
            student_project_id = store.state.students?.get(student_id)?.get('project_id')
            if not project_id?
                return # no project for this student -- nothing to do
            @configure_project_users(student_project_id, student_id)
            @configure_project_visibility(student_project_id)
            @configure_project_title_description(student_project_id, student_id)

        # Assignments
        add_assignment: (path) =>
            # add an assignment to the course, which is defined by giving a directory in the project
            @_update
                set   : {path: path}
                where : {table: 'assignments', assignment_id:misc.uuid()}

        delete_assignment: (assignment_id) =>
            @_update
                set   : {deleted: true}
                where : {table: 'assignments', assignment_id:opts.assignment_id}


    actions = flux.createActions(name, CourseActions)

    class CourseStore extends Store
        constructor: (flux) ->
            super()
            ActionIds = flux.getActionIds(name)
            @register(ActionIds._set_to, @_set_to)
            @state = {}

        _set_to: (payload) => @setState(payload)

        get_students: => @state.students

        get_student: (student_id) => @state.students?.get(student_id)

        get_assignments: => @state.assignments

        get_assignment: (assignment_id) => @state.sassignment?.get(assignment_id)

    store = flux.createStore(name, CourseStore, flux)

    synchronized_db
        project_id : project_id
        filename   : path
        cb         : (err, _db) ->
            if err
                actions.set_error("unable to open #{@filename}")
            else
                syncdb = _db
                t = {settings:{title:'No title', description:'No description'}, assignments:{}, students:{}}
                for x in syncdb.select()
                    if x.table == 'settings'
                        misc.merge(t.settings, misc.copy_without(x, 'table'))
                    else if x.table == 'students'
                        t.students[x.student_id] = misc.copy_without(x, ['student_id', 'table'])
                    else if x.table == 'assignments'
                        t.assignments[x.assignment_id] = misc.copy_without(x, ['assignment_id', 'table'])
                for k, v of t
                    t[k] = immutable.fromJS(v)
                actions._set_to(t)
                syncdb.on('change', actions._syncdb_change)

Student = rclass
    propTypes:
        flux     : rtypes.object.isRequired
        name     : rtypes.string.isRequired
        student  : rtypes.object.isRequired
        user_map : rtypes.object.isRequired

    displayName : "CourseEditorStudent"

    render_student: ->
        account_id = @props.student.get('account_id')
        if account_id?
            <User account_id={account_id} user_map={@props.user_map} />
        else # TODO: maybe say something about invite status...?
            <div>
                {@props.student.get("email_address")}
            </div>

    open_project: ->
        @props.flux.getActions('projects').open_project(project_id:@props.student.get('project_id'))

    create_project: ->
        console.log("create_project")
        @props.flux.getActions(@props.name).create_student_project(@props.student_id)

    render_project: ->
        # first check if the project is currently being created
        create = @props.student.get("create_project")
        if create?
            # if so, how long ago did it start
            how_long = (new Date() - create)/1000
            if how_long < 120 # less than 2 minutes -- still hope, so render that creating
                return <div><Icon name="circle-o-notch" spin /> Creating project...(started <TimeAgo date={create} />)</div>
            # otherwise, maybe user killed file before finished or something and it is lost; give them the chance
            # to attempt creation again by clicking the create button.

        project_id = @props.student.get('project_id')
        if project_id?
            <Button onClick={@open_project}>
                <Icon name="edit" /> Open project
            </Button>
        else
            <Button onClick={@create_project}>
                <Icon name="plus-circle" /> Create project
            </Button>

    render_delete_button: ->
        <Button onClick={@delete_student}>
            <Icon name="trash" /> Delete
        </Button>

    render: ->
        <Row>
            <Col md=4>
                {@render_student()}
            </Col>
            <Col md=4>
                {@render_project()}
            </Col>
            <Col md=4>
                {@render_delete_button()}
            </Col>
        </Row>

Students = rclass
    propTypes:
        name        : rtypes.string.isRequired
        flux        : rtypes.object.isRequired
        project_id  : rtypes.string.isRequired
        students    : rtypes.object.isRequired
        user_map    : rtypes.object.isRequired

    displayName : "CourseEditorStudents"

    getInitialState: ->
        err           : undefined
        search        : ''
        add_search    : ''
        add_searching : false
        add_select    : undefined

    clear_and_focus_student_search_input: ->
        @setState(search:'')
        @refs.student_search_input.getInputDOMNode().focus()

    clear_search_button : ->
        <Button onClick={@clear_and_focus_student_search_input}>
            <Icon name="times-circle" />
        </Button>

    do_add_search: (e) ->
        # Search for people to add to the course
        e?.preventDefault()
        if not @props.students?
            return
        if @state.add_searching # already searching
            return
        search = @state.add_search.trim()
        if search.length == 0
            @setState(err:undefined, add_select:undefined)
            return
        @setState(add_searching:true, add_select:undefined)
        add_search = @state.add_search
        salvus_client.user_search
            query : add_search
            limit : 50
            cb    : (err, select) =>
                if err
                    @setState(add_searching:false, err:err, add_select:undefined)
                    return
                # Get the current collaborators/owners of the project that contains the course.
                users = @props.flux.getStore('projects').get_users(@props.project_id)
                # Make a map with keys the email or account_id is already part of the course.
                already_added = users.toJS()  # start with collabs on project
                # For each student in course add account_id and/or email_address:
                @props.students.map (val, key) =>
                    for n in ['account_id', 'email_address']
                        if val.get(n)?
                            already_added[val.get(n)] = true
                # This function returns true if we shouldn't list the given account_id or email_address
                # in the search selector for adding to the class.
                exclude_add = (account_id, email_address) =>
                    return already_added[account_id]? or already_added[email_address]?
                select = (x for x in select when not exclude_add(x.account_id, x.email_address))
                # Put at the front of the list any email addresses not known to SMC (sorted in order).
                select = noncloud_emails(select, add_search).concat(select)
                # We are no longer searching, but now show an options selector.
                @setState(add_searching:false, add_select:select)

    student_add_button : ->
        <Button onClick={@do_add_search}>
            {if @props.add_searching then <Icon name="circle-o-notch" spin /> else <Icon name="search" />}
        </Button>

    add_selected_students: ->
        @props.flux.getActions(@props.name).add_students(@refs.add_select.getSelectedOptions())
        @setState(err:undefined, add_select:undefined, add_search:'')

    render_add_selector_options: ->
        v = []
        seen = {}
        for x in @state.add_select
            key = x.account_id ? x.email_address
            if seen[key] then continue else seen[key]=true
            name = if x.account_id? then x.first_name + ' ' + x.last_name else x.email_address
            v.push <option key={key} value={key} label={name}>{name}</option>
        return v

    render_add_selector: ->
        if not @state.add_select?
            return
        <div>
            <Input type='select' multiple ref="add_select" rows=10>
                {@render_add_selector_options()}
            </Input>
            <Button onClick={@add_selected_students}><Icon name="plus" /> Add selected</Button>
        </div>

    render_error: ->
        if @state.err
            <ErrorDisplay error={@state.err} onClose={=>@setState(err:undefined)} />

    render_header: ->
        <div>
            <Row>
                <Col md=5>
                    <Input
                        ref         = 'student_search_input'
                        type        = 'text'
                        placeholder = "Find students..."
                        value       = {@state.search}
                        buttonAfter = {@clear_search_button()}
                        onChange    = {=>@setState(search:@refs.student_search_input.getValue())}
                    />
                </Col>
                <Col md=5 mdOffset=2>
                    <form onSubmit={@do_add_search}>
                        <Input
                            ref         = 'student_add_input'
                            type        = 'text'
                            placeholder = "Add student by name or email address..."
                            value       = {@state.add_search}
                            buttonAfter = {@student_add_button()}
                            onChange    = {=>@setState(add_search:@refs.student_add_input.getValue())}
                        />
                    </form>
                    {@render_add_selector()}
                </Col>
            </Row>
            {@render_error()}
        </div>

    render_students: ->
        if not @props.students? or not @props.user_map?
            return
        # turn map of students into a list
        v = immutable_to_list(@props.students, 'student_id')
        # fill in names, for use in sorting and searching (TODO: caching)
        for x in v
            if x.account_id?
                user = @props.user_map.get(x.account_id)
                x.first_name = user.get('first_name')
                x.last_name  = user.get('last_name')
                x.sort = (x.last_name + ' ' + x.first_name).toLowerCase()
            else if x.email_address?
                x.sort = x.email_address.toLowerCase()

        v.sort (a,b) ->
            return misc.cmp(a.sort, b.sort)
        if @state.search
            words  = misc.split(@state.search.toLowerCase())
            search = (a) -> ((a.last_name ? '') + (a.first_name ? '') + (a.email_address ? '')).toLowerCase()
            match  = (s) ->
                for word in words
                    if s.indexOf(word) == -1
                        return false
                return true
            v = (x for x in v when match(search(x)))
        for x in v
            <Student key={x.student_id} student_id={x.student_id} student={@props.students.get(x.student_id)}
                     user_map={@props.user_map} flux={@props.flux} name={@props.name} />

    render :->
        <Panel header={@render_header()}>
            {@render_students()}
        </Panel>



Assignment = rclass
    propTypes:
        assignment : rtypes.object.isRequired

    displayName : "CourseEditorAssignment"

    render_assign_button: ->
        <Button onClick={@assign_assignment}>
            <Icon name="share-square-o" /> Assign
        </Button>

    render_collect_button: ->
        <Button onClick={@collect_assignment}>
            <Icon name="share-square-o" rotate180 /> Collect
        </Button>

    render_return_button: ->
        <Button onClick={@return_assignment}>
            <Icon name="share-square-o" /> Return
        </Button>

    render_delete_button: ->
        <Button onClick={@delete_assignment}>
            <Icon name="trash" /> Delete
        </Button>

    render: ->
        <div>
            <Row>
                <Col md=4>
                    {@props.assignment.get('path')}
                </Col>
                <Col md=2>
                    {@render_assign_button()}
                </Col>
                <Col md=2>
                    {@render_collect_button()}
                </Col>
                <Col md=2>
                    {@render_return_button()}
                </Col>
                <Col md=2>
                    {@render_delete_button()}
                </Col>
            </Row>
        </div>

Assignments = rclass
    displayName : "CourseEditorAssignments"

    propTypes:
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        flux        : rtypes.object.isRequired
        assignments : rtypes.object.isRequired
        user_map    : rtypes.object.isRequired

    getInitialState: ->
        err           : undefined  # error message to display at top.
        search        : ''         # search query to restrict which assignments are shown.
        add_search    : ''         # search query in box for adding new assignment
        add_searching : false      # whether or not it is asking the backend for the result of a search
        add_select    : undefined  # contents to put in the selection box after getting search result back
        add_selected  : ''         # specific path name in selection box that was selected

    clear_and_focus_assignment_search_input: ->
        @setState(search : '')
        @refs.assignment_search_input.getInputDOMNode().focus()

    clear_search_button : ->
        <Button onClick={@clear_and_focus_assignment_search_input}>
            <Icon name="times-circle" />
        </Button>

    do_add_search: (e) ->
        # Search for assignments to add to the course
        e?.preventDefault()
        if @state.add_searching # already searching
            return
        search = @state.add_search.trim()
        if search.length == 0
            @setState(err:undefined, add_select:undefined)
            return
        @setState(add_searching:true, add_select:undefined)
        add_search = @state.add_search
        salvus_client.find_directories
            project_id : @props.project_id
            query      : "*#{search}*"
            cb         : (err, resp) =>
                if err
                    @setState(add_searching:false, err:err, add_select:undefined)
                    return
                if resp.directories.length > 0
                    paths = {}
                    @props.assignments.map (val, key) =>
                        paths[val.get('path')] = true
                    resp.directories = (path for path in resp.directories when not paths[path])
                @setState(add_searching:false, add_select:resp.directories)

    clear_and_focus_assignment_add_search_input: ->
        @setState(add_search : '', add_select:undefined, add_selected:'')
        @refs.assignment_add_input.getInputDOMNode().focus()

    assignment_add_search_button : ->
        if @state.add_searching
            # Currently doing a search, so show a spinner
            <Button>
                <Icon name="circle-o-notch" spin />
            </Button>
        else if @state.add_select?
            # There is something in the selection box -- so only action is to clear the search box.
            <Button onClick={@clear_and_focus_assignment_add_search_input}>
                <Icon name="times-circle" />
            </Button>
        else
            # Waiting for user to start a search
            <Button onClick={@do_add_search}>
                <Icon name="search" />
            </Button>

    add_selected_assignment: ->
        @props.flux.getActions(@props.name).add_assignment(@state.add_selected)
        @setState(err:undefined, add_select:undefined, add_search:'', add_selected:'')

    render_add_selector_options: ->
        for path in @state.add_select
            <option key={path} value={path} label={path}>{path}</option>

    render_add_selector: ->
        if not @state.add_select?
            return
        <div>
            <Input type='select' ref="add_select" size=5 onChange={=>@setState(add_selected:@refs.add_select.getValue())} >
                {@render_add_selector_options()}
            </Input>
            <Button disabled={not @state.add_selected} onClick={@add_selected_assignment}><Icon name="plus" /> Add selected assignment</Button>
        </div>

    render_error: ->
        if @state.err
            <ErrorDisplay error={@state.err} onClose={=>@setState(err:undefined)} />

    render_header: ->
        <div>
            <Row>
                <Col md=5>
                    <Input
                        ref         = 'assignment_search_input'
                        type        = 'text'
                        placeholder = "Find assignments..."
                        value       = {@state.search}
                        buttonAfter = {@clear_search_button()}
                        onChange    = {=>@setState(search:@refs.assignment_search_input.getValue())}
                    />
                </Col>
                <Col md=5 mdOffset=2>
                    <form onSubmit={@do_add_search}>
                        <Input
                            ref         = 'assignment_add_input'
                            type        = 'text'
                            placeholder = "Add assignment by folder name..."
                            value       = {@state.add_search}
                            buttonAfter = {@assignment_add_search_button()}
                            onChange    = {=>@setState(add_search:@refs.assignment_add_input.getValue())}
                        />
                    </form>
                    {@render_add_selector()}
                </Col>
            </Row>
            {@render_error()}
        </div>

    render_assignments: ->
        if not @props.assignments?
            return
        v = immutable_to_list(@props.assignments, 'assignment_id')
        if @state.search
            words = misc.split(@state.search.toLowerCase())
            matches = (x) ->  # TODO: refactor with student search, etc.
                k = x.path.toLowerCase()
                for w in words
                    if k.indexOf(w) == -1
                        return false
                return true
            v = (x for x in v when matches(x))
        v.sort (a,b) ->
            return misc.cmp(a.path.toLowerCase(), b.path.toLowerCase())
        for x in v
            <Assignment key={x.assignment_id} assignment={@props.assignments.get(x.assignment_id)} />

    render :->
        <Panel header={@render_header()}>
            {@render_assignments()}
        </Panel>

Settings = rclass
    displayName : "CourseEditorSettings"
    propTypes:
        flux        : rtypes.object.isRequired
        settings    : rtypes.object.isRequired

    render_title_description: ->
        if not @props.settings?
            return <Loading />
        <Panel header="Title and description">
            <LabeledRow label="Title">
                <TextInput
                    text={@props.settings.get('title')}
                    on_change={(title)=>@props.flux.getActions(@props.name).set_title(title)}
                />
            </LabeledRow>
            <LabeledRow label="Description">
                <TextInput
                    rows      = 4
                    type      = "textarea"
                    text      = {@props.settings.get('description')}
                    on_change={(desc)=>@props.flux.getActions(@props.name).set_description(desc)}
                />
            </LabeledRow>
        </Panel>

    render :->
        <div>
            {@render_title_description()}
        </div>

CourseEditor = rclass
    displayName : "CourseEditor"

    propTypes:
        error       : rtypes.string
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        flux        : rtypes.object
        settings    : rtypes.object
        students    : rtypes.object
        assignments : rtypes.object
        user_map    : rtypes.object

    render_error: ->
        if @props.error
            <ErrorDisplay error={@props.error} onClose={=>@props.flux.getActions(@props.name).set_error('')} />

    render_students: ->
        if @props.flux? and @props.students? and @props.user_map?
            <Students flux={@props.flux} students={@props.students}
                      name={@props.name} project_id={@props.project_id}
                      user_map={@props.user_map} />

    render_assignments: ->
        if @props.flux? and @props.assignments? and @props.user_map?
            <Assignments flux={@props.flux} assignments={@props.assignments}
                name={@props.name} project_id={@props.project_id} user_map={@props.user_map} />

    render_settings: ->
        if @props.flux? and @props.settings?
            <Settings flux={@props.flux} settings={@props.settings} name={@props.name} />

    render: ->
        <div>
            {@render_error()}
            <h4 style={float:'right'}>{@props.settings?.get('title')}</h4>
            <TabbedArea defaultActiveKey={'students'} animation={false}>
                <TabPane eventKey={'students'} tab={<span><Icon name="users"/> Students</span>}>
                    {@render_students()}
                </TabPane>
                <TabPane eventKey={'assignments'} tab={<span><Icon name="share-square-o"/> Assignments</span>}>
                    {@render_assignments()}
                </TabPane>
                <TabPane eventKey={'settings'} tab={<span><Icon name="wrench"/> Settings</span>}>
                    {@render_settings()}
                </TabPane>
            </TabbedArea>
        </div>

render = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    <FluxComponent flux={flux} connectToStores={[name, 'users']} >
        <CourseEditor name={name} project_id={project_id}/>
    </FluxComponent>


exports.render_editor_course = (project_id, path, dom_node, flux) ->
    init_flux(flux, project_id, path)
    React.render(render(flux, project_id, path), dom_node)

immutable_to_list = (x, primary_key) ->
    if not x?
        return
    v = []
    x.map (val, key) ->
        v.push(misc.merge(val.toJS(), {"#{primary_key}":key}))
    return v

noncloud_emails = (v, s) ->
    # Given a list v of user_search results, and a search string s,
    # return entries for each email address not in v, in order.
    {string_queries, email_queries} = misc.parse_user_search(s)
    result_emails = misc.dict(([r.email_address, true] for r in v when r.email_address?))
    return ({email_address:r} for r in email_queries when not result_emails[r]).sort (a,b)->
        misc.cmp(a.email_address,b.email_address)

