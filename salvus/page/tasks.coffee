async = require('async')

marked = require('marked')

{defaults, required, to_json} = require('misc')

{salvus_client} = require('salvus_client')

{alert_message} = require('alerts')


misc_page = require('misc_page')

templates = $(".salvus-tasks-templates")
task_template = templates.find(".salvus-task")
edit_title_template = templates.find(".salvus-tasks-title-edit")

class exports.Tasks
    constructor: (opts) ->
        opts = defaults opts,
            project_page   : required
        @project_page  = opts.project_page
        @project_id    = opts.project_page.project.project_id
        @task_list_id  = opts.project_page.project.task_list_id
        @element       = templates.find(".salvus-tasks").clone().show()
        @elt_task_list = @element.find(".salvus-tasks-list")
        @init_create_task()
        @last_edited = 0
        @init_showing_done()
        @update_task_list()
        @init_search()

    onshow: () =>
        @update_task_list (err, need_to_update) =>
            if err
                alert_message(type:"error", message:"error updating task list -- #{to_json(err)}")
            else
                if need_to_update
                    @render_task_list()

    update_task_list: (cb) =>  # cb(error, need_to_update)  -- if need_to_update is true that means the task list changed since last time updated
        # check to see if the task list has changed on the server side, and if so download and re-render it.
        # TODO: this will go away when the hub has a message queue and can send events when task list changes.

        if @_update_lock
            cb('already updating'); return

        @_update_lock = true
        need_to_update = undefined
        async.series([
            (cb) =>
                # create new task list if it doesn't exit
                if @task_list_id
                    cb(); return
                # create a new task list
                salvus_client.create_task_list
                    owners : [@project_id]
                    cb     : (err, task_list_id) =>
                        if err
                            cb(err)
                        else if not task_list_id
                            cb("BUG: no err but task_list_id not true")
                        else
                            # tell project about our new task list
                            @project_page.project.task_list_id = task_list_id
                            @task_list_id = task_list_id
                            salvus_client.set_project_task_list
                                project_id : @project_id
                                task_list_id : task_list_id
                                cb           : cb
            (cb) =>
                # check to see if the backend task list is newer than what is in the browser
                if @last_edited == 0
                    need_to_update = true
                    cb()
                    return
                salvus_client.get_task_list_last_edited
                    task_list_id : @task_list_id
                    project_id   : @project_id
                    cb           : (err, last_edited) =>
                        if err
                            cb(err)
                        else
                            need_to_update = (last_edited > @last_edited)
                            cb()
            (cb) =>
                # update if necessary
                if not need_to_update
                    cb(); return
                salvus_client.get_task_list
                    task_list_id : @task_list_id
                    project_id   : @project_id
                    include_deleted : false
                    cb           : (err, task_list) =>
                        if err
                            cb(err)
                        else
                            @task_list = task_list
                            cb()
        ], (err) =>
            @_update_lock = false
            cb?(err, need_to_update)
        )


    create_task: (opts) =>
        opts = defaults opts,
            title : required
            position : 0
            cb    : required
        salvus_client.create_task
            task_list_id : @task_list_id
            project_id   : @project_id
            title        : opts.title
            position     : opts.position
            cb           : opts.cb

    render_task_list: () =>
        search = []
        for x in @element.find(".salvus-tasks-search").val().toLowerCase().split()
            x = $.trim(x)
            if x.length > 0
                search.push(x)
        console.log(search.length)
        if search.length == 0
            @element.find(".salvus-tasks-search-describe").hide()
        else
            @element.find(".salvus-tasks-search-describe").show().find("span").text(search.join(' '))

        @elt_task_list.empty()
        for task in @task_list.tasks
            skip = false
            t = task.title.toLowerCase()
            for s in search
                if t.indexOf(s) == -1
                    skip = true
                    continue
            if not skip
                @render_task(task)
        if not @current_task and @task_list.tasks.length > 0
            @set_current_task(@task_list.tasks[0])
        @elt_task_list.sortable()

    render_task: (task) =>
        if not @showing_done and task.done
            return # nothing to do
        t = task_template.clone()
        @elt_task_list.append(t)
        task.element = t
        t.click () => @set_current_task(task)
        t.find(".salvus-task-title").click () => @edit_title(task)
        t.find(".salvus-task-viewer-not-done").click () => @mark_task_done(task, true)
        t.find(".salvus-task-viewer-done").click () => @mark_task_done(task, false)
        if task.done
            t.find(".salvus-task-viewer-done").show()
            t.find(".salvus-task-viewer-not-done").hide()
        if @current_task? and task.task_id == @current_task.task_id
            @set_current_task(task)
        @display_last_edited(task)
        @display_title(task)

    display_last_edited : (task) =>
        if task.last_edited
            task.element.find(".salvus-task-last-edited").attr('title',(new Date(task.last_edited)).toISOString()).timeago()

    display_title: (task) =>
        task.element.find(".salvus-task-title").html(marked(task.title)).mathjax().find('a').attr("target","_blank")

    set_current_task: (task) =>
        if @current_task?
            @current_task.element.removeClass("salvus-current-task")
        @current_task = task
        task.element.addClass("salvus-current-task")

    edit_title: (task) =>
        e = task.element
        elt_title = e.find(".salvus-task-title")
        elt = edit_title_template.clone()
        elt_title.after(elt)
        elt_title.hide()
        elt.val(task.title)
        elt.focus()
        elt.focusout () =>
            save_title()
        elt.keydown (evt) =>
            if evt.which is 13
                save_title()
                return false
            else if evt.which is 27
                stop_editing()
                return false
        stop_editing = () =>
            elt_title.show()
            elt.remove()
            task.last_edited = (new Date()) - 0
            @display_last_edited(task)

        save_title = () =>
            title = elt.val()
            stop_editing()
            if title != task.title
                orig_title = task.title
                task.title = title
                @display_title(task)
                salvus_client.edit_task
                    task_list_id : @task_list_id
                    task_id      : task.task_id
                    project_id   : @project_id
                    title        : title
                    cb           : (err) =>
                        if err
                            # TODO -- on error, change it back (?) or keep retrying?
                            task.title = orig_title
                            @display_title(task)
                            alert_message(type:"error", message:"Error changing title -- #{to_json(err)}")

    set_done: (task, done) =>
        if done
            task.element.find(".salvus-task-viewer-not-done").hide()
            task.element.find(".salvus-task-viewer-done").show()
        else
            task.element.find(".salvus-task-viewer-not-done").show()
            task.element.find(".salvus-task-viewer-done").hide()


    mark_task_done: (task, done) =>
        if task.done == done
            # nothing to do
            return
        @set_done(task, done)
        task.done = done
        salvus_client.edit_task
            task_list_id : @task_list_id
            task_id      : task.task_id
            project_id   : @project_id
            done         : done
            cb           : (err) =>
                if err
                    task.done = not done
                    alert_message(type:"error", message:"Error marking task done=#{done} -- #{to_json(err)}")
                    @set_done(task, not done)
                else
                    if done and not @showing_done
                        task.element.fadeOut(3000, task.element.remove)

    init_create_task: () =>
        create_task_input = @element.find(".salvus-tasks-new")
        create_task_input.keydown (evt) =>
            if misc_page.is_enter(evt)
                title = create_task_input.val()
                create_task_input.val('')
                position = 0  # TODO
                task = {title:title, position:position, last_edited:new Date() - 0}
                @task_list.tasks.push(task)
                t = @render_task(task)
                t.icon_spin(start:true, delay:500)
                @create_task
                    title : title
                    cb    : (err, task_id) =>
                        t.icon_spin(false)
                        if err
                            alert_message(type:"error", message:"error creating task -- #{err}")
                            # TODO: have to retry or remove task from list.
                        else
                            task.task_id = task_id
                return false
            else if misc_page.is_escape(evt)
                create_task_input.val('')
                return false
            return true

    init_showing_done: () =>
        @showing_done = false
        @element.find(".salvus-task-search-not-done").click () =>
            @showing_done = true
            @element.find(".salvus-task-search-done").show()
            @element.find(".salvus-task-search-not-done").hide()
            @render_task_list()
        @element.find(".salvus-task-search-done").click () =>
            @showing_done = false
            @element.find(".salvus-task-search-done").hide()
            @element.find(".salvus-task-search-not-done").show()
            @render_task_list()



    init_search: () =>
        @element.find(".salvus-tasks-search").keyup () =>
            @render_task_list()
