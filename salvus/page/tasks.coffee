
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
HEADING_MAP = {custom:'position', description:'desc', due:'due_date', 'last-edited':'last_edited'}

# disabled due to causing hangs -- I should just modify the gfm or markdown source code (?).
###
CodeMirror.defineMode "tasks", (config) ->
    # This is annoying, but I can't find a better way to do it for now --
    # basically it doesn't switch back until hitting a space, so is wrong if there is a newline at the end...
    # It seems regexp's are not supported.  Doing something magic with autocompletion would be nicer, but v2.
    options = [{open:'#', close:' ', mode:CodeMirror.getMode(config, 'text')}]
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "gfm"), options...)
###

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
                    @tasks = @db.select()

                    # ensure task_id's are unique (TODO: does it make sense for this code to be here instead of somewhere else?)
                    v = {}
                    badness = false
                    for t in @tasks
                        if not t.task_id?
                            @db.delete({task_id : undefined})
                            badness = true
                        else if v[t.task_id]?
                            @db.delete_one({task_id : t.task_id})
                            badness = true
                        else
                            v[t.task_id] = true
                    if badness
                        @tasks = @db.select()

                    @render_hashtag_bar()
                    @render_task_list()
                    @element.find(".salvus-tasks-loading").remove()
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
        @tasks.sort(f)
        if field in ['last_edited', 'done']
            @tasks.reverse()
        if @sort_order.dir == 'asc'
            @tasks.reverse()

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
        @parse_hashtags()
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

    parse_hashtags: () =>
        @hashtags = {}
        for task in @tasks
            if task.done and not @showing_done
                continue
            if task.deleted and not @showing_deleted
                continue
            for x in parse_hashtags(task.desc)
                @hashtags[task.desc.slice(x[0]+1, x[1]).toLowerCase()] = true

    render_task_list: () =>
        #t0 = misc.walltime()
        search = @selected_hashtags()
        for x in misc.split(@element.find(".salvus-tasks-search").val().toLowerCase())
            x = $.trim(x)
            if x.length > 1
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
        @_visible_descs = ''
        current_task_is_visible = false

        if not @current_task?
            task_id = @local_storage("current_task")
            if task_id?
                @set_current_task_by_id(task_id)

        for task in @tasks
            if task.done and not @showing_done
                continue
            if task.deleted and not @showing_deleted
                continue
            skip = false
            if task.desc?
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
                @render_task(task)
                count += 1
                if not first_task?
                    first_task = task

        @render_hashtag_bar()
        ###
        if @_visible_tasks.length == 0
            @element.find(".salvus-tasks-first").show()
        else
            @element.find(".salvus-tasks-first").hide()
        ###

        if search.length > 0
            @elt_task_list.highlight(search)

        if count != 1
            count = "#{count} tasks"
        else
            count = "#{count} task"
        search_describe.find(".salvus-tasks-count").text(count).show()

        if @readonly
            #console.log('time', misc.walltime(t0))
            return

        if not current_task_is_visible and first_task?
            @current_task = first_task
        @set_current_task(@current_task)

        @elt_task_list.sortable
            containment : @element
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
        #console.log('time', misc.walltime(t0))

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
        #0.01
        task.element = t

        if task.done
            @display_done(task)

        if @current_task? and task.task_id == @current_task.task_id
            @set_current_task(task)

        # 0.025
        if @local_storage("toggle-#{task.task_id}")
            t.find(".salvus-task-toggle-icon").toggleClass('hide')

        if task.due_date?
            @display_due_date(task)

        # 0.13
        if task.deleted
            t.find(".salvus-task-undelete").show()

        t.data('task',task)
        @display_last_edited(task)
        # 0.20
        @display_desc(task)

        if task.done
            t.addClass("salvus-task-overall-done")

        if @readonly
            return

        # 0.42

        # Install all click handlers -- TODO: we will
        # redo this with a single more intelligent handler, for much greater
        # efficiency, like with file listing.
        t.click () =>
            @set_current_task(task)
        t.find(".salvus-task-desc").click () =>
            @edit_desc(task)
        t.find(".salvus-task-viewer-not-done").click () =>
            @set_task_done(task, true)
        t.find(".salvus-task-viewer-done").click () =>
            @set_task_done(task, false)
        t.find(".salvus-task-toggle-icon").click () =>
            t.find(".salvus-task-toggle-icon").toggleClass('hide')
            @display_desc(task)
        t.find(".salvus-task-due").click (event) =>
            @edit_due_date(task)
            event.preventDefault()
        t.find(".salvus-task-due-clear").click (event) =>
            @remove_due_date(task)
            event.preventDefault()
        t.find(".salvus-task-undelete").click () =>
            @set_current_task(task)
            @delete_task(task, false)
            return false

    click_on_task: (event) =>


    display_last_edited : (task) =>
        if task.last_edited
            task.element.find(".salvus-task-last-edited").attr('title',(new Date(task.last_edited)).toISOString()).timeago()

    display_due_date: (task) =>
        e = task.element.find(".salvus-task-due")
        if task.due_date
            task.element.find(".salvus-task-due-clear").show()
            d = new Date(0)   # see http://stackoverflow.com/questions/4631928/convert-utc-epoch-to-local-date-with-javascript
            d.setUTCMilliseconds(task.due_date)
            e.attr('title',d.toISOString()).timeago()
            if d < new Date()
                e.addClass("salvus-task-overdue")
        else
            e.timeago('dispose').text("none")
            task.element.find(".salvus-task-due-clear").hide()

    click_hashtag_in_desc: (event) =>
        tag = $(event.delegateTarget).text().slice(1).toLowerCase()
        @toggle_hashtag_button(@element.find(".salvus-hashtag-#{tag}"))
        @render_task_list()
        return false

    display_desc: (task) =>
        desc = task.desc
        m = desc.match(/^\s*[\r\n]/m)  # blank line
        if m?.index?
            i = m.index
            if task.element.find(".fa-caret-down").hasClass("hide")
                @local_storage("toggle-#{task.task_id}",true)
                desc = desc.slice(0,i)
            else
                @local_storage("toggle-#{task.task_id}",false)
        else
            task.element.find(".fa-caret-down").hide()
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

    get_current_task_index: () =>
        if not @current_task?
            return
        for i in [0...@tasks.length]  # TODO: could maintain a map
            if @tasks[i].task_id == @current_task.task_id
                return i

    get_current_task_visible_index: () =>
        if not @current_task?
            return
        for i in [0...@_visible_tasks.length]
            if @_visible_tasks[i].task_id == @current_task.task_id
                return i

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
            @custom_sort_order()
            @save_task_position(task, @tasks[0].position-1)
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
        e.addClass('salvus-task-editing-desc')
        elt_desc = e.find(".salvus-task-desc")
        @set_current_task(task)
        elt = edit_task_template.find(".salvus-tasks-desc-edit").clone()
        elt_desc.after(elt)
        elt_desc.hide()

        # this expansion is kind of hackish but makes the editor more usable.  Clean up later.
        e.find(".salvus-tasks-desc-column").removeClass("span7").addClass("span11")

        finished = false
        stop_editing = () =>
            e.find(".salvus-tasks-desc-column").removeClass("span11").addClass("span7")
            finished = true
            e.removeClass('salvus-task-editing-desc')
            try
                cm.toTextArea()
            catch
                # TODO: this raises an exception...
            elt.remove()
            elt_desc.show()

        save_task = () =>
            if finished
                return
            desc = cm.getValue()
            stop_editing()

            desc = desc.replace(/\[\]/g, '[ ]')  # [] --> [ ] on save, so that dynamic checkbox code is uniform; it might be better to do this during editing?

            if desc != task.desc
                orig_desc = task.desc
                task.desc = desc
                task.last_edited = (new Date()) - 0
                @display_last_edited(task)
                @display_desc(task)
                @db.update
                    set   : {desc  : desc, last_edited : task.last_edited}
                    where : {task_id : task.task_id}
                @set_dirty()

        editor_settings = require('account').account_settings.settings.editor_settings
        extraKeys =
            "Enter"       : "newlineAndIndentContinueMarkdownList"
            "Shift-Enter" : save_task
            "Shift-Tab"   : (editor) -> editor.unindent_selection()
            #"F11"         : (editor) -> console.log('hi'); editor.setOption("fullScreen", not editor.getOption("fullScreen"))


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
        if not task.desc?
            task.desc = ''
        cm.setValue(task.desc)
        $(cm.getWrapperElement()).addClass('salvus-new-task-cm-editor').addClass('salvus-new-task-cm-editor-focus')
        $(cm.getScrollerElement()).addClass('salvus-new-task-cm-scroll')
        #cm.on 'blur', save_task
        cm.focus()
        cm.save = save_task
        elt.find("a[href=#save]").tooltip(delay:{ show: 500, hide: 100 }).click (event) =>
            save_task()
            event.preventDefault()
        elt.find(".CodeMirror-hscrollbar").remove()
        elt.find(".CodeMirror-vscrollbar").remove()

        #elt.find("a[href=#cancel]").tooltip(delay:{ show: 500, hide: 100 }).click (event) =>
        #    stop_editing()
        #    event.preventDefault()

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

    display_done: (task) =>
        if task.done
            task.element.find(".salvus-task-viewer-not-done").hide()
            task.element.find(".salvus-task-viewer-done").show()
            if typeof(task.done) == 'number'
                task.element.find(".salvus-task-done").show().find(
                    'span').attr('title',(new Date(task.done)).toISOString()).timeago()
        else
            task.element.find(".salvus-task-viewer-not-done").show()
            task.element.find(".salvus-task-viewer-done").hide()
            task.element.find(".salvus-task-done").hide()

    delete_task: (task, deleted) =>
        task.element.stop().animate(opacity:'100')
        f = () =>
            @db.update
                set   : {deleted : deleted}
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
                set   : {done : task.done}
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
            for t in @tasks
                if t.position > p0 and (not p1? or t.position < p1)
                    p1 = t.position
            if p1? and p1>p0
                position = (p0 + p1)/2
            else
                position = p0 + 1
        else
            # no current task, so just put new task at the very beginning
            p = 0
            for t in @tasks
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
        @tasks.push(task)

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
                @tasks = (x for x in @tasks when not x.deleted)
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
            if t - @_last_search >= 1000
                @_last_search = t
                @render_task_list()
            else
                t0 = @_last_search
                f = () =>
                    if t0 == @_last_search
                        @_last_search = t
                        @render_task_list()
                setTimeout(f, 1000)

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
        @sort_task_list()

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
        #console.log("no task list")
        return

    if help_dialog_open
        #console.log("help dialog open")
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
            #console.log("currently editing some task")
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
        # find next whitespace or non-alphanumeric
        i = t.match(/\s|\W/)
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





