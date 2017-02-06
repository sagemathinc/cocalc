###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


###
Task List

###

SAVE_SPINNER_DELAY_MS = 5000  # TODO -- make this consistent across editors

# tasks makes use of future timestamps (for due date)
jQuery = $ = window.$
require('timeago')
jQuery.timeago.settings.allowFuture = true

async  = require('async')

misc   = require('smc-util/misc')
{defaults, required, to_json, uuid} = misc

{redux} = require('./smc-react')
{salvus_client}   = require('./salvus_client')
{alert_message}   = require('./alerts')
{synchronized_db} = require('./syncdb')
markdown          = require('./markdown')

underscore = require('underscore')

{IS_MOBILE} = require('./feature')

misc_page = require('./misc_page')
templates = $(".salvus-tasks-templates")

task_template           = templates.find(".salvus-task")
edit_task_template      = templates.find(".salvus-task-editor")
hashtag_button_template = templates.find(".salvus-tasks-hashtag-button")

currently_focused_editor = undefined

exports.task_list = (project_id, filename, opts) ->
    element = templates.find(".salvus-tasks-editor").clone()
    new TaskList(project_id, filename, element, opts)
    return element

HEADINGS    = ['custom', 'description', 'due', 'last-edited']
HEADING_MAP = {custom:'position', description:'desc', due:'due_date', 'last-edited':'last_edited'}

SPECIAL_PROPS = {element:true, changed:true, last_desc:true}

MIN_TIME = 1000 # minimum time in ms between sync events

sortnum = (a,b) -> a - b

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
    constructor: (@project_id, @filename, @element, @opts) ->
        # NOTE: @filename need not be defined, e.g., when this object is being used by the history editor just for rendering
        @default_font_size = redux.getStore('account').get('font_size')
        @element.data('task_list', @)
        @element.find("a").tooltip(delay:{ show: 500, hide: 100 })
        @elt_task_list = @element.find(".salvus-tasks-listing")
        @save_button = @element.find("a[href=\"#save\"]")
        @sort_order = {heading:'custom', dir:'desc'}  # asc or desc
        @readonly = true # at least until loaded
        @init_history_button()
        @init_create_task()
        @init_delete_task()
        @init_move_task_to_top()
        @init_move_task_to_bottom()
        @init_showing_done()
        @init_showing_deleted()
        @init_search()
        @init_sort()
        @init_info()
        if @opts.viewer
            @init_viewer()
        else
            @init_syncdb()

    destroy: () =>
        delete @tasks
        @element.removeData()
        @db?.destroy()

    init_history_button: =>
        if not @opts.viewer
            @element.find("a[href=\"#history\"]").show().click () =>
                redux.getProjectActions(@project_id).open_file
                    path       : misc.history_path(@filename)
                    foreground : true

    init_viewer: () =>
        @element.find(".salvus-tasks-loading").remove()
        @element.find(".salvus-task-empty-trash").remove()
        @element.find(".salvus-tasks-action-buttons").remove()
        @element.find(".salvus-tasks-hashtags-row").remove()  # TODO: only because they don't work in viewer mode; for later.

    init_syncdb: (cb) =>
        synchronized_db
            project_id : @project_id
            filename   : @filename
            cb         : (err, db) =>
                if err
                    # TODO -- so what? -- need to close window, etc.... Also this should be a modal dialog
                    e = "Error: unable to open #{@filename}"
                    @element.find(".salvus-tasks-loading").text(e)
                    alert_message(type:"error", message:e)
                    @readonly = true
                    @save_button.find("span").text("Try again to load...")
                    @save_button.removeClass('disabled').off('click').click () =>
                        @save_button.off('click')
                        @save_button.addClass('disabled')
                        @init_syncdb()
                else
                    @db = db
                    @readonly = @db.readonly
                    if @readonly
                        @save_button.find("span").text("Readonly")
                        @element.find(".salvus-tasks-action-buttons").remove()
                    else
                        @save_button.find("span").text("Save")

                    @init_tasks()

                    @render_hashtag_bar()
                    @render_task_list()

                    @set_clean()  # we have made no changes yet.

                    # UI indicators that sync happening...
                    @db.on('sync', => redux.getProjectActions(@project_id).flag_file_activity(@filename))

                    # Handle any changes, merging in with current state.
                    @db.on('change', @handle_changes)

                    # Before syncing ensure that the db is updated to the
                    # latest version of what is being edited.  If we don't do
                    # this, then when two people edit at once, one person
                    # will randomly loose their work!
                    @db.on('before-change', @save_live)

                    # We are done with initialization.
                    @element.find(".salvus-tasks-loading").remove()

                    @init_save()

    # Set the task list to what is defined by the given syncdb string.
    # This is used for the history viewer
    set_value: (value) =>
        @tasks = {}
        # We just completely clear and re-render everything.  Obviously this is not efficient.
        # However, it will be really hard/tricky to do this properly, and this code will just
        # get tossed when we rewrite tasks using React.js.
        @render_task_list()
        for x in value.split('\n')
            try
                task = JSON.parse(x)
                @tasks[task.task_id] = task
            catch e
                console.warn("error parsing task #{e} '#{x}'")
        @render_task_list()

    init_tasks: () =>

        # anything that couldn't be parsed from JSON as a map gets converted to {desc:thing}.
        @db.ensure_objects('desc')

        # ensure that every db entry has a distinct task_id
        @db.ensure_uuid_primary_key('task_id')

        # read tasks from the database
        @tasks = {}
        for task in @db.select()
            @tasks[task.task_id] = task

        # ensure positions and desc[riptions] are all defined
        positions = {}
        for task_id, t of @tasks
            if not t.position?
                # Every position must be defined.
                # If necessary, the 0 will get changed to something
                # distinct from others below.
                t.position = 0
                @db.update
                    set   : {position : t.position}
                    where : {task_id  : task_id}
            positions[t.position] = true

            # in case of corrupt input (so JSON couldn't be parsed)
            if t.corrupt?
                if not t.desc?
                    t.desc = ''
                t.desc += t.corrupt
                @db.update
                    set   : {desc     : t.desc,    corrupt:undefined}
                    where : {task_id  : task_id}

            if not t.desc?
                # every description must be defined
                t.desc = ''
                @db.update
                    set   : {desc     : t.desc}
                    where : {task_id  : task_id}

        # and that positions are unique
        if misc.len(positions) != misc.len(@tasks)
            # The positions are NOT unique -- this should be a very rare case, only arising from unlikely
            # race conditions, or user created data (e.g., concatenating two tasks lists).
            @ensure_positions_unique()

    ensure_positions_unique: () =>
        # We modify the positions to preserve the order (as well defined as it is), changing as few
        # of the tasks as possible.  We seek to minimize changes, since task lists may be stored in git
        # and we want to minimize diffs, and also this will be less pain on other connected clients.

        # 1. Create sorted list of the tasks, sorted by position.
        v = (task for _, task of @tasks)
        v.sort (t0, t1) ->
            if t0.position < t1.position
                return -1
            else if t0.position > t1.position
                return 1
            else
                return 0
        # 2. Move along the list finding a maximal sequence of repeats, which looks like this:
        #        [a, b_1, b_2, ..., b_k, c]    with a < b < c,
        #    with special cases for b_1 being the first (a=b_1-1) or b_k the
        #    last item (a=b_k+1) in the list.
        i = 0
        j = 1
        while j <= v.length
            if j == v.length or v[i].position != v[j].position
                # found maximal sequence of repeats
                if j-i > 1
                    # 3. Replace the b_i's by equally spaced numbers between a and c,
                    #    saving the new positions.
                    a = if i == 0 then v[0].position - 1 else v[i-1].position
                    b = if j == v.length then v[v.length-1].position + 1 else v[j].position
                    delta = (b-a)/(j-i+1)  # safe in Javascript, unlike Python2 :-)
                    d = a
                    for k in [i...j]
                        t = v[k]
                        d += delta
                        t.position = d
                        @db.update
                            set   : {position : t.position}
                            where : {task_id  : t.task_id}
                # reset, so we find next sequence of repeats...
                i = j
            j += 1

    positions: () =>
        # Return sorted list of positions of all tasks, guaranteed to be
        # unique (fixing the positions if necessary so unique)
        positions = {}
        for task_id, t of @tasks
            if not t.position?
                # Every position must be defined.
                # If necessary, the 0 will get changed to something
                # distinct from others below.
                t.position = 0
                @db.update
                    set   : {position : t.position}
                    where : {task_id  : task_id}
            positions[t.position] = true

        if misc.len(positions) != misc.len(@tasks)
            # The positions are NOT unique -- this should be a very rare case, only arising from unlikely
            # race conditions, or user created data (e.g., concatenating two tasks lists).
            @ensure_positions_unique()

        v = (task.position for _, task of @tasks)
        v.sort(sortnum)
        return v

    handle_changes: (changes) =>
        # Determine the tasks that changed from the changes object, which lists and
        # insert and remove for a change (but not for a delete), since syncdb is very generic.
        c = {}
        for x in changes
            if x.insert?.task_id?
                c[x.insert.task_id] = true
            else if x.remove?.task_id?
                c[x.remove.task_id] = true
        if misc.len(c) > 0
            # something changed, so allow the save button. (TODO: this is of course not really right)
            @set_dirty()
        for task_id, _ of c
            t = @db.select_one(where:{task_id:task_id})
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

    local_storage: (key, value) =>
        if @opts.viewer
            return
        {local_storage}   = require('./editor')
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
        @parse_hashtags()
        v = []
        for tag,_ of @hashtags
            if @local_storage("hashtag-##{tag}")
                v.push('#'+tag)
        return v

    toggle_hashtag_button: (button) =>
        if not button?
            return
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
            @element.find(".salvus-tasks-hashtags-row").hide()
            return
        else
            @element.find(".salvus-tasks-hashtags-row").show()

        click_hashtag = (event) =>
            button = $(event.delegateTarget)
            @toggle_hashtag_button(button)
            @render_task_list()
            return false

        tags = misc.keys(@hashtags)
        tags.sort()
        for tag in tags
            selected = @local_storage("hashtag-##{tag}")
            button = hashtag_button_template.clone()
            button.addClass("salvus-hashtag-#{tag}")
            button.text("#" + tag)
            if not selected and @_visible_descs? and @_visible_descs.indexOf('#'+tag) == -1
                button.addClass("disabled")
            else
                button.click(click_hashtag)
            bar.append(button)
            if selected
                @toggle_hashtag_button(button)
        bar.show()

    parse_hashtags: () =>
        @hashtags = {}
        if not @tasks?
            return
        for _, task of @tasks
            if task.done and not @showing_done
                continue
            if task.deleted and not @showing_deleted
                continue
            for x in misc.parse_hashtags(task.desc)
                @hashtags[task.desc.slice(x[0]+1, x[1]).toLowerCase()] = true

    render_task_list: () =>
        if not @tasks?
            return

        # Determine the search criteria, which restricts what is visible
        search = @selected_hashtags()
        # TODO: exact string searching surrounded by quotes -- add a function misc.search_split...
        for x in misc.search_split(@element.find(".salvus-tasks-search").val().toLowerCase())
            x = $.trim(x).toLowerCase()
            if x != '#'
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

        # Compute the list @_visible_tasks of tasks that are visible,
        # according to the search/hashtag/done/trash criteria.
        # Also, we make a big string that is the concatenation of the
        # desc fields of all visible tasks, so we know which hashtags to show.
        count = 0
        last_visible_tasks = (t for t in @_visible_tasks) if @_visible_tasks?
        @_visible_tasks = []
        @_visible_descs = ''
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
                    # is there anything at all in the task that will match our search criteria?
                    t = task.desc.toLowerCase()
                    for s in search
                        # show the task if either:
                        #   (1) the search term s is not a hashtag and it's anywhere in the description, or
                        #   (2) the search term s is a hashtag, and that tag exactly matches something in the description (i.e., hashtag[termination])
                        if t.indexOf(s) == -1  # term is not in text at all, so definitely skip
                            skip = true
                            continue
                        else if s[0] == '#'
                            # it's a hashtag, so we might skip it anyways, in case it's not an exact match
                            reg = new RegExp("#{s}(|\s|[^A-Za-z0-9_\-])")
                            if not t.match(reg)
                                skip = true
                            continue
            else
                task.desc = ''
            if not skip
                @_visible_tasks.push(task)
                @_visible_descs += ' ' + task.desc.toLowerCase()
                count += 1

        # Draw the hashtags that should be visible.
        @render_hashtag_bar()

        # Sort only the visible tasks in the list according to the currently selected sort order.
        @sort_visible_tasks()

        # Make it so the DOM displays exactly the visible tasks in the correct order
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

            current_task_is_visible = false
            for task in @_visible_tasks
                @elt_task_list.append(task.element)
                if task.task_id == @current_task?.task_id
                    current_task_is_visible = true

            # ensure that at most one task is selected as the current task
            @elt_task_list.children().removeClass("salvus-current-task")
            if not current_task_is_visible and @_visible_tasks.length > 0
                @set_current_task(@_visible_tasks[0])
            else
                @current_task?.element?.addClass("salvus-current-task")#.scrollintoview()

            if focus_current
                cm.focus()

        # ensure that all tasks are actually visible (not display:none, which happens on fading out)
        @elt_task_list.children().css('display','inherit')

        # remove any existing highlighting:
        @elt_task_list.find('.highlight-tag').removeClass("highlight-tag")
        @elt_task_list.find('.salvus-task-desc').unhighlight()

        if search.length > 0
            # Consider only tasks that *ARE NOT* currently being edited (since highlighting edited tasks is annoying)
            e = @elt_task_list.find('.salvus-task-desc').not(".salvus-task-desc-editing")
            # First highlight hashtags --
            # Add the highlight-tag CSS class to every hashtag in the task list.
            # select searched-for hashtags by their special class:
            selector = (".smc-tasks-hashtag-"+tags.substring(1) for tags in search when tags[0] == "#").join(',')
            e.find(selector).addClass("highlight-tag")

            # Highlight all the search terms for
            non_hashtag_search_terms = (t for t in search when t[0] != '#')
            e.highlight(non_hashtag_search_terms)

        # show the "create a new task" link if no tasks.
        if count == 0 and not @readonly
            @element.find(".salvus-tasks-list-none").show()
        else
            @element.find(".salvus-tasks-list-none").hide()
        # Show number of displayed tasks in UI.
        if count != 1
            count = "#{count} tasks"
        else
            count = "#{count} task"
        search_describe.find(".salvus-tasks-count").text(count).show()


        if @readonly
            # Task list is read only so there is nothing further to do -- in
            # particular, there's no need to make the task list sortable.
            @elt_task_list.find(".salvus-task-reorder-handle").hide()
            return

        if @sort_order.heading != 'custom'
            try
                @elt_task_list.sortable( "destroy" )
            catch e
                # if sortable never called get exception.
            @elt_task_list.find(".salvus-task-reorder-handle").hide()
            return

        @elt_task_list.find(".salvus-task-reorder-handle").show()

        @elt_task_list.sortable
            containment : @element
            handle      : ".salvus-task-reorder-handle"
            update      : (event, ui) =>
                e    = ui.item
                task = e.data('task')
                if not task?
                    return
                @set_current_task(task)
                # determine the previous and next tasks and their position numbers.
                prev = e.prev()
                next = e.next()
                if prev.length == 0 and next.length == 0
                    # if no next or previous, this shouldn't get called (but definitely nothing to do)
                    return # nothing to do
                if next.length > 0
                    @move_task_before(task, next.data('task').position)
                else if prev.length > 0
                    # if no next, make our position the previous + 1
                    @move_task_after(task, prev.data('task').position)

    set_task_position: (task, position) =>
        task.position = position
        @db.update
            set   : {position : position}
            where : {task_id : task.task_id}
        @set_dirty()

    move_task_before: (task, position) =>
        v = @positions() # ensures uniqueness of positions
        if position <= v[0]
            p = position - 1
        else
            for i in [1...v.length]
                if position <= v[i]
                    p = (v[i-1] + position)/2
                    break
        if p?
            @set_task_position(task, p)

    move_task_after: (task, position) =>
        v = @positions()
        i = v.length - 1
        if v[i] <= position
            p = position + 1
        else
            i -= 1
            while i >= 0
                if v[i] <= position
                    p = (v[i+1] + position)/2
                    break
                i -= 1
        if p?
            @set_task_position(task, p)

    get_task_by_id: (task_id) =>
        return @tasks?[task_id]

    render_task: (task) =>
        if not task.element?
            task.element = task_template.clone()
            task.element.data('task', task)
            task.element.click(@click_on_task)
            if not @readonly
                d = task.element.find('.salvus-task-desc').click (e) =>
                    if $(e.target).prop("tagName") == 'A'  # clicking on link in task description shouldn't start editor
                        return
                    if misc_page.get_selection_start_node().closest(d).length != 0
                        # clicking when something in the task is selected -- e.g., to select -- shouldn't start editor
                        return
                    @edit_desc(task)
                task.element.find('.salvus-task-desc').dblclick (e) =>
                    @edit_desc(task)
            task.changed = true

        t = task.element
        t.show()

        if t.hasClass('salvus-task-editing-desc')
            cm = t.data('cm')
            if cm?
                if task.changed
                    # if the description changed
                    if task.desc != task.last_desc
                        cm.setValueNoJump(task.desc)

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
        if @opts.viewer or @readonly
            return
        if task.deleted
            task.element.find(".salvus-task-undelete").show()
        else
            task.element.find(".salvus-task-undelete").hide()

    click_on_task: (e) =>
        set_key_handler(@)
        task = $(e.delegateTarget).closest(".salvus-task").data('task')
        target = $(e.target)
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

    display_last_edited: (task) =>
        if task.last_edited
            corrupt = false
            if typeof(task.last_edited) != "number"  # corrupt
                corrupt = true
            else
                d = new Date(task.last_edited)
                if not misc_page.is_valid_date(d)
                    corrupt = true
            if corrupt
                d = new Date()
                task.last_edited = new Date() - 0
                @db.update
                    set   : {last_edited : task.last_edited }
                    where : {task_id : task.task_id}

            a = $("<span>").attr('title',d.toISOString()).timeago()
            a.text($.timeago(d.toISOString()))
            task.element.find(".salvus-task-last-edited").empty().append(a)

    click_hashtag_in_desc: (event) =>
        tag = $(event.delegateTarget).text().slice(1).toLowerCase()
        @toggle_hashtag_button(@element.find(".salvus-hashtag-#{tag}"))
        @set_current_task($(event.delegateTarget).closest(".salvus-task").data('task'))
        @render_task_list()
        return false

    currently_editing_task: (task) =>
        return currently_focused_editor? and currently_focused_editor == task.element.data('cm')

    display_desc: (task) =>
        desc = task.desc
        if not @currently_editing_task(task)
            # not editing task -- check on toggle status
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

        if desc.trim().length == 0
            desc = "<span class='lighten'>Enter a description...</span>" # so it is possible to edit
        else
            # replace hashtags by a span with appropriate class
            v = misc.parse_hashtags(desc)
            if v.length > 0
                # replace hashtags by something that renders nicely in markdown (instead of as descs)
                x0 = [0,0]
                desc0 = ''
                for x in v
                    desc0 += desc.slice(x0[1], x[0]) + "<span class='salvus-tasks-hash smc-tasks-hashtag-#{(desc.slice(x[0], x[1])).substring(1).toLowerCase()}'>" + desc.slice(x[0], x[1]) + '</span>'
                    x0 = x
                desc = desc0 + desc.slice(x0[1])

            x = markdown.markdown_to_html(desc)
            desc = x.s
            has_mathjax = x.has_mathjax

        if task.deleted
            desc = "<del>#{desc}</del>"

        e = task.element.find(".salvus-task-desc")
        e.css({fontSize: "#{@default_font_size ? 14}px"})

        e.html(desc)
        if has_mathjax
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

        if @filename? # need not be defined, e.g., for history editor...
            e.process_smc_links(project_id:@project_id, file_path:misc.path_split(@filename).head)
        e.find("table").addClass('table')  # makes bootstrap tables look MUCH nicer -- and gfm has nice tables
        task.element.find(".salvus-tasks-hash").click(@click_hashtag_in_desc)

    set_current_task: (task) =>
        if not task?
            return
        if @current_task?.element?
            @current_task.element.removeClass("salvus-current-task")
        scroll_into_view = (@current_task?.task_id != task.task_id)
        @current_task = task
        @local_storage("current_task", task.task_id)
        if task.element?
            task.element.addClass("salvus-current-task")
            if misc_page.get_selection_start_node().closest(task.element).length != 0
                # clicking when something in the task is selected -- e.g., don't scroll into view
                scroll_into_view = false
            if scroll_into_view
                task.element.scrollIntoView()

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
            @move_task_after(@current_task, @_visible_tasks[i+1].position)
            @render_task_list()

    move_current_task_up: () =>
        i = @get_current_task_visible_index()
        if i > 0
            @move_task_before(@current_task, @_visible_tasks[i-1].position)
            @render_task_list()

    move_current_task_to_top: () =>
        if not @current_task?
            return
        task = @current_task
        @set_current_task_prev()
        @move_task_before(task,  @_visible_tasks[0].position)

    move_current_task_to_bottom: () =>
        if not @current_task?
            return
        task = @current_task
        @set_current_task_next()
        @move_task_after(task, @_visible_tasks[@_visible_tasks.length-1].position)

    delete_current_task: () =>
        if @current_task?
            @delete_task(@current_task, true)

    # save live state of editor to syncdb by going through all codemirror editors
    # of open in-edit-mode tasks, and saving them.
    save_live: () =>
        #console.log("save_live")
        for task in @_visible_tasks
            e = task?.element
            if e?.hasClass('salvus-task-editing-desc')
                cm = e.data('cm')
                if cm? and cm.getValue() != task.last_desc
                    cm.sync_desc()

    edit_desc: (task, cursor_at_end) =>
        if not task?
            task = @current_task
        if not task?
            task = @_visible_tasks[0]
        if not task?
            return
        e = task.element
        if not e?
            return
        if e.hasClass('salvus-task-editing-desc') and e.data('cm')?
            e.data('cm').focus()
            return
        e.find(".salvus-task-desc").addClass('salvus-task-desc-editing')
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
            cm.setValueNoJump(task.desc)
            return

        elt = edit_task_template.find(".salvus-tasks-desc-edit").clone()
        elt_desc.before(elt)

        finished = false
        stop_editing = () =>
            currently_focused_editor = undefined
            finished = true
            e.removeClass('salvus-task-editing-desc')
            e.find(".salvus-task-desc").removeClass('salvus-task-desc-editing')
            elt.hide()
            sync_desc()

        editor_settings = redux.getStore('account').get_editor_settings()
        extraKeys =
            #"Enter"       : "newlineAndIndentContinueMarkdownList"  # plugin is buggy, inserting NaN
            "Shift-Enter" : stop_editing
            "Shift-Tab"   : (editor) -> editor.unindent_selection()
            "Ctrl-S"      : (editor) => @save()
            "Cmd-S"       : (editor) => @save()


        if editor_settings.bindings != 'vim'  # this escape binding below would be a major problem for vim!
            extraKeys["Esc"] = stop_editing

        opts =
            mode                : 'gfm2'
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

        if editor_settings.code_folding
             extraKeys["Ctrl-Q"] = (cm) -> cm.foldCode(cm.getCursor())
             opts.foldGutter     = true
             opts.gutters        = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]


        cm = CodeMirror.fromTextArea(elt.find("textarea")[0], opts)
        cm.save = @save
        if editor_settings.bindings == 'vim'
            cm.setOption("vimMode", true)

        e.data('cm',cm)
        if not task.desc?
            task.desc = ''
        cm.setValue(task.desc)

        cm.clearHistory()  # ensure that the undo history doesn't start with "empty document"
        $(cm.getWrapperElement()).addClass('salvus-new-task-cm-editor').css(height:'auto')  # setting height via salvus-new-task-cm-editor doesn't work.
        $(cm.getScrollerElement()).addClass('salvus-new-task-cm-scroll')


        elt.find("a[href=\"#close\"]").tooltip(delay:{ show: 500, hide: 100 }).click (event) =>
            stop_editing()
            event.preventDefault()
        elt.find(".CodeMirror-hscrollbar").remove()
        elt.find(".CodeMirror-vscrollbar").remove()

        task.last_desc = task.desc  # initialize last_desc, in case we get an update before ever sync'ing.
        sync_desc = () =>
            desc           = cm.getValue()
            task.last_desc = desc  # update current description before syncing.
            task.desc      = desc
            @display_desc(task)    # update the preview
            task.last_edited = (new Date()) - 0
            @db.update
                set   : {desc    : task.desc, last_edited : task.last_edited}
                where : {task_id : task.task_id}
            @set_dirty()

        cm.sync_desc = sync_desc  # hack -- will go away with react rewrite of tasks...

        # Only typically sync save 2s after the user stops typing.  This ensures that
        # the task list doesn't feel slow or waste a lot of cpu during bursts of typing
        # (unless there are incoming sync updates to process).
        cm.on 'changes', underscore.debounce(sync_desc, 2000)

        cm.on 'focus', () ->
            currently_focused_editor = cm
            $(cm.getWrapperElement()).addClass('salvus-new-task-cm-editor-focus')

        cm.on 'blur', () ->
            $(cm.getWrapperElement()).removeClass('salvus-new-task-cm-editor-focus')
            currently_focused_editor = undefined

        cm.focus()
        if cursor_at_end
            cm.execCommand('goDocEnd')

    edit_due_date: (task) =>
        $(".bootstrap-datetimepicker-widget:visible").remove()
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
        # get rid of text input -- clicking is pretty good, and I could do the text thing differently.
        elt.hide()

        datetime = $(".bootstrap-datetimepicker-widget:visible")
        # replace ugly little time icon with bigger awesome icon
        x = datetime.draggable().find(".icon-time").addClass('fa').addClass('fa-clock-o').css
            'font-size' : '24pt'
            'height'    : '24pt'
            'background': 'white'

        elt_due.parent().append(datetime)
        close = () =>
            elt.data('datetimepicker').destroy()
            elt.remove()

        done = $('<a class="btn btn-default pull-right">Close</a>')
        done.click(close)
        x.parent().before(done)

        picker = elt.data('datetimepicker')
        if task.due_date?
            d = new Date(task.due_date)
            if not misc_page.is_valid_date(d)  # workaround potential (hopefully extremely rare) corruption
                d = new Date()
        else
            d = new Date()
        picker.setLocalDate(d)
        elt.on 'changeDate', (e) =>
            @set_due_date(task, e.localDate - 0)
            @render_task(task)

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
            if typeof task.due_date != 'number'
                # very rare corruption -- valid json but date somehow got messed up.
                @remove_due_date(task)
                return
            x = task.element.find(".salvus-task-due-clear")
            x.show()
            x.attr('title','Clear due date')
            d = new Date(0)   # see http://stackoverflow.com/questions/4631928/convert-utc-epoch-to-local-date-with-javascript
            d.setUTCMilliseconds(task.due_date)
            e.attr('title',d.toISOString()).timeago()
            e.attr('title',d.toISOString())
            e.text($.timeago(d.toISOString()))
            if not task.done and d < new Date()
                e.addClass("salvus-task-overdue")
        else
            task.element.find(".salvus-task-due-clear").hide()

    display_done: (task) =>
        if not task.element?
            return
        if task.done
            task.element.find(".salvus-task-viewer-not-done").hide()
            task.element.find(".salvus-task-viewer-done").show()
            if typeof(task.done) == 'number'
                e = task.element.find(".salvus-task-done")  # reconstructs the DOM element so that timeago updates correctly
                if e.text() != 'none'
                    e.timeago('dispose').text("none")
                    f = task_template.find(".salvus-task-done").clone()
                    e.replaceWith(f)
                    e = f
                done_text = task.element.find(".salvus-task-done").show().find('span')
                d = new Date(task.done)
                if not misc_page.is_valid_date(d)
                    d = new Date()
                done_text.attr('title', d.toISOString()).timeago()
                done_text.parent().attr('title', d.toISOString())
            task.element.addClass("salvus-task-overall-done")
        else
            task.element.find(".salvus-task-viewer-not-done").show()
            task.element.find(".salvus-task-viewer-done").hide()
            task.element.find(".salvus-task-done").hide()
            task.element.removeClass("salvus-task-overall-done")

    delete_task: (task, deleted) =>
        task.element?.stop().prop('style').removeProperty('opacity')
        f = () =>
            @db.update
                set   : {deleted : deleted, last_edited : new Date() - 0}
                where : {task_id : task.task_id}
            task.deleted = deleted
            @set_dirty()

        if deleted and not @showing_deleted
            task.element?.fadeOut () =>
                if not task.deleted # they could have canceled the action by clicking again
                    @set_current_task_next()
                    f()
        else
            f()

    toggle_current_task_done: () =>
        if @current_task
            @set_task_done(@current_task, not @current_task.done)


    set_task_done: (task, done) =>
        task.element.stop().prop('style').removeProperty('opacity')
        if not task.done and not done
            # nothing to do
            return
        if done
            task.done = (new Date()) - 0
        else
            task.done = 0
        f = () =>
            @db.update
                set   : {done : task.done, last_edited : new Date() - 0}
                where : {task_id : task.task_id}
            @set_dirty()
        if done and not @showing_done
            task.element.fadeOut () =>
                if task.done  # they could have canceled the action by clicking again
                    @set_current_task_next()
                    f()
        else
            f()

    clear_create_task: () =>
        @create_task_editor.setValue('')
        @element.find(".salvus-tasks-create-button").addClass('disabled')

    create_task: () =>
        if @readonly or not @tasks?
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
            desc        : desc
            position    : position
            last_edited : new Date() - 0

        task_id = uuid()
        task.task_id = task_id
        @tasks[task_id] = task

        @db.update
            set   : task
            where : {task_id : task_id}

        @set_current_task(task)
        @edit_desc(task, true)
        @set_dirty()

    set_current_task_by_id: (task_id) =>
        @current_task = @get_task_by_id(task_id)

    init_create_task: () =>
        @element.find("a[href=\"#create-task\"]").click (event) =>
            @create_task()
            event.preventDefault()

        @element.find(".salvus-tasks-first").click (event) =>
            @create_task()
            event.preventDefault()

    init_delete_task: () =>
        @element.find("a[href=\"#delete-task\"]").click (event) =>
            @delete_current_task()
            event.preventDefault()

    init_move_task_to_top: () =>
        b = @element.find("a[href=\"#move-task-to-top\"]").click (event) =>
            if not b.hasClass('disabled')
                @move_current_task_to_top()
            event.preventDefault()

    init_move_task_to_bottom: () =>
        b = @element.find("a[href=\"#move-task-to-bottom\"]").click (event) =>
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
        if @opts.viewer
            @showing_done = false
        else
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
        if @opts.viewer
            @showing_deleted = false
        else
            @showing_deleted = @local_storage("showing_deleted")
        if not @showing_deleted?
            @showing_deleted = false
        @set_showing_deleted(@showing_deleted)
        @element.find(".salvus-task-search-not-deleted").click(=> @set_showing_deleted(true))
        @element.find(".salvus-task-search-deleted").click(=> @set_showing_deleted(false))
        @element.find(".salvus-task-empty-trash").click () =>
            if @readonly
                return
            @empty_trash()

    empty_trash: () =>
        if @readonly or not @tasks?
            return
        prev = currently_focused_editor
        currently_focused_editor = 'bootbox'
        bootbox.confirm "<h1><i class='fa fa-trash-o pull-right'></i></h1> <h4>Permanently erase the deleted items?</h4><br> <span class='lighten'>Old versions of this list may be available as snapshots.</span>  ", (result) =>
            currently_focused_editor = prev
            if result == true
                a = @db.delete
                    where : {deleted : true}
                    one   : false
                for task_id, task of @tasks
                    if task.deleted
                        delete @tasks[task_id]
                @set_dirty()
                @render_task_list()

    init_search: () =>
        @_last_search = misc.walltime()
        search_delay = 300  # do the search when user stops typing for this many ms
        search_box = @element.find(".salvus-tasks-search")
        search_box.keyup (evt) =>
            if evt.which == 27
                search_box.val('').blur()
                @render_task_list()
                return
            else if evt.which == 13
                @edit_desc(@current_task)
                return
            else if evt.which == 78 and (evt.ctrlKey or evt.metaKey)
                @create_task()
                return
            t = misc.walltime()
            if t - @_last_search >= search_delay
                @_last_search = t
                @render_task_list()
            else
                t0 = @_last_search
                f = () =>
                    if t0 == @_last_search
                        @_last_search = t
                        @render_task_list()
                setTimeout(f, search_delay)
        search_box.focus () =>
            currently_focused_editor = search_box
        search_box.blur () =>
            currently_focused_editor = undefined


        @element.find(".salvus-tasks-search-clear").click () =>
            search_box.val('').focus()
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

    init_info: () =>
        @element.find(".salvus-tasks-info").click () =>
            help_dialog()
            return false

    set_dirty: () =>
        @_new_changes = true
        if not @readonly
            @save_button.removeClass('disabled')

    set_clean: () =>
        @save_button?.addClass('disabled')

    has_unsaved_changes: (val) =>
        if val
            @set_dirty()
        return not @save_button.hasClass('disabled')

    init_save: () =>
        if @readonly
            @save_button?.addClass('disabled')
        else
            @save_button?.click (event) =>
                @save()
                event.preventDefault()

    save: () =>
        if @readonly or not @has_unsaved_changes() or @_saving
            return
        @_saving = true
        @_new_changes = false
        @save_button.icon_spin(start:true, delay:SAVE_SPINNER_DELAY_MS)
        @db.save (err) =>
            @save_button.icon_spin(false)
            @_saving = false
            if not err and not @_new_changes
                @set_clean()
            else
                if err
                    alert_message(type:"error", message:"unable to save #{@filename} -- #{to_json(err)}")

    show: () =>
        set_key_handler(@)
        redux.getActions('page').set_active_key_handler(tasks_key_handler)

    hide: () =>
        @element.hide()
        redux.getActions('page').erase_active_key_handler(tasks_key_handler)

current_task_list = undefined

set_key_handler = (task) ->
    current_task_list = task

tasks_key_handler = (evt) =>
    if not current_task_list?
        return
    # See https://github.com/sagemathinc/smc/issues/1318 -- this is a temporary
    # way to deal with keyboard focus -- just check that if something is focused,
    # it is one of *our* text areas.
    focused = $(":focus")
    if focused.length > 0 and focused.closest(".salvus-tasks-listing").length == 0
        return

    if help_dialog_open
        close_help_dialog()
        return

    if evt.shiftKey
        return

    if currently_focused_editor?
        return

    if evt.ctrlKey or evt.metaKey or evt.altKey
        if evt.keyCode == 70 # f
            # global find
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
        if (evt.which == 13 or evt.which == 73) and not current_task_list.readonly # return = edit selected
            current_task_list.edit_desc(current_task_list.current_task)
            return false

        else if evt.which == 40 or evt.which == 74    # down
            current_task_list.set_current_task_next()
            return false

        else if evt.which == 38 or evt.which == 75    # up
            current_task_list.set_current_task_prev()
            return false


help_dialog_element = templates.find(".salvus-tasks-help-dialog")
help_dialog_modal = templates.find(".salvus-tasks-help-dialog")
help_dialog_open = false

help_dialog = () ->
    help_dialog_modal = help_dialog_element.clone()
    help_dialog_open = true
    help_dialog_modal.modal()
    help_dialog_modal.find(".btn-close").click(close_help_dialog)

close_help_dialog = () ->
    help_dialog_open = false
    help_dialog_modal.modal('hide')
