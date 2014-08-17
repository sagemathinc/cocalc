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
{defaults, required} = misc

templates = $(".salvus-course-templates")

SYNC_INTERVAL = 500

SETTINGS =
    title       : "Course Title"
    description : "Course description"

exports.course = (project_id, filename) ->
    element = templates.find(".salvus-course-editor").clone()
    new Course(project_id, filename, element)
    return element


class Course
    constructor : (@project_id, @filename, @element) ->
        @element.data('course', @)
        @init_page_buttons()
        @init_syncdb () =>
            settings = @db.select_one(table:'settings')
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
                @db.save()

            @init_edit_settings()
            @init_students()

        @init_new_student()
        @init_help()

    show: () =>
        if not IS_MOBILE
            @element.maxheight()

    init_syncdb: (cb) =>
        synchronized_db
            project_id : @project_id
            filename   : @filename
            cb         : (err, db) =>
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
        PAGES =['students', 'shares', 'assignments', 'settings']
        buttons = @element.find(".salvus-course-page-buttons")
        for page in PAGES
            buttons.find("a[href=##{page}]").data('page',page).click (e) =>
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
        settings = @db.select_one(table:'settings')
        for prop in misc.keys(SETTINGS)
            e = @element.find(".salvus-course-editor-#{prop}").data('prop',prop)
            e.make_editable
                one_line : false
                interval : SYNC_INTERVAL
                value    : if settings?[prop]? then settings[prop] else "#{prop}"
                onchange : (value, e) =>
                    #console.log("saving to db that #{e.data('prop')} = #{value}")
                    #@db.sync () =>
                        s = {}
                        s[e.data('prop')] = value
                        @db.update
                            set   : s
                            where : {table : 'settings'}
                        @db.save (err) =>
                            #console.log("save got back -- #{err}")

    handle_changes: (changes) =>
        #console.log("handle_changes (#{misc.mswalltime()}): #{misc.to_json(changes)}")
        for x in changes
            if x.insert?.table == "settings"
                for prop in misc.keys(SETTINGS)
                    @element.find(".salvus-course-editor-#{prop}").data('set_upstream')(x.insert[prop])
            else if x.insert?.table == "students"
                delete x.insert.table
                @render_student(x.insert)
            else if x.insert?.table == "assignments"
                delete x.insert.table
                @render_assignment(x.insert)

    ###
    # Students
    ###

    init_new_student: () =>
        input_box  = @element.find(".salvus-course-students-add")
        add_button = @element.find(".salvus-course-add-button")
        select     = @element.find(".salvus-course-add-student-select")
        loading    = @element.find(".salvus-course-add-student-loading")
        noncloud_button = @element.find(".salvus-course-add-noncloud-student")
        cloud_button = @element.find(".salvus-course-add-cloud-student")
        noncloud_hint = @element.find(".salvus-course-add-noncloud-hint")
        last_result = undefined

        clear = () =>
            input_box.val('')
            noncloud_button.hide()
            cloud_button.hide()
            noncloud_hint.hide()
            select.hide()

        input_box.keyup (evt) =>
            if input_box.val() == ""
                noncloud_button.hide()
                cloud_button.hide()
            if evt.which == 13
                update_select(input_box.val())
                return

        add_button.click () =>
            update_select(input_box.val())
            return false

        noncloud_button.click () =>
            alert_message(type:"error", message:'add non-cloud collab not implemented')
            clear()

        cloud_button.click () =>
            console.log('cloud_button clicked')
            r = cloud_button.data('target')
            console.log('add student: ', r)
            @add_new_student
                account_id    : r.account_id
                first_name    : r.first_name
                last_name     : r.last_name
                email_address : r.email
            clear()

        set_cloud_button_target = (target) =>
            cloud_button.find("span").text(target.first_name + ' ' + target.last_name)
            cloud_button.show().data('target', target)

        select.click () =>
            account_id = select.val()
            if not account_id or not last_result?
                cloud_button.show().addClass('disabled')
            else
                cloud_button.show().removeClass('disabled')
                for r in last_result
                    if r.account_id == account_id
                        set_cloud_button_target(r)
                        break

        last_query_id = 0
        num_loading = 0
        update_select = (x) =>
            if x == ""
                select.html("").hide()
                return
            select.show()
            last_query_id += 1
            num_loading += 1
            loading.show()
            noncloud_hint.hide()
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
                    #result = (r for r in result when not already_student[r.account_id]?)   # only include not-already-students
                    if result.length > 0
                        noncloud_button.hide()
                        noncloud_hint.hide()
                        if result.length > 1
                            select.html('').show()
                            select.attr(size:Math.min(10, result.length))
                            for r in result
                                name = r.first_name + ' ' + r.last_name
                                select.append($("<option>").attr(value:r.account_id, label:name).text(name))
                            cloud_button.show().addClass('disabled').find("span").text("selected student")
                        else
                            # exactly one result
                            select.hide()
                            r = result[0]
                            set_cloud_button_target(r)

                    else
                        # no results
                        select.hide()
                        if require('client').is_valid_email_address(x)
                            noncloud_button.show()
                        else
                            noncloud_hint.show()
                        cloud_button.hide()



    add_new_student: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            first_name    : undefined
            last_name     : undefined
            email_address : undefined
            project_id    : undefined

        # TODO: check that no student with given account_id or email is already in db first

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

    import_students: () =>
        console.log("not implemented")

    init_students: () =>
        v = @db.select({table : 'students'})
        v.sort (a,b) =>
            if not a.name?
                return -1
            if not b.name?
                return 1
            a = misc.split(a.name)
            if a.length == 0
                return -1
            a = a[a.length-1].toLowerCase()
            b = misc.split(b.name)
            if b.length == 0
                return 1
            b = b[b.length-1].toLowerCase()
            if a < b
                return -1
            else if a > b
                return +1
            else
                return 0

        for student in v
            delete student.table
            @render_student(student)

    update_student_view: (opts) =>
        opts = defaults opts,
            student_id : required
        v = @db.select_one({student_id : opts.student_id, table : 'students'})
        delete v.table
        @render_student(v)

    click_create_project_button: (student_id) =>
            if not opts.project_id?
                open_project_btn.hide()
                create_project_btn.show()
                if not create_project_btn.hasClass('salvus-initialized')
                    create_project_btn.addClass('salvus-initialized').click () =>

            else

    render_student: (opts) =>
        opts = defaults opts,
            student_id    : required
            first_name    : undefined
            last_name     : undefined
            email_address : undefined
            project_id    : undefined
            account_id    : undefined
            append        : true

        e = @element.find("[data-student_id='#{opts.student_id}']")

        if e.length == 0
            e = templates.find(".salvus-course-student").clone()
            e.attr("data-student_id", opts.student_id).attr("data-account_id", opts.account_id)
            e.find("a[href=#create-project]").click () =>
                create_project_btn.addClass('disabled').icon_spin(start:true)
                @create_project
                    student_id : opts.student_id
                    cb         : (err, project_id) =>
                        create_project_btn.removeClass('disabled').icon_spin(false)
                        if err
                            alert_message(type:"error", message:"error creating project -- #{err}")
                return false
            e.find("a[href=#open-project]").click () =>
                v = @db.select_one({student_id : opts.student_id, table : 'students'})
                project_id = v.project_id
                if not project_id?
                    alert_message(type:"error", message:"no project defined for #{v.first_name} #{v.last_name}")
                else
                    f = () => require('projects').open_project(project_id)
                    setTimeout(f, 1) # ugly hack Jon suggests for now.
                return false
            if opts.append
                @element.find(".salvus-course-students").append(e)
            else
                @element.find(".salvus-course-students").prepend(e)
            @update_student_count()

        create_project_btn = e.find("a[href=#create-project]")
        open_project_btn   = e.find("a[href=#open-project]")

        render_field = (field) =>
            f = e.find(".salvus-course-student-#{field}")
            if not opts[field]?
                f.hide()
            else
                f.show().find("span").text(opts[field])

        for field in ['email_address', 'first_name', 'last_name']
            render_field(field)

        if opts.project_id?
            open_project_btn.show()
            create_project_btn.hide()
        else
            open_project_btn.hide()
            create_project_btn.show()

    update_student_count: () =>
        @element.find(".salvus-course-students-count").text("(#{@element.find('.salvus-course-student').length})")

    create_project: (opts) =>
        opts = defaults opts,
            student_id : required
            cb         : undefined
        # create project for the given student
        where = {student_id : opts.student_id, table : 'students'}
        v = @db.select_one(where)
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
                        cb          : (err, resp) =>
                            if resp.event == 'error'
                                err = resp.error
                            if err
                                cb(err)
                            else
                                project_id = resp.project_id
                                @db.update
                                    set   : {project_id : project_id}
                                    where : where
                                @db.save()
                                cb()
                (cb) =>
                    salvus_client.hide_project_from_user
                        project_id : project_id
                        cb         : cb
                (cb) =>
                    if v.account_id?
                        salvus_client.project_invite_collaborator
                            project_id : project_id
                            account_id : v.account_id
                            cb         : cb
                    else
                        salvus_client.invite_noncloud_collaborators
                            to         : v.email_address
                            email      : "Please create a SageMathCloud account using this email address so that you can use the project for #{title}.\n\n#{description}"
                            project_id : project_id
                            cb         : cb
                ], (err) =>
                    @update_student_view(student_id:opts.student_id)
                    opts.cb?(err)
            )

    course_project_settings: (student_id) =>
        z = @db.select_one(table:'settings')
        s = @db.select_one(table:'students', student_id:student_id)
        return {title: "#{s.first_name} #{s.last_name} -- #{z.title}", description:z.description}


    ###
    # Assignment
    ###

    init_new_assignment: () =>
        @element.find("a[href=#new-assignment]").click () =>
            @add_new_assignment()
            return false

    add_new_assignment: () =>
        @render_assignment()

    render_assignment: () =>
        @element.find(".salvus-course-assignments").prepend(templates.find(".salvus-course-assignment").clone())
        @update_assignment_count()

    update_assignment_count: () =>
        @element.find(".salvus-course-assignments-count").text("(#{@element.find('.salvus-course-assignment').length})")


    init_assignments: () =>
        for assignment in @db.select({table : 'assignments'})
            delete assignment.table
            @render_assignment(assignment)







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





