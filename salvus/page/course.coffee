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


INFO = ['title', 'description', 'location']

exports.course = (project_id, filename) ->
    element = templates.find(".salvus-course-editor").clone()
    new Course(project_id, filename, element)
    return element


class Course
    constructor : (@project_id, @filename, @element) ->
        @element.data('course', @)
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

    init_edit_info: () =>
        # make it so basic info about the course is editable.
        info = @db.select_one(table:'info')
        for prop in INFO
            e = @element.find(".salvus-course-editor-#{prop}").data('prop',prop)
            e.text(if info?[prop]? then info[prop] else "Click to edit #{prop}")
            e.make_editable
                one_line : true
                interval : 1000
                onchange : (e) =>
                    if @db?
                        s = {}
                        s[e.data('prop')] = e.data('raw')
                        @db.update
                            set   : s
                            where : {table : 'info'}
                        @db.save()

    handle_changes: (changes) =>
        for x in changes
            if x.insert?.table == "info"
                for prop in INFO
                    e = @element.find(".salvus-course-editor-#{prop}")
                    new_val = x.insert[prop]
                    old_val = e.text()
                    # TODO: this is hack-ish -- should apply a diff, etc.
                    if new_val != old_val
                        if not e.data('mode') != 'edit'  # don't change it while it is being edited
                            e.data('set_value')(new_val)
            else if x.insert?.table == "students"
                delete x.insert.table
                @render_student(x.insert)

    ###
    # Students
    ###

    init_new_student: () =>
        @element.find("a[href=#new-student]").click () =>
            @add_new_student()
            return false

    add_new_student: (opts) =>
        opts = defaults opts,
            name       : "Name"
            email      : "Email"
            other      : ""
            project_id : undefined
            grades     : []

        student_id = misc.uuid()
        @db.update
            set   :
                name   : opts.name
                email  : opts.email
                other  : opts.other
                grades : opts.grades
            where :
                table      : 'students'
                student_id : student_id
        @db.save()
        @render_student
            student_id : student_id
            name       : opts.name
            email      : opts.email
            other      : opts.other
            grades     : opts.grades

    init_students: () =>
        for student in @db.select({table : 'students'})
            delete student.table
            @render_student(student)


    render_student: (opts) =>
        opts = defaults opts,
            student_id : required
            name       : "Name"
            email      : "Email"
            other      : ""
            project_id : undefined
            grades     : []

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

            for field in ['name', 'email', 'other']
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

        for field in ['name', 'email', 'other']
            render_field(field)

        e.find("a[href=#create-project]").click () =>
            console.log("create project not implemented")
            return false

        @element.find(".salvus-course-students").append(e)


    ###
    # Assignment
    ###

    init_new_assignment: () =>
        @element.find("a[href=#new-assignment]").click () =>
            @add_new_assignment()
            return false

    add_new_assignment: () =>
        @element.find(".salvus-course-assignments").prepend(templates.find(".salvus-course-assignment").clone())

    init_assignments: () =>
        for assignment in @db.select({table : 'assignments'})
            delete assignment.table
            @render_assignment(assignment)













