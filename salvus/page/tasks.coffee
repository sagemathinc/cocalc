{defaults, required} = require('misc')

{salvus_client} = require('salvus_client')

misc_page = require('misc_page')

templates = $(".salvus-tasks-templates")
task_template = templates.find(".salvus-project-task")

class exports.Tasks
    constructor: (opts) ->
        opts = defaults opts,
            project_page   : required
        @project_page  = opts.project_page
        @project_id = opts.project_page.project.project_id
        @element = templates.find(".salvus-project-tasks").clone().show()
        @displayed_task_list = @element.find(".salvus-project-tasks-list")
        @init_new_task()
        @tasks = []

    onshow: () =>
        # to do
        ###
        task = task_template.clone().find(".salvus-project-task-title").text("sample task")
        @element.append(task)
        ###

    create_new_task: (opts) =>
        opts = defaults opts,
            task : required
            cb   : undefined
        @tasks.unshift(opts.task)
        @render_task(opts.task)
        salvus_client.create_new_task
            owner : @project_id
            task  : opts.task
            cb    : (err, task_id) =>
                if err
                    opts.cb?(err)
                else
                    opts.task.task_id = task_id
                    opts.cb?()

    render_task: (task) =>
        t = task_template.clone()
        t.find(".salvus-project-task-title").text(task.title)
        @displayed_task_list.prepend(t)

    init_new_task: () =>
        new_task_input = @element.find(".salvus-project-tasks-new")
        new_task_input.keydown (evt) =>
            if misc_page.is_enter(evt)
                @create_new_task
                    task : {title:new_task_input.val()}
                new_task_input.val('')
                return false
            else if misc_page.is_escape(evt)
                new_task_input.val('')
                return false
            return true

