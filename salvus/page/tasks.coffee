{defaults, required} = require('misc')

{salvus_client} = require('salvus_client')

{alert_message} = require('alerts')


misc_page = require('misc_page')

templates = $(".salvus-tasks-templates")
task_template = templates.find(".salvus-project-task")

class exports.Tasks
    constructor: (opts) ->
        opts = defaults opts,
            project_page   : required
        @project_page  = opts.project_page
        @project_id    = opts.project_page.project.project_id
        @task_list_id  = opts.project_page.project.task_list_id
        @element       = templates.find(".salvus-project-tasks").clone().show()
        @elt_task_list = @element.find(".salvus-project-tasks-list")
        @init_create_task()
        @last_edited = 0
        @update_task_list()

    onshow: () =>
        @update_task_list (err, need_to_update) =>
            if err
                alert_message(type:"error", message:"error updating task list -- #{err}")
            else
                if need_to_update
                    @render_task_list()

        # to do
        ###
        task = task_template.clone().find(".salvus-project-task-title").text("sample task")
        @element.append(task)
        ###

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
                            opts.project_page.project.task_list_id = task_list_id
                            @task_list_id = task_list_id
                            salvus_client.set_project_task_list
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
                    included_deleted : false
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
            owner        : @project_id
            title        : opts.title
            position     : opts.position
            cb           : opts.cb

    render_task_list: () =>
        @elt_task_list.empty()
        for task in @task_list.tasks
            @render_task(task)

    render_task: (task) =>
        t = task_template.clone()
        t.find(".salvus-project-task-title").text(task.title)
        # TODO -- instead of append, should put in correct position, according to task.position
        @elt_task_list.append(t)
        return t

    init_create_task: () =>
        create_task_input = @element.find(".salvus-project-tasks-new")
        create_task_input.keydown (evt) =>
            if misc_page.is_enter(evt)
                title = create_task_input.val()
                create_task_input.val('')
                position = 0  # TODO
                task = {task_id:task_id, title:title, position:position}
                @task_list.tasks.append(task)
                t = @render_task(task)
                t.icon_spin(start:true, delay:500)
                @create_task
                    title : title
                    cb    : (err, task_id) =>
                        t.icon_spin(false)
                        if err
                            alert_message(type:"error", message:"error creating task -- #{err}")
                            # TODO: have to retry or remove task from list.
                return false
            else if misc_page.is_escape(evt)
                create_task_input.val('')
                return false
            return true

