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

SYNC_INTERVAL = 500

SETTINGS =
    title       : "Course title"
    description : "Course description"

exports.course = (editor, filename) ->
    element = templates.find(".salvus-course-editor").clone()
    new Course(editor, filename, element)
    return element


class Course
    constructor : (@editor, @filename, @element) ->
        @project_id = @editor.project_id
        @element.data('course', @)

        @init_page_buttons()
        @init_student_search()
        @init_shares_search()
        @init_view_options()
        @init_new_student()
        @init_new_file_share()
        @init_help()
        async.series([
            (cb) =>
                @init_syncdb(cb)
            (cb) =>
                @default_settings(cb)
            (cb) =>
                @init_edit_settings()
                @update_students()
                @init_shares()
                @update_shares()
                @init_collaborators(cb)
        ], (err) =>
            if err
                alert_message(type:"error", message:"error initializing course (try re-opening the course) -- #{err}")
        )

    default_settings: (cb) =>
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
            for student in @db.select({table : 'students'})
                if student.deleted
                    @render_student(student)
            @update_student_count()

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
        PAGES =['students', 'share', 'settings']
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
        settings = @db.select_one(table:'settings')
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
        #console.log("handle_changes (#{misc.mswalltime()}): #{misc.to_json(changes)}")
        for x in changes
            if x.insert?.table == "settings"
                for prop in misc.keys(SETTINGS)
                    @element.find(".salvus-course-editor-#{prop}").data('set_upstream')(x.insert[prop])
            else if x.insert?.table == "students"
                @render_student(x.insert)
            else if x.insert?.table == "shares"
                @render_share(share:x.insert)
        @update_student_count()
        @update_share_count()



    ###
    # Students
    ###

    init_new_student: () =>
        input_box  = @element.find(".salvus-course-students-add")
        add_button = @element.find(".salvus-course-add-student-button")
        select     = @element.find(".salvus-course-add-student-select")
        loading    = @element.find(".salvus-course-add-student-loading")
        already_match   = @element.find(".salvus-course-add-student-already-match")
        noncloud_button = @element.find(".salvus-course-add-noncloud-student")
        cloud_button = @element.find(".salvus-course-add-cloud-student")
        noncloud_hint = @element.find(".salvus-course-add-noncloud-hint")
        last_result = undefined

        clear = () =>
            input_box.val('')
            noncloud_button.hide()
            cloud_button.hide()
            noncloud_hint.hide()
            already_match.hide()
            select.hide()

        input_box.keyup (evt) =>
            if input_box.val() == ""
                noncloud_button.hide()
                cloud_button.hide()
                already_match.hide()
            if evt.which == 13
                update_select(input_box.val())
                return

        add_button.click () =>
            update_select(input_box.val())
            return false

        noncloud_button.click () =>
            email_address = noncloud_button.data('target')
            @add_new_student
                email_address : email_address
            clear()

        cloud_button.click () =>
            r = cloud_button.data('target')
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

                    # only include not-already-students
                    already_student = {}
                    for z in @db.select({table : 'students'})
                        if z.account_id?
                            already_student[z.account_id] = true
                        if z.email_address?
                            already_student[z.email_address] = true
                    result = (r for r in result when not already_student[r.account_id])

                    if result.length > 0
                        noncloud_button.hide()
                        noncloud_hint.hide()
                        already_match.hide()
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
                            if not already_student[x]
                                noncloud_button.show().data('target', x)
                            else
                                already_match.show()
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


    update_students: () =>
        v = @db.select({table : 'students'})
        v.sort (a,b) =>
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
        for student in v
            @render_student(student)
        @update_student_count()

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
        @render_student(@db.select_one({student_id : opts.student_id, table : 'students'}))

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

        if e.length == 0
            e = templates.find(".salvus-course-student").clone()
            e.attr("data-student_id", opts.student_id).attr("data-account_id", opts.account_id)
            e.find("a[href=#delete]").click () =>
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

        if opts.deleted
            if @_show_deleted_students.is(":checked")
                e.show()
            else
                e.hide()
        else
            e.show()

        create_project_btn = e.find("a[href=#create-project]")
        open_project_btn   = e.find("a[href=#open-project]")

        search_text = ''
        render_field = (field) =>
            f = e.find(".salvus-course-student-#{field}")
            if not opts[field]?
                f.hide()
            else
                search_text += ' ' + opts[field].toLowerCase()
                f.show().find("span").text(opts[field])

        for field in ['email_address', 'first_name', 'last_name']
            render_field(field)

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
            e.find(".salvus-course-student-props").addClass('salvus-course-student-deleted')
            e.find("a[href=#undelete]").show()
            e.find("a[href=#delete]").hide()
        else
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
        v = @db.select({table : 'students'})
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
                        salvus_client.invite_noncloud_collaborators
                            to         : v.email_address
                            email      : "Please create a SageMathCloud account using this email address so that you can use the project for #{title}.\n\n#{description}"
                            project_id : project_id
                            cb         : (err) =>
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
                        @db.save()
                        @update_student_view(student_id:opts.student_id)
                        opts.cb?()
            )

    # return project_id's of students who have not been deleted.
    ##student_project_ids: () =>
    ##    return (x.project_id for x in @db.select({table : 'students'}) when x.project_id? and not x.deleted)

    # return non-deleted students
    students: () =>
        return (student for student in @db.select({table : 'students'}) when not student.deleted)

    # TODO: this is *incredibly* stupid/inefficient and needs to be rewritten more cleverly.
    update_student_project_settings: (opts) =>
        opts = defaults opts,
            prop : required   # 'title' or 'description'
            cb   : undefined
        console.log("update_student_project_settings: #{opts.prop}")
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
        async.mapLimit(@students(), 10, f, (err) => opts.cb?(err))

    # Ensure that everybody who is a collaborator on the project owning this .course
    # file is also a collaborator on the student project.  If anybody is being added
    # as a collaborator, add them so the project is hidden from their normal listing.
    add_course_collaborators_to_project: (opts) =>
        opts = defaults opts,
            project_id : required
            update     : true     # if true, we assume project was created a while ago and lookup collaborators; otherwise add *all* collabs.
            course_collabs : undefined
            cb         : required

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
                async.mapLimit(to_invite, 10, f, (err) => cb(err))
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
                last = @db.select_one(table:'collaborators')?.collabs  # map with keys the collabs
                if not last?
                    last = {}
                to_add = (account_id for account_id in course_collabs when not last[account_id]?)
                if to_add.length == 0
                    cb?()
                    return
                # add all new collaborators to all projects
                f = (student, cb) =>
                    @add_course_collaborators_to_project
                        project_id     : student.project_id
                        update         : true
                        course_collabs : to_add
                        cb             : cb
                async.mapLimit @students(), 10, f, (err) =>
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

    course_project_settings: (student_id) =>
        z = @db.select_one(table:'settings')
        s = @db.select_one(table:'students', student_id:student_id)
        if s.first_name? and s.last_name?
            name = "#{s.first_name} #{s.last_name}"
        else if s.email_address?
            name = s.email_address
        else
            name = ""
        name += ' -- '
        return {title: "#{name} #{z.title}", description:z.description}


    ###
    # File Share
    ###
    init_new_file_share: () =>
        input_box     = @element.find(".salvus-course-share-add")
        search_button = @element.find(".salvus-course-search-share-button")
        select        = @element.find(".salvus-course-add-share-select")
        loading       = @element.find(".salvus-course-add-share-loading")
        share_button  = @element.find(".salvus-course-add-share-button")

        clear = () =>
            input_box.val('')
            select.hide()
            share_button.hide().find("span").text('')

        input_box.keyup (evt) =>
            if input_box.val() == ""
                share_button.hide()
                select.hide()
            if evt.which == 13
                update_select(input_box.val())
                return
        search_button.click () =>
            update_select(input_box.val())
            return false
        share_button.click () =>
            clear()
            @share_folder(share_button.data('path'))


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
                    existing_shares = {}
                    for x in @db.select(table:'shares')
                        existing_shares[x.path] = true
                    for path in resp.directories
                        if not existing_shares[path]
                            select.append($("<option>").attr(value:path, label:path).text(path))
                    share_button.show().addClass('disabled').find("span").text("selected path")

        select.click () =>
            path = select.val()
            share_button.data('path', path).removeClass('disabled').find("span").text(path)


    share_folder: (path) =>
        # - make a new row
        # - have a button to do (or redo) the share for all students
        # - collect: gets all the files from all students (or updates it) -- select a local folder as destination and click button
        # - have a column with dropdown to jump to gathered version of files
        console.log("create share folder #{path}")
        share_id = misc.uuid()

        # default is same level as course file in collect subdir
        p = misc.path_split(@filename).head
        if p
            p += '/'
        collect_path  = p + 'collect/' + path
        target_path = path
        @db.update
            set :
                path         : path
                target_path  : target_path
                collect_path : collect_path
            where :
                table    : 'shares'
                share_id : share_id
        @db.save()
        @update_share_count()
        @render_share
            share :
                share_id     : share_id
                path         : path
                target_path  : target_path
                collect_path : collect_path
            append   : false

    init_shares: () =>
        @shares_elt = @element.find(".salvus-course-shares")

    render_share: (opts) =>
        opts = defaults opts,
            share  : required
            append : true

        share = opts.share
        #console.log("render share #{share.share_id}: #{misc.to_json(share)}")

        e = @shares_elt.find("[data-share_id='#{share.share_id}']")
        if e.length == 0
            e = templates.find(".salvus-course-share").clone()
            e.attr("data-share_id", share.share_id)
            if opts.append
                @shares_elt.append(e)
            else
                @shares_elt.prepend(e)
            e.find(".salvus-course-share-path").click () =>
                @open_directory(share.path)
                return false
            e.find(".salvus-course-collect-path").click () =>
                # TODO: need to lookup current path
                @open_directory(share.collect_path)
                return false
            share_button = e.find("a[href=#share-files]").click () =>
                share_button.icon_spin(start:true)
                @share_path_with_students
                    share_id : share.share_id
                    cb       : (err) =>
                        share_button.icon_spin(false)
                        if err
                            alert_message(type:'error', message:"error sharing files with students - #{err}")
            collect_button = e.find("a[href=#collect-files]").click () =>
                collect_button.icon_spin(start:true)
                @collect_path_from_students
                    share_id : share.share_id
                    cb       : (err) =>
                        collect_button.icon_spin(false)


        e.find(".salvus-course-share-path").text(share.path)
        e.find(".salvus-course-collect-path").text(share.collect_path)

        # NOTE: for now we just put everything -- visible or not -- in the DOM.  This is less
        # scalable -- but the number of shares is likely <= 30...
        contain = @element.find(".salvus-course-page-share").find(".salvus-course-search-contain")
        if @shares_search_box?
            v = @shares_search_box.val().trim()
            if v
                contain.show().find(".salvus-course-search-query").text(v)
                search = share.path + share.collect_path
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

    collect_path_from_students: (opts) =>
        opts = defaults opts,
            share_id : required
            students : undefined  # if given, collect from the specified students; otherwise, collect from all students
            cb       : required

        if not opts.students?
            opts.students = @students()

        share = @db.select_one(table:'shares', share_id:opts.share_id)
        if not share.last_collect?
            share.last_collect = {}
        collect_from = (student, cb) =>
            console.log("collecting '#{share.path}' from #{student.email_address}")
            salvus_client.copy_path_between_projects
                src_project_id    : student.project_id
                src_path          : share.target_path
                target_project_id : @project_id
                target_path       : share.collect_path + '/' + student.student_id
                overwrite_newer   : share.collect_overwrite_newer
                delete_missing    : share.collect_delete_missing
                timeout           : share.timeout
                cb                : (err) =>
                    console.log("finished collect with with #{student.email_address} -- err=#{err}")
                    share.last_collect[student.student_id] = {time:misc.mswalltime(), error:err}
                    cb(err)
        async.mapLimit(opts.students, 10, collect_from, (err) => opts.cb(err))

    # share the files for the given share_id with the given students
    share_path_with_students: (opts) =>
        opts = defaults opts,
            share_id : required
            students : undefined  # if given, share with the given students; otherwise, share with all students
            cb       : required

        if not opts.students?
            opts.students = @students()

        share = @db.select_one(table:'shares', share_id:opts.share_id)
        if not share.last_share?
            share.last_share = {}
        share_with = (student, cb) =>
            console.log("sharing '#{share.path}' with #{student.email_address}")
            salvus_client.copy_path_between_projects
                src_project_id    : @project_id
                src_path          : share.path
                target_project_id : student.project_id
                target_path       : share.target_path
                overwrite_newer   : share.overwrite_newer
                delete_missing    : share.delete_missing
                timeout           : share.timeout
                cb                : (err) =>
                    console.log("finished share with with #{student.email_address} -- err=#{err}")
                    share.last_share[student.student_id] = {time:misc.mswalltime(), error:err}
                    cb(err)
        async.mapLimit(opts.students, 10, share_with, (err) => opts.cb(err))


    open_directory: (path) =>
        @editor.project_page.chdir(path)
        @editor.project_page.display_tab("project-file-listing")

    init_shares_search: () =>
        e = @element.find(".salvus-course-page-share")
        @shares_search_box = e.find(".salvus-course-shares-search")
        update = () =>
            v = @shares_search_box.val()
            if v
                e.find(".salvus-course-search-contain").show().find(".salvus-course-search-query").text(v)
            else
                e.find(".salvus-course-search-contain").hide()
            @update_shares()
        @shares_search_box.keyup(update)
        e.find(".salvus-course-search-clear").click () =>
            @shares_search_box.val('').focus()
            update()
            return false

    update_shares: () =>
        v = @shares()
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
        for share in v
            @render_share(share:share)
        @update_share_count()

    shares: () =>
        @db.select({table : 'shares'})

    update_share_count: () =>
        n = @shares().length
        @element.find(".salvus-course-share-count").text("(#{n})")
        if n == 0
            @element.find(".salvus-course-shares-none").show()
            @element.find(".salvus-course-shares-add").focus()
        else
            @element.find(".salvus-course-shares-none").hide()



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





