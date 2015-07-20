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

*Make everything look pretty:*

- [ ] (1:30?) #now make quick simple textarea component that renders using markdown and submits using shift+enter...
- [ ] (0:30?) nicer space, etc., around "show/hide deleted [assignment|students] buttons"
- [ ] (0:45?) error messages in assignment page -- make hidable and truncate-able
- [ ] (1:00?) overall realtime status messages shouldn't move screen down; and should get maybe saved for session with scrollback
- [ ] (1:30?) date picker for assignment due date
- [ ] (0:30?) #unclear rename "Settings" to something else, maybe "Control".
- [ ] (0:45?) make Help component page center
- [ ] (0:30?) ability to clear ErrorDisplay's

*BUGS:*
- [ ] (1:00?) whenever open the course file, updating the collaborators for all projects.
- [ ] (1:00?) "(student used project...") time doesn't update, probably due to how computed and lack of dependency on users store.
- [ ] (1:00?) when creating new projects need to wait until they are in the store before configuring them.
- [ ] (1:00?) bug/race: when changing all titles/descriptions, some don't get changed.  I think this is because
      set of many titles/descriptions on table doesn't work.  Fix should be to only do the messages to the
      backend doing the actual sync at most once per second (?).  Otherwise we send a flury of conflicting
      sync messages.   Or at least wait for a response (?).
- [ ] (1:00?) (0:19+) fix bugs in opening directories in different projects using actions -- completely busted right now due to refactor of directory listing stuff....
- [ ] (1:30?) #speed cache stuff/optimize for speed

NEXT VERSION (after a release):
- [ ] (0:45?) #unclear button in settings to update collaborators, titles, etc. on all student projects
- [ ] (2:00?) #unclear way to send an email to every student in the class (require some sort of premium account?)
- [ ] (2:00?) #unclear automatically collect assignments on due date (?)
- [ ] (5:00?) #unclear realtime chat for courses...

DONE:
- [x] (0:45?) (0:30) triangles for show/hide assignment info like for students, and make student triangle bigger.
- [x] (2:00?) (2:46) make student-assignment info row look not totally horrible
- [x] (0:30?) (0:31) escape to clear search boxes
- [x] (0:15?) (0:05) uniformly sort assignments everywhere
- [x] (1:30?) (0:45) add student/assignment note fields
    - let enter/edit it in the students page
- [x] (1:30?) (0:23) add due date as a field to assignments:
    - way to edit it (date selector...?)
    - use it to sort assignments
- [x] (1:00?) (1:05) export all grades... to csv, excel file, python file, etc.?
- [x] (0:30?) (0:03) course title should derive from filename first time.
- [x] (1:00?) (0:55) grade: place to record the grade, display grade, etc.
- [x] (1:30?) (0:19) show the last time a student opened their project...
- [x] (1:00?) (1:25) help page -- integrate info
- [x] (0:45?) (0:04) delete old course code
- [x] (1:00?) (1:49) clean up after flux/react when closing the editor; clean up surrounding element
- [x] (0:30?) (0:10) delete confirms
- [x] (1:00?) (0:30) changing title/description needs to change it for all projects
- [x] (0:45?) (0:07) delete assignment; show deleted assignments
- [x] (0:45?) (0:37) delete student; show deleted students
- [x] (0:30?) (0:18) when searching, show how many things are not being shown.
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
{Button, ButtonToolbar, ButtonGroup, Input, Row, Col, Panel, TabbedArea, TabPane, Well} = require('react-bootstrap')
{ErrorDisplay, Help, Icon, LabeledRow, Loading, SearchInput, SelectorInput, TextInput, TimeAgo} = require('r_misc')
{User} = require('users')

flux_name = (project_id, course_filename) ->
    return "editor-#{project_id}-#{course_filename}"

primary_key =
    students    : 'student_id'
    assignments : 'assignment_id'

syncdbs = {}
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
            @set_all_student_project_titles(title)

        set_description: (description) =>
            @_update(set:{description:description}, where:{table:'settings'})
            @set_all_student_project_descriptions(description)

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

        delete_student: (student) =>
            student = store.get_student(student)
            @_update
                set   : {deleted : true}
                where : {student_id : student.get('student_id'), table : 'students'}

        undelete_student: (student) =>
            student = store.get_student(student)
            @_update
                set   : {deleted : false}
                where : {student_id : student.get('student_id'), table : 'students'}

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

        configure_project_title: (student_project_id, student_id) =>
            title = "#{store.get_student_name(student_id)} - #{store.state.settings.get('title')}"
            flux.getActions('projects').set_project_title(student_project_id, title)

        set_all_student_project_titles: (title) =>
            actions = flux.getActions('projects')
            store.get_students().map (student, student_id) =>
                project_id = student.get('project_id')
                project_title = "#{store.get_student_name(student_id)} - #{title}"
                if project_id?
                    actions.set_project_title(project_id, project_title)

        configure_project_description: (student_project_id, student_id) =>
            flux.getActions('projects').set_project_description(student_project_id, store.state.settings.get('description'))

        set_all_student_project_descriptions: (description) =>
            actions = flux.getActions('projects')
            store.get_students().map (student, student_id) =>
                project_id = student.get('project_id')
                if project_id?
                    actions.set_project_description(project_id, description)

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
            @configure_project_title(student_project_id, student_id)
            @configure_project_description(student_project_id, student_id)

        set_student_note: (student, note) =>
            student = store.get_student(student)
            where      = {table:'students', student_id:student.get('student_id')}
            @_update(set:{"note":note}, where:where)

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

        delete_assignment: (assignment) =>
            assignment = store.get_assignment(assignment)
            @_update
                set   : {deleted: true}
                where : {assignment_id: assignment.get('assignment_id'), table: 'assignments'}

        undelete_assignment: (assignment) =>
            assignment = store.get_assignment(assignment)
            @_update
                set   : {deleted: false}
                where : {assignment_id: assignment.get('assignment_id'), table: 'assignments'}

        set_grade: (assignment, student, grade) =>
            assignment = store.get_assignment(assignment)
            student    = store.get_student(student)
            where      = {table:'assignments', assignment_id:assignment.get('assignment_id')}
            grades     = syncdb.select_one(where:where).grades ? {}
            grades[student.get('student_id')] = grade
            @_update(set:{grades:grades}, where:where)

        _set_assignment_field: (assignment, name, val) =>
            assignment = store.get_assignment(assignment)
            where      = {table:'assignments', assignment_id:assignment.get('assignment_id')}
            @_update(set:{"#{name}":val}, where:where)

        set_due_date: (assignment, due_date) =>
            @_set_assignment_field(assignment, 'due_date', due_date)

        set_assignment_note: (assignment, note) =>
            @_set_assignment_field(assignment, 'note', note)

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

        get_student_note: (student) =>
            return @get_student(student)?.get('note')

        get_sorted_students: =>
            v = []
            @state.students.map (student, id) =>
                if not student.get('deleted')
                    v.push(student)
            v.sort (a,b) => misc.cmp(@get_student_name(a), @get_student_name(b))
            return v

        get_grade: (assignment, student) =>
            return @get_assignment(assignment)?.get('grades')?.get(@get_student(student)?.get('student_id'))

        get_due_date: (assignment) =>
            return @get_assignment(assignment)?.get('due_date')

        get_assignment_note: (assignment) =>
            return @get_assignment(assignment)?.get('note')

        get_assignments: => @state.assignments

        get_sorted_assignments: =>
            v = []
            @state.assignments.map (assignment, id) =>
                if not assignment.get('deleted')
                    v.push(assignment)
            f = (a) -> [a.get('due_date') ? 0, a.get('path')?.toLowerCase()]   # note: also used in compute_assignment_list
            v.sort (a,b) -> misc.cmp_array(f(a), f(b))
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
                syncdbs[name] = syncdb = _db
                i = course_filename.lastIndexOf('.')
                t = {settings:{title:course_filename.slice(0,i), description:'No description'}, assignments:{}, students:{}}
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
        confirm_delete: false
        editing_note: false
        note        : ''

    render_student: ->
        <a href='' onClick={(e)=>e.preventDefault();@setState(more:not @state.more)}>
            <Icon style={marginRight:'10px'}
                  name={if @state.more then 'caret-down' else 'caret-right'}/>
            {@render_student_name()}
        </a>

    render_student_name: ->
        account_id = @props.student.get('account_id')
        if account_id?
            <User account_id={account_id} user_map={@props.user_map} />
        else # TODO: maybe say something about invite status...?
            <span>{@props.student.get("email_address")}</span>

    open_project: ->
        @props.flux.getActions('projects').open_project(project_id:@props.student.get('project_id'))

    create_project: ->
        @props.flux.getActions(@props.name).create_student_project(@props.student_id)

    render_last_active: ->
        # get the last time the student edited this project somehow.
        last_active = @props.flux.getStore('projects').get_last_active(
                @props.student.get('project_id'))?.get(@props.student.get('account_id'))
        if last_active   # could be 0 or undefined
            return <span>Student last used project <TimeAgo date={last_active} /></span>
        else
            return <span>Student never opened project</span>

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

        student_project_id = @props.student.get('project_id')
        if student_project_id?
            <Button onClick={@open_project}>
                <Icon name="edit" /> Open student project
            </Button>
        else
            <Button onClick={@create_project}>
                <Icon name="plus-circle" /> Create student project
            </Button>

    delete_student: ->
        @props.flux.getActions(@props.name).delete_student(@props.student)
        @setState(confirm_delete:false)

    undelete_student: ->
        @props.flux.getActions(@props.name).undelete_student(@props.student)

    render_confirm_delete: ->
        if @state.confirm_delete
            <div>
                Are you sure you want to delete this student (you can always undelete them later)?&nbsp;
                <ButtonToolbar>
                    <Button onClick={=>@setState(confirm_delete:false)}>
                        NO, do not delete
                    </Button>
                    <Button onClick={@delete_student} bsStyle='danger'>
                        <Icon name="trash" /> Delete
                    </Button>
                </ButtonToolbar>
            </div>

    render_delete_button: ->
        if not @state.more
            return
        if @state.confirm_delete
            return @render_confirm_delete()
        if @props.student.get('deleted')
            <Button onClick={@undelete_student}>
                <Icon name="trash-o" /> Undelete
            </Button>
        else
            <Button onClick={=>@setState(confirm_delete:true)} bsStyle='danger'>
                <Icon name="trash" /> Delete
            </Button>

    render_title_due: (assignment) ->
        date = assignment.get('due_date')
        if date
            <span>(Due: <BigTime date={date} />)</span>

    render_title: (assignment) ->
        <span>
            <em>{assignment.get('path')}</em> {@render_title_due(assignment)}
        </span>

    render_assignments_info_rows: ->
        store = @props.flux.getStore(@props.name)
        for assignment in store.get_sorted_assignments()
            grade = store.get_grade(assignment, @props.student)
            <StudentAssignmentInfo
                  key={assignment.get('assignment_id')}
                  title={@render_title(assignment)}
                  name={@props.name} flux={@props.flux}
                  student={@props.student} assignment={assignment}
                  grade={grade} />

    render_assignments_info: ->
        return [<StudentAssignmentInfoHeader key='header' title="Assignment" />, @render_assignments_info_rows()]

    edit_note: (e) ->
        e?.preventDefault()
        @setState(editing_note:true, note:@props.student.get('note'))

    save_note: (e) ->
        e?.preventDefault()
        @setState(editing_note:false)
        @props.flux.getActions(@props.name).set_student_note(@props.student, @state.note)

    render_note: ->
        if @state.editing_note
            <Row key='note' style={borderTop:'1px solid #aaa', marginTop: '10px'}>
                <Col xs=2>
                    Notes about student <a href='' onClick={@save_note}>(save)</a>
                </Col>
                <Col xs=10>
                    <form onSubmit={@save_note}>
                        <Input ref="note_input"
                            type = 'textarea'
                            rows = 4
                            placeholder = 'Notes about student (e.g., student id)'
                            value = {@state.note}
                            onChange ={=>@setState(note:@refs.note_input.getValue())}
                            onKeyDown={(e)=>if e.keyCode==27 then @setState(editing_note:false)}
                        />
                    </form>
                </Col>
            </Row>

        else
            <Row key='note' style={borderTop:'1px solid #aaa', marginTop: '10px'}>
                <Col xs=2>
                    Notes about student <a href='' onClick={@edit_note}>(edit)</a>
                </Col>
                <Col xs=10>
                    <pre>
                        {@props.student.get('note')}
                    </pre>
                </Col>
            </Row>

    render_more_info: ->
        # Info for each assignment about the student.
        v = []
        v.push <Row key='more'>
                <Col md=12>
                    {@render_assignments_info()}
                </Col>
            </Row>
        v.push(@render_note())
        return v

    render_basic_info: ->
        <Row key='basic'>
            <Col md=2>
                <h4>
                    {@render_student()}
                    {@render_deleted()}
                </h4>
            </Col>
            <Col md=3>
                {@render_last_active()}
            </Col>
            <Col md=3>
                {@render_project()}
            </Col>
            <Col md=2 mdOffset=2>
                {@render_delete_button()}
            </Col>
        </Row>

    render_deleted: ->
        if @props.student.get('deleted')
            <b> (deleted)</b>

    render: ->

        <Row style={if @state.more then selected_entry_style else entry_style}>
            <Col xs=12>
                {@render_basic_info()}
                {@render_more_info() if @state.more}
            </Col>
        </Row>

Students = rclass
    propTypes:
        name         : rtypes.string.isRequired
        flux         : rtypes.object.isRequired
        project_id   : rtypes.string.isRequired
        students     : rtypes.object.isRequired
        user_map     : rtypes.object.isRequired

    displayName : "CourseEditorStudents"

    getInitialState: ->
        err           : undefined
        search        : ''
        add_search    : ''
        add_searching : false
        add_select    : undefined
        show_deleted  : false

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

    render_help: ->
        <Help title="Managing Students">
            <p>
            <b>Add a student</b> to your course by entering their name or email address
            in the "Add student..." box.  Using
            email is best, since you can be certain of who
            you are adding; also, if your student does not
            have an account, they will receive an invitation via email when you
            create their project.  Add many students at once by pasting in a list
            separated by commas.</p>

            <p>
            <b>Create the project</b> for each student by clicking the
            "Create project" button; projects are also automatically
            created if you push out an assignment.  You
            own the project, the student is a collaborator, and the
            title and description are set based on the course title and description.
            Student projects are hidden by default from your main projects page (see
            the Hidden tab).
            </p>

            <p>
            <b>Information about assignments</b> appears when you click on
            a student, including when they received the assignment, when
            you collected it from them, and information about grades.
            </p>
        </Help>

    render_header: (num_omitted) ->
        <div>
            <Row>
                <Col md=3>
                    <SearchInput
                        placeholder = "Find students..."
                        value       = {@state.search}
                        on_change   = {(value)=>@setState(search:value)}
                    />
                </Col>
                <Col md=3>
                    {<h5>(Omitting {num_omitted} students)</h5> if num_omitted}
                </Col>
                <Col md=1>
                    {@render_help()}
                </Col>
                <Col md=5>
                    <form onSubmit={@do_add_search}>
                        <Input
                            ref         = 'student_add_input'
                            type        = 'text'
                            placeholder = "Add student by name or email address..."
                            value       = {@state.add_search}
                            buttonAfter = {@student_add_button()}
                            onChange    = {=>@setState(add_search:@refs.student_add_input.getValue())}
                            onKeyDown   = {(e)=>if e.keyCode==27 then @setState(add_search:'', add_select:undefined)}
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

        # Deleted students
        w = (x for x in v when x.deleted)
        num_deleted = w.length
        v = (x for x in v when not x.deleted)
        if @state.show_deleted  # but show at the end...
            v = v.concat(w)

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

        return {students:v, num_omitted:num_omitted, num_deleted:num_deleted}

    render_students: (students) ->
        for x in students
            <Student key={x.student_id} student_id={x.student_id} student={@props.students.get(x.student_id)}
                     user_map={@props.user_map} flux={@props.flux} name={@props.name} />

    render_show_deleted: (num_deleted) ->
        if @state.show_deleted
            <Button onClick={=>@setState(show_deleted:false)}>Hide {num_deleted} deleted students</Button>
        else
            <Button onClick={=>@setState(show_deleted:true,search:'')}>Show {num_deleted} deleted students</Button>

    render :->
        {students, num_omitted, num_deleted} = @compute_student_list()
        <Panel header={@render_header(num_omitted, num_deleted)}>
            {@render_students(students)}
            {@render_show_deleted(num_deleted) if num_deleted}
        </Panel>

entry_style =
    borderBottom  : '1px solid #aaa'
    paddingTop    : '5px'
    paddingBottom : '5px'

selected_entry_style = misc.merge
    border        : '1px solid #888'
    boxShadow     : '5px 5px 5px grey'
    borderRadius  : '5px'
    marginBottom  : '10px',
    entry_style

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

BigTime = rclass
    displayName : "CourseEditor-BigTime"
    render: ->
        date = @props.date
        if not date?
            return
        if typeof(date) == 'string'
            return <span>{date}</span>
        if typeof(date) == "number"
            date = new Date(date)
        <span>
            <TimeAgo date={date} /> ({date.toLocaleString()})
        </span>

StudentAssignmentInfoHeader = rclass
    propTypes : ->
        title : rtypes.string.isRequired
    displayName : "CourseEditor-StudentAssignmentInfoHeader"
    render: ->
        <Row>
            <Col md=2 key='title'>
                <b>{@props.title}</b>
            </Col>
            <Col md=10 key="rest">
                <Row>
                    <Col md=3 key='last_assignment'>
                        <b>1. Assign to Student</b>
                    </Col>
                    <Col md=3 key='collect'>
                        <b>2. Collect from Student</b>
                    </Col>
                    <Col md=3 key='grade'>
                        <b>3. Grade</b>
                    </Col>
                    <Col md=3 key='return_graded'>
                        <b>4. Return to Student</b>
                    </Col>
                </Row>
            </Col>
        </Row>

StudentAssignmentInfo = rclass
    displayName : "CourseEditor-StudentAssignmentInfo"
    propTypes:
        name       : rtypes.string.isRequired
        flux       : rtypes.object.isRequired
        title      : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired
        student    : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (student_id) or student immutable js object
        assignment : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (assignment_id) or assignment immutable js object
        grade      : rtypes.string

    getInitialState: ->
        editing_grade : false

    open: (type, assignment_id, student_id) ->
        @props.flux.getActions(@props.name).open_assignment(type, assignment_id, student_id)

    copy: (type, assignment_id, student_id) ->
        @props.flux.getActions(@props.name).copy_assignment(type, assignment_id, student_id)

    save_grade: (e) ->
        e?.preventDefault()
        @props.flux.getActions(@props.name).set_grade(@props.assignment, @props.student, @state.grade)
        @setState(editing_grade:false)

    render_grade_score: ->
        if @state.editing_grade
            <form key='grade' onSubmit={@save_grade}>
                <Input autoFocus value={@state.grade} ref='grade_input' type='text' placeholder='Grade'
                       onChange={=>@setState(grade:@refs.grade_input.getValue())}
                       onKeyDown={(e)=>if e.keyCode == 27 then @setState(grade:@props.grade, editing_grade:false)}
                />
            </form>
        else
            <div key='grade' onClick={=>console.log("grade clicked!")}>
                Grade: {@props.grade}
            </div>

    render_grade: (info) ->
        if not info.last_collect?
            return  # waiting to collect first
        <div>
            <ButtonGroup>
                <Button key='open' bsStyle='primary' onClick={=>@open('collected', info.assignment_id, info.student_id)}>
                    <Icon name="folder-open-o" /> Open
                </Button>
                <Button key='edit' onClick={=>@setState(grade:@props.grade, editing_grade:true)}>
                    Edit grade
                </Button>
            </ButtonGroup>
            {@render_grade_score()}
        </div>

    render_last_time: (name, time) ->
        <div key='time' style={color:"#666"}>
            {name}ed <BigTime date={time} />
        </div>

    render_open_recopy: (name, open, copy) ->
        <ButtonGroup key='open_recopy'>
            <Button key="copy" bsStyle='warning' onClick={copy}>
                <Icon name='share-square-o' rotate={"180" if name=='Collect'}/> Re-{name.toLowerCase()}
            </Button>
            <Button key='open' bsStyle='primary' onClick={open}><Icon name="folder-open-o" /> Open</Button>
        </ButtonGroup>

    render_copy: (name, copy) ->
        <Button key="copy" bsStyle='primary' onClick={copy}>
            <Icon name="share-square-o" rotate={"180" if name=='Collect'}/> {name}
        </Button>

    render_error: (error) ->
        <ErrorDisplay key='error' error={error} />

    render_last: (name, obj, type, info, enable_copy) ->
        open = => @open(type, info.assignment_id, info.student_id)
        copy = => @copy(type, info.assignment_id, info.student_id)
        obj ?= {}
        v = []
        if enable_copy
            if obj.time
                v.push(@render_open_recopy(name, open, copy))
            else
                v.push(@render_copy(name, copy))
        if obj.time
            v.push(@render_last_time(name, obj.time))
        if obj.error
            v.push(@render_error(obj.error))
        return v

    render: ->
        info = @props.flux.getStore(@props.name).student_assignment_info(@props.student, @props.assignment)
        <Row style={borderTop:'1px solid #aaa'}>
            <Col md=2 key="title">
                {@props.title}
            </Col>
            <Col md=10 key="rest">
                <Row>
                    <Col md=3 key='last_assignment'>
                        {@render_last('Assign', info.last_assignment, 'assigned', info, true)}
                    </Col>
                    <Col md=3 key='collect'>
                        {@render_last('Collect', info.last_collect, 'collected', info, info.last_assignment?)}
                    </Col>
                    <Col md=3 key='grade'>
                        {@render_grade(info)}
                    </Col>
                    <Col md=3 key='return_graded'>
                        {@render_last('Return', info.last_return_graded, 'graded', info, info.last_collect?) if @props.grade}
                    </Col>
                </Row>
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

    render_student_info: (student_id) ->
        store = @props.flux.getStore(@props.name)
        <StudentAssignmentInfo
              key     = {student_id}
              title   = {store.get_student_name(student_id)}
              name    = {@props.name}
              flux    = {@props.flux}
              student = {student_id}
              assignment = {@props.assignment}
              grade   = {store.get_grade(@props.assignment, student_id)} />

    render_students :->
        v = immutable_to_list(@props.students, 'student_id')
        # fill in names, for use in sorting and searching (TODO: caching)
        v = (x for x in v when not x.deleted)
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
            @render_student_info(x.student_id)

    render: ->
        <div>
            <StudentAssignmentInfoHeader key='header' title="Student" />
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
        confirm_delete : false
        edit_due : false
        due_date : undefined
        editing_note : false
        note : ''

    edit_due_date: ->
        @setState(edit_due:true, due_date:@props.assignment.get('due_date'))

    save_due_date: (e) ->
        e?.preventDefault()
        @props.flux.getActions(@props.name).set_due_date(@props.assignment, @state.due_date)
        @setState(edit_due:false)

    render_due: ->
        if @state.edit_due
            <form onSubmit={@save_due_date}>
                <Input autoFocus value={@state.due_date} ref='due_date_input'
                       type='text' placeholder='Due date'
                       onChange={=>@setState(due_date:@refs.due_date_input.getValue())}
                       onKeyDown={(e)=>if e.keyCode==27 then @setState(edit_due:false)}
                />
            </form>
        else
            due_date = @props.assignment.get('due_date')
            <div>
                {"#{due_date}"} <Button onClick={=>@edit_due_date()}>Edit</Button>
            </div>

    edit_note: (e) ->
        e?.preventDefault()
        @setState(editing_note:true, note:@props.assignment.get('note'))

    save_note: (e) ->
        e?.preventDefault()
        @setState(editing_note:false)
        @props.flux.getActions(@props.name).set_assignment_note(@props.assignment, @state.note)

    render_note: ->
        if @state.editing_note
            <Row key='note'>
                <Col xs=3>
                    Notes (not visible to students) -- <a href='' onClick={@save_note}>save</a>:
                </Col>
                <Col xs=9>
                    <form onSubmit={@save_note}>
                        <Input ref="note_input"
                            type = 'textarea'
                            rows = 4
                            placeholder = 'Notes about this assignment'
                            value = {@state.note}
                            onChange ={=>@setState(note:@refs.note_input.getValue())}
                            onKeyDown={(e)=>if e.keyCode==27 then @setState(editing_note:false)}
                        />
                    </form>
                </Col>
            </Row>

        else
            <Row key='note'>
                <Col xs=3>
                    Notes (not visible to students) -- <a href='' onClick={@edit_note}>edit</a>:
                </Col>
                <Col xs=9>
                    <pre>
                        {@props.assignment.get('note')}
                    </pre>
                </Col>
            </Row>

    render_more_header: ->
        <Row key='header1'>
            <Col md=3>
                <h4>{@render_path_link()}</h4>
            </Col>
            <Col md=3>
                Due: {@render_due()}
            </Col>
            <Col md=6>
                <ButtonToolbar style={float:'right'}>
                    {@render_assign_button()}
                    {@render_collect_button()}
                    {@render_return_button()}
                    {@render_delete_button()}
                </ButtonToolbar>
            </Col>
        </Row>

    render_more: ->
        <Row key='more'>
            <Col sm=12>
                <Panel header={@render_more_header()}>
                    <StudentListForAssignment flux={@props.flux} name={@props.name}
                        assignment={@props.assignment} students={@props.students}
                        user_map={@props.user_map} />
                    {@render_note()}
                </Panel>
            </Col>
        </Row>

    render_path_link: ->
        <DirectoryLink project_id={@props.project_id} path={@props.assignment.get('path')} flux={@props.flux} />

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

    delete_assignment: ->
        @props.flux.getActions(@props.name).delete_assignment(@props.assignment)
        @setState(confirm_delete:false)

    undelete_assignment: ->
        @props.flux.getActions(@props.name).undelete_assignment(@props.assignment)

    render_confirm_delete: ->
        if @state.confirm_delete
            <div>
                Are you sure you want to delete this assignment (you can always undelete it later)?&nbsp;
                <ButtonToolbar>
                    <Button onClick={=>@setState(confirm_delete:false)}>
                        NO, do not delete
                    </Button>
                    <Button onClick={@delete_assignment} bsStyle='danger'>
                        <Icon name="trash" /> Delete
                    </Button>
                </ButtonToolbar>
            </div>

    render_delete_button: ->
        if @state.confirm_delete
            return @render_confirm_delete()
        if @props.assignment.get('deleted')
            <Button onClick={@undelete_assignment}>
                <Icon name="trash-o" /> Undelete
            </Button>
        else
            <Button onClick={=>@setState(confirm_delete:true)} bsStyle='danger'>
                <Icon name="trash" /> Delete
            </Button>

    render_summary_due_date: ->
        due_date = @props.assignment.get('due_date')
        if due_date
            <span>Due: {"#{due_date}"}</span>

    render_assignment_name: ->
        <span>
            {@props.assignment.get('path')}
            {<b> (deleted)</b> if @props.assignment.get('deleted')}
        </span>

    render_assignment_title_link: ->
        <a href='' onClick={(e)=>e.preventDefault();@setState(more:not @state.more)}>
            <Icon style={marginRight:'10px'}
                  name={if @state.more then 'caret-down' else 'caret-right'} />
            {@render_assignment_name()}
        </a>

    render_summary_line: ->
        <Row key='summary'>
            <Col md=6>
                <h4>
                    {@render_assignment_title_link()}
                </h4>
            </Col>
            <Col md=6>
                {@render_summary_due_date()}
            </Col>
        </Row>

    render: ->
        <Row style={if @state.more then selected_entry_style else entry_style}>
            <Col xs=12>
                {@render_summary_line()}
                {@render_more() if @state.more}
            </Col>
        </Row>

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
        show_deleted  : false      # whether or not to show deleted assignments on the bottom

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

    render_help: ->
        <Help title="Managing Assignments">
            <p><b>An "assignment"</b> is any directory in your project, which may contain any files (or subdirectories).
            Add an assignment to your course by searching for the directory name in the search box on the right.
            </p>

            <p><b>Make an assignment available</b> to all students by clicking "Assign to all".
            (Currently students will
            not be explicitly notified that you make an assignment available to them.)
            </p>

            <p> <b>Collect an assignment</b> from your students by clicking "Collect from all...".
            (Currently there is no way to schedule collection at a specific time -- it happens when you click the button;
            click the button again to update the collected files.)
            You can then open each completed assignment and edit the student files, indicating grades
            on each problem, etc.
            </p>


            <p><b>Return the graded assignment</b> to your students by clicking "Return to all..."
            If the assignment folder is called <tt>assignment1</tt>, then the graded version will appear
            in the student project as <tt>homework1-graded</tt>.
            </p>
        </Help>

    render_header: (num_omitted) ->
        <div>
            <Row>
                <Col md=3>
                    <SearchInput
                        placeholder = "Find assignments..."
                        value       = {@state.search}
                        on_change   = {(value)=>@setState(search:value)}
                    />
                </Col>
                <Col md=3>
                    {<h5>(Omitting {num_omitted} assignments)</h5> if num_omitted}
                </Col>
                <Col md=1>
                    {@render_help()}
                </Col>
                <Col md=5>
                    <form onSubmit={@do_add_search}>
                        <Input
                            ref         = 'assignment_add_input'
                            type        = 'text'
                            placeholder = "Add assignment by folder name..."
                            value       = {@state.add_search}
                            buttonAfter = {@assignment_add_search_button()}
                            onChange    = {=>@setState(add_search:@refs.assignment_add_input.getValue())}
                            onKeyDown   = {(e)=>if e.keyCode==27 then @setState(add_search:'', add_select:undefined)}
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
        f = (a) -> [a.due_date ? 0, a.path?.toLowerCase()]  # also used in get_sorted_assignments
        v.sort (a,b) -> misc.cmp_array(f(a), f(b))

        # Deleted assignments
        w = (x for x in v when x.deleted)
        num_deleted = w.length
        v = (x for x in v when not x.deleted)
        if @state.show_deleted  # but show at the end...
            v = v.concat(w)

        return {assignments:v, num_omitted:num_omitted, num_deleted:num_deleted}

    render_assignments: (assignments) ->
        for x in assignments
            <Assignment key={x.assignment_id} assignment={@props.assignments.get(x.assignment_id)}
                    project_id={@props.project_id}  flux={@props.flux}
                    students={@props.students} user_map={@props.user_map}
                    name={@props.name}
                    />

    render_show_deleted: (num_deleted) ->
        if @state.show_deleted
            <Button onClick={=>@setState(show_deleted:false)}>Hide {num_deleted} deleted assignments</Button>
        else
            <Button onClick={=>@setState(show_deleted:true,search:'')}>Show {num_deleted} deleted assignments</Button>

    render :->
        {assignments, num_omitted, num_deleted} = @compute_assignment_list()
        <Panel header={@render_header(num_omitted)}>
            {@render_assignments(assignments)}
            {@render_show_deleted(num_deleted) if num_deleted}
        </Panel>

Settings = rclass
    displayName : "CourseEditorSettings"
    propTypes:
        flux        : rtypes.object.isRequired
        name        : rtypes.string.isRequired
        path        : rtypes.string.isRequired
        settings    : rtypes.object.isRequired
        project_id  : rtypes.string.isRequired

    render_title_desc_header: ->
        <Row>
            <Col xs=4>
                <h4>
                    Title and description
                </h4>
            </Col>
            <Col xs=8>
                <Help title="Changing the course title and description">
                    <p>Set the course title and description here.
                    When you change the title or description, the corresponding
                    title and description of each student project will be updated.
                    The description is set to this description, and the title
                    is set to the student name followed by this title.
                    </p>

                    <p>Use the description to provide additional information about
                    the course, e.g., a link to the main course website.
                    </p>
                </Help>
            </Col>
        </Row>

    render_title_description: ->
        if not @props.settings?
            return <Loading />
        <Panel header={@render_title_desc_header()}>
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

    render_grades_header: ->
        <Row>
            <Col xs=4>
                <h4>
                    Export grades
                </h4>
            </Col>
            <Col xs=8>
                <Help title="Export grades">
                    <p>
                    You may export all the grades you have recorded
                    for students in your course to a csv file.
                    </p>
                </Help>
            </Col>
        </Row>

    path: (ext) ->
        p = @props.path
        i = p.lastIndexOf('.')
        return p.slice(0,i) + '.' + ext

    open_file: (path) ->
        @props.flux.getProjectActions(@props.project_id).open_file(path:path,foreground:true)

    write_file: (path, content) ->
        salvus_client.write_text_file_to_project
            project_id : @props.project_id
            path       : path
            content    : content
            cb         : (err) =>
                if not err
                    @open_file(path)

    save_grades_to_csv: ->
        store = @props.flux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        # TODO: actually learn CSV format... (e.g., what if comma in path)
        content = "Student Name,"
        content += (assignment.get('path') for assignment in assignments).join(',') + '\n'
        for student in store.get_sorted_students()
            grades = ("'#{store.get_grade(assignment, student) ? ''}'" for assignment in assignments).join(',')
            line = store.get_student_name(student) + "," + grades
            content += line + '\n'
        @write_file(@path('csv'), content)

    save_grades_to_py: ->
        content = "assignments = ['Assignment 1', 'Assignment 2']\nstudents=[\n    {'name':'Foo Bar', 'grades':[85,37]},\n    {'name':'Bar None', 'grades':[15,50]}\n]\n"
        store = @props.flux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        # TODO: actually learn CSV format... (e.g., what if comma in path)
        content = "assignments = ["
        content += ("'#{assignment.get('path')}'" for assignment in assignments).join(',') + ']\n'

        content += 'students = [\n'
        for student in store.get_sorted_students()
            grades = (("'#{store.get_grade(assignment, student) ? ''}'") for assignment in assignments).join(',')
            line = "    {'name':'#{store.get_student_name(student)}', 'grades':[#{grades}]},"
            content += line + '\n'
        content += ']\n'
        @write_file(@path('py'), content)

    render_save_grades: ->
        <Panel header={@render_grades_header()}>
            Save grades to...
            <Button onClick={@save_grades_to_csv}>CSV file...</Button>
            <Button onClick={@save_grades_to_py}>Python file...</Button>
        </Panel>

    render :->
        <Row>
            <Col sm=6>
                {@render_title_description()}
            </Col>
            <Col sm=6>
                {@render_save_grades()}
            </Col>
        </Row>

CourseEditor = rclass
    displayName : "CourseEditor"

    propTypes:
        error        : rtypes.string
        activity     : rtypes.object   # status messages about current activity happening (e.g., things being assigned)
        name         : rtypes.string.isRequired
        path         : rtypes.string.isRequired
        project_id   : rtypes.string.isRequired
        flux         : rtypes.object
        settings     : rtypes.object
        students     : rtypes.object
        assignments  : rtypes.object
        user_map     : rtypes.object

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
            <Settings flux={@props.flux} settings={@props.settings}
                      name={@props.name} project_id={@props.project_id}
                      path={@props.path} />

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
                    <div style={marginTop:'8px'}></div>
                    {@render_students()}
                </TabPane>
                <TabPane eventKey={'assignments'} tab={@render_assignment_header()}>
                    <div style={marginTop:'8px'}></div>
                    {@render_assignments()}
                </TabPane>
                <TabPane eventKey={'settings'} tab={<span><Icon name="wrench"/> Settings</span>}>
                    <div style={marginTop:'8px'}></div>
                    {@render_settings()}
                </TabPane>
            </TabbedArea>
        </div>

render = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    <FluxComponent flux={flux} connectToStores={[name, 'users']} >
        <CourseEditor name={name} project_id={project_id} path={path} />
    </FluxComponent>


exports.render_editor_course = (project_id, path, dom_node, flux) ->
    init_flux(flux, project_id, path)
    React.render(render(flux, project_id, path), dom_node)

exports.hide_editor_course = (project_id, path, dom_node, flux) ->
    React.unmountComponentAtNode(dom_node)

exports.show_editor_course = (project_id, path, dom_node, flux) ->
    React.render(render(flux, project_id, path), dom_node)

exports.free_editor_course = (project_id, path, dom_node, flux) ->
    name = flux_name(project_id, path)
    db = syncdbs[name]
    if not db?
        return
    flux.removeActions(name)
    flux.removeStore(name)
    db.destroy()
    React.unmountComponentAtNode(dom_node)
    delete syncdbs[name]

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

