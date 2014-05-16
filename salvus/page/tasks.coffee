async = require('async')

marked = require('marked')

{defaults, required, to_json, uuid} = require('misc')

{salvus_client} = require('salvus_client')

{alert_message} = require('alerts')

{synchronized_db} = require('syncdb')

misc_page = require('misc_page')

templates = $(".salvus-tasks-templates")

task_template = templates.find(".salvus-task")
edit_title_template = templates.find(".salvus-tasks-title-edit")

exports.task_list = (project_id, filename) ->
    element = templates.find(".salvus-tasks-editor").clone()
    new TaskList(project_id, filename, element)
    return element

class TaskList
    constructor : (@project_id, @filename, @element) ->
        @element.data('task_list', @)
        @element.find("a").tooltip(delay:{ show: 500, hide: 100 })
        @elt_task_list = @element.find(".salvus-tasks-list")
        @tasks = []
        @init_create_task()
        @init_showing_done()
        @init_search()
        synchronized_db
            project_id : @project_id
            filename   : @filename
            cb         : (err, db) =>
                if err
                    # TODO -- so what? -- need to close window, etc.... Also this should be a modal dialog
                    alert_message(type:"error", message:"unable to open #{@filename}")
                else
                    @db = db
                    @tasks = @db.select()
                    @render_task_list()
                    @db.on 'change', () =>
                        # TODO: slow stupid way - could be much more precise
                        @tasks = @db.select()
                        @render_task_list()


    destroy: () =>
        @element.removeData()

    sort_task_list: () =>
        # TODO: define f in terms of various sort crition based on UI
        f = (task1, task2) =>
            if task1.position < task2.position
                return -1
            else if  task1.position > task2.position
                return 1
            else
                return 0
        @tasks.sort(f)

    render_task_list: () =>
        search = []
        for x in @element.find(".salvus-tasks-search").val().toLowerCase().split()
            x = $.trim(x)
            if x.length > 0
                search.push(x)
        if search.length == 0
            @element.find(".salvus-tasks-search-describe").hide()
        else
            @element.find(".salvus-tasks-search-describe").show().find("span").text(search.join(' '))

        @elt_task_list.empty()
        @sort_task_list()
        first_task = undefined
        for task in @tasks
            if not @showing_done and task.done
                continue
            skip = false
            t = task.title.toLowerCase()
            for s in search
                if t.indexOf(s) == -1
                    skip = true
                    continue
            if not skip
                @render_task(task)
                if not first_task?
                    first_task = task

        if not @current_task? and first_task?
            @set_current_task(first_task)

        @elt_task_list.sortable
            containment : @element
            update      : (event, ui) =>
                e    = ui.item
                task = e.data('task')
                # determine the previous and next tasks and their position numbers.
                prev = e.prev()
                next = e.next()
                # if no next or previous, this shouldn't get called (but definitely nothing to do)
                if prev.length == 0 and next.length == 0
                    return # nothing to do
                # if no previous, make our position the next position -1
                if prev.length == 0
                    @save_task_position(task, next.data('task').position - 1)
                # if no next, make our position the previous + 1
                else if next.length == 0
                    @save_task_position(task, prev.data('task').position + 1)
                # if they are the same pos (due to very rare conflict during async add, which can happen),
                # recompute and save all task positions
                else if  prev.data('task').position == next.data('task').position
                    i = 0
                    @sort_task_list()
                    for i in [0...@tasks.length]
                        @save_task_position(@tasks[i], i)
                    @save_task_position(task, (prev.data('task').position + next.data('task').position)/2)
                # now they are different: set our position to the average of adjacent positions.
                else
                    @save_task_position(task, (prev.data('task').position + next.data('task').position)/2)

    save_task_position: (task, position) =>
        task.position = position
        @db.update
            set   : {position : position}
            where : {task_id : task.task_id}

    render_task: (task, top) =>
        t = task_template.clone()
        if top
            @elt_task_list.prepend(t)
        else
            @elt_task_list.append(t)
        task.element = t
        t.click () => @set_current_task(task)
        t.find(".salvus-task-title").click () => @edit_title(task)
        t.find(".salvus-task-viewer-not-done").click () => @mark_task_done(task, true)
        t.find(".salvus-task-viewer-done").click () => @mark_task_done(task, false)
        if task.done
            t.find(".salvus-task-viewer-done").show()
            t.find(".salvus-task-viewer-not-done").hide()
            t.addClass("salvus-task-done")
        if @current_task? and task.task_id == @current_task.task_id
            @set_current_task(task)
        active = t.find(".salvus-task-current").click(() =>@toggle_actively_working_on_task(task))
        if task.active
            active.addClass("salvus-task-current-active")
        t.data('task',task)
        @display_last_edited(task)
        @display_title(task)

    toggle_actively_working_on_task: (task, active) =>
        e = task.element.find(".salvus-task-current")
        if not active?
            # toggle
            active = not e.hasClass("salvus-task-current-active")
        if active
            e.addClass("salvus-task-current-active")
        else
            e.removeClass("salvus-task-current-active")
        task.active = active
        @db.update
            set   : {active  : active}
            where : {task_id : task.task_id}

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
        e.css('max-height','400em')
        elt_title = e.find(".salvus-task-title")
        elt = edit_title_template.clone()
        elt_title.after(elt)
        elt_title.hide()
        elt.val(task.title)
        elt.focus()
        elt.focusout () =>
            save_title()
        elt.keydown (evt) =>
            if misc_page.is_shift_enter(evt) or misc_page.is_escape(evt)
                save_title()
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
                @db.update
                    set   : {title  : title}
                    where : {task_id : task.task_id}

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
        f = () =>
            @db.update
                set   : {done : done}
                where : {task_id : task.task_id}
            @toggle_actively_working_on_task(task, false)
        if done and not @showing_done
            task.element.fadeOut 10000, () =>
                if task.done  # they could have canceled the action by clicking again
                    task.element.remove()
                    f()
        else
            f()


    clear_create_task: () =>
        @create_task_editor.setValue('')
        @element.find(".salvus-tasks-create-button").addClass('disabled')

    create_task: () =>
        title = $.trim(@create_task_editor.getValue())
        @clear_create_task()
        if title.length == 0
            return

        if @tasks.length == 0
            position = 0
        else
            position = @tasks[0].position - 1

        task =
            title       : title
            position    : position
            last_edited : new Date() - 0

        @tasks.unshift(task)
        task_id = uuid()
        @db.update(set:task, where:{task_id : task_id})
        task.task_id = task_id
        @render_task(task, true)

    init_create_task: () =>
        create_task_input = @element.find(".salvus-tasks-new")

        opts =
            mode        : 'markdown',
            lineNumbers : false,
            theme       : "default",
            viewportMargin: Infinity
            extraKeys   :
                "Enter": "newlineAndIndentContinueMarkdownList"
                "Shift-Enter" : @create_task

        @create_task_editor = CodeMirror.fromTextArea(create_task_input[0], opts)
        $(@create_task_editor.getWrapperElement()).addClass('salvus-new-task-cm-editor')
        $(@create_task_editor.getScrollerElement()).addClass('salvus-new-task-cm-scroll')
        @task_create_buttons = @element.find(".salvus-tasks-create-button")
        @create_task_editor.on 'change', () =>
            if $.trim(@create_task_editor.getValue()).length > 0
                @task_create_buttons.removeClass('disabled')
            else
                @task_create_buttons.addClass('disabled')
        @create_task_editor.on 'focus', () =>
            $(@create_task_editor.getWrapperElement()).addClass('salvus-new-task-cm-editor-focus')
        @create_task_editor.on 'blur', () =>
            $(@create_task_editor.getWrapperElement()).removeClass('salvus-new-task-cm-editor-focus')

        @element.find(".salvus-tasks-create-button").click(@create_task)

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
        @element.find(".salvus-tasks-search-clear").click () =>
            e = @element.find(".salvus-tasks-search")
            a = $.trim(e.val())
            if a.length > 0
                e.val("")
                @render_task_list()

    show: () =>
        @elt_task_list.maxheight(offset:50)



