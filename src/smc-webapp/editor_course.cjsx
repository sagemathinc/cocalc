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

{ActivityDisplay, Calendar, CloseX, DateTimePicker, ErrorDisplay, Help, Icon, LabeledRow, Loading, MarkdownInput,
    SaveButton, SearchInput, SelectorInput, Space, TextInput, TimeAgo, Tip, NumberInput, UPGRADE_ERROR_STYLE} = require('./r_misc')

{User} = require('./users')

{NoUpgrades} = require('./project_settings')

PARALLEL_LIMIT = 5  # number of async things to do in parallel

redux_name = (project_id, course_filename) ->
    return "editor-#{project_id}-#{course_filename}"

primary_key =
    students    : 'student_id'
    assignments : 'assignment_id'

STEPS = (peer) ->
    if peer
        return ['assignment', 'collect', 'peer_assignment', 'peer_collect', 'return_graded']
    else
        return ['assignment', 'collect', 'return_graded']

previous_step = (step, peer) ->
    switch step
        when 'collect'
            return 'assignment'
        when 'return_graded'
            if peer
                return 'peer_collect'
            else
                return 'collect'
        when 'assignment'
            return
        when 'peer_assignment'
            return 'collect'
        when 'peer_collect'
            return 'peer_assignment'
        else
            console.warn("BUG! previous_step('#{step}')")

step_direction = (step) ->
    switch step
        when 'assignment'
            return 'to'
        when 'collect'
            return 'from'
        when 'return_graded'
            return 'to'
        when 'peer_assignment'
            return 'to'
        when 'peer_collect'
            return 'from'
        else
            console.warn("BUG! step_direction('#{step}')")

step_verb = (step) ->
    switch step
        when 'assignment'
            return 'assign'
        when 'collect'
            return 'collect'
        when 'return_graded'
            return 'return'
        when 'peer_assignment'
            return 'assign'
        when 'peer_collect'
            return 'collect'
        else
            console.warn("BUG! step_verb('#{step}')")

step_ready = (step, n) ->
    switch step
        when 'assignment'
            return ''
        when 'collect'
            return if n >1 then ' who have already received it' else ' who has already received it'
        when 'return_graded'
            return ' whose work you have graded'
        when 'peer_assignment'
            return ' for peer grading'
        when 'peer_collect'
            return ' who should have peer graded it'


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

# Inline styles

entry_style =
    paddingTop    : '5px'
    paddingBottom : '5px'

selected_entry_style = misc.merge
    border        : '1px solid #aaa'
    boxShadow     : '5px 5px 5px #999'
    borderRadius  : '3px'
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
    displayName : "CourseEditorStudent"

    propTypes :
        redux       : rtypes.object.isRequired
        name        : rtypes.string.isRequired
        student     : rtypes.object.isRequired
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired  # here entirely to cause an update when project activity happens
        assignments : rtypes.object.isRequired  # here entirely to cause an update when project activity happens
        background  : rtypes.string

    shouldComponentUpdate : (nextProps, nextState) ->
        return @state != nextState or @props.student != nextProps.student or @props.assignments != nextProps.assignments  or @props.project_map != nextProps.project_map or @props.user_map != nextProps.user_map or @props.background != nextProps.background

    getInitialState : ->
        more : false
        confirm_delete: false

    render_student : ->
        <a href='' onClick={(e)=>e.preventDefault();@setState(more:not @state.more)}>
            <Icon style={marginRight:'10px'}
                  name={if @state.more then 'caret-down' else 'caret-right'}/>
            {@render_student_name()}
        </a>

    render_student_name : ->
        account_id = @props.student.get('account_id')
        if account_id?
            return <User account_id={account_id} user_map={@props.user_map} />
        return <span>{@props.student.get("email_address")} (invited)</span>

    render_student_email : ->
        email = @props.student.get("email_address")
        return <a href="mailto:#{email}">{email}</a>

    open_project : ->
        @props.redux.getActions('projects').open_project(project_id:@props.student.get('project_id'))

    create_project : ->
        @props.redux.getActions(@props.name).create_student_project(@props.student_id)

    render_last_active : ->
        student_project_id = @props.student.get('project_id')
        if not student_project_id?
            return
        # get the last time the student edited this project somehow.
        last_active = @props.redux.getStore('projects').get_last_active(student_project_id)?.get(@props.student.get('account_id'))
        if last_active   # could be 0 or undefined
            return <span style={color:"#666"}>(last used project <TimeAgo date={last_active} />)</span>
        else
            return <span style={color:"#666"}>(has never used project)</span>

    render_hosting: ->
        student_project_id = @props.student.get('project_id')
        if student_project_id
            upgrades = @props.redux.getStore('projects').get_total_project_quotas(student_project_id)
            if not upgrades?
                # user opening the course isn't a collaborator on this student project yet
                return
            if upgrades.member_host
                <Tip placement='left' title={<span><Icon name='check'/> Members-only hosting</span>} tip='Projects is on a members-only server, which is much more robust and has priority support.'>
                    <span style={color:'#888', cursor:'pointer'}><Icon name='check'/> Members-only</span>
                </Tip>
            else
                <Tip placement='left' title={<span><Icon name='exclamation-triangle'/> Free hosting</span>} tip='Project is hosted on a free server, so it may be overloaded and will be rebooted frequently.  Please upgrade in course settings.'>
                     <span style={color:'#888', cursor:'pointer'}><Icon name='exclamation-triangle'/> Free</span>
                </Tip>

    render_project : ->
        # first check if the project is currently being created
        create = @props.student.get("create_project")
        if create?
            # if so, how long ago did it start
            how_long = (salvus_client.server_time() - create)/1000
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

    delete_student : ->
        @props.redux.getActions(@props.name).delete_student(@props.student)
        @setState(confirm_delete:false)

    undelete_student : ->
        @props.redux.getActions(@props.name).undelete_student(@props.student)

    render_confirm_delete : ->
        if @state.confirm_delete
            <div>
                Are you sure you want to delete this student (you can always undelete them later)?<Space/>
                <ButtonToolbar>
                    <Button onClick={@delete_student} bsStyle='danger'>
                        <Icon name="trash" /> YES, Delete
                    </Button>
                    <Button onClick={=>@setState(confirm_delete:false)}>
                        Cancel
                    </Button>
                </ButtonToolbar>
            </div>

    render_delete_button : ->
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
                <Icon name="trash" /> Delete...
            </Button>

    render_title_due : (assignment) ->
        date = assignment.get('due_date')
        if date
            <span>(Due <TimeAgo date={date} />)</span>

    render_title : (assignment) ->
        <span>
            <em>{misc.trunc_middle(assignment.get('path'), 50)}</em> {@render_title_due(assignment)}
        </span>

    render_assignments_info_rows : ->
        store = @props.redux.getStore(@props.name)
        for assignment in store.get_sorted_assignments()
            grade = store.get_grade(assignment, @props.student)
            <StudentAssignmentInfo
                  key={assignment.get('assignment_id')}
                  title={@render_title(assignment)}
                  name={@props.name} redux={@props.redux}
                  student={@props.student} assignment={assignment}
                  grade={grade} />

    render_assignments_info : ->
        peer_grade = @props.redux.getStore(@props.name).any_assignment_uses_peer_grading()
        header = <StudentAssignmentInfoHeader key='header' title="Assignment" peer_grade={peer_grade}/>
        return [header, @render_assignments_info_rows()]

    render_note : ->
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
                    on_save     = {(value)=>@props.redux.getActions(@props.name).set_student_note(@props.student, value)}
                />
            </Col>
        </Row>

    render_more_info : ->
        # Info for each assignment about the student.
        v = []
        v.push <Row key='more'>
                <Col md=12>
                    {@render_assignments_info()}
                </Col>
            </Row>
        v.push(@render_note())
        return v

    render_basic_info : ->
        <Row key='basic' style={backgroundColor:@props.background}>
            <Col md=3>
                <h5>
                    {@render_student()}
                    {@render_deleted()}
                </h5>
            </Col>
            <Col md=2>
                <h5 style={color:"#666"}>
                    {@render_student_email()}
                </h5>
            </Col>
            <Col md=4 style={paddingTop:'10px'}>
                {@render_last_active()}
            </Col>
            <Col md=3 style={paddingTop:'10px'}>
                {@render_hosting()}
            </Col>
        </Row>

    render_deleted : ->
        if @props.student.get('deleted')
            <b> (deleted)</b>

    render_panel_header : ->
        <Row>
            <Col md=4>
                {@render_project()}
            </Col>
            <Col md=4 mdOffset=4>
                {@render_delete_button()}
            </Col>
        </Row>

    render_more_panel : ->
        <Panel header={@render_panel_header()}>
            {@render_more_info()}
        </Panel>

    render : ->
        <Row style={if @state.more then selected_entry_style else entry_style}>
            <Col xs=12>
                {@render_basic_info()}
                {@render_more_panel() if @state.more}
            </Col>
        </Row>

Students = rclass
    displayName : "CourseEditorStudents"

    propTypes :
        name        : rtypes.string.isRequired
        redux       : rtypes.object.isRequired
        project_id  : rtypes.string.isRequired
        students    : rtypes.object.isRequired
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired
        assignments : rtypes.object.isRequired

    getInitialState : ->
        err              : undefined
        search           : ''
        add_search       : ''
        add_searching    : false
        add_select       : undefined
        selected_entries : undefined
        show_deleted     : false

    do_add_search : (e) ->
        # Search for people to add to the course
        e?.preventDefault()
        if not @props.students?
            return
        if @state.add_searching # already searching
            return
        search = @state.add_search.trim()
        if search.length == 0
            @setState(err:undefined, add_select:undefined, selected_entries:undefined)
            return
        @setState(add_searching:true, add_select:undefined, selected_entries:undefined)
        add_search = @state.add_search
        salvus_client.user_search
            query : add_search
            limit : 50
            cb    : (err, select) =>
                if err
                    @setState(add_searching:false, err:err, add_select:undefined)
                    return
                # Get the current collaborators/owners of the project that contains the course.
                users = @props.redux.getStore('projects').get_users(@props.project_id)
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
                    return already_added[account_id] or already_added[email_address]
                select = (x for x in select when not exclude_add(x.account_id, x.email_address))
                # Put at the front of the list any email addresses not known to SMC (sorted in order) and also not invited to course.
                select = (x for x in noncloud_emails(select, add_search) when not already_added[x.email_address]).concat(select)
                # We are no longer searching, but now show an options selector.
                @setState(add_searching:false, add_select:select)

    student_add_button : ->
        <Button onClick={@do_add_search}>
            {if @props.add_searching then <Icon name="circle-o-notch" spin /> else <Icon name="search" />}
        </Button>

    add_selector_clicked : ->
        @setState(selected_entries: @refs.add_select.getSelectedOptions())

    add_selected_students : ->
        emails = {}
        for x in @state.add_select
            if x.account_id?
                emails[x.account_id] = x.email_address
        students = []

        # handle case, where just one name is listed → clicking on "add" would clear everything w/o inviting
        selected_names = @refs.add_select.getSelectedOptions()
        selections = []
        if selected_names.length == 0
            all_names = @refs.add_select.getInputDOMNode().getElementsByTagName('option')
            if all_names?.length == 1
                selections = [all_names[0].getAttribute('value')]
        else
            selections = selected_names

        for y in selections
            if misc.is_valid_uuid_string(y)
                students.push
                    account_id    : y
                    email_address : emails[y]
            else
                students.push({email_address:y})
        @props.redux.getActions(@props.name).add_students(students)
        @setState(err:undefined, add_select:undefined, selected_entries:undefined, add_search:'')

    get_add_selector_options : ->
        v = []
        seen = {}
        for x in @state.add_select
            key = x.account_id ? x.email_address
            if seen[key]
                continue
            seen[key] = true
            student_name = if x.account_id? then x.first_name + ' ' + x.last_name else x.email_address
            v.push(<option key={key} value={key} label={student_name}>{student_name}</option>)
        return v

    render_add_selector : ->
        if not @state.add_select?
            return
        options = @get_add_selector_options()
        <div>
            <Input type='select' multiple ref="add_select" rows=10 onClick={@add_selector_clicked}>{options}</Input>
            {@render_add_selector_button(options)}
        </div>

    render_add_selector_button : (options) ->
        nb_selected = @state.selected_entries?.length ? 0
        btn_text = switch options.length
            when 0 then "No student found"
            when 1 then "Add student"
            else switch nb_selected
                when 0 then "Select student above"
                when 1 then "Add selected student"
                else "Add #{nb_selected} students"
        disabled = options.length == 0 or (options.length >= 2 and nb_selected == 0)
        <Button onClick={@add_selected_students} disabled={disabled}><Icon name='user-plus' /> {btn_text}</Button>

    render_error : ->
        if @state.err
            <ErrorDisplay error={misc.trunc(@state.err,1024)} onClose={=>@setState(err:undefined)} />

    render_header : (num_omitted) ->
        <div>
            <Row>
                <Col md=3>
                    <SearchInput
                        placeholder = "Find students..."
                        default_value = {@state.search}
                        on_change   = {(value)=>@setState(search:value)}
                    />
                </Col>
                <Col md=4>
                    {<h5>(Omitting {num_omitted} students)</h5> if num_omitted}
                </Col>
                <Col md=5>
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

    compute_student_list : ->
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

    render_students : (students) ->
        for x,i in students
            <Student background={if i%2==0 then "#eee"} key={x.student_id}
                     student_id={x.student_id} student={@props.students.get(x.student_id)}
                     user_map={@props.user_map} redux={@props.redux} name={@props.name}
                     project_map={@props.project_map}
                     assignments={@props.assignments}
                     />

    render_show_deleted : (num_deleted) ->
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

    render : ->
        {students, num_omitted, num_deleted} = @compute_student_list()
        <Panel header={@render_header(num_omitted, num_deleted)}>
            {@render_students(students)}
            {@render_show_deleted(num_deleted) if num_deleted}
        </Panel>

DirectoryLink = rclass
    displayName : "DirectoryLink"

    propTypes :
        project_id : rtypes.string.isRequired
        path       : rtypes.string.isRequired
        redux      : rtypes.object.isRequired

    open_path : ->
        @props.redux.getProjectActions(@props.project_id).open_directory(@props.path)

    render : ->
        <a href="" onClick={(e)=>e.preventDefault(); @open_path()}>{@props.path}</a>

BigTime = rclass
    displayName : "CourseEditor-BigTime"

    render : ->
        date = @props.date
        if not date?
            return
        if typeof(date) == 'string'
            return <span>{date}</span>
        return <TimeAgo popover={true} date={date} />

StudentAssignmentInfoHeader = rclass
    displayName : "CourseEditor-StudentAssignmentInfoHeader"

    propTypes :
        title      : rtypes.string.isRequired
        peer_grade : rtypes.bool

    render_col: (number, key, width) ->
        switch key
            when 'last_assignment'
                title = 'Assign to Student'
                tip   = 'This column gives the status of making homework available to students, and lets you copy homework to one student at a time.'
            when 'collect'
                title = 'Collect from Student'
                tip   = 'This column gives status information about collecting homework from students, and lets you collect from one student at a time.'
            when 'grade'
                title = 'Grade'
                tip   = 'Record homework grade" tip="Use this column to record the grade the student received on the assignment. Once the grade is recorded, you can return the assignment.  You can also export grades to a file in the Settings tab.'

            when 'peer-assign'
                title = 'Assign Peer Grading'
                tip   = 'This column gives the status of sending out collected homework to students for peer grading.'

            when 'peer-collect'
                title = 'Collect Peer Grading'
                tip   = 'This column gives status information about collecting the peer grading work that students did, and lets you collect peer grading from one student at a time.'

            when 'return_graded'
                title = 'Return to Student'
                tip   = 'This column gives status information about when you returned homework to the students.  Once you have entered a grade, you can return the assignment.'
                placement = 'left'
        <Col md={width} key={key}>
                <Tip title={title} tip={tip}>
                    <b>{number}. {title}</b>
                </Tip>
        </Col>


    render_headers: ->
        w = 3
        <Row>
            {@render_col(1, 'last_assignment', w)}
            {@render_col(2, 'collect', w)}
            {@render_col(3, 'grade', w)}
            {@render_col(4, 'return_graded', w)}
        </Row>

    render_headers_peer: ->
        w = 2
        <Row>
            {@render_col(1, 'last_assignment', w)}
            {@render_col(2, 'collect', w)}
            {@render_col(3, 'peer-assign', w)}
            {@render_col(4, 'peer-collect', w)}
            {@render_col(5, 'grade', w)}
            {@render_col(6, 'return_graded', w)}
        </Row>

    render : ->
        <Row style={borderBottom:'2px solid #aaa'} >
            <Col md=2 key='title'>
                <Tip title={@props.title} tip={if @props.title=="Assignment" then "This column gives the directory name of the assignment." else "This column gives the name of the student."}>
                    <b>{@props.title}</b>
                </Tip>
            </Col>
            <Col md=10 key="rest">
                {if @props.peer_grade then @render_headers_peer() else @render_headers()}
            </Col>
        </Row>

StudentAssignmentInfo = rclass
    displayName : "CourseEditor-StudentAssignmentInfo"

    propTypes :
        name       : rtypes.string.isRequired
        redux      : rtypes.object.isRequired
        title      : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired
        student    : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (student_id) or student immutable js object
        assignment : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (assignment_id) or assignment immutable js object
        grade      : rtypes.string

    getInitialState : ->
        editing_grade : false

    open : (type, assignment_id, student_id) ->
        @props.redux.getActions(@props.name).open_assignment(type, assignment_id, student_id)

    copy : (type, assignment_id, student_id) ->
        @props.redux.getActions(@props.name).copy_assignment(type, assignment_id, student_id)

    stop : (type, assignment_id, student_id) ->
        @props.redux.getActions(@props.name).stop_copying_assignment(type, assignment_id, student_id)

    save_grade : (e) ->
        e?.preventDefault()
        @props.redux.getActions(@props.name).set_grade(@props.assignment, @props.student, @state.grade)
        @setState(editing_grade:false)

    edit_grade : ->
        @setState(grade:@props.grade, editing_grade:true)

    render_grade_score : ->
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

    render_grade : (info, width) ->
        bsStyle = if not (@props.grade ? '').trim() then 'primary'
        <Col md={width} key='grade'>
            <Tip title="Enter student's grade" tip="Enter the grade that you assigned to your student on this assignment here.  You can enter anything (it doesn't have to be a number).">
                <Button key='edit' onClick={@edit_grade} bsStyle={bsStyle}>Enter grade</Button>
            </Tip>
            {@render_grade_score()}
        </Col>

    render_last_time : (name, time) ->
        <div key='time' style={color:"#666"}>
            (<BigTime date={time} />)
        </div>

    render_open_recopy_confirm : (name, open, copy, copy_tip, open_tip, placement) ->
        key = "recopy_#{name}"
        if @state[key]
            v = []
            v.push <Button key="copy_confirm" bsStyle="danger" onClick={=>@setState("#{key}":false);copy()}>
                <Icon name="share-square-o" rotate={"180" if name.indexOf('ollect')!=-1}/> Yes, {name.toLowerCase()} again
            </Button>
            v.push <Button key="copy_cancel" onClick={=>@setState("#{key}":false);}>
                 Cancel
            </Button>
            return v
        else
            <Button key="copy" bsStyle='warning' onClick={=>@setState("#{key}":true)}>
                <Tip title={name} placement={placement}
                    tip={<span>{copy_tip}</span>}>
                    <Icon name='share-square-o' rotate={"180" if name.indexOf('ollect')!=-1}/> {name}...
                </Tip>
            </Button>

    render_open_recopy : (name, open, copy, copy_tip, open_tip) ->
        placement = if name == 'Return' then 'left' else 'right'
        <ButtonToolbar key='open_recopy'>
            {@render_open_recopy_confirm(name, open, copy, copy_tip, open_tip, placement)}
            <Button key='open'  onClick={open}>
                <Tip title="Open assignment" placement={placement} tip={open_tip}>
                    <Icon name="folder-open-o" /> Open
                </Tip>
            </Button>
        </ButtonToolbar>

    render_open_copying : (name, open, stop) ->
        if name == "Return"
            placement = 'left'
        <ButtonGroup key='open_copying'>
            <Button key="copy" bsStyle='success' disabled={true}>
                <Icon name="circle-o-notch" spin /> {name}ing
            </Button>
            <Button key="stop" bsStyle='danger' onClick={stop}>
                <Icon name="times" />
            </Button>
            <Button key='open'  onClick={open}>
                <Icon name="folder-open-o" /> Open
            </Button>
        </ButtonGroup>

    render_copy : (name, copy, copy_tip) ->
        if name == "Return"
            placement = 'left'
        <Tip key="copy" title={name} tip={copy_tip} placement={placement} >
            <Button onClick={copy} bsStyle={'primary'}>
                <Icon name="share-square-o" rotate={"180" if name.indexOf('ollect')!=-1}/> {name}
            </Button>
        </Tip>

    render_error : (name, error) ->
        if typeof(error) != 'string'
            error = misc.to_json(error)
        if error.indexOf('No such file or directory') != -1
            error = 'Somebody may have moved the folder that should have contained the assignment.\n' + error
        else
            error = "Try to #{name.toLowerCase()} again:\n" + error
        <ErrorDisplay key='error' error={error} style={maxHeight: '140px', overflow:'auto'}/>

    render_last : (name, obj, type, info, enable_copy, copy_tip, open_tip) ->
        open = => @open(type, info.assignment_id, info.student_id)
        copy = => @copy(type, info.assignment_id, info.student_id)
        stop = => @stop(type, info.assignment_id, info.student_id)
        obj ?= {}
        v = []
        if enable_copy
            if obj.start
                v.push(@render_open_copying(name, open, stop))
            else if obj.time
                v.push(@render_open_recopy(name, open, copy, copy_tip, open_tip))
            else
                v.push(@render_copy(name, copy, copy_tip))
        if obj.time
            v.push(@render_last_time(name, obj.time))
        if obj.error
            v.push(@render_error(name, obj.error))
        return v

    render_peer_assign: (info) ->
        <Col md={2} key='peer-assign'>
            {@render_last('Peer Assign', info.last_peer_assignment, 'peer-assigned', info, info.last_collect?,
               "Copy collected assignments from your project to this student's project so they can grade them.",
               "Open the student's copies of this assignment directly in their project, so you can see what they are peer grading.")}
        </Col>

    render_peer_collect: (info) ->
        <Col md={2} key='peer-collect'>
            {@render_last('Peer Collect', info.last_peer_collect, 'peer-collected', info, info.last_peer_assignment?,
               "Copy the peer-graded assignments from various student projects back to your project so you can assign their official grade.",
               "Open your copy of your student's peer grading work in your own project, so that you can grade their work.")}
        </Col>

    render : ->
        info = @props.redux.getStore(@props.name).student_assignment_info(@props.student, @props.assignment)
        peer_grade = @props.assignment.get('peer_grade')?.get('enabled')
        show_grade_col = (peer_grade and info.last_peer_collect) or (not peer_grade and info.last_collect)
        width = if peer_grade then 2 else 3
        <Row style={borderTop:'1px solid #aaa', paddingTop:'5px', paddingBottom: '5px'}>
            <Col md=2 key="title">
                {@props.title}
            </Col>
            <Col md=10 key="rest">
                <Row>
                    <Col md={width} key='last_assignment'>
                        {@render_last('Assign', info.last_assignment, 'assigned', info, true,
                           "Copy the assignment from your project to this student's project so they can do their homework.",
                           "Open the student's copy of this assignment directly in their project.  You will be able to see them type, chat with them, leave them hints, etc.")}
                    </Col>
                    <Col md={width} key='collect'>
                        {@render_last('Collect', info.last_collect, 'collected', info, info.last_assignment?,
                           "Copy the assignment from your student's project back to your project so you can grade their work.",
                           "Open the copy of your student's work in your own project, so that you can grade their work.")}
                    </Col>
                    {@render_peer_assign(info)  if peer_grade and info.peer_assignment}
                    {@render_peer_collect(info) if peer_grade and info.peer_collect}
                    {if show_grade_col then @render_grade(info, width) else <Col md={width} key='grade'></Col>}
                    <Col md={width} key='return_graded'>
                        {@render_last('Return', info.last_return_graded, 'graded', info, info.last_collect?,
                           "Copy the graded assignment back to your student's project.",
                           "Open the copy of your student's work that you returned to them. This opens the returned assignment directly in their project.") if @props.grade}
                    </Col>
                </Row>
            </Col>
        </Row>

StudentListForAssignment = rclass
    displayName : "CourseEditor-StudentListForAssignment"

    propTypes :
        name       : rtypes.string.isRequired
        redux      : rtypes.object.isRequired
        assignment : rtypes.object.isRequired
        students   : rtypes.object.isRequired
        user_map   : rtypes.object.isRequired
        background : rtypes.string

    render_student_info : (student_id) ->
        store = @props.redux.getStore(@props.name)
        <StudentAssignmentInfo
              key     = {student_id}
              title   = {misc.trunc_middle(store.get_student_name(student_id), 40)}
              name    = {@props.name}
              redux   = {@props.redux}
              student = {student_id}
              assignment = {@props.assignment}
              grade   = {store.get_grade(@props.assignment, student_id)} />

    render_students : ->
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

    render : ->
        <div>
            <StudentAssignmentInfoHeader
                key        = 'header'
                title      = "Student"
                peer_grade = {!!@props.assignment.get('peer_grade')?.get('enabled')}
            />
            {@render_students()}
        </div>

Assignment = rclass
    displayName : "CourseEditor-Assignment"

    propTypes :
        name       : rtypes.string.isRequired
        assignment : rtypes.object.isRequired
        project_id : rtypes.string.isRequired
        redux      : rtypes.object.isRequired
        students   : rtypes.object.isRequired
        user_map   : rtypes.object.isRequired
        background : rtypes.string

    shouldComponentUpdate : (nextProps, nextState) ->
        return @state != nextState or @props.assignment != nextProps.assignment or @props.students != nextProps.students or @props.user_map != nextProps.user_map or @props.background != nextProps.background

    getInitialState : ->
        x =
            more : false
            confirm_delete : false
        return x

    render_due : ->
        <Row>
            <Col xs=1 style={marginTop:'8px', color:'#666'}>
                <Tip placement='top' title="Set the due date"
                    tip="Set the due date for the assignment.  This changes how the list of assignments is sorted.  Note that you must explicitly click a button to collect student assignments when they are due -- they are not automatically collected on the due date.  You should also tell students when assignments are due (e.g., at the top of the assignment).">
                    Due
                </Tip>
            </Col>
            <Col xs=11>
                <DateTimePicker
                    value     = {@props.assignment.get('due_date') ? salvus_client.server_time()}
                    on_change = {@date_change}
                />
            </Col>
        </Row>

    date_change : (date) ->
        if not date
            date = @props.assignment.get('due_date') ? misc.server_time()
        @props.redux.getActions(@props.name).set_due_date(@props.assignment, date)

    render_note : ->
        <Row key='note' style={note_style}>
            <Col xs=2>
                <Tip title="Notes about this assignment" tip="Record notes about this assignment here. These notes are only visible to you, not to your students.  Put any instructions to students about assignments in a file in the directory that contains the assignment.">
                    Private Assignment Notes<br /><span style={color:"#666"}></span>
                </Tip>
            </Col>
            <Col xs=10>
                <MarkdownInput
                    rows          = 6
                    placeholder   = 'Private notes about this assignment (not visible to students)'
                    default_value = {@props.assignment.get('note')}
                    on_save       = {(value)=>@props.redux.getActions(@props.name).set_assignment_note(@props.assignment, value)}
                />
            </Col>
        </Row>

    render_more_header : ->
        status = @props.redux.getStore(@props.name).get_assignment_status(@props.assignment)
        if not status?
            return <Loading key='loading_more'/>
        v = []

        bottom =
            borderBottom  : '1px solid grey'
            paddingBottom : '15px'
            marginBottom  : '15px'
        v.push <Row key='header3' style={bottom}>
            <Col md=2>
                {@render_open_button()}
            </Col>
            <Col md=10>
                <Row>
                    <Col md=6 style={fontSize:'14px'} key='due'>
                        {@render_due()}
                    </Col>
                    <Col md=6 key='delete'>
                        <Row>
                            <Col md=7>
                                {@render_peer_button()}
                            </Col>
                            <Col md=5>
                                <span className='pull-right'>
                                    {@render_delete_button()}
                                </span>
                            </Col>
                        </Row>
                    </Col>
                </Row>
            </Col>
        </Row>

        if @state.configure_peer
            v.push <Row key='header2-peer' style={bottom}>
                <Col md=10 mdOffset=2>
                    {@render_configure_peer()}
                </Col>
            </Row>
        if @state.confirm_delete
            v.push <Row key='header2-delete' style={bottom}>
                <Col md=10 mdOffset=2>
                    {@render_confirm_delete()}
                </Col>
            </Row>

        peer = @props.assignment.get('peer_grade')?.get('enabled')
        if peer
            width = 2
        else
            width = 3
        buttons = []
        for name in STEPS(peer)
            b = @["render_#{name}_button"](status)
            if b?
                if name == 'return_graded'
                    buttons.push(<Col md={width} key='filler'></Col>)
                buttons.push(<Col md={width} key={name}>{b}</Col>)

        v.push <Row key='header-control'>
            <Col md=10 mdOffset=2 key='buttons'>
                <Row>
                    {buttons}
                </Row>
            </Col>
        </Row>

        v.push <Row key='header2-copy'>
            <Col md=10 mdOffset=2>
                {@render_copy_confirms(status)}
            </Col>
        </Row>

        return v

    render_more : ->
        <Row key='more'>
            <Col sm=12>
                <Panel header={@render_more_header()}>
                    <StudentListForAssignment redux={@props.redux} name={@props.name}
                        assignment={@props.assignment} students={@props.students}
                        user_map={@props.user_map} />
                    {@render_note()}
                </Panel>
            </Col>
        </Row>

    open_assignment_path : ->
        @props.redux.getProjectActions(@props.project_id).open_directory(@props.assignment.get('path'))

    render_open_button : ->
        <Tip key='open' title={<span><Icon name='folder-open-o'/> Open assignment</span>}
             tip="Open the folder in the current project that contains the original files for this assignment.  Edit files in this folder to create the content that your students will see when they receive an assignment.">
            <Button onClick={@open_assignment_path}>
                <Icon name="folder-open-o" /> Open
            </Button>
        </Tip>

    render_assignment_button : ->
        bsStyle = if (@props.assignment.get('last_assignment')?.size ? 0) == 0 then "primary" else "warning"
        <Button key='assign'
                bsStyle  = {bsStyle}
                onClick  = {=>@setState(copy_confirm_assignment:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}>
            <Tip title={<span>Assign: <Icon name='user-secret'/> You <Icon name='long-arrow-right' />  <Icon name='users' /> Students </span>}
                 tip="Copy the files for this assignment from this project to all other student projects.">
                <Icon name="share-square-o" /> Assign...
            </Tip>
        </Button>

    render_copy_confirms : (status) ->
        steps = STEPS(@props.assignment.get('peer_grade')?.get('enabled'))
        for step in steps
            if @state["copy_confirm_#{step}"]
                @render_copy_confirm(step, status)

    render_copy_confirm : (step, status) ->
        <span key="copy_confirm_#{step}">
            {@render_copy_confirm_to_all(step, status) if status[step]==0}
            {@render_copy_confirm_to_all_or_new(step, status) if status[step]!=0}
        </span>

    render_copy_cancel : (step) ->
        cancel = =>
            @setState("copy_confirm_#{step}":false, "copy_confirm_all_#{step}":false, copy_confirm:false)
        <Button key='cancel' onClick={cancel}>Cancel</Button>

    copy_assignment : (step, new_only) ->
        # assign assignment to all (non-deleted) students
        actions = @props.redux.getActions(@props.name)
        switch step
            when 'assignment'
                actions.copy_assignment_to_all_students(@props.assignment, new_only)
            when 'collect'
                actions.copy_assignment_from_all_students(@props.assignment, new_only)
            when 'peer_assignment'
                actions.peer_copy_to_all_students(@props.assignment, new_only)
            when 'peer_collect'
                actions.peer_collect_from_all_students(@props.assignment, new_only)
            when 'return_graded'
                actions.return_assignment_to_all_students(@props.assignment, new_only)
            else
                console.log("BUG -- unknown step: #{step}")
        @setState("copy_confirm_#{step}":false, "copy_confirm_all_#{step}":false, copy_confirm:false)

    render_copy_confirm_to_all : (step, status) ->
        n = status["not_#{step}"]
        <Alert bsStyle='warning' key="#{step}_confirm_to_all", style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {misc.capitalize(step_verb(step))} this homework {step_direction(step)} the {n} student{if n>1 then "s" else ""}{step_ready(step, n)}?
            </div>
            <ButtonToolbar>
                <Button key='yes' bsStyle='primary' onClick={=>@copy_assignment(step, false)} >Yes</Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
        </Alert>

    copy_confirm_all_caution : (step) ->
        switch step
            when 'assignment'
                return "This will recopy all of the files to them.  CAUTION: if you update a file that a student has also worked on, their work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots."
            when 'collect'
                return "This will recollect all of the homework from them.  CAUTION: if you have graded/edited a file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots."
            when 'return_graded'
                return "This will rereturn all of the graded files to them."
            when 'peer_assignment'
                return 'This will recopy all of the files to them.  CAUTION: if there is a file a student has also worked on grading, their work will get copied to a backup file ending in a tilde, or possibly be only available in snapshots.'
            when 'peer_collect'
                return 'This will recollect all of the peer-graded homework from the students.  CAUTION: if you have graded/edited a previously collected file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots.'

    render_copy_confirm_overwrite_all : (step, status) ->
        <div key="copy_confirm_overwrite_all" style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {@copy_confirm_all_caution(step)}
            </div>
            <ButtonToolbar>
                <Button key='all' bsStyle='danger' onClick={=>@copy_assignment(step, false)}>Yes, do it</Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
        </div>

    render_copy_confirm_to_all_or_new : (step, status) ->
        n = status["not_#{step}"]
        m = n + status[step]
        <Alert bsStyle='warning' key="#{step}_confirm_to_all_or_new" style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {misc.capitalize(step_verb(step))} this homework {step_direction(step)}...
            </div>
            <ButtonToolbar>
                <Button key='all' bsStyle='danger' onClick={=>@setState("copy_confirm_all_#{step}":true, copy_confirm:true)}
                        disabled={@state["copy_confirm_all_#{step}"]} >
                    {if step=='assignment' then 'All' else 'The'} {m} students{step_ready(step, m)}...
                </Button>
                {<Button key='new' bsStyle='primary' onClick={=>@copy_assignment(step, true)}>The {n} student{if n>1 then 's' else ''} not already {step_verb(step)}ed {step_direction(step)}</Button> if n}
                {@render_copy_cancel(step)}
            </ButtonToolbar>
            {@render_copy_confirm_overwrite_all(step, status) if @state["copy_confirm_all_#{step}"]}
        </Alert>

    render_collect_tip : (warning) ->
        <span key='normal'>
            Collect an assignment from all of your students.
            (There is currently no way to schedule collection at a specific time; instead, collection happens when you click the button.)
        </span>

    render_collect_button : (status) ->
        if status.assignment == 0
            # no button if nothing ever assigned
            return
        if status.collect > 0
            # Have already collected something
            bsStyle = 'warning'
        else
            bsStyle = 'primary'
        <Button key='collect'
                onClick  = {=>@setState(copy_confirm_collect:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}
                bsStyle={bsStyle} >
            <Tip
                title={<span>Collect: <Icon name='users' /> Students <Icon name='long-arrow-right' /> <Icon name='user-secret'/> You</span>}
                tip = {@render_collect_tip(bsStyle=='warning')}>
                <Icon name="share-square-o" rotate={"180"} /> Collect...
            </Tip>
        </Button>

    render_peer_assign_tip : (warning) ->
        <span key='normal'>
            Send copies of collected homework out to all students for peer grading.
        </span>

    render_peer_assignment_button: (status) ->
        # Render the "Peer Assign..." button in the top row, for peer assigning to all
        # students in the course.
        if not status.peer_assignment?
            # not peer graded
            return
        if status.not_collect + status.not_assignment > 0
            # collect everything before peer grading
            return
        if status.collect == 0
            # nothing to peer assign
            return
        if status.peer_assignment == 0
            # haven't peer-assigned anything yet
            bsStyle = 'primary'
        else
            # warning, since we have assigned already and this may overwrite
            bsStyle = 'warning'
        <Button key='peer-assign'
                onClick  = {=>@setState(copy_confirm_peer_assignment:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}
                bsStyle  = {bsStyle} >
            <Tip
                title={<span>Peer Assign: <Icon name='users' /> You <Icon name='long-arrow-right' /> <Icon name='user-secret'/> Students</span>}
                tip = {@render_peer_assign_tip(bsStyle=='warning')}>
                    <Icon name="share-square-o" /> Peer Assign...
            </Tip>
        </Button>

    render_peer_collect_tip : (warning) ->
        <span key='normal'>
            Collect the peer grading that your students did.
        </span>

    render_peer_collect_button: (status) ->
        # Render the "Peer Collect..." button in the top row, for collecting peer grading from all
        # students in the course.
        if not status.peer_collect?
            return
        if status.peer_assignment == 0
            # haven't even peer assigned anything -- so nothing to collect
            return
        if status.not_peer_assignment > 0
            # everybody must have received peer assignment, or collecting isn't allowed
            return
        if status.peer_collect == 0
            # haven't peer-collected anything yet
            bsStyle = 'primary'
        else
            # warning, since we have already collected and this may overwrite
            bsStyle = 'warning'
        <Button key='peer-collect'
                onClick  = {=>@setState(copy_confirm_peer_collect:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}
                bsStyle  = {bsStyle} >
            <Tip
                title={<span>Peer Collect: <Icon name='users' /> Students <Icon name='long-arrow-right' /> <Icon name='user-secret'/> You</span>}
                tip = {@render_peer_collect_tip(bsStyle=='warning')}>
                    <Icon name="share-square-o" rotate="180"/> Peer Collect...
            </Tip>
        </Button>

    return_assignment : ->
        # Assign assignment to all (non-deleted) students.
        @props.redux.getActions(@props.name).return_assignment_to_all_students(@props.assignment)

    render_return_graded_button : (status) ->
        if status.collect == 0
            # No button if nothing collected.
            return
        if status.peer_collect? and status.peer_collect == 0
            # Peer grading enabled, but we didn't collect anything yet
            return
        if status.not_return_graded == 0 and status.return_graded == 0
            # Nothing unreturned and ungraded yet and also nothing returned yet
            return
        if status.return_graded > 0
            # Have already returned some
            bsStyle = "warning"
        else
            bsStyle = "primary"
        <Button key='return'
            onClick  = {=>@setState(copy_confirm_return_graded:true, copy_confirm:true)}
            disabled = {@state.copy_confirm}
            bsStyle  = {bsStyle} >
            <Tip title={<span>Return: <Icon name='user-secret'/> You <Icon name='long-arrow-right' />  <Icon name='users' /> Students </span>}
                 tip="Copy the graded versions of files for this assignment from this project to all other student projects.">
                <Icon name="share-square-o" /> Return...
            </Tip>
        </Button>

    delete_assignment : ->
        @props.redux.getActions(@props.name).delete_assignment(@props.assignment)
        @setState(confirm_delete:false)

    undelete_assignment : ->
        @props.redux.getActions(@props.name).undelete_assignment(@props.assignment)

    render_confirm_delete : ->
        <Alert bsStyle='warning' key='confirm_delete'>
            Are you sure you want to delete this assignment (you can undelete it later)?
            <br/> <br/>
            <ButtonToolbar>
                <Button key='yes' onClick={@delete_assignment} bsStyle='danger'>
                    <Icon name="trash" /> Delete
                </Button>
                <Button key='no' onClick={=>@setState(confirm_delete:false)}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Alert>

    render_delete_button : ->
        if @props.assignment.get('deleted')
            <Tip key='delete' placement='left' title="Undelete assignment" tip="Make the assignment visible again in the assignment list and in student grade lists.">
                <Button onClick={@undelete_assignment}>
                    <Icon name="trash-o" /> Undelete
                </Button>
            </Tip>
        else
            <Tip key='delete' placement='left' title="Delete assignment" tip="Deleting this assignment removes it from the assignment list and student grade lists, but does not delete any files off of disk.  You can always undelete an assignment later by showing it using the 'show deleted assignments' button.">
                <Button onClick={=>@setState(confirm_delete:true)} disabled={@state.confirm_delete}>
                    <Icon name="trash" /> Delete
                </Button>
            </Tip>

    set_peer_grade: (config) ->
        @props.redux.getActions(@props.name).set_peer_grade(@props.assignment, config)

    render_configure_peer_checkbox: (config) ->
        <Input checked  = {config.enabled}
               key      = 'peer_grade_checkbox'
               type     = 'checkbox'
               label    = {"Enable Peer Grading"}
               ref      = 'peer_grade_checkbox'
               onChange = {=>@set_peer_grade(enabled:@refs.peer_grade_checkbox.getChecked())}
        />

    peer_due_change : (date) ->
        if not date
            date = @props.assignment.getIn(['peer_grade', 'due_date']) ? misc.server_days_ago(-7)
        @set_peer_grade(due_date : date)

    render_configure_peer_due: (config) ->
        label = <Tip placement='top' title="Set the due date"
                    tip="Set the due date for grading this assignment.  Note that you must explicitly click a button to collect graded assignments when -- they are not automatically collected on the due date.  A file is included in the student peer grading assignment telling them when they should finish their grading.">
                    Due
        </Tip>
        <LabeledRow label_cols=6 label={label}>
            <DateTimePicker
                value     = {config.due_date ? misc.server_days_ago(-7)}
                on_change = {@peer_due_change}
            />
        </LabeledRow>

    render_configure_peer_number: (config) ->
        store = @props.redux.getStore(@props.name)
        <LabeledRow label_cols=6 label='Number of students who will grade each assignment'>
            <NumberInput
                on_change = {(n) => @set_peer_grade(number : n)}
                min       = 1
                max       = {(store?.num_students() ? 2) - 1}
                number    = {config.number ? 1} />
        </LabeledRow>

    render_configure_grading_guidelines: (config) ->
        store = @props.redux.getStore(@props.name)
        <div style={marginTop:'10px'}>
            <LabeledRow label_cols=6 label='Grading guidelines, which will be made available to students in their grading folder in a file GRADING_GUIDE.md.  Tell your students how to grade each problem.  Since this is a markdown file, you might also provide a link to a publicly shared file or directory with guidelines.'>
                <div style={background:'white', padding:'10px', border:'1px solid #ccc', borderRadius:'3px'}>
                    <MarkdownInput
                        rows          = 16
                        placeholder   = 'Enter your grading guidelines for this assignment...'
                        default_value = {config.guidelines}
                        on_save       = {(x) => @set_peer_grade(guidelines : x)}
                    />
                </div>
            </LabeledRow>
        </div>

    render_configure_peer: ->
        config = @props.assignment.get('peer_grade')?.toJS() ? {}
        <Alert bsStyle='warning'>
            <h3><Icon name="users"/> Peer grading</h3>

            <span style={color:'#666'}>
                Use peer grading to randomly (and anonymously) redistribute
                collected homework to your students, so that they can grade
                it for you.
            </span>

            {@render_configure_peer_checkbox(config)}
            {@render_configure_peer_number(config) if config.enabled}
            {@render_configure_peer_due(config) if config.enabled}
            {@render_configure_grading_guidelines(config) if config.enabled}

            <Button onClick={=>@setState(configure_peer:false)}>
                Close
            </Button>

        </Alert>

    render_peer_button : ->
        if @props.assignment.get('peer_grade')?.get('enabled')
            icon = 'check-square-o'
        else
            icon = 'square-o'
        <Button disabled={@state.configure_peer} onClick={=>@setState(configure_peer:true)}>
            <Icon name={icon} /> Peer Grading...
        </Button>

    render_summary_due_date : ->
        due_date = @props.assignment.get('due_date')
        if due_date
            <div style={marginTop:'12px'}>Due <BigTime date={due_date} /></div>

    render_assignment_name : ->
        <span>
            {misc.trunc_middle(@props.assignment.get('path'), 80)}
            {<b> (deleted)</b> if @props.assignment.get('deleted')}
        </span>

    render_assignment_title_link : ->
        <a href='' onClick={(e)=>e.preventDefault();@setState(more:not @state.more)}>
            <Icon style={marginRight:'10px'}
                  name={if @state.more then 'caret-down' else 'caret-right'} />
            {@render_assignment_name()}
        </a>

    render_summary_line : () ->
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

    render : ->
        <Row style={if @state.more then selected_entry_style else entry_style}>
            <Col xs=12>
                {@render_summary_line()}
                {@render_more() if @state.more}
            </Col>
        </Row>

Assignments = rclass
    displayName : "CourseEditorAssignments"

    propTypes :
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        redux       : rtypes.object.isRequired
        assignments : rtypes.object.isRequired
        students    : rtypes.object.isRequired
        user_map    : rtypes.object.isRequired

    getInitialState : ->
        err           : undefined  # error message to display at top.
        search        : ''         # search query to restrict which assignments are shown.
        add_search    : ''         # search query in box for adding new assignment
        add_searching : false      # whether or not it is asking the backend for the result of a search
        add_select    : undefined  # contents to put in the selection box after getting search result back
        add_selected  : ''         # specific path name in selection box that was selected
        show_deleted  : false      # whether or not to show deleted assignments on the bottom

    do_add_search : (e) ->
        # Search for assignments to add to the course
        e?.preventDefault()
        if @state.add_searching # already searching
            return
        search = @state.add_search.trim()
        #if search.length == 0
        #    @setState(err:undefined, add_select:undefined)
        #    return
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
                    @props.assignments.map (val, key) =>
                        path = val.get('path')
                        if path  # path might not be set in case something went wrong (this has been hit in production)
                            omit_prefix.push(path)
                    omit = (path) =>
                        if path.indexOf('-collect') != -1 and search.indexOf('collect') == -1
                            # omit assignment collection folders unless explicitly searched (could cause confusion...)
                            return true
                        for p in omit_prefix
                            if path == p
                                return true
                            if path.slice(0, p.length+1) == p+'/'
                                return true
                        return false
                    resp.directories = (path for path in resp.directories when not omit(path))
                    resp.directories.sort()
                @setState(add_searching:false, add_select:resp.directories)

    clear_and_focus_assignment_add_search_input : ->
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

    add_selected_assignment : ->
        @props.redux.getActions(@props.name).add_assignment(@state.add_selected)
        @setState(err:undefined, add_select:undefined, add_search:'', add_selected:'')

    render_add_selector_options : ->
        for path in @state.add_select
            <option key={path} value={path} label={path}>{path}</option>

    render_add_selector : ->
        if not @state.add_select?
            return
        <div>
            <Input type='select' ref="add_select" size=5 onChange={=>@setState(add_selected:@refs.add_select.getValue())} >
                {@render_add_selector_options()}
            </Input>
            <Button disabled={not @state.add_selected} onClick={@add_selected_assignment}><Icon name="plus" /> Add selected assignment</Button>
        </div>

    render_error : ->
        if @state.err
            <ErrorDisplay error={@state.err} onClose={=>@setState(err:undefined)} />

    render_assignment_tip : ->
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

    render_header : (num_omitted) ->
        <div>
            <Row>
                <Col md=3>
                    <SearchInput
                        placeholder = "Find assignments..."
                        default_value = {@state.search}
                        on_change   = {(value)=>@setState(search:value)}
                    />
                </Col>
                <Col md=4>
                    {<h5>(Omitting {num_omitted} assignments)</h5> if num_omitted}
                </Col>
                <Col md=5>
                    <form onSubmit={@do_add_search}>
                        <Input
                            ref         = 'assignment_add_input'
                            type        = 'text'
                            placeholder = "Add assignment by folder name (enter to see available folders)..."
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

    compute_assignment_list : ->
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

    render_assignments : (assignments) ->
        for x,i in assignments
            <Assignment background={if i%2==0 then "#eee"}  key={x.assignment_id} assignment={@props.assignments.get(x.assignment_id)}
                    project_id={@props.project_id}  redux={@props.redux}
                    students={@props.students} user_map={@props.user_map}
                    name={@props.name}
                    />

    render_show_deleted : (num_deleted) ->
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

    render : ->
        {assignments, num_omitted, num_deleted} = @compute_assignment_list()
        <Panel header={@render_header(num_omitted)}>
            {@render_assignments(assignments)}
            {@render_show_deleted(num_deleted) if num_deleted}
        </Panel>

Settings = rclass
    displayName : "CourseEditorSettings"

    propTypes :
        redux       : rtypes.object.isRequired
        name        : rtypes.string.isRequired
        path        : rtypes.string.isRequired
        settings    : rtypes.object.isRequired  # immutable js
        project_id  : rtypes.string.isRequired
        project_map : rtypes.object.isRequired  # immutable js

    getInitialState : ->
        delete_student_projects_confirm : false
        upgrade_quotas                  : false
        show_students_pay_dialog        : false
        students_pay_when               : @props.settings.get('pay')
        students_pay                    : !!@props.settings.get('pay')
        confirm_stop_all_projects       : false
        confirm_start_all_projects      : false

    ###
    # Editing title/description
    ###
    render_title_desc_header : ->
        <h4>
            <Icon name='header' />   Title and description
        </h4>

    render_title_description : ->
        if not @props.settings?
            return <Loading />
        <Panel header={@render_title_desc_header()}>
            <LabeledRow label="Title">
                <TextInput
                    text={@props.settings.get('title')}
                    on_change={(title)=>@props.redux.getActions(@props.name).set_title(title)}
                />
            </LabeledRow>
            <LabeledRow label="Description">
                <MarkdownInput
                    rows    = 6
                    type    = "textarea"
                    default_value = {@props.settings.get('description')}
                    on_save ={(desc)=>@props.redux.getActions(@props.name).set_description(desc)}
                />
            </LabeledRow>
            <hr/>
            <span style={color:'#666'}>
                <p>Set the course title and description here.
                When you change the title or description, the corresponding
                title and description of each student project will be updated.
                The description is set to this description, and the title
                is set to the student name followed by this title.
                Use the description to provide additional information about
                the course, e.g., a link to the main course website.
                </p>
            </span>
        </Panel>

    ###
    # Grade export
    ###
    render_grades_header : ->
        <h4>
            <Icon name='table' />  Export grades
        </h4>

    path : (ext) ->
        p = @props.path
        i = p.lastIndexOf('.')
        return p.slice(0,i) + '.' + ext

    open_file : (path) ->
        @props.redux.getProjectActions(@props.project_id).open_file(path:path,foreground:true)

    write_file : (path, content) ->
        actions = @props.redux.getActions(@props.name)
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

    save_grades_to_csv : ->
        store = @props.redux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        # CSV definition: http://edoceo.com/utilitas/csv-file-format
        # i.e. double quotes everywhere (not single!) and double quote in double quotes usually blows up
        timestamp  = (salvus_client.server_time()).toISOString()
        content = "# Course '#{@props.settings.get('title')}'\n"
        content += "# exported #{timestamp}\n"
        content += "Name,Email,"
        content += ("\"#{assignment.get('path')}\"" for assignment in assignments).join(',') + '\n'
        for student in store.get_sorted_students()
            grades = ("\"#{store.get_grade(assignment, student) ? ''}\"" for assignment in assignments).join(',')
            name   = "\"#{store.get_student_name(student)}\""
            email  = "\"#{store.get_student_email(student) ? ''}\""
            line   = [name, email, grades].join(',')
            content += line + '\n'
        @write_file(@path('csv'), content)

    save_grades_to_py : ->
        ###
        example:
        course = 'title'
        exported = 'iso date'
        assignments = ['Assignment 1', 'Assignment 2']
        students=[
            {'name':'Foo Bar', 'email': 'foo@bar.com', 'grades':[85,37]},
            {'name':'Bar None', 'email': 'bar@school.edu', 'grades':[15,50]},
        ]
        ###
        timestamp = (salvus_client.server_time()).toISOString()
        store = @props.redux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        content = "course = '#{@props.settings.get('title')}'\n"
        content += "exported = '#{timestamp}'\n"
        content += "assignments = ["
        content += ("'#{assignment.get('path')}'" for assignment in assignments).join(',') + ']\n'

        content += 'students = [\n'
        for student in store.get_sorted_students()
            grades = (("'#{store.get_grade(assignment, student) ? ''}'") for assignment in assignments).join(',')
            name   = store.get_student_name(student)
            email  = store.get_student_email(student)
            email  = if email? then "'#{email}'" else 'None'
            line   = "    {'name':'#{name}', 'email':#{email}, 'grades':[#{grades}]},"
            content += line + '\n'
        content += ']\n'
        @write_file(@path('py'), content)

    render_save_grades : ->
        <Panel header={@render_grades_header()}>
            <div style={marginBottom:'10px'}>Save grades to... </div>
            <ButtonToolbar>
                <Button onClick={@save_grades_to_csv}><Icon name='file-text-o'/> CSV file...</Button>
                <Button onClick={@save_grades_to_py}><Icon name='file-code-o'/> Python file...</Button>
            </ButtonToolbar>
            <hr/>
            <span style={color:"#666"}>
                Export all the grades you have recorded
                for students in your course to a csv or Python file.
            </span>
        </Panel>

    ###
    # Help box
    ###
    render_help : ->
        <Panel header={<h4><Icon name='question-circle' />  Help</h4>}>
            <span style={color:"#666"}>
                <ul>
                    <li>
                        <a href="https://github.com/mikecroucher/SMC_tutorial/blob/master/README.md" target="_blank">
                            SageMathCloud for lecturers <Icon name='external-link'/></a> (by Mike Croucher)
                    </li>
                    <li>
                        <a href="http://www.beezers.org/blog/bb/2015/09/grading-in-sagemathcloud/" target='_blank'>
                            Grading Courses <Icon name='external-link'/></a> (by Rob Beezer)
                    </li>
                    <li>
                        <a href="http://www.beezers.org/blog/bb/2016/01/pennies-a-day-for-sagemathcloud/" target="_blank">
                            Course Plans and teaching experiences <Icon name='external-link'/></a> (by Rob Beezer)
                    </li>
                    <li>
                        <a href="http://blog.ouseful.info/2015/11/24/course-management-and-collaborative-jupyter-notebooks-via-sagemathcloud/" target='_blank'>
                            Course Management and collaborative Jupyter Notebooks <Icon name='external-link'/></a> (by Tony Hirst)
                    </li>
                    <li>
                        How H. Ulfarsson creates and grades homework:{' '}
                        <a href="https://www.youtube.com/watch?v=dgTi11ZS3fQ" target="_blank">part 1 <Icon name='external-link'/></a>,{' '}
                        <a href="https://www.youtube.com/watch?v=nkSdOVE2W0A" target="_blank">part 2 <Icon name='external-link'/></a>,{' '}
                        <a href="https://www.youtube.com/watch?v=0qrhZQ4rjjg" target="_blank">part 3 <Icon name='external-link'/></a>
                    </li>
                </ul>
            </span>
        </Panel>

    ###
    # Custom invitation email body
    ###

    render_email_invite_body: ->
        template_instr = ' Also, {title} will be replaced by the title of the course and {name} by your name.'
        <Panel header={<h4><Icon name='envelope'/> Customize email invitation</h4>}>
            <div style={border:'1px solid lightgrey', padding: '10px', borderRadius: '5px'}>
                <MarkdownInput
                    rows    = 6
                    type    = "textarea"
                    default_value = {@props.redux.getStore(@props.name).get_email_invite()}
                    on_save ={(body)=>@props.redux.getActions(@props.name).set_email_invite(body)}
                />
            </div>
            <hr/>
            <span style={color:'#666'}>
                If you add a student to this course using their email address, and they do not
                have a SageMathCloud account, then they will receive an email invitation. {template_instr}
            </span>
        </Panel>

    ###
    # Deleting student projects
    ###

    delete_all_student_projects: ->
        @props.redux.getActions(@props.name).delete_all_student_projects()

    render_confirm_delete_student_projects: ->
        <Well style={marginTop:'10px'}>
            All student projects will be deleted.  Are you absolutely sure?
            <ButtonToolbar style={marginTop:'10px'}>
                <Button bsStyle='danger' onClick={=>@setState(delete_student_projects_confirm:false); @delete_all_student_projects()}>YES, DELETE all Student Projects</Button>
                <Button onClick={=>@setState(delete_student_projects_confirm:false)}>Cancel</Button>
            </ButtonToolbar>
        </Well>

    render_start_all_projects: ->
        r = @props.redux.getStore(@props.name).num_running_projects(@props.project_map)
        n = @props.redux.getStore(@props.name).num_students()
        <Panel header={<h4><Icon name='flash'/> Student projects control</h4>}>
            <Row>
                <Col md=9>
                    {r} of {n} student projects currently running.
                </Col>
            </Row>
            <Row style={marginTop:'10px'}>
                <Col md=12>
                    <ButtonToolbar>
                        <Button onClick={=>@setState(confirm_start_all_projects:true)} disabled={n==r or n==0 or @state.confirm_start_all_projects}><Icon name="flash"/> Start all...</Button>
                        <Button onClick={=>@setState(confirm_stop_all_projects:true)} disabled={r==0 or n==0 or @state.confirm_stop_all_projects}><Icon name="hand-stop-o"/> Stop all...</Button>
                    </ButtonToolbar>
                </Col>
            </Row>
            <Row style={marginTop:'10px'}>
                <Col md=12>
                    {@render_confirm_start_all_projects() if @state.confirm_start_all_projects}
                    {@render_confirm_stop_all_projects() if @state.confirm_stop_all_projects}
                </Col>
            </Row>
            <hr/>
            <span style={color:'#666'}>
                <p>Start all projects associated with this course so they are immediately ready for your students to use. For example, you might do this before a computer lab.  You can also stop all projects in order to ensure that they do not waste resources or are properly upgraded when next used by students.
                </p>
            </span>
        </Panel>

    render_confirm_stop_all_projects: ->
        <Alert bsStyle='warning'>
            Are you sure you want to stop all student projects (this might be disruptive)?
            <br/>
            <br/>
            <ButtonToolbar>
                <Button bsStyle='warning' onClick={=>@setState(confirm_stop_all_projects:false);@action_all_student_projects('stop')}>
                    <Icon name='hand-stop-o'/> Stop all
                </Button>
                <Button onClick={=>@setState(confirm_stop_all_projects:false)}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Alert>

    render_confirm_start_all_projects: ->
        <Alert bsStyle='info'>
            Are you sure you want to start all student projects?  This will ensure the projects are already running when the students
            open them.
            <br/>
            <br/>
            <ButtonToolbar>
                <Button bsStyle='primary' onClick={=>@setState(confirm_start_all_projects:false);@action_all_student_projects('start')}>
                    <Icon name='flash'/> Start all
                </Button>
                <Button onClick={=>@setState(confirm_start_all_projects:false)}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Alert>


    render_delete_all_projects: ->
        <Panel header={<h4><Icon name='trash'/> Delete all student projects</h4>}>
            <Button bsStyle='danger' onClick={=>@setState(delete_student_projects_confirm:true)}><Icon name="trash"/> Delete all Student Projects...</Button>
            {@render_confirm_delete_student_projects() if @state.delete_student_projects_confirm}
            <hr/>
            <span style={color:'#666'}>
                <p>If for some reason you would like to delete all the student projects
                created for this course, you may do so by clicking below.
                Be careful!
                </p>
            </span>
        </Panel>

    ###
    # Upgrading quotas for all student projects
    ###

    save_upgrade_quotas: ->
        num_projects = @_num_projects
        upgrades = {}
        for quota, val of @state.upgrades
            val = misc.parse_number_input(val, round_number=false)
            if val*num_projects != @_your_upgrades[quota]
                display_factor = schema.PROJECT_UPGRADES.params[quota].display_factor
                upgrades[quota] = val / display_factor
        @setState(upgrade_quotas: false)
        if misc.len(upgrades) > 0
            @props.redux.getActions(@props.name).upgrade_all_student_projects(upgrades)

    upgrade_quotas_submittable: ->
        if @_upgrade_is_invalid
            return false
        num_projects = @_num_projects
        for quota, val of @state.upgrades
            val = misc.parse_number_input(val, round_number=false)
            if val*num_projects != (@_your_upgrades[quota] ? 0)
                changed = true
        return changed

    action_all_student_projects: (action) ->
        @props.redux.getActions(@props.name).action_all_student_projects(action)

    render_upgrade_heading: (num_projects) ->
        <Row key="heading">
            <Col md=5>
                <b style={fontSize:'11pt'}>Quota</b>
            </Col>
            {# <Col md=2><b style={fontSize:'11pt'}>Current upgrades</b></Col> }
            <Col md=7>
                <b style={fontSize:'11pt'}>Distribute your quotas equally between {num_projects} student {misc.plural(num_projects, 'project')} (amounts may be fractional)</b>
            </Col>
        </Row>

    is_upgrade_input_valid: (val, limit) ->
        parsed_val = misc.parse_number_input(val, round_number=false)
        if not parsed_val? or parsed_val > Math.max(0, limit)  # val=0 is always valid
            return false
        else
            return true

    render_upgrade_row_input: (quota, input_type, current, yours, num_projects, limit) ->
        ref = "upgrade_#{quota}"
        if input_type == 'number'
            val = @state.upgrades[quota] ? (yours / num_projects)
            if not @state.upgrades[quota]?
                if val is 0 and yours isnt 0
                    val = yours / num_projects

            if not @is_upgrade_input_valid(val, limit)
                bs_style = 'error'
                @_upgrade_is_invalid = true
                if misc.parse_number_input(val)?
                    label = <div style=UPGRADE_ERROR_STYLE>Reduce the above: you do not have enough upgrades</div>
                else
                    label = <div style=UPGRADE_ERROR_STYLE>Please enter a number</div>
            else
                label = <span></span>
            <span>
                <Input
                    type       = 'text'
                    ref        = {ref}
                    value      = {val}
                    bsStyle    = {bs_style}
                    onChange   = {=>u=@state.upgrades; u[quota] = @refs[ref].getValue(); @setState(upgrades:u)}
                />
                {label}
            </span>
        else if input_type == 'checkbox'
            val = @state.upgrades[quota] ? (if yours > 0 then 1 else 0)
            is_valid = @is_upgrade_input_valid(val, limit)
            if not is_valid
                @_upgrade_is_invalid = true
                label = <div style=UPGRADE_ERROR_STYLE>Uncheck this: you do not have enough upgrades</div>
            else
                label = if val == 0 then 'Enable' else 'Enabled'
            <form>
                <Input
                    ref      = {ref}
                    type     = 'checkbox'
                    checked  = {val > 0}
                    label    = {label}
                    onChange = {=>u=@state.upgrades; u[quota] = (if @refs[ref].getChecked() then 1 else 0); @setState(upgrades:u)}
                    />
            </form>
        else
            console.warn('Invalid input type in render_upgrade_row_input: ', input_type)
            return

    render_upgrade_row: (quota, available, current, yours, num_projects) ->
        # quota -- name of the quota
        # available -- How much of this quota the user has available to use on the student projects.
        #              This is the total amount the user purchased minus the amount allocated to other
        #              projects that aren't projects in this course.
        # current   -- Sum of total upgrades currently allocated by anybody to the course projects
        # yours     -- How much of this quota this user has allocated to this quota total.
        # num_projects -- How many student projects there are.
        {display, desc, display_factor, display_unit, input_type} = schema.PROJECT_UPGRADES.params[quota]

        yours   *= display_factor
        current *= display_factor

        x = @state.upgrades[quota]
        input = if x == '' then 0 else misc.parse_number_input(x) ? (yours/num_projects) # currently typed in
        if input_type == 'checkbox'
            input = if input > 0 then 1 else 0

        ##console.log(quota, "remaining = (#{available} - #{input}/#{display_factor}*#{num_projects}) * #{display_factor}")

        remaining = misc.round2( (available - input/display_factor*num_projects) * display_factor )
        limit     = (available / num_projects) * display_factor

        cur = misc.round2(current / num_projects)
        if input_type == 'checkbox'
            if cur > 0 and cur < 1
                cur = "#{misc.round2(cur*100)}%"
            else if cur == 0
                cur = 'none'
            else
                cur = 'all'

        <Row key={quota}>
            <Col md=5>
                <Tip title={display} tip={desc}>
                    <strong>{display}</strong>
                </Tip>
                <span style={marginLeft:'1ex'}>({remaining} {misc.plural(remaining, display_unit)} remaining)</span>
            </Col>
            {# <Col md=2  style={marginTop: '8px'}>{cur}</Col> }
            <Col md=5>
                {@render_upgrade_row_input(quota, input_type, current, yours, num_projects, limit)}
            </Col>
            <Col md=2 style={marginTop: '8px'}>
                &times; {num_projects}
            </Col>
        </Row>

    render_upgrade_rows: (purchased_upgrades, applied_upgrades, num_projects, total_upgrades, your_upgrades) ->
        # purchased_upgrades - how much of each quota this user has purchased
        # applied_upgrades   - how much of each quota user has already applied to projects total
        # num_projects       - number of student projects
        # total_upgrades     - the total amount of each quota that has been applied (by anybody) to these student projects
        # your_upgrades      - total amount of each quota that this user has applied to these student projects
        @_upgrade_is_invalid = false  # will get set to true by render_upgrade_row if invalid.
        for quota, total of purchased_upgrades
            yours     = your_upgrades[quota] ? 0
            available = total - (applied_upgrades[quota] ? 0) + yours
            current   = total_upgrades[quota] ? 0
            @render_upgrade_row(quota, available, current, yours, num_projects)

    render_upgrade_quotas: ->
        redux = @props.redux

        # Get available upgrades that instructor has to apply
        account_store = redux.getStore('account')
        if not account_store?
            return <Loading/>

        purchased_upgrades = account_store.get_total_upgrades()
        if misc.is_zero_map(purchased_upgrades)
            # user has no upgrades on their account
            return <NoUpgrades cancel={=>@setState(upgrade_quotas:false)} />

        course_store = redux.getStore(@props.name)
        if not course_store?
            return <Loading/>

        # Get non-deleted student projects
        project_ids = course_store.get_student_project_ids()
        if not project_ids
            return <Loading/>
        num_projects = project_ids.length
        if not num_projects
            return <span>There are no student projects yet.<br/><br/>{@render_upgrade_submit_buttons()}</span>

        # Get remaining upgrades
        projects_store = redux.getStore('projects')
        if not projects_store?
            return <Loading/>
        applied_upgrades = projects_store.get_total_upgrades_you_have_applied()

        # Sum total amount of each quota that we have applied to all student projects
        total_upgrades = {}  # all upgrades by anybody
        your_upgrades  = {}  # just by you
        account_id = account_store.get_account_id()
        for project_id in project_ids
            your_upgrades  = misc.map_sum(your_upgrades, projects_store.get_upgrades_you_applied_to_project(project_id))
            total_upgrades = misc.map_sum(total_upgrades, projects_store.get_total_project_upgrades(project_id))
        # save for when we do the save
        @_your_upgrades = your_upgrades
        @_num_projects = num_projects

        <Alert bsStyle='info'>
            <h3><Icon name='arrow-circle-up' /> Adjust your contributions to the student project quotas</h3>
            <hr/>
            {@render_upgrade_heading(num_projects)}
            <hr/>
            {@render_upgrade_rows(purchased_upgrades, applied_upgrades, num_projects, total_upgrades, your_upgrades)}
            {@render_upgrade_submit_buttons()}
            {@render_admin_upgrade() if redux.getStore('account').get('groups')?.contains('admin')}
        </Alert>

    save_admin_upgrade: (e) ->
        e.preventDefault()
        s = @refs.admin_input.getValue()
        quotas = JSON.parse(s)
        console.log("admin upgrade '#{s}' -->", quotas)
        @props.redux.getActions(@props.name).admin_upgrade_all_student_projects(quotas)
        return false

    render_admin_upgrade: ->
        <div>
            <br/>
            <hr/>
            <h3>Admin Upgrade</h3>
            Enter an Javascript-parseable object and hit enter (see the Javascript console for feedback):
            <form onSubmit={@save_admin_upgrade}>
                <Input
                    ref         = 'admin_input'
                    type        = 'text'
                    placeholder = {JSON.stringify(require('smc-util/schema').DEFAULT_QUOTAS)}
                />
            </form>
        </div>

    render_upgrade_submit_buttons: ->
        <ButtonToolbar>
            <Button
                bsStyle  = 'primary'
                onClick  = {@save_upgrade_quotas}
                disabled = {not @upgrade_quotas_submittable()}
            >
                <Icon name='arrow-circle-up' /> Submit changes
            </Button>
            <Button onClick={=>@setState(upgrade_quotas:false)}>
                Cancel
            </Button>
        </ButtonToolbar>

    adjust_quotas: ->
        @setState(upgrade_quotas:true, upgrades:{})

    render_upgrade_quotas_button: ->
        <Button bsStyle='primary' onClick={@adjust_quotas}>
            <Icon name='arrow-circle-up' /> Adjust quotas...
        </Button>

    render_upgrade_student_projects: ->
        <Panel header={<h4><Icon name='dashboard' />  Upgrade all student projects (you pay)</h4>}>
            {if @state.upgrade_quotas then @render_upgrade_quotas() else @render_upgrade_quotas_button()}
            <hr/>
            <div style={color:"#666"}>
                <p>Add additional quota upgrades to all of the projects in this course, augmenting what is provided for free and what students may have purchased.  Your contributions will be split evenly between student projects.</p>

                <p>If you add new students, currently you must re-open the quota panel and re-allocate quota so that newly added projects get additional upgrades; alternatively, you may open any project directly and edit its quotas in project settings.</p>
            </div>
        </Panel>

    ###
    Students pay
    ###
    get_student_pay_when: ->
        if @state.students_pay_when  # since '' is same as not being set
            return @state.students_pay_when
        else
            return misc.days_ago(-7)

    click_student_pay_button: ->
        @setState
            show_students_pay_dialog : true
            students_pay_when        : @get_student_pay_when()

    render_students_pay_button: ->
        <Button bsStyle='primary' onClick={@click_student_pay_button}>
            <Icon name='arrow-circle-up' /> {if @state.students_pay then "Adjust settings" else "Require students to pay"}...
        </Button>

    render_require_students_pay_desc: (date) ->
        if date > salvus_client.server_time()
            <span>
                Your students will see a warning until <TimeAgo date={date} />.  They will then be required to upgrade for a one-time fee of $9.
            </span>
        else
            <span>
                Your students are required to upgrade their project.
            </span>

    render_require_students_pay_when: ->
        if not @state.students_pay_when
            return <span/>
        <div style={marginBottom:'1em'}>
            <div style={width:'50%', marginLeft:'3em', marginBottom:'1ex'}>
                <Calendar
                    value     = {@state.students_pay_when}
                    on_change = {(date)=>@setState(students_pay_when:date)}
                />
            </div>
            {@render_require_students_pay_desc(@state.students_pay_when) if @state.students_pay_when}
        </div>

    save_student_pay_settings: ->
        @props.redux.getActions(@props.name).set_course_info(@state.students_pay_when)
        @setState
            show_students_pay_dialog : false

    student_pay_submittable: ->
        if not @state.students_pay
            return !!@props.settings.get('pay')
        else
            return misc.cmp_Date(@state.students_pay_when, @props.settings.get('pay')) != 0

    render_students_pay_submit_buttons: ->
        <ButtonToolbar>
            <Button
                bsStyle  = 'primary'
                onClick  = {@save_student_pay_settings}
                disabled = {not @student_pay_submittable()}
            >
                <Icon name='arrow-circle-up' /> Submit changes
            </Button>
            <Button onClick={=>@setState(show_students_pay_dialog:false, students_pay_when : @props.settings.get('pay'), students_pay                    : !!@props.settings.get('pay'))}>
                Cancel
            </Button>
        </ButtonToolbar>

    handle_students_pay_checkbox: ->
        if @refs.student_pay.getChecked()
            @setState
                students_pay      : true
                students_pay_when : @get_student_pay_when()
        else
            @setState
                students_pay      : false
                students_pay_when : ''

    render_students_pay_checkbox_label: ->
        if @state.students_pay
            if salvus_client.server_time() >= @state.students_pay_when
                <span>Require that students upgrade immediately:</span>
            else
                <span>Require that students upgrade by <TimeAgo date={@state.students_pay_when} />: </span>
        else
            <span>Require that students upgrade...</span>

    render_students_pay_checkbox: ->
        <Input checked  = {@state.students_pay}
               key      = 'students_pay'
               type     = 'checkbox'
               label    = {@render_students_pay_checkbox_label()}
               ref      = 'student_pay'
               onChange = {@handle_students_pay_checkbox}
        />

    render_students_pay_dialog: ->
        <Alert bsStyle='info'>
            <h3><Icon name='arrow-circle-up' /> Require students to upgrade</h3>
            <hr/>
            <span>Click the following checkbox to require that all students in the course pay a <b>one-time $9</b> fee to move their projects to members-only computers and enable full internet access, for four months.  Members-only computers are not randomly rebooted constantly and have far fewer users. Student projects that are already on members-only hosts will not be impacted.  <em>You will not be charged.</em></span>

            {@render_students_pay_checkbox()}
            {@render_require_students_pay_when() if @state.students_pay}
            {@render_students_pay_submit_buttons()}
        </Alert>

    render_student_pay_desc: ->
        if @state.students_pay
            <span><span style={fontSize:'18pt'}><Icon name="check"/></span> <Space />{@render_require_students_pay_desc(@state.students_pay_when)}</span>
        else
            <span>Require that all students in the course pay a one-time $9 fee to move their projects to members only hosts and enable full internet access, for four months.  This is optional, but will ensure that your students have a better experience and receive priority support.</span>


    render_require_students_pay: ->
        <Panel header={<h4><Icon name='dashboard' />  Require students to upgrade (students pay)</h4>}>
            {if @state.show_students_pay_dialog then @render_students_pay_dialog() else @render_students_pay_button()}
            <hr/>
            <div style={color:"#666"}>
                {@render_student_pay_desc()}
            </div>
        </Panel>

    ###
    # Top level render
    ###
    render : ->
        <div>
            <Row>
                <Col md=6>
                    {@render_require_students_pay()}
                    {@render_upgrade_student_projects()}
                    {@render_save_grades()}
                    {@render_start_all_projects()}
                    {@render_delete_all_projects()}
                </Col>
                <Col md=6>
                    {@render_help()}
                    {@render_title_description()}
                    {@render_email_invite_body()}
                </Col>
            </Row>
        </div>

# Component that renders the "shared project" tab
SharedProject = rclass
    displayName : "CourseEditor-SharedProject"

    propTypes :
        shared_project_id : rtypes.string
        redux             : rtypes.object.isRequired
        name              : rtypes.string.isRequired

    getInitialState : ->
        confirm_create : false

    panel_header_text: ->
        if @props.shared_project_id
            "Shared project that everybody can fully use"
        else
            "Optionally create a shared project for everybody"

    render : ->
        <Row>
            <Col md=6>
                 <Panel header={<h4><Icon name='users' />  {@panel_header_text()} </h4>}>
                    {@render_content()}
                 </Panel>
            </Col>
        </Row>

    render_content: ->
        if @props.shared_project_id
            @render_has_shared_project()
        else
            @render_no_shared_project()

    render_has_shared_project: ->
        <div>
            <div style={color:'#444'}>
                <p>
                    You created a common shared project, which everybody -- students and all collaborators
                    on this project (your TAs and other instructors) -- have <b>write</b> access to.  Use
                    this project for collaborative in-class labs, course-wide chat rooms, and making
                    miscellaneous materials available for
                    students to experiment with together.
                </p>
                <p>
                    When you created the shared project, everybody who has already created an account
                    is added as a collaborator to the project.  Whenever you re-open this course,
                    any students or collaborators on the project that contains this course will be
                    added to the shared project.
                </p>
            </div>
            <br/>
            <Button onClick={@open_project}>
                <Icon name="edit" /> Open shared project
            </Button>
        </div>

    open_project : ->
        @props.redux.getActions('projects').open_project(project_id:@props.shared_project_id)

    render_no_shared_project: ->
        <div>
            <div style={color:'#444'}>
                <p>
                    <i>Optionally</i> create a single common shared project, which everybody -- students and all collaborators
                    on this project (your TAs and other instructors) -- will have <b>write</b> access to.  This can be useful
                    for collaborative in-class labs, course-wide chat rooms, and making miscellanous materials available for
                    students to experiment with together.
                </p>
                <p>
                    When you create the shared project, everybody who has already created an account
                    is added as a collaborator to the project.  Whenever you re-open this course,
                    any students or collaborators on the project that contains this course will be
                    added to the shared project.
                </p>
                <p>
                    After you create the shared project, you should move the shared project to a members only server
                    or upgrade it in other ways if you want it to be more stable.
                </p>

            </div>
            <br/>
            <Button onClick={=>@setState(confirm_create:true)} disabled={@state.confirm_create}>
                <Icon name="plus"/> Create shared project...
            </Button>
            {@render_confirm_create()}
        </div>

    render_confirm_create: ->
        if @state.confirm_create
            <Alert bsStyle='warning' style={marginTop:'15px'}>
                <ButtonToolbar>
                    <Button bsStyle='warning' onClick={=>@setState(confirm_create:false);@create_shared_project()}>
                        Create shared project for everybody involved in this class
                    </Button>
                    <Button onClick={=>@setState(confirm_create:false)}>
                        Cancel
                    </Button>
                </ButtonToolbar>
            </Alert>

    create_shared_project: ->
        @props.redux.getActions(@props.name).create_shared_project()

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
        if @props.activity?
            <ActivityDisplay activity={misc.values(@props.activity)} trunc=80
                on_clear={=>@props.redux.getActions(@props.name).clear_activity()} />

    render_error : ->
        if @props.error
            <ErrorDisplay error={@props.error}
                          onClose={=>@props.redux.getActions(@props.name).set_error('')} />

    render_students : ->
        if @props.redux? and @props.students? and @props.user_map? and @props.project_map?
            <Students redux={@props.redux} students={@props.students}
                      name={@props.name} project_id={@props.project_id}
                      user_map={@props.user_map} project_map={@props.project_map}
                      assignments={@props.assignments}
                      />
        else
            return <Loading />

    render_assignments : ->
        if @props.redux? and @props.assignments? and @props.user_map? and @props.students?
            <Assignments redux={@props.redux} assignments={@props.assignments}
                name={@props.name} project_id={@props.project_id} user_map={@props.user_map} students={@props.students} />
        else
            return <Loading />

    render_settings : ->
        if @props.redux? and @props.settings?
            <Settings redux={@props.redux} settings={@props.settings}
                      name={@props.name} project_id={@props.project_id}
                      path={@props.path}
                      project_map={@props.project_map} />
        else
            return <Loading />

    render_shared_project: ->
        if @props.redux? and @props.settings?
            <SharedProject redux={@props.redux} name={@props.name}
                shared_project_id={@props.settings?.get('shared_project_id')}/>
        else
            return <Loading />

    render_student_header : ->
        n = @props.redux.getStore(@props.name)?.num_students()
        <Tip delayShow=1300
             title="Students" tip="This tab lists all students in your course, along with their grades on each assignment.  You can also quickly find students by name on the left and add new students on the right.">
            <span>
                <Icon name="users"/> Students {if n? then " (#{n})" else ""}
            </span>
        </Tip>

    render_assignment_header : ->
        n = @props.redux.getStore(@props.name)?.num_assignments()
        <Tip delayShow=1300
             title="Assignments" tip="This tab lists all of the assignments associated to your course, along with student grades and status about each assignment.  You can also quickly find assignments by name on the left.   An assignment is a directory in your project, which may contain any files.  Add an assignment to your course by searching for the directory name in the search box on the right.">
            <span>
                <Icon name="share-square-o"/> Assignments {if n? then " (#{n})" else ""}
            </span>
        </Tip>

    render_settings_header : ->
        <Tip delayShow=1300 title="Settings"
             tip="Configure various things about your course here, including the title and description.  You can also export all grades in various formats from this page.">
            <span>
                <Icon name="wrench"/> Settings
            </span>
        </Tip>

    render_shared_project_header : ->
        if @props.settings?.get('shared_project_id')
            tip = "Shared project that everybody involved in this course may use."
        else
            tip = "Create a shared project that everybody in this course may use."
        <Tip delayShow=1300 title="Shared Project"
             tip={tip}>
            <span>
                <Icon name="users"/> Shared Project
            </span>
        </Tip>

    render_save_button : ->
        if @props.show_save_button
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

    render : ->
        <div>
            {@render_save_button()}
            {@render_error()}
            {@render_activity()}
            {@render_files_button()}
            {@render_title()}
            {@render_save_timetravel()}
            <Tabs animation={false} activeKey={@props.tab} onSelect={(key)=>@props.redux?.getActions(@props.name).set_tab(key)}>
                <Tab eventKey={'students'} title={@render_student_header()}>
                    <div style={marginTop:'8px'}></div>
                    {@render_students()}
                </Tab>
                <Tab eventKey={'assignments'} title={@render_assignment_header()}>
                    <div style={marginTop:'8px'}></div>
                    {@render_assignments()}
                </Tab>
                <Tab eventKey={'settings'} title={@render_settings_header()}>
                    <div style={marginTop:'8px'}></div>
                    {@render_settings()}
                </Tab>
                <Tab eventKey={'shared_project'} title={@render_shared_project_header()}>
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
