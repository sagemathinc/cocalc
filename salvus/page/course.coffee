###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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
#
# Course Management
#
###

async                = require('async')
{IS_MOBILE}          = require("feature")
{alert_message}      = require('alerts')
{synchronized_db}    = require('syncdb')
{salvus_client}      = require('salvus_client')
misc                 = require('misc')
misc_page            = require('misc_page')
{defaults, required} = misc

templates = $(".salvus-course-templates")
template_student_collected = templates.find(".salvus-course-collected-assignment-student")

SYNC_INTERVAL = 500

# How many rsync-related operations to do in parallel (with async.map)
MAP_LIMIT = 10

SETTINGS =
    title       : "Course title"
    description : "Course description"

exports.course = (editor, filename) ->
    element = templates.find(".salvus-course-editor").clone()
    new Course(editor, filename, element)
    return element

compare_students = (a,b) =>
    if a.deleted and not b.deleted
        return 1
    if b.deleted and not a.deleted
        return -1
    if a.last_name?
        a_name = "#{a.last_name} #{a.first_name}".toLowerCase()
    else
        a_name = a.email_address
    if b.last_name?
        b_name = "#{b.last_name} #{b.first_name}".toLowerCase()
    else
        b_name = b.email_address
    if a_name < b_name
        return -1
    else if a_name > b_name
        return +1
    else
        return 0

class Course
    constructor : (@editor, @filename, @element) ->
        @project_id = @editor.project_id
        @element.data('course', @)

        @init_page_buttons()
        @init_student_search()
        @init_assignments_search()
        @init_view_options()
        @init_new_student()
        @init_new_file_assignment()
        @init_create_all_projects_button()
        @init_help()
        async.series([
            (cb) =>
                @init_syncdb(cb)
            (cb) =>
                @default_settings(cb)
            (cb) =>
                @init_edit_settings()
                @check_if_students_have_signed_up_for_an_account()
                @update_students()
                @init_assignments()
                @update_assignments()
                @init_collaborators(cb)
        ], (err) =>
            if err
                alert_message(type:"error", message:"error initializing course (try re-opening the course) -- #{err}")
        )

    destroy: () =>
        @db?.destroy()
        @element.removeData()

    default_settings: (cb) =>
        settings = @db.select_one(where:{table:'settings'})
        need_update = false
        if not settings?
            settings = misc.copy(SETTINGS)
            need_update = true
        else
            for k, v of SETTINGS # set defaults
                if not settings[k]?
                    settings[k] = v
                    need_update = true
        if need_update
            @db.update(set:settings, where:{table:'settings'})
            @db.save(cb)
        else
            cb()

    show: () =>
        if not IS_MOBILE
            @element.maxheight()

    local_storage: (key, value) =>
        {local_storage}   = require('editor')
        return local_storage(@project_id, @filename, key, value)

    init_view_options: () =>
        @_show_deleted_students = @element.find(".salvus-course-show-deleted-students")
        @_show_deleted_students.prop("checked", @local_storage("show_deleted_students"))
        @_show_deleted_students.change () =>
            @local_storage("show_deleted_students", @_show_deleted_students.is(":checked"))
            # now re-render all deleted students
            for student in @db.select(where:{table : 'students'})
                if student.deleted
                    @render_student(student)
            @update_student_count()

        @_show_deleted_assignments = @element.find(".salvus-course-show-deleted-assignments")
        @_show_deleted_assignments.prop("checked", @local_storage("show_deleted_assignments"))
        @_show_deleted_assignments.change () =>
            @local_storage("show_deleted_assignments", @_show_deleted_assignments.is(":checked"))
            # now re-render all deleted assignments
            for assignment in @db.select(where:{table : 'assignments'})
                if assignment.deleted
                    @render_assignment
                        assignment : assignment
                        append     : true
            @update_assignment_count()

    init_syncdb: (cb) =>
        @element.find(".salvus-course-loading").show()
        synchronized_db
            project_id : @project_id
            filename   : @filename
            cb         : (err, db) =>
                @element.find(".salvus-course-loading").hide()
                if err
                    alert_message(type:"error", message:"unable to open #{@filename}")
                else
                    @db = db
                    @db.on 'change', @handle_changes
                cb()

    init_help: () =>
        @element.find("a[href=#help]").click () =>
            help_dialog()
            return false


    init_page_buttons: () =>
        PAGES =['students', 'assignment', 'settings']
        buttons = @element.find(".salvus-course-page-buttons")
        for page in PAGES
            @element.find("a[href=##{page}]").data('page',page).click (e) =>
                page = $(e.delegateTarget).data('page')
                for p in PAGES
                    e = @element.find(".salvus-course-page-#{p}")
                    btn = buttons.find("a[href=##{p}]")
                    if p == page
                        e.show()
                        btn.addClass('btn-primary')
                    else
                        e.hide()
                        btn.removeClass('btn-primary')
                return false


    init_edit_settings: () =>
        # make it so basic settings about the course is editable.
        settings = @db.select_one(where:{table:'settings'})
        for prop in misc.keys(SETTINGS)
            e = @element.find(".salvus-course-editor-#{prop}").data('prop',prop)
            e.make_editable
                one_line : false
                interval : SYNC_INTERVAL
                value    : if settings?[prop]? then settings[prop] else "#{prop}"
                onchange : (value, e) =>
                    s = {}
                    s[e.data('prop')] = value
                    @db.update
                        set   : s
                        where : {table : 'settings'}
                    @db.save (err) =>
                        if not err
                            if e.data('prop') in ['title', 'description']
                                @update_student_project_settings(prop:e.data('prop'))

    handle_changes: (changes) =>
        @editor.activity_indicator(@filename)
        #console.log("handle_changes (#{misc.mswalltime()}): #{misc.to_json(changes)}")
        for x in changes
            if x.insert?.table == "settings"
                for prop in misc.keys(SETTINGS)
                    @element.find(".salvus-course-editor-#{prop}").data('set_upstream')(x.insert[prop])
            else if x.insert?.table == "students"
                @render_student(x.insert)
            else if x.insert?.table == "assignments"
                @render_assignment(assignment:x.insert)
        @update_student_count()
        @update_assignment_count()

    ###
    # Students
    ###

    init_new_student: () =>
        input_box  = @element.find(".salvus-course-students-add")
        add_button = @element.find(".salvus-course-add-student-button")
        select     = @element.find(".salvus-course-add-student-select")
        loading    = @element.find(".salvus-course-add-student-loading")
        add_selected_button = @element.find(".salvus-course-add-selected-button")
        noncloud_hint = @element.find(".salvus-course-add-noncloud-hint")
        last_result = undefined

        clear = () =>
            input_box.val('')
            add_selected_button.hide()
            noncloud_hint.hide()
            select.hide()

        input_box.keyup (evt) =>
            if input_box.val() == ""
                add_selected_button.hide()
            if evt.which == 13
                update_select(input_box.val())
                return

        add_button.click () =>
            update_select(input_box.val())
            return false

        add_selected_button.click () =>
            v = {}
            for y in select.find(":selected")
                v[$(y).attr('value')] = true
            for r in last_result
                if v[r.account_id] or v[r.email_address]
                    @add_new_student
                        account_id    : r.account_id
                        first_name    : r.first_name
                        last_name     : r.last_name
                        email_address : r.email_address
            clear()

        select.click () =>
            if select.find(":selected").length == 0
                add_selected_button.show().addClass('disabled')
            else
                add_selected_button.show().removeClass('disabled')

        last_query_id = 0
        num_loading = 0
        update_select = (x) =>
            noncloud_hint.hide()
            if x == ""
                select.html("").hide()
                return
            select.show()

            last_query_id += 1
            num_loading += 1
            loading.show()
            salvus_client.user_search
                query    : x
                limit    : 30
                query_id : last_query_id
                cb       : (err, result, query_id) =>
                    num_loading -= 1
                    if num_loading <= 0
                        loading.hide()
                    if err
                        alert_message(type:"error", message:"error searching for students -- #{err}")
                        select.html("").hide()
                        return
                    if query_id != last_query_id
                        # ignore any query that is not the most recent
                        return
                    select.html("")
                    last_result = result

                    {string_queries, email_queries} = misc.parse_user_search(x)

                    # add in all emails for which there's no current SMC account, so an invite will get sent instead.
                    result_emails = {}
                    for r in result
                        if r.email_address?
                            result_emails[r.email_address] = true
                    for r in email_queries
                        if not result_emails[r]
                            result.push({email_address:r})

                    # remove from search result every non-deleted student who is already in the course
                    already_student = {}
                    for z in @db.select(where:{table : 'students'})
                        if z.deleted  # don't omit deleted students; can't put deleted:false in search though since deleted is undefined for non-deleted students.
                            continue
                        if z.account_id?
                            already_student[z.account_id] = true
                        if z.email_address?
                            already_student[z.email_address] = true
                    result = (r for r in result when not (already_student[r.account_id] or already_student[r.email_address]))

                    if result.length > 0
                        noncloud_hint.hide()
                        add_selected_button.hide()
                        select.html('').show()
                        select.attr(size:Math.min(10, result.length))
                        for r in result
                            if r.account_id?
                                name = r.first_name + ' ' + r.last_name
                                select.append($("<option>").attr(value:r.account_id, label:name).text(name))
                            else if r.email_address?
                                name = "Invite #{r.email_address}"
                                select.append($("<option>").attr(value:r.email_address, label:name).text(name))
                        add_selected_button.show().addClass('disabled').find("span").text("selected student")

                    else
                        # no results
                        select.hide()
                        noncloud_hint.show()



    add_new_student: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            first_name    : undefined
            last_name     : undefined
            email_address : undefined
            project_id    : undefined

        # TODO: check that no student with given account_id or email is already in db first

        if opts.email_address?
            opts.email_address = misc.lower_email_address(opts.email_address)

        student_id = misc.uuid()
        @db.update
            set   :
                account_id    : opts.account_id
                first_name    : opts.first_name
                last_name     : opts.last_name
                email_address : opts.email_address
                project_id    : opts.project_id
            where :
                table         : 'students'
                student_id    : student_id
        @db.save()

        @render_student
            student_id    : student_id
            first_name    : opts.first_name
            last_name     : opts.last_name
            email_address : opts.email_address
            project_id    : opts.project_id
            append        : false
        @update_student_count()


    check_if_students_have_signed_up_for_an_account: () =>
        # for each student that doesn't have an account id yet, since they haven't joined,
        # check to see if they have in fact joined and if so record their account id and name.
        email_query = (x.email_address for x in @db.select(where:{table : 'students'}) when not x.account_id?)
        if email_query.length == 0
            # nothing to do
            return
        salvus_client.user_search
            query : email_query.join(',')
            cb    : (err, result) =>
                if err
                    # oh well...
                    return
                for r in result
                    if r.account_id?
                        @db.update
                            set :
                                account_id    : r.account_id
                                first_name    : r.first_name
                                last_name     : r.last_name
                            where :
                                table         : 'students'
                                email_address : r.email_address


    update_students: () =>
        v = @db.select(where:{table : 'students'})
        v.sort(compare_students)
        for student in v
            @render_student(student)
        @update_student_count()

    update_create_all_projects_button: (n) =>
        e = @element.find("a[href=#create-all-projects]")
        if n >= 2
            e.show()
            e.find("span").text(n)
        else
            e.hide()

    init_student_search: () =>
        @student_search_box = @element.find(".salvus-course-students-search")
        update = () =>
            v = @student_search_box.val()
            if v
                @element.find(".salvus-course-student-search-contain").show().find(".salvus-course-search-query").text(v)
            else
                @element.find(".salvus-course-student-search-contain").hide()
            @update_students()
        @student_search_box.keyup(update)
        @element.find(".salvus-course-page-students").find(".salvus-course-search-clear").click () =>
            @student_search_box.val('').focus()
            update()
            return false

    update_student_view: (opts) =>
        opts = defaults opts,
            student_id : required
        @render_student(@db.select_one(where:{student_id : opts.student_id, table : 'students'}))

    delete_student: (opts) =>
        opts = defaults opts,
            student_id : required
        @db.update
            set   : {deleted : true}
            where : {student_id : opts.student_id, table : 'students'}
        @db.save()

    undelete_student: (opts) =>
        opts = defaults opts,
            student_id : required
        @db.update
            set   : {deleted : false}
            where : {student_id : opts.student_id, table : 'students'}
        @db.save()

    render_student: (opts) =>
        opts = defaults opts,
            student_id    : required
            first_name    : undefined
            last_name     : undefined
            email_address : undefined
            project_id    : undefined
            account_id    : undefined
            deleted       : false
            append        : true
            table         : undefined   # ignored

        e = @element.find("[data-student_id='#{opts.student_id}']")
        name = @student_name(opts)

        if e.length == 0
            e = templates.find(".salvus-course-student").clone()
            e.attr("data-student_id", opts.student_id).attr("data-account_id", opts.account_id)
            e.find("a[href=#delete]").click () =>
                mesg = "<h3><i class='fa fa-trash'></i> Delete Student</h3><hr>Delete #{name}?"
                if not @_show_deleted_students.is(":checked")
                    mesg += "<br><br><span class='lighten'>(Select 'Show deleted students' in settings to see deleted students.)</span>"
                bootbox.confirm mesg, (result) =>
                    if result
                        @delete_student(student_id: opts.student_id)
                return false

            e.find("a[href=#undelete]").click () =>
                @undelete_student(student_id: opts.student_id)
                return false

            e.find("a[href=#create-project]").click () =>
                create_project_btn.addClass('disabled').icon_spin(start:true)
                @create_project
                    student_id : opts.student_id
                    cb         : (err, project_id) =>
                        create_project_btn.removeClass('disabled').icon_spin(false)
                        if err
                            alert_message(type:"error", message:"error creating project -- #{misc.to_json(err)}")
                return false

            e.find("a[href=#open-project]").click () =>
                v = @db.select_one(where:{student_id : opts.student_id, table : 'students'})
                project_id = v.project_id
                if not project_id?
                    alert_message(type:"error", message:"no project defined for #{v.first_name} #{v.last_name}")
                else
                    f = () =>
                        require('projects').open_project(project:project_id)
                    setTimeout(f, 1) # ugly hack Jon suggests for now.
                return false

            if opts.append
                @element.find(".salvus-course-students").append(e)
            else
                @element.find(".salvus-course-students").prepend(e)

        if opts.deleted
            if @_show_deleted_students.is(":checked")
                e.show()
            else
                e.hide()
        else
            e.show()

        create_project_btn = e.find("a[href=#create-project]")
        open_project_btn   = e.find("a[href=#open-project]")

        e.find(".salvus-course-student-name").text(name)
        search_text = name.toLowerCase()

        if opts.project_id?
            open_project_btn.show()
            create_project_btn.hide()
        else
            open_project_btn.hide()
            if not opts.deleted
                create_project_btn.show()
            else
                create_project_btn.hide()

        if opts.deleted
            e.addClass('salvus-course-student-deleted')
            e.find(".salvus-course-student-props").addClass('salvus-course-student-deleted')
            e.find("a[href=#undelete]").show()
            e.find("a[href=#delete]").hide()
        else
            e.removeClass('salvus-course-student-deleted')
            e.find(".salvus-course-student-props").removeClass('salvus-course-student-deleted')
            e.find("a[href=#undelete]").hide()
            e.find("a[href=#delete]").show()

        search = @student_search_box.val()
        if search?
            for x in search.toLowerCase().split(' ')
                if search_text.indexOf(x) == -1
                    e.hide()
                    break

    update_student_count: () =>
        v = @db.select(where:{table : 'students'})
        if @_show_deleted_students.is(":checked")
            n = v.length
        else
            n = (x for x in v when not x.deleted).length
        @element.find(".salvus-course-students-count").text("(#{n})")
        if n == 0
            @element.find(".salvus-course-students-none").show()
            @element.find(".salvus-course-students-add").focus()
        else
            @element.find(".salvus-course-students-none ").hide()

        n = (x for x in v when not x.deleted and not x.project_id?).length
        @update_create_all_projects_button(n)

    create_project: (opts) =>
        opts = defaults opts,
            student_id : required
            cb         : undefined
        # create project for the given student
        where = {student_id : opts.student_id, table : 'students'}
        v = @db.select_one(where:where)
        if not v?
            opts.cb?("tried to create project for non-existent student with id #{opts.student_id}")
        else if v.project_id?
            # nothing to do -- project already created
            opts.cb?()
        else
            # create the project (hidden from creator) and add student and TA's as collaborator
            {title, description} = @course_project_settings(opts.student_id)
            project_id = undefined
            async.series([
                (cb) =>
                    salvus_client.create_project
                        title       : title
                        description : description
                        public      : false
                        cb          : (err, _project_id) =>
                            if err
                                cb("error creating project -- #{err}")
                            else
                                project_id = _project_id
                                cb()
                (cb) =>
                    salvus_client.hide_project_from_user
                        project_id : project_id
                        cb         : (err) =>
                            if err
                                cb("error hiding project from user -- #{err}")
                            else
                                cb()
                (cb) =>
                    # Make everybody who is a collaborator on the project owning this .course file
                    # also a collaborator on the student project.
                    @add_course_collaborators_to_project
                        project_id : project_id
                        update     : false
                        cb         : cb
                (cb) =>
                    if v.account_id?
                        salvus_client.project_invite_collaborator
                            project_id : project_id
                            account_id : v.account_id
                            cb         : (err) =>
                                if err
                                    cb("error inviting student as collaborator -- #{err}")
                                else
                                    cb()
                    else
                        #console.log("invite_noncloud_collaborators")
                        salvus_client.invite_noncloud_collaborators
                            to         : v.email_address
                            email      : "Please create a SageMathCloud account using this email address so that you can use the project for #{title}.\n\n#{description}"
                            project_id : project_id
                            cb         : (err) =>
                                #console.log("got back err", err)
                                if err
                                    cb("error inviting #{v.email_address} to collaborate on a course project -- #{misc.to_json(err)}")
                                else
                                    cb()
                ], (err) =>
                    if err
                        opts.cb?(err)
                    else
                        @db.update
                            set   : {project_id : project_id}
                            where : where
                        i = Math.random()
                        #console.log('about to save ',i)
                        @db.save (err) =>
                            #console.log('save #{i} done -- err',err)
                        @update_student_view(student_id:opts.student_id)
                        opts.cb?()
            )

    # return project_id's of students who have not been deleted.
    ##student_project_ids: () =>
    ##    return (x.project_id for x in @db.select(where:{table : 'students'}) when x.project_id? and not x.deleted)

    # return non-deleted students
    students: () =>
        v = (student for student in @db.select(where:{table : 'students'}) when not student.deleted)
        v.sort(compare_students)
        return v

    # TODO: this is *incredibly* stupid/inefficient and needs to be rewritten more cleverly.
    update_student_project_settings: (opts) =>
        opts = defaults opts,
            prop : required   # 'title' or 'description'
            cb   : undefined
        #console.log("update_student_project_settings: #{opts.prop}")
        if opts.prop not in ['title', 'description']
            cb("unknown property #{opts.prop}")
            return

        f = (student, cb) =>
            if not student.project_id?
                cb() # no project
            else
                {title, description} = @course_project_settings(student.student_id)
                if opts.prop == 'title'
                    data = {'title': title}
                else if opts.prop == 'description'
                    data = {'description': description}
                salvus_client.update_project_data
                    project_id : student.project_id
                    data       : data
                    cb         : cb
        # use mapLimit to avoid running afoul of backend message rate limiter.
        async.mapLimit(@students(), MAP_LIMIT, f, (err) => opts.cb?(err))

    # Ensure that everybody who is a collaborator on the project owning this .course
    # file is also a collaborator on the student project.  If anybody is being added
    # as a collaborator, add them so the project is hidden from their normal listing.
    add_course_collaborators_to_project: (opts) =>
        opts = defaults opts,
            project_id     : required
            update         : true     # if true, we assume project was created a while ago and lookup collaborators; otherwise add *all* collabs.
            course_collabs : undefined
            cb             : required

        course_collabs  = opts.course_collabs
        project_collabs = {}
        async.series([
            (cb) =>
                if course_collabs?
                    cb(); return
                # get collaborators on course owner's project
                salvus_client.project_users
                    project_id : @project_id
                    cb         : (err, users) =>
                        if err
                            cb(err); return
                        v = users.collaborator.concat(users.invited_collaborator)  # invited_collab isn't used yet, but just in case
                        course_collabs = (x.account_id for x in v)
                        cb()
            (cb) =>
                if not opts.update
                    cb()
                    return
                # get collaborators on the project
                salvus_client.project_users
                    project_id : opts.project_id
                    cb         : (err, users) =>
                        if err
                            cb(err); return
                        for x in users.collaborator.concat(users.invited_collaborator)
                            project_collabs[x.account_id] = true
                        cb()
            (cb) =>
                # add each person in course_collabs not in project_collabs, and hide project from that person.
                to_invite = (x for x in course_collabs when not project_collabs[x])
                f = (account_id, cb) =>
                    async.series([
                        (c) =>
                            salvus_client.project_invite_collaborator
                                project_id : opts.project_id
                                account_id : account_id
                                cb         : c
                        (c) =>
                            salvus_client.hide_project_from_user
                                project_id : opts.project_id
                                account_id : account_id
                                cb         : c
                    ], cb)
                async.mapLimit(to_invite, MAP_LIMIT, f, (err) => cb(err))
        ], opts.cb)

    init_collaborators: (cb) =>
        course_collabs = undefined
        to_add = undefined
        # get collaborators on course owner's project
        salvus_client.project_users
            project_id : @project_id
            cb         : (err, users) =>
                if err
                    cb?(err)
                    return
                v = users.collaborator.concat(users.invited_collaborator)  # invited_collab isn't used yet, but just in case
                course_collabs = (x.account_id for x in v)
                if course_collabs.indexOf(require('account').account_settings.account_id()) != -1
                    # person opening course project is not the owner, so don't do this.
                    cb?()
                    #console.log("not owner -- skipping")
                    return

                #console.log("owner -- updating")
                course_collabs.sort()

                # check if changed from last load
                last = @db.select_one(where:{table:'collaborators'})?.collabs  # map with keys the collabs
                if not last?
                    last = {}
                to_add = (account_id for account_id in course_collabs when not last[account_id]?)
                if to_add.length == 0
                    cb?()
                    return
                # add all new collaborators to all projects
                f = (student, cb) =>
                    if not student.project_id?
                        cb()
                    else
                        @add_course_collaborators_to_project
                            project_id     : student.project_id
                            update         : true
                            course_collabs : to_add
                            cb             : cb
                async.mapLimit @students(), MAP_LIMIT, f, (err) =>
                    if err
                        cb?(err)
                    else
                        collabs = {}
                        for x in course_collabs
                            collabs[x] = true
                        @db.update
                            set   : {collabs:collabs}
                            where : {table:'collaborators'}
                        @db.save(cb)

    student_name: (student, no_invite) =>
        first_name = last_name = email_address = ''
        if student.first_name? then first_name = student.first_name
        if student.last_name? then last_name = student.last_name
        if student.email_address? then email_address = student.email_address
        if student.account_id? or first_name or last_name
            s = "#{first_name} #{last_name}"
            if email_address
                s += " (#{email_address})"
            return s
        else
            if no_invite
                return email_address
            else
                return "#{email_address} (invited)"

    course_project_settings: (student_id) =>
        z = @db.select_one(where:{table:'settings'})
        s = @db.select_one(where:{table:'students', student_id:student_id})
        if s.first_name? and s.last_name?
            name = "#{s.first_name} #{s.last_name}"
        else if s.email_address?
            name = s.email_address
        else
            name = ""
        name += ' -- '
        return {title: "#{name} #{z.title}", description:z.description}

    init_create_all_projects_button: () =>
        e = @element.find("a[href=#create-all-projects]").click () =>
            n = e.find('span').text()
            m = "Create all #{n} projects for the students in this course at once?"
            bootbox.confirm m, (result) =>
                if result
                    for x in @db.select(where:{table : 'students'})
                        if not x.project_id? and not x.deleted
                            e = @element.find("[data-student_id='#{x.student_id}']")
                            e.find("a[href=#create-project]").click()

    ###
    # Assignment
    ###
    init_new_file_assignment: () =>
        input_box     = @element.find(".salvus-course-assignment-add")
        search_button = @element.find(".salvus-course-search-assignment-button")
        select        = @element.find(".salvus-course-add-assignment-select")
        loading       = @element.find(".salvus-course-add-assignment-loading")
        assignment_button  = @element.find(".salvus-course-add-assignment-button")

        clear = () =>
            input_box.val('')
            select.hide()
            assignment_button.hide().find("span").text('')

        input_box.keyup (evt) =>
            if input_box.val() == ""
                assignment_button.hide()
                select.hide()
            if evt.which == 13
                update_select(input_box.val())
                return
        search_button.click () =>
            update_select(input_box.val())
            return false
        assignment_button.click () =>
            clear()
            @assignment_folder(assignment_button.data('path'))


        last_query = undefined
        num_loading = 0
        update_select = (query) =>
            loading.show()
            select.hide()
            last_query = "*#{query}*"
            salvus_client.find_directories
                project_id : @project_id
                query      : last_query
                cb         : (err, resp) =>
                    if err
                        alert_message(type:'error', message:"error searching for paths containing #{query}")
                        return
                    if resp.query != last_query
                        # ignore all but the most recent query
                        return
                    loading.hide()
                    select.html('').show()
                    select.attr(size:Math.min(10, resp.directories.length))
                    existing_assignments = {}
                    for x in @db.select(where:{table:'assignments'})
                        if not x.deleted
                            existing_assignments[x.path] = true
                    for path in resp.directories
                        if not existing_assignments[path]
                            select.append($("<option>").attr(value:path, label:path).text(path))
                    assignment_button.show().addClass('disabled').find("span").text("selected path")

        select.click () =>
            path = select.val()
            assignment_button.data('path', path).removeClass('disabled').find("span").text(path)


    assignment_folder: (path) =>
        # - make a new row
        # - have a button to do (or redo) the assignment for all students
        # - collect: gets all the files from all students (or updates it) -- select a local folder as destination and click button
        # - have a column with dropdown to jump to gathered version of files
        #console.log("create assignment: #{path}")
        assignment_id = misc.uuid()

        # default paths derived from course filename
        i = @filename.lastIndexOf('.')
        # where we collect homework that students have done (in teacher project)
        collect_path = @filename.slice(0,i) + '-collect/' + path

        # folder that we return graded homework to (in student project)
        graded_path = path + '-graded'

        target_path = path
        @db.update
            set :
                path         : path
                target_path  : target_path
                collect_path : collect_path
                graded_path  : graded_path
            where :
                table    : 'assignments'
                assignment_id : assignment_id
        @db.save()
        @update_assignment_count()
        @render_assignment
            assignment :
                assignment_id     : assignment_id
                path         : path
                target_path  : target_path
                collect_path : collect_path
            append   : false

    init_assignments: () =>
        @assignments_elt = @element.find(".salvus-course-assignments")

    delete_assignment: (opts) =>
        opts = defaults opts,
            assignment_id : required

        @db.update
            set   : {deleted : true}
            where : {assignment_id : opts.assignment_id, table : 'assignments'}
        @db.save()

    undelete_assignment: (opts) =>
        opts = defaults opts,
            assignment_id : required
        @db.update
            set   : {deleted : false}
            where : {assignment_id : opts.assignment_id, table : 'assignments'}
        @db.save()

    render_assignment: (opts) =>
        opts = defaults opts,
            assignment  : required
            append : true

        assignment = opts.assignment

        e = @assignments_elt.find("[data-assignment_id='#{assignment.assignment_id}']")
        if e.length == 0
            e = templates.find(".salvus-course-assignment").clone()
            e.attr("data-assignment_id", assignment.assignment_id)
            if opts.append
                @assignments_elt.append(e)
            else
                @assignments_elt.prepend(e)
            e.find(".salvus-course-assignment-path").click () =>
                @open_directory(assignment.path)
                return false

            # delete assignment
            e.find("a[href=#delete]").click () =>
                mesg = "<h3><i class='fa fa-trash'></i> Delete Assignment</h3><hr>Delete #{assignment.path}?"
                if not @_show_deleted_assignments.is(":checked")
                    mesg += "<br><br><span class='lighten'>(Select 'Show deleted assignments' in settings to see deleted assignments.)</span>"
                bootbox.confirm mesg, (result) =>
                    if result
                        @delete_assignment(assignment_id: opts.assignment.assignment_id)
                return false

            # undelete assignment
            e.find("a[href=#undelete]").click () =>
                @undelete_assignment(assignment_id: opts.assignment.assignment_id)
                return false

            # button: assign files to all students
            assignment_button = e.find("a[href=#assignment-files]").click () =>
                bootbox.confirm "Copy assignment '#{assignment.path}' to all students (newer files will not be overwritten)?", (result) =>
                    if result
                        assignment_button.icon_spin(start:true)
                        @assign_files_to_students
                            assignment_id : assignment.assignment_id
                            cb       : (err) =>
                                assignment_button.icon_spin(false)
                                if err
                                    alert_message(type:'error', message:"error sharing files with students - #{err}")

            # button: collect files from all students
            collect_button = e.find("a[href=#collect-files]").click () =>
                bootbox.confirm "Collect assignment '#{assignment.path}' from all students?", (result) =>
                    if result
                        collect_button.icon_spin(start:true)
                        @collect_assignment_from_students
                            assignment_id : assignment.assignment_id
                            cb       : (err) =>
                                collect_button.icon_spin(false)

            # button: return graded assignments to students
            return_button = e.find("a[href=#return-graded]").click () =>
                bootbox.confirm "Return graded assignment '#{assignment.path}' to all students?", (result) =>
                    if result
                        return_button.icon_spin(start:true)
                        @return_graded_to_students
                            assignment_id : assignment.assignment_id
                            cb       : (err) =>
                                if err
                                    alert_message(type:"error", message:"Error returning collected assignments (report to wstein@uw.edu) -- #{err}", timeout:15)
                                else
                                    alert_message(message:"Successfully returned collected assignments to students", timeout:3)
                                return_button.icon_spin(false)

        # NOTE: for now we just put everything -- visible or not -- in the DOM.  This is less
        # scalable -- but the number of assignments is likely <= 30...
        contain = @element.find(".salvus-course-page-assignment").find(".salvus-course-search-contain")
        hide = false
        if @assignments_search_box?
            v = @assignments_search_box.val().trim()
            if v
                contain.show().find(".salvus-course-search-query").text(v)
                search = assignment.path + assignment.collect_path
                hide = false
                for x in v.split(' ')
                    if search.indexOf(x) == -1
                        hide = true
                        break
                if hide
                    e.hide()
                else
                    e.show()
            else
                contain.hide()
                e.show()

        if not hide
            if assignment.deleted
                if @_show_deleted_assignments.is(":checked")
                    e.show()
                else
                    e.hide()
            else
                e.show()

        if assignment.deleted
            e.addClass("salvus-course-assignment-deleted")
            e.find(".salvus-course-assignment-props").addClass('salvus-course-assignment-deleted')
            e.find("a[href=#undelete]").show()
            e.find("a[href=#delete]").hide()
        else
            e.removeClass("salvus-course-assignment-deleted")
            e.find(".salvus-course-assignment-props").removeClass('salvus-course-assignment-deleted')
            e.find("a[href=#undelete]").hide()
            e.find("a[href=#delete]").show()


        e.find(".salvus-course-assignment-path").text(assignment.path)
        e.find(".salvus-course-collect-path").text(assignment.collect_path)

        # TODO: doing this every time is inefficient.
        assign_dropdown = e.find(".salvus-course-assign-to-student").empty()
        for student in @students()
            if student.deleted
                continue
            student_name = @student_name(student, true)
            a = assignment.last_assignment?[student.student_id]
            if a?.time?
                if a.error?
                    elt = $("<span>#{student_name} -- ERROR assigning at <span></span> (#{a.error})</span>")
                else
                    elt = $("<span>#{student_name} -- assigned <span></span></span>")
                elt.find("span").attr('title', (new Date(a.time)).toISOString()).timeago()
            else
                if student.project_id?
                    elt = $("<span>#{student_name} -- NOT assigned yet</span>")
                else
                    elt = $("<span>#{student_name} -- CREATE student project first</span>")
            (() =>
                # use a closure to save params
                which = {student:student, assignment:assignment, name:student_name}
                t = template_student_collected.clone()
                t.find("a").empty().append(elt)
                t.click () =>
                    if not which.student.project_id?
                        bootbox.alert("You must create #{student_name}'s project first.")
                        return
                    @assign_files_to_students
                        assignment_id : which.assignment.assignment_id
                        students      : [which.student]
                        cb            : (err) =>
                            if err
                                alert_message(type:"error", message:"Error copying files to #{which.name} -- #{err}")
                            else
                                alert_message(message:"Successfully copied assignment to #{which.name}")
                    return false
                assign_dropdown.append(t))()

        # TODO: doing this every time is inefficient!
        collected_dropdown = e.find(".salvus-course-collected-assignment-students").empty()
        for student in @students()
            student_name = @student_name(student, true)
            a = assignment.last_collect?[student.student_id]
            if a?.time?
                if a.error?
                    elt = $("<span>#{student_name} -- ERROR collecting at <span></span> (#{a.error})</span>")
                else
                    elt = $("<span>#{student_name} -- collected <span></span></span>")
                elt.find("span").attr('title', (new Date(a.time)).toISOString()).timeago()
                collected = true
            else
                if student.project_id?
                    collected = false
                    elt = $("<span>#{student_name} -- NOT collected yet</span>")
                else
                    collected = false
                    elt = $("<span>#{student_name} -- CREATE student project first</span>")
            # use a closure to save params
            (() =>
                which = {student:student, assignment:assignment, collected:collected}
                t = template_student_collected.clone()
                t.find("a").empty().append(elt)
                t.click () =>
                    if which.collected
                        @open_collected_assignment(student:which.student, assignment:which.assignment)
                    else
                        @collect_assignment_from_students
                            assignment_id : which.assignment.assignment_id
                            students : [which.student]
                            cb       : (err) =>
                                if err
                                    alert_message(type:"error", message:"Error collecting files from #{which.name} -- #{err}")
                                else
                                    alert_message(message:"Successfully collected assignment from #{which.name}")
                    return false
                collected_dropdown.append(t)
            )()


    collect_assignment_from_students: (opts) =>
        opts = defaults opts,
            assignment_id : required
            students : undefined  # if given, collect from the specified students; otherwise, collect from all students
            cb       : required

        if not opts.students?
            opts.students = @students()

        where = {table:'assignments', assignment_id:opts.assignment_id}
        assignment = @db.select_one(where:where)
        if not assignment.last_collect?
            assignment.last_collect = {}
        collect_from = (student, cb) =>
            #console.log("collecting '#{assignment.path}' from #{student.email_address}")
            if not student.project_id?
                #console.log("can't collect from #{student.email_address} -- no project")
                cb()
                return
            salvus_client.copy_path_between_projects
                src_project_id    : student.project_id
                src_path          : assignment.target_path
                target_project_id : @project_id
                target_path       : assignment.collect_path + '/' + student.student_id
                overwrite_newer   : assignment.collect_overwrite_newer
                delete_missing    : assignment.collect_delete_missing
                timeout           : assignment.timeout
                cb                : (err) =>
                    #console.log("finished collect with with #{student.email_address} -- err=#{err}")
                    assignment.last_collect[student.student_id] = {time:misc.mswalltime(), error:err}
                    if err
                        cb(err)
                    else
                        @db.update
                            set   : {last_collect:assignment.last_collect}
                            where : where
                        @db.save(cb)
        async.mapLimit(opts.students, MAP_LIMIT, collect_from, (err) => opts.cb(err))

    # copy the files for the given assignment_id to the given students
    assign_files_to_students: (opts) =>
        opts = defaults opts,
            assignment_id : required
            students : undefined  # if given, assignment with the given students; otherwise, assignment with all students
            cb       : required

        if not opts.students?
            opts.students = @students()

        where = {table:'assignments', assignment_id:opts.assignment_id}
        assignment = @db.select_one(where:where)
        if not assignment.last_assignment?
            assignment.last_assignment = {}
        assignment_with = (student, cb) =>
            #console.log("assigning '#{assignment.path}' to #{student.email_address}")
            if not student.project_id?
                # console.log("can't assign to #{student.email_address} -- no project")
                cb()
                return
            salvus_client.copy_path_between_projects
                src_project_id    : @project_id
                src_path          : assignment.path
                target_project_id : student.project_id
                target_path       : assignment.target_path
                overwrite_newer   : assignment.overwrite_newer
                delete_missing    : assignment.delete_missing
                timeout           : assignment.timeout
                cb                : (err) =>
                    #console.log("finished sending assignment to #{student.email_address} -- err=#{err}")
                    assignment.last_assignment[student.student_id] = {time:misc.mswalltime(), error:err}
                    if err
                        cb(err)
                    else
                        @db.update
                            set   : {last_assignment:assignment.last_assignment}
                            where : where
                        @db.save(cb)
        async.mapLimit(opts.students, MAP_LIMIT, assignment_with, (err) => opts.cb(err))

    return_graded_to_students: (opts) =>
        opts = defaults opts,
            assignment_id : required
            students      : undefined  # if given, assignment with the given students; otherwise, assignment with all students
            cb            : required

        if not opts.students?
            opts.students = @students()

        assignment = @db.select_one(where:{table:'assignments', assignment_id:opts.assignment_id})
        if not assignment.last_return_graded?
            assignment.last_return_graded = {}
        assignment_with = (student, cb) =>
            #console.log("returning '#{assignment.path}' to #{student.email_address}")
            # Only try to return if the student's project has been created *and* the assignment
            # for this student was collected (otherwise trying to return it results in an error).
            if not student.project_id? or not assignment.last_collect[student.student_id]?
                #console.log("can't return assignment to #{student.email_address} -- no project")
                cb()
                return
            #console.log("target_path = ", assignment.graded_path)
            salvus_client.copy_path_between_projects
                src_project_id    : @project_id
                src_path          : assignment.collect_path + '/' + student.student_id
                target_project_id : student.project_id
                target_path       : assignment.graded_path
                overwrite_newer   : assignment.overwrite_newer
                delete_missing    : assignment.delete_missing
                timeout           : assignment.timeout
                cb                : (err) =>
                    #console.log("return_graded_to_students", student)
                    if err
                        alert_message
                            type    : "error"
                            message : "Error returning assignment to #{@student_name(student)} -- #{err}"
                    #console.log("finished returning assignment to #{student.email_address} -- err=#{err}")
                    assignment.last_return_graded[student.student_id] = {time:misc.mswalltime(), error:err}
                    cb()  # explicitly don't pass error back, since we still want to return rest of assignments
        async.mapLimit(opts.students, MAP_LIMIT, assignment_with, (err) => opts.cb(err))


    open_directory: (path) =>
        @editor.project_page.chdir(path)
        @editor.project_page.display_tab("project-file-listing")

    open_collected_assignment: (opts) =>
        opts = defaults opts,
            assignment : required
            student    : required
        @open_directory(opts.assignment.collect_path + '/' + opts.student.student_id)

    init_assignments_search: () =>
        e = @element.find(".salvus-course-page-assignment")
        @assignments_search_box = e.find(".salvus-course-assignments-search")
        update = () =>
            v = @assignments_search_box.val()
            if v
                e.find(".salvus-course-search-contain").show().find(".salvus-course-search-query").text(v)
            else
                e.find(".salvus-course-search-contain").hide()
            @update_assignments()
        @assignments_search_box.keyup(update)
        e.find(".salvus-course-search-clear").click () =>
            @assignments_search_box.val('').focus()
            update()
            return false

    update_assignments: () =>
        v = @assignments()
        v.sort (a,b) =>
            if a.deleted and not b.deleted
                return 1
            if b.deleted and not a.deleted
                return -1
            if a.path < b.path
                return -1
            else if a.path > b.path
                return +1
            else
                return 0
        for assignment in v
            @render_assignment(assignment:assignment)
        @update_assignment_count()

    assignments: () =>
        @db.select(where:{table : 'assignments'})

    update_assignment_count: () =>
        v = @assignments()
        if @_show_deleted_assignments.is(":checked")
            n = v.length
        else
            n = (x for x in v when not x.deleted).length

        @element.find(".salvus-course-assignment-count").text("(#{n})")
        if n == 0
            @element.find(".salvus-course-assignments-none").show()
            @element.find(".salvus-course-assignments-add").focus()
        else
            @element.find(".salvus-course-assignments-none").hide()





help_dialog_element = templates.find(".salvus-course-help-dialog")
help_dialog_modal   = templates.find(".salvus-course-help-dialog")
help_dialog_open    = false

help_dialog = () ->
    help_dialog_modal = help_dialog_element.clone()
    help_dialog_open = true
    help_dialog_modal.modal()
    help_dialog_modal.find(".btn-close").click(close_help_dialog)

close_help_dialog = () ->
    help_dialog_open = false
    help_dialog_modal.modal('hide')





