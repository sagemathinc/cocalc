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
    description : "Description of course"
    location    : "Location of course"
    website     : "http://your.coursewebsite.edu"

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
        @init_new_assignment()
        @init_new_student()

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

    init_page_buttons: () =>
        PAGES =['students', 'teachers', 'assignments', 'settings']
        buttons = @element.find(".salvus-course-page-buttons")
        for page in PAGES
            buttons.find("a[href=##{page}]").data('page',page).click (e) =>
                page = $(e.delegateTarget).data('page')
                for p in PAGES
                    e = @element.find(".salvus-course-page-#{p}")
                    btn = buttons.find("a[href=##{p}]")
                    if p == page
                        e.show()
                        btn.addClass('btn-inverse')
                    else
                        e.hide()
                        btn.removeClass('btn-inverse')
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
        @element.find("a[href=#new-student]").click () =>
            @add_new_student()
            return false

    init_import_students: () =>
        @element.find("a[href=#import-students]").click () =>
            @import_students()
            return false

    add_new_student: (opts) =>
        opts = defaults opts,
            name       : ""
            email      : ""
            notes      : ""
            project_id : undefined
            grades     : []

        student_id = misc.uuid()

        @db.update
            set   :
                name   : opts.name
                email  : opts.email
                notes  : opts.notes
                grades : opts.grades
            where :
                table      : 'students'
                student_id : student_id
        @db.save()

        @render_student
            student_id : student_id
            name       : opts.name
            email      : opts.email
            notes      : opts.notes
            grades     : opts.grades
            append     : false
            focus      : true

    import_students: () =>
        console.log("not implemented")

    init_students: () =>
        v = @db.select({table : 'students'})
        v.sort (a,b) =>
            a = misc.split(a.name)
            a = a[a.length-1].toLowerCase()
            b = misc.split(b.name)
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
        console.log("update_student_view -- #{opts.student_id}")

        v = @db.select_one({student_id : opts.student_id, table : 'students'})
        delete v.table
        console.log("v=",v)
        @render_student(v)

    render_student: (opts) =>
        opts = defaults opts,
            student_id : required

            name       : undefined
            email      : undefined
            notes      : undefined
            project_id : undefined
            grades     : undefined

            append     : true
            focus      : false

        e = @element.find("[data-student_id='#{opts.student_id}']")

        render_project_button = () =>
            create_project_btn = e.find("a[href=#create-project]").show()
            open_project_btn = e.find("a[href=#open-project]")
            if not opts.project_id?
                open_project_btn.hide()
                create_project_btn.show()
                if not create_project_btn.hasClass('salvus-initialized')
                    create_project_btn.addClass('salvus-initialized').click () =>
                        create_project_btn.icon_spin(start:true)
                        @create_project
                            student_id : opts.student_id
                            cb         : (err, project_id) =>
                                create_project_btn.icon_spin(false)
                                if err
                                    alert_message(type:"error", message:err)
                        return false
            else
                create_project_btn.hide()
                open_project_btn.show()
                if not open_project_btn.hasClass('salvus-initialized')
                    open_project_btn.addClass('salvus-initialized').click () =>
                        require('projects').open_project(opts.project_id)


        if e.length > 0
            for field in ['name', 'email', 'notes']
                e.find(".salvus-course-student-#{field}").data('set_upstream')(opts[field])
            render_project_button()
            return

        e = templates.find(".salvus-course-student").clone()
        e.attr("data-student_id", opts.student_id)

        render_field = (field) =>
            if not opts[field]?
                return
            e.find(".salvus-course-student-#{field}").make_editable
                value    : opts[field]
                one_line : true
                interval : SYNC_INTERVAL
                onchange : (new_val) =>
                    #@db.sync () =>
                        s = {}
                        s[field] = new_val
                        @db.update
                            set   : s
                            where : {table : 'students', student_id : opts.student_id}
                        @db.save()

        for field in ['name', 'email', 'notes']
            render_field(field)

        render_project_button()

        if opts.append
            @element.find(".salvus-course-students").append(e)
        else
            @element.find(".salvus-course-students").prepend(e)

        @update_student_count()

        if opts.focus
            e.find(".salvus-course-student-email").focus_end()


    update_student_count: () =>
        @element.find(".salvus-course-students-count").text("(#{@element.find('.salvus-course-student').length})")

    create_project: (opts) =>
        opts = defaults opts,
            student_id : required
            cb         : undefined
        # create project for the given student
        console.log("create project for student=#{opts.student_id}")
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
                            to         : v.email
                            email      : "Please create a SageMathCloud account using this email address so that you can use the project for #{title}."
                            project_id : project_id
                            cb         : cb
                ], (err) =>
                    @update_student_view(student_id:opts.student_id)
                    opts.cb?(err)
            )

    course_project_settings: (student_id) =>
        z = @db.select_one(table:'settings')
        s = @db.select_one(table:'students', student_id:student_id)
        return {title: "#{s.name} -- #{z.title}", description:"#{z.description} (#{z.location}) -- #{z.website}"}


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













