{defaults, required} = require('misc')

templates = $(".salvus-tasks-templates")
task_template = templates.find(".salvus-project-task")

class exports.Tasks
    constructor: (opts) ->
        opts = defaults opts,
            project_page   : required
        @project_page  = opts.project_page
        @project_id = opts.project_page.project.project_id
        @element = templates.find(".salvus-project-tasks").clone().show()

    onshow: () =>
        console.log('onshow')
        task = task_template.clone().find(".salvus-project-task-title").text("sample task")
        @element.append(task)
