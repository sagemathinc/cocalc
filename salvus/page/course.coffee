{IS_MOBILE} = require("feature")

templates = $(".salvus-course-templates")

{alert_message}   = require('alerts')
{synchronized_db} = require('syncdb')

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
                    console.log("initialized syncdb")
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


