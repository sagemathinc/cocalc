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

- [x] (0:30?) (0:18) when searching, show how many things are not being shown.
- [ ] (0:45?) delete student; show deleted students; permanently delete students
- [ ] (0:45?) delete assignment; show deleted assignments; permanently delete assignment
- [ ] (1:00?) help page -- integrate info
- [ ] (1:00?) changing title/description needs to change it for all projects
- [ ] (1:00?) clean up after flux/react when closing the editor
- [ ] (1:30?) cache stuff/optimize
- [ ] (2:00?) make everything look pretty
        - triangles for show/hide assignment info like for students
        - error messages in assignment page -- make hidable and truncate-able
        - escape to clear search boxes
- [ ] (3:00?) bug searching / testing / debugging
- [ ] (1:00?) (0:19+) fix bugs in opening directories in different projects using actions -- completely busted right now due to refactor of directory listing stuff....

DONE:
- [x] (0:30?) (0:15) when adding assignments filter out folders contained in existing assignment folders
- [x] (1:00?) (0:12) assignment collect; don't allow until after assigned, etc. -- FLOW
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
- [x] (1:30?) (0:27) render assignment row; search assignments
- [x] (1:30?) #now (4:00+) assign all... (etc.) button
- [x] (1:30?) collect all... (etc.) button
- [x] (1:00?) return all... button
- [x] (0:45?) (0:20)  counter for each page heading (num students, num assignments)
- [x] (2:00?) (0:59) links to grade each student; buttons to assign to one student, collect from one, etc.
- [x] (1:30?) (1:03) display info about each student when they are clicked on (in students page) -- ugly but nicely refactored

###

# standard non-SMC libraries
immutable = require('immutable')
async     = require('async')

# SMC libraries
misc = require('misc')
{defaults, required} = misc
{salvus_client} = require('salvus_client')
{synchronized_db} = require('syncdb')

# React libraries
{React, rclass, rtypes, FluxComponent, Actions, Store}  = require('flux')
{Button, ButtonToolbar, Input, Row, Col, Panel, TabbedArea, TabPane, Well} = require('react-bootstrap')
{ErrorDisplay, Icon, LabeledRow, Loading, SelectorInput, TextInput} = require('r_misc')
{User} = require('users')
TimeAgo = require('react-timeago')


flux_name = (project_id, course_filename) ->
    return "editor-#{project_id}-#{course_filename}"

primary_key =
    students    : 'student_id'
    assignments : 'assignment_id'

init_flux = (flux, project_id, course_filename) ->
    name = flux_name(project_id, course_filename)
    if flux.getActions(name)?
        # already initalized
        return
    syncdb = undefined

    user_store = flux.getStore('users')
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

        _store_is_initialized: =>
            if not (store.state.students? and store.state.assignments? and store.state.settings?)
                @set_error("store must be initialized")
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
                    y = misc.copy_without(x, 'table')
                    t[x.table] = t[x.table].remove(x[primary_key[x.table]])
            for x in insert
                if x.table == 'settings'
                    for k, v of misc.copy_without(x, 'table')
                        t.settings = t.settings.set(k, immutable.fromJS(v))
                else
                    y = immutable.fromJS(misc.copy_without(x, 'table'))
                    t[x.table] = t[x.table].set(x[primary_key[x.table]], y)
            for k, v of t
                if not immutable.is(v, store.state[k])
                    @_set_to("#{k}":v)

        # PUBLIC API

        project: => return project

        set_error: (error) =>
            @_set_to(error:error)

        set_activity: (opts) =>
            opts = defaults opts,
                id   : undefined
                desc : undefined
            if not opts.id? and not opts.desc?
                return
            if not opts.id?
                opts.id = misc.uuid()
            x = store.get_activity()
            if not x?
                x = {}
            if not opts.desc?
                delete x[opts.id]
            else
                x[opts.id] = opts.desc
            @_set_to(activity: x)
            return opts.id

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
        create_student_project: (student, cb) =>
            if not store.state.students? or not store.state.settings?
                @set_error("attempt to create when stores not yet initialized")
                cb?()
                return
            student_id = store.get_student(student).get('student_id')
            @_update(set:{create_project:new Date()}, where:{table:'students',student_id:student_id})
            id = @set_activity(desc:"Create project for #{store.get_student_name(student_id)}.")
            flux.getActions('projects').create_project
                title       : store.state.settings.get('title')
                description : store.state.settings.get('description')
                cb          : (err, project_id) =>
                    @set_activity(id:id)
                    if err
                        @set_error("error creating student project -- #{err}")
                        cb?(err)
                    else
                        @_update(set:{create_project:undefined, project_id:project_id}, where:{table:'students',student_id:student_id})
                        @configure_project(student_id)
                        cb?(undefined, project_id)

        configure_project_users: (student_project_id, student_id) =>
            # Add student and all collaborators on this project to the project with given project_id.
            # users = who is currently a user of the student's project?
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
            else if not users?.get(student_account_id)?   # users might not be set yet if project *just* created
                invite(student_account_id)
            # Make sure all collaborators on course project are on the student's project:
            target_users = flux.getStore('projects').get_users(project_id)
            target_users.map (_, account_id) =>
                if not users?.get(account_id)?
                    invite(account_id)
            # Make sure nobody else is on the student's project (anti-cheating measure) -- but only if project
            # already created.
            flux.getStore('projects').get_users(student_project_id)?.map (_,account_id) =>
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
            # Add an assignment to the course, which is defined by giving a directory in the project.
            i = course_filename.lastIndexOf('.')
            # Where we collect homework that students have done (in teacher project)
            collect_path = course_filename.slice(0,i) + '-collect/' + path
            # folder that we return graded homework to (in student project)
            graded_path = path + '-graded'
            # folder where we copy the assignment to
            target_path = path
            @_update
                set   : {path: path, collect_path:collect_path, graded_path:graded_path, target_path:target_path}
                where : {table: 'assignments', assignment_id:misc.uuid()}

        delete_assignment: (assignment_id) =>
            @_update
                set   : {deleted: true}

        # Copy the files for the given assignment_id from the given student to the
        # corresponding collection folder.
        copy_assignment_from_student: (assignment, student, cb) =>
            id = @set_activity(desc:"Copying assignment from a student")
            error = (err) =>
                @set_activity(id:id)
                err="copy from student: #{err}"
                @set_error(err)
                cb?(err)
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not student = store.get_student(student)
                return error("no student")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            student_name = store.get_student_name(student)
            student_project_id = student.get('project_id')
            if not student_project_id?
                # nothing to do
                @set_activity(id:id)
                cb?()
            else
                @set_activity(id:id, desc:"Copying assignment from #{student_name}")
                salvus_client.copy_path_between_projects
                    src_project_id    : student_project_id
                    src_path          : assignment.get('target_path')
                    target_project_id : project_id
                    target_path       : assignment.get('collect_path') + '/' + student.get('student_id')
                    overwrite_newer   : assignment.get('collect_overwrite_newer')
                    delete_missing    : assignment.get('collect_delete_missing')
                    cb                : (err) =>
                        @set_activity(id:id)
                        where = {table:'assignments', assignment_id:assignment.get('assignment_id')}
                        last_collect = syncdb.select_one(where:where).last_collect ? {}
                        last_collect[student.get('student_id')] = {time: misc.mswalltime(), error:err}
                        @_update(set:{last_collect:last_collect}, where:where)
                        cb?(err)

        # Copy the given assignment to all non-deleted students, doing 10 copies in parallel at once.
        copy_assignment_from_all_students: (assignment, cb) =>
            id = @set_activity(desc:"Copying assignment from all students")
            error = (err) =>
                @set_activity(id:id)
                err="copy from student: #{err}"; @set_error(err); cb?(err)
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            errors = ''
            f = (student, cb) =>
                @copy_assignment_from_student assignment, student, (err) =>
                    if err
                        errors += "\n #{err}"
                    cb()
            async.mapLimit store.get_student_ids(deleted:false), 10, f, (err) =>
                if err
                    return error(errors)
                else
                    @set_activity(id:id)
                    cb?()

        return_assignment_to_student: (assignment, student, cb) =>
            id = @set_activity(desc:"Returning assignment to a student")
            error = (err) =>
                @set_activity(id:id)
                err="return to student: #{err}"
                @set_error(err)
                cb?(err)
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not student = store.get_student(student)
                return error("no student")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            student_name = store.get_student_name(student)
            student_project_id = student.get('project_id')
            if not student_project_id?
                # nothing to do
                @set_activity(id:id)
                cb?()
            else
                @set_activity(id:id, desc:"Returning assignment to #{student_name}")
                salvus_client.copy_path_between_projects
                    src_project_id    : project_id
                    src_path          : assignment.get('collect_path') + '/' + student.get('student_id')
                    target_project_id : student_project_id
                    target_path       : assignment.get('graded_path')
                    overwrite_newer   : assignment.get('overwrite_newer')
                    delete_missing    : assignment.get('delete_missing')
                    cb                : (err) =>
                        @set_activity(id:id)
                        where = {table:'assignments', assignment_id:assignment.get('assignment_id')}
                        last_return_graded = syncdb.select_one(where:where).last_return_graded ? {}
                        last_return_graded[student.get('student_id')] = {time: misc.mswalltime(), error:err}
                        @_update(set:{last_return_graded:last_return_graded}, where:where)
                        cb?(err)

        # Copy the given assignment to all non-deleted students, doing 10 copies in parallel at once.
        return_assignment_to_all_students: (assignment, cb) =>
            id = @set_activity(desc:"Returning assignments to all students")
            error = (err) =>
                @set_activity(id:id)
                err="return to student: #{err}"; @set_error(err); cb?(err)
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            errors = ''
            f = (student, cb) =>
                @return_assignment_to_student assignment, student, (err) =>
                    if err
                        errors += "\n #{err}"
                    cb()
            async.mapLimit store.get_student_ids(deleted:false), 10, f, (err) =>
                if err
                    return error(errors)
                else
                    @set_activity(id:id)
                    cb?()


        # Copy the files for the given assignment to the given student. If
        # the student project doesn't exist yet, it will be created.
        # You may also pass in an id for either the assignment or student.
        copy_assignment_to_student: (assignment, student, cb) =>
            id = @set_activity(desc:"Copying assignment to a student")
            error = (err) =>
                @set_activity(id:id)
                err="copy to student: #{err}"
                @set_error(err)
                cb?(err)
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not student = store.get_student(student)
                return error("no student")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            student_name = store.get_student_name(student)
            @set_activity(id:id, desc:"Copying assignment to #{student_name}")
            student_project_id = student.get('project_id')
            async.series([
                (cb) =>
                    if not student_project_id?
                        @set_activity(id:id, desc:"#{student_name}'s project doesn't exist, so create it.")
                        @create_student_project student, (err, x) =>
                            student_project_id = x; cb(err)
                    else
                        cb()
                (cb) =>
                    @set_activity(id:id, desc:"Now copy files to #{student_name}'s project")
                    salvus_client.copy_path_between_projects
                        src_project_id    : project_id
                        src_path          : assignment.get('path')
                        target_project_id : student_project_id
                        target_path       : assignment.get('target_path')
                        overwrite_newer   : assignment.get('overwrite_newer')
                        delete_missing    : assignment.get('delete_missing')
                        cb                : (err) =>
                            where = {table:'assignments', assignment_id:assignment.get('assignment_id')}
                            last_assignment = syncdb.select_one(where:where).last_assignment ? {}
                            last_assignment[student.get('student_id')] = {time: misc.mswalltime(), error:err}
                            @_update(set:{last_assignment:last_assignment}, where:where)
                            cb(err)
            ], (err) =>
                if err
                    return error("failed to send assignment to #{student_name} -- #{err}")
                @set_activity(id:id)
                cb?()
            )

        # Copy the given assignment to all non-deleted students, doing 10 copies in parallel at once.
        copy_assignment_to_all_students: (assignment, cb) =>
            id = @set_activity(desc:"Copying assignments to all students")
            error = (err) =>
                @set_activity(id:id)
                err="copy to student: #{err}"; @set_error(err); cb?(err)
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            errors = ''
            f = (student, cb) =>
                @copy_assignment_to_student assignment, student, (err) =>
                    if err
                        errors += "\n #{err}"
                    cb()
            async.mapLimit store.get_student_ids(deleted:false), 10, f, (err) =>
                if err
                    return error(errors)
                else
                    @set_activity(id:id)
                    cb?()

        copy_assignment: (type, assignment_id, student_id) =>
            # type = assigned, collected, graded
            switch type
                when 'assigned'
                    @copy_assignment_to_student(assignment_id, student_id)
                when 'collected'
                    @copy_assignment_from_student(assignment_id, student_id)
                when 'graded'
                    @return_assignment_to_student(assignment_id, student_id)
                else
                    @set_error("copy_assignment -- unknown type: #{type}")

        open_assignment: (type, assignment_id, student_id) =>
            # type = assigned, collected, graded
            assignment = store.get_assignment(assignment_id)
            student    = store.get_student(student_id)
            student_project_id = student.get('project_id')
            if not student_project_id?
                @set_error("open_assignment: student project not yet created")
                return
            # Figure out what to open
            switch type
                when 'assigned' # where project was copied in the student's project.
                    path = assignment.get('target_path')
                    proj = student_project_id
                when 'collected'   # where collected locally
                    path = assignment.get('collect_path') + '/' + student.get('student_id')  # TODO: refactor
                    proj = project_id
                when 'graded'  # where project returned
                    path = assignment.get('graded_path')  # refactor
                    proj = student_project_id
                else
                    @set_error("open_assignment -- unknown type: #{type}")
            if not proj?
                @set_error("no such project")
                return
            # Now open it
            flux.getProjectActions(proj).open_directory(path)

    actions = flux.createActions(name, CourseActions)

    class CourseStore extends Store
        constructor: (flux) ->
            super()
            ActionIds = flux.getActionIds(name)
            @register(ActionIds._set_to, @_set_to)
            @state = {}

        _set_to: (payload) => @setState(payload)

        get_activity: => @state.activity

        get_students: => @state.students

        get_student_name: (student) =>
            if typeof(student) == 'string' # id of a student
                student = @get_student(student)
            if not student?
                return 'student'
            return user_store.get_name(student.get('account_id')) ? student.get('email_address') ? 'student'

        get_student_ids: (opts) =>
            opts = defaults opts,
                deleted : false
            if not @state.students?
                return
            v = []
            @state.students.map (val, student_id) =>
                if !!val.get('deleted') == opts.deleted
                    v.push(student_id)
            return v

        get_student: (student) =>
            # return student with given id if a string; otherwise, just return student (the input)
            if typeof(student)=='string' then @state.students?.get(student) else student

        get_assignments: => @state.assignments

        get_sorted_assignments: =>
            # TODO: actually worry about sorting by due date (?)
            v = []
            @state.assignments.map (assignment, id) =>
                v.push(assignment)
            return v

        get_assignment: (assignment) =>
            # return assignment with given id if a string; otherwise, just return assignment (the input)
            if typeof(assignment) == 'string' then @state.assignments?.get(assignment) else assignment

        get_assignment_ids: (opts) =>
            opts = defaults opts,
                deleted : false   # if true return only deleted assignments
            if not @state.assignments?
                return
            v = []
            @state.assignments.map (val, assignment_id) =>
                if !!val.get('deleted') == opts.deleted
                    v.push(assignment_id)
            return v

        _num_nondeleted: (a) =>
            if not a?
                return
            n = 0
            a.map (val, key) =>
                if not val.get('deleted')
                    n += 1
            return n

        # number of non-deleted students
        num_students: => @_num_nondeleted(@get_students())

        # number of non-deleted assignments
        num_assignments: => @_num_nondeleted(@get_assignments())

        # get info about relation between a student and a given assignment
        student_assignment_info: (student, assignment) =>
            assignment = @get_assignment(assignment)
            student = @get_student(student)
            student_id = student.get('student_id')
            info =
                last_assignment    : assignment.get('last_assignment')?.get(student_id)?.toJS()   # important to be undefined if no info -- assumed in code
                last_collect       : assignment.get('last_collect')?.get(student_id)?.toJS()
                last_return_graded : assignment.get('last_return_graded')?.get(student_id)?.toJS()
                grade              : assignment.get('grades')?.get(student_id)
                student_id         : student_id
                assignment_id      : assignment.get('assignment_id')
            return info

    store = flux.createStore(name, CourseStore, flux)

    synchronized_db
        project_id : project_id
        filename   : course_filename
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
                        t.students[x.student_id] = misc.copy_without(x, 'table')
                    else if x.table == 'assignments'
                        t.assignments[x.assignment_id] = misc.copy_without(x, 'table')
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

    getInitialState: ->
        more : false

    render_student: ->
        if @state.more
            <a href='' onClick={(e)=>e.preventDefault();@setState(more:false)}><Icon name='caret-down' /> {@render_student_name()}</a>
        else
            <a href='' onClick={(e)=>e.preventDefault();@setState(more:true)}><Icon name='caret-right' /> {@render_student_name()}</a>

    render_student_name: ->
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

    render_assignments_info: ->
        for assignment in @props.flux.getStore(@props.name).get_sorted_assignments()
            <Row key={assignment.get('assignment_id')} >
                <Col key='path' md=4>
                    {assignment.get('path')}
                </Col>
                <Col key='info' md=8>
                    <StudentAssignmentInfo name={@props.name} flux={@props.flux}
                          student={@props.student} assignment={assignment} />
                </Col>
            </Row>

    render_more_info: ->
        # Info for each assignment about the student.
        <Col key='more'>
            {@render_assignments_info()}
        </Col>

    render: ->
        <Row style={entry_style}>
            <Col md=12 key='basic'>
                <Row>
                    <Col md=4>
                        <h5>{@render_student()}</h5>
                    </Col>
                    <Col md=4>
                        {@render_project()}
                    </Col>
                    <Col md=4>
                        {@render_delete_button()}
                    </Col>
                </Row>
            </Col>
            {@render_more_info() if @state.more}
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

    render_header: (num_omitted) ->
        <div>
            <Row>
                <Col md=3>
                    <Input
                        ref         = 'student_search_input'
                        type        = 'text'
                        placeholder = "Find students..."
                        value       = {@state.search}
                        buttonAfter = {@clear_search_button()}
                        onChange    = {=>@setState(search:@refs.student_search_input.getValue())}
                    />
                </Col>
                <Col md=3>
                    {<h5>(Omitting {num_omitted} students)</h5> if num_omitted}
                </Col>
                <Col md=5 mdOffset=1>
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

    compute_student_list: ->
        # TODO: good place to cache something...
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
        num_omitted = 0
        if @state.search
            words  = misc.split(@state.search.toLowerCase())
            search = (a) -> ((a.last_name ? '') + (a.first_name ? '') + (a.email_address ? '')).toLowerCase()
            match  = (s) ->
                for word in words
                    if s.indexOf(word) == -1
                        num_omitted += 1
                        return false
                return true
            v = (x for x in v when match(search(x)))

        return {students:v, num_omitted:num_omitted}

    render_students: (students) ->
        for x in students
            <Student key={x.student_id} student_id={x.student_id} student={@props.students.get(x.student_id)}
                     user_map={@props.user_map} flux={@props.flux} name={@props.name} />

    render :->
        {students, num_omitted} = @compute_student_list()
        <Panel header={@render_header(num_omitted)}>
            {@render_students(students)}
        </Panel>


entry_style =
    borderBottom  : '1px solid #aaa'
    paddingTop    : '5px'
    paddingBottom : '5px'

DirectoryLink = rclass
    displayName : "DirectoryLink"
    propTypes:
        project_id : rtypes.string.isRequired
        path       : rtypes.string.isRequired
        flux       : rtypes.object.isRequired
    open_path: ->
        @props.flux.getProjectActions(@props.project_id).open_directory(@props.path)
    render: ->
        <a href="" onClick={(e)=>e.preventDefault(); @open_path()}>{@props.path}</a>

StudentAssignmentInfo = rclass
    displayName : "CourseEditor-StudentAssignmentInfo"
    propTypes:
        name       : rtypes.string.isRequired
        flux       : rtypes.object.isRequired
        student    : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (student_id) or student immutable js object
        assignment : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (assignment_id) or assignment immutable js object

    open: (type, assignment_id, student_id) ->
        @props.flux.getActions(@props.name).open_assignment(type, assignment_id, student_id)

    copy: (type, assignment_id, student_id) ->
        @props.flux.getActions(@props.name).copy_assignment(type, assignment_id, student_id)

    render_last: (name, obj, type, info, enable_copy) ->
        open = => @open(type, info.assignment_id, info.student_id)
        copy = => @copy(type, info.assignment_id, info.student_id)
        v = [<span key='name'>{name+': '}</span>]
        if obj?
            if obj.time?
                v.push(<span key='time'>{new Date(obj.time).toLocaleString()}</span>)
                v.push(<a key='open' href='' onClick={(e)=>e.preventDefault();open()}>(open)</a>)
            if obj.error
                v.push(<span key='error' style={color:'red'}>{obj.error}</span>)
            if enable_copy
                v.push(<a key="copy" href='' onClick={(e)=>e.preventDefault();copy()}>(re-copy)</a>)
        else
            if enable_copy
                v.push(<a key="copy" href='' onClick={(e)=>e.preventDefault();copy()}>(copy)</a>)
        return v

    render: ->
        info = @props.flux.getStore(@props.name).student_assignment_info(@props.student, @props.assignment)
        <Row >
            <Col md=4 key='last_assignment'>
                {@render_last('Assigned', info.last_assignment, 'assigned', info, true)}
            </Col>
            <Col md=4 key='collect'>
                {@render_last('Collected', info.last_collect, 'collected', info, info.last_assignment?)}
            </Col>
            <Col md=4 key='return_graded'>
                {@render_last('Returned', info.last_return_graded, 'graded', info, info.last_collect?)}
            </Col>
        </Row>

StudentListForAssignment = rclass
    displayName : "CourseEditor-StudentListForAssignment"
    propTypes:
        name       : rtypes.string.isRequired
        flux       : rtypes.object.isRequired
        assignment : rtypes.object.isRequired
        students   : rtypes.object.isRequired
        user_map   : rtypes.object.isRequired

    render_student_info: (student) ->
        <StudentAssignmentInfo name={@props.name} flux={@props.flux}
              student={student} assignment={@props.assignment} />

    render_students :->
        v = immutable_to_list(@props.students, 'student_id')
        # fill in names, for use in sorting and searching (TODO: caching)
        for x in v
            if x.account_id?
                user = @props.user_map.get(x.account_id)
                x.first_name = user.get('first_name')
                x.last_name  = user.get('last_name')
                x.name = x.first_name + ' ' + x.last_name
                x.sort = (x.last_name + ' ' + x.first_name).toLowerCase()
            else if x.email_address?
                x.name = x.sort = x.email_address.toLowerCase()

        v.sort (a,b) ->
            return misc.cmp(a.sort, b.sort)

        for x in v
            <Row key={x.student_id}>
                <Col md=3>
                    {x.name}
                </Col>
                <Col md=9>
                    {@render_student_info(x.student_id)}
                </Col>
            </Row>
    render: ->
        <div>
            {@render_students()}
        </div>

Assignment = rclass
    displayName : "CourseEditor-Assignment"

    propTypes:
        name       : rtypes.string.isRequired
        assignment : rtypes.object.isRequired
        project_id : rtypes.string.isRequired
        flux       : rtypes.object.isRequired
        students   : rtypes.object.isRequired
        user_map   : rtypes.object.isRequired

    getInitialState: ->
        more : false

    render_more_header: ->
        <Row>
            <Col md=1>
                {@render_close_button()}
            </Col>
            <Col md=4>
                <h5>{@render_path_link()}</h5>
            </Col>
            <Col md=7>
                <ButtonToolbar style={float:'right'}>
                    {@render_assign_button()}
                    {@render_collect_button()}
                    {@render_return_button()}
                    {@render_delete_button()}
                </ButtonToolbar>
            </Col>
        </Row>

    render_more: ->
        <Row  style={entry_style}>
            <Col sm=12>
                <Panel header={@render_more_header()}>
                    <StudentListForAssignment flux={@props.flux} name={@props.name}
                        assignment={@props.assignment} students={@props.students}
                        user_map={@props.user_map} />
                </Panel>
            </Col>
        </Row>

    render_path_link: ->
        <DirectoryLink project_id={@props.project_id} path={@props.assignment.get('path')} flux={@props.flux} />

    render_close_button: ->
        <Button onClick={(e)=>e.preventDefault();@setState(more:false)}>
            <Icon name="times" />
        </Button>

    assign_assignment: ->
        # assign assignment to all (non-deleted) students
        @props.flux.getActions(@props.name).copy_assignment_to_all_students(@props.assignment)

    render_assign_button: ->
        <Button onClick={@assign_assignment}>
            <Icon name="share-square-o" /> Assign to all...
        </Button>

    collect_assignment: ->
        # assign assignment to all (non-deleted) students
        @props.flux.getActions(@props.name).copy_assignment_from_all_students(@props.assignment)

    render_collect_button: ->
        # disable the button if nothing ever assigned
        <Button onClick={@collect_assignment} disabled={(@props.assignment.get('last_assignment')?.size ? 0) == 0}>
            <Icon name="share-square-o" rotate="180" /> Collect from all...
        </Button>

    return_assignment: ->
        # Assign assignment to all (non-deleted) students.
        @props.flux.getActions(@props.name).return_assignment_to_all_students(@props.assignment)

    render_return_button: ->
        # Disable the button if nothing ever collected.
        <Button onClick={@return_assignment} disabled={(@props.assignment.get('last_collect')?.size ? 0) == 0}>
            <Icon name="share-square-o" /> Return to all...
        </Button>

    render_delete_button: ->
        <Button onClick={@delete_assignment}>
            <Icon name="trash" /> Delete
        </Button>

    render_summary_line: ->
        <Row style={entry_style}>
            <Col md=3>
                <h5><a href='' onClick={(e)=>e.preventDefault();@setState(more:true)}>{@props.assignment.get('path')}</a></h5>
            </Col>
        </Row>

    render: ->
        if @state.more
            @render_more()
        else
            @render_summary_line()

Assignments = rclass
    displayName : "CourseEditorAssignments"

    propTypes:
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        flux        : rtypes.object.isRequired
        assignments : rtypes.object.isRequired
        students    : rtypes.object.isRequired
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
                    # Omit any -collect directory (unless explicitly searched for).
                    # Omit any currently assigned directory, or any subdirectory of any
                    # assigned directory.
                    omit_prefix = []
                    @props.assignments.map (val, key) => omit_prefix.push(val.get('path'))
                    omit = (path) =>
                        if path.indexOf('-collect') != -1 and search.indexOf('collect') == -1
                            # omit assignment collection folders unless explicitly searched (could cause confusion...)
                            return true
                        for p in omit_prefix
                            if path == p
                                return true
                            if path.slice(0,p.length+1) == p+'/'
                                return true
                        return false
                    resp.directories = (path for path in resp.directories when not omit(path))
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

    render_header: (num_omitted) ->
        <div>
            <Row>
                <Col md=3>
                    <Input
                        ref         = 'assignment_search_input'
                        type        = 'text'
                        placeholder = "Find assignments..."
                        value       = {@state.search}
                        buttonAfter = {@clear_search_button()}
                        onChange    = {=>@setState(search:@refs.assignment_search_input.getValue())}
                    />
                </Col>
                <Col md=3>
                    {<h5>(Omitting {num_omitted} assignments)</h5> if num_omitted}
                </Col>
                <Col md=5 mdOffset=1>
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

    compute_assignment_list: ->
        v = immutable_to_list(@props.assignments, 'assignment_id')
        search = (@state.search ? '').trim().toLowerCase()
        num_omitted = 0
        if search
            words = misc.split(search)
            matches = (x) ->  # TODO: refactor with student search, etc.
                k = x.path.toLowerCase()
                for w in words
                    if k.indexOf(w) == -1
                        num_omitted += 1
                        return false
                return true
            v = (x for x in v when matches(x))
        v.sort (a,b) ->
            return misc.cmp(a.path.toLowerCase(), b.path.toLowerCase())
        return {assignments:v, num_omitted:num_omitted}

    render_assignments: (assignments) ->
        for x in assignments
            <Assignment key={x.assignment_id} assignment={@props.assignments.get(x.assignment_id)}
                    project_id={@props.project_id}  flux={@props.flux}
                    students={@props.students} user_map={@props.user_map}
                    name={@props.name}
                    />

    render :->
        {assignments, num_omitted} = @compute_assignment_list()
        <Panel header={@render_header(num_omitted)}>
            {@render_assignments(assignments)}
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
        activity    : rtypes.object   # status messages about current activity happening (e.g., things being assigned)
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        flux        : rtypes.object
        settings    : rtypes.object
        students    : rtypes.object
        assignments : rtypes.object
        user_map    : rtypes.object

    render_activity: ->
        for id, desc of @props.activity ? {}
            <div key={id}>
                <Icon name="circle-o-notch" spin /> {desc}
            </div>

    render_error: ->
        if @props.error
            <ErrorDisplay error={@props.error} onClose={=>@props.flux.getActions(@props.name).set_error('')} />

    render_students: ->
        if @props.flux? and @props.students? and @props.user_map?
            <Students flux={@props.flux} students={@props.students}
                      name={@props.name} project_id={@props.project_id}
                      user_map={@props.user_map} />

    render_assignments: ->
        if @props.flux? and @props.assignments? and @props.user_map? and @props.students?
            <Assignments flux={@props.flux} assignments={@props.assignments}
                name={@props.name} project_id={@props.project_id} user_map={@props.user_map} students={@props.students} />

    render_settings: ->
        if @props.flux? and @props.settings?
            <Settings flux={@props.flux} settings={@props.settings} name={@props.name} />

    render_student_header: ->
        n = @props.flux.getStore(@props.name)?.num_students()
        <span>
            <Icon name="users"/> Students {if n? then " (#{n})" else ""}
        </span>

    render_assignment_header: ->
        n = @props.flux.getStore(@props.name)?.num_assignments()
        <span>
            <Icon name="share-square-o"/> Assignments {if n? then " (#{n})" else ""}
        </span>

    render: ->
        <div>
            {@render_error()}
            {@render_activity()}
            <h4 style={float:'right'}>{@props.settings?.get('title')}</h4>
            <TabbedArea defaultActiveKey={'students'} animation={false}>
                <TabPane eventKey={'students'} tab={@render_student_header()}>
                    {@render_students()}
                </TabPane>
                <TabPane eventKey={'assignments'} tab={@render_assignment_header()}>
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

