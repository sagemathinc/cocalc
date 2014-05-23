
# tasks makes use of future timestamps (for due date)
jQuery.timeago.settings.allowFuture = true

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
hashtag_button_template = templates.find(".salvus-tasks-hashtag-button")

exports.task_list = (project_id, filename) ->
    element = templates.find(".salvus-tasks-editor").clone()
    new TaskList(project_id, filename, element)
    return element

HEADINGS = ['custom', 'description', 'due', 'last-edited']
HEADING_MAP = {custom:'position', description:'title', due:'due_date', 'last-edited':'last_edited'}

class TaskList
    constructor : (@project_id, @filename, @element) ->
        @element.data('task_list', @)
        #@element.find("a").tooltip(delay:{ show: 500, hide: 100 })
        @element.find(".salvus-tasks-filename").text(misc.path_split(@filename).tail)
        @elt_task_list = @element.find(".salvus-tasks-listing")
        @showing_deleted = false
        @tasks = []
        @sort_order = {heading:'custom', dir:'desc'}  # asc or desc
        @init_create_task()
        @init_showing_done()
        @init_showing_deleted()
        @init_search()
        @init_sort()
        @init_save()
        synchronized_db
            project_id : @project_id
            filename   : @filename
            cb         : (err, db) =>
                if err
                    # TODO -- so what? -- need to close window, etc.... Also this should be a modal dialog
                    alert_message(type:"error", message:"unable to open #{@filename}")
                else
                    @db = db
                    @readonly = @db.readonly
                    if @readonly
                        @save_button.text("Readonly")
                        @element.find("a[href=#create-task]").remove()
                    @tasks = @db.select()
                    @render_task_list()
                    @set_clean()
                    @db.on 'change', (changes) =>
                        @set_dirty()
                        @tasks = @db.select()
                        @render_task_list()

    destroy: () =>
        @element.removeData()

    local_storage: (key, value) =>
        {local_storage}   = require('editor')
        return local_storage(@project_id, @filename, key, value)

    sort_task_list: () =>
        h = @sort_order.heading
        field = HEADING_MAP[h]
        f = (task1, task2) =>
            t1 = task1[field]
            t2 = task2[field]
            if field == 'due_date'
                if not t1?
                    t1 = 99999999999999999999
                if not t2?
                    t2 = 99999999999999999999
            if typeof t1 == "string" and typeof t2 == "string"  # TODO: should have a simple ascii field in task object with markdown and case removed.
                t1 = t1.toLowerCase()
                t2 = t2.toLowerCase()
            if t1 < t2
                return -1
            else if t1 > t2
                return 1
            else
                if h != 'custom'
                    if task1.position < task2.position
                        return -1
                    else if task1.position > task2.position
                        return 1
                if task1.uuid < task2.uuid
                    return -1
                else if task1.uuid > task2.uuid
                    return 1
                else
                    return 0
        @tasks.sort(f)
        if h == 'last-edited'
            @tasks.reverse()
        if @sort_order.dir == 'asc'
            @tasks.reverse()

    selected_hashtags: () =>
        return ($(b).text() for b in @element.find(".salvus-tasks-hashtag-bar").find('.btn-inverse'))

    render_hashtag_bar: () =>
        @parse_hashtags()
        bar = @element.find(".salvus-tasks-hashtag-bar")
        bar.empty()
        if @hashtags.length == 0
            bar.hide()
            return

        toggle_hashtag_button = (button) =>
            tag = button.text()
            if button.hasClass('btn-info')
                button.removeClass('btn-info').addClass('btn-inverse')
                @local_storage("hashtag-#{tag}", true)
            else
                button.removeClass('btn-inverse').addClass('btn-info')
                @local_storage("hashtag-#{tag}", false)

        click_hashtag = (event) =>
            button = $(event.delegateTarget)
            toggle_hashtag_button(button)
            @render_task_list()
            return false

        tags = misc.keys(@hashtags)
        tags.sort()
        for tag in tags
            button = hashtag_button_template.clone()
            button.text("#"+tag)
            button.click(click_hashtag)
            bar.append(button)
            if @local_storage("hashtag-##{tag}")
                toggle_hashtag_button(button)
        bar.show()

    parse_hashtags: () =>
        @hashtags = {}
        for task in @tasks
            if task.done and not @showing_done
                continue
            if task.deleted and not @showing_deleted
                continue
            t = task.title
            if not t?
                continue
            while true
                i = t.indexOf('#')
                if i == -1 or i == t.length-1 or t[i+1] == '#'
                    break
                if not (i == 0 or t[i-1].match(/\s/))
                    t = t.slice(i+1)
                    continue
                t = t.slice(i+1)
                # find next whitespace
                i = t.match(/\s/)
                if i
                    i = i.index
                else
                    i = -1
                if i == 0
                    # hash followed immediately by whitespace -- markdown title
                    t = t.slice(i+1)
                else
                    # a hash tag
                    if i == -1
                        # to the end
                        @hashtags[t.toLowerCase()] = true
                        break
                    else
                        @hashtags[t.slice(0, i).toLowerCase()] = true
                        t = t.slice(i+1)

    render_task_list: () =>
        search = @selected_hashtags()
        for x in misc.split(@element.find(".salvus-tasks-search").val().toLowerCase())
            x = $.trim(x)
            if x.length > 0
                search.push(x)
        search_describe = @element.find(".salvus-tasks-search-describe")
        search_describe.find("span").hide()
        if search.length > 0
            search_describe.find(".salvus-tasks-search-contain").show()
            search_describe.find(".salvus-tasks-search-query").show().text(search.join(' '))
        if @showing_done
            search_describe.find(".salvus-tasks-search-showing-done").show()
        if @showing_deleted
            search_describe.find(".salvus-tasks-search-showing-deleted").show()

        @elt_task_list.empty()
        @sort_task_list()

        first_task = undefined
        count = 0
        @_visible_tasks = []
        for task in @tasks
            if !!task.done != @showing_done
                continue
            if !!task.deleted != @showing_deleted
                continue
            skip = false
            if task.title?
                t = task.title.toLowerCase()
                for s in search
                    if t.indexOf(s) == -1
                        skip = true
                        continue
            if not skip
                @_visible_tasks.push(task)
                @render_task(task)
                count += 1
                if not first_task?
                    first_task = task

        @render_hashtag_bar()

        if count != 1
            count = "#{count} tasks"
        else
            count = "#{count} task"
        search_describe.find(".salvus-tasks-count").text(count).show()

        if @readonly
            return

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
                @custom_sort_order()
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
        @set_dirty()

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

        if task.done
            t.find(".salvus-task-viewer-done").show()
            t.find(".salvus-task-viewer-not-done").hide()
            t.addClass("salvus-task-done")

        if @current_task? and task.task_id == @current_task.task_id
            @set_current_task(task)

        if task.active?
            @display_actively_working_on_task(task, task.active)

        if @local_storage("toggle-#{task.task_id}")
            t.find(".salvus-task-toggle-icon").toggleClass('hide')

        if task.due_date?
            @display_due_date(task)

        if task.deleted
            t.find(".salvus-task-delete").addClass('salvus-task-deleted')

        t.data('task',task)
        @display_last_edited(task)
        @display_title(task)

        if @readonly
            return

        # Install all click handlers -- TODO: we will
        # redo this with a single more intelligent handler, for much greater
        # efficiency, like with file listing.
        t.click () => @set_current_task(task)
        t.find(".salvus-task-title").click () =>
            @edit_title(task)
        t.find(".salvus-task-viewer-not-done").click () =>
            @mark_task_done(task, true)
        t.find(".salvus-task-viewer-done").click () =>
            @mark_task_done(task, false)
        t.find(".salvus-task-active-button").click (event) =>
            @set_actively_working_on_task(task, not task.active)
            event.preventDefault()
        t.find(".salvus-task-toggle-icon").click () =>
            t.find(".salvus-task-toggle-icon").toggleClass('hide')
            @display_title(task)
        t.find(".salvus-task-to-top-icon").click () =>
            @custom_sort_order()
            @save_task_position(task, @tasks[0].position-1)
            @display_title(task)
        t.find(".salvus-task-due").click (event) =>
            @edit_due_date(task)
            event.preventDefault()
        t.find(".salvus-task-due-clear").click (event) =>
            @remove_due_date(task)
            event.preventDefault()
        t.find(".salvus-task-to-bottom-icon").click () =>
            @custom_sort_order()
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
        t.find(".salvus-task-delete").click () =>
            @delete_task(task, not d.hasClass('salvus-task-deleted'))

    set_actively_working_on_task: (task, active) =>
        active = !!active
        if task.active != active
            @display_actively_working_on_task(task, active)
            task.last_edited = (new Date()) - 0
            @display_last_edited(task)
            @db.update
                set   : {active  : active, last_edited : task.last_edited}
                where : {task_id : task.task_id}
            @set_dirty()

    display_actively_working_on_task: (task, active) =>
        active = !!active
        icon = task.element.find(".salvus-task-icon-active")
        is_active = icon.hasClass("salvus-task-icon-active-is_active")

        if active != is_active
            # change state in UI.
            if active
                task.element.addClass('salvus-task-is_active')
            else
                task.element.removeClass('salvus-task-is_active')
            icon.toggleClass('salvus-task-icon-active-is_active')
            task.element.find(".salvus-task-active").toggleClass('hide')

    display_last_edited : (task) =>
        if task.last_edited
            task.element.find(".salvus-task-last-edited").attr('title',(new Date(task.last_edited)).toISOString()).timeago()

    display_due_date: (task) =>
        e = task.element.find(".salvus-task-due")
        if task.due_date
            d = new Date(0)   # see http://stackoverflow.com/questions/4631928/convert-utc-epoch-to-local-date-with-javascript
            d.setUTCMilliseconds(task.due_date)
            e.attr('title',d.toISOString()).timeago()
            if d < new Date()
                e.addClass("salvus-task-overdue")
        else
            e.timeago('dispose').text("no deadline")

    display_title: (task) =>
        title = $.trim(task.title)
        i = title.indexOf('\n')
        if i != -1
            if task.element.find(".fa-caret-down").hasClass("hide")
                @local_storage("toggle-#{task.task_id}",true)
                title = title.slice(0,i)
            else
                @local_storage("toggle-#{task.task_id}",false)
        else
            task.element.find(".fa-caret-down").hide()
        if title.length == 0
            title = "No title" # so it is possible to edit
        task.element.find(".salvus-task-title").html(marked(title)).mathjax().find('a').attr("target","_blank")

    set_current_task: (task) =>
        if @current_task?.element?
            @current_task.element.removeClass("salvus-current-task")
        @current_task = task
        @local_storage("current_task", task.task_id)
        if task.element?  # if it is actually being displayed
            task.element.addClass("salvus-current-task")

    edit_title: (task) =>
        @set_current_task(task)
        e = task.element
        elt_title = e.find(".salvus-task-title")
        elt = edit_task_template.find(".salvus-tasks-title-edit").clone()
        elt_title.after(elt)
        elt_title.hide()

        stop_editing = () =>
            try
                cm.toTextArea()
            catch
                # TODO: this raises an exception...
            elt.remove()
            elt_title.show()

        save_task = () =>
            title = cm.getValue()
            stop_editing()
            if title != task.title
                orig_title = task.title
                task.title = title
                task.last_edited = (new Date()) - 0
                @display_last_edited(task)
                @display_title(task)
                @db.update
                    set   : {title  : title, last_edited : task.last_edited}
                    where : {task_id : task.task_id}
                @set_dirty()

        editor_settings = require('account').account_settings.settings.editor_settings
        opts =
            mode           : 'markdown'
            lineNumbers    : false
            theme          : editor_settings.theme
            lineWrapping   : editor_settings.line_wrapping
            matchBrackets  : editor_settings.match_brackets
            indentUnit     : editor_settings.indent_unit
            styleActiveLine: 15
            tabSize        : editor_settings.tab_size
            viewportMargin : Infinity
            extraKeys      :
                "Enter"       : "newlineAndIndentContinueMarkdownList"
                "Shift-Enter" : save_task
        if editor_settings.bindings != "standard"
            opts.keyMap = editor_settings.bindings

        cm = CodeMirror.fromTextArea(elt[0], opts)
        if not task.title?
            task.title = ''
        cm.setValue(task.title)
        $(cm.getWrapperElement()).addClass('salvus-new-task-cm-editor').addClass('salvus-new-task-cm-editor-focus')
        $(cm.getScrollerElement()).addClass('salvus-new-task-cm-scroll')
        cm.on 'blur', save_task
        cm.focus()
        cm.save = save_task

    edit_due_date: (task) =>
        @set_current_task(task)
        e = task.element
        elt_due = e.find(".salvus-task-due")
        elt = edit_task_template.find(".salvus-tasks-due-edit").clone()
        e.find(".salvus-task-title").before(elt)
        # TODO: this should somehow adjust to use locale, right?!
        elt.datetimepicker
            language         : 'en'
            pick12HourFormat : true
            pickSeconds      : false
            startDate        : new Date()
        # some hacks to make it look right for us:
        # make calendar pop up
        elt.find(".icon-calendar").click()
        # get rid of text input
        elt.hide()
        # get rid of ugly little icon
        $(".bootstrap-datetimepicker-widget:visible").find(".icon-time").addClass('fa').addClass('fa-clock-o').css
            'font-size' : '16pt'
            'background': 'white'

        picker = elt.data('datetimepicker')
        if task.due_date?
            picker.setLocalDate(new Date(task.due_date))
        else
            picker.setLocalDate(new Date())
        elt.on 'changeDate', (e) =>
            task.due_date = e.localDate - 0
            @display_due_date(task)
        # This is truly horrendous - but I just wanted to get this particular
        # date picker to work.  This can easily be slotted out with something better later.
        f = () =>
            if $("div.bootstrap-datetimepicker-widget:visible").length == 0
                clearInterval(interval)
                picker.destroy()
                elt.remove()
                @set_due_date(task, task.due_date)
        interval = setInterval(f, 300)

    remove_due_date: (task) =>
        @set_due_date(task, undefined)
        @display_due_date(task)

    set_due_date: (task, due_date) =>
        task.due_date = due_date
        @db.update
            set   : {due_date : due_date}
            where : {task_id : task.task_id}
        @set_dirty()

    set_done: (task, done) =>
        if done
            task.element.find(".salvus-task-viewer-not-done").hide()
            task.element.find(".salvus-task-viewer-done").show()
        else
            task.element.find(".salvus-task-viewer-not-done").show()
            task.element.find(".salvus-task-viewer-done").hide()

    delete_task: (task, deleted) =>
        task.element.stop().animate(opacity:'100')
        f = () =>
            @db.update
                set   : {deleted : deleted}
                where : {task_id : task.task_id}
            task.deleted = deleted
            @set_dirty()

        e = task.element.find(".salvus-task-delete")
        if deleted
            e.addClass('salvus-task-deleted')
        else
            e.removeClass('salvus-task-deleted')
        if deleted and not @showing_deleted
            task.element.fadeOut 500, () =>
                if e.hasClass('salvus-task-deleted')  # they could have canceled the action by clicking again
                    task.element?.remove()
                    f()
        else
            f()

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
            @set_actively_working_on_task(task, false)
            @set_dirty()
        if done and not @showing_done
            task.element.fadeOut 500, () =>
                if task.done  # they could have canceled the action by clicking again
                    task.element?.remove()
                    f()
        else
            f()

    clear_create_task: () =>
        @create_task_editor.setValue('')
        @element.find(".salvus-tasks-create-button").addClass('disabled')

    create_task: () =>
        if @readonly
            return
        p = 0
        for t in @tasks
            if t.position < p
                p = t.position
        position = p - 1

        task =
            title       : $.trim(@element.find(".salvus-tasks-search").val())
            position    : position
            last_edited : new Date() - 0

        @tasks.unshift(task)
        task_id = uuid()
        @db.update(set:task, where:{task_id : task_id})
        task.task_id = task_id
        @render_task(task, true)
        @edit_title(task)
        @set_dirty()

    init_create_task: () =>
        @element.find("a[href=#create-task]").click (event) =>
            @create_task()
            event.preventDefault()

    set_showing_done: (showing) =>
        @showing_done = showing
        @local_storage("showing_done", @showing_done)
        is_showing = @element.find(".salvus-task-search-not-done").hasClass('hide')
        if is_showing != showing
            @element.find(".salvus-task-search-done-icon").toggleClass('hide')
            @render_task_list()

    init_showing_done: () =>
        @showing_done = @local_storage("showing_done")
        if not @showing_done?
            @showing_done = false
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
        if not @showing_deleted?
            @showing_deleted = false
        @set_showing_deleted(@showing_deleted)
        @element.find(".salvus-task-search-not-deleted").click(=> @set_showing_deleted(true))
        @element.find(".salvus-task-search-deleted").click(=> @set_showing_deleted(false))
        if @readonly
            return
        @element.find(".salvus-task-empty-trash").click(@empty_trash)

    empty_trash: () =>
        if @readonly
            return
        bootbox.confirm "<h1><i class='fa fa-trash-o pull-right'></i></h1> <h4>Permanently erase the deleted items?</h4><br> <span class='lighten'>Old versions of this list are available as snapshots.</span>  ", (result) =>
            if result == true
                @db.delete
                    where : {deleted : true}
                @tasks = (x for x in @tasks when not x.deleted)
                @set_dirty()
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

    init_sort: () =>
        for s in HEADINGS
            @element.find(".salvus-task-sort-#{s}").on 'click', {s:s}, (event) =>
                @click_sort_by(event.data.s)
                event.preventDefault()
        @update_sort_order_display()

    update_sort_order_display: () =>
        heading = @element.find(".salvus-tasks-list-heading")
        # hide all sorting icons
        heading.find(".fa-sort-asc").hide()
        heading.find(".fa-sort-desc").hide()
        # show ours
        heading.find(".salvus-task-sort-#{@sort_order.heading}").find(".fa-sort-#{@sort_order.dir}").show()

    click_sort_by: (column) =>
        if @sort_order.heading == column
            if @sort_order.dir == 'asc'
                @sort_order.dir = 'desc'
            else
                @sort_order.dir = 'asc'
        else
            @sort_order.heading = column
            @sort_order.dir = 'desc'
        @update_sort_order_display()
        @render_task_list()

    custom_sort_order: () =>
        @sort_order = {heading:'custom', dir:'desc'}
        @update_sort_order_display()
        @sort_task_list()

    init_save: () =>
        @save_button = @element.find("a[href=#save]").click (event) =>
            @save()
            event.preventDefault()

    set_dirty: () =>
        @_new_changes = true
        if not @readonly
            @save_button.removeClass('disabled')

    set_clean: () =>
        @save_button.addClass('disabled')

    has_unsaved_changes: (val) =>
        if val
            @set_dirty()
        return not @save_button.hasClass('disabled')

    save: () =>
        if not @has_unsaved_changes() or @_saving
            return
        @_saving = true
        @_new_changes = false
        @db.save (err) =>
            @_saving = false
            if not err and not @_new_changes
                @set_clean()
            else
                if err
                    alert_message(type:"error", message:"unable to save #{@filename} -- #{to_json(err)}")

    show: () =>
        @element.find(".salvus-tasks-list").maxheight(offset:50)



