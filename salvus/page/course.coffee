###
#
# Course Management
#
###

{IS_MOBILE} = require("feature")

templates = $(".salvus-course-templates")

{alert_message}   = require('alerts')
{synchronized_db} = require('syncdb')
{dmp}             = require('diffsync')


misc = require('misc')
{defaults, required} = require('misc')


INFO = ['title', 'description', 'location', 'website']

exports.course = (project_id, filename) ->
    element = templates.find(".salvus-course-editor").clone()
    new Course(project_id, filename, element)
    return element


class Course
    constructor : (@project_id, @filename, @element) ->
        @element.data('course', @)
        @init_page_buttons()
        @init_syncdb () =>
            @init_edit_info()
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
                    #console.log("initialized syncdb")
                cb()

    init_page_buttons: () =>
        PAGES =['students', 'assignments', 'info']
        buttons = @element.find(".salvus-course-page-buttons")
        for page in PAGES
            buttons.find("a[href=##{page}]").data('page',page).click (e) =>
                page = $(e.target).data('page')
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


    init_edit_info: () =>
        # make it so basic info about the course is editable.
        info = @db.select_one(table:'info')
        for prop in INFO
            e = @element.find(".salvus-course-editor-#{prop}").data('prop',prop)
            e.make_editable
                one_line : false
                interval : 1000
                onchange : (e) =>
                    s = {}
                    s[e.data('prop')] = e.data('get_value')()
                    @db.update
                        set   : s
                        where : {table : 'info'}
                    @db.save()
            e.data('set_value')(if info?[prop]? then info[prop] else "#{prop}")

    handle_changes: (changes) =>
        for x in changes
            if x.insert?.table == "info"
                for prop in INFO
                    e = @element.find(".salvus-course-editor-#{prop}")
                    new_val = x.insert[prop]
                    old_val = e.data('get_value')()
                    # TODO: this is hack-ish -- should apply a diff, etc.
                    if new_val != old_val
                        if not e.data('mode') != 'edit'  # don't change it while it is being edited
                            e.data('set_value')(new_val)
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
            name       : "Name"
            email      : "Email"
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


    render_student: (opts) =>
        opts = defaults opts,
            student_id : required
            name       : "Name"
            email      : "Email"
            notes      : ""
            project_id : undefined
            grades     : []
            append     : true
            focus      : false

        e = @element.find("[data-student_id='#{opts.student_id}']")
        if e.length > 0
            update_field = (field) =>
                z = e.find(".salvus-course-student-#{field}")
                cur = z.data('get_value')().trim()
                upstream = opts[field]
                if cur != upstream
                    last = z.data('last-sync')
                    p = dmp.patch_make(last, upstream)
                    new_cur = dmp.patch_apply(p, cur)[0]
                    z.data('last-sync', new_cur)
                    if new_cur != cur
                        z.data('set_value')(new_cur)
                    if new_cur != upstream
                        s = {}
                        s[field] = new_cur
                        @db.update
                            set   : s
                            where : {table : 'students', student_id : opts.student_id}
                        @db.save()

            for field in ['name', 'email', 'notes']
                update_field(field)

            return

        e = templates.find(".salvus-course-student").clone()
        e.attr("data-student_id", opts.student_id)

        render_field = (field) =>
            e.find(".salvus-course-student-#{field}").text(opts[field]).data('last-sync',opts[field]).make_editable
                one_line : true
                interval : 1000
                onchange : (e) =>
                    s = {}
                    new_val = e.text().trim()
                    s[field] = new_val
                    e.data('last-sync', new_val)
                    @db.update
                        set   : s
                        where : {table : 'students', student_id : opts.student_id}
                    @db.save()

        for field in ['name', 'email', 'notes']
            render_field(field)

        e.find("a[href=#create-project]").click () =>
            console.log("create project not implemented")
            return false

        if opts.append
            @element.find(".salvus-course-students").append(e)
        else
            @element.find(".salvus-course-students").prepend(e)

        @update_student_count()


    update_student_count: () =>
        @element.find(".salvus-course-students-count").text("(#{@element.find('.salvus-course-student').length})")

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













