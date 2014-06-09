###
Task List

###

# tasks makes use of future timestamps (for due date)
jQuery.timeago.settings.allowFuture = true

async  = require('async')
marked = require('marked')
misc   = require('misc')
{defaults, required, to_json, uuid} = misc

{salvus_client}   = require('salvus_client')
{alert_message}   = require('alerts')
{synchronized_db} = require('syncdb')
{DiffSyncDoc}     = require('syncdoc')
{dmp}             = require('diffsync')     # diff-match-patch library

misc_page = require('misc_page')
templates = $(".salvus-tasks-templates")

task_template           = templates.find(".salvus-task")
edit_task_template      = templates.find(".salvus-task-editor")
hashtag_button_template = templates.find(".salvus-tasks-hashtag-button")

exports.task_list = (project_id, filename) ->
    element = templates.find(".salvus-tasks-editor").clone()
    new TaskList(project_id, filename, element)
    return element

HEADINGS    = ['custom', 'description', 'due', 'last-edited']
HEADING_MAP = {custom:'position', description:'desc', due:'due_date', 'last-edited':'last_edited'}

SPECIAL_PROPS = {element:true, changed:true, last_desc:true}

# disabled due to causing hangs -- I should just modify the gfm or markdown source code (?).
###
CodeMirror.defineMode "tasks", (config) ->
    # This is annoying, but I can't find a better way to do it for now --
    # basically it doesn't switch back until hitting a space, so is wrong if there is a newline at the end...
    # It seems regexp's are not supported.  Doing something magic with autocompletion would be nicer, but v2.
    options = [{open:'#', close:' ', mode:CodeMirror.getMode(config, 'text')}]
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "gfm"), options...)
###

#log = (x,y) -> console.log(x,y)
log = () ->

class TaskList
    constructor : (@project_id, @filename, @element) ->
        @element.data('task_list', @)
        #@element.find("a").tooltip(delay:{ show: 500, hide: 100 })
        @element.find(".salvus-tasks-filename").text(misc.path_split(@filename).tail)
        @elt_task_list = @element.find(".salvus-tasks-listing")
        @showing_deleted = false
        @tasks = {}
        @sort_order = {heading:'custom', dir:'desc'}  # asc or desc
        @init_create_task()
        @init_delete_task()
        @init_move_task_to_top()
        @init_move_task_to_bottom()
        @init_showing_done()
        @init_showing_deleted()
        @init_search()
        @init_sort()
        @init_save()
        @init_info()
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
                        @element.find(".salvus-tasks-action-buttons").remove()

                    @tasks = {}
                    for task in @db.select()
                        @tasks[task.task_id] = task

                    # ensure task_id's are unique (TODO: does it make sense for this code to be here instead of somewhere else?)
                    v = {}
                    badness = false
                    for task_id, t of @tasks
                        if not task_id?
                            @db.delete({task_id : undefined})
                            badness = true
                        else if v[t.task_id]?
                            @db.delete_one({task_id : t.task_id})
                            badness = true
                        else
                            v[t.task_id] = true

                    if badness
                        @tasks = {}
                        for task in @db.select()
                            @tasks[task.task_id] = task

                    @render_hashtag_bar()
                    @render_task_list()

                    @element.find(".salvus-tasks-loading").remove()
                    @set_clean()

                    @db.on 'change', (changes) =>
                        @set_dirty()
                        c = {}
                        for x in changes
                            if x.insert?.task_id?
                                c[x.insert.task_id] = true
                            else if x.remove?.task_id?
                                c[x.remove.task_id] = true
                        for task_id, _ of c
                            log("task changed: #{task_id}")
                            t = @db.select_one(task_id:task_id)
                            if not t?
                                # deleted
                                delete @tasks[task_id]
                            else
                                # changed
                                task = @tasks[task_id]
                                if not task?
                                    @tasks[task_id] = t
                                else
                                    # merge in properties from t (removing missing non-special ones)
                                    for k,v of task
                                        if not t[k]? and not SPECIAL_PROPS[k]?
                                            delete task[k]
                                    for k,v of t
                                        task[k] = v
                                    task.changed = true

                        @render_task_list()

    destroy: () =>
        @element.removeData()

    local_storage: (key, value) =>
        {local_storage}   = require('editor')
        return local_storage(@project_id, @filename, key, value)

    sort_visible_tasks: () =>
        h = @sort_order.heading
        field = HEADING_MAP[h]
        if @showing_done and field == 'due_date'
            field = 'done'
        f = (task1, task2) =>
            t1 = task1[field]
            t2 = task2[field]
            if field in ['due_date', 'done']
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
        @_visible_tasks.sort(f)
        if field in ['last_edited', 'done']
            @_visible_tasks.reverse()
        if @sort_order.dir == 'asc'
            @_visible_tasks.reverse()

    selected_hashtags: () =>
        return ($(b).text() for b in @element.find(".salvus-tasks-hashtag-bar").find('.btn-warning'))

    toggle_hashtag_button: (button) =>
        tag = button.text()
        if button.hasClass('btn-info')
            button.removeClass('btn-info').addClass('btn-warning')
            @local_storage("hashtag-#{tag}", true)
        else
            button.removeClass('btn-warning').addClass('btn-info')
            @local_storage("hashtag-#{tag}", false)

    render_hashtag_bar: () =>
        t0 = misc.walltime()
        @parse_hashtags()
        log('time to parse hashtags =', misc.walltime(t0))
        bar = @element.find(".salvus-tasks-hashtag-bar")
        bar.empty()
        if not @hashtags? or misc.len(@hashtags) == 0
            @element.find(".salvus-tasks-hashtags").hide()
            return
        else
            @element.find(".salvus-tasks-hashtags").show()

        click_hashtag = (event) =>
            button = $(event.delegateTarget)
            @toggle_hashtag_button(button)
            @render_task_list()
            return false

        tags = misc.keys(@hashtags)
        tags.sort()
        for tag in tags
            selected = @local_storage("hashtag-##{tag}")
            if not selected and @_visible_descs? and @_visible_descs.indexOf('#'+tag) == -1
                continue
            button = hashtag_button_template.clone()
            button.addClass("salvus-hashtag-#{tag}")
            button.text("#"+tag)
            button.click(click_hashtag)
            bar.append(button)
            if selected
                @toggle_hashtag_button(button)
        bar.show()
        log('time to parse hashtags =', misc.walltime(t0))

    parse_hashtags: () =>
        @hashtags = {}
        for _, task of @tasks
            if task.done and not @showing_done
                continue
            if task.deleted and not @showing_deleted
                continue
            for x in parse_hashtags(task.desc)
                @hashtags[task.desc.slice(x[0]+1, x[1]).toLowerCase()] = true

    render_task_list: () =>
        t0 = misc.walltime()

        # Determine the search criteria, which restricts what is visible
        search = @selected_hashtags()
        for x in misc.split(@element.find(".salvus-tasks-search").val().toLowerCase())
            x = $.trim(x)
            if x.length > 1
                search.push(x)

        # Fill in sentences describing the search, so user isn't confused by which tasks are visible.
        search_describe = @element.find(".salvus-tasks-search-describe")
        search_describe.find("span").hide()
        if search.length > 0
            search_describe.find(".salvus-tasks-search-contain").show()
            search_describe.find(".salvus-tasks-search-query").show().text(search.join(' '))
        if @showing_done
            search_describe.find(".salvus-tasks-search-showing-done").show()
        if @showing_deleted
            search_describe.find(".salvus-tasks-search-showing-deleted").show()

        # set current task from local storage, if it isn't set (and that task still exists)
        if not @current_task?
            task_id = @local_storage("current_task")
            if task_id?
                @set_current_task_by_id(task_id)

        log('time0', misc.walltime(t0))

        # Compute the list @_visible_tasks of tasks that are visible,
        # according to the search/hashtag/done/trash criteria.
        # Also, we make a big string that is the concatenation of the
        # desc fields of all visible tasks, so we know which hashtags to show.
        first_task = undefined
        count = 0
        last_visible_tasks = (t for t in @_visible_tasks) if @_visible_tasks?
        @_visible_tasks = []
        @_visible_descs = ''
        current_task_is_visible = false
        for _, task of @tasks
            if task.done and not @showing_done
                continue
            if task.deleted and not @showing_deleted
                continue
            skip = false
            if task.desc?
                if @current_task?.task_id == task.task_id and task.element?.hasClass('salvus-task-editing-desc')
                    # always include task that we are currently editing, irregardless of search
                    skip = false
                else
                    t = task.desc.toLowerCase()
                    for s in search
                        if t.indexOf(s) == -1
                            skip = true
                            continue
            else
                task.desc = ''
            if not skip
                @_visible_tasks.push(task)
                @_visible_descs += ' ' + task.desc.toLowerCase()
                if @current_task?.task_id == task.task_id
                    current_task_is_visible = true
                count += 1
                if not first_task?
                    first_task = task

        log('time1', misc.walltime(t0))

        # Draw the hashtags that should be visible.
        @render_hashtag_bar()

        log('time2', misc.walltime(t0))

        # Sort only the visible tasks in the list according to the currently selected sort order.
        @sort_visible_tasks()
        log('time3', misc.walltime(t0))

        # Make it so the DOM displays exactly the visible tasks in the correct order
        t1 = misc.walltime()

        changed = false
        if not last_visible_tasks?
            changed = true
        else
            if last_visible_tasks.length != @_visible_tasks.length
                changed = true
            else
                for i in [0...last_visible_tasks.length]
                    if last_visible_tasks[i].task_id != @_visible_tasks[i].task_id
                        changed = true
                        break

        for task in @_visible_tasks
            @render_task(task)

        if changed
            cm = @current_task?.element?.data('cm')
            focus_current = cm? and cm.hasFocus()
            # the ordered list of displayed tasks have changed in some way, so we pull them all out of the DOM
            # and put them back in correctly.
            @elt_task_list.children().detach()
            for task in @_visible_tasks
                @elt_task_list.append(task.element)
            if focus_current
                cm.focus()

        # ensure that all tasks are actually visible (not display:none, which happens on fading out)
        @elt_task_list.children().css('display','inherit')

        log("time to update DOM", misc.walltime(t1))
        log('time4', misc.walltime(t0))

        # remove any existing highlighting:
        @elt_task_list.find('.salvus-task-desc').unhighlight()
        if search.length > 0
            # Go through the DOM tree of tasks and highlight all the search terms
            @elt_task_list.find('.salvus-task-desc').highlight(search)
        log('time5 (highlight)', misc.walltime(t0))

        # Show number of displayed tasks in UI.
        if count != 1
            count = "#{count} tasks"
        else
            count = "#{count} task"
        search_describe.find(".salvus-tasks-count").text(count).show()

        if not current_task_is_visible and first_task?
            @current_task = first_task

        if @readonly
            # Task list is read only so there is nothing further to do -- in
            # particular, there's no need to make the task list sortable.
            #log('time', misc.walltime(t0))
            @elt_task_list.find(".salvus-task-reorder-handle").hide()
            return

        if @sort_order.heading != 'custom'
            try
                @elt_task_list.sortable( "destroy" )
            catch
                # if sortable never called get exception.
            @elt_task_list.find(".salvus-task-reorder-handle").hide()
            log('time', misc.walltime(t0))
            return

        @elt_task_list.find(".salvus-task-reorder-handle").show()

        @elt_task_list.sortable
            containment : @element
            handle      : ".salvus-task-reorder-handle"
            update      : (event, ui) =>
                e    = ui.item
                task = e.data('task')
                @set_current_task(task)
                # determine the previous and next tasks and their position numbers.
                prev = e.prev()
                next = e.next()
                if prev.length == 0 and next.length == 0
                    # if no next or previous, this shouldn't get called (but definitely nothing to do)
                    return # nothing to do
                if prev.length == 0
                    # if no previous, make our position the next position -1
                    @set_task_position(task, next.data('task').position - 1)
                else if next.length == 0
                    # if no next, make our position the previous + 1
                    @set_task_position(task, prev.data('task').position + 1)
                else if prev.data('task').position == next.data('task').position
                    # they are the same pos,
                    # TODO: need to jiggle stuff around -- the below will just be random.
                    @set_task_position(task, (prev.data('task').position + next.data('task').position)/2)
                else
                    # now they are different: set our position to the average of adjacent positions.
                    @set_task_position(task, (prev.data('task').position + next.data('task').position)/2)

        log('time', misc.walltime(t0))

    set_task_position: (task, position) =>
        task.position = position
        @db.update
            set   : {position : position}
            where : {task_id : task.task_id}
        @set_dirty()

    get_task_by_id: (task_id) =>
        return @tasks[task_id]

    render_task: (task) =>
        if not task.element?
            log("cloning task_template")
            task.element = task_template.clone()
            task.element.data('task', task)
            task.element.click(@click_on_task)
            if not @readonly
                task.element.find('.salvus-task-desc').click (e) =>
                    if $(e.target).prop("tagName") == 'A'  # clicking on link in task description shouldn't start editor
                        return
                    @edit_desc(task)
            task.changed = true

        t = task.element

        if t.hasClass('salvus-task-editing-desc')
            cm = t.data('cm')
            if cm?
                if task.changed
                    # if the description changed
                    if task.desc != task.last_desc
                        # compute patch and apply diff to live content
                        p = dmp.patch_make(task.last_desc, task.desc)
                        t.data('diff_sync').patch_in_place(p)

        if not task.changed
            # nothing changed, so nothing to update
            return

        @display_done(task)
        @display_due_date(task)
        @display_undelete(task)
        @display_last_edited(task)
        @display_desc(task)

        task.changed = false

        if @readonly
            return

    display_undelete: (task) =>
        if task.deleted
            task.element.find(".salvus-task-undelete").show()
        else
            task.element.find(".salvus-task-undelete").hide()

    click_on_task: (e) =>
        task = $(e.delegateTarget).closest(".salvus-task").data('task')
        target = $(e.target)
        log('click on ', e, $(e.delegateTarget), target)
        if target.hasClass("salvus-task-viewer-not-done")
            return false if @readonly
            @set_task_done(task, true)
        else if target.hasClass("salvus-task-viewer-done")
            return false if @readonly
            @set_task_done(task, false)
        else if target.hasClass("salvus-task-toggle-icon")
            is_down = @local_storage("toggle-#{task.task_id}")
            @local_storage("toggle-#{task.task_id}", not is_down)
            @display_desc(task)
        else if target.hasClass("salvus-task-due")
            return false if @readonly
            @edit_due_date(task)
            event.preventDefault()
        else if target.hasClass("salvus-task-due-clear")
            return false if @readonly
            @remove_due_date(task)
            event.preventDefault()
        else if target.hasClass("salvus-task-undelete")
            return false if @readonly
            @set_current_task(task)
            @delete_task(task, false)
        else
            @set_current_task(task)

    display_last_edited : (task) =>
        if task.last_edited
            a = $("<span>").attr('title',(new Date(task.last_edited)).toISOString()).timeago()
            task.element.find(".salvus-task-last-edited").empty().append(a)

    click_hashtag_in_desc: (event) =>
        tag = $(event.delegateTarget).text().slice(1).toLowerCase()
        @toggle_hashtag_button(@element.find(".salvus-hashtag-#{tag}"))
        @render_task_list()
        return false

    display_desc: (task) =>
        desc = task.desc
        m = desc.match(/^\s*[\r\n]/m)  # blank line
        i = m?.index
        if i?
            task.element.find(".salvus-task-toggle-icons").show()
            is_up = @local_storage("toggle-#{task.task_id}")
            if is_up?
                if is_up == task.element.find(".fa-caret-down").hasClass("hide")
                    task.element.find(".salvus-task-toggle-icon").toggleClass('hide')
                if task.element.find(".fa-caret-down").hasClass("hide")
                    desc = desc.slice(0,i)
            else
                if task.element.find(".fa-caret-down").hasClass("hide")
                    @local_storage("toggle-#{task.task_id}",false)
                    desc = desc.slice(0,i)
                else
                    @local_storage("toggle-#{task.task_id}",true)
        else
            task.element.find(".salvus-task-toggle-icons").hide()
        if desc.length == 0
            desc = "<span class='lighten'>Enter a description...</span>" # so it is possible to edit
        else
            v = parse_hashtags(desc)
            if v.length > 0
                # replace hashtags by something that renders nicely in markdown (instead of as descs)
                x0 = [0,0]
                desc0 = ''
                for x in v
                    desc0 += desc.slice(x0[1], x[0]) + '<span class="salvus-tasks-hash">' + desc.slice(x[0], x[1]) + '</span>'
                    x0 = x
                desc = desc0 + desc.slice(x0[1])
            desc = marked(desc)
        if task.deleted
            desc = "<del>#{desc}</del>"
        e = task.element.find(".salvus-task-desc")

        e.html(desc)
        if desc.indexOf('$') != -1 or desc.indexOf('\\') != -1
            # .mathjax() does the above optimization, but it first does e.html(), so is a slight waste -- most
            # items have no math, so this is worth it...
            e.mathjax()

        if desc.indexOf('[ ]') != -1 or desc.indexOf('[x]') != -1

            # Make [ ] or [x]'s magically work, like on github.

            e.highlight('[ ]', { className: 'salvus-task-checkbox-not-selected'})
            e.highlight('[x]', { className: 'salvus-task-checkbox-selected'})

            e.find(".salvus-task-checkbox-not-selected").replaceWith($('<i class="fa fa-square-o salvus-task-checkbox salvus-task-checkbox-not-selected"> </i>'))
            e.find(".salvus-task-checkbox-selected").replaceWith($('<i class="fa fa-check-square-o salvus-task-checkbox salvus-task-checkbox-selected"> </i>'))

            s = e.find(".salvus-task-checkbox-not-selected")
            i = -1
            for f in s
                i = task.desc.indexOf('[ ]', i+1)
                if i != -1
                    $(f).data("index", i)
            s = e.find(".salvus-task-checkbox-selected")
            i = -1
            for f in s
                i = task.desc.indexOf('[x]', i+1)
                if i != -1
                    $(f).data("index", i)

            e.find(".salvus-task-checkbox").click (event) =>
                t = $(event.delegateTarget)
                i = t.data('index')
                if i?
                    if t.hasClass('salvus-task-checkbox-selected')
                        task.desc = task.desc.slice(0,i) + '[ ]' + task.desc.slice(i+3)
                    else
                        task.desc = task.desc.slice(0,i) + '[x]' + task.desc.slice(i+3)
                    @db.update
                        set   : {desc  : task.desc, last_edited : new Date() - 0}
                        where : {task_id : task.task_id}
                    @set_dirty()
                    @set_current_task(task)
                @display_desc(task)
                return false

        e.find('a').attr("target","_blank")
        e.find("table").addClass('table')  # makes bootstrap tables look MUCH nicer -- and gfm has nice tables
        task.element.find(".salvus-tasks-hash").click(@click_hashtag_in_desc)

    set_current_task: (task) =>
        if not task?
            return
        if @current_task?.element?
            @current_task.element.removeClass("salvus-current-task")
        @current_task = task
        @local_storage("current_task", task.task_id)
        if task.element?  # if it is actually being displayed
            task.element.addClass("salvus-current-task")
            task.element.scrollintoview()

    get_task_visible_index: (task) =>
        if not task?
            return
        for i in [0...@_visible_tasks.length]
            if @_visible_tasks[i].task_id == task.task_id
                return i

    get_current_task_visible_index: () =>
        return @get_task_visible_index(@current_task)

    set_current_task_prev: () =>
        i = @get_current_task_visible_index()
        if i?
            i -= 1
            if i < 0
                i = 0
            @set_current_task(@_visible_tasks[i])

    set_current_task_next: () =>
        i = @get_current_task_visible_index()
        if i?
            i += 1
            if i >= @_visible_tasks.length
                i = @_visible_tasks.length - 1
            @set_current_task(@_visible_tasks[i])

    move_current_task_down: () =>
        i = @get_current_task_visible_index()
        if i < @_visible_tasks.length-1
            a = @_visible_tasks[i+1].position
            b = @_visible_tasks[i+2]?.position
            if not b?
                b = a + 1
            @current_task.position =  (a + b)/2
            @render_task_list()

    move_current_task_up: () =>
        i = @get_current_task_visible_index()
        if i > 0
            a = @_visible_tasks[i-2]?.position
            b = @_visible_tasks[i-1].position
            if not a?
                a = b - 1
            @current_task.position =  (a + b)/2
            @render_task_list()

    move_current_task_to_top: () =>
        if not @current_task?
            return
        i = @get_current_task_visible_index()
        if i > 0
            task = @current_task
            @set_current_task_prev()
            @set_task_position(task, @_visible_tasks[0].position-1)
            @render_task_list()

    move_current_task_to_bottom: () =>
        if not @current_task?
            return
        i = @get_current_task_visible_index()
        if i < @_visible_tasks.length-1
            task = @current_task
            @set_current_task_next()
            if task.done
                # put at very bottom
                p = @_visible_tasks[@_visible_tasks.length-1].position + 1
            else
                # put after last not done task
                i = @_visible_tasks.length - 1
                while i >= 0
                    if not @_visible_tasks[i].done
                        if i == @_visible_tasks.length - 1
                            p = @_visible_tasks[i].position + 1
                        else
                            p = (@_visible_tasks[i].position + @_visible_tasks[i+1].position)/2
                        break
                    i -= 1
            @set_task_position(task, p)
            @render_task_list()

    delete_current_task: () =>
        if @current_task?
            @delete_task(@current_task, true)

    edit_desc: (task) =>
        if not task?
            task = @current_task
        if not task?
            task = @_visible_tasks[0]
        if not task?
            return
        e = task.element
        if e.hasClass('salvus-task-editing-desc')
            return
        e.find(".salvus-task-toggle-icons").hide()
        e.addClass('salvus-task-editing-desc')
        elt_desc = e.find(".salvus-task-desc")
        @set_current_task(task)
        elt = e.find(".salvus-tasks-desc-edit")
        if elt.length > 0
            elt.show()
            cm = e.data('cm')
            cm.focus()
            e.addClass('salvus-task-editing-desc')
            # apply any changes
            p = dmp.patch_make(cm.getValue(), task.desc)
            e.data('diff_sync').patch_in_place(p)
            return

        elt = edit_task_template.find(".salvus-tasks-desc-edit").clone()
        elt_desc.before(elt)

        finished = false
        stop_editing = () =>
            finished = true
            e.removeClass('salvus-task-editing-desc')
            elt.hide()
            sync_desc()

        editor_settings = require('account').account_settings.settings.editor_settings
        extraKeys =
            "Enter"       : "newlineAndIndentContinueMarkdownList"
            "Shift-Enter" : stop_editing
            "Shift-Tab"   : (editor) -> editor.unindent_selection()
            #"F11"         : (editor) -> log('hi'); editor.setOption("fullScreen", not editor.getOption("fullScreen"))


        if editor_settings.bindings != 'vim'  # this escape binding below would be a major problem for vim!
            extraKeys["Esc"] = stop_editing

        opts =
            mode                : 'gfm'
            lineNumbers         : false
            theme               : editor_settings.theme
            lineWrapping        : editor_settings.line_wrapping
            matchBrackets       : editor_settings.match_brackets
            indentUnit          : editor_settings.indent_unit
            styleActiveLine     : 15
            tabSize             : editor_settings.tab_size
            showTrailingSpace   : editor_settings.show_trailing_whitespace
            viewportMargin      : Infinity
            extraKeys           : extraKeys

        if editor_settings.bindings != "standard"
            opts.keyMap = editor_settings.bindings

        cm = CodeMirror.fromTextArea(elt.find("textarea")[0], opts)
        e.data('cm',cm)
        if not task.desc?
            task.desc = ''
        cm.setValue(task.desc)
        e.data('diff_sync', new DiffSyncDoc(cm:cm, readonly:false))

        cm.clearHistory()  # ensure that the undo history doesn't start with "empty document"
        $(cm.getWrapperElement()).addClass('salvus-new-task-cm-editor').addClass('salvus-new-task-cm-editor-focus')
        $(cm.getScrollerElement()).addClass('salvus-new-task-cm-scroll')

        cm.focus()
        elt.find("a[href=#save]").tooltip(delay:{ show: 500, hide: 100 }).click (event) =>
            stop_editing()
            event.preventDefault()
        elt.find(".CodeMirror-hscrollbar").remove()
        elt.find(".CodeMirror-vscrollbar").remove()

        last_sync = undefined
        min_time = 1500

        sync_desc = () =>
            last_sync      = misc.mswalltime()
            desc           = cm.getValue()
            task.last_desc = desc  # the description before syncing.
            task.desc      = desc
            task.last_edited = (new Date()) - 0
            @db.update
                set   : {desc    : task.desc, last_edited : task.last_edited}
                where : {task_id : task.task_id}
            @set_dirty()

        timer = undefined
        cm.on 'change', () =>
            t = misc.mswalltime()
            if not last_sync?
                sync_desc()
            else
                if t - last_sync >= min_time
                    sync_desc()
                else
                    if not timer?
                        f = () ->
                            timer = undefined
                            if misc.mswalltime() - last_sync >= min_time
                                sync_desc()
                        timer = setTimeout(f, min_time - (t - last_sync))

    edit_due_date: (task) =>
        @set_current_task(task)
        e = task.element
        elt_due = e.find(".salvus-task-due")
        elt = edit_task_template.find(".salvus-tasks-due-edit").clone()
        e.find(".salvus-task-desc").before(elt)
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
        $(".bootstrap-datetimepicker-widget:visible").draggable().find(".icon-time").addClass('fa').addClass('fa-clock-o').css
            'font-size' : '16pt'
            'background': 'white'

        picker = elt.data('datetimepicker')
        if task.due_date?
            picker.setLocalDate(new Date(task.due_date))
        else
            picker.setLocalDate(new Date())
        elt.on 'changeDate', (e) =>
            @set_due_date(task, e.localDate - 0)
            @render_task(task)
        # This is truly horrendous - but I just wanted to get this particular
        # date picker to work.  This can easily be slotted out with something better later.
        f = () =>
            if $("div.bootstrap-datetimepicker-widget:visible").length == 0
                clearInterval(interval)
                picker.destroy()
                elt.remove()
        interval = setInterval(f, 300)

    remove_due_date: (task) =>
        @set_due_date(task, undefined)
        @display_due_date(task)

    set_due_date: (task, due_date) =>
        task.due_date = due_date
        @db.update
            set   : {due_date : due_date, last_edited : new Date() - 0}
            where : {task_id : task.task_id}
        @set_dirty()

    display_due_date: (task) =>
        e = task.element.find(".salvus-task-due")
        if e.text() != 'none'
            e.timeago('dispose').text("none")
            f = task_template.find(".salvus-task-due").clone()
            e.replaceWith(f)
            e = f
        if task.due_date
            task.element.find(".salvus-task-due-clear").show()
            d = new Date(0)   # see http://stackoverflow.com/questions/4631928/convert-utc-epoch-to-local-date-with-javascript
            d.setUTCMilliseconds(task.due_date)
            e.attr('title',d.toISOString()).timeago()
            if d < new Date()
                e.addClass("salvus-task-overdue")
        else
            task.element.find(".salvus-task-due-clear").hide()

    display_done: (task) =>
        if task.done
            task.element.find(".salvus-task-viewer-not-done").hide()
            task.element.find(".salvus-task-viewer-done").show()
            if typeof(task.done) == 'number'
                task.element.find(".salvus-task-done").show().find(
                    'span').attr('title',(new Date(task.done)).toISOString()).timeago()
            task.element.addClass("salvus-task-overall-done")
        else
            task.element.find(".salvus-task-viewer-not-done").show()
            task.element.find(".salvus-task-viewer-done").hide()
            task.element.find(".salvus-task-done").hide()
            task.element.removeClass("salvus-task-overall-done")

    delete_task: (task, deleted) =>
        task.element.stop().animate(opacity:'100')
        f = () =>
            @db.update
                set   : {deleted : deleted, last_edited : new Date() - 0}
                where : {task_id : task.task_id}
            task.deleted = deleted
            @set_dirty()

        if deleted and not @showing_deleted
            task.element.fadeOut () =>
                if not task.deleted # they could have canceled the action by clicking again
                    @set_current_task_next()
                    task.element?.remove()
                    f()
        else
            f()

    toggle_current_task_done: () =>
        if @current_task
            @set_task_done(@current_task, not @current_task.done)


    set_task_done: (task, done) =>
        task.element.stop().animate(opacity:'100')
        if not task.done and not done
            # nothing to do
            return
        if done
            task.done = (new Date()) - 0
        else
            task.done = 0
        @display_done(task)
        f = () =>
            @db.update
                set   : {done : task.done, last_edited : new Date() - 0}
                where : {task_id : task.task_id}
            @set_dirty()
        if done and not @showing_done
            task.element.fadeOut () =>
                if task.done  # they could have canceled the action by clicking again
                    @set_current_task_next()
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

        # we create the task after the current task
        p0 = @current_task?.position
        if p0?
            # set p1 to the smallest position that is bigger than the position of the current task
            p1 = undefined
            for _, t of @tasks
                if t.position > p0 and (not p1? or t.position < p1)
                    p1 = t.position
            if p1? and p1>p0
                position = (p0 + p1)/2
            else
                position = p0 + 1
        else
            # no current task, so just put new task at the very beginning
            p = 0
            for _, t of @tasks
                if t.position < p
                    p = t.position
            position = p - 1

        desc = @selected_hashtags().join(' ')
        if desc.length > 0
            desc += "\n"
        desc += @element.find(".salvus-tasks-search").val()
        task =
            desc       : $.trim(desc)
            position    : position
            last_edited : new Date() - 0

        task_id = uuid()
        @db.update
            set   : task
            where : {task_id : task_id}
        task.task_id = task_id
        @tasks[task_id] = task

        @render_task_list()
        @set_current_task(task)
        @edit_desc(task)
        @set_dirty()

    set_current_task_by_id: (task_id) =>
        @current_task = @get_task_by_id(task_id)

    init_create_task: () =>
        @element.find("a[href=#create-task]").click (event) =>
            @create_task()
            event.preventDefault()

        @element.find(".salvus-tasks-first").click (event) =>
            @create_task()
            event.preventDefault()

    init_delete_task: () =>
        @element.find("a[href=#delete-task]").click (event) =>
            @delete_current_task()
            event.preventDefault()

    init_move_task_to_top: () =>
        b = @element.find("a[href=#move-task-to-top]").click (event) =>
            if not b.hasClass('disabled')
                @move_current_task_to_top()
            event.preventDefault()

    init_move_task_to_bottom: () =>
        b = @element.find("a[href=#move-task-to-bottom]").click (event) =>
            if not b.hasClass('disabled')
                @move_current_task_to_bottom()
            event.preventDefault()

    set_showing_done: (showing) =>
        @showing_done = showing
        @local_storage("showing_done", @showing_done)
        is_showing = @element.find(".salvus-task-search-not-done").hasClass('hide')
        if is_showing != showing
            @element.find(".salvus-task-search-done-icon").toggleClass('hide')
            @element.find(".salvus-tasks-show-done").toggle('hide')
            @render_task_list()

    init_showing_done: () =>
        @showing_done = @local_storage("showing_done")
        if not @showing_done?
            @showing_done = true  # default to showing done
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
        bootbox.confirm "<h1><i class='fa fa-trash-o pull-right'></i></h1> <h4>Permanently erase the deleted items?</h4><br> <span class='lighten'>Old versions of this list may be available as snapshots.</span>  ", (result) =>
            if result == true
                a = @db.delete({deleted : true}, false)
                for task_id, task of @tasks
                    if task.deleted
                        delete @tasks[task_id]
                @set_dirty()
                @render_task_list()

    init_search: () =>
        ###
        @element.find(".salvus-tasks-search").keydown (evt) =>
            if evt.which == 13
                @render_task_list()
                return false
            else if evt.which == 27 # escape
                @element.find(".salvus-tasks-search").val("")
                @render_task_list()
                return false
        ###

        @_last_search = misc.walltime()
        @element.find(".salvus-tasks-search").keyup () =>
            t = misc.walltime()
            if t - @_last_search >= 250
                @_last_search = t
                @render_task_list()
            else
                t0 = @_last_search
                f = () =>
                    if t0 == @_last_search
                        @_last_search = t
                        @render_task_list()
                setTimeout(f, 250)

        @element.find(".salvus-tasks-search-clear").click () =>
            e = @element.find(".salvus-tasks-search")
            a = $.trim(e.val())
            if a.length > 0
                e.val("")
                @render_task_list()

    init_sort: () =>
        for s in HEADINGS
            if s == 'description'
                continue
            @element.find(".salvus-task-sort-#{s}").on 'click', {s:s}, (event) =>
                @click_sort_by(event.data.s)
                event.preventDefault()
        @update_sort_order_display()

    update_sort_order_display: () =>
        heading = @element.find(".salvus-tasks-list-heading")
        # remove bold
        heading.find(".salvus-tasks-header").removeClass('salvus-task-header-current')
        # hide all sorting icons
        heading.find(".fa-sort-asc").hide()
        heading.find(".fa-sort-desc").hide()
        # show ours
        heading.find(".salvus-task-sort-#{@sort_order.heading}").addClass('salvus-task-header-current').find(".fa-sort-#{@sort_order.dir}").show()
        # disable to bottom and to top buttons if not in position sort order
        b = @element.find(".salvus-tasks-buttons-pos-move")
        if @sort_order.heading == 'custom'
            b.removeClass('disabled')
        else
            b.addClass('disabled')

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
        @sort_visible_tasks()

    init_save: () =>
        @save_button = @element.find("a[href=#save]").click (event) =>
            @save()
            event.preventDefault()

    init_info: () =>
        @element.find(".salvus-tasks-info").click () =>
            help_dialog()
            return false

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
        set_key_handler(@)

    hide: () =>
        @element.hide()
        set_key_handler()

current_task_list = undefined
set_key_handler = (task_list) ->
    current_task_list = task_list

$(window).keydown (evt) =>
    if not current_task_list?
        #log("no task list")
        return

    if help_dialog_open
        #log("help dialog open")
        close_help_dialog()
        return

    if evt.shiftKey
        return

    if evt.ctrlKey or evt.metaKey or evt.altKey
        if evt.keyCode == 70 # f
            if current_task_list.element?.find(".salvus-task-editing-desc").length == 0
                # not editing any tasks, so global find
                current_task_list.element.find(".salvus-tasks-search").focus()
                return false
        if current_task_list.readonly
            return
        if evt.keyCode == 83 # s
            current_task_list.save()
            return false
        else if evt.keyCode == 78 # n
            current_task_list.create_task()
            return false
        else if evt.which == 40  #
            current_task_list.move_current_task_down()
            return false
        else if evt.which == 38  #
            current_task_list.move_current_task_up()
            return false
        else if evt.which == 32  # space
            current_task_list.toggle_current_task_done()
            return false
    else

        if current_task_list.element?.find(".salvus-task-editing-desc").length > 0
            #log("currently editing some task")
            return

        if evt.which == 13 and not current_task_list.readonly # return = edit selected
            current_task_list.edit_desc(current_task_list.current_task)
            return false

        else if evt.which == 40  # down
            current_task_list.set_current_task_next()
            return false

        else if evt.which == 38  # up
            current_task_list.set_current_task_prev()
            return false


parse_hashtags = (t0) ->
    # return list of pairs (i,j) such that t.slice(i,j) is a hashtag (starting with #).
    t = t0
    v = []
    if not t?
        return v
    base = 0
    while true
        i = t.indexOf('#')
        if i == -1 or i == t.length-1
            return v
        base += i+1
        if t[i+1] == '#' or not (i == 0 or t[i-1].match(/\s/))
            t = t.slice(i+1)
            continue
        t = t.slice(i+1)
        # find next whitespace or non-alphanumeric or dash
        i = t.match(/\s|[^A-Za-z0-9_\-]/)
        if i
            i = i.index
        else
            i = -1
        if i == 0
            # hash followed immediately by whitespace -- markdown desc
            base += i+1
            t = t.slice(i+1)
        else
            # a hash tag
            if i == -1
                # to the end
                v.push([base-1, base+t.length])
                return v
            else
                v.push([base-1, base+i])
                base += i+1
                t = t.slice(i+1)

help_dialog_element = templates.find(".salvus-tasks-help-dialog")

help_dialog_open = false

help_dialog = () ->
    help_dialog_open = true
    help_dialog_element.modal()

close_help_dialog = () ->
    help_dialog_open = false
    help_dialog_element.modal('hide')

help_dialog_element.find(".btn-close").click(close_help_dialog)





