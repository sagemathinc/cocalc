async = require('async')

marked = require('marked')

misc = require('misc')
{defaults, required, to_json, uuid} = misc


{salvus_client}   = require('salvus_client')
{alert_message}   = require('alerts')
{synchronized_db} = require('syncdb')

misc_page = require('misc_page')

templates = $(".salvus-tasks-templates")

task_template = templates.find(".salvus-task")
edit_task_template = templates.find(".salvus-task-editor")

exports.task_list = (project_id, filename) ->
    element = templates.find(".salvus-tasks-editor").clone()
    new TaskList(project_id, filename, element)
    return element

class TaskList
    constructor : (@project_id, @filename, @element) ->
        @element.data('task_list', @)
        @element.find("a").tooltip(delay:{ show: 500, hide: 100 })
        @elt_task_list = @element.find(".salvus-tasks-list")
        @showing_deleted = false
        @tasks = []
        @init_create_task()
        @init_showing_done()
        @init_showing_deleted()
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

    local_storage: (key, value) =>
        {local_storage}   = require('editor')
        return local_storage(@project_id, @filename, key, value)

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
        for x in misc.split(@element.find(".salvus-tasks-search").val().toLowerCase())
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
            if not @showing_deleted and task.deleted
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
            task_id = @local_storage("current_task")
            if task_id?
                current_task = @get_task_by_id(task_id)
            if not current_task?
                current_task = first_task
            @set_current_task(current_task)

        @elt_task_list.sortable
            containment : @elt_task_list
            handle      : ".salvus-task-reorder-handle"
            update      : (event, ui) =>
                e    = ui.item
                task = e.data('task')
                @set_current_task(task)
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

    get_task_by_id: (task_id) =>
        for t in @tasks
            if t.task_id == task_id
                return t

    render_task: (task, top) =>
        t = task_template.clone()
        if top
            @elt_task_list.prepend(t)
        else
            @elt_task_list.append(t)
        task.element = t
        t.click () => @set_current_task(task)
        t.find(".salvus-task-title").click () => @edit_task(task)
        t.find(".salvus-task-viewer-not-done").click () =>
            @mark_task_done(task, true)
        t.find(".salvus-task-viewer-done").click () =>
            @mark_task_done(task, false)
        if task.done
            t.find(".salvus-task-viewer-done").show()
            t.find(".salvus-task-viewer-not-done").hide()
            t.addClass("salvus-task-done")
        if @current_task? and task.task_id == @current_task.task_id
            @set_current_task(task)

        active = t.find(".salvus-task-active-toggle").click(() =>@toggle_actively_working_on_task(task))
        if task.active
            active.toggleClass("hide")

        t.find(".salvus-task-toggle-icon").click () =>
            t.find(".salvus-task-toggle-icon").toggleClass('hide')
            @display_title(task)

        if @local_storage("toggle-#{task.task_id}")
            t.find(".salvus-task-toggle-icon").toggleClass('hide')

        t.find(".salvus-task-to-top-icon").click () =>
            @save_task_position(task, @tasks[0].position-1)
            @display_title(task)

        t.find(".salvus-task-to-bottom-icon").click () =>
            if task.done
                # put at very bottom
                p = @tasks[@tasks.length-1].position + 1
            else
                # put after last not done task
                i = @tasks.length - 1
                while i >= 0
                    if not @tasks[i].done
                        if i == @tasks.length - 1
                            p = @tasks[i].position + 1
                        else
                            p = (@tasks[i].position + @tasks[i+1].position)/2
                        break
                    i -= 1
            @save_task_position(task, p)
            @display_title(task)

        d = t.find(".salvus-task-delete").click () =>
            @delete_task(task, not d.hasClass('salvus-task-deleted'))
        if task.deleted
            d.addClass('salvus-task-deleted')

        t.data('task',task)
        @display_last_edited(task)
        @display_title(task)

    toggle_actively_working_on_task: (task, active) =>
        inactive_icon = task.element.find(".salvus-task-active-inactive-icon")
        is_active = inactive_icon.is(":hidden")

        if not active?
            # toggle whatever it is
            active = not is_active

        if active != is_active
            task.element.find(".salvus-task-active-toggle").toggle('hide')

        task.active = active
        @db.update
            set   : {active  : active}
            where : {task_id : task.task_id}

    display_last_edited : (task) =>
        if task.last_edited
            task.element.find(".salvus-task-last-edited").attr('title',(new Date(task.last_edited)).toISOString()).timeago()

    display_title: (task) =>
        title = $.trim(task.title)
        i = title.indexOf('\n')
        if i != -1
            if task.element.find(".fa-chevron-down").hasClass("hide")
                @local_storage("toggle-#{task.task_id}",false)
                title = title.slice(0,i)
            else
                @local_storage("toggle-#{task.task_id}",true)
        else
            task.element.find(".fa-chevron-right").hide()
        if title.length == 0
            title = "No title" # so it is possible to edit
        task.element.find(".salvus-task-title").html(marked(title)).mathjax().find('a').attr("target","_blank")

    set_current_task: (task) =>
        if @current_task?
            @current_task.element.removeClass("salvus-current-task")
        @current_task = task
        task.element.addClass("salvus-current-task")
        @local_storage("current_task", task.task_id)

    edit_task: (task) =>
        e = task.element
        elt_title = e.find(".salvus-task-title")
        elt = edit_task_template.clone()
        elt_title.after(elt)
        elt_title.hide()

        stop_editing = () =>
            try
                cm.toTextArea()
            catch
                # TODO: this raises an exception...
            task.last_edited = (new Date()) - 0
            @display_last_edited(task)
            elt.remove()
            elt_title.show()

        save_task = () =>
            title = cm.getValue()
            stop_editing()
            if title != task.title
                orig_title = task.title
                task.title = title
                @display_title(task)
                @db.update
                    set   : {title  : title}
                    where : {task_id : task.task_id}

        editor_settings = require('account').account_settings.settings.editor_settings
        opts =
            mode           : 'markdown'
            lineNumbers    : false
            theme          : editor_settings.theme
            viewportMargin : Infinity
            extraKeys      :
                "Enter"       : "newlineAndIndentContinueMarkdownList"
                "Shift-Enter" : save_task
        if editor_settings.bindings != "standard"
            opts.keyMap = editor_settings.bindings

        cm = CodeMirror.fromTextArea(elt.find(".salvus-tasks-title-edit")[0], opts)
        cm.setValue(task.title)
        $(cm.getWrapperElement()).addClass('salvus-new-task-cm-editor').addClass('salvus-new-task-cm-editor-focus')
        $(cm.getScrollerElement()).addClass('salvus-new-task-cm-scroll')
        cm.on 'blur', save_task
        cm.focus()
        cm.save = save_task

    set_done: (task, done) =>
        if done
            task.element.find(".salvus-task-viewer-not-done").hide()
            task.element.find(".salvus-task-viewer-done").show()
        else
            task.element.find(".salvus-task-viewer-not-done").show()
            task.element.find(".salvus-task-viewer-done").hide()

    delete_task: (task, deleted) =>
        @db.update
            set   : {deleted : deleted}
            where : {task_id : task.task_id}
        task.deleted = deleted
        if deleted and not @showing_deleted
            task.element.remove()

    mark_task_done: (task, done) =>
        task.element.stop().animate(opacity:'100')
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
            task.element.fadeOut 3000, () =>
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

        editor_settings = require('account').account_settings.settings.editor_settings
        opts =
            mode        : 'markdown'
            lineNumbers : false
            theme       : editor_settings.theme
            viewportMargin: Infinity
            extraKeys   :
                "Enter": "newlineAndIndentContinueMarkdownList"
                "Shift-Enter" : @create_task
        if editor_settings.bindings != "standard"
            opts.keyMap = editor_settings.bindings

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

    set_showing_done: (showing) =>
        @showing_done = showing
        @local_storage("showing_done", @showing_done)
        is_showing = @element.find(".salvus-task-search-not-done").hasClass('hide')
        if is_showing != showing
            @element.find(".salvus-task-search-done-icon").toggleClass('hide')
            @render_task_list()

    init_showing_done: () =>
        @showing_done = @local_storage("showing_done")
        @set_showing_done(@showing_done)
        @element.find(".salvus-task-search-not-done").click(=> @set_showing_done(true))
        @element.find(".salvus-task-search-done").click(=> @set_showing_done(false))



    set_showing_deleted: (showing) =>
        @showing_deleted = showing
        @local_storage("showing_deleted", @showing_deleted)
        is_showing = @element.find(".salvus-task-search-not-deleted").hasClass('hide')
        if is_showing != showing
            @element.find(".salvus-task-search-deleted-icon").toggleClass('hide')
            @render_task_list()
        if showing
            @element.find(".salvus-task-empty-trash").show()
        else
            @element.find(".salvus-task-empty-trash").hide()


    init_showing_deleted: () =>
        @showing_deleted = @local_storage("showing_deleted")
        @set_showing_deleted(@showing_deleted)
        @element.find(".salvus-task-search-not-deleted").click(=> @set_showing_deleted(true))
        @element.find(".salvus-task-search-deleted").click(=> @set_showing_deleted(false))
        @element.find(".salvus-task-empty-trash").click(@empty_trash)

    empty_trash: () =>
        bootbox.confirm "<h1><i class='fa fa-trash-o pull-right'></i></h1> <h4>Permanently erase the deleted items?</h4><br> <span class='lighten'>Old versions of this list are available as snapshots.</span>  ", (result) =>
            if result == true
                @db.delete
                    where : {deleted : true}
                @tasks = (x for x in @tasks when not x.deleted)
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



