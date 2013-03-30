###########################################
#
# Salvus interactive worksheet editor
#
# Namespaces:
#
#   * worksheet.css: all css classes are prefixed with "salvus-worksheet-"
#
#   * worksheet.html: do not use any id's -- use css classes prefixed as above
#
#   * worksheet.coffee: The only Javascript exported from this file is via
#     assignment to the exports objects
#
###########################################
#
#

# TODO -- this could be made configurable for the user!
SCRATCH        = 'scratch'

{dirname}      = require('path')
{EventEmitter} = require('events')
async          = require("async")

{merge, copy, filename_extension, required, defaults, to_json, uuid} = require('misc')
{alert_message} = require('alerts')
{salvus_client} = require('salvus_client')
{Cell} = require("cell")

{IS_MOBILE} = require("feature")


templates          = $("#salvus-worksheet-templates")
worksheet_template = templates.find(".salvus-worksheet")

# Worksheet class
class Worksheet extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            element     : required # DOM element (or jQuery wrapped element); this is replaced by the worksheet
            title       : ""
            description : ""
            content     : undefined  # If given, sets the cells/sections of the worksheet (see @to_obj()).
            cell_opts   : {}
            session     : undefined
            path        : undefined  # If given, is the default filename of the worksheet
            cwd         : undefined  # If given,  chdir'd on startup.
            project_id  : required
            latex_opts  : {'documentclass':'article', 'preamble':'', tableofcontents:true}

        @element = worksheet_template.clone()
        @element.data("worksheet", @)
        $(@opts.element).replaceWith(@element)
        @_init_title()
        @_init_description()
        @_init_session_ping()
        @_cells = @element.find(".salvus-worksheet-cells")
        @_current_cell = @_append_new_cell()
        @_focus_cell(@_current_cell)

        @_init_check_all_button()
        @_init_execute_cells_button()
        @_init_section_button()
        @_init_remove_section_button()
        @_init_filename_save()
        @_init_restart_button()
        @_init_kill_button()
        @_init_toggle_code_button()
        @_init_toggle_note_button()
        @_init_toggle_output_button()
        @_init_view_button_bar()
        @_init_views()

        @_init_download_button()
        #@element.find(".salvus-worksheet-controls-label").hide()

        if @opts.content?
            # Set the contents of the worksheet, then *delete* this
            # attribute, since it would be wasted and could be
            # misleading, unless we try to keep it in sync with the
            # DOM, which would be further
            # wasteful/misleading/hard/error prone.
            @set_content(@opts.content)
            delete @opts.content
            @has_unsaved_changes(false)

        if @opts.cwd?
            @chdir(@opts.cwd)

        @_init_autosave()

        if not @opts.path?
            @_set_default_path()

        @_last_path = @opts.path

    chdir: (path, cb) =>
        @opts.session.execute_code
            # os.chdir(os.environ['HOME']); os.makedirs(salvus.data['path']) if not os.path.exists(salvus.data['path']) else None;
            code     : "os.chdir(salvus.data['path'])"
            data     : {path: path}
            preparse : false
            cb       : (err) -> cb?(err)

    #######################################################################
    # Private Methods
    #######################################################################

    _set_default_path: () =>
        input = @element.find(".salvus-worksheet-filename")
        if input.val() == ""
            salvus_client.exec
                project_id : @opts.project_id
                command    : "mkdir"
                args       : ["-p", SCRATCH]
                cb         : (err, output) =>
                    @chdir(SCRATCH)
                    path = SCRATCH + '/' + uuid().slice(0,8)
                    input.val(path)
                    @save(path)

    _monitor_for_changes: (elt) =>
        elt.data("last", elt.html())
        elt.keyup () =>
            h = elt.html()
            if elt.data("last") != h
                # TODO: here we might also send a message with edit difference back to hub...?
                @has_unsaved_changes(true)
                elt.data("last", h)

    _init_title: () =>
        title = @element.find(".salvus-worksheet-title")
        @set_title(@opts.title)

        title.make_editable
            onchange : (obj, diff) -> # TODO: do something with this.
                #console.log(obj, diff)

        @_monitor_for_changes(title)


    _init_description: () =>
        description = @element.find(".salvus-worksheet-description")

        @set_description(@opts.description)
        @_monitor_for_changes(description)

        description.make_editable
            onchange: (obj, diff) ->  # TODO: do something with this.

    _init_session_ping: () =>
        # Ping as long as the worksheet_is_open method returns true.
        @opts.session.ping(@worksheet_is_open)

    _init_view_button_bar: () =>
        # Initialize the button bar that lets one switch between various views of a worksheet.
        element = @element
        bar = element.find(".salvus-worksheet-view-button-bar")
        buttons = bar.find('a')
        that = @
        for a in bar.find('a')
            $(a).click () ->
                buttons.removeClass('btn-inverse')
                t = $(@)
                t.addClass('btn-inverse')
                view = t.attr('href').slice(1)
                element.find(".salvus-worksheet-view").hide()
                element.find(".salvus-worksheet-#{view}").show()
                that._refresh_view(view)
                return false


    _init_views: () =>
        e = @element.find(".salvus-worksheet-text-view").find("textarea")
        @_text_view_codemirror = CodeMirror.fromTextArea(e[0],
            readOnly     : true
            lineNumbers  : true
            mode         : "python"
            lineWrapping : true
        )
        $(@_text_view_codemirror.getScrollerElement()).css('max-height' : '30em')

        e = @element.find(".salvus-worksheet-json-view").find("textarea")
        @_json_view_codemirror = CodeMirror.fromTextArea(e[0],
            readOnly     : true
            lineNumbers  : true
            mode         : "javascript"
            lineWrapping : true
        )
        $(@_json_view_codemirror.getScrollerElement()).css('max-height' : '30em')

        e = @element.find(".salvus-worksheet-rest-view").find("textarea")
        @_rest_view_codemirror = CodeMirror.fromTextArea(e[0],
            readOnly     : true
            lineNumbers  : true
            mode         : "rst"
            lineWrapping : true
        )
        $(@_rest_view_codemirror.getScrollerElement()).css('max-height' : '30em')

        e = @element.find(".salvus-worksheet-latex-view").find("textarea")
        @_latex_view_codemirror = CodeMirror.fromTextArea(e[0],
            readOnly     : true
            lineNumbers  : true
            mode         : "rst"
            lineWrapping : true
        )
        $(@_latex_view_codemirror.getScrollerElement()).css('max-height' : '30em')

    _refresh_view: (view) =>
        switch view
            when 'worksheet-view'
                return

            when 'text-view'
                @_text_view_codemirror.setValue(@to_text())

            when 'rest-view'
                @_rest_view_codemirror.setValue(@to_rest())

            when 'latex-view'
                @_latex_view_codemirror.setValue(@to_latex())

            when 'json-view'
                @_json_view_codemirror.setValue(JSON.stringify(@to_obj(),null,'\t'))

    _new_blobs_helper: (content, result) =>
        # walk the content tree finding blobs
        for c in content
            if c.content?
                @_new_blobs_helper(c.content, result)
            else if c.output?
                for output in c.output
                    if output.file?
                        id = output.file.uuid
                        if not @_saved_blobs[id]?
                            result.push(id)

    _new_blobs: (content) =>
        if not @_saved_blobs?
            @_saved_blobs = {}
        v = []
        @_new_blobs_helper(content, v)
        return v

    _init_autosave: () =>
        # start autosaving, as long as a filename is set
        input = @element.find(".salvus-worksheet-filename")
        autosave = require('account').account_settings.settings.autosave
        that = @
        interval = undefined
        if autosave
            save_if_changed = () ->
                # Check to see if the worksheet has been closed, in which case we stop autosaving.
                if not that.worksheet_is_open()
                    clearInterval(interval)
                    return
                if that.has_unsaved_changes()
                    path = input.val()
                    if path.length > 0
                        that.save(path)
            interval = setInterval(save_if_changed, autosave*1000)

    _init_filename_save: () =>
        input = @element.find(".salvus-worksheet-filename")
        if @opts.path?
            if filename_extension(@opts.path) == 'sage-worksheet'
                input.val(@opts.path.slice(0,15))
            else
                input.val(@opts.path)
        input.keypress (evt) =>
            if evt.which == 13
                @save(input.val())
                return false
        save = @element.find("a[href=#save]")
        save.click () =>
            if not save.hasClass('disabled')
                @save(input.val())
            return false

    _init_download_button: () =>
        @element.find("a[href=#download-file]").click () =>
            @_download_file()
            return false

    _download_file : () =>
        @save @opts.path, (err) =>
            # TODO: THIS replicates code in project.coffee
            salvus_client.read_file_from_project
                project_id : @opts.project_id
                path       : @opts.path
                cb         : (err, result) =>
                    if err
                        alert_message(type:"error", message:"Error downloading a worksheet: #{err} -- #{misc.to_json(result)}")
                    else
                        url = result.url + "&download"
                        iframe = $("<iframe>").addClass('hide').attr('src', url).appendTo($("body"))
                        setTimeout((() -> iframe.remove()), 1000)

    _init_section_button: () =>
        @element.find("a[href=#create-section]").click () =>
            @_create_section()
            return false

    _init_kill_button: () =>
        @element.find("a[href=#kill]").click () =>
            @kill()
            return false

    _init_restart_button: () =>
        @element.find("a[href=#restart]").click () =>
            @restart()
            return false

    _new_section: (opts={}) =>
        opts = defaults opts,
            id    : undefined
            title : 'Section'
        section = templates.find(".salvus-worksheet-section").clone()
        if not opts.id?
            opts.id = uuid()
        section.attr('id', opts.id)

        title = section.find(".salvus-worksheet-section-title-user")
        title.html(opts.title)
        @_monitor_for_changes(title)

        section.find(".salvus-worksheet-section-hide").click () ->
            section.find(".salvus-worksheet-section-hide").hide()
            section.find(".salvus-worksheet-section-show").show()
            section.find(".salvus-worksheet-section-cells").hide()

        section.find(".salvus-worksheet-section-show").click () ->
            section.find(".salvus-worksheet-section-show").hide()
            section.find(".salvus-worksheet-section-hide").show()
            section.find(".salvus-worksheet-section-cells").show()

        section.find(".salvus-worksheet-section-title-user").blur () ->
            t = $(@)
            if $.trim(t.text()) == ""
                if section.find(".salvus-cell").length == 0
                    section.remove()
                else
                    t.text("...")
        return section

    _create_section: () =>
        group = []
        groups = []
        n = 0
        cells = @cells()
        for c in cells
            n += 1
            end_group = false
            if c.checkbox()
                group.push(c)
                c.checkbox(false)
            else
                end_group = true
            if n == cells.length
                end_group = true
            if end_group
                if group.length > 0
                    # found a new group
                    groups.push(group)
                group = []

        if groups.length == 0 and @_last_focused_cell?
            groups = [[@_last_focused_cell]]

        for group  in groups
            section = @_new_section()
            @has_unsaved_changes(true)
            section.insertBefore(group[0].element)
            section.find(".salvus-worksheet-section-title-user").make_editable()  # do not call until object is visible.

            section_cells = section.find(".salvus-worksheet-section-cells")
            for x in group
                section_cells.append(x.element)

    _init_remove_section_button: () =>
        @element.find("a[href=#remove-section]").click () =>
            # TODO
            alert_message(type:'error', message:"remove-section: not implemented yet")
            return false

    _init_toggle_code_button: () =>
        @element.find("a[href=#toggle-code]").click () =>
            @_toggle_component('editor')
            return false

    _toggle_component: (name) =>
        mode = undefined
        for c in @selected_cells()
            if not mode?
                if name in c.hidden_components()
                    mode = 'show'
                else
                    mode = 'hide'
            if mode == 'show'
                c.show(name)
            else
                c.hide(name)

    _init_toggle_note_button: () =>
        @element.find("a[href=#toggle-note]").click () =>
            @_toggle_component('note')
            @_toggle_note()
            return false

    _init_toggle_output_button: () =>
        @element.find("a[href=#toggle-output]").click () =>
            @_toggle_component('output')
            return false

    _init_check_all_button: () =>
        @element.find("a[href=#check-all]").click () =>
            @_check_all()
            return false

    _check_all: () =>
        if @_check_all_last?
            @_check_all_last = not @_check_all_last
        else
            @_check_all_last = true
        if @_check_all_last
            $("a[href=#check-all]").find('i').addClass('icon-check').removeClass('icon-check-empty')
        else
            $("a[href=#check-all]").find('i').addClass('icon-check-empty').removeClass('icon-check')
        for c in @cells()
            c.checkbox(@_check_all_last)

    _init_execute_cells_button: () =>
        @element.find("a[href=#execute-cells]").click () =>
            @_execute_cells()
            return false

    _execute_cells: () =>
        for c in @selected_cells()
            c.execute()

    _focus_cell : (cell) ->
        if IS_MOBILE  # on mobile, cell focusing must be initiated by the user.
            return
        if @_current_cell?
            @_current_cell.selected(false)
        @_current_cell = cell
        cell.focus()

    _next_cell : (cell) ->
        e = cell.element[0]
        this_one = false
        for elt in @_cells.find(".salvus-cell:visible")
            if this_one
                return $(elt).data("cell")
            if elt == e
                this_one = true

    _prev_cell : (cell) ->
        e = cell.element[0]
        this_one = false
        last = undefined
        for elt in @_cells.find(".salvus-cell:visible")
            if elt == e
                this_one = true
                return $(last).data("cell")
            last = elt


    _append_new_cell: () ->
        @_insert_new_cell(location:'end')

    _new_cell: (obj) =>
        opts = copy(@opts.cell_opts)
        opts.session = @opts.session
        if obj?
            merge(opts, obj)
        else
            opts.id = uuid()

        cell = new Cell(opts)

        cell.on 'focus', =>
            @_last_focused_cell = cell

        cell.on 'execute-running', =>
            @element.addClass("salvus-worksheet-running")

        cell.on 'execute-done', =>
            @element.removeClass("salvus-worksheet-running")

        # User requested to move to the previous cell (e.g., via up arrow).
        cell.on 'previous-cell', =>
            p = @_prev_cell(cell)
            if p?
                @_focus_cell(p)

        # User requested to move to the next cell (e.g., via down arrow).
        cell.on 'next-cell', (create) =>
            n = @_next_cell(cell)
            if not n? and create? and create
                n = @_append_new_cell()
            if n?
                @_focus_cell(n)

        that = @
        changed = () -> that.has_unsaved_changes(true)

        cell.on "change", (desc) =>
            # Something changed, e.g., editing a note, input, etc.
            changed()

        # User requested to move this cell up
        cell.on 'move-cell-up', =>
            p = @_prev_cell(cell)
            if p?
                changed()
                cell.element.insertBefore(p.element)
                @_focus_cell(cell)
                @emit 'move-cell-up', cell.opts.id

        # User requested to move this cell down
        cell.on 'move-cell-down', =>
            n = @_next_cell(cell)
            if n?
                changed()
                cell.element.insertAfter(n.element)
                @_focus_cell(cell)
                @emit 'move-cell-down', cell.opts.id

        cell.on 'delete-cell', =>
            if @number_of_cells() == 1
                # can't delete last cell, since worksheets always have at least one cell
                return
            changed()
            @emit 'delete-cell', cell.opts.id
            cell_prev = @_prev_cell(cell)
            cell_next = @_next_cell(cell)
            note = cell.note()
            if note != ""
                if cell_next?
                    cell_next.note(note + '<br>' + cell_next.note())
                else if cell_prev?
                    cell_prev.note(cell_prev.note() + '<br>' + note)
            cell.remove()
            if cell_prev?
                @_focus_cell(cell_prev)
            else
                @_focus_cell(cell_next)

        cell.on 'split-cell', (before_cursor, after_cursor) =>
            changed()
            @emit 'split-cell', cell.opts.id, before_cursor, after_cursor
            # Create new cell after this one.
            new_cell = @_insert_new_cell(location:'after', cell:cell)
            # Move all text after cursor in this cell to beginning of new cell
            new_cell.input(after_cursor)
            new_cell.append_to_output(cell.output().children().detach())
            cell.input(before_cursor)
            @_focus_cell(new_cell)


        cell.on 'insert-new-cell-before', () =>
            changed()
            @emit 'insert-new-cell-before', cell.opts.id
            @_focus_cell(@_insert_new_cell(location:'before', cell:cell))

        cell.on 'insert-new-cell-after', () =>
            changed()
            @emit 'insert-new-cell-after', cell.opts.id
            @_focus_cell(@_insert_new_cell(location:'after', cell:cell))

        cell.on 'join-with-prev', () =>
            @emit 'join-with-prev', cell.opts.id
            prev_cell = @_prev_cell(cell)
            if not prev_cell?
                # If there is no cell above this one, do nothing.
                return
            changed()
            # Copy note contents to end of note of cell above.
            note = $.trim(cell.note())
            if note.length > 0
                prev_cell.note(prev_cell.note() + '<br>' + note)
            # Copy input to end of input above.
            prev_cell.append_to_input("\n" +cell.input())
            # Copy output to end of output above
            prev_cell.append_to_output(cell.output())
            # Delete this cell
            cell.remove()
            # Focus cell above
            @_focus_cell(prev_cell)


        cell.on 'checkbox-change', (shift) =>
            if shift and @last_checked_cell
                # Select everything between cell and last_checked_cell.
                checking = false
                new_state = cell.checkbox()
                for c in @cells()
                    if c == @last_checked_cell or c == cell
                        c.checkbox(new_state)
                        if not checking
                            checking = true
                        else
                            break
                    if checking
                        c.checkbox(new_state)
            @last_checked_cell = cell


    _insert_new_cell : (opts) =>
        opts = defaults opts,
            location    : required   # 'before', 'after', 'end', 'beginning'
            cell        : undefined  # must give if location='before' or 'after'.

        # appends new cell to end if c is undefined
        cell = @_new_cell()

        switch opts.location
            when 'after'
                # make sibling directly after cell
                cell.element.insertAfter(opts.cell.element)
            when 'before'
                # make sibling directly before cell
                cell.element.insertBefore(opts.cell.element)
            when 'end'
                # append as the last cell
                cell.append_to(@_cells)
            when 'beginning'
                cell.prepend_to(@_cells)
            else
                throw("invalid input to _insert_new_cell #{to_json(opts)}")

        return cell

    _to_obj: (c) =>
        # c is a DOM object (not jQuery wrapped), which defines
        # either a section or cell.
        c = $(c)
        if c.hasClass("salvus-worksheet-section")
            # It is a section
            title = c.find(".salvus-worksheet-section-title-user").data('raw')
            content = (@_to_obj(d) for d in $(c.find(".salvus-worksheet-section-cells")[0]).children())
            return {title: title,  content: content, id:c.attr("id")}
        else
            # It is a cell
            return c.data('cell').to_obj()

    _to_text: (c) =>
        # c is a DOM object (not jQuery wrapped), which defines
        # either a section or cell.
        c = $(c)
        if c.hasClass("salvus-worksheet-section")
            # It is a section
            title = c.find(".salvus-worksheet-section-title-user").data('raw')
            content = (@_to_text(d) for d in $(c.find(".salvus-worksheet-section-cells")[0]).children()).join('\n')
            content = ('    ' + x for x in content.split('\n')).join('\n')
            hashes = ('#' for i in [0...title.length+2]).join('')
            return "\n#{hashes}\n# #{title}\n#{hashes}\n#{content}\n"
        else
            # It is a cell
            return c.data('cell').to_text()

    _to_rest: (c) =>
        # c is a DOM object (not jQuery wrapped), which defines
        # either a section or cell.
        c = $(c)
        if c.hasClass("salvus-worksheet-section")
            # It is a section
            title = c.find(".salvus-worksheet-section-title-user").data('raw')
            content = (@_to_rest(d) for d in $(c.find(".salvus-worksheet-section-cells")[0]).children()).join('\n')
            content = ('    ' + x for x in content.split('\n')).join('\n')
            hashes = ('#' for i in [0...title.length+2]).join('')
            return "#{title}\n===========\n#{content}\n"
        else
            # It is a cell
            return c.data('cell').to_rest()

    _to_latex: (c) =>
        # c is a DOM object (not jQuery wrapped), which defines
        # either a section or cell.
        c = $(c)
        if c.hasClass("salvus-worksheet-section")
            # It is a section
            title = c.find(".salvus-worksheet-section-title-user").data('raw')
            content = (@_to_latex(d) for d in $(c.find(".salvus-worksheet-section-cells")[0]).children()).join('\n')
            return "\\section{#{title}}\n\n#{content}\n\n"
        else
            # It is a cell
            return c.data('cell').to_latex()

    # Append the cells/sections/etc. defined by the object c to the
    # DOM element elt, which must be jQuery wrapped.
    _append_content: (elt, content) =>
        # content = list of objects that defines cells and sections
        for c in content
            if c.content?  # c defines a section, since it has content
                section = @_new_section(id: c.id, title:c.title)
                section_cells = section.find(".salvus-worksheet-section-cells")
                elt.append(section)
                section.find(".salvus-worksheet-section-title-user").make_editable()  # do not call until object is visible.
                # Now append the cells (and sections) inside this section
                @_append_content(section_cells, c.content)
            else
                # c defines a cell.
                cell = @_new_cell(c)
                elt.append(cell.element)
                cell.refresh()

    #######################################################################
    # Public API
    # Unless otherwise stated, these methods can be chained.
    #######################################################################

    restart: () =>
        @opts.session.restart()
        for elt in @_cells.find(".salvus-cell")
            $(elt).data('cell').restart()

    kill: () =>
        @opts.session.restart()
        for elt in @_cells.find(".salvus-cell")
            $(elt).data('cell').kill()

    current_cell: () =>
        if not @_current_cell?
            @_current_cell = @_cells.find(".salvus-cell:first").data('cell')
        return @_current_cell

    focus: () =>
        @_focus_cell(@current_cell())

    selected_cells: () =>
        # Return array of all cells with checkboxes, or if there are none checked,
        # return the last focused cell.
        v = (c for c in @cells() when c.checkbox())
        if v.length == 0 and @_last_focused_cell?
            v = [@_last_focused_cell]
        return v

    worksheet_is_open: () =>
        return @element.closest(document.documentElement).length > 0

    # Return whatever filename the user has currently entered in the filename box.
    filename: () =>
        @element.find(".salvus-worksheet-filename").val()

    # Save the worksheet to the given path.
    save: (path, cb) =>
        if path == "" or not path?
            err = "You must enter a filename in order to save your worksheet."
            alert_message(type:'error', message:err)
            cb?(err)
            return
        if filename_extension(path) != 'sage-worksheet'
            path += '.sage-worksheet'
        obj = @to_obj()
        async.series([
            (cb) =>
                salvus_client.makedirs
                    project_id : @opts.project_id
                    path       : dirname(path)
                    cb         : cb

            (cb) =>
                salvus_client.write_text_file_to_project
                    project_id : @opts.project_id
                    path       : path
                    content    : JSON.stringify(obj, null, '\t')
                    timeout    : 10
                    cb         : cb
            (cb) =>
                # notify anyone who cares that a successful save with a given path took place
                @emit "save", path
                cb()
            (cb) =>
                # TODO: save new git commit back to database -- but we will probably remove this later; too aggressive
                salvus_client.save_project
                    project_id : @opts.project_id
                    cb         : (err, mesg) ->
                        # We do not quit no matter what
                        cb()
            (cb) =>
                # We also ensure all blobs referenced by the worksheet are made permanent.
                ids = @_new_blobs(obj.content)
                if ids.length > 0
                    salvus_client.save_blobs_to_project
                        project_id : @opts.project_id
                        blob_ids   : ids
                        cb         : (err) =>
                            if err
                                cb("Failed to write worksheet blobs -- #{err}")
                            else
                                for id in ids
                                    @_saved_blobs[id] = 'known'
                                cb()
                else
                    cb()

            (cb) =>
                # If path changed since the last successful save, delete that previous path.
                if @_last_path? and path != @_last_path
                    salvus_client.remove_file_from_project
                        project_id : @opts.project_id
                        path       : @_last_path
                        cb         : cb
                else
                    cb()

            (cb) =>
                @chdir(dirname(path))
                cb()

        ], (err) =>
            if err and err.indexOf('nothing to commit') == -1
                alert_message(type:"error", message:"Failed to save worksheet to #{path} -- #{err}")
            else
                @has_unsaved_changes(false)
            @_last_path = path
            cb?(err)
        )




    # has_unsaved_changes() returns the state, where true means that
    # there are unsaved changed.  To set the state, do
    # has_unsaved_changes(true or false).
    has_unsaved_changes: (state) =>
        if not state?
            # getting state
            # requesting state, which defaults to false.
            if not @_has_unsaved_changes?
                @_has_unsaved_changes = false
            return @_has_unsaved_changes
        else
            # setting state
            if @_has_unsaved_changes != state
                # Save the new state
                @_has_unsaved_changes = state

                # Then, change UI to reflect new state
                button = @element.find("a[href=#save]")
                if state
                    @emit 'change'
                    button.removeClass("disabled")
                else
                    button.addClass("disabled")

    # convert worksheet to object -- this is not lossy
    to_obj: () =>
        obj = {}

        if @opts.session?
            obj.session_uuid = @opts.session.session_uuid

        obj.title       = @get_title()
        obj.description = @get_description()
        obj.content     = (@_to_obj(c) for c in @_cells.children())

        return obj

    # convert worksheet to text/command line format -- this is lossy
    to_text: () =>
        return "# #{@get_title()}\n# #{@get_description()}\n\n" + (@_to_text(c) for c in @_cells.children()).join('')

    to_rest: () =>
        return "(ReST view NOT fully implemented!)\n#{@get_title()}\n===================\n#{@get_description()}\n----------------------\n\n" + (@_to_rest(c) for c in @_cells.children()).join('')


    to_latex: () =>
        s = "\\documentclass{#{@opts.latex_opts.documentclass}}\n#{@opts.latex_opts.preamble}\n"
        s += "\\title{#{@get_title()}}\n\n"
        s += "\\author{#{@get_description()}}\n\n"
        s += "\\begin{document}\n\\maketitle\n\n"
        if @opts.latex_opts.tableofcontents
            s += "\\tableofcontents\n\n"
        s += (@_to_latex(c) for c in @_cells.children()).join('\n')
        s += '\n\n\\end{document}'
        return s

    # Given worksheet content as returned by to_obj() above, rebuilt
    # the worksheet part of the DOM from scratching using this
    # content.
    set_content: (content) =>
        @_current_cell = undefined

        # Delete everything from the worksheet contents DOM.
        @_cells.children().remove()

        # Iterate through content adding sections and cells
        @_append_content(@_cells, content)

        # Optimization: initialize the _saved_blobs to all blobs on
        # worksheet load, since we may assume any blobs in a worksheet
        # that we have just loaded from disk have been saved... when
        # the worksheet was saved.  The user could construct some weird
        # worksheet that violates this, but that is their problem.
        @_saved_blobs = {}
        for b in @_new_blobs(content)
            @_saved_blobs[b] = 'known'

    set_title: (title) =>
        @element.find(".salvus-worksheet-title").html(title)

    get_title: () =>
        @element.find(".salvus-worksheet-title").data('raw')

    set_description: (description) ->
        @element.find(".salvus-worksheet-description").html(description)

    get_description: (description) ->
        @element.find(".salvus-worksheet-description").data('raw')

    #get_author: () =>
        # This is relative to who is viewing the worksheet.
    #    return require('account').account_settings.fullname()

    set_session: (session) ->
        @opts.session = session
        for c in @cells()
            c.set_session(session)

    # Return ordered array of the current cell objects (these are classes not DOM elements).
    cells: () ->
        return ($(c).data('cell') for c in @_cells.find(".salvus-cell"))

    number_of_cells: () ->
        return @_cells.find(".salvus-cell").length



exports.Worksheet = Worksheet

$.fn.extend
    salvus_worksheet: (opts={}) ->
        @each () ->
            opts0 = copy(opts)
            opts0.element = this
            $(this).data('worksheet', new Worksheet(opts0))
