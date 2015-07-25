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

- [ ] (1:30?) #now make the assign/collect/return all buttons have a confirmation and an option to only collect from students not already collected from already; this will clarify what happens on re-assign, etc.
- [ ] (0:45?) while doing any of three steps of workflow, set something in database and store, which locks things (with a time limit and spinner) to prevent double click.
- [ ] (0:30?) xs mobile assignment looks bad -- need a fullscreen toggle thing.
- [ ] (1:00?) make it possible to create a project without ever opening it and use this


NEXT VERSION (after a release):
- [ ] (1:00?) ui -- maybe do a max-height on listing of student assignments or somewhere and overfloat auto
- [ ] (1:00?) provide a way to enable/disable tooltips on a per-application basis
- [ ] (1:30?) #speed cache stuff/optimize for speed
- [ ] (0:30?) #unclear rename "Settings" to something else, maybe "Control".
- [ ] (0:45?) #unclear button in settings to update collaborators, titles, etc. on all student projects
- [ ] (2:00?) #unclear way to send an email to every student in the class (require some sort of premium account?)
- [ ] (2:00?) #unclear automatically collect assignments on due date (?)
- [ ] (5:00?) #unclear realtime chat for courses...
- [ ] (8:00?) #unclear way to show other viewers that a field is being actively edited by a user (no idea how to do this in react)

DONE:
- [x] (1:00?) (1:21) typing times into the date picker doesn't work -- probably needs config -- see http://jquense.github.io/react-widgets/docs/#/datetime-picker
- [x] (1:00?) (2:41) BUG: race: when changing all titles/descriptions, some don't get changed.  I think this is because
      set of many titles/descriptions on table doesn't work.  Fix should be to only do the messages to the
      backend doing the actual sync at most once per second (?).  Otherwise we send a flury of conflicting
      sync messages.   Or at least wait for a response (?).
- [x] (1:30?) (0:54) just create the student project when adding student -- FIXES: adding a non-collaborator student to a course makes it impossible to get their name -- see compute_student_list.  This is also a problem for project collaborators that haven't been added to all student projects.
- [x] (1:00?) (0:40?) whenever owner opens the course file, update the collaborators/titles/descriptions for all projects.
- [x] (1:30?) (0:30) BUG: search feels slow with 200 students; showing students for assignment feels slow.; also add grey alternating lines
- [x] (1:00?) (0:30) bug fix -- "(student used project...") time doesn't update, probably due to how computed and lack of dependency on projects store.
- [x] (1:00?) (1:07) save status info (so know if not saving due to network, etc.)
- [x] (1:00?) (5:36) fix bugs in opening directories in different projects using actions -- completely busted right now due to refactor of directory listing stuff....
- [x] (1:00?) (4:00) #now ensuring opening and closing a course doesn't leak memory
- [x] (0:30?) (0:01) #now set_project_error/set_student_error -- implement or remove (x)
- [x] (3:38) ensure actions don't return anything; clarify flux.
    Problems:
       - create_student_project returns project_id.
       - copy_assignment_from_student, etc. returns error (?)
    Creating student project:
      - need to start the process and move it forward by watching for change events on stores rather than using callbacks.
    When creating new projects need to wait until they are in the store before configuring them.
- [x] (0:30?) bug -- border bottom vanishes upon toggle/untoggle of students or assignments
- [x] (0:45?) make Help component page center better
- [x] (1:00?) (4:07) add tooltips/help popups
- [x] (0:45?) (1:13) ui button colors -- make the next button you should click related to workflow be blue.
- [x] (0:45?) (0:42) error messages in assignment page -- make hidable and truncate-able (ability to clear ErrorDisplay's)
- [x] (0:20?) (0:23) truncate long assignment titles in student displays
- [x] (1:00?) (1:08) overall realtime status messages shouldn't move screen down; and should get maybe saved for session with scrollback
- [x] (0:30?) (0:52) nicer space, etc., around "show/hide deleted [assignment|students] buttons"
- [x] (1:30?) (0:41) #now date picker for assignment due date
- [x] (1:30?) (1:57) make quick simple textarea component that renders using markdown and submits using shift+enter...
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

{Alert, Button, ButtonToolbar, ButtonGroup, Input, Row, Col,
    Panel, Popover, TabbedArea, TabPane, Well} = require('react-bootstrap')

{ActivityDisplay, CloseX, DateTimePicker, ErrorDisplay, Help, Icon, LabeledRow, Loading, MarkdownInput,
    SaveButton, SearchInput, SelectorInput, TextInput, TimeAgo, Tip} = require('r_misc')

{User} = require('users')

flux_name = (project_id, course_filename) ->
    return "editor-#{project_id}-#{course_filename}"

primary_key =
    students    : 'student_id'
    assignments : 'assignment_id'

STEPS = ['assignment', 'collect', 'return_graded']
previous_step = (step) ->
    switch step
        when 'collect'
            return 'assignment'
        when 'return_graded'
            return 'collect'

syncdbs = {}
exports.init_flux = init_flux = (flux, course_project_id, course_filename) ->
    the_flux_name = flux_name(course_project_id, course_filename)
    get_actions = ->flux.getActions(the_flux_name)
    get_store = -> flux.getStore(the_flux_name)
    if get_actions()?
        # already initalized
        return
    syncdb = undefined

    user_store = flux.getStore('users')
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
            store = get_store()
            if not (store.state.students? and store.state.assignments? and store.state.settings?)
                @set_error("store must be initialized")
                return false
            return true

        _update: (opts) =>
            if not @_loaded() then return
            syncdb.update(opts)
            @save()

        save: () =>
            if get_store().state.saving
                return # already saving
            id = @set_activity(desc:"Saving...")
            @_set_to(saving:true)
            syncdb.save (err) =>
                @clear_activity(id)
                @_set_to(saving:false)
                if err
                    @set_error("Error saving -- #{err}")
                    @_set_to(show_save_button:true)
                else
                    @_set_to(show_save_button:false)

        _syncdb_change: (changes) =>
            store = get_store()
            t = misc.copy(store.state)
            remove = (x.remove for x in changes when x.remove?)
            insert = (x.insert for x in changes when x.insert?)
            # first remove, then insert (or we could loose things!)
            if not t[x.table]?
                t[x.table] = immutable.Map()
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

        set_error: (error) =>
            if error == ''
                @_set_to(error:error)
            else
                @_set_to(error:((get_store().state.error ? '') + '\n' + error).trim())

        set_activity: (opts) =>
            opts = defaults opts,
                id   : undefined
                desc : undefined
            if not opts.id? and not opts.desc?
                return
            if not opts.id?
                @_activity_id = (@_activity_id ? 0) + 1
                opts.id = @_activity_id
            store = get_store()
            x = store.get_activity()
            if not x?
                x = {}
            if not opts.desc?
                delete x[opts.id]
            else
                x[opts.id] = opts.desc
            @_set_to(activity: x)
            return opts.id

        clear_activity: (id) =>
            if id?
                @set_activity(id:id)  # clears for this id
            else
                @_set_to(activity:{})

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
            student_ids = []
            for id in students
                student_id = misc.uuid()
                student_ids.push(student_id)
                obj = {table:'students', student_id:student_id}
                if '@' in id
                    obj.email_address = id
                else
                    obj.account_id = id
                syncdb.update(set:{}, where:obj)
            syncdb.save()
            f = (student_id, cb) =>
                async.series([
                    (cb) =>
                        get_store().wait
                            until   : (store) => store.get_student(student_id)
                            timeout : 30
                            cb      : cb
                    (cb) =>
                        @create_student_project(student_id)
                        get_store().wait
                            until   : (store) => store.get_student(student_id).get('project_id')
                            timeout : 30
                            cb      : cb
                ], cb)
            id = @set_activity(desc:"Creating #{students.length} student projects")
            async.mapLimit student_ids, 5, f, (err) =>
                @set_activity(id:id)
                if err
                    @set_error("error creating student projects -- #{err}")

        delete_student: (student) =>
            student = get_store().get_student(student)
            @_update
                set   : {deleted : true}
                where : {student_id : student.get('student_id'), table : 'students'}

        undelete_student: (student) =>
            student = get_store().get_student(student)
            @_update
                set   : {deleted : false}
                where : {student_id : student.get('student_id'), table : 'students'}

        # Student projects
        create_student_project: (student) =>
            store = get_store()
            if not store.state.students? or not store.state.settings?
                @set_error("attempt to create when stores not yet initialized")
                return
            student_id = store.get_student(student).get('student_id')
            @_update(set:{create_project:new Date()}, where:{table:'students',student_id:student_id})
            id = @set_activity(desc:"Create project for #{store.get_student_name(student_id)}.")
            token = misc.uuid()
            flux.getActions('projects').create_project
                title       : store.state.settings.get('title')
                description : store.state.settings.get('description')
                token       : token
            flux.getStore('projects').wait_until_project_created token, 30, (err, project_id) =>
                @clear_activity(id)
                if err
                    @set_error("error creating student project -- #{err}")
                else
                    @_update
                        set   : {create_project:undefined, project_id:project_id}
                        where : {table:'students', student_id:student_id}
                    @configure_project(student_id)

        configure_project_users: (student_project_id, student_id, do_not_invite_student_by_email) =>
            # Add student and all collaborators on this project to the project with given project_id.
            # users = who is currently a user of the student's project?
            users = flux.getStore('projects').get_users(student_project_id)  # immutable.js map
            # Define function to invite or add collaborator
            invite = (x) ->
                if '@' in x
                    if not do_not_invite_student_by_email
                        title = flux.getStore("projects").get_title(student_project_id)
                        name  = flux.getStore('account').get_fullname()
                        body  = "Please use SageMathCloud for the course -- '#{title}'.  Sign up at\n\n    https://cloud.sagemath.com\n\n--\n#{name}"
                        flux.getActions('projects').invite_collaborators_by_email(student_project_id, x, body)
                else
                    flux.getActions('projects').invite_collaborator(student_project_id, x)
            # Make sure the student is on the student's project:
            student = get_store().get_student(student_id)
            student_account_id = student.get('account_id')
            if not student_account_id?  # no account yet
                invite(student.get('email_address'))
            else if not users?.get(student_account_id)?   # users might not be set yet if project *just* created
                invite(student_account_id)
            # Make sure all collaborators on course project are on the student's project:
            target_users = flux.getStore('projects').get_users(course_project_id)
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
            flux.getStore('projects').get_users(course_project_id).map (_, account_id) =>
                x = users_of_student_project.get(account_id)
                if x? and not x.get('hide')
                    flux.getActions('projects').set_project_hide(student_project_id, account_id, true)

        configure_project_title: (student_project_id, student_id) =>
            store = get_store()
            title = "#{store.get_student_name(student_id)} - #{store.state.settings.get('title')}"
            flux.getActions('projects').set_project_title(student_project_id, title)

        set_all_student_project_titles: (title) =>
            actions = flux.getActions('projects')
            get_store().get_students().map (student, student_id) =>
                student_project_id = student.get('project_id')
                project_title = "#{get_store().get_student_name(student_id)} - #{title}"
                if student_project_id?
                    actions.set_project_title(student_project_id, project_title)

        configure_project_description: (student_project_id, student_id) =>
            flux.getActions('projects').set_project_description(student_project_id, get_store().state.settings.get('description'))

        set_all_student_project_descriptions: (description) =>
            get_store().get_students().map (student, student_id) =>
                student_project_id = student.get('project_id')
                if student_project_id?
                    flux.getActions('projects').set_project_description(student_project_id, description)

        configure_project: (student_id, do_not_invite_student_by_email) =>
            # Configure project for the given student so that it has the right title,
            # description, and collaborators for belonging to the indicated student.
            # - Add student and collaborators on project containing this course to the new project.
            # - Hide project from owner/collabs of the project containing the course.
            # - Set the title to [Student name] + [course title] and description to course description.
            student_project_id = get_store().state.students?.get(student_id)?.get('project_id')
            if not student_project_id?
                @create_student_project(student_id)
            else
                @configure_project_users(student_project_id, student_id, do_not_invite_student_by_email)
                @configure_project_visibility(student_project_id)
                @configure_project_title(student_project_id, student_id)
                @configure_project_description(student_project_id, student_id)

        configure_all_projects: =>
            id = @set_activity(desc:"Configuring all projects")
            @_set_to(configure_projects:'Configuring projects')
            for student_id in get_store().get_student_ids(deleted:false)
                @configure_project(student_id, true)
            @set_activity(id:id)

        set_student_note: (student, note) =>
            student = get_store().get_student(student)
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
            assignment = get_store().get_assignment(assignment)
            @_update
                set   : {deleted: true}
                where : {assignment_id: assignment.get('assignment_id'), table: 'assignments'}

        undelete_assignment: (assignment) =>
            assignment = get_store().get_assignment(assignment)
            @_update
                set   : {deleted: false}
                where : {assignment_id: assignment.get('assignment_id'), table: 'assignments'}

        set_grade: (assignment, student, grade) =>
            store = get_store()
            assignment = store.get_assignment(assignment)
            student    = store.get_student(student)
            where      = {table:'assignments', assignment_id:assignment.get('assignment_id')}
            grades     = syncdb.select_one(where:where).grades ? {}
            grades[student.get('student_id')] = grade
            @_update(set:{grades:grades}, where:where)

        _set_assignment_field: (assignment, name, val) =>
            assignment = get_store().get_assignment(assignment)
            where      = {table:'assignments', assignment_id:assignment.get('assignment_id')}
            @_update(set:{"#{name}":val}, where:where)

        set_due_date: (assignment, due_date) =>
            @_set_assignment_field(assignment, 'due_date', due_date)

        set_assignment_note: (assignment, note) =>
            @_set_assignment_field(assignment, 'note', note)

        # Copy the files for the given assignment_id from the given student to the
        # corresponding collection folder.
        # If the store is initialized and the student and assignment both exist,
        # then calling this action will result in this getting set in the store:
        #
        #    assignment.last_collect[student_id] = {time:?, error:err}
        #
        # where time >= now is the current time in milliseconds.
        copy_assignment_from_student: (assignment, student) =>
            id = @set_activity(desc:"Copying assignment from a student")
            finish = (err) =>
                @clear_activity(id)
                @_finish_copy(assignment, student, 'last_collect', err)
                if err
                    @set_error("copy from student: #{err}")
            store = get_store()
            if not @_store_is_initialized()
                return finish("store not yet initialized")
            if not student = store.get_student(student)
                return finish("no student")
            if not assignment = store.get_assignment(assignment)
                return finish("no assignment")
            student_name = store.get_student_name(student)
            student_project_id = student.get('project_id')
            if not student_project_id?
                # nothing to do
                @clear_activity(id)
            else
                @set_activity(id:id, desc:"Copying assignment from #{student_name}")
                salvus_client.copy_path_between_projects
                    src_project_id    : student_project_id
                    src_path          : assignment.get('target_path')
                    target_project_id : course_project_id
                    target_path       : assignment.get('collect_path') + '/' + student.get('student_id')
                    overwrite_newer   : assignment.get('collect_overwrite_newer')
                    delete_missing    : assignment.get('collect_delete_missing')
                    cb                : finish

        # Copy the given assignment to all non-deleted students, doing 10 copies in parallel at once.
        copy_assignment_from_all_students: (assignment, new_only) =>
            id = @set_activity(desc:"Copying assignment from all students #{if new_only then 'from whom we have not already copied it'}")
            error = (err) =>
                @clear_activity(id)
                @set_error("copy from student: #{err}")
            store = get_store()
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            errors = ''
            f = (student_id, cb) =>
                if not store.last_copied(previous_step('collect'), assignment, student_id, true)
                    cb(); return
                if new_only and store.last_copied('collect', assignment, student_id, true)
                    cb(); return
                n = misc.mswalltime()
                @copy_assignment_from_student(assignment, student_id)
                get_store().wait
                    until : => store.last_copied('collect', assignment, student_id) >= n
                    cb    : (err) =>
                        if err
                            errors += "\n #{err}"
                        cb()
            async.mapLimit store.get_student_ids(deleted:false), 10, f, (err) =>
                if errors
                    error(errors)
                else
                    @clear_activity(id)

        # Copy the graded files for the given assignment_id back to the student in a -graded folder.
        # If the store is initialized and the student and assignment both exist,
        # then calling this action will result in this getting set in the store:
        #
        #    assignment.last_return_graded[student_id] = {time:?, error:err}
        #
        # where time >= now is the current time in milliseconds.

        return_assignment_to_student: (assignment, student) =>
            id = @set_activity(desc:"Returning assignment to a student")
            finish = (err) =>
                @clear_activity(id)
                @_finish_copy(assignment, student, 'last_return_graded', err)
                if err
                    @set_error("return to student: #{err}")
            store = get_store()
            if not @_store_is_initialized()
                return finish("store not yet initialized")
            if not student = store.get_student(student)
                return finish("no student")
            if not assignment = store.get_assignment(assignment)
                return finish("no assignment")
            student_name = store.get_student_name(student)
            student_project_id = student.get('project_id')
            if not student_project_id?
                # nothing to do
                @clear_activity(id)
            else
                @set_activity(id:id, desc:"Returning assignment to #{student_name}")
                salvus_client.copy_path_between_projects
                    src_project_id    : course_project_id
                    src_path          : assignment.get('collect_path') + '/' + student.get('student_id')
                    target_project_id : student_project_id
                    target_path       : assignment.get('graded_path')
                    overwrite_newer   : assignment.get('overwrite_newer')
                    delete_missing    : assignment.get('delete_missing')
                    cb                : finish

        # Copy the given assignment to all non-deleted students, doing 10 copies in parallel at once.
        return_assignment_to_all_students: (assignment, new_only) =>
            id = @set_activity(desc:"Returning assignments to all students #{if new_only then 'who have not already received it'}")
            error = (err) =>
                @clear_activity(id)
                @set_error("return to student: #{err}")
            store = get_store()
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            errors = ''
            f = (student_id, cb) =>
                if not store.last_copied(previous_step('return_graded'), assignment, student_id, true)
                    cb(); return
                if new_only
                    if store.last_copied('return_graded', assignment, student_id, true) and store.has_grade(assignment, student_id)
                        cb(); return
                n = misc.mswalltime()
                @return_assignment_to_student(assignment, student_id)
                store.wait
                    until : => store.last_copied('return_graded', assignment, student_id) >= n
                    cb    : (err) =>
                        if err
                            errors += "\n #{err}"
                        cb()
            async.mapLimit store.get_student_ids(deleted:false), 10, f, (err) =>
                if errors
                    error(errors)
                else
                    @clear_activity(id)

        _finish_copy: (assignment, student, type, err) =>
            if student? and assignment?
                where = {table:'assignments', assignment_id:assignment.get('assignment_id')}
                x = syncdb.select_one(where:where)?[type] ? {}
                x[student.get('student_id')] = {time: misc.mswalltime(), error:err}
                @_update(set:{"#{type}":x}, where:where)

        # Copy the files for the given assignment to the given student. If
        # the student project doesn't exist yet, it will be created.
        # You may also pass in an id for either the assignment or student.
        # If the store is initialized and the student and assignment both exist,
        # then calling this action will result in this getting set in the store:
        #
        #    assignment.last_assignment[student_id] = {time:?, error:err}
        #
        # where time >= now is the current time in milliseconds.
        copy_assignment_to_student: (assignment, student) =>
            id = @set_activity(desc:"Copying assignment to a student")
            finish = (type, err) =>
                @clear_activity(id)
                @_finish_copy(assignment, student, 'last_assignment', err)
                if err
                    @set_error("copy to student: #{err}")
            store = get_store()
            if not @_store_is_initialized()
                return finish("store not yet initialized")
            if not student = store.get_student(student)
                return finish("no student")
            if not assignment = store.get_assignment(assignment)
                return finish("no assignment")

            student_name = store.get_student_name(student)
            @set_activity(id:id, desc:"Copying assignment to #{student_name}")
            student_project_id = student.get('project_id')
            student_id = student.get('student_id')
            async.series([
                (cb) =>
                    if not student_project_id?
                        @set_activity(id:id, desc:"#{student_name}'s project doesn't exist, so creating it.")
                        @create_student_project(student)
                        get_store().wait
                            until : => get_store().get_student_project_id(student_id)
                            cb    : (err, x) =>
                                student_project_id = x
                                cb(err)
                    else
                        cb()
                (cb) =>
                    @set_activity(id:id, desc:"Copying files to #{student_name}'s project")
                    salvus_client.copy_path_between_projects
                        src_project_id    : course_project_id
                        src_path          : assignment.get('path')
                        target_project_id : student_project_id
                        target_path       : assignment.get('target_path')
                        overwrite_newer   : assignment.get('overwrite_newer')
                        delete_missing    : assignment.get('delete_missing')
                        cb                : cb
            ], (err) =>
                finish(err)
            )

        # Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
        copy_assignment_to_all_students: (assignment, new_only) =>
            id = @set_activity(desc:"Copying assignments to all students #{if new_only then 'who have not already received it'}")
            error = (err) =>
                @clear_activity(id)
                err="copy to student: #{err}"
                @set_error(err)
            store = get_store()
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            errors = ''
            f = (student_id, cb) =>
                if new_only and store.last_copied('assignment', assignment, student_id, true)
                    cb(); return
                n = misc.mswalltime()
                @copy_assignment_to_student(assignment, student_id)
                store.wait
                    until : => store.last_copied('assignment', assignment, student_id) >= n
                    cb    : (err) =>
                        if err
                            errors += "\n #{err}"
                        cb()

            async.mapLimit store.get_student_ids(deleted:false), 5, f, (err) =>
                if errors
                    error(errors)
                else
                    @clear_activity(id)

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
            store = get_store()
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
                    proj = course_project_id
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

    flux.createActions(the_flux_name, CourseActions)

    class CourseStore extends Store
        constructor: (flux) ->
            super()
            ActionIds = flux.getActionIds(the_flux_name)
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
            if typeof(student)=='string' then @state.students?.get(student) else @state.students?.get(student?.get('student_id'))

        get_student_note: (student) =>
            return @get_student(student)?.get('note')

        get_student_project_id: (student) =>
            return @get_student(student)?.get('project_id')

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
            if typeof(assignment) == 'string' then @state.assignments?.get(assignment) else @state.assignments?.get(assignment?.get('assignment_id'))

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


        # Return the last time the assignment was copied to/from the
        # student (in the given step of the workflow), or undefined.
        # Even an attempt to copy with an error counts.
        last_copied: (step, assignment, student_id, no_error) =>
            x = @get_assignment(assignment)?.get("last_#{step}")?.get(student_id)
            if not x?
                return
            if no_error and x.get('error')
                return
            return x.get('time')

        has_grade: (assignment, student_id) =>
            return @get_assignment(assignment)?.get("grades")?.get(student_id)

        get_assignment_status: (assignment) =>
            #
            # Compute and return an object that has fields (deleted students are ignored)
            #
            #  assigned      - number of students who have received assignment
            #  not_assigned  - number of students who have NOT received assignment
            #  collected     - number of students from whom we have collected assignment
            #  not_collected - number of students from whom we have NOT collected assignment but we sent it to them
            #  returned      - number of students to whom we've returned assignment
            #  not_returned  - number of students to whom we've NOT returned assignment but we collected it from them
            #
            # This function caches its result and only recomputes values when the store changes,
            # so it should be safe to call in render.
            #
            if not @_assignment_status?
                @_assignment_status = {}
                @on 'change', =>
                    delete @_assignment_status.cache
            if @_assignment_status.cache?
                return @_assignment_status.cache
            assignment = @get_assignment(assignment)
            if not assignment?
                return undefined
            students = @get_student_ids(deleted:false)
            if not students?
                return undefined
            info = {}
            for t in STEPS
                info[t] = 0
                info["not_#{t}"] = 0
            for student_id in students
                previous = true
                for t in STEPS
                    x = assignment.get("last_#{t}")?.get(student_id)
                    if x? and not x.get('error')
                        previous = true
                        info[t] += 1
                    else
                        # add one but only if the previous step *was* done (and in the case of returning, they have a grade)
                        if previous and (t!='return_graded' or @has_grade(assignment, student_id))
                            info["not_#{t}"] += 1
                        previous = false

            @_assignment_status.cache = info
            return info

    flux.createStore(the_flux_name, CourseStore, flux)

    synchronized_db
        project_id : course_project_id
        filename   : course_filename
        cb         : (err, _db) ->
            if err
                get_actions().set_error("unable to open #{@filename}")
            else
                syncdbs[the_flux_name] = syncdb = _db
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
                get_actions()._set_to(t)
                syncdb.on('change', (changes) -> get_actions()._syncdb_change(changes))
                get_actions().configure_all_projects()

    return # don't return syncdb above

# Inline styles

entry_style =
    paddingTop    : '5px'
    paddingBottom : '5px'

selected_entry_style = misc.merge
    border        : '1px solid #888'
    boxShadow     : '5px 5px 5px grey'
    borderRadius  : '5px'
    marginBottom  : '10px',
    entry_style

note_style =
    borderTop  : '3px solid #aaa'
    marginTop  : '10px'
    paddingTop : '5px'

show_hide_deleted_style =
    marginTop  : '20px'
    float      : 'right'

Student = rclass
    propTypes:
        flux        : rtypes.object.isRequired
        name        : rtypes.string.isRequired
        student     : rtypes.object.isRequired
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired  # here entirely to cause an update when project activity happens
        background  : rtypes.string

    shouldComponentUpdate: (nextProps, nextState) ->
        return @state != nextState or @props.student != nextProps.student or @props.project_map != nextProps.project_map or @props.user_map != nextProps.user_map or @props.background != nextProps.background

    displayName : "CourseEditorStudent"

    getInitialState: ->
        more : false
        confirm_delete: false

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
        student_project_id = @props.student.get('project_id')
        if not student_project_id?
            return
        # get the last time the student edited this project somehow.
        last_active = @props.flux.getStore('projects').get_last_active(student_project_id)?.get(@props.student.get('account_id'))
        if last_active   # could be 0 or undefined
            return <span style={color:"#666"}>(last used project <TimeAgo date={last_active} />)</span>
        else
            return <span style={color:"#666"}>(has never used project)</span>

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
            <Tip placement='right'
                 title='Student project'
                 tip='Open the course project for this student.'>
                <Button onClick={@open_project}>
                    <Icon name="edit" /> Open student project
                </Button>
            </Tip>
        else
            <Tip placement='right'
                 title='Create the student project'
                 tip='Create a new project for this student, then add (or invite) the student as a collaborator, and also add any collaborators on the project containing this course.'>
                <Button onClick={@create_project}>
                    <Icon name="plus-circle" /> Create student project
                </Button>
            </Tip>

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
                        <Icon name="trash" /> YES, Delete
                    </Button>
                </ButtonToolbar>
            </div>

    render_delete_button: ->
        if not @state.more
            return
        if @state.confirm_delete
            return @render_confirm_delete()
        if @props.student.get('deleted')
            <Button onClick={@undelete_student} style={float:'right'}>
                <Icon name="trash-o" /> Undelete
            </Button>
        else
            <Button onClick={=>@setState(confirm_delete:true)} style={float:'right'}>
                <Icon name="trash" /> Delete
            </Button>

    render_title_due: (assignment) ->
        date = assignment.get('due_date')
        if date
            <span>(Due <TimeAgo date={date} />)</span>

    render_title: (assignment) ->
        <span>
            <em>{misc.trunc_middle(assignment.get('path'), 50)}</em> {@render_title_due(assignment)}
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

    render_note: ->
        <Row key='note' style={note_style}>
            <Col xs=2>
                <Tip title="Notes about this student" tip="Record notes about this student here. These notes are only visible to you, not to the student.  In particular, you might want to include an email address or other identifying information here, and notes about late assignments, excuses, etc.">
                    Notes
                </Tip>
            </Col>
            <Col xs=10>
                <MarkdownInput
                    rows        = 6
                    placeholder = 'Notes about student (not visible to student)'
                    default_value = {@props.student.get('note')}
                    on_save     = {(value)=>@props.flux.getActions(@props.name).set_student_note(@props.student, value)}
                />
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
        <Row key='basic' style={backgroundColor:@props.background}>
            <Col md=2>
                <h5>
                    {@render_student()}
                    {@render_deleted()}
                </h5>
            </Col>
            <Col md=10 style={paddingTop:'10px'}>
                {@render_last_active()}
            </Col>
        </Row>

    render_deleted: ->
        if @props.student.get('deleted')
            <b> (deleted)</b>

    render_panel_header: ->
        <Row>
            <Col md=4>
                {@render_project()}
            </Col>
            <Col md=4 mdOffset=4>
                {@render_delete_button()}
            </Col>
        </Row>

    render_more_panel: ->
        <Panel header={@render_panel_header()}>
            {@render_more_info()}
        </Panel>

    render: ->
        <Row style={if @state.more then selected_entry_style else entry_style}>
            <Col xs=12>
                {@render_basic_info()}
                {@render_more_panel() if @state.more}
            </Col>
        </Row>

Students = rclass
    propTypes:
        name         : rtypes.string.isRequired
        flux         : rtypes.object.isRequired
        project_id   : rtypes.string.isRequired
        students     : rtypes.object.isRequired
        user_map     : rtypes.object.isRequired
        project_map  : rtypes.object.isRequired

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
            student_name = if x.account_id? then x.first_name + ' ' + x.last_name else x.email_address
            v.push <option key={key} value={key} label={student_name}>{student_name}</option>
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
            <ErrorDisplay error={misc.trunc(@state.err,1024)} onClose={=>@setState(err:undefined)} />

    render_header: (num_omitted) ->
        <div>
            <Row>
                <Col md=3>
                    <SearchInput
                        placeholder = "Find students..."
                        default_value = {@state.search}
                        on_change   = {(value)=>@setState(search:value)}
                    />
                </Col>
                <Col md=3>
                    {<h5>(Omitting {num_omitted} students)</h5> if num_omitted}
                </Col>
                <Col md=6>
                    <form onSubmit={@do_add_search}>
                        <Input
                            ref         = 'student_add_input'
                            type        = 'text'
                            placeholder = "Add student by name or email address..."
                            value       = {@state.add_search}
                            buttonAfter = {@student_add_button()}
                            onChange    = {=>@setState(add_select:undefined, add_search:@refs.student_add_input.getValue())}
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
                if user?
                    x.first_name = user.get('first_name')
                    x.last_name  = user.get('last_name')
                else
                    x.first_name = 'Please create the student project'
                    x.last_name = ''
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
        for x,i in students
            <Student background={if i%2==0 then "#eee"} key={x.student_id}
                     student_id={x.student_id} student={@props.students.get(x.student_id)}
                     user_map={@props.user_map} flux={@props.flux} name={@props.name}
                     project_map={@props.project_map} />

    render_show_deleted: (num_deleted) ->
        if @state.show_deleted
            <Button style={show_hide_deleted_style} onClick={=>@setState(show_deleted:false)}>
                <Tip placement='left' title="Hide deleted" tip="Students are never really deleted.  Click this button so that deleted students aren't included at the bottom of the list of students.  Deleted students are always hidden from the list of grades.">
                    Hide {num_deleted} deleted students
                </Tip>
            </Button>
        else
            <Button style={show_hide_deleted_style} onClick={=>@setState(show_deleted:true,search:'')}>
                <Tip placement='left' title="Show deleted" tip="Students are not deleted forever, even after you delete them.  Click this button to show any deleted students at the bottom of the list.  You can then click on the student and click undelete to bring the assignment back.">
                    Show {num_deleted} deleted students
                </Tip>
            </Button>

    render :->
        {students, num_omitted, num_deleted} = @compute_student_list()
        <Panel header={@render_header(num_omitted, num_deleted)}>
            {@render_students(students)}
            {@render_show_deleted(num_deleted) if num_deleted}
        </Panel>

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
        <Row style={borderBottom:'2px solid #aaa'} >
            <Col md=2 key='title'>
                <Tip title={@props.title} tip={if @props.title=="Assignment" then "This column gives the directory name of the assignment." else "This column gives the name of the student."}>
                    <b>{@props.title}</b>
                </Tip>
            </Col>
            <Col md=10 key="rest">
                <Row>
                    <Col md=3 key='last_assignment'>
                        <Tip title="Assign homework" tip="This column gives the status of making homework available to students, and lets you copy homework to one student at a time.">
                            <b>1. Assign to Student</b>
                        </Tip>
                    </Col>
                    <Col md=3 key='collect'>
                        <Tip title="Collect homework" tip="This column gives status information about collecting homework from students, and lets you collect from one student at a time.">
                            <b>2. Collect from Student</b>
                        </Tip>
                    </Col>
                    <Col md=3 key='grade'>
                        <Tip title="Record homework grade" tip="Use this column to record the grade the student received on the assignment. Once the grade is recorded, you can return the assignment.  You can also export grades to a file in the Settings tab.">
                            <b>3. Grade</b>
                        </Tip>
                    </Col>
                    <Col md=3 key='return_graded'>
                        <Tip title="Return graded homework" placement='left' tip="This column gives status information about when you returned homework to the students.  Once you have entered a grade, you can return the assignment.">
                            <b>4. Return to Student</b>
                        </Tip>
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

    edit_grade: ->
        @setState(grade:@props.grade, editing_grade:true)

    render_grade_score: ->
        if @state.editing_grade
            <form key='grade' onSubmit={@save_grade} style={marginTop:'15px'}>
                <Input autoFocus
                       value       = {@state.grade}
                       ref         = 'grade_input'
                       type        = 'text'
                       placeholder = 'Grade (any text)...'
                       onChange    = {=>@setState(grade:@refs.grade_input.getValue())}
                       onBlur      = {@save_grade}
                       onKeyDown   = {(e)=>if e.keyCode == 27 then @setState(grade:@props.grade, editing_grade:false)}
                       buttonAfter = {<Button onClick={@save_grade} bsStyle='success'>Save</Button>}
                />

            </form>
        else
            if @props.grade
                <div key='grade' onClick={@edit_grade}>
                    Grade: {@props.grade}
                </div>

    render_grade: (info) ->
        if not info.last_collect?
            return  # waiting to collect first
        bsStyle = if not (@props.grade ? '').trim() then 'primary'
        <div>
            <Tip title="Enter student's grade" tip="Enter the grade that you assigned to your student on this assignment here.  You can enter anything (it doesn't have to be a number).">
                <Button key='edit' onClick={@edit_grade} bsStyle={bsStyle}>Enter grade</Button>
            </Tip>
            {@render_grade_score()}
        </div>

    render_last_time: (name, time) ->
        <div key='time' style={color:"#666"}>
            {name}ed <BigTime date={time} />
        </div>

    render_open_recopy: (name, open, copy, copy_tip, open_tip) ->
        if name == "Return"
            placement = 'left'
        <ButtonGroup key='open_recopy'>
            <Button key="copy" bsStyle='warning' onClick={copy}>
                <Tip title={name} placement={placement}
                    tip={<span>{copy_tip}<hr/>You have already copied these files so take extra care.</span>}>
                    <Icon name='share-square-o' rotate={"180" if name=='Collect'}/> Re-{name.toLowerCase()}
                </Tip>
            </Button>
            <Button key='open'  onClick={open}>
                <Tip title="Open assignment" placement={placement} tip={open_tip}>
                    <Icon name="folder-open-o" /> Open
                </Tip>
            </Button>
        </ButtonGroup>

    render_copy: (name, copy, copy_tip) ->
        if name == "Return"
            placement = 'left'
        <Tip key="copy" title={name} tip={copy_tip} placement={placement} >
            <Button onClick={copy} bsStyle={'primary'}>
                <Icon name="share-square-o" rotate={"180" if name=='Collect'}/> {name}
            </Button>
        </Tip>

    render_error: (name, error) ->
        if error.indexOf('No such file or directory') != -1
            error = 'Somebody may have moved the folder that should have contained the assignment.\n' + error
        else
            error = "Try to #{name.toLowerCase()} again to clear this error:\n" + error
        <ErrorDisplay key='error' error={error} style={maxHeight: '100px', overflow:'auto'}/>

    render_last: (name, obj, type, info, enable_copy, copy_tip, open_tip) ->
        open = => @open(type, info.assignment_id, info.student_id)
        copy = => @copy(type, info.assignment_id, info.student_id)
        obj ?= {}
        v = []
        if enable_copy
            if obj.time
                v.push(@render_open_recopy(name, open, copy, copy_tip, open_tip))
            else
                v.push(@render_copy(name, copy, copy_tip))
        if obj.time
            v.push(@render_last_time(name, obj.time))
        if obj.error
            v.push(@render_error(name, obj.error))
        return v

    render: ->
        info = @props.flux.getStore(@props.name).student_assignment_info(@props.student, @props.assignment)
        <Row style={borderTop:'1px solid #aaa', paddingTop:'5px', paddingBottom: '5px'}>
            <Col md=2 key="title">
                {@props.title}
            </Col>
            <Col md=10 key="rest">
                <Row>
                    <Col md=3 key='last_assignment'>
                        {@render_last('Assign', info.last_assignment, 'assigned', info, true,
                           "Copy the assignment from your project to this student's project so they can do their homework.",
                           "Open the student's copy of this assignment directly in their project.  You will be able to see them type, chat with them, leave them hints, etc.")}
                    </Col>
                    <Col md=3 key='collect'>
                        {@render_last('Collect', info.last_collect, 'collected', info, info.last_assignment?,
                           "Copy the assignment from your student's project back to your project so you can grade their work.",
                           "Open the copy of your student's work in your own project, so that you can grade their work.")}
                    </Col>
                    <Col md=3 key='grade'>
                        {@render_grade(info)}
                    </Col>
                    <Col md=3 key='return_graded'>
                        {@render_last('Return', info.last_return_graded, 'graded', info, info.last_collect?,
                           "Copy the graded assignment back to your student's project.",
                           "Open the copy of your student's work that you returned to them. This opens the returned assignment directly in their project.") if @props.grade}
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
        background  : rtypes.string

    render_student_info: (student_id) ->
        store = @props.flux.getStore(@props.name)
        <StudentAssignmentInfo
              key     = {student_id}
              title   = {misc.trunc_middle(store.get_student_name(student_id), 40)}
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
            user = @props.user_map.get(x.account_id)
            if user?
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
        background  : rtypes.string

    shouldComponentUpdate: (nextProps, nextState) ->
        return @state != nextState or @props.assignment != nextProps.assignment or @props.students != nextProps.students or @props.user_map != nextProps.user_map or @props.background != nextProps.background

    getInitialState: ->
        x =
            more : false
            confirm_delete : false
        for step in STEPS
            x["copy_confirm_#{step}"] = false
        return x

    render_due: ->
        <Row>
            <Col xs=1 style={marginTop:'8px', color:'#666'}>
                <Tip placement='top' title="Set the due date"
                    tip="Set the due date for the assignment.  This changes how the list of assignments is sorted.  Note that you must explicitly click a button to collect student assignments when they are due -- they are not automatically collected on the due date.  You should also tell students when assignments are due (e.g., at the top of the assignment).">
                    Due
                </Tip>
            </Col>
            <Col xs=11>
                <DateTimePicker
                    value     = {@props.assignment.get('due_date') ? new Date()}
                    on_change = {@date_change}
                />
            </Col>
        </Row>

    date_change: (date) ->
        if not date
            date = @props.assignment.get('due_date') ? new Date()
        @props.flux.getActions(@props.name).set_due_date(@props.assignment, date)

    render_note: ->
        <Row key='note' style={note_style}>
            <Col xs=2>
                <Tip title="Notes about this assignment" tip="Record notes about this assignment here. These notes are only visible to you, not to your students.  Put any instructions to students about assignments in a file in the directory that contains the assignment.">
                    Assignment Notes<br /><span style={color:"#666"}></span>
                </Tip>
            </Col>
            <Col xs=10>
                <MarkdownInput
                    rows          = 6
                    placeholder   = 'Private notes about this assignment (not visible to students)'
                    default_value = {@props.assignment.get('note')}
                    on_save       = {(value)=>@props.flux.getActions(@props.name).set_assignment_note(@props.assignment, value)}
                />
            </Col>
        </Row>

    render_more_header: ->
        status = @props.flux.getStore(@props.name).get_assignment_status(@props.assignment)
        if not status?
            return <Loading key='loading_more'/>
        <Row key='header1'>
            <Col md=6 key='buttons'>
                <ButtonToolbar key='buttons'>
                    {@render_open_button()}
                    {@render_assign_button(status)}
                    {@render_collect_button(status)}
                    {@render_return_button(status)}
                </ButtonToolbar>
                {@render_copy_confirms(status)}
            </Col>
            <Col md=4 style={fontSize:'14px'} key='due'>
                {@render_due()}
            </Col>
            <Col md=2 key='delete'>
                <span style={float:'right'}>
                    {@render_delete_button()}
                </span>
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

    assign_assignment: ->
        # assign assignment to all (non-deleted) students
        @props.flux.getActions(@props.name).copy_assignment_to_all_students(@props.assignment)

    open_assignment_path: ->
        @props.flux.getProjectActions(@props.project_id).open_directory(@props.assignment.get('path'))

    render_open_button: ->
        <Tip key='open' title={<span><Icon name='folder-open-o'/> Open assignment</span>}
             tip="Open the folder in the current project that contains the original files for this assignment.  Edit files in this folder to create the content that your students will see when they receive an assignment.">
            <Button onClick={@open_assignment_path}>
                <Icon name="folder-open-o" /> Open
            </Button>
        </Tip>

    render_assign_button: ->
        bsStyle = if (@props.assignment.get('last_assignment')?.size ? 0) == 0 then "primary" else "warning"
        <Button key='assign'
                bsStyle  = {bsStyle}
                onClick  = {=>@setState(copy_confirm_assignment:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}>
            <Tip title={<span>Assign: <Icon name='user-secret'/> You <Icon name='long-arrow-right' />  <Icon name='users' /> Students </span>}
                tip="Copy the files for this assignment from this project to all other student projects. #{if bsStyle!='primary' then 'You have already copied the assignment to some of your students; be careful, since this could overwrite their partial work.'}"
            >
                <Icon name="share-square-o" /> Assign to...
            </Tip>
        </Button>

    render_copy_confirms: (status) ->
        for step in STEPS
            if @state["copy_confirm_#{step}"]
                @render_copy_confirm(step, status)

    render_copy_confirm: (step, status) ->
        <span key="copy_confirm_#{step}">
            {@render_copy_confirm_to_all(step, status) if status[step]==0}
            {@render_copy_confirm_to_all_or_new(step, status) if status[step]!=0}
        </span>

    render_copy_cancel: (step) ->
        cancel = =>
            @setState("copy_confirm_#{step}":false, "copy_confirm_all_#{step}":false, copy_confirm:false)
        <Button key='cancel' onClick={cancel}>Cancel</Button>

    copy_assignment: (step, new_only) ->
        # assign assignment to all (non-deleted) students
        actions = @props.flux.getActions(@props.name)
        switch step
            when 'assignment'
                actions.copy_assignment_to_all_students(@props.assignment, new_only)
            when 'collect'
                actions.copy_assignment_from_all_students(@props.assignment, new_only)
            when 'return_graded'
                actions.return_assignment_to_all_students(@props.assignment, new_only)
            else
                console.log("BUG -- unknown step: #{step}")
        @setState("copy_confirm_#{step}":false, "copy_confirm_all_#{step}":false, copy_confirm:false)

    render_copy_confirm_to_all: (step, status) ->
        n = status["not_#{step}"]
        <Alert bsStyle='warning' key="#{step}_confirm_to_all">
            {step} this project to the {n} students who are ready for it?
            <ButtonToolbar>
                <Button key='yes' bsStyle='primary' onClick={=>@copy_assignment(step, false)} >Yes</Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
        </Alert>

    render_copy_confirm_overwrite_all: (step, status) ->
        <div key="copy_confirm_overwrite_all">
            This will ...
            <Button key='all' bsStyle='danger' onClick={=>@copy_assignment(step, false)}>All {status[step]} students</Button>
            {@render_copy_cancel(step)}
        </div>

    render_copy_confirm_to_all_or_new: (step, status) ->
        n = status["not_#{step}"]
        m = n + status[step]
        <Alert bsStyle='warning' key="#{step}_confirm_to_all_or_new">
            {step} this project to/from...
            <ButtonToolbar>
                <Button key='all' bsStyle='danger' onClick={=>@setState("copy_confirm_all_#{step}":true, copy_confirm:true)}
                        disabled={@state["copy_confirm_all_#{step}"]} >
                    All {m} students...
                </Button>
                {<Button key='new' bsStyle='primary' onClick={=>@copy_assignment(step, true)}>The {n} student{if n>1 then 's' else ''} not already assigned to/from</Button> if n}
                {@render_copy_cancel(step)}
            </ButtonToolbar>
            {@render_copy_confirm_overwrite_all(step, status) if @state["copy_confirm_all_#{step}"]}
        </Alert>

    collect_assignment: ->
        # assign assignment to all (non-deleted) students
        @props.flux.getActions(@props.name).copy_assignment_from_all_students(@props.assignment)

    render_collect_tip: (warning) ->
        v = []
        v.push <span key='normal'>
            You may collect an assignment from all of your students by clicking here.
            (There is no way to schedule collection at a specific time; instead, collection happens when you click the button.)
        </span>
        if warning
            v.push <span key='special'><hr /> Be careful -- you have already collected files from some students; if they updated their homework then previously collected work may be overwritten.</span>
        return v

    render_collect_button: ->
        # disable the button if nothing ever assigned
        disabled = (@props.assignment.get('last_assignment')?.size ? 0) == 0
        if not disabled
            if (@props.assignment.get('last_collect')?.size ? 0) == 0
                bsStyle = 'primary'
            else
                bsStyle = 'warning'
        <Button key='collect'
                onClick  = {=>@setState(copy_confirm_collect:true, copy_confirm:true)}
                disabled = {disabled or @state.copy_confirm}
                bsStyle={bsStyle} >
            <Tip
                title={<span>Collect: <Icon name='users' /> Students <Icon name='long-arrow-right' /> <Icon name='user-secret'/> You</span>}
                tip = {@render_collect_tip(bsStyle=='warning')}>
                    <Icon name="share-square-o" rotate="180" /> Collect from...
            </Tip>
        </Button>

    return_assignment: ->
        # Assign assignment to all (non-deleted) students.
        @props.flux.getActions(@props.name).return_assignment_to_all_students(@props.assignment)

    render_return_button: ->
        # Disable the button if nothing collected.
        disabled = (@props.assignment.get('last_collect')?.size ? 0) == 0
        if not disabled
            if (@props.assignment.get("last_return_graded")?.size ? 0) > 0
                bsStyle = "warning"
            else
                bsStyle = "primary"
            <Button key='return'
                onClick  = {=>@setState(copy_confirm_return_graded:true, copy_confirm:true)}
                disabled = {disabled or @state.copy_confirm}
                bsStyle  = {bsStyle} >
                <Tip title={<span>Return: <Icon name='user-secret'/> You <Icon name='long-arrow-right' />  <Icon name='users' /> Students </span>}
                    tip="Copy the graded versions of files for this assignment from this project to all other student projects. #{if bsStyle!='primary' then 'You have already returned the graded assignments to some of your students; be careful to not overwrite their partial work.'}"
                >
                    <Icon name="share-square-o" /> Return to...
                </Tip>
            </Button>

    delete_assignment: ->
        @props.flux.getActions(@props.name).delete_assignment(@props.assignment)
        @setState(confirm_delete:false)

    undelete_assignment: ->
        @props.flux.getActions(@props.name).undelete_assignment(@props.assignment)

    render_confirm_delete: ->
        if @state.confirm_delete
            <div key='confirm_delete'>
                Are you sure you want to delete this assignment (you can always undelete it later)?&nbsp;
                <ButtonToolbar>
                    <Button key='no' onClick={=>@setState(confirm_delete:false)}>
                        NO, do not delete
                    </Button>
                    <Button key='yes' onClick={@delete_assignment} bsStyle='danger'>
                        <Icon name="trash" /> YES, Delete
                    </Button>
                </ButtonToolbar>
            </div>

    render_delete_button: ->
        if @state.confirm_delete
            return @render_confirm_delete()
        if @props.assignment.get('deleted')
            <Tip key='delete' placement='left' title="Undelete assignment" tip="Make the assignment visible again in the assignment list and in student grade lists.">
                <Button onClick={@undelete_assignment}>
                    <Icon name="trash-o" /> Undelete
                </Button>
            </Tip>
        else
            <Tip key='delete' placement='left' title="Delete assignment" tip="Deleting this assignment removes it from the assignment list and student grade lists, but does not delete any files off of disk.  You can always undelete an assignment later by showing it using the 'show deleted assignments' button.">
                <Button onClick={=>@setState(confirm_delete:true)}>
                    <Icon name="trash" /> Delete
                </Button>
            </Tip>

    render_summary_due_date: ->
        due_date = @props.assignment.get('due_date')
        if due_date
            <div style={marginTop:'12px'}>Due <BigTime date={due_date} /></div>

    render_assignment_name: ->
        <span>
            {misc.trunc_middle(@props.assignment.get('path'), 80)}
            {<b> (deleted)</b> if @props.assignment.get('deleted')}
        </span>

    render_assignment_title_link: ->
        <a href='' onClick={(e)=>e.preventDefault();@setState(more:not @state.more)}>
            <Icon style={marginRight:'10px'}
                  name={if @state.more then 'caret-down' else 'caret-right'} />
            {@render_assignment_name()}
        </a>

    render_summary_line: () ->
        <Row key='summary' style={backgroundColor:@props.background}>
            <Col md=6>
                <h5>
                    {@render_assignment_title_link()}
                </h5>
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

    render_assignment_tip: ->
        <div>
            <p> <b>Collect an assignment</b> from your students by clicking "Collect from...".
            (Currently there is no way to schedule collection at a specific time -- it happens when you click the button.)
            You can then open each completed assignment and edit the student files, indicating grades
            on each problem, etc.
            </p>

            <p><b>Return the graded assignment</b> to your students by clicking "Return to..."
            If the assignment folder is called <tt>assignment1</tt>, then the graded version will appear
            in the student project as <tt>homework1-graded</tt>.
            </p>
        </div>

    render_header: (num_omitted) ->
        <div>
            <Row>
                <Col md=3>
                    <SearchInput
                        placeholder = "Find assignments..."
                        default_value = {@state.search}
                        on_change   = {(value)=>@setState(search:value)}
                    />
                </Col>
                <Col md=3>
                    {<h5>(Omitting {num_omitted} assignments)</h5> if num_omitted}
                </Col>
                <Col md=6>
                    <form onSubmit={@do_add_search}>
                        <Input
                            ref         = 'assignment_add_input'
                            type        = 'text'
                            placeholder = "Add assignment by folder name..."
                            value       = {@state.add_search}
                            buttonAfter = {@assignment_add_search_button()}
                            onChange    = {=>@setState(add_select:undefined, add_search:@refs.assignment_add_input.getValue())}
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
        for x,i in assignments
            <Assignment background={if i%2==0 then "#eee"}  key={x.assignment_id} assignment={@props.assignments.get(x.assignment_id)}
                    project_id={@props.project_id}  flux={@props.flux}
                    students={@props.students} user_map={@props.user_map}
                    name={@props.name}
                    />

    render_show_deleted: (num_deleted) ->
        if @state.show_deleted
            <Button style={show_hide_deleted_style} onClick={=>@setState(show_deleted:false)}>
                <Tip placement='left' title="Hide deleted" tip="Assignments are never really deleted.  Click this button so that deleted assignments aren't included at the bottom of the list.  Deleted assignments are always hidden from the list of grades for a student.">
                    Hide {num_deleted} deleted assignments
                </Tip>
            </Button>
        else
            <Button style={show_hide_deleted_style} onClick={=>@setState(show_deleted:true,search:'')}>
                <Tip placement='left' title="Show deleted" tip="Assignments are not deleted forever even after you delete them.  Click this button to show any deleted assignments at the bottom of the list of assignments.  You can then click on the assignment and click undelete to bring the assignment back.">
                    Show {num_deleted} deleted assignments
                </Tip>
            </Button>

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
        <h4>
            Title and description
        </h4>

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
                <MarkdownInput
                    rows    = 6
                    type    = "textarea"
                    default_value = {@props.settings.get('description')}
                    on_save ={(desc)=>@props.flux.getActions(@props.name).set_description(desc)}
                />
            </LabeledRow>
            <hr/>
            <span style={color:'#666'}>
                <p>Set the course title and description here.
                When you change the title or description, the corresponding
                title and description of each student project will be updated.
                The description is set to this description, and the title
                is set to the student name followed by this title.
                </p>

                <p>Use the description to provide additional information about
                the course, e.g., a link to the main course website.
                </p>
            </span>
        </Panel>

    render_grades_header: ->
        <h4>
            Export grades
        </h4>

    path: (ext) ->
        p = @props.path
        i = p.lastIndexOf('.')
        return p.slice(0,i) + '.' + ext

    open_file: (path) ->
        @props.flux.getProjectActions(@props.project_id).open_file(path:path,foreground:true)

    write_file: (path, content) ->
        actions = @props.flux.getActions(@props.name)
        id = actions.set_activity(desc:"Writing #{path}")
        salvus_client.write_text_file_to_project
            project_id : @props.project_id
            path       : path
            content    : content
            cb         : (err) =>
                actions.set_activity(id:id)
                if not err
                    @open_file(path)
                else
                    actions.set_error("Error writing '#{path}' -- '#{err}'")

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
            <span>Save grades to... </span>
            <ButtonToolbar>
                <Button onClick={@save_grades_to_csv}>CSV file...</Button>
                <Button onClick={@save_grades_to_py}>Python file...</Button>
            </ButtonToolbar>
            <hr/>
            <span style={color:"#666"}>
                You may export all the grades you have recorded
                for students in your course to a csv or Python file.
            </span>
        </Panel>

    render :->
        <Row>
            <Col md=6>
                {@render_title_description()}
            </Col>
            <Col md=6>
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
        project_map  : rtypes.object  # gets updated when student is active on their project

    render_activity: ->
        if @props.activity?
            <ActivityDisplay activity={misc.values(@props.activity)} trunc=80
                on_clear={=>@props.flux.getActions(@props.name).clear_activity()} />

    render_error: ->
        if @props.error
            <ErrorDisplay error={@props.error} onClose={=>@props.flux.getActions(@props.name).set_error('')} />

    render_students: ->
        if @props.flux? and @props.students? and @props.user_map? and @props.project_map?
            <Students flux={@props.flux} students={@props.students}
                      name={@props.name} project_id={@props.project_id}
                      user_map={@props.user_map} project_map={@props.project_map} />
        else
            return <Loading />

    render_assignments: ->
        if @props.flux? and @props.assignments? and @props.user_map? and @props.students?
            <Assignments flux={@props.flux} assignments={@props.assignments}
                name={@props.name} project_id={@props.project_id} user_map={@props.user_map} students={@props.students} />
        else
            return <Loading />

    render_settings: ->
        if @props.flux? and @props.settings?
            <Settings flux={@props.flux} settings={@props.settings}
                      name={@props.name} project_id={@props.project_id}
                      path={@props.path} />
        else
            return <Loading />

    render_student_header: ->
        n = @props.flux.getStore(@props.name)?.num_students()
        <Tip title="Students" tip="This tab lists all students in your course, along with their grades on each assignment.  You can also quickly find students by name on the left and add new students on the right.">
            <span>
                <Icon name="users"/> Students {if n? then " (#{n})" else ""}
            </span>
        </Tip>

    render_assignment_header: ->
        n = @props.flux.getStore(@props.name)?.num_assignments()
        <Tip title="Assignments" tip="This tab lists all of the assignments associated to your course, along with student grades and status about each assignment.  You can also quickly find assignments by name on the left.   An assignment is a directory in your project, which may contain any files.  Add an assignment to your course by searching for the directory name in the search box on the right.">
            <span>
                <Icon name="share-square-o"/> Assignments {if n? then " (#{n})" else ""}
            </span>
        </Tip>

    render_settings_header: ->
        <Tip title="Settings"
             tip="Configure various things about your course here, including the title and description.  You can also export all grades in various formats from this page.">
            <span>
                <Icon name="wrench"/> Settings
            </span>
        </Tip>

    render_save_button: ->
        if @props.show_save_button
            <SaveButton saving={@props.saving} unsaved={true} on_click={=>@props.flux.getActions(@props.name).save()}/>

    render: ->
        <div>
            {@render_save_button()}
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
                <TabPane eventKey={'settings'} tab={@render_settings_header()}>
                    <div style={marginTop:'8px'}></div>
                    {@render_settings()}
                </TabPane>
            </TabbedArea>
        </div>

render = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    <FluxComponent flux={flux} connectToStores={[name, 'users', 'projects']} >
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
    fname = flux_name(project_id, path)
    db = syncdbs[fname]
    if not db?
        return
    db.destroy()
    delete syncdbs[fname]
    React.unmountComponentAtNode(dom_node)
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    store = flux.getStore(fname)
    delete store.state
    flux.removeStore(fname)
    flux.removeActions(fname)

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

