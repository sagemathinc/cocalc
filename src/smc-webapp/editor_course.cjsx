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

###
Course Management

AUTHORS:
   - first version written by William Stein, July 13-25, 2015 while completely unemployed.

IDEAS FOR NEXT VERSION (after a release):
- [ ] (1:00?) ui -- maybe do a max-height on listing of student assignments or somewhere and overflow auto
- [ ] (1:00?) provide a way to enable/disable tooltips on a per-application basis
- [ ] (1:30?) #speed cache stuff/optimize for speed
- [ ] (0:30?) #unclear rename "Settings" to something else, maybe "Control".
- [ ] (0:45?) #unclear button in settings to update collaborators, titles, etc. on all student projects
- [ ] (2:00?) #unclear way to send an email to every student in the class (require some sort of premium account?)
- [ ] (2:00?) #unclear automatically collect assignments on due date (?)
- [ ] (5:00?) #unclear realtime chat for courses...
- [ ] (8:00?) #unclear way to show other viewers that a field is being actively edited by a user (no idea how to do this in react)

###

# standard non-SMC libraries
immutable = require('immutable')
async     = require('async')

# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{salvus_client} = require('./salvus_client')
{synchronized_db} = require('./syncdb')
schema = require('smc-util/schema')

# React libraries
{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')

{Alert, Button, ButtonToolbar, ButtonGroup, Input, Row, Col,
    Panel, Popover, Tabs, Tab, Well} = require('react-bootstrap')

{ActivityDisplay, ErrorDisplay, Help, Icon, Loading,
    SaveButton, SearchInput, SelectorInput, Space, TextInput, TimeAgo, Tip, NumberInput} = require('./r_misc')

# Course components
#{CourseActions} = require('./course_editor_components/actions')
#{CourseStore} = require('./course_editor_components/store')
{StudentsPanel} = require('./course_editor_components/students_panel')
{AssignmentsPanel} = require('./course_editor_components/assignments_panel')
{SettingsPanel} = require('./course_editor_components/settings_panel')
{SharedProjectPanel} = require('./course_editor_components/shared_project_panel')
{STEPS, previous_step, step_direction, step_verb, step_ready} = require('./course_editor_components/common.cjsx')


PARALLEL_LIMIT = 5  # number of async things to do in parallel

redux_name = (project_id, course_filename) ->
    return "editor-#{project_id}-#{course_filename}"

primary_key =
    students    : 'student_id'
    assignments : 'assignment_id'

syncdbs = {}
exports.init_redux = init_redux = (redux, course_project_id, course_filename) ->
    the_redux_name = redux_name(course_project_id, course_filename)
    get_actions = ->redux.getActions(the_redux_name)
    get_store = -> redux.getStore(the_redux_name)
    if get_actions()?
        # already initalized
        return
    syncdb = undefined
    user_store = redux.getStore('users')
    class CourseActions extends Actions
        # INTERNAL API
        _loaded: =>
            if not syncdb?
                @set_error("attempt to set syncdb before loading")
                return false
            return true

        _store_is_initialized: =>
            store = get_store()
            return if not store?
            if not (store.get('students')? and store.get('assignments')? and store.get('settings')?)
                @set_error("store must be initialized")
                return false
            return true

        _update: (opts) =>
            if not @_loaded() then return
            syncdb.update(opts)
            @save()

        set_tab: (tab) =>
            @setState(tab:tab)

        save: () =>
            store = get_store()
            return if not store?  # e.g., if the course store object already gone due to closing course.
            if store.get('saving')
                return # already saving
            id = @set_activity(desc:"Saving...")
            @setState(saving:true)
            syncdb.save (err) =>
                @clear_activity(id)
                @setState(saving:false)
                @setState(unsaved:syncdb?.has_unsaved_changes())
                if err
                    @set_error("Error saving -- #{err}")
                    @setState(show_save_button:true)
                else
                    @setState(show_save_button:false)

        _syncdb_change: (changes) =>
            store = get_store()
            return if not store?
            cur = t = store.getState()

            remove = (x.remove for x in changes when x.remove?)
            insert = (x.insert for x in changes when x.insert?)
            # first remove, then insert (or we could loose things!)
            if not t.get(x.table)?
                t = t.set(x.table, immutable.Map())
            for x in remove
                if x.table != 'settings'
                    y = misc.copy_without(x, 'table')
                    a = t.get(x.table).delete(x[primary_key[x.table]])
                    t = t.set(x.table, a)

            for x in insert
                if x.table == 'settings'
                    s = t.get('settings')
                    for k, v of misc.copy_without(x, 'table')
                        s = s.set(k, immutable.fromJS(v))
                    t = s.set('settings', s)
                else
                    y = immutable.fromJS(misc.copy_without(x, 'table'))
                    a = t.get(x.table).set(x[primary_key[x.table]], y)
                    t = t.set(x.table, a)
            if cur != t  # something changed
                @setState(t)
                @setState(unsaved:syncdb?.has_unsaved_changes())

        # PUBLIC API

        set_error: (error) =>
            if error == ''
                @setState(error:error)
            else
                @setState(error:((get_store()?.get('error') ? '') + '\n' + error).trim())

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
            if not store?  # course was closed
                return
            x = store.get_activity()?.toJS()
            if not x?
                x = {}
            if not opts.desc?
                delete x[opts.id]
            else
                x[opts.id] = opts.desc
            @setState(activity: x)
            return opts.id

        clear_activity: (id) =>
            if id?
                @set_activity(id:id)  # clears for this id
            else
                @setState(activity:{})

        # Settings
        set_title: (title) =>
            @_update(set:{title:title}, where:{table:'settings'})
            @set_all_student_project_titles(title)

        set_description: (description) =>
            @_update(set:{description:description}, where:{table:'settings'})
            @set_all_student_project_descriptions(description)

        set_email_invite: (body) =>
            @_update(set:{email_invite:body}, where:{table:'settings'})

        # return the default title and description of the shared project.
        shared_project_settings: () =>
            store = get_store()
            return if not store?
            x =
                title       : "Shared Project -- #{store.getIn(['settings', 'title'])}"
                description : store.getIn(['settings', 'description']) + "\n---\n This project is shared with all students."
            return x

        # start the shared project running (if it is defined)
        action_shared_project: (action) =>
            if action not in ['start', 'stop', 'restart']
                throw Error("action must be start, stop or restart")
            store = get_store()
            return if not store?
            shared_project_id = store.get_shared_project_id()
            if not shared_project_id
                return  # no shared project
            redux.getActions('projects')[action+"_project"]?(shared_project_id)

        # configure the shared project so that it has everybody as collaborators
        configure_shared_project: =>
            store = get_store()
            return if not store?
            shared_project_id = store.get_shared_project_id()
            if not shared_project_id
                return  # no shared project
            # add collabs -- all collaborators on course project and all students
            projects = redux.getStore('projects')
            current = projects.get_users(shared_project_id)
            if not current?
                return
            actions = redux.getActions('projects')
            invite = (account_id) =>
                actions.invite_collaborator(shared_project_id, account_id)
            projects.get_users(course_project_id).map (_, account_id) =>
                if not current.get(account_id)?
                    invite(account_id)
            store.get_students().map (student, student_id) =>
                account_id = student.get('account_id')
                if account_id? and not current.get(account_id)?
                    invite(account_id)

        # set the shared project id in our syncdb
        _set_shared_project_id: (project_id) =>
            @_update
                set   : {shared_project_id:project_id}
                where : {table:'settings'}

        # create the globally shared project if it doesn't exist
        create_shared_project: () =>
            store = get_store()
            return if not store?
            if store.get_shared_project_id()
                return
            id = @set_activity(desc:"Creating global shared project for everybody.")
            x  = @shared_project_settings()
            x.token = misc.uuid()
            redux.getActions('projects').create_project(x)
            redux.getStore('projects').wait_until_project_created x.token, 30, (err, project_id) =>
                @clear_activity(id)
                if err
                    @set_error("error creating shared project -- #{err}")
                else
                    @_set_shared_project_id(project_id)
                    @configure_shared_project()

        # Set the pay option for the course, and ensure that the course fields are
        # set on every student project in the course (see schema.coffee for format
        # of the course field) to reflect this change in the database.
        set_course_info: (pay='') =>
            @_update(set:{pay:pay}, where:{table:'settings'})
            @set_all_student_project_course_info(pay)

        # Students
        add_students: (students) =>
            # students = array of account_id or email_address
            # New student_id's will be constructed randomly for each student
            student_ids = []
            for x in students
                student_id = misc.uuid()
                student_ids.push(student_id)
                obj = {table:'students', student_id:student_id}
                syncdb.update(set:x, where:obj)
            syncdb.save()
            f = (student_id, cb) =>
                async.series([
                    (cb) =>
                        store = get_store()
                        if not store?
                            cb("store not defined"); return
                        store.wait
                            until   : (store) => store.get_student(student_id)
                            timeout : 60
                            cb      : cb
                    (cb) =>
                        @create_student_project(student_id)
                        store = get_store()
                        if not store?
                            cb("store not defined"); return
                        store.wait
                            until   : (store) => store.get_student(student_id).get('project_id')
                            timeout : 60
                            cb      : cb
                ], cb)
            id = @set_activity(desc:"Creating #{students.length} student projects (do not close this until done)")
            async.mapLimit student_ids, 1, f, (err) =>
                @set_activity(id:id)
                if err
                    @set_error("error creating student projects -- #{err}")
                # after adding students, always run configure all projects,
                # to ensure everything is set properly
                @configure_all_projects()

        delete_student: (student) =>
            store = get_store()
            return if not store?
            student = store.get_student(student)
            @_update
                set   : {deleted : true}
                where : {student_id : student.get('student_id'), table : 'students'}

        undelete_student: (student) =>
            store = get_store()
            return if not store?
            student = store.get_student(student)
            @_update
                set   : {deleted : false}
                where : {student_id : student.get('student_id'), table : 'students'}

        # Some students might *only* have been added using their email address, but they
        # subsequently signed up for an SMC account.  We check for any of these and if
        # we find any, we add in the account_id information about that student.
        lookup_nonregistered_students: =>
            store = get_store()
            if not store?
                console.warn("lookup_nonregistered_students: store not initialized")
                return
            v = {}
            s = []
            store.get_students().map (student, student_id) =>
                if not student.get('account_id') and not student.get('deleted')
                    email = student.get('email_address')
                    v[email] = student_id
                    s.push(email)
            if s.length > 0
                salvus_client.user_search
                    query : s.join(',')
                    limit : s.length
                    cb    : (err, result) =>
                        if err
                            console.warn("lookup_nonregistered_students: search error -- #{err}")
                        else
                            for x in result
                                @_update
                                    set   : {account_id: x.account_id}
                                    where : {table: 'students', student_id: v[x.email_address]}

        # Student projects

        # Create a single student project.
        create_student_project: (student) =>
            store = get_store()
            return if not store?
            if not store.get('students')? or not store.get('settings')?
                @set_error("attempt to create when stores not yet initialized")
                return
            if not @_create_student_project_queue?
                @_create_student_project_queue = [student]
            else
                @_create_student_project_queue.push(student)
            if not @_creating_student_project
                @_process_create_student_project_queue()

        # Process first requested student project creation action, then each subsequent one until
        # there aren't any more to do.
        _process_create_student_project_queue: () =>
            @_creating_student_project = true
            queue = @_create_student_project_queue
            student = queue[0]
            store = get_store()
            return if not store?
            student_id = store.get_student(student).get('student_id')
            @_update(set:{create_project:salvus_client.server_time()}, where:{table:'students',student_id:student_id})
            id = @set_activity(desc:"Create project for #{store.get_student_name(student_id)}.")
            token = misc.uuid()
            redux.getActions('projects').create_project
                title       : store.getIn(['settings', 'title'])
                description : store.getIn(['settings', 'description'])
                token       : token
            redux.getStore('projects').wait_until_project_created token, 30, (err, project_id) =>
                @clear_activity(id)
                if err
                    @set_error("error creating student project -- #{err}")
                else
                    @_update
                        set   : {create_project:undefined, project_id:project_id}
                        where : {table:'students', student_id:student_id}
                    @configure_project(student_id)
                delete @_creating_student_project
                queue.shift()
                if queue.length > 0
                    # do next one
                    @_process_create_student_project_queue()

        configure_project_users: (student_project_id, student_id, do_not_invite_student_by_email) =>
            #console.log("configure_project_users", student_project_id, student_id)
            # Add student and all collaborators on this project to the project with given project_id.
            # users = who is currently a user of the student's project?
            users = redux.getStore('projects').get_users(student_project_id)  # immutable.js map
            # Define function to invite or add collaborator
            s = get_store()
            body = s.get_email_invite()
            invite = (x) ->
                if '@' in x
                    if not do_not_invite_student_by_email
                        title   = s.getIn(['settings', 'title'])
                        subject = "SageMathCloud Invitation to Course #{title}"
                        name    = redux.getStore('account').get_fullname()
                        body    = body.replace(/{title}/g, title).replace(/{name}/g, name)
                        body    = require('./markdown').markdown_to_html(body).s
                        redux.getActions('projects').invite_collaborators_by_email(student_project_id, x, body, subject, true)
                else
                    redux.getActions('projects').invite_collaborator(student_project_id, x)
            # Make sure the student is on the student's project:
            student = s.get_student(student_id)
            student_account_id = student.get('account_id')
            if not student_account_id?  # no known account yet
                invite(student.get('email_address'))
            else if not users?.get(student_account_id)?   # users might not be set yet if project *just* created
                invite(student_account_id)
            # Make sure all collaborators on course project are on the student's project:
            target_users = redux.getStore('projects').get_users(course_project_id)
            if not target_users?
                return  # projects store isn't sufficiently initialized, so we can't do this yet...
            target_users.map (_, account_id) =>
                if not users?.get(account_id)?
                    invite(account_id)

        configure_project_visibility: (student_project_id) =>
            users_of_student_project = redux.getStore('projects').get_users(student_project_id)
            if not users_of_student_project?  # e.g., not defined in admin view mode
                return
            # Make project not visible to any collaborator on the course project.
            users = redux.getStore('projects').get_users(course_project_id)
            if not users? # TODO: should really wait until users is defined, which is a supported thing to do on stores!
                return
            users.map (_, account_id) =>
                x = users_of_student_project.get(account_id)
                if x? and not x.get('hide')
                    redux.getActions('projects').set_project_hide(account_id, student_project_id, true)

        configure_project_title: (student_project_id, student_id) =>
            store = get_store()
            title = "#{store.get_student_name(student_id)} - #{store.getIn(['settings', 'title'])}"
            redux.getActions('projects').set_project_title(student_project_id, title)

        # start projects of all (non-deleted) students running
        action_all_student_projects: (action) =>
            if action not in ['start', 'stop', 'restart']
                throw Error("action must be start, stop or restart")
            get_store()?.get_students().map (student, student_id) =>
                if not student.get('deleted')
                    # really only start non-deleted students' projects
                    student_project_id = student.get('project_id')
                    if student_project_id?
                        redux.getActions('projects')[action+"_project"](student_project_id)
            @action_shared_project(action)

        set_all_student_project_titles: (title) =>
            actions = redux.getActions('projects')
            get_store()?.get_students().map (student, student_id) =>
                student_project_id = student.get('project_id')
                project_title = "#{get_store().get_student_name(student_id)} - #{title}"
                if student_project_id?
                    actions.set_project_title(student_project_id, project_title)

        configure_project_description: (student_project_id, student_id) =>
            redux.getActions('projects').set_project_description(student_project_id, get_store().getIn(['settings', 'description']))

        set_all_student_project_descriptions: (description) =>
            get_store()?.get_students().map (student, student_id) =>
                student_project_id = student.get('project_id')
                if student_project_id?
                    redux.getActions('projects').set_project_description(student_project_id, description)

        set_all_student_project_course_info: (pay) =>
            if not pay?
                pay = get_store().get_pay()
            else
                @_update(set:{pay:pay}, where:{table:'settings'})
            get_store()?.get_students().map (student, student_id) =>
                student_project_id = student.get('project_id')
                # account_id: might not be known when student first added, or if student
                # hasn't joined smc yet so there is no id.
                student_account_id = student.get('account_id')
                student_email_address = student.get('email_address')  # will be known if account_id isn't known.
                if student_project_id?
                    redux.getActions('projects').set_project_course_info(student_project_id,
                            course_project_id, course_filename, pay, student_account_id, student_email_address)

        configure_project: (student_id, do_not_invite_student_by_email) =>
            # Configure project for the given student so that it has the right title,
            # description, and collaborators for belonging to the indicated student.
            # - Add student and collaborators on project containing this course to the new project.
            # - Hide project from owner/collabs of the project containing the course.
            # - Set the title to [Student name] + [course title] and description to course description.
            store = get_store()
            return if not store?
            student_project_id = store.getIn(['students', student_id, 'project_id'])
            if not student_project_id?
                @create_student_project(student_id)
            else
                @configure_project_users(student_project_id, student_id, do_not_invite_student_by_email)
                @configure_project_visibility(student_project_id)
                @configure_project_title(student_project_id, student_id)
                @configure_project_description(student_project_id, student_id)

        delete_project: (student_id) =>
            store = get_store()
            return if not store?
            student_project_id = store.getIn(['students', student_id, 'project_id'])
            if student_project_id?
                redux.getActions('projects').delete_project(student_project_id)
                @_update
                    set   : {create_project:undefined, project_id:undefined}
                    where : {table:'students', student_id:student_id}

        configure_all_projects: =>
            id = @set_activity(desc:"Configuring all projects")
            @setState(configure_projects:'Configuring projects')
            store = get_store()
            if not store?
                @set_activity(id:id)
                return
            for student_id in store.get_student_ids(deleted:false)
                @configure_project(student_id, false)   # always re-invite students on running this.
            @configure_shared_project()
            @set_activity(id:id)
            @set_all_student_project_course_info()

        delete_all_student_projects: () =>
            id = @set_activity(desc:"Deleting all student projects...")
            store = get_store()
            if not store?
                @set_activity(id:id)
                return
            for student_id in store.get_student_ids(deleted:false)
                @delete_project(student_id)
            @set_activity(id:id)

        # upgrades is a map from the quota type to the new quota to be applied by the instructor.
        upgrade_all_student_projects: (upgrades) =>
            id = @set_activity(desc:"Upgrading all student projects...")
            store = get_store()
            if not store?
                @set_activity(id:id)
                return
            for project_id in store.get_student_project_ids()
                redux.getActions('projects').apply_upgrades_to_project(project_id, upgrades)
            @set_activity(id:id)

        # Do an admin upgrade to all student projects.  This changes the base quotas for every student
        # project as indicated by the quotas object.  E.g., to increase the core quota from 1 to 2, do
        #         .admin_upgrade_all_student_projects(cores:2)
        # The quotas are: cores, cpu_shares, disk_quota, memory, mintime, network, member_host
        admin_upgrade_all_student_projects: (quotas) =>
            if not redux.getStore('account').get('groups')?.contains('admin')
                console.warn("must be an admin to upgrade")
                return
            store = get_store()
            if not store?
                console.warn('unable to get store')
                return
            f = (project_id, cb) =>
                x = misc.copy(quotas)
                x.project_id = project_id
                x.cb = (err, mesg) =>
                    if err or mesg.event == 'error'
                        console.warn("failed to set quotas for #{project_id} -- #{misc.to_json(mesg)}")
                    else
                        console.log("set quotas for #{project_id}")
                    cb(err)
                salvus_client.project_set_quotas(x)
            async.mapSeries store.get_student_project_ids(), f, (err) =>
                if err
                    console.warn("FAIL -- #{err}")
                else
                    console.log("SUCCESS")

        set_student_note: (student, note) =>
            store = get_store()
            return if not store?
            student = store.get_student(student)
            where      = {table:'students', student_id:student.get('student_id')}
            @_update(set:{"note":note}, where:where)

        _collect_path: (path) =>
            i = course_filename.lastIndexOf('.')
            course_filename.slice(0,i) + '-collect/' + path

        # Assignments
        add_assignment: (path) =>
            # Add an assignment to the course, which is defined by giving a directory in the project.
            # Where we collect homework that students have done (in teacher project)
            collect_path = @_collect_path(path)
            # folder that we return graded homework to (in student project)
            graded_path = path + '-graded'
            # folder where we copy the assignment to
            target_path = path
            @_update
                set   : {path: path, collect_path:collect_path, graded_path:graded_path, target_path:target_path}
                where : {table: 'assignments', assignment_id:misc.uuid()}

        delete_assignment: (assignment) =>
            store = get_store()
            return if not store?
            assignment = store.get_assignment(assignment)
            @_update
                set   : {deleted: true}
                where : {assignment_id: assignment.get('assignment_id'), table: 'assignments'}

        undelete_assignment: (assignment) =>
            store = get_store()
            return if not store?
            assignment = store.get_assignment(assignment)
            @_update
                set   : {deleted: false}
                where : {assignment_id: assignment.get('assignment_id'), table: 'assignments'}

        set_grade: (assignment, student, grade) =>
            store = get_store()
            return if not store?
            assignment = store.get_assignment(assignment)
            student    = store.get_student(student)
            where      = {table:'assignments', assignment_id:assignment.get('assignment_id')}
            grades     = syncdb.select_one(where:where).grades ? {}
            grades[student.get('student_id')] = grade
            @_update(set:{grades:grades}, where:where)

        _set_assignment_field: (assignment, name, val) =>
            store = get_store()
            return if not store?
            assignment = store.get_assignment(assignment)
            where      = {table:'assignments', assignment_id:assignment.get('assignment_id')}
            @_update(set:{"#{name}":val}, where:where)

        set_due_date: (assignment, due_date) =>
            @_set_assignment_field(assignment, 'due_date', due_date)

        set_assignment_note: (assignment, note) =>
            @_set_assignment_field(assignment, 'note', note)

        set_peer_grade: (assignment, config) =>
            cur = assignment.get('peer_grade')?.toJS() ? {}
            for k, v of config
                cur[k] = v
            @_set_assignment_field(assignment, 'peer_grade', cur)

        # Synchronous function that makes the peer grading map for the given
        # assignment, if it hasn't already been made.
        update_peer_assignment: (assignment) =>
            store = get_store()
            return if not store?
            assignment = store.get_assignment(assignment)
            if assignment.getIn(['peer_grade', 'map'])?
                return  # nothing to do
            N = assignment.getIn(['peer_grade','number']) ? 1
            map = misc.peer_grading(store.get_student_ids(), N)
            @set_peer_grade(assignment, map:map)

        # Copy the files for the given assignment_id from the given student to the
        # corresponding collection folder.
        # If the store is initialized and the student and assignment both exist,
        # then calling this action will result in this getting set in the store:
        #
        #    assignment.last_collect[student_id] = {time:?, error:err}
        #
        # where time >= now is the current time in milliseconds.
        copy_assignment_from_student: (assignment, student) =>
            if @_start_copy(assignment, student, 'last_collect')
                return
            id = @set_activity(desc:"Copying assignment from a student")
            finish = (err) =>
                @clear_activity(id)
                @_finish_copy(assignment, student, 'last_collect', err)
                if err
                    @set_error("copy from student: #{err}")
            store = get_store()
            return if not store?
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
                target_path = assignment.get('collect_path') + '/' + student.get('student_id')
                @set_activity(id:id, desc:"Copying assignment from #{student_name}")
                async.series([
                    (cb) =>
                        salvus_client.copy_path_between_projects
                            src_project_id    : student_project_id
                            src_path          : assignment.get('target_path')
                            target_project_id : course_project_id
                            target_path       : target_path
                            overwrite_newer   : assignment.get('collect_overwrite_newer')
                            delete_missing    : assignment.get('collect_delete_missing')
                            exclude_history   : false
                            cb                : cb
                    (cb) =>
                        # write their name to a file
                        name = store.get_student_name(student, true)
                        salvus_client.write_text_file_to_project
                            project_id : course_project_id
                            path       : target_path + "/STUDENT - #{name.simple}.txt"
                            content    : "This student is #{name.full}."
                            cb         : cb
                ], finish)

        # Copy the graded files for the given assignment_id back to the student in a -graded folder.
        # If the store is initialized and the student and assignment both exist,
        # then calling this action will result in this getting set in the store:
        #
        #    assignment.last_return_graded[student_id] = {time:?, error:err}
        #
        # where time >= now is the current time in milliseconds.

        return_assignment_to_student: (assignment, student) =>
            if @_start_copy(assignment, student, 'last_return_graded')
                return
            id = @set_activity(desc:"Returning assignment to a student")
            finish = (err) =>
                @clear_activity(id)
                @_finish_copy(assignment, student, 'last_return_graded', err)
                if err
                    @set_error("return to student: #{err}")
            store = get_store()
            if not @_store_is_initialized()
                return finish("store not yet initialized")
            grade = store.get_grade(assignment, student)
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
                src_path = assignment.get('collect_path')
                if assignment.getIn(['peer_grade', 'enabled'])
                    peer_graded = true
                    src_path  += '-peer-grade/'
                else
                    peer_graded = false
                src_path += '/' + student.get('student_id')
                async.series([
                    (cb) =>
                        # write their grade to a file
                        content = "Your grade on this assignment:\n\n    #{grade}"
                        if peer_graded
                            content += "\n\n\nPEER GRADED:\n\nYour assignment was peer graded by other students.\nYou can find the comments they made in the folders below."
                        salvus_client.write_text_file_to_project
                            project_id : course_project_id
                            path       : src_path + '/GRADE.txt'
                            content    : content
                            cb         : cb
                    (cb) =>
                        salvus_client.copy_path_between_projects
                            src_project_id    : course_project_id
                            src_path          : src_path
                            target_project_id : student_project_id
                            target_path       : assignment.get('graded_path')
                            overwrite_newer   : assignment.get('overwrite_newer')
                            delete_missing    : assignment.get('delete_missing')
                            exclude_history   : true
                            cb                : cb
                    (cb) =>
                        if peer_graded
                            # Delete GRADER file
                            salvus_client.exec
                                project_id : student_project_id
                                command    : 'rm ./*/GRADER*'
                                timeout    : 60
                                bash       : true
                                path       : assignment.get('graded_path')
                                cb         : cb
                          else
                              cb(null)
                ], finish)

        # Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
        return_assignment_to_all_students: (assignment, new_only) =>
            id = @set_activity(desc:"Returning assignments to all students #{if new_only then 'who have not already received it' else ''}")
            error = (err) =>
                @clear_activity(id)
                @set_error("return to student: #{err}")
            store = get_store()
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not assignment = store.get_assignment(assignment)  # correct use of "=" sign!
                return error("no assignment")
            errors = ''
            peer = assignment.get('peer_grade')?.get('enabled')
            f = (student_id, cb) =>
                if not store.last_copied(previous_step('return_graded', peer), assignment, student_id, true)
                    # we never collected the assignment from this student
                    cb(); return
                if not store.has_grade(assignment, student_id)
                    # we collected but didn't grade it yet
                    cb(); return
                if new_only
                    if store.last_copied('return_graded', assignment, student_id, true) and store.has_grade(assignment, student_id)
                        # it was already returned
                        cb(); return
                n = misc.mswalltime()
                @return_assignment_to_student(assignment, student_id)
                store.wait
                    timeout : 60*15
                    until   : => store.last_copied('return_graded', assignment, student_id) >= n
                    cb      : (err) =>
                        if err
                            errors += "\n #{err}"
                        cb()
            async.mapLimit store.get_student_ids(deleted:false), PARALLEL_LIMIT, f, (err) =>
                if errors
                    error(errors)
                else
                    @clear_activity(id)

        _finish_copy: (assignment, student, type, err) =>
            if student? and assignment?
                store = get_store(); student = store.get_student(student); assignment = store.get_assignment(assignment)
                where = {table:'assignments', assignment_id:assignment.get('assignment_id')}
                x = syncdb.select_one(where:where)?[type] ? {}
                x[student.get('student_id')] = {time: misc.mswalltime(), error:err}
                @_update(set:{"#{type}":x}, where:where)

        # This is called internally before doing any copy/collection operation
        # to ensure that we aren't doing the same thing repeatedly, and that
        # everything is in place to do the operation.
        _start_copy: (assignment, student, type) =>
            if student? and assignment?
                store = get_store(); student = store.get_student(student); assignment = store.get_assignment(assignment)
                where = {table:'assignments', assignment_id:assignment.get('assignment_id')}
                x = syncdb.select_one(where:where)?[type] ? {}
                y = (x[student.get('student_id')]) ? {}
                if y.start? and salvus_client.server_time() - y.start <= 15000
                    return true  # never retry a copy until at least 15 seconds later.
                y.start = misc.mswalltime()
                x[student.get('student_id')] = y
                @_update(set:{"#{type}":x}, where:where)
            return false

        _stop_copy: (assignment, student, type) =>
            if student? and assignment?
                store = get_store(); student = store.get_student(student); assignment = store.get_assignment(assignment)
                where = {table:'assignments', assignment_id:assignment.get('assignment_id')}
                x = syncdb.select_one(where:where)?[type]
                if not x?
                    return
                y = (x[student.get('student_id')])
                if not y?
                    return
                if y.start?
                    delete y.start
                    x[student.get('student_id')] = y
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
            if @_start_copy(assignment, student, 'last_assignment')
                return
            id = @set_activity(desc:"Copying assignment to a student")
            finish = (err) =>
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
            src_path = assignment.get('path')
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
                    # write the due date to a file
                    due_date = store.get_due_date(assignment)
                    if not due_date?
                        cb(); return
                    salvus_client.write_text_file_to_project
                        project_id : course_project_id
                        path       : src_path + '/DUE_DATE.txt'
                        content    : "This assignment is due\n\n   #{due_date.toLocaleString()}"
                        cb         : cb
                (cb) =>
                    @set_activity(id:id, desc:"Copying files to #{student_name}'s project")
                    salvus_client.copy_path_between_projects
                        src_project_id    : course_project_id
                        src_path          : src_path
                        target_project_id : student_project_id
                        target_path       : assignment.get('target_path')
                        overwrite_newer   : false
                        delete_missing    : false
                        backup            : true
                        exclude_history   : true
                        cb                : cb
            ], (err) =>
                finish(err)
            )



        copy_assignment: (type, assignment_id, student_id) =>
            # type = assigned, collected, graded
            switch type
                when 'assigned'
                    @copy_assignment_to_student(assignment_id, student_id)
                when 'collected'
                    @copy_assignment_from_student(assignment_id, student_id)
                when 'graded'
                    @return_assignment_to_student(assignment_id, student_id)
                when 'peer-assigned'
                    @peer_copy_to_student(assignment_id, student_id)
                when 'peer-collected'
                    @peer_collect_from_student(assignment_id, student_id)
                else
                    @set_error("copy_assignment -- unknown type: #{type}")

        # Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
        copy_assignment_to_all_students: (assignment, new_only) =>
            desc = "Copying assignments to all students #{if new_only then 'who have not already received it' else ''}"
            short_desc = "copy to student"
            @_action_all_students(assignment, new_only, @copy_assignment_to_student, 'assignment', desc, short_desc)

        # Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
        copy_assignment_from_all_students: (assignment, new_only) =>
            desc = "Copying assignment from all students #{if new_only then 'from whom we have not already copied it' else ''}"
            short_desc = "copy from student"
            @_action_all_students(assignment, new_only, @copy_assignment_from_student, 'collect', desc, short_desc)

        peer_copy_to_all_students: (assignment, new_only) =>
            desc = "Copying assignments for peer grading to all students #{if new_only then 'who have not already received their copy' else ''}"
            short_desc = "copy to student for peer grading"
            @_action_all_students(assignment, new_only, @peer_copy_to_student, 'peer_assignment', desc, short_desc)

        peer_collect_from_all_students: (assignment, new_only) =>
            desc = "Copying peer graded assignments from all students #{if new_only then 'from whom we have not already copied it' else ''}"
            short_desc = "copy peer grading from students"
            @_action_all_students(assignment, new_only, @peer_collect_from_student, 'peer_collect', desc, short_desc)

        _action_all_students: (assignment, new_only, action, step, desc, short_desc) =>
            id = @set_activity(desc:desc)
            error = (err) =>
                @clear_activity(id)
                err="#{short_desc}: #{err}"
                @set_error(err)
            store = get_store()
            if not @_store_is_initialized()
                return error("store not yet initialized")
            if not assignment = store.get_assignment(assignment)
                return error("no assignment")
            errors = ''
            peer = assignment.get('peer_grade')?.get('enabled')
            prev_step = previous_step(step, peer)
            f = (student_id, cb) =>
                if prev_step? and not store.last_copied(prev_step, assignment, student_id, true)
                    cb(); return
                if new_only and store.last_copied(step, assignment, student_id, true)
                    cb(); return
                n = misc.mswalltime()
                action(assignment, student_id)
                store.wait
                    timeout : 60*15
                    until   : => store.last_copied(step, assignment, student_id) >= n
                    cb      : (err) =>
                        if err
                            errors += "\n #{err}"
                        cb()

            async.mapLimit store.get_student_ids(deleted:false), PARALLEL_LIMIT, f, (err) =>
                if errors
                    error(errors)
                else
                    @clear_activity(id)

        # Copy the collected folders from some students to the given student for peer grading.
        peer_copy_to_student: (assignment, student) =>
            if @_start_copy(assignment, student, 'last_peer_assignment')
                return
            id = @set_activity(desc:"Copying peer grading to a student")
            finish = (err) =>
                @clear_activity(id)
                @_finish_copy(assignment, student, 'last_peer_assignment', err)
                if err
                    @set_error("copy peer-grading to student: #{err}")
            store = get_store()
            if not @_store_is_initialized()
                return finish("store not yet initialized")
            if not student = store.get_student(student)
                return finish("no student")
            if not assignment = store.get_assignment(assignment)
                return finish("no assignment")

            student_name = store.get_student_name(student)
            @set_activity(id:id, desc:"Copying peer grading to #{student_name}")

            @update_peer_assignment(assignment) # synchronous

            # list of student_id's
            peers = store.get_peers_that_student_will_grade(assignment, student)
            if not peers?
                # empty peer assignment for this student (maybe added late)
                return finish()

            student_project_id = student.get('project_id')

            guidelines = assignment.getIn(['peer_grade', 'guidelines']) ? 'Please grade this assignment.'
            due_date = assignment.getIn(['peer_grade', 'due_date'])
            if due_date?
                guidelines = "GRADING IS DUE #{due_date.toLocaleString()} \n\n " + guidelines

            target_base_path = assignment.get('path') + "-peer-grade"
            f = (student_id, cb) =>
                src_path = assignment.get('collect_path') + '/' + student_id
                target_path = target_base_path + "/" + student_id
                async.series([
                    (cb) =>
                        # delete the student's name so that grading is anonymous; also, remove original
                        # due date to avoid confusion.
                        name = store.get_student_name(student_id, true)
                        salvus_client.exec
                            project_id : course_project_id
                            command    : 'rm'
                            args       : ['-f', src_path + "/STUDENT - #{name.simple}.txt", src_path + "/DUE_DATE.txt", src_path + "/STUDENT - #{name.simple}.txt~", src_path + "/DUE_DATE.txt~"]
                            cb         : cb
                    (cb) =>
                        # copy the files to be peer graded into place for this student
                        salvus_client.copy_path_between_projects
                            src_project_id    : course_project_id
                            src_path          : src_path
                            target_project_id : student_project_id
                            target_path       : target_path
                            overwrite_newer   : false
                            delete_missing    : false
                            cb                : cb
                ], cb)

            # write instructions file to the student
            salvus_client.write_text_file_to_project
                project_id : student_project_id
                path       : target_base_path + "/GRADING_GUIDE.md"
                content    : guidelines
                cb         : (err) =>
                    if not err
                        # now copy actual stuff to grade
                        async.map(peers, f, finish)
                    else
                        finish(err)

        # Collect all the peer graading of the given student (not the work the student did, but
        # the grading about the student!).
        peer_collect_from_student: (assignment, student) =>
            if @_start_copy(assignment, student, 'last_peer_collect')
                return
            id = @set_activity(desc:"Collecting peer grading of a student")
            finish = (err) =>
                @clear_activity(id)
                @_finish_copy(assignment, student, 'last_peer_collect', err)
                if err
                    @set_error("collecting peer-grading of a student: #{err}")
            store = get_store()
            if not @_store_is_initialized()
                return finish("store not yet initialized")
            if not student = store.get_student(student)
                return finish("no student")
            if not assignment = store.get_assignment(assignment)
                return finish("no assignment")

            student_name = store.get_student_name(student)
            @set_activity(id:id, desc:"Collecting peer grading of #{student_name}")

            # list of student_id of students that graded this student
            peers = store.get_peers_that_graded_student(assignment, student)
            if not peers?
                # empty peer assignment for this student (maybe added late)
                return finish()

            our_student_id = student.get('student_id')

            f = (student_id, cb) =>
                s = store.get_student(student_id)
                if s.get('deleted')
                    # ignore deleted students
                    cb()
                    return
                path        = assignment.get('path')
                src_path    = "#{path}-peer-grade/#{our_student_id}"
                target_path = "#{assignment.get('collect_path')}-peer-grade/#{our_student_id}/#{student_id}"
                async.series([
                    (cb) =>
                        # copy the files over from the student who did the peer grading
                        salvus_client.copy_path_between_projects
                            src_project_id    : s.get('project_id')
                            src_path          : src_path
                            target_project_id : course_project_id
                            target_path       : target_path
                            overwrite_newer   : false
                            delete_missing    : false
                            cb                : cb
                    (cb) =>
                        # write local file identifying the grader
                        name = store.get_student_name(student_id, true)
                        salvus_client.write_text_file_to_project
                            project_id : course_project_id
                            path       : target_path + "/GRADER - #{name.simple}.txt"
                            content    : "The student who did the peer grading is named #{name.full}."
                            cb         : cb
                    (cb) =>
                        # write local file identifying student being graded
                        name = store.get_student_name(student, true)
                        salvus_client.write_text_file_to_project
                            project_id : course_project_id
                            path       : target_path + "/STUDENT - #{name.simple}.txt"
                            content    : "This student is #{name.full}."
                            cb         : cb
                ], cb)

            async.map(peers, f, finish)


        # This doesn't really stop it yet, since that's not supported by the backend.
        # It does stop the spinner and let the user try to restart the copy.
        stop_copying_assignment: (type, assignment_id, student_id) =>
            switch type
                when 'assigned'
                    type = 'last_assignment'
                when 'collected'
                    type = 'last_collect'
                when 'graded'
                    type = 'last_return_graded'
                when 'peer-assigned'
                    type = 'last_peer_assignment'
                when 'peer-collected'
                    type = 'last_peer_collect'
            @_stop_copy(assignment_id, student_id, type)

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
                when 'peer-assigned'  # where peer-assigned (in student's project)
                    proj = student_project_id
                    path = assignment.get('path') + '-peer-grade'
                when 'peer-collected'  # where collected peer-graded work (in our project)
                    path = assignment.get('collect_path') + '-peer-grade/' + student.get('student_id')
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
            redux.getProjectActions(proj).open_directory(path)

    redux.createActions(the_redux_name, CourseActions)
    class CourseStore extends Store
        any_assignment_uses_peer_grading: =>
            # Return true if there are any non-deleted assignments that use peer grading
            has_peer = false
            @get_assignments().forEach (assignment, _) =>
                if assignment.getIn(['peer_grade', 'enabled']) and not assignment.get('deleted')
                    has_peer = true
                    return false  # stop looping
            return has_peer

        get_peers_that_student_will_grade: (assignment, student) =>
            # Return the peer assignment for grading of the given assignment for the given student,
            # if such an assignment has been made.  If not, returns undefined.
            # In particular, this returns a Javascript array of student_id's.
            assignment = @get_assignment(assignment)
            student    = @get_student(student)
            return assignment.getIn(['peer_grade', 'map'])?.get(student.get('student_id'))?.toJS()

        get_peers_that_graded_student: (assignment, student) =>
            # Return Javascript array of the student_id's of the students
            # that graded the given student, or undefined if no relevant assignment.
            assignment = @get_assignment(assignment)
            map = assignment.getIn(['peer_grade', 'map'])
            if not map?
                return
            student = @get_student(student)
            id      = student.get('student_id')
            return (student_id for student_id, who_grading of map.toJS() when id in who_grading)

        get_shared_project_id: =>
            # return project_id (a string) if shared project has been created, or undefined or empty string otherwise.
            return @getIn(['settings', 'shared_project_id'])

        get_pay: =>
            return @getIn(['settings', 'pay']) ? ''

        get_email_invite: =>
            host = window.location.hostname
            @getIn(['settings', 'email_invite']) ? "We will use [SageMathCloud](https://#{host}) for the course *{title}*.  \n\nPlease sign up!\n\n--\n\n{name}"

        get_activity: =>
            @get('activity')

        get_students: =>
            @get('students')

        get_student_name: (student, include_email=false) =>
            student = @get_student(student)
            if not student?
                return 'student'
            email = student.get('email_address')
            name = user_store.get_name(student.get('account_id'))
            n = name ? email ? 'student'
            if not include_email
                return n
            if include_email and name? and email?
                full = n + " <#{email}>"
            else
                full = n
            return {simple:n.replace(/\W/g, ' '), full:full}

        get_student_email: (student) =>
            student = @get_student(student)
            if not student?
                return 'student'
            return student.get('email_address')

        get_student_ids: (opts) =>
            opts = defaults opts,
                deleted : false
            if not @get('students')?
                return
            v = []
            @get('students').map (val, student_id) =>
                if !!val.get('deleted') == opts.deleted
                    v.push(student_id)
            return v

        # return list of all non-deleted created student projects (or undefined if not loaded)
        get_student_project_ids: =>
            if not @get('students')?
                return
            v = []
            @get('students').map (val, student_id) =>
                if not val.get('deleted')
                    v.push(val.get('project_id'))
            return v

        get_student: (student) =>
            # return student with given id if a string; otherwise, just return student (the input)
            if typeof(student) != 'string'
                student = student?.get('student_id')
            return @getIn(['students', student])

        get_student_note: (student) =>
            return @get_student(student)?.get('note')

        get_student_project_id: (student) =>
            return @get_student(student)?.get('project_id')

        get_sorted_students: =>
            v = []
            @get('students').map (student, id) =>
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

        get_assignments: =>
            return @get('assignments')

        get_sorted_assignments: =>
            v = []
            @get_assignments().map (assignment, id) =>
                if not assignment.get('deleted')
                    v.push(assignment)
            f = (a) -> [a.get('due_date') ? 0, a.get('path')?.toLowerCase()]   # note: also used in compute_assignment_list
            v.sort (a,b) -> misc.cmp_array(f(a), f(b))
            return v

        get_assignment: (assignment) =>
            # return assignment with given id if a string; otherwise, just return assignment (the input)
            if typeof(assignment) != 'string'
                assignment = assignment?.get('assignment_id')
            return @getIn(['assignments', assignment])

        get_assignment_ids: (opts) =>
            opts = defaults opts,
                deleted : false   # if true return only deleted assignments
            if not @get_assignments()
                return
            v = []
            @get_assignments().map (val, assignment_id) =>
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

        # number of student projects that are currently running
        num_running_projects: (project_map) =>
            n = 0
            get_store()?.get_students().map (student, student_id) =>
                if not student.get('deleted')
                    if project_map.getIn([student.get('project_id'), 'state', 'state']) == 'running'
                        n += 1
            return n

        # number of non-deleted assignments
        num_assignments: => @_num_nondeleted(@get_assignments())

        # get info about relation between a student and a given assignment
        student_assignment_info: (student, assignment) =>
            assignment = @get_assignment(assignment)
            student = @get_student(student)
            student_id = student.get('student_id')
            status = @get_assignment_status(assignment)
            info =                         # RHS -- important to be undefined if no info -- assumed in code
                last_assignment      : assignment.get('last_assignment')?.get(student_id)?.toJS()
                last_collect         : assignment.get('last_collect')?.get(student_id)?.toJS()
                last_peer_assignment : assignment.get('last_peer_assignment')?.get(student_id)?.toJS()
                last_peer_collect    : assignment.get('last_peer_collect')?.get(student_id)?.toJS()
                last_return_graded   : assignment.get('last_return_graded')?.get(student_id)?.toJS()
                student_id           : student_id
                assignment_id        : assignment.get('assignment_id')
                peer_assignment      : (status.not_collect + status.not_assignment == 0) and status.collect != 0
                peer_collect         : status.not_peer_assignment? and status.not_peer_assignment == 0
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
            #  assignment          - number of students who have received assignment
            #  not_assignment      - number of students who have NOT received assignment
            #  collect             - number of students from whom we have collected assignment
            #  not_collect         - number of students from whom we have NOT collected assignment but we sent it to them
            #  peer_assignment     - number of students who have received peer assignment
            #                        (only present if peer grading enabled; similar for peer below)
            #  not_peer_assignment - number of students who have NOT received peer assignment
            #  peer_collect        - number of students from whom we have collected peer grading
            #  not_peer_collect    - number of students from whome we have NOT collected peer grading
            #  return_graded       - number of students to whom we've returned assignment
            #  not_return_graded   - number of students to whom we've NOT returned assignment
            #                        but we collected it from them *and* assigned a grade
            #
            # This function caches its result and only recomputes values when the store changes,
            # so it should be safe to call in render.
            #
            if not @_assignment_status?
                @_assignment_status = {}
                @on 'change', =>
                    @_assignment_status = {}
            assignment = @get_assignment(assignment)
            if not assignment?
                return undefined

            assignment_id = assignment.get('assignment_id')
            if @_assignment_status[assignment_id]?
                return @_assignment_status[assignment_id]

            students = @get_student_ids(deleted:false)
            if not students?
                return undefined

            # Is peer grading enabled?
            peer = assignment.get('peer_grade')?.get('enabled')

            info = {}
            for t in STEPS(peer)
                info[t] = 0
                info["not_#{t}"] = 0
            for student_id in students
                previous = true
                for t in STEPS(peer)
                    x = assignment.get("last_#{t}")?.get(student_id)
                    if x? and not x.get('error')
                        previous = true
                        info[t] += 1
                    else
                        # add one only if the previous step *was* done (and in
                        # the case of returning, they have a grade)
                        if previous and (t!='return_graded' or @has_grade(assignment, student_id))
                            info["not_#{t}"] += 1
                        previous = false

            @_assignment_status[assignment_id] = info
            return info
    redux.createStore(the_redux_name, CourseStore)

    synchronized_db
        project_id : course_project_id
        filename   : course_filename
        cb         : (err, _db) ->
            if err
                get_actions().set_error("unable to open #{@filename}")
            else
                syncdbs[the_redux_name] = syncdb = _db
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
                get_actions().setState(t)
                syncdb.on('change', (changes) -> get_actions()._syncdb_change(changes))

                # Wait until the projects store has data about users of our project before configuring anything.
                redux.getStore('projects').wait
                    until   :  (store) -> store.get_users(course_project_id)?
                    timeout : 30
                    cb      : ->
                        actions = get_actions()
                        actions.lookup_nonregistered_students()
                        actions.configure_all_projects()

    return # don't return syncdb above

CourseEditor = (name) -> rclass
    displayName : "CourseEditor"

    reduxProps :
        "#{name}" :
            error       : rtypes.string
            tab         : rtypes.string
            activity    : rtypes.object    # status messages about current activity happening (e.g., things being assigned)
            students    : rtypes.immutable
            assignments : rtypes.immutable
            settings    : rtypes.immutable
            unsaved     : rtypes.bool
        users :
            user_map    : rtypes.immutable
        projects :
            project_map : rtypes.immutable  # gets updated when student is active on their project

    propTypes :
        redux       : rtypes.object
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        path        : rtypes.string.isRequired

    render_activity : ->
        <ActivityDisplay activity={misc.values(@props.activity)} trunc=80
            on_clear={=>@props.redux.getActions(@props.name).clear_activity()} />

    render_error : ->
        <ErrorDisplay error={@props.error}
                      onClose={=>@props.redux.getActions(@props.name).set_error('')} />

    render_save_button : ->
        <SaveButton saving={@props.saving} unsaved={true} on_click={=>@props.redux.getActions(@props.name).save()}/>

    show_files : ->
        @props.redux?.getProjectActions(@props.project_id).set_focused_page('project-file-listing')

    render_files_button : ->
        <Button className='smc-small-only' style={float:'right', marginLeft:'15px'}
                onClick={@show_files}><Icon name='toggle-up'/> Files</Button>

    render_title : ->
        <h4 className='smc-big-only' style={float:'right'}>{misc.trunc(@props.settings?.get('title'),40)}</h4>

    show_timetravel: ->
        @props.redux?.getProjectActions(@props.project_id).open_file
            path               : misc.history_path(@props.path)
            foreground         : true
            foreground_project : true

    save_to_disk: ->
        @props.redux?.getActions(@props.name).save()

    render_save_timetravel: ->
        <div style={float:'right', marginRight:'15px'}>
            <ButtonGroup>
                <Button onClick={@save_to_disk}    bsStyle='success' disabled={not @props.unsaved}>
                    <Icon name='save'/>    Save
                </Button>
                <Button onClick={@show_timetravel} bsStyle='info'>
                    <Icon name='history'/> TimeTravel
                </Button>
            </ButtonGroup>
        </div>

    num_students: ->
        @props.redux.getStore(@props.name)?.num_students()

    num_assignments: ->
        @props.redux.getStore(@props.name)?.num_assignments()

    render_students : ->
        if @props.redux? and @props.students? and @props.user_map? and @props.project_map?
            <StudentsPanel redux={@props.redux} students={@props.students}
                      name={@props.name} project_id={@props.project_id}
                      user_map={@props.user_map} project_map={@props.project_map}
                      assignments={@props.assignments}
                      />
        else
            return <Loading />

    render_assignments : ->
        if @props.redux? and @props.assignments? and @props.user_map? and @props.students?
            <AssignmentsPanel redux={@props.redux} assignments={@props.assignments}
                name={@props.name} project_id={@props.project_id} user_map={@props.user_map} students={@props.students} />
        else
            return <Loading />

    render_settings : ->
        if @props.redux? and @props.settings?
            <SettingsPanel redux={@props.redux} settings={@props.settings}
                      name={@props.name} project_id={@props.project_id}
                      path={@props.path}
                      project_map={@props.project_map} />
        else
            return <Loading />

    render_shared_project: ->
        if @props.redux? and @props.settings?
            <SharedProjectPanel redux={@props.redux} name={@props.name}
                shared_project_id={@props.settings?.get('shared_project_id')}/>
        else
            return <Loading />

    render : ->
        <div>
            {@render_save_button() if @props.show_save_button}
            {@render_error() if @props.error}
            {@render_activity() if @props.activity?}
            {@render_files_button()}
            {@render_title()}
            {@render_save_timetravel()}
            <Tabs animation={false} activeKey={@props.tab} onSelect={(key)=>@props.redux?.getActions(@props.name).set_tab(key)}>
                <Tab eventKey={'students'} title={<StudentsPanel.Header n={@num_students()} />}>
                    <div style={marginTop:'8px'}></div>
                    {@render_students()}
                </Tab>
                <Tab eventKey={'assignments'} title={<AssignmentsPanel.Header n={@num_assignments()}/>}>
                    <div style={marginTop:'8px'}></div>
                    {@render_assignments()}
                </Tab>
                <Tab eventKey={'settings'} title={<SettingsPanel.Header />}>
                    <div style={marginTop:'8px'}></div>
                    {@render_settings()}
                </Tab>
                <Tab eventKey={'shared_project'} title={<SharedProjectPanel.Header project_exists={!!@props.settings?.get('shared_project_id')}/>}>
                    <div style={marginTop:'8px'}></div>
                    {@render_shared_project()}
                </Tab>
            </Tabs>
        </div>

render = (redux, project_id, path) ->
    name = redux_name(project_id, path)
    # dependence on account below is for adjusting quotas
    CourseEditor_connected = CourseEditor(name)
    <Redux redux={redux}>
        <CourseEditor_connected redux={redux} name={name} project_id={project_id} path={path} />
    </Redux>

exports.render_editor_course = (project_id, path, dom_node, redux) ->
    init_redux(redux, project_id, path)
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.hide_editor_course = (project_id, path, dom_node, redux) ->
    #console.log("hide_editor_course")
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show_editor_course = (project_id, path, dom_node, redux) ->
    #console.log("show_editor_course")
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.free_editor_course = (project_id, path, dom_node, redux) ->
    fname = redux_name(project_id, path)
    db = syncdbs[fname]
    if not db?
        return
    db.destroy()
    delete syncdbs[fname]
    ReactDOM.unmountComponentAtNode(dom_node)
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    store = redux.getStore(fname)
    delete store.state
    redux.removeStore(fname)
    redux.removeActions(fname)