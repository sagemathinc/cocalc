##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
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

# 3rd party libs
async       = require('async')
markdownlib = require('../markdown')
immutable   = require('immutable')

# CoCalc libraries
{defaults, required} = misc = require('smc-util/misc')
schema               = require('smc-util/schema')
{webapp_client}      = require('../webapp_client')
chat_register        = require('../chat/register')
{NO_DIR}             = require('../project_store')

# Course Library
{STEPS, previous_step, step_direction, step_verb, step_ready, NO_ACCOUNT} = require('./util')

# React libraries
{Actions, Store}  = require('../app-framework')

PARALLEL_LIMIT = 5  # number of async things to do in parallel

primary_key =
    students    : 'student_id'
    assignments : 'assignment_id'
    handouts    : 'handout_id'

# Requires a syncdb to be set later
# Manages local and sync changes
exports.CourseActions = class CourseActions extends Actions
    constructor: (name, redux) ->
        super(name, redux)
        if not @name?
            throw Error("@name must be defined")
        if not @redux?
            throw Error("@redux must be defined")
        @get_store = () => @redux.getStore(@name)
        # window.course = @

    _loaded: =>
        if not @syncdb?
            @set_error("attempt to set syncdb before loading")
            return false
        return true

    _store_is_initialized: =>
        store = @get_store()
        return if not store?
        if not (store.get('students')? and store.get('assignments')? and store.get('settings')? and store.get('handouts'))
            @set_error("store must be initialized")
            return false
        return true

    # Set one object in the syncdb
    _set: (obj) =>
        if not @_loaded() or @syncdb?.is_closed()
            return
        @syncdb.set(obj)

    # Get one object from @syncdb as a Javascript object (or undefined)
    _get_one: (obj) =>
        if @syncdb?.is_closed()
            return
        return @syncdb.get_one(obj)?.toJS()

    set_tab: (tab) =>
        @setState(tab:tab)

    save: =>
        store = @get_store()
        return if not store?  # e.g., if the course store object already gone due to closing course.
        if store.get('saving')
            return # already saving
        id = @set_activity(desc:"Saving...")
        @setState(saving:true)
        @syncdb.save (err) =>
            @clear_activity(id)
            @setState(saving:false)
            @setState(unsaved:@syncdb?.has_unsaved_changes())
            if err
                @set_error("Error saving -- #{err}")
                @setState(show_save_button:true)
            else
                @setState(show_save_button:false)

    _syncdb_change: (changes) =>
        # console.log('_syncdb_change', JSON.stringify(changes.toJS()))
        store = @get_store()
        return if not store?
        cur = t = store.getState()
        changes.map (obj) =>
            table = obj.get('table')
            if not table?
                # no idea what to do with something that doesn't have table defined
                return
            x = @syncdb.get_one(obj)
            key = primary_key[table]
            if not x?
                # delete
                if key?
                    t = t.set(table, t.get(table).delete(obj.get(key)))
            else
                # edit or insert
                if key?
                    t = t.set(table, t.get(table).set(x.get(key), x))
                else if table == 'settings'
                    t = t.set(table, t.get(table).merge(x.delete('table')))
                else
                    # no idea what to do with this
                    console.warn("unknown table '#{table}'")
            return  # ensure map doesn't terminate

        if not cur.equals(t)  # something definitely changed
            @setState(t)
            @setState(unsaved:@syncdb?.has_unsaved_changes())
            @grading_update(store, store.get('grading'))

    _syncdb_cursor_activity: =>
        next_cursors = @syncdb.get_cursors()
        # assignment_id → student_id → account_id
        grading_cursors = {}
        next_cursors.forEach (info, account_id) ->
            info.get('locs').forEach (loc) ->
                switch loc.get('type')
                    when 'grading'
                        student_id      = loc.get('student_id')
                        assignment_id   = loc.get('assignment_id')
                        time            = new Date(info.get('time'))
                        grading_cursors[assignment_id] ?= {}
                        grading_cursors[assignment_id][student_id] ?= {}
                        grading_cursors[assignment_id][student_id][account_id] = time
            return

        grading_cursors = immutable.fromJS(grading_cursors)
        @grading_set_entry('cursors', grading_cursors)

    dispatch_payload: (payload) =>
        store = @get_store()
        return if not store?
        if payload?.course_discussion?
            [apath, account_id] = payload.course_discussion

            async.series([
                (cb) =>
                    store.wait
                        until   : (store) => store.get_assignments()
                        timeout : 60
                        cb      : cb
                (cb) =>
                    store.wait
                        until   : (store) => store.get_students()
                        timeout : 60
                        cb      : cb
                (cb) =>
                        assignment = store.get_assignment_by_path(apath)
                        student_id = store.get_student_by_account_id(account_id)

                        @grading(
                            assignment      : assignment
                            student_id      : student_id
                            direction       : 0
                            discussion_show : true
                        )
                        @set_tab('assignments')
            ])
            return

    handle_projects_store_update: (state) =>
        store = @get_store()
        return if not store?
        users = state.getIn(['project_map', store.get('course_project_id'), 'users'])?.keySeq()
        if not users?
            return
        if not @_last_collaborator_state?
            @_last_collaborator_state = users
            return
        if not @_last_collaborator_state.equals(users)
            @configure_all_projects()
        @_last_collaborator_state = users

    _init_who_pay: =>
        # pre-set either student_pay or institute_pay based on what the user has already done...?
        # This is only here for transition, and can be deleted in say May 2018.
        store = @get_store()
        return if not store?
        settings = store.get('settings')
        if settings.get('institute_pay') or settings.get('student_pay')
            # already done
            return
        @set_pay_choice('institute', false)
        @set_pay_choice('student', false)
        if settings.get('pay')
            # evidence of student pay choice
            @set_pay_choice('student', true)
            return
        # is any student project upgraded
        projects_store = @redux.getStore('projects')
        institute_pay = true
        num = 0
        store.get('students').forEach (student, sid) =>
            if student.get('deleted')
                return
            p = student.get('project_id')
            if not p? or not projects_store.get_total_project_quotas(p)?.member_host
                institute_pay = false
                return false
            num += 1
            return
        if institute_pay and num > 0
            @set_pay_choice('institute', true)

    # PUBLIC API
    set_error: (error) =>
        if error == ''
            @setState(error:error)
        else
            @setState(error:((@get_store()?.get('error') ? '') + '\n' + error).trim())

    set_activity: (opts) =>
        opts = defaults opts,
            id   : undefined
            desc : undefined
        if not opts.id? and not opts.desc?
            return
        if not opts.id?
            @_activity_id = (@_activity_id ? 0) + 1
            opts.id = @_activity_id
        store = @get_store()
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

    # Configuration
    set_title: (title) =>
        @_set(title:title, table:'settings')
        @set_all_student_project_titles(title)
        @set_shared_project_title()

    set_description: (description) =>
        @_set(description:description, table:'settings')
        @set_all_student_project_descriptions(description)
        @set_shared_project_description()

    set_pay_choice: (type, value) =>
        @_set("#{type}_pay":value, table:'settings')

    set_upgrade_goal: (upgrade_goal) =>
        @_set(upgrade_goal:upgrade_goal, table:'settings')

    set_allow_collabs: (allow_collabs) =>
        @_set(allow_collabs:allow_collabs, table:'settings')
        @configure_all_projects()

    set_email_invite: (body) =>
        @_set(email_invite:body, table:'settings')

    # return the default title and description of the shared project.
    shared_project_settings: (title) =>
        store = @get_store()
        return if not store?
        x =
            title       : "Shared Project -- #{title ? store.getIn(['settings', 'title'])}"
            description : store.getIn(['settings', 'description']) + "\n---\n This project is shared with all students."
        return x

    set_shared_project_title: =>
        store = @get_store()
        shared_id = store?.get_shared_project_id()
        return if not store? or not shared_id

        title = @shared_project_settings().title
        @redux.getActions('projects').set_project_title(shared_id, title)

    set_shared_project_description: =>
        store = @get_store()
        shared_id = store?.get_shared_project_id()
        return if not store? or not shared_id

        description = @shared_project_settings().description
        @redux.getActions('projects').set_project_description(shared_id, description)

    # start the shared project running (if it is defined)
    action_shared_project: (action) =>
        if action not in ['start', 'stop', 'restart']
            throw Error("action must be start, stop or restart")
        store = @get_store()
        return if not store?
        shared_project_id = store.get_shared_project_id()
        if not shared_project_id
            return  # no shared project
        @redux.getActions('projects')[action+"_project"]?(shared_project_id)

    # configure the shared project so that it has everybody as collaborators
    configure_shared_project: =>
        store = @get_store()
        return if not store?
        shared_project_id = store.get_shared_project_id()
        if not shared_project_id
            return  # no shared project
        @set_shared_project_title()
        # add collabs -- all collaborators on course project and all students
        projects = @redux.getStore('projects')
        shared_project_users = projects.get_users(shared_project_id)
        if not shared_project_users?
            return
        course_project_users = projects.get_users(store.get('course_project_id'))
        if not course_project_users?
            return
        student_account_ids = {}
        store.get_students().map (student, _) =>
            if not student.get('deleted')
                account_id = student.get('account_id')
                if account_id?
                    student_account_ids[account_id] = true

        # Each of shared_project_users or course_project_users are
        # immutable.js maps from account_id's to something, and students is a map from
        # the student account_id's.
        # Our goal is to ensur that:
        #   {shared_project_users} = {course_project_users} union {students}.

        actions = @redux.getActions('projects')
        if not store.get_allow_collabs()
            # Ensure the shared project users are all either course or students
            shared_project_users.map (_, account_id) =>
                if not course_project_users.get(account_id) and not student_account_ids[account_id]
                    actions.remove_collaborator(shared_project_id, account_id)
        # Ensure every course project user is on the shared project
        course_project_users.map (_, account_id) =>
            if not shared_project_users.get(account_id)
                actions.invite_collaborator(shared_project_id, account_id)
        # Ensure every student is on the shared project
        for account_id, _ of student_account_ids
            if not shared_project_users.get(account_id)
                actions.invite_collaborator(shared_project_id, account_id)

    # set the shared project id in our syncdb
    _set_shared_project_id: (project_id) =>
        @_set
            table             : 'settings'
            shared_project_id : project_id

    # create the globally shared project if it doesn't exist
    create_shared_project: () =>
        store = @get_store()
        return if not store?
        if store.get_shared_project_id()
            return
        id = @set_activity(desc:"Creating global shared project for everybody.")
        x  = @shared_project_settings()
        x.token = misc.uuid()
        @redux.getActions('projects').create_project(x)
        @redux.getStore('projects').wait_until_project_created x.token, 30, (err, project_id) =>
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
        @_set
            pay   : pay
            table : 'settings'
        @set_all_student_project_course_info(pay)

    # Takes an item_name and the id of the time
    # item_name should be one of
    # ['student', 'assignment', 'peer_config', handout', 'skip_grading']
    toggle_item_expansion: (item_name, item_id) =>
        store = @get_store()
        return if not store?
        field_name = "expanded_#{item_name}s"
        expanded_items = store.get(field_name)
        if expanded_items.has(item_id)
            adjusted = expanded_items.delete(item_id)
        else
            adjusted = expanded_items.add(item_id)
        @setState("#{field_name}" : adjusted)

    # Students
    add_students: (students) =>
        # students = array of account_id or email_address
        # New student_id's will be constructed randomly for each student
        student_ids = []
        for x in students
            student_id = misc.uuid()
            student_ids.push(student_id)
            x.table = 'students'
            x.student_id = student_id
            @syncdb.set(x)
        f = (student_id, cb) =>
            async.series([
                (cb) =>
                    store = @get_store()
                    if not store?
                        cb("store not defined"); return
                    store.wait
                        until   : (store) => store.get_student(student_id)
                        timeout : 60
                        cb      : cb
                (cb) =>
                    @create_student_project(student_id)
                    store = @get_store()
                    if not store?
                        cb("store not defined"); return
                    store.wait
                        until   : (store) => store.get_student(student_id).get('project_id')
                        timeout : 60
                        cb      : cb
            ], cb)
        id = @set_activity(desc:"Creating #{students.length} student projects (do not close the course until done)")
        async.mapLimit student_ids, PARALLEL_LIMIT, f, (err) =>
            @set_activity(id:id)
            if err
                @set_error("error creating student projects -- #{err}")
            # after adding students, always run configure all projects,
            # to ensure everything is set properly
            @configure_all_projects()

    delete_student: (student) =>
        store = @get_store()
        return if not store?
        student = store.get_student(student)
        @redux.getActions('projects').clear_project_upgrades(student.get('project_id'))
        @_set
            deleted    : true
            student_id : student.get('student_id')
            table      : 'students'
        @configure_all_projects()   # since they may get removed from shared project, etc.

    undelete_student: (student) =>
        store = @get_store()
        return if not store?
        student = store.get_student(student)
        @_set
            deleted    : false
            student_id : student.get('student_id')
            table      : 'students'
        @configure_all_projects()   # since they may get added back to shared project, etc.

    # Some students might *only* have been added using their email address, but they
    # subsequently signed up for an CoCalc account.  We check for any of these and if
    # we find any, we add in the account_id information about that student.
    lookup_nonregistered_students: =>
        store = @get_store()
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
            webapp_client.user_search
                query : s.join(',')
                limit : s.length
                cb    : (err, result) =>
                    if err
                        console.warn("lookup_nonregistered_students: search error -- #{err}")
                    else
                        for x in result
                            @_set
                                account_id : x.account_id
                                table      : 'students'
                                student_id : v[x.email_address]

    # columns: first_name ,last_name, email, last_active, hosting
    # Toggles ascending/decending order
    set_active_student_sort: (column_name) =>
        store = @get_store()
        if not store?
            return
        current_column = store.getIn(['active_student_sort', 'column_name'])
        if current_column == column_name
            is_descending = not store.getIn(['active_student_sort', 'is_descending'])
        else
            is_descending = false
        @setState(active_student_sort : {column_name, is_descending})

    set_internal_student_info: (student, info) =>
        store = @get_store()
        return if not store?
        student = store.get_student(student)

        info = defaults info,
            first_name    : required
            last_name     : required
            email_address : student.get('email_address')

        @_set
            first_name    : info.first_name
            last_name     : info.last_name
            email_address : info.email_address
            student_id    : student.get('student_id')
            table         : 'students'
        @configure_all_projects()   # since they may get removed from shared project, etc.


    # Student projects

    # Create a single student project.
    create_student_project: (student) =>
        store = @get_store()
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
        store = @get_store()
        return if not store?
        student_id = store.get_student(student).get('student_id')
        @_set
            create_project : webapp_client.server_time()
            table          : 'students'
            student_id     : student_id
        id = @set_activity(desc:"Create project for #{store.get_student_name(student_id)}.")
        token = misc.uuid()
        @redux.getActions('projects').create_project
            title       : store.getIn(['settings', 'title'])
            description : store.getIn(['settings', 'description'])
            token       : token
        @redux.getStore('projects').wait_until_project_created token, 30, (err, project_id) =>
            @clear_activity(id)
            if err
                @set_error("error creating student project for #{store.get_student_name(student_id)} -- #{err}")
            else
                @_set
                    create_project : null
                    project_id     : project_id
                    table          : 'students'
                    student_id     : student_id
                @configure_project(student_id, undefined, project_id)
            delete @_creating_student_project
            queue.shift()
            if queue.length > 0
                # do next one
                @_process_create_student_project_queue()

    configure_project_users: (student_project_id, student_id, do_not_invite_student_by_email) =>
        #console.log("configure_project_users", student_project_id, student_id)
        # Add student and all collaborators on this project to the project with given project_id.
        # users = who is currently a user of the student's project?
        users = @redux.getStore('projects').get_users(student_project_id)  # immutable.js map
        if not users?
            # can't do anything if this isn't known...
            return
        # Define function to invite or add collaborator
        s = @get_store()
        if not s?
            return
        {SITE_NAME} = require('smc-util/theme')
        SiteName = @redux.getStore('customize').site_name ? SITE_NAME
        body = s.get_email_invite()
        invite = (x) =>
            account_store = @redux.getStore('account')
            name    = account_store.get_fullname()
            replyto = account_store.get_email_address()
            if '@' in x
                if not do_not_invite_student_by_email
                    title   = s.getIn(['settings', 'title'])
                    subject = "#{SiteName} Invitation to Course #{title}"
                    body    = body.replace(/{title}/g, title).replace(/{name}/g, name)
                    body    = markdownlib.markdown_to_html(body)
                    @redux.getActions('projects').invite_collaborators_by_email(student_project_id, x, body, subject, true, replyto, name)
            else
                @redux.getActions('projects').invite_collaborator(student_project_id, x)
        # Make sure the student is on the student's project:
        student = s.get_student(student_id)
        student_account_id = student.get('account_id')
        if not student_account_id?  # no known account yet
            invite(student.get('email_address'))
        else if not users?.get(student_account_id)?   # users might not be set yet if project *just* created
            invite(student_account_id)
        # Make sure all collaborators on course project are on the student's project:
        target_users = @redux.getStore('projects').get_users(s.get('course_project_id'))
        if not target_users?
            return  # projects store isn't sufficiently initialized, so we can't do this yet...
        target_users.map (_, account_id) =>
            if not users.get(account_id)?
                invite(account_id)
        if not s.get_allow_collabs()
            # Remove anybody extra on the student project
            users.map (_, account_id) =>
                if not target_users.get(account_id)? and account_id != student_account_id
                    @redux.getActions('projects').remove_collaborator(student_project_id, account_id)

    configure_project_visibility: (student_project_id) =>
        users_of_student_project = @redux.getStore('projects').get_users(student_project_id)
        if not users_of_student_project?  # e.g., not defined in admin view mode
            return
        # Make project not visible to any collaborator on the course project.
        users = @redux.getStore('projects').get_users(@get_store().get('course_project_id'))
        if not users? # TODO: should really wait until users is defined, which is a supported thing to do on stores!
            return
        users.map (_, account_id) =>
            x = users_of_student_project.get(account_id)
            if x? and not x.get('hide')
                @redux.getActions('projects').set_project_hide(account_id, student_project_id, true)

    configure_project_title: (student_project_id, student_id) =>
        store = @get_store()
        if not store?
            return
        title = "#{store.get_student_name(student_id)} - #{store.getIn(['settings', 'title'])}"
        @redux.getActions('projects').set_project_title(student_project_id, title)

    # start projects of all (non-deleted) students running
    action_all_student_projects: (action) =>
        if action not in ['start', 'stop', 'restart']
            throw Error("action must be start, stop or restart")
        @action_shared_project(action)

        # Returns undefined if no store.
        act_on_student_projects = () =>
            return @get_store()?.get_students()
                .filter (student) =>
                    not student.get('deleted') and student.get('project_id')?
                .map (student) =>
                    @redux.getActions('projects')[action+"_project"](student.get('project_id'))
        if not act_on_student_projects()
            return

        if @prev_interval_id?
            window.clearInterval(@prev_interval_id)
        if @prev_timeout_id?
            window.clearTimeout(@prev_timeout_id)

        clear_state = () =>
            window.clearInterval(@prev_interval_id)
            @setState(action_all_projects_state : "any")

        @prev_interval_id = window.setInterval(act_on_student_projects, 30000)
        @prev_timeout_id = window.setTimeout(clear_state, 300000) # 5 minutes

        if action in ['start', 'restart']
            @setState(action_all_projects_state : "starting")
        else if action == 'stop'
            @setState(action_all_projects_state : "stopping")

    set_all_student_project_titles: (title) =>
        actions = @redux.getActions('projects')
        @get_store()?.get_students().map (student, student_id) =>
            student_project_id = student.get('project_id')
            project_title = "#{@get_store().get_student_name(student_id)} - #{title}"
            if student_project_id?
                actions.set_project_title(student_project_id, project_title)

    configure_project_description: (student_project_id, student_id) =>
        @redux.getActions('projects').set_project_description(student_project_id, @get_store()?.getIn(['settings', 'description']))

    set_all_student_project_descriptions: (description) =>
        @get_store()?.get_students().map (student, student_id) =>
            student_project_id = student.get('project_id')
            if student_project_id?
                @redux.getActions('projects').set_project_description(student_project_id, description)

    set_all_student_project_course_info: (pay) =>
        store = @get_store()
        if not store?
            return
        if not pay?
            pay = store.get_pay()
        else
            @_set
                pay   : pay
                table : 'settings'
        store.get_students().map (student, student_id) =>
            student_project_id = student.get('project_id')
            # account_id: might not be known when student first added, or if student
            # hasn't joined smc yet so there is no id.
            student_account_id = student.get('account_id')
            student_email_address = student.get('email_address')  # will be known if account_id isn't known.
            if student_project_id?
                @redux.getActions('projects').set_project_course_info(student_project_id,
                        store.get('course_project_id'), store.get('course_filename'), pay, student_account_id, student_email_address)

    configure_project: (student_id, do_not_invite_student_by_email, student_project_id) =>
        # student_project_id is optional. Will be used instead of from student_id store if provided.
        # Configure project for the given student so that it has the right title,
        # description, and collaborators for belonging to the indicated student.
        # - Add student and collaborators on project containing this course to the new project.
        # - Hide project from owner/collabs of the project containing the course.
        # - Set the title to [Student name] + [course title] and description to course description.
        store = @get_store()
        return if not store?
        student_project_id = student_project_id ? store.getIn(['students', student_id, 'project_id'])
        if not student_project_id?
            @create_student_project(student_id)
        else
            @configure_project_users(student_project_id, student_id, do_not_invite_student_by_email)
            @configure_project_visibility(student_project_id)
            @configure_project_title(student_project_id, student_id)
            @configure_project_description(student_project_id, student_id)

    delete_project: (student_id) =>
        store = @get_store()
        return if not store?
        student_project_id = store.getIn(['students', student_id, 'project_id'])
        if student_project_id?
            student_account_id = store.getIn(['students', student_id, 'account_id'])
            @redux.getActions('projects').remove_collaborator(student_project_id, student_account_id)
            @redux.getActions('projects').delete_project(student_project_id)
            @_set
                create_project : null
                project_id     : null
                table          : 'students'
                student_id     : student_id

    configure_all_projects: =>
        id = @set_activity(desc:"Configuring all projects")
        @setState(configure_projects:'Configuring projects')
        store = @get_store()
        if not store?
            @set_activity(id:id)
            return
        for student_id in store.get_student_ids(deleted:false)
            @configure_project(student_id, false)   # always re-invite students on running this.
        @configure_shared_project()
        @set_activity(id:id)
        @set_all_student_project_course_info()

    # Deletes student projects and removes students from those projects
    delete_all_student_projects: =>
        id = @set_activity(desc:"Deleting all student projects...")
        store = @get_store()
        if not store?
            @set_activity(id:id)
            return
        for student_id in store.get_student_ids(deleted:false)
            @delete_project(student_id)
        @set_activity(id:id)

    # Delete the shared project, removing students too.
    delete_shared_project: =>
        store = @get_store()
        return if not store?
        shared_id = store.get_shared_project_id()
        return if not shared_id
        project_actions = @redux.getActions('projects')
        # delete project
        project_actions.delete_project(shared_id)
        # remove student collabs
        for student_id in store.get_student_ids(deleted:false)
            student_account_id = store.getIn(['students', student_id, 'account_id'])
            if student_account_id
                project_actions.remove_collaborator(shared_id, student_account_id)
        # make the course itself forget about the shared project:
        @_set
            table             : 'settings'
            shared_project_id : ''

    # upgrade_goal is a map from the quota type to the goal quota the instructor wishes
    # to get all the students to.
    upgrade_all_student_projects: (upgrade_goal) =>
        store = @get_store()
        if not store?
            return
        plan = store.get_upgrade_plan(upgrade_goal)
        if misc.len(plan) == 0
            # nothing to do
            return
        id = @set_activity(desc:"Adjusting upgrades on #{misc.len(plan)} student projects...")
        for project_id, upgrades of plan
            if project_id?  # avoid race if projects are being created *right* when we try to upgrade them.
                @redux.getActions('projects').apply_upgrades_to_project(project_id, upgrades, false)
        setTimeout((=>@set_activity(id:id)), 5000)

    # Do an admin upgrade to all student projects.  This changes the base quotas for every student
    # project as indicated by the quotas object.  E.g., to increase the core quota from 1 to 2, do
    #         .admin_upgrade_all_student_projects(cores:2)
    # The quotas are: cores, cpu_shares, disk_quota, memory, mintime, network, member_host
    admin_upgrade_all_student_projects: (quotas) =>
        if not @redux.getStore('account').get('groups')?.contains('admin')
            console.warn("must be an admin to upgrade")
            return
        store = @get_store()
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
            webapp_client.project_set_quotas(x)
        async.mapSeries store.get_student_project_ids(), f, (err) =>
            if err
                console.warn("FAIL -- #{err}")
            else
                console.log("SUCCESS")

    set_student_note: (student, note) =>
        store = @get_store()
        return if not store?
        student = store.get_student(student)
        @_set
            note       : note
            table      : 'students'
            student_id : student.get('student_id')

    _collect_path: (path) =>
        store = @get_store()
        i = store.get('course_filename').lastIndexOf('.')
        store.get('course_filename').slice(0,i) + '-collect/' + path

    # Assignments
    # TODO: Make a batch adder?
    add_assignment: (path) =>
        # Add an assignment to the course, which is defined by giving a directory in the project.
        # Where we collect homework that students have done (in teacher project)
        collect_path = @_collect_path(path)
        path_parts = misc.path_split(path)
        # folder that we return graded homework to (in student project)
        if path_parts.head
            beginning = '/graded-'
        else
            beginning = 'graded-'
        graded_path = path_parts.head + beginning + path_parts.tail
        # folder where we copy the assignment to
        target_path = path

        @_set
            path          : path
            collect_path  : collect_path
            graded_path   : graded_path
            target_path   : target_path
            table         : 'assignments'
            assignment_id : misc.uuid()

    delete_assignment: (assignment) =>
        store = @get_store()
        return if not store?
        assignment = store.get_assignment(assignment)
        @_set
            deleted       : true
            assignment_id : assignment.get('assignment_id')
            table         : 'assignments'

    undelete_assignment: (assignment) =>
        store = @get_store()
        return if not store?
        assignment = store.get_assignment(assignment)
        @_set
            deleted       : false
            assignment_id : assignment.get('assignment_id')
            table         : 'assignments'

    set_grade: (assignment, student, grade) =>
        store = @get_store()
        return if not store?
        assignment = store.get_assignment(assignment)
        student    = store.get_student(student)
        obj        = {table:'assignments', assignment_id:assignment.get('assignment_id')}
        grades     = @_get_one(obj).grades ? {}
        grades[student.get('student_id')] = grade
        obj.grades = grades
        @_set(obj)

    set_comments: (assignment, student, comments) =>
        store = @get_store()
        return if not store?
        assignment    = store.get_assignment(assignment)
        student       = store.get_student(student)
        obj           = {table:'assignments', assignment_id:assignment.get('assignment_id')}
        comments_map = @_get_one(obj).comments ? {}
        comments_map[student.get('student_id')] = comments
        obj.comments = comments_map
        @_set(obj)

    # this associates a path to a collected file of a student assignment with
    # "points" (a non-negative integer). Sum over all entries is the total number of
    # points for an assignment of a student...
    set_points: (assignment, student, filepath, points) =>
        store = @get_store()
        return if not store?
        assignment          = store.get_assignment(assignment)
        student             = store.get_student(student)
        student_id          = student.get('student_id')
        obj                 = {table:'assignments', assignment_id:assignment.get('assignment_id')}
        points_map          = @_get_one(obj).points ? {}
        student_points_map  = points_map[student_id] ? {}
        # only delete if points is undefined/null, otherwise record the value, even "0"
        if not points?
            delete student_points_map[filepath]
        else
            student_points_map[filepath] = points
        points_map[student_id] = student_points_map
        obj.points = points_map
        @_set(obj)

    set_active_assignment_sort: (column_name) =>
        store = @get_store()
        if not store?
            return
        current_column = store.getIn(['active_assignment_sort', 'column_name'])
        if current_column == column_name
            is_descending = not store.getIn(['active_assignment_sort', 'is_descending'])
        else
            is_descending = false
        @setState(active_assignment_sort : {column_name, is_descending})

    _set_assignment_field: (assignment, name, val) =>
        store = @get_store()
        return if not store?
        assignment = store.get_assignment(assignment)
        @_set
            "#{name}"     : val
            table         : 'assignments'
            assignment_id : assignment.get('assignment_id')

    set_due_date: (assignment, due_date) =>
        if not typeof(due_date) == 'string'
            due_date = due_date?.toISOString()  # using strings instead of ms for backward compatibility.
        @_set_assignment_field(assignment, 'due_date', due_date)

    set_assignment_note: (assignment, note) =>
        @_set_assignment_field(assignment, 'note', note)

    set_peer_grade: (assignment, config) =>
        cur = assignment.get('peer_grade')?.toJS() ? {}
        for k, v of config
            cur[k] = v
        @_set_assignment_field(assignment, 'peer_grade', cur)

    set_assignment_config: (assignment, config) =>
        cur = assignment.get('config') ? immutable.Map()
        cur = cur.merge(config)
        @_set_assignment_field(assignment, 'config', cur)

    set_skip: (assignment, step, value) =>
        store = @get_store()
        return if not store?
        assignment = store.get_assignment(assignment)  # just in case is an id
        @_set_assignment_field(assignment.get('assignment_id'), "skip_#{step}", !!value)

    # Synchronous function that makes the peer grading map for the given
    # assignment, if it hasn't already been made.
    update_peer_assignment: (assignment) =>
        store = @get_store()
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
        store = @get_store()
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
                    webapp_client.copy_path_between_projects
                        src_project_id    : student_project_id
                        src_path          : assignment.get('target_path')
                        target_project_id : store.get('course_project_id')
                        target_path       : target_path
                        overwrite_newer   : true
                        backup            : true
                        delete_missing    : false
                        exclude_history   : false
                        cb                : cb
                (cb) =>
                    # write their name to a file
                    name = store.get_student_name(student, true)
                    webapp_client.write_text_file_to_project
                        project_id : store.get('course_project_id')
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
        store = @get_store()
        if not store? or not @_store_is_initialized()
            return finish("store not yet initialized")
        if not student = store.get_student(student)
            return finish("no student")
        if not assignment = store.get_assignment(assignment)
            return finish("no assignment")

        points             = store.get_points(assignment, student)
        comments           = store.get_comments(assignment, student)
        grade              = store.get_grade(assignment, student)
        student_name       = store.get_student_name(student)
        student_project_id = student.get('project_id')

        # if skip_grading is true, this means there *might* no be a "grade" given,
        # but instead some grading inside the files or an external tool is used.
        # therefore, only create the grade file if this is false.
        skip_grading = assignment.get('skip_grading') ? false

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
                    if skip_grading and not peer_graded
                        content = 'Your instructor is doing grading outside CoCalc, or there is no grading for this assignment.'
                    else
                        if grade? or peer_graded
                            content = "Your grade on this assignment:"
                        else
                            content = ''
                    # write their grade to a file
                    if grade?   # likely undefined when skip_grading true & peer_graded true
                        content += "\n\n    #{grade}"
                        if comments?.length > 0
                            content += "\n\nInstructor comments:\n\n    #{comments}"
                    if points?.size > 0
                        listofpoints = ("  #{name}: #{misc.round2(p)}" for name, p of points.toJS()).join('\n')
                        content += """
                                   \n\nPOINTS:\n
                                   During grading, these points were given to your files:

                                   #{listofpoints}
                                   """ + '\n'
                    if peer_graded
                        content += """
                                   \n\n\nPEER GRADED:\n
                                   Your assignment was peer graded by other students.
                                   You can find the comments they made in the folders below.
                                   """
                    webapp_client.write_text_file_to_project
                        project_id : store.get('course_project_id')
                        path       : src_path + '/GRADE.txt'
                        content    : content
                        cb         : cb
                (cb) =>
                    webapp_client.copy_path_between_projects
                        src_project_id    : store.get('course_project_id')
                        src_path          : src_path
                        target_project_id : student_project_id
                        target_path       : assignment.get('graded_path')
                        overwrite_newer   : true
                        backup            : true
                        delete_missing    : false
                        exclude_history   : true
                        cb                : cb
                (cb) =>
                    if peer_graded
                        # Delete GRADER file
                        webapp_client.exec
                            project_id : student_project_id
                            command    : 'rm ./*/GRADER*.txt'
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
        store = @get_store()
        if not store? or not @_store_is_initialized()
            return error("store not yet initialized")
        assignment = store.get_assignment(assignment)
        if not assignment
            return error("no assignment")
        errors = ''
        peer = assignment.get('peer_grade')?.get('enabled')
        skip_grading = assignment.get('skip_grading') ? false
        f = (student_id, cb) =>
            if not store.last_copied(previous_step('return_graded', peer), assignment, student_id, true)
                # we never collected the assignment from this student
                cb(); return
            has_grade = store.has_grade(assignment, student_id)
            if (not skip_grading) and (not has_grade)
                # we collected and do grade, but didn't grade it yet
                cb(); return
            if new_only
                if store.last_copied('return_graded', assignment, student_id, true) and (skip_grading or has_grade)
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
            store = @get_store()
            if not store?
                return
            student = store.get_student(student)
            assignment = store.get_assignment(assignment)
            obj = {table:'assignments', assignment_id:assignment.get('assignment_id')}
            x = @_get_one(obj)?[type] ? {}
            student_id = student.get('student_id')
            x[student_id] = {time: misc.mswalltime()}
            if err
                x[student_id].error = err
            obj[type] = x
            @_set(obj)

    # This is called internally before doing any copy/collection operation
    # to ensure that we aren't doing the same thing repeatedly, and that
    # everything is in place to do the operation.
    _start_copy: (assignment, student, type) =>
        if student? and assignment?
            store = @get_store()
            if not store?
                return
            student = store.get_student(student)
            assignment = store.get_assignment(assignment)
            obj = {table:'assignments', assignment_id:assignment.get('assignment_id')}
            x = @_get_one(obj)?[type] ? {}
            y = (x[student.get('student_id')]) ? {}
            if y.start? and webapp_client.server_time() - y.start <= 15000
                return true  # never retry a copy until at least 15 seconds later.
            y.start = misc.mswalltime()
            x[student.get('student_id')] = y
            obj[type] = x
            @_set(obj)
        return false

    _stop_copy: (assignment, student, type) =>
        if student? and assignment?
            store = @get_store()
            if not store?
                return
            student = store.get_student(student)
            assignment = store.get_assignment(assignment)
            obj   = {table:'assignments', assignment_id:assignment.get('assignment_id')}
            x = @_get_one(obj)?[type]
            if not x?
                return
            y = (x[student.get('student_id')])
            if not y?
                return
            if y.start?
                delete y.start
                x[student.get('student_id')] = y
                obj[type] = x
                @_set(obj)

    # Copy the files for the given assignment to the given student. If
    # the student project doesn't exist yet, it will be created.
    # You may also pass in an id for either the assignment or student.
    # "overwrite" (boolean, optional): if true, the copy operation will overwrite/delete remote files in student projects -- #1483
    # If the store is initialized and the student and assignment both exist,
    # then calling this action will result in this getting set in the store:
    #
    #    assignment.last_assignment[student_id] = {time:?, error:err}
    #
    # where time >= now is the current time in milliseconds.
    copy_assignment_to_student: (assignment, student, opts) =>
        {overwrite, create_due_date_file} = defaults opts,
            overwrite            : false
            create_due_date_file : false

        if @_start_copy(assignment, student, 'last_assignment')
            return
        id = @set_activity(desc:"Copying assignment to a student")
        finish = (err) =>
            @clear_activity(id)
            @_finish_copy(assignment, student, 'last_assignment', err)
            if err
                @set_error("copy to student: #{err}")
        store = @get_store()
        if not store? or not @_store_is_initialized()
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
                    store = @get_store()
                    if not store?
                        cb("no store")
                        return
                    store.wait
                        until : => store.get_student_project_id(student_id)
                        cb    : (err, x) =>
                            student_project_id = x
                            cb(err)
                else
                    cb()
            (cb) =>
                if create_due_date_file
                    @copy_assignment_create_due_date_file(assignment, store, cb)
                else
                    cb()
            (cb) =>
                @set_activity(id:id, desc:"Copying files to #{student_name}'s project")
                webapp_client.copy_path_between_projects
                    src_project_id    : store.get('course_project_id')
                    src_path          : src_path
                    target_project_id : student_project_id
                    target_path       : assignment.get('target_path')
                    overwrite_newer   : !!overwrite        # default is "false"
                    delete_missing    : !!overwrite        # default is "false"
                    backup            : not (!!overwrite)  # default is "true"
                    exclude_history   : true
                    cb                : cb
        ], (err) =>
            finish(err)
        )

    # this is part of the assignment disribution, should be done only *once*, not for every student
    copy_assignment_create_due_date_file: (assignment, store, cb) =>
        # write the due date to a file
        due_date    = store.get_due_date(assignment)
        src_path    = assignment.get('path')
        due_date_fn = 'DUE_DATE.txt'
        if not due_date?
            cb()
            return

        locals =
            due_id       : @set_activity(desc:"Creating #{due_date_fn} file...")
            due_date     : due_date
            src_path     : src_path
            content      : "This assignment is due\n\n   #{due_date.toLocaleString()}"
            project_id   : store.get('course_project_id')
            path         : src_path + '/' + due_date_fn
            due_date_fn  : due_date_fn

        webapp_client.write_text_file_to_project
            project_id : locals.project_id
            path       : locals.path
            content    : locals.content
            cb         : (err) =>
                @clear_activity(locals.due_id)
                if err
                    cb("Problem writing #{due_date_fn} file ('#{err}'). Try again...")
                else
                    cb()


    copy_assignment: (type, assignment_id, student_id) =>
        # type = assigned, collected, graded
        switch type
            when 'assigned'
                # create_due_date_file = true
                @copy_assignment_to_student(assignment_id, student_id, create_due_date_file:true)
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
    copy_assignment_to_all_students: (assignment, new_only, overwrite) =>
        store = @get_store()
        if not store? or not @_store_is_initialized()
            return finish("store not yet initialized")
        desc = "Copying assignments to all students #{if new_only then 'who have not already received it' else ''}"
        short_desc = "copy to student"
        async.series([
            (cb) =>
                @copy_assignment_create_due_date_file(assignment, store, cb)
            (cb) =>
                # by default, doesn't create the due file
                @_action_all_students(assignment, new_only, @copy_assignment_to_student, 'assignment', desc, short_desc, overwrite)
        ])

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

    _action_all_students: (assignment, new_only, action, step, desc, short_desc, overwrite) =>
        id = @set_activity(desc:desc)
        error = (err) =>
            @clear_activity(id)
            err="#{short_desc}: #{err}"
            @set_error(err)
        store = @get_store()
        if not store? or not @_store_is_initialized()
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
            action(assignment, student_id, overwrite:overwrite)
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
    # Assumes folder is non-empty
    peer_copy_to_student: (assignment, student) =>
        if @_start_copy(assignment, student, 'last_peer_assignment')
            return
        id = @set_activity(desc:"Copying peer grading to a student")
        finish = (err) =>
            @clear_activity(id)
            @_finish_copy(assignment, student, 'last_peer_assignment', err)
            if err
                @set_error("copy peer-grading to student: #{err}")
        store = @get_store()
        if not store? or not @_store_is_initialized()
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
            guidelines = "GRADING IS DUE #{new Date(due_date).toLocaleString()} \n\n " + guidelines

        target_base_path = assignment.get('path') + "-peer-grade"
        f = (student_id, cb) =>
            src_path = assignment.get('collect_path') + '/' + student_id
            target_path = target_base_path + "/" + student_id
            async.series([
                (cb) =>
                    # delete the student's name so that grading is anonymous; also, remove original
                    # due date to avoid confusion.
                    name = store.get_student_name(student_id, true)
                    webapp_client.exec
                        project_id : store.get('course_project_id')
                        command    : 'rm'
                        args       : ['-f', src_path + "/STUDENT - #{name.simple}.txt", src_path + "/DUE_DATE.txt", src_path + "/STUDENT - #{name.simple}.txt~", src_path + "/DUE_DATE.txt~"]
                        cb         : cb
                (cb) =>
                    # copy the files to be peer graded into place for this student
                    webapp_client.copy_path_between_projects
                        src_project_id    : store.get('course_project_id')
                        src_path          : src_path
                        target_project_id : student_project_id
                        target_path       : target_path
                        overwrite_newer   : false
                        delete_missing    : false
                        cb                : cb
            ], cb)

        # write instructions file to the student
        webapp_client.write_text_file_to_project
            project_id : student_project_id
            path       : target_base_path + "/GRADING_GUIDE.md"
            content    : guidelines
            cb         : (err) =>
                if not err
                    # now copy actual stuff to grade
                    async.mapLimit(peers, PARALLEL_LIMIT, f, finish)
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
        store = @get_store()
        if not store? or not @_store_is_initialized()
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
                    webapp_client.copy_path_between_projects
                        src_project_id    : s.get('project_id')
                        src_path          : src_path
                        target_project_id : store.get('course_project_id')
                        target_path       : target_path
                        overwrite_newer   : false
                        delete_missing    : false
                        cb                : cb
                (cb) =>
                    # write local file identifying the grader
                    name = store.get_student_name(student_id, true)
                    webapp_client.write_text_file_to_project
                        project_id : store.get('course_project_id')
                        path       : target_path + "/GRADER - #{name.simple}.txt"
                        content    : "The student who did the peer grading is named #{name.full}."
                        cb         : cb
                (cb) =>
                    # write local file identifying student being graded
                    name = store.get_student_name(student, true)
                    webapp_client.write_text_file_to_project
                        project_id : store.get('course_project_id')
                        path       : target_path + "/STUDENT - #{name.simple}.txt"
                        content    : "This student is #{name.full}."
                        cb         : cb
            ], cb)

        async.mapLimit(peers, PARALLEL_LIMIT, f, finish)

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

    open_assignment: (type, assignment_id, student_id, filepath) =>
        # type = assigned, collected, graded
        store = @get_store()
        if not store?
            return
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
                proj = store.get('course_project_id')
            when 'peer-assigned'  # where peer-assigned (in student's project)
                proj = student_project_id
                path = assignment.get('path') + '-peer-grade'
            when 'peer-collected'  # where collected peer-graded work (in our project)
                path = assignment.get('collect_path') + '-peer-grade/' + student.get('student_id')
                proj = store.get('course_project_id')
            when 'graded'  # where project returned
                path = assignment.get('graded_path')  # refactor
                proj = student_project_id
            else
                @set_error("open_assignment -- unknown type: #{type}")
        if not proj?
            @set_error("no such project")
            return
        if filepath?
            {join} = require('path')
            path = join(path, filepath)
            @redux.getProjectActions(proj).open_file(path:path)
        else
            # Now open it
            @redux.getProjectActions(proj).open_directory(path)

    # Handouts
    add_handout: (path) =>
        target_path = path # folder where we copy the handout to
        @_set
            path        : path
            target_path : target_path
            table       : 'handouts'
            handout_id  : misc.uuid()

    delete_handout: (handout) =>
        store = @get_store()
        return if not store?
        handout = store.get_handout(handout)
        @_set
            deleted    : true
            handout_id : handout.get('handout_id')
            table      : 'handouts'

    undelete_handout: (handout) =>
        store = @get_store()
        return if not store?
        handout = store.get_handout(handout)
        @_set
            deleted    : false
            handout_id : handout.get('handout_id')
            table      : 'handouts'

    _set_handout_field: (handout, name, val) =>
        store = @get_store()
        return if not store?
        handout = store.get_handout(handout)
        @_set
            "#{name}"  : val
            table      : 'handouts'
            handout_id : handout.get('handout_id')

    set_handout_note: (handout, note) =>
        @_set_handout_field(handout, 'note', note)

    _handout_finish_copy: (handout, student, err) =>
        if student? and handout?
            store = @get_store()
            if not store?
                return
            student = store.get_student(student)
            handout = store.get_handout(handout)
            obj = {table:'handouts', handout_id:handout.get('handout_id')}
            status_map = @_get_one(obj)?.status ? {}
            student_id = student.get('student_id')
            status_map[student_id] = {time: misc.mswalltime()}
            if err
                status_map[student_id].error = err
            obj.status = status_map
            @_set(obj)

    _handout_start_copy: (handout, student) =>
        if student? and handout?
            store = @get_store()
            if not store?
                return
            student = store.get_student(student)
            handout = store.get_handout(handout)
            obj   = {table:'handouts', handout_id:handout.get('handout_id')}
            status_map = @_get_one(obj)?.status ? {}
            student_status = (status_map[student.get('student_id')]) ? {}
            if student_status.start? and webapp_client.server_time() - student_status.start <= 15000
                return true  # never retry a copy until at least 15 seconds later.
            student_status.start = misc.mswalltime()
            status_map[student.get('student_id')] = student_status
            obj.status = status_map
            @_set(obj)
        return false

    # "Copy" of `stop_copying_assignment:`
    stop_copying_handout: (handout, student) =>
        if student? and handout?
            store = @get_store()
            if not store?
                return
            student = store.get_student(student)
            handout = store.get_handout(handout)
            obj = {table:'handouts', handout_id:handout.get('handout_id')}
            status = @_get_one(obj)?.status
            if not status?
                return
            student_status = (status[student.get('student_id')])
            if not student_status?
                return
            if student_status.start?
                delete student_status.start
                status[student.get('student_id')] = student_status
                obj.status = status
                @_set(obj)

    # Copy the files for the given handout to the given student. If
    # the student project doesn't exist yet, it will be created.
    # You may also pass in an id for either the handout or student.
    # "overwrite" (boolean, optional): if true, the copy operation will overwrite/delete remote files in student projects -- #1483
    # If the store is initialized and the student and handout both exist,
    # then calling this action will result in this getting set in the store:
    #
    #    handout.status[student_id] = {time:?, error:err}
    #
    # where time >= now is the current time in milliseconds.
    copy_handout_to_student: (handout, student, overwrite) =>
        if @_handout_start_copy(handout, student)
            return
        id = @set_activity(desc:"Copying handout to a student")
        finish = (err) =>
            @clear_activity(id)
            @_handout_finish_copy(handout, student, err)
            if err
                @set_error("copy to student: #{err}")
        store = @get_store()
        if not store? or not @_store_is_initialized()
            return finish("store not yet initialized")
        if not student = store.get_student(student)
            return finish("no student")
        if not handout = store.get_handout(handout)
            return finish("no handout")

        student_name = store.get_student_name(student)
        @set_activity(id:id, desc:"Copying handout to #{student_name}")
        student_project_id = student.get('project_id')
        student_id = student.get('student_id')
        src_path = handout.get('path')
        async.series([
            (cb) =>
                if not student_project_id?
                    @set_activity(id:id, desc:"#{student_name}'s project doesn't exist, so creating it.")
                    @create_student_project(student)
                    store = @get_store()
                    if not store?
                        cb("no store")
                        return
                    store.wait
                        until : => store.get_student_project_id(student_id)
                        cb    : (err, x) =>
                            student_project_id = x
                            cb(err)
                else
                    cb()
            (cb) =>
                @set_activity(id:id, desc:"Copying files to #{student_name}'s project")
                webapp_client.copy_path_between_projects
                    src_project_id    : store.get('course_project_id')
                    src_path          : src_path
                    target_project_id : student_project_id
                    target_path       : handout.get('target_path')
                    overwrite_newer   : !!overwrite        # default is "false"
                    delete_missing    : !!overwrite        # default is "false"
                    backup            : not (!!overwrite)  # default is "true"
                    exclude_history   : true
                    cb                : cb
        ], (err) =>
            finish(err)
        )

    # Copy the given handout to all non-deleted students, doing several copies in parallel at once.
    copy_handout_to_all_students: (handout, new_only, overwrite) =>
        desc = "Copying handouts to all students #{if new_only then 'who have not already received it' else ''}"
        short_desc = "copy to student"

        id = @set_activity(desc:desc)
        error = (err) =>
            @clear_activity(id)
            err="#{short_desc}: #{err}"
            @set_error(err)
        store = @get_store()
        if not store? or not @_store_is_initialized()
            return error("store not yet initialized")
        if not handout = store.get_handout(handout)
            return error("no handout")
        errors = ''
        f = (student_id, cb) =>
            if new_only and store.handout_last_copied(handout, student_id, true)
                cb(); return
            n = misc.mswalltime()
            @copy_handout_to_student(handout, student_id, overwrite)
            store.wait
                timeout : 60*15
                until   : => store.handout_last_copied(handout, student_id) >= n
                cb      : (err) =>
                    if err
                        errors += "\n #{err}"
                    cb()

        async.mapLimit store.get_student_ids(deleted:false), PARALLEL_LIMIT, f, (err) =>
            if errors
                error(errors)
            else
                @clear_activity(id)

    open_handout: (handout_id, student_id) =>
        store = @get_store()
        if not store?
            return
        handout = store.get_handout(handout_id)
        student = store.get_student(student_id)
        student_project_id = student.get('project_id')
        if not student_project_id?
            @set_error("open_handout: student project not yet created")
            return
        path = handout.get('target_path')
        proj = student_project_id
        if not proj?
            @set_error("no such project")
            return
        # Now open it
        @redux.getProjectActions(proj).open_directory(path)

    #
    # Methods below are for the grading sub-functionality
    # They're prefixed with "grading_"
    #

    grading: (opts) =>
        # this method starts grading and also steps forward to the next student
        # hence, initially the "direction" to jump is +1
        # there is also a second phase, where the directory listing is loaded.
        opts = defaults opts,
            assignment       : required
            student_id       : undefined
            direction        : 1
            without_grade    : undefined   # not yet graded?
            collected_files  : undefined   # already collected files?
            subdir           : ''
            discussion_show  : undefined
        # direction: 0, +1 or -1, which student in the list to pick next
        #            first call after deleting grading should be +1, otherwise student_id stays undefined
        store = @get_store()
        return if not store?

        # initialization: start with a new grading object or the current one
        {Grading}        = require('./grading/models')
        grading          = store.get('grading') ? new Grading()

        # merge passed in opts data with already existing information
        old_student_id   = grading.student_id
        only_not_graded  = opts.without_grade   ? grading.only_not_graded
        only_collected   = opts.collected_files ? grading.only_collected
        discussion_show  = opts.discussion_show ? grading.discussion_show
        student_filter   = grading.student_filter
        assignment_id    = opts.assignment.get('assignment_id')

        # pick first/next student to grade
        if opts.direction in [-1, 1]
            next_student_id = store.grading_next_student(
                assignment            : opts.assignment
                current_student_id    : opts.student_id
                direction             : opts.direction
                without_grade         : only_not_graded
                collected_files       : only_collected
                cursors               : grading.cursors
            )
            # But: what if we search for students without a grade yet, but all are graded?
            # Relax this criteria and try again …
            if (not next_student_id?) and only_not_graded
                only_not_graded = false # relax search filter
                next_student_id = store.grading_next_student(
                    assignment            : opts.assignment
                    current_student_id    : opts.student_id
                    direction             : opts.direction
                    without_grade         : only_not_graded
                    collected_files       : only_collected
                    cursors               : grading.cursors
                )
        else
            # i.e. stick with same student ... e.g. only the (sub-) directory changes
            next_student_id = opts.student_id

        # merge all previous information and switch to grading mode, but no listing yet
        grading = grading.merge(
            student_id      : next_student_id
            assignment_id   : assignment_id
            listing         : null
            end_of_list     : not (next_student_id?)
            subdir          : opts.subdir
            student_filter  : student_filter
            only_not_graded : only_not_graded
            only_collected  : only_collected
            page_number     : 0
            listing         : null
            listing_files   : null
            discussion_show : discussion_show
            discussion_path : null
        )
        @grading_update(store, grading)
        # sets a "cursor" pointing to this assignment and student, signal for other teachers
        @grading_update_activity()

        # close discussion when student changes
        if old_student_id != next_student_id
            old_account_id = store.get_student_account_id(old_student_id)
            @grading_cleanup_discussion(opts.assignment.get('path'), old_account_id)

        # activate associated discussion
        next_account_id = store.get_student_account_id(next_student_id)
        @grading_activate_discussion(opts.assignment.get('path'), next_account_id)

        # Phase 2: get the collected files listing
        store.grading_get_listing opts.assignment, next_student_id, opts.subdir, (err, listing) =>
            if err
                if err == NO_DIR
                    listing = {error: err}
                else
                    @set_error("Grading file listing error: #{err}")
                    return
            listing = immutable.fromJS(listing)
            @grading_set_entry('listing', listing)

    # update routine to set derived data field in the grading object in a consistent way
    grading_update: (store, grading) =>
        return if not grading?
        x = store.grading_get_student_list(grading)
        return if not x?
        grading = grading.merge(x)
        total_points = store.get_points_total(grading.assignment_id, grading.student_id)

        if (total_points ? 0) == 0
            grading = grading.remove('total_points')
        else
            grading = grading.set('total_points', total_points)

        if grading.student_id?
            student_info = store.student_assignment_info(grading.student_id, grading.assignment_id)
        else
            student_info = undefined

        grading_mode = store.get_grading_mode(grading.assignment_id)
        grading = grading.merge(
            current_idx    : grading.get_current_idx()
            list_of_grades : store.get_list_of_grades(grading.assignment_id)
            student_info   : student_info
            mode           : grading_mode
        )
        grading = grading.merge(grading.get_listing_files())
        @setState(grading : grading)

    # teacher departs from the dialog
    grading_stop: () =>
        store = @get_store()
        return if not store?
        grading = store.get('grading')
        apath = store.get_assignment(grading.assignment_id).get('path')
        @grading_cleanup_all_discussions()
        @setState(grading : null)
        @grading_remove_activity()

    # additonally filter student list by a substring
    grading_set_student_filter: (string) =>
        store = @get_store()
        return if not store?
        grading = store.get('grading')
        return if not grading?
        grading = grading.set('student_filter', string)
        @grading_update(store, grading)

    # utility method to set just a key in the grading state
    grading_set_entry: (key, value) =>
        store = @get_store()
        return if not store?
        grading = store.get('grading')
        return if not grading?
        grading = grading.set(key, value)
        if key in ['only_not_graded', 'only_collected', 'listing']
            @grading_update(store, grading)
        else
            @setState(grading:grading)

    grading_toggle_show_all_files: =>
        store = @get_store()
        return if not store?
        grading = store.get('grading')
        return if not grading?
        grading = grading.toggle_show_all_files()
        @grading_update(store, grading)

    grading_toggle_anonymous: =>
        store = @get_store()
        return if not store?
        grading = store.get('grading')
        return if not grading?
        grading = grading
                    .toggle_anonymous()
                    .set('student_filter', '')
        @grading_update(store, grading)

    grading_toggle_show_discussion: (show) =>
        store = @get_store()
        return if not store?
        grading = store.get('grading')
        return if not grading?
        # ignore if there are no changes
        return if grading.discussion_show == show
        @grading_update(store, grading.toggle_show_discussion(show))

    grading_cleanup_discussion: (assignment_path, account_id) =>
        return if not account_id?
        store = @get_store()
        return if not store?
        chat_path = store.grading_get_discussion_path(assignment_path, account_id)
        chat_register.remove(chat_path, @redux, store.get('course_project_id'))
        store.grading_remove_discussion(chat_path)

    grading_cleanup_all_discussions: =>
        store = @get_store()
        return if not store?
        store._open_discussions?.forEach (chat_path) =>
            chat_register.remove(chat_path, @redux, store.get('course_project_id'))
        delete store._open_discussions

    grading_activate_discussion: (assignment_path, account_id) =>
        store = @get_store()
        return if not store?
        if not account_id?
            chat_path = NO_ACCOUNT
        else
            chat_path = store.grading_get_discussion_path(assignment_path, account_id)
            chat_register.init(chat_path, @redux, store.get('course_project_id'))
            store.grading_register_discussion(chat_path)
        grading = store.get('grading')
        return if not grading?
        @setState(grading : grading.set_discussion(chat_path))

    # set the "cursor" to the assignment+student currently being graded
    grading_update_activity: (opts) =>
        store = @get_store()
        return if not store?
        grading = store.get('grading')
        return if not grading?

        location = defaults opts,
            type          : 'grading'
            assignment_id : grading.get('assignment_id')
            student_id    : grading.get('student_id')

        return if @syncdb?.is_closed() or not @_loaded()
        # argument must be an array, and we only have one cursor (at least, at the time of writing)
        @syncdb?.set_cursor_locs([location])

    # teacher moved to another student or closed the grading dialog
    grading_remove_activity: =>
        return if @syncdb?.is_closed() or not @_loaded()
        # argument must be an array, not null!
        @syncdb?.set_cursor_locs([])
