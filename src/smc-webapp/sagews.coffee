##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015 -- 2016, SageMath, Inc.
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

$         = window.$
async     = require('async')
stringify = require('json-stable-stringify')

{MARKERS, FLAGS, ACTION_FLAGS, ACTION_SESSION_FLAGS} = require('smc-util/sagews')

{SynchronizedDocument2} = require('./syncdoc')

misc                 = require('smc-util/misc')
{defaults, required} = misc

misc_page         = require('./misc_page')
message           = require('smc-util/message')
markdown          = require('./markdown')
{salvus_client}   = require('./salvus_client')
{redux}           = require('./smc-react')
{alert_message}   = require('./alerts')

{sagews_eval}     = require('./sagews-eval')

{IS_MOBILE}       = require('./feature')

templates           = $("#salvus-editor-templates")
cell_start_template = templates.find(".sagews-input")
output_template     = templates.find(".sagews-output")

log = (s) -> console.log(s)

CLIENT_SIDE_MODE_LINES = {}
for mode in ['md', 'html', 'coffeescript', 'javascript', 'cjsx']
    CLIENT_SIDE_MODE_LINES["%#{mode}"] = {mode:mode}
    CLIENT_SIDE_MODE_LINES["%#{mode}(hide=false)"] = {mode:mode, hide:false}
    CLIENT_SIDE_MODE_LINES["%#{mode}(hide=true)"]  = {mode:mode, hide:true}
    CLIENT_SIDE_MODE_LINES["%#{mode}(hide=0)"]     = {mode:mode, hide:false}
    CLIENT_SIDE_MODE_LINES["%#{mode}(hide=1)"]     = {mode:mode, hide:true}
    CLIENT_SIDE_MODE_LINES["%#{mode}(once=false)"] = {mode:mode}
    CLIENT_SIDE_MODE_LINES["%#{mode}(once=0)"]     = {mode:mode}

MARKERS_STRING = MARKERS.cell + MARKERS.output
is_marked = (c) ->
    if not c?
        return false
    return c.indexOf(MARKERS.cell) != -1 or c.indexOf(MARKERS.output) != -1

# Create gutter elements
open_gutter_elt   = $('<div class="CodeMirror-foldgutter-open CodeMirror-guttermarker-subtle"></div>')
folded_gutter_elt = $('<div class="CodeMirror-foldgutter-folded CodeMirror-guttermarker-subtle"></div>')
line_number_elt   = $("<div style='color:#88f'></div>")

class SynchronizedWorksheet extends SynchronizedDocument2
    constructor: (@editor, @opts) ->
        # window.w = @

        # these two lines are assumed, at least by the history browser
        @codemirror  = @editor.codemirror
        @codemirror1 = @editor.codemirror1

        # Code execution queue.
        @execution_queue = new ExecutionQueue(@_execute_cell_server_side, @)

        # We set a custom rangeFinder that is output cell marker aware.
        # See https://github.com/sagemathinc/smc/issues/966
        foldOptions =
            rangeFinder : (cm, start) ->
                helpers = cm.getHelpers(start, "fold")
                for h in helpers
                    cur = h(cm, start)
                    if cur
                        i = start.line
                        while i < cur.to.line and cm.getLine(i+1)?[0] != MARKERS.output
                            i += 1
                        if cm.getLine(i+1)?[0] == MARKERS.output
                            cur.to.line = i
                            cur.to.ch = cm.getLine(i).length
                        return cur

        for cm in @codemirrors()
            cm.setOption('foldOptions', foldOptions)

        if @opts.static_viewer
            @readonly   = true
            @project_id = @editor.project_id
            @filename   = @editor.filename
            return

        opts0 =
            cursor_interval : @opts.cursor_interval
            sync_interval   : @opts.sync_interval
        super @editor, opts0, () =>

            @readonly = @_syncstring.get_read_only()  # TODO: harder problem -- if file state flips between read only and not, need to rerender everything...

            @init_hide_show_gutter()  # must be after @readonly set

            @process_sage_updates(caller:"constructor")   # MUST be after @readonly is set.

            if not @readonly
                @status cb: (err, status) =>
                    if not status?.running
                        @execute_auto_cells()
                    else
                        # Kick the worksheet process into gear if it isn't running already
                        @introspect_line
                            line     : "return?"
                            timeout  : 30
                            preparse : false
                            cb       : (err) =>

            @on 'sync', () =>
                #console.log("sync")
                @process_sage_update_queue()

            @editor.on 'show', (height) =>
                @set_all_output_line_classes()

            @editor.on 'toggle-split-view', =>
                @process_sage_updates(caller:"toggle-split-view")

            @init_worksheet_buttons()

            v = [@codemirror, @codemirror1]
            for cm in v
                cm.on 'beforeChange', (instance, changeObj) =>
                    #console.log("beforeChange (#{instance.name}): #{misc.to_json(changeObj)}")
                    # Set the evaluated flag to false for the cell that contains the text
                    # that just changed (if applicable)
                    if changeObj.origin == 'redo'
                        return
                    if changeObj.origin == 'undo'
                        return
                    if changeObj.origin? and changeObj.origin != 'setValue'
                        @remove_this_session_flags_from_changeObj_range(changeObj)

                    if changeObj.origin == 'paste'
                        changeObj.cancel()
                        # WARNING: The Codemirror manual says "Note: you may not do anything
                        # from a "beforeChange" handler that would cause changes to the
                        # document or its visualization."  I think this is OK below though
                        # since we just canceled the change.
                        @remove_cell_flags_from_changeObj(changeObj, ACTION_SESSION_FLAGS)
                        @_apply_changeObj(changeObj)
                        @process_sage_updates(caller:"paste")
                        @sync()

                cm.on 'change', (instance, changeObj) =>
                    #console.log('changeObj=', changeObj)
                    if changeObj.origin == 'undo' or changeObj.origin == 'redo'
                        return
                    start = changeObj.from.line
                    stop  = changeObj.to.line + changeObj.text.length + 1 # changeObj.text is an array of lines

                    if @editor.opts.line_numbers
                        # If stop isn't at a marker, extend stop to include the rest of the input,
                        # so relative line numbers for this cell get updated.
                        x = cm.getLine(stop)?[0]
                        if x != MARKERS.cell and x != MARKERS.output
                            n = cm.lineCount() - 1
                            while stop < n and x != MARKERS.output and x != MARKERS.cell
                                stop += 1
                                x = cm.getLine(stop)?[0]

                        # Similar for start
                        x = cm.getLine(start)?[0]
                        if x != MARKERS.cell and x != MARKERS.output
                            while start > 0 and x != MARKERS.cell and x != MARKERS.output
                                start -= 1
                                x = cm.getLine(start)?[0]

                    if not @_update_queue_start? or start < @_update_queue_start
                        @_update_queue_start = start
                    if not @_update_queue_stop? or stop > @_update_queue_stop
                        @_update_queue_stop = stop
                    @process_sage_update_queue()

    close: =>
        @execution_queue?.close()
        super()

    init_hide_show_gutter: () =>
        gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "smc-sagews-gutter-hide-show"]
        for cm in [@codemirror, @codemirror1]
            cm.setOption('gutters', gutters)
            cm.on 'gutterClick', @_handle_input_hide_show_gutter_click

    _handle_input_hide_show_gutter_click: (cm, line, gutter) =>
        if gutter != 'smc-sagews-gutter-hide-show'
            return
        x = cm.getLine(line)
        switch x[0]
            when MARKERS.cell
                @action(pos:{line:line, ch:0}, toggle_input:true)
            when MARKERS.output
                @action(pos:{line:line, ch:0}, toggle_output:true)

    _apply_changeObj: (changeObj) =>
        @codemirror.replaceRange(changeObj.text, changeObj.from, changeObj.to)
        if changeObj.next?
            @_apply_changeObj(changeObj.next)

    # Get cell at current line or return undefined if create=false
    # and there is no complete cell with input and output.
    cell: (line, create=true) =>
        {start, end} = @current_input_block(line)
        if not create
            cm = @focused_codemirror()
            if cm.getLine(start)?[0] != MARKERS.cell or cm.getLine(end)?[0] != MARKERS.output
                return
        return new SynchronizedWorksheetCell(@, start, end)
        # CRITICAL: We do **NOT** cache cells.  The reason is that client code should create
        # a cell for a specific purpose then forget about it as soon as that is done!!!
        # The reason is that at any time new input cell lines can be added in the
        # middle of a cell, and in general the document can change arbitrarily.
        # Keeping a big list of cells in sync with the document would be
        # extremely difficult and inefficient.  Instead, this cell class just provides
        # a clean abstraction for doing specific things with cells.

    # Return list of all cells that are touched by the current selection
    # or contain any cursors.
    get_current_cells: (create=true) =>
        cm = @focused_codemirror()
        cells = []
        top = undefined
        process_line = (n) =>
            if not top? or n < top
                cell = @cell(n, create)
                if cell?
                    cells.push(cell)
                    top = cell.start_line()
        # "These [selections] will always be sorted, and never overlap (overlapping selections are merged)."
        for sel in cm.listSelections().reverse()
            n = sel.anchor.line; m = sel.head.line
            if n == m
                process_line(n)
            else if n < m
                for i in [m..n]
                    process_line(i)
            else
                for i in [n..m]
                    process_line(i)
        return cells.reverse()

    get_all_cells: =>
        cm = @focused_codemirror()
        cells = []
        top = undefined
        process_line = (n) =>
            if not top? or n < top
                cell = @cell(n)
                cells.push(cell)
                top = cell.start_line()
        n = cm.lineCount() - 1
        while n > 0 and cm.getLine(n)[0] != MARKERS.output # skip empty lines at end so don't create another cell
            n -= 1
        if n == 0
            # no cells yet
            return []
        while n >= 0
            process_line(n)
            n -= 1
        return cells.reverse()

    process_sage_update_queue: =>
        #console.log("process, start=#{@_update_queue_start}, stop=#{@_update_queue_stop}")
        @process_sage_updates
            start  : @_update_queue_start
            stop   : @_update_queue_stop
            caller : 'queue'
        @_update_queue_start = undefined
        @_update_queue_stop  = undefined

    init_worksheet_buttons: () =>
        buttons = @element.find(".salvus-editor-codemirror-worksheet-buttons")
        buttons.show()
        buttons.find("a").tooltip(delay:{ show: 500, hide: 100 })
        buttons.find("a[href=\"#execute\"]").click () =>
            @action(execute:true, advance:false)
            @focused_codemirror().focus()
            return false
        buttons.find("a[href=\"#toggle-input\"]").click () =>
            @action(execute:false, toggle_input:true)
            @focused_codemirror().focus()
            return false
        buttons.find("a[href=\"#toggle-output\"]").click () =>
            @action(execute:false, toggle_output:true)
            @focused_codemirror().focus()
            return false
        buttons.find("a[href=\"#delete-output\"]").click () =>
            @action(execute:false, delete_output:true)
            @focused_codemirror().focus()
            return false

        if IS_MOBILE
            buttons.find("a[href=\"#tab\"]").click () =>
                @editor.press_tab_key(@editor.codemirror_with_last_focus)
                @focused_codemirror().focus()
                return false
        else
            @element.find("a[href=\"#tab\"]").hide()
            @element.find("a[href=\"#undo\"]").hide()
            @element.find("a[href=\"#redo\"]").hide()

        buttons.find("a[href=\"#new-html\"]").click () =>
            cm = @focused_codemirror()
            line = cm.lineCount()-1
            while line >= 0 and cm.getLine(line) == ""
                line -= 1
            if line >= 0 and cm.getLine(line)[0] == MARKERS.cell
                cm.replaceRange("%html\n", {line:line+1,ch:0})
                cm.setCursor(line:line+1, ch:0)
            else
                cm.replaceRange("\n\n\n", {line:line+1,ch:0})
                @cell_start_marker(line+1)
                @cell_start_marker(line+3)
                cm.replaceRange("%html\n", {line:line+2,ch:0})
                cm.setCursor(line:line+2, ch:0)
            @action
                execute : true
                advance : true
            @focused_codemirror().focus()

        interrupt_button = buttons.find("a[href=\"#interrupt\"]").click () =>
            interrupt_button.find("i").addClass('fa-spin')
            @interrupt
                maxtime : 15
                cb : (err) =>
                    interrupt_button.find("i").removeClass('fa-spin')
                    if err
                        alert_message(type:"error", message:"Unable to interrupt worksheet; try restarting the worksheet instead.")
            @focused_codemirror().focus()
            return false

        kill_button = buttons.find("a[href=\"#kill\"]").click () =>
            kill_button.find("i").addClass('fa-spin')
            @_restarting = true
            @kill
                restart : true
                cb      : (err) =>
                    delete @_restarting  # must happen *before* emiting the restarted event
                    @emit('restarted', err)
                    kill_button.find("i").removeClass('fa-spin')
                    if err
                        alert_message(type:"error", message:"Unable to restart worksheet (the system might be heavily loaded causing Sage to take a while to restart -- try again in a minute)")
            @focused_codemirror().focus()
            return false

    html_editor_save_selection: () =>
        if not @_html_editor_with_focus?
            return
        #console.log("save_selection")
        @html_editor_selection = misc_page.save_selection()
        @html_editor_div = @_html_editor_with_focus
        @html_editor_scroll_info = @focused_codemirror().getScrollInfo()

    html_editor_restore_selection: () =>
        if @html_editor_selection?
            misc_page.restore_selection(@html_editor_selection)
            #delete @html_editor_selection

    html_editor_link: () =>
        @html_editor_restore_selection()
        selection = document.getSelection()
        displayed_text = selection+""

        dialog = templates.find(".salvus-html-editor-link-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            setTimeout(focus, 50)
            return false
        url = dialog.find(".salvus-html-editor-url")
        url.focus()
        display = dialog.find(".salvus-html-editor-display")
        target  = dialog.find(".salvus-html-editor-target")
        title   = dialog.find(".salvus-html-editor-title")

        display.val(displayed_text)

        submit = () =>
            dialog.modal('hide')
            if target.val() == "_blank"
                target = " target='_blank'"
            else
                target = ''
            s = "<a href='#{url.val()}' title='#{title.val()}'#{target}>#{display.val()}</a>"
            @html_editor_exec_command('insertHTML', s)  #TODO: won't work in IE

        dialog.find(".btn-submit").off('click').click(submit)
        dialog.keydown (evt) =>
            if evt.which == 13 # enter
                submit()
                return false
            if evt.which == 27 # escape
                dialog.modal('hide')
                return false

    html_editor_insert_equation: (display) =>
        if not @html_editor_div?
            return
        id = misc.uuid()
        @html_editor_exec_command('insertHTML', "<span id=#{id} contenteditable=false></span>")

        e = $("##{id}")
        onchange = @html_editor_div.data('onchange')
        e.equation_editor
            display  : display
            value    : 'x^2'
            onchange : onchange
        onchange()

    html_editor_equation: () =>
        @html_editor_insert_equation(false)

    html_editor_display_equation: () =>
        @html_editor_insert_equation(true)

    html_editor_image: () =>
        @html_editor_restore_selection()

        dialog = templates.find(".salvus-html-editor-image-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            setTimeout(focus, 50)
            return false
        url = dialog.find(".salvus-html-editor-url")
        url.focus()

        submit = () =>
            dialog.modal('hide')
            height = width = ''
            h = dialog.find(".salvus-html-editor-height").val().trim()
            if h.length > 0
                height = " height=#{h}"
            w = dialog.find(".salvus-html-editor-width").val().trim()
            if w.length > 0
                width = " width=#{w}"
            s = "<img src='#{url.val()}'#{width}#{height}>"
            @html_editor_exec_command('insertHTML', s)

        dialog.find(".btn-submit").off('click').click(submit)
        dialog.keydown (evt) =>
            if evt.which == 13 # enter
                submit()
                return false
            if evt.which == 27 # escape
                dialog.modal('hide')
                return false

    html_editor_exec_command: (cmd, args) =>
        # TODO: get rid of all this rangy related editor code.
        # this sucked, and the new codemirror-author stuff is the way to go.
        if not rangy?
            return
        #console.log("html_editor_exec_command #{misc.to_json([cmd,args])}")
        if @html_editor_scroll_info?
            @focused_codemirror().scrollTo(@html_editor_scroll_info.left, @html_editor_scroll_info.top)
        @html_editor_restore_selection()
        if cmd == "ClassApplier"
            rangy?.createClassApplier(args[0], args[1]).applyToSelection()
        else
            if cmd == "insertHTML"
                # more solid and cross platform, e.g., insertHTML doesn't exist on IE
                sel = rangy?.getSelection()
                r = sel.getAllRanges()[0]
                if typeof(args) != 'string'
                    args = args[0]
                r.insertNode($(args)[0])
            else
                document.execCommand(cmd, 0, args)  # TODO: make more cross platform
        @html_editor_save_selection()
        @html_editor_div?.data('onchange')?()

    init_html_editor_buttons: () =>
        @html_editor_bar = button_bar = @element.find(".salvus-editor-codemirror-worksheet-editable-buttons")
        @html_editor_bar.find("a").tooltip(delay:{ show: 500, hide: 100 })
        @html_editor_bar.find(".smc-tooltip").tooltip(delay:{ show: 500, hide: 100 })

        that = @
        button_bar.find("a").click () ->
            that.html_editor_restore_selection()
            args = $(this).data('args')
            cmd  = $(this).attr('href').slice(1)
            if args == 'special'
                that["html_editor_#{cmd}"]()
                return false
            #console.log(cmd, args)
            if args? and typeof(args) != 'object'
                args = "#{args}"
                if args.indexOf(',') != -1
                    args = args.split(',')
            #console.log("after", args)
            that.html_editor_exec_command(cmd, args)
            return false

        # initialize the color control
        init_color_control = () =>
            elt   = button_bar.find(".sagews-output-editor-foreground-color-selector")
            if IS_MOBILE
                elt.hide()
                return
            button_bar_input = elt.find("input").colorpicker()
            sample = elt.find("i")
            set = (hex) ->
                # The CSS wrapping version keeps wrapping new spans hence sucks.
                #args = [null, {elementProperties:{style:{color:hex}}}]
                #that.html_editor_exec_command("ClassApplier", args)
                sample.css("color", hex)
                button_bar_input.css("background-color", hex)
                that.html_editor_exec_command("foreColor", hex)

            button_bar_input.change (ev) ->
                hex = button_bar_input.val()
                set(hex)

            button_bar_input.on "changeColor", (ev) ->
                hex = ev.color.toHex()
                set(hex)

            sample.click (ev) ->
                that.html_editor_restore_selection()
                button_bar_input.colorpicker('show')

            set("#000000")

        init_color_control()

        # initialize the color control
        init_background_color_control = () =>
            elt   = button_bar.find(".sagews-output-editor-background-color-selector")
            if IS_MOBILE
                elt.hide()
                return
            button_bar_input = elt.find("input").colorpicker()
            sample = elt.find("i")
            set = (hex) ->
                button_bar_input.css("background-color", hex)
                elt.find(".input-group-addon").css("background-color", hex)
                that.html_editor_exec_command("hiliteColor", hex)

            button_bar_input.change (ev) ->
                hex = button_bar_input.val()
                set(hex)

            button_bar_input.on "changeColor", (ev) ->
                hex = ev.color.toHex()
                set(hex)

            sample.click (ev) ->
                that.html_editor_restore_selection()
                button_bar_input.colorpicker('show')

            set("#fff8bd")

        init_background_color_control()

    _is_dangerous_undo_step: (cm, changes) =>
        if not changes?
            return false
        for c in changes
            if c.from.line == c.to.line
                if c.from.line < cm.lineCount()  # ensure we have such line in document
                    if is_marked(cm.getLine(c.from.line))
                        return true
            for t in c.text
                if is_marked(t)
                    return true
        return false

    on_undo: (cm, changeObj) =>
        u = cm.getHistory().undone
        if u.length > 0 and @_is_dangerous_undo_step(cm, u[u.length-1].changes)
            #console.log("on_undo(repeat)")
            try
                cm.undo()
            catch e
                console.warn("skipping undo: ",e)
        @process_sage_updates() # reprocess entire buffer -- e.g., output could change in strange ways
        @set_all_output_line_classes()

    on_redo: (cm, changeObj) =>
        u = cm.getHistory().done
        if u.length > 0 and @_is_dangerous_undo_step(cm, u[u.length-1].changes)
            #console.log("on_redo(repeat)")
            try
                cm.redo()
                # TODO: having to do this is potentially very bad/slow if document has large number
                # to do this.  This is temporary anyways, since we plan to get rid of using codemirror
                # undo entirely.
            catch e
                console.warn("skipping redo: ",e)
        @process_sage_updates() # reprocess entire buffer
        @set_all_output_line_classes()

    interrupt: (opts={}) =>
        opts = defaults opts,
            maxtime : 15
            cb      : undefined
        if @readonly
            opts.cb?(); return
        @close_on_action()
        t = misc.walltime()
        @execution_queue?.clear()
        @clear_action_flags(false)
        async.series([
            (cb) =>
                @send_signal
                    signal : 2
                    cb     : cb
            (cb) =>
                @start
                    maxtime : opts.maxtime - misc.walltime(t)
                    cb      : cb
        ], (err) => opts.cb?(err))

    clear_action_flags: (this_session) =>
        flags = if this_session then ACTION_SESSION_FLAGS else ACTION_FLAGS
        for cell in @get_all_cells()
            for flag in flags
                cell.remove_cell_flag(flag)

    kill: (opts={}) =>
        opts = defaults opts,
            restart : false
            maxtime : 60
            cb      : undefined
        if @readonly
            opts.cb?(); return
        t = misc.walltime()
        @close_on_action()
        @clear_action_flags(true)
        # Empty the execution queue.
        @execution_queue?.clear()
        @process_sage_updates(caller:"kill")
        if opts.restart
            @restart(cb:opts.cb)
        else
            @send_signal
                signal : 9
                cb     : opts.cb

    # ensure that the sage process is working and responding to compute requests
    start: (opts={}) =>
        opts = defaults opts,
            maxtime : 60        # (roughly) maximum amount of time to try to restart
            cb      : undefined
        if @readonly
            opts.cb?(); return

        if opts.maxtime <= 0
            opts.cb?("timed out trying to start Sage worksheet - system may be heavily loaded or Sage is broken.")
            return

        timeout = 0.5
        f = (cb) =>
            timeout = Math.min(10, 1.4*timeout)
            @introspect_line
                line     : "return?"
                timeout  : timeout
                preparse : false
                cb       : (resp) =>
                    cb()

        misc.retry_until_success
            f        : f
            max_time : opts.maxtime*1000
            cb       : opts.cb

    restart: (opts) =>
        opts = defaults opts,
            cb  : undefined
        @sage_call
            input : {event:'restart'}
            cb    : =>
                @execute_auto_cells()
                opts.cb?()

    send_signal: (opts) =>
        opts = defaults opts,
            signal : 2
            cb     : undefined
        @sage_call
            input : {event:'signal', signal:opts.signal}
            cb    : () => opts.cb?()

    introspect_line: (opts) =>
        opts = defaults opts,
            line     : required
            top      : undefined
            preparse : true
            timeout  : undefined
            cb       : required
        @sage_call
            input :
                event    : 'introspect'
                line     : opts.line
                top      : opts.top
                preparse : opts.preparse
            cb    : opts.cb

    introspect: () =>
        if @opts.static_viewer
            return
        if @readonly
            return
        # TODO: obviously this wouldn't work in both sides of split worksheet.
        cm = @focused_codemirror()
        pos  = cm.getCursor()
        cib = @current_input_block(pos.line)
        if cib.start == cib.end
            toplineno = cib.start
        else
            toplineno = cib.start + 1
        # added topline for jupyter decorator autocompletion
        topline = cm.getLine(toplineno)
        line = cm.getLine(pos.line).slice(0, pos.ch)
        if pos.ch == 0 or line[pos.ch-1] in ")]}'\"\t "
            if @editor.opts.spaces_instead_of_tabs
                cm.tab_as_space()
            else
                CodeMirror.commands.defaultTab(cm)
            return
        @introspect_line
            line : line
            top  : topline
            cb   : (mesg) =>
                if mesg.event == "error" or not mesg?.target?  # some other sort of error, e.g., mesg = 'some error' ?
                    # First, there is no situation I can think of where this happens... though
                    # of course it does.
                    # Showing user an alert_message at this point isn't useful; but we do want to know
                    # about this.  The user is just going to see no completion or popup, which is
                    # possibly reasonable behavior from their perspective.
                    # NOTE: we do get mesg.event not error, but mesg.target isn't defined: see https://github.com/sagemathinc/smc/issues/1685
                    err = "sagews: unable to instrospect '#{line}' -- #{JSON.stringify(mesg)}"
                    console.log(err)  # this is intentional... -- it's may be useful to know
                    salvus_client.log_error(err)
                    return
                else
                    from = {line:pos.line, ch:pos.ch - mesg.target.length}
                    elt = undefined
                    switch mesg.event
                        when 'introspect_completions'
                            cm.showCompletions
                                from             : from
                                to               : pos
                                completions      : mesg.completions
                                target           : mesg.target
                                completions_size : @editor.opts.completions_size

                        when 'introspect_docstring'
                            elt = cm.showIntrospect
                                from      : from
                                content   : mesg.docstring
                                target    : mesg.target
                                type      : "docstring"

                        when 'introspect_source_code'
                            elt = cm.showIntrospect
                                from      : from
                                content   : mesg.source_code
                                target    : mesg.target
                                type      : "source-code"

                        else
                            console.log("BUG -- introspect_line -- unknown event #{mesg.event}")
                    if elt?
                        @close_on_action(elt)

    elt_at_mark: (mark) =>
        return mark?.element

    cm_wrapper: () =>
        if @_cm_wrapper?
            return @_cm_wrapper
        return @_cm_wrapper = $(@codemirror.getWrapperElement())

    cm_lines: () =>
        if @_cm_lines?
            return @_cm_lines
        return @_cm_lines = @cm_wrapper().find(".CodeMirror-lines")

    pad_bottom_with_newlines: (n) =>
        if @opts.static_viewer
            return
        cm = @codemirror
        m = cm.lineCount()
        if m <= 13  # don't bother until worksheet gets big
            return
        j = m-1
        while j >= 0 and j >= m-n and cm.getLine(j).length == 0
            j -= 1
        k = n - (m - (j + 1))
        if k > 0
            cursor = cm.getCursor()
            cm.replaceRange(Array(k+1).join('\n'), {line:m+1, ch:0} )
            cm.setCursor(cursor)

    # change the codemirror editor to reflect the proper sagews worksheet markup.
    process_sage_updates: (opts={}) =>
        opts = defaults opts,
            start         : undefined    # process starting at this line (0-based); 0 if not given
            stop          : undefined    # end at this line (0-based); last line if not given
            cm            : undefined    # only markup changes, etc., using the given editor (uses all visible ones by default)
            pad_bottom    : 10           # ensure there are this many blank lines at bottom of document
            caller        : undefined
        #console.log("process_sage_updates", @readonly, opts.caller)
        # For each line in the editor (or starting at line start), check if the line
        # starts with a cell or output marker and is not already marked.
        # If not marked, mark it appropriately, and possibly process any
        # changes to that line.
        #tm = misc.mswalltime()
        before = @editor.codemirror.getValue()
        if opts.pad_bottom
            @pad_bottom_with_newlines(opts.pad_bottom)
        try
            if not opts.cm?
                @_process_sage_updates(@editor.codemirror, opts.start, opts.stop)
                if @editor._layout > 0
                    @_process_sage_updates(@editor.codemirror1, opts.start, opts.stop)
            else
                @_process_sage_updates(opts.cm, opts.start, opts.stop)
        catch e
            console.log("Error rendering worksheet", e)

        #console.log("process_sage_updates(opts=#{misc.to_json({caller:opts.caller, start:opts.start, stop:opts.stop})}): time=#{misc.mswalltime(tm)}ms")

        after = @editor.codemirror.getValue()
        if before != after and not @readonly
            @_syncstring.set(after)

    _process_sage_updates: (cm, start, stop) =>
        #dbg = (m) -> console.log("_process_sage_updates: #{m}")
        #dbg("start=#{start}, stop=#{stop}")
        if not cm?
            cm = @focused_codemirror()
        if not start?
            start = 0
        if not stop?
            stop = cm.lineCount()-1
        context = {uuids:{}}
        for line in [start..stop]
            @_process_line(cm, line, context)

    _handle_input_cell_click0: (e, mark) =>
        @insert_new_cell(mark.find()?.from.line)

    _handle_input_cell_click: (e, mark) =>
        if IS_MOBILE
            # It is way too easy to accidentally click on the insert new cell line on mobile.
            bootbox.confirm "Create new cell?", (result) =>
                if result
                    @_handle_input_cell_click0(e, mark)
                else # what the user really wants...
                    cm = @focused_codemirror()
                    cm.focus()
                    cm.setCursor({line:mark.find().from.line+1, ch:0})
        else
            @_handle_input_cell_click0(e, mark)
        return false

    # Process the codemirror gutter local SMC line number and input/output toggles
    #   cm = codemirror editor
    #   line = the line number (0 based)
    #   mode = the mode for the line: 'show', 'hide', 'number'
    #   relative_line = the relative line number
    _process_line_gutter: (cm, line, mode, relative_line) =>
        # nb: I did implement a non-jQuery version of this function; the speed was *identical*.
        want = mode + relative_line  # we want the HTML node to have these params.
        elt  = cm.lineInfo(line).gutterMarkers?['smc-sagews-gutter-hide-show']
        if elt?.smc_cur == want  # gutter is already defined and set as desired.
            return
        switch mode
            when 'show'
                # A show toggle triangle
                elt = open_gutter_elt.clone()[0]
            when 'hide'
                # A hide triangle
                elt = folded_gutter_elt.clone()[0]
            when 'number'
                # A line number
                if not @editor.opts.line_numbers
                    # Ignore because line numbers are disabled
                    return
                if elt?.className == ''
                    # Gutter elt is already a plain div, so just chnage innerHTML
                    elt.smc_cur = want
                    elt.innerHTML = relative_line
                    return
                # New gutter element
                elt = line_number_elt.clone().text(relative_line)[0]
            else
                console.warn("sagews unknown mode '#{mode}'")
        if elt?
            elt.smc_cur = want  # elt will have this mode/line
            # Now set it.
            cm.setGutterMarker(line, 'smc-sagews-gutter-hide-show', elt)

    _process_line: (cm, line, context) =>
        ###
        - Ensure that cell start line is properly marked so it looks like a horizontal
          line, which can be clicked, and is colored to indicate state.

        - Ensure that cell output line is replaced by an output element, with the proper
          output rendered in it.
        ###
        x = cm.getLine(line)
        if not x?
            return

        marks = (m for m in cm.findMarks({line:line, ch:0}, {line:line,ch:x.length}) when m.type != 'bookmark')
        if marks.length > 1
            # There should never be more than 1 mark on a line
            for m in marks.slice(1)
                m.clear()
            marks = [marks[0]]

        switch x[0]
            when MARKERS.cell
                uuid = x.slice(1, 37)
                if context.uuids[uuid]
                    # seen this before -- so change it
                    uuid = misc.uuid()
                    cm.replaceRange(uuid, {line:line, ch:1}, {line:line, ch:37})
                context.uuids[uuid] = true
                context.input_line = line
                flagstring = x.slice(37, x.length-1)

                if FLAGS.hide_input in flagstring
                    @_process_line_gutter(cm, line, 'hide')
                    context.hide = line
                else
                    @_process_line_gutter(cm, line, 'show')
                    delete context.hide

                # Record whether or not the output for this cell should be hidden.
                context.hide_output = FLAGS.hide_output in flagstring

                # Determine the output line, if available, so we can toggle whether or not
                # the output is hidden.  Note that we are not doing something based on
                # state change, as that is too hard to reason about, and are just always
                # setting the line classes properly.  This will have to be re-done someday.
                n = line + 1
                output_line = undefined
                while n < cm.lineCount()
                    z = cm.getLine(n)
                    if z?[0] == MARKERS.output
                        output_line = n
                        break
                    if z?[0] == MARKERS.input or not z?[0]?
                        break
                    n += 1

                if output_line? # found output line -- properly set hide state
                    output_marks = cm.findMarks({line:output_line, ch:0}, {line:output_line, ch:z.length})
                    if context.hide_output
                        @_process_line_gutter(cm, output_line, 'hide')
                        output_marks?[0]?.element.hide()
                    else
                        @_process_line_gutter(cm, output_line, 'show')
                        output_marks?[0]?.element.show()


                if marks.length == 1 and (marks[0].type != 'input' or marks[0].uuid != uuid)
                    marks[0].clear()
                    marks = []
                if marks.length == 0
                    # create the input mark here
                    #console.log("creating input mark at line #{line}")
                    input = cell_start_template.clone()
                    opts =
                        shared         : false
                        inclusiveLeft  : false
                        inclusiveRight : true
                        atomic         : true
                        replacedWith   : input[0] #$("<div style='margin-top: -30px; border: 1px solid red'>")[0]
                    mark = cm.markText({line:line, ch:0}, {line:line, ch:x.length}, opts)
                    marks.push(mark)
                    mark.element = input
                    mark.type = 'input'
                    mark.uuid = uuid
                    if not @readonly
                        input.addClass('sagews-input-live')
                        input.click((e) => @_handle_input_cell_click(e, mark))

                if not @readonly
                    elt = marks[0].element
                    if FLAGS.waiting in flagstring
                        elt.data('execute',FLAGS.waiting)
                        @set_input_state(elt:elt, run_state:'waiting')
                    else if FLAGS.execute in flagstring
                        elt.data('execute',FLAGS.execute)
                        @set_input_state(elt:elt, run_state:'execute')
                    else if FLAGS.running in flagstring
                        elt.data('execute',FLAGS.running)
                        @set_input_state(elt:elt, run_state:'running')
                    else
                        # code is not running
                        elt.data('execute','done')
                        @set_input_state(elt:elt, run_state:'done')
                    # set marker of whether or not this cell was evaluated during this session
                    if FLAGS.this_session in flagstring
                        @set_input_state(elt:elt, eval_state:true)
                    else
                        @set_input_state(elt:elt, eval_state:false)


            when MARKERS.output

                uuid = x.slice(1,37)
                if context.uuids[uuid]
                    # seen this id before (in a previous cell!) -- so change it
                    uuid = misc.uuid()
                    cm.replaceRange(uuid, {line:line, ch:1}, {line:line, ch:37})
                context.uuids[uuid] = true
                if marks.length == 1 and (marks[0].type != 'output' or marks[0].uuid != uuid)
                    marks[0].clear()
                    marks = []
                if marks.length == 0
                    # create the output mark here
                    #console.log("creating output mark at line #{line}")
                    output = output_template.clone()
                    opts =
                        shared         : false
                        inclusiveLeft  : true
                        inclusiveRight : true
                        atomic         : true
                        replacedWith   : output[0]
                    mark = cm.markText({line:line, ch:0}, {line:line, ch:x.length}, opts)
                    mark.element = output
                    mark.type = 'output'
                    mark.uuid = uuid
                    mark.rendered = ''
                    marks.push(mark)

                cm.addLineClass(line, 'gutter', 'sagews-output-cm-gutter')
                cm.addLineClass(line, 'text',   'sagews-output-cm-text')
                cm.addLineClass(line, 'wrap',   'sagews-output-cm-wrap')

                # To be sure, definitely properly set output state (should already be properly set when rendering input)
                if context.hide_output
                    @_process_line_gutter(cm, line, 'hide')
                    marks[0].element.hide()
                else
                    @_process_line_gutter(cm, line, 'show')
                    marks[0].element.show()

                @render_output(marks[0], x.slice(38), line)

            else
                if @editor.opts.line_numbers
                    input_line = context.input_line
                    if not input_line?
                        input_line = line - 1
                        while input_line >= 0 and cm.getLine(input_line)[0] != MARKERS.cell
                            input_line -= 1
                    @_process_line_gutter(cm, line, 'number', line - input_line) # relative line number
                else
                    @_process_line_gutter(cm, line)

                for b in [MARKERS.cell, MARKERS.output]
                    i = x.indexOf(b)
                    if i != -1
                        cm.replaceRange('', {line:line,ch:i}, {line:line, ch:x.length})
                        x = x.slice(0, i)

                if context.hide?
                    if marks.length > 0 and marks[0].type != 'hide'
                        marks[0].clear()
                        marks = []
                    if marks.length == 0 and context.hide == line - 1
                        opts =
                            shared         : false
                            inclusiveLeft  : true
                            inclusiveRight : true
                            atomic         : true
                            collapsed      : true
                        end = line+1
                        while end < cm.lineCount()
                            if cm.getLine(end)[0] != MARKERS.output
                                end += 1
                            else
                                break
                        mark = cm.markText({line:line, ch:0}, {line:end-1, ch:cm.getLine(end-1).length}, opts)
                        mark.type = 'hide'
                        #console.log("hide from #{line} to #{end}")
                else
                    #console.log("line #{line}: No marks since line doesn't begin with a marker and not hiding")
                    if marks.length > 0
                        for m in marks
                            m.clear()

    render_output: (mark, s, line) =>
        if mark.rendered == s
            return
        if s.slice(0, mark.rendered.length) != mark.rendered
            mark.element.empty()
            mark.rendered = ''
        for m in s.slice(mark.rendered.length).split(MARKERS.output)
            if m.length == 0
                continue
            try
                mesg = misc.from_json(m)
            catch e
                #console.warn("invalid output message '#{m}' in line '#{s}' on line #{line}")
                return
            @process_output_mesg
                mesg    : mesg
                element : mark.element
                mark    : mark
        mark.rendered = s

    ##################################################################################
    # Toggle visibility of input/output portions of cells -
    #    This is purely a client-side display function; it doesn't change
    #    the document or cause any sync to happen!
    ##################################################################################

    set_input_state: (opts) =>
        opts = defaults opts,
            elt        : undefined
            line       : undefined
            eval_state : undefined    # undefined, true, false
            run_state  : undefined    # undefined, 'execute', 'running', 'waiting', 'done'
        #console.log("set_input_state", opts)
        if opts.elt?
            elt = opts.elt
        else if opts.line?
            mark = cm.findMarksAt({line:opts.line, ch:1})[0]
            if not mark?
                return
            elt = @elt_at_mark(mark)
        if opts.eval_state?
            e = elt.find(".sagews-input-eval-state")
            if opts.eval_state
                e.addClass('sagews-input-evaluated').removeClass('sagews-input-unevaluated')
            else
                e.addClass('sagews-input-unevaluated').removeClass('sagews-input-evaluated')
        if opts.run_state?
            e = elt.find(".sagews-input-run-state")
            for k in ['execute', 'running', 'waiting']
                e.removeClass("sagews-input-#{k}")
            if opts.run_state == 'done'
                e.removeClass('blink')
            else
                e.addClass("sagews-input-#{opts.run_state}").addClass('blink')

    # hide_input: hide input part of cell that has start marker at the given line.
    hide_input: (line) =>
        end = line+1
        cm = @codemirror
        while end < cm.lineCount()
            c = cm.getLine(end)[0]
            if c == MARKERS.cell or c == MARKERS.output
                break
            end += 1

        line += 1

        #hide = $("<div>")
        opts =
            shared         : true
            inclusiveLeft  : true
            inclusiveRight : true
            atomic         : true
            #replacedWith   : hide[0]
            collapsed      : true
        marker = cm.markText({line:line, ch:0}, {line:end-1, ch:cm.getLine(end-1).length}, opts)
        marker.type = 'hide_input'
        #console.log("hide_input: ", {line:line, ch:0}, {line:end-1, ch:cm.getLine(end-1).length})
        for c in @codemirrors()
            c.refresh()

    show_input: (line) =>
        for cm in [@codemirror, @codemirror1]
            for marker in cm.findMarksAt({line:line+1, ch:0})
                if marker.type == 'hide_input'
                    marker.clear()

    hide_output: (line) =>
        for cm in [@codemirror, @codemirror1]
            mark = @find_output_mark(line, cm)
            if mark?
                @elt_at_mark(mark).addClass('sagews-output-hide').find(".sagews-output-container").hide()

    show_output: (line) =>
        for cm in [@codemirror, @codemirror1]
            mark = @find_output_mark(line, cm)
            if mark?
                @elt_at_mark(mark).removeClass('sagews-output-hide').find(".sagews-output-container").show()

    sage_call: (opts) =>
        opts = defaults opts,
            input : required
            cb    : undefined
        if @readonly
            opts.cb?({done:true, error:'readonly'})
        else
            if not @_syncstring?._evaluator?
                opts.cb?({done:true, error:'closed'})
                return
            @_syncstring._evaluator.call
                program : 'sage'
                input   : opts.input
                cb      : opts.cb
        return

    status: (opts) =>
        opts = defaults opts,
            cb : required
        @sage_call
            input :
                event : 'status'
            cb    : (resp) =>
                if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp)

    execute_code: (opts) =>
        opts = defaults opts,
            code        : required
            cb          : undefined
            data        : undefined
            preparse    : true
            id          : misc.uuid()
            output_uuid : opts.output_uuid
            timeout     : undefined

        @sage_call
            input :
                event       : 'execute_code'
                code        : opts.code
                data        : opts.data
                preparse    : opts.preparse
                id          : opts.id
                output_uuid : opts.output_uuid
                timeout     : opts.timeout
            cb   : opts.cb
        return opts.id

    interact: (output, desc, mark) =>
        # Create and insert DOM objects corresponding to this interact
        elt = $("<div class='sagews-output-interact'>")
        interact_elt = $("<span>")
        elt.append(interact_elt)
        output.append(elt)

        if @readonly
            interact_elt.text("(interacts not available)").addClass('lighten')
            return

        f = (opts) =>
            opts.mark = mark
            @process_output_mesg(opts)

        # Call jQuery plugin to make it all happen.
        interact_elt.sage_interact
            desc                : desc
            execute_code        : @execute_code
            process_output_mesg : f
            process_html_output : @process_html_output

    jump_to_output_matching_jquery_selector: (selector) =>
        cm = @focused_codemirror()
        for x in cm.getAllMarks()
            t = $(x.replacedWith).find(selector)
            if t.length > 0
                cm.scrollIntoView(x.find().from, cm.getScrollInfo().clientHeight/2)
                return

    process_html_output: (e) =>
        # TODO: when redoing this using react, see the Markdown component in r_misc.cjsx
        # and the process_smc_links jQuery plugin in misc_page.coffee
        # makes tables look MUCH nicer
        e.find("table").addClass('table')

        # handle a links
        a = e.find('a')

        that = @
        for x in a
            y = $(x)
            href = y.attr('href')
            if href?
                if href[0] == '#'
                    # target is internal anchor to id
                    # make internal links in the same document scroll the target into view.
                    y.click (e) ->
                        that.jump_to_output_matching_jquery_selector($(e.target).attr('href'))
                        return false
                else if href.indexOf(document.location.origin) == 0
                    # target starts with cloud URL or is absolute, so we open the
                    # link directly inside this browser tab
                    y.click (e) ->
                        n = (document.location.origin + '/projects/').length
                        target = $(@).attr('href').slice(n)
                        redux.getActions('projects').load_target(decodeURI(target), not(e.which==2 or (e.ctrlKey or e.metaKey)))
                        return false
                else if href.indexOf('http://') != 0 and href.indexOf('https://') != 0
                    # internal link
                    y.click (e) ->
                        target = $(@).attr('href')
                        {join} = require('path')
                        if target.indexOf('/projects/') == 0
                            # fully absolute (but without https://...)
                            target = decodeURI(target.slice('/projects/'.length))
                        else if target[0] == '/' and target[37] == '/' and misc.is_valid_uuid_string(target.slice(1,37))
                            # absolute path with /projects/ omitted -- /..project_id../files/....
                            target = decodeURI(target.slice(1))  # just get rid of leading slash
                        else if target[0] == '/'
                            # absolute inside of project
                            target = join(that.project_id, 'files', decodeURI(target))
                        else
                            # relative to current path
                            target = join(that.project_id, 'files', that.file_path(), decodeURI(target))
                        redux.getActions('projects').load_target(target, not(e.which==2 or (e.ctrlKey or e.metaKey)))
                        return false
                else
                    # make links open in a new tab
                    a.attr("target","_blank")

        # make relative links to images use the raw server
        a = e.find("img")
        for x in a
            y           = $(x)
            src         = y.attr('src')
            # see https://github.com/sagemathinc/smc/issues/1192
            img_scaling = y.attr('smc-image-scaling')
            if img_scaling?
                img = y.get(0)
                scale_img = ->
                    width  = img.naturalWidth
                    factor = parseFloat(img_scaling)
                    if not isNaN(factor)
                        new_width = width * factor
                        y.css('width', "#{new_width}px")
                scale_img()
                img.onload = scale_img
            # checking, if we need to fix the src path
            is_fullurl  = src.indexOf('://') != -1
            is_blob     = misc.startswith(src, "#{window.smc_base_url}/blobs/")
            # see https://github.com/sagemathinc/smc/issues/651
            is_data     = misc.startswith(src, 'data:')
            if is_fullurl or is_data or is_blob
                continue
            # see https://github.com/sagemathinc/smc/issues/1184
            file_path = @file_path()
            if misc.startswith(src, '/')
                file_path = ".smc/root/#{file_path}"
            {join} = require('path')
            new_src = join('/', window.smc_base_url, @project_id, 'raw', file_path, src)
            y.attr('src', new_src)

    _post_save_success: () =>
        @remove_output_blob_ttls()

    # Return array of uuid's of blobs that might possibly be in the worksheet
    # and have a ttl.
    _output_blobs_with_possible_ttl: () =>
        v = []
        x = @_output_blobs_with_possible_ttl_done ?= {}
        for c in @get_all_cells()
            for output in c.output()
                if output.file?
                    uuid = output.file.uuid
                    if uuid?
                        if not x[uuid]
                            v.push(uuid)
        return v

    # mark these as having been successfully marked to never expire.
    _output_blobs_ttls_removed: (uuids) =>
        for uuid in uuids
            @_output_blobs_with_possible_ttl_done[uuid] = true

    remove_output_blob_ttls: (cb) =>
        # TODO: prioritize automatic testing of this highly... since it is easy to break by changing
        # how worksheets render slightly.
        uuids = @_output_blobs_with_possible_ttl()
        if uuids?
            salvus_client.remove_blob_ttls
                uuids : uuids
                cb    : (err) =>
                    if not err
                        # don't try again to remove ttls for these blobs -- since did so successfully
                        @_output_blobs_ttls_removed(uuids)
                    cb?(err)

    raw_input: (raw_input) =>
        prompt = raw_input.prompt
        value  = raw_input.value
        if not value?
            value = ''
        submitted = raw_input.submitted
        if not submitted?
            submitted = false
        elt = templates.find(".sagews-output-raw_input").clone()
        label = elt.find(".sagews-output-raw_input-prompt")
        label.text(prompt)
        input = elt.find(".sagews-output-raw_input-value")
        input.val(value)

        if raw_input.placeholder?
            input.attr('placeholder', raw_input.placeholder)

        btn = elt.find(".sagews-output-raw_input-submit")

        if submitted or @readonly
            btn.addClass('disabled')
            input.attr('readonly', true)
        else
            submit_raw_input = () =>
                btn.addClass('disabled')
                input.attr('readonly', true)
                for cm in @codemirrors()
                    cm.setOption('readOnly',@readonly)
                @sage_call
                    input :
                        event : 'raw_input'
                        value : input.val()

            input.keyup (evt) =>
                # if return, submit result
                if evt.which == 13
                    submit_raw_input()

            btn.click () =>
                submit_raw_input()
                return false

            f = () =>
                input.focus()
            setTimeout(f, 50)

        if raw_input.input_width?
            input.width(raw_input.input_width)

        if raw_input.label_width?
            label.width(raw_input.label_width)

        return elt

    process_output_mesg: (opts) =>
        opts = defaults opts,
            mesg    : required
            element : required
            mark    : undefined
        mesg = opts.mesg
        output = opts.element
        # mesg = object
        # output = jQuery wrapped element

        if mesg.stdout?
            output.append($("<span class='sagews-output-stdout'>").text(mesg.stdout))

        if mesg.stderr?
            output.append($("<span class='sagews-output-stderr'>").text(mesg.stderr))

        if mesg.error?
            error = "ERROR: '#{mesg.error}'\nCommunication with the Sage server is failing.\nPlease try: running this cell again, restarting your project,\nclosing and opening this file, refreshing your browser,\nor deleting the contents of ~/.local"
            output.append($("<span class='sagews-output-stderr'>").text(error))

        if mesg.code?
            x = $("<div class='sagews-output-code'>")
            output.append(x)
            if mesg.code.mode
                CodeMirror.runMode(mesg.code.source, mesg.code.mode, x[0])
            else
                x.text(mesg.code.source)

        if mesg.html?
            e = $("<span class='sagews-output-html'>")
            if @editor.opts.allow_javascript_eval
                e.html(mesg.html)
            else
                e.html_noscript(mesg.html)
            e.mathjax(hide_when_rendering:true)
            output.append(e)
            @process_html_output(e)

        if mesg.interact?
            @interact(output, mesg.interact, opts.mark)

        if mesg.d3?
            e = $("<span>")
            output.append(e)
            require.ensure [], () =>
                require('./d3')  # install the d3 plugin
                e.d3
                    viewer : mesg.d3.viewer
                    data   : mesg.d3.data

        if mesg.md?
            # markdown
            x = markdown.markdown_to_html(mesg.md)
            t = $('<span class="sagews-output-md">')
            if @editor.opts.allow_javascript_eval
                t.html(x.s)
            else
                t.html_noscript(x.s)
            #console.log 'sagews:mesg.md, t:', t
            t.mathjax(hide_when_rendering:true)
            output.append(t)
            @process_html_output(t)

        if mesg.tex?
            # latex
            val = mesg.tex
            elt = $("<div class='sagews-output-tex'>")
            arg = {tex:val.tex}
            if val.display
                arg.display = true
            else
                arg.inline = true
            arg.hide_when_rendering = true
            output.append(elt.mathjax(arg))

        if mesg.raw_input?
            output.append(@raw_input(mesg.raw_input))

        if mesg.file?
            val = mesg.file
            if val.uuid?
                blobs = opts.element.data('blobs')
                if not blobs?
                    blobs = [val.uuid]
                    opts.element.data('blobs', blobs)
                else
                    blobs.push(val.uuid)

            if not val.show? or val.show
                if val.url?
                    target = val.url + "?nocache=#{Math.random()}"  # randomize to dis-allow caching, since frequently used for images with one name that change
                else
                    target = "#{window.smc_base_url}/blobs/#{misc.encode_path(val.filename)}?uuid=#{val.uuid}"
                switch misc.filename_extension(val.filename).toLowerCase()
                    # TODO: harden DOM creation below?

                    when 'webm'
                        if $.browser.safari or $.browser.ie
                            output.append($("<br><strong>WARNING:</strong> webm animations not supported on Safari or IE; use an animated gif instead, e.g., the gif=True option to show.<br>"))
                        if $.browser.firefox
                            output.append($("<br><strong>WARNING:</strong> Right click and select play.<br>"))
                        video = $("<video src='#{target}' class='sagews-output-video' controls></video>")
                        output.append(video)

                    when 'sage3d'
                        elt = $("<span class='salvus-3d-container'></span>")
                        elt.data('uuid',val.uuid)
                        output.append(elt)
                        require.ensure [], () =>   # only load 3d library if needed
                            require('./3d').render_3d_scene
                                url     : target
                                element : elt
                                cb      : (err, obj) =>
                                    if err
                                        # TODO: red?
                                        elt.append($("<div>").text("error rendering 3d scene -- #{err}"))
                                    else
                                        elt.data('width', obj.opts.width / $(window).width())

                    when 'svg', 'png', 'gif', 'jpg', 'jpeg'
                        img = $("<span class='sagews-output-image'><img src='#{target}'></span>")
                        output.append(img)

                        if mesg.events?
                            img.css(cursor:'crosshair')
                            location = (e) ->
                                offset = img.offset()
                                x = (e.pageX - offset.left) /img.width()
                                y = (e.pageY - offset.top) /img.height()
                                return [x,y]

                            exec = (code) =>
                                @execute_code
                                    code     : code
                                    preparse : true
                                    cb       : (mesg) =>
                                        delete mesg.done
                                        @process_output_mesg
                                            mesg    : mesg
                                            element : output.find(".sagews-output-messages")
                                            mark    : opts.mark

                            for event, function_name of mesg.events
                                img.data("salvus-events-#{event}", function_name)
                                switch event
                                    when 'click'
                                        img.click (e) =>
                                            p = location(e)
                                            exec("#{img.data('salvus-events-click')}('click',(#{p}))")
                                    when 'mousemove'
                                        ignore_mouse_move = undefined
                                        last_pos = undefined
                                        img.mousemove (e) =>
                                            if ignore_mouse_move?
                                                return
                                            ignore_mouse_move = true
                                            setTimeout( ( () => ignore_mouse_move=undefined ), 100 )
                                            p = location(e)
                                            if last_pos? and p[0] == last_pos[0] and p[1] == last_pos[1]
                                                return
                                            last_pos = p
                                            exec("#{img.data('salvus-events-mousemove')}('mousemove',(#{p}))")
                                    else
                                        console.log("unknown or unimplemented event -- #{event}")

                    else
                        if val.text
                            text = val.text
                        else
                            text = "#{val.filename} (temporary link)"
                        output.append($("<a href='#{target}' class='sagews-output-link' target='_new'>#{text}</a> "))

        if mesg.javascript? and @allow_javascript_eval()
            code = mesg.javascript.code
            if mesg.obj?
                obj  = JSON.parse(mesg.obj)
            else
                obj = undefined
            if mesg.javascript.coffeescript
                if not CoffeeScript?
                    # DANGER: this is the only async code in process_output_mesg
                    misc_page.load_coffeescript_compiler () =>
                        sagews_eval(CoffeeScript?.compile(code), @, opts.element)
                else
                    # DANGER: this is the only async code in process_output_mesg
                    sagews_eval(CoffeeScript?.compile(code), @, opts.element)
            else
                # The eval below is an intentional cross-site scripting vulnerability
                # in the fundamental design of SMC.
                # Note that there is an allow_javascript document option, which (at some point) users
                # will be able to set.  There is one more instance of eval below in _receive_broadcast.
                sagews_eval(code, @, opts.element, undefined, obj)

        if mesg.show?
            if opts.mark?
                line = opts.mark.find()?.from.line
                if line?
                    cell = @cell(line)
                    if cell?
                        switch mesg.show
                            when 'input'
                                cell.remove_cell_flag(FLAGS.hide_input)
                            when 'output'
                                cell.remove_cell_flag(FLAGS.hide_output)

        if mesg.hide?
            if opts.mark?
                line = opts.mark.find()?.from.line
                if line?
                    cell = @cell(line)
                    if cell?
                        switch mesg.hide
                            when 'input'
                                cell.set_cell_flag(FLAGS.hide_input)
                            when 'output'
                                cell.set_cell_flag(FLAGS.hide_output)

        # NOTE: Right now the "state object" is a just a list of messages in the output of a cell.
        # It's viewed as something that should get rendered in order, with no dependence between them.
        # Instead alll thoose messages should get fed into one single state object, which then gets
        # rendered each time it changes. React makes that approach easy and efficient. Without react
        # (or something similar) it is basically impossible.  When sage worksheets are rewritten
        # using react, this will change.
        if mesg.clear
            output.empty()

        if mesg.delete_last
            output.find(":last").remove()

        if mesg.done
            output.removeClass('sagews-output-running')
            output.addClass('sagews-output-done')

    allow_javascript_eval: () =>
        # TODO: Maybe better would be a button to click that re-renders
        # with javascript enabled...?
        if not @editor.opts.allow_javascript_eval
            @javascript_block_mesg()
            return false
        else
            return true

    javascript_block_mesg: () =>
        if @_javascript_block_mesg
            return
        @_javascript_block_mesg = true
        alert_message
            type    : "info"
            message : "Evaluation of arbitrary javascript is blocked in public worksheets, since it is dangerous; instead, open a copy of this worksheet in your own project."
            timeout : 10

    _receive_broadcast: (mesg) =>
        switch mesg.mesg.event
            when 'execute_javascript'
                if @allow_javascript_eval()
                    mesg = mesg.mesg
                    (() =>
                         code = mesg.code
                         async.series([
                             (cb) =>
                                 if mesg.coffeescript or code.indexOf('CoffeeScript') != -1
                                     misc_page.load_coffeescript_compiler(cb)
                                 else
                                     cb()
                             (cb) =>
                                 if mesg.coffeescript
                                     code = CoffeeScript.compile(code)
                                 obj = JSON.parse(mesg.obj)
                                 sagews_eval(code, @, undefined, mesg.cell_id, obj)
                                 cb()
                         ])
                    )()

    mark_cell_start: (cm, line) =>
        # Assuming the proper text is in the document for a new cell at this line,
        # mark it as such. This hides control codes and places a cell separation
        # element, which may be clicked to create a new cell.
        if line >= cm.lineCount()-1
            # If at bottom, insert blank lines.
            cm.replaceRange("\n\n\n", {line:line+1, ch:0})
        x   = cm.getLine(line)
        end = x.indexOf(MARKERS.cell, 1)
        input = cell_start_template.clone()
        if not @readonly
            input.addClass('sagews-input-live')
            input.click (e) =>
                f = () =>
                    line = mark.find().from.line
                    @insert_new_cell(line)
                    if e.shiftKey
                        cm.replaceRange("%html\n", {line:line+1,ch:0})
                        @action
                            execute : true
                            advance : false
                    if (e.altKey or e.metaKey)
                        cm.replaceRange("%md\n", {line:line+1,ch:0})
                        @action
                            execute : true
                            advance : false

                if IS_MOBILE
                    # It is way too easy to accidentally click on the insert new cell line on mobile.
                    bootbox.confirm "Create new cell?", (result) =>
                        if result
                            f()
                        else # what the user really wants...
                            cm.focus()
                            cm.setCursor({line:mark.find().from.line+1, ch:0})
                else
                    f()
                return false

        opts =
            shared         : false
            inclusiveLeft  : false    # CRITICAL: do not set this to true; it screws up undo/redo badly (maybe with undo/redo based on syncstring this will be fine again)
            inclusiveRight : true
            atomic         : true
            replacedWith   : input[0] #$("<div style='margin-top: -30px; border: 1px solid red'>")[0]

        mark = cm.markText({line:line, ch:0}, {line:line, ch:end+1}, opts)
        mark.type = MARKERS.cell
        mark.element = input
        return mark

    set_output_line_class: (line, check=true) =>
        #console.log("set_output_line_class #{line}")
        for c in @codemirrors()
            if check
                info = c.lineInfo(line)
                if not info? or info.textClass?
                    return
            c.addLineClass(line, 'gutter', 'sagews-output-cm-gutter')
            c.addLineClass(line, 'text', 'sagews-output-cm-text')
            c.addLineClass(line, 'wrap', 'sagews-output-cm-wrap')

    set_all_output_line_classes: =>
        for cm in @codemirrors()
            for m in cm.getAllMarks()
                if m.type == MARKERS.output
                    line = m.find()?.from.line
                    if line? and not cm.lineInfo(line)?.textClass?
                        @set_output_line_class(line, false)

    mark_output_line: (cm, line) =>
        # Assuming the proper text is in the document for output to be displayed at this line,
        # mark it as such.  This hides control codes and creates a div into which output will
        # be placed as it appears.
        #console.log("mark_output_line, #{line}")

        @set_output_line_class(line)

        output = output_template.clone()

        if cm.lineCount() < line + 2
            cm.replaceRange('\n', {line:line+1,ch:0})
        start = {line:line, ch:0}
        end = {line:line, ch:cm.getLine(line).length}
        opts =
            shared         : false
            inclusiveLeft  : true
            inclusiveRight : true
            atomic         : true
            replacedWith   : output[0]
        # NOTE: I'm using markText, which is supposed to only be used inline, no divs, but I should be
        # using .addLineWidget.  However, I had **WAY** too many problems with line widgets, whereas cheating
        # and using markText works.  So there.
        mark = cm.markText(start, end, opts)
        mark.element = output
        # mark.processed stores how much of the output line we
        # have processed  [marker]36-char-uuid[marker]
        mark.processed = 38
        mark.uuid = cm.getRange({line:line, ch:1}, {line:line, ch:37})
        mark.type = MARKERS.output

        if not @readonly
            output.click (e) =>
                t = $(e.target)
                if t.attr('href')? or t.hasParent('.sagews-output-editor').length > 0
                    return
                @edit_cell
                    line : mark.find().from.line - 1
                    cm   : cm

        return mark

    find_output_line: (line, cm) =>
        # Given a line number in the editor, return the nearest (greater or equal) line number that
        # is an output line, or undefined if there is no output line before the next cell.
        if not cm?
            cm = @focused_codemirror()
        if cm.getLine(line)?[0] == MARKERS.output
            return line
        line += 1
        while line < cm.lineCount() - 1
            x = cm.getLine(line)
            if x.length > 0
                if x[0] == MARKERS.output
                    return line
                if x[0] == MARKERS.cell
                    return undefined
            line += 1
        return undefined

    find_output_mark: (line, cm) =>
        # Same as find_output_line, but returns the actual mark (or undefined).
        if not cm?
            cm = @focused_codemirror()
        n = @find_output_line(line, cm)
        if n?
            for mark in cm.findMarksAt({line:n, ch:0})
                if mark.type == MARKERS.output
                    return mark
        return undefined

    # Returns start and end lines of the current input block (if line is undefined),
    # or of the block that contains the given line number.  This does not chnage
    # the document.
    current_input_block: (line) =>
        cm = @focused_codemirror()
        if not line?
            line = cm.getCursor().line

        start = end = line

        # if start is on an output line, move up one line
        x = cm.getLine(start)
        if x? and x.length > 0 and x[0] == MARKERS.output
            start -= 1
        # if end is on a start line, move down one line
        x = cm.getLine(end)
        if x? and x.length > 0 and x[0] == MARKERS.cell
            end += 1

        while start > 0
            x = cm.getLine(start)
            if x? and x.length > 0 and (x[0] == MARKERS.cell or x[0] == MARKERS.output)
                if x[0] == MARKERS.output
                    start += 1
                break
            start -= 1
        while end < cm.lineCount()-1
            x = cm.getLine(end)
            if x? and x.length > 0 and (x[0] == MARKERS.cell or x[0] == MARKERS.output)
                if x[0] == MARKERS.cell
                    end -= 1
                break
            end += 1
        if end == cm.lineCount() - 1
            # end is the last line -- if empty, go back up to line after last non-empty line
            while end > start and cm.getLine(end).trim().length == 0
                end -= 1
        return {start:start, end:end}

    find_input_mark: (line) =>
        # Input mark containing the given line, or undefined
        if line?
            cm = @focused_codemirror()
            if not cm?
                return
            while line >= 0
                for mark in cm.findMarksAt({line:line, ch:0})
                    if mark.type == MARKERS.cell
                        return mark
                line -= 1
        return

    # HTML editor for the cell whose input starts at the given 0-based line.
    edit_cell: (opts) =>
        opts = defaults opts,
            line : required
            cm   : required
        # DISABLED!
        return

    action: (opts={}) =>
        opts = defaults opts,
            pos           : undefined
            advance       : false
            split         : false  # split cell at cursor (selection is ignored)
            execute       : false  # if false, do whatever else we would do, but don't actually execute code.
            toggle_input  : false  # if true; toggle whether input is displayed; ranges all toggle same as first
            toggle_output : false  # if true; toggle whether output is displayed; ranges all toggle same as first
            delete_output : false  # if true; delete all the the output in the range

        #console.log 'action ', opts

        if @readonly
            # don't do any actions on a read-only file.
            return

        if opts.split
            # split at every cursor position before doing any other actions
            for sel in @focused_codemirror().listSelections().reverse()   # "These will always be sorted, and never overlap (overlapping selections are merged)."
                @split_cell_at(sel.head)

        if opts.execute or opts.toggle_input or opts.toggle_output or opts.delete_output
            # do actions on cells containing cursors or overlapping with selections
            if opts.pos?
                cells = [@cell(opts.pos.line)]
            else
                create = opts.execute
                cells = @get_current_cells(create)
            for cell in cells
                cell.action
                    execute       : opts.execute
                    toggle_input  : opts.toggle_input
                    toggle_output : opts.toggle_output
                    delete_output : opts.delete_output
                if opts.toggle_output
                    # toggling output requires explicitly processing due to distance between input line where
                    # state is stored and output line where displayed.
                    @process_sage_updates({start:cell.start_line(), stop:cell.end_line()})
            if cells.length == 1 and opts.advance
                @move_cursor_to_next_cell()
            if cells.length > 0
                @save_state_debounce()

        @close_on_action()  # close introspect popups

    # purely client-side markdown rendering for a markdown, javascript, html, etc. block -- an optimization
    execute_cell_client_side: (opts) =>
        opts = defaults opts,
            cell : required
            mode : undefined
            code : undefined
            hide : undefined
        if not opts.mode? or not opts.code?
            x = opts.cell.client_side()
            if not x?   # cell can't be executed client side -- nothing to do
                return
            opts.mode = x.mode; opts.code = x.code; opts.hide = x.hide
        if not opts.hide? and opts.mode in ['md', 'html']
            opts.hide = false
        if opts.hide
            opts.cell.set_cell_flag(FLAGS.hide_input)
        cur_height = opts.cell.get_output_height()
        opts.cell.set_output_min_height(cur_height)
        opts.cell.set_output([])
        mesg = {done:true}
        switch opts.mode
            when 'javascript'
                mesg.javascript = {code: opts.code}
            when 'coffeescript'
                mesg.javascript = {coffeescript: true, code: opts.code}
            when 'cjsx'
                mesg.javascript = {cjsx: true, code: opts.code}
            else
                mesg[opts.mode] = opts.code
        opts.cell.append_output_message(mesg)
        setTimeout(opts.cell.set_output_min_height, 1000)
        @sync()

    execute_cell_server_side: (opts) =>
        opts = defaults opts,
            cell   : required
            cb     : undefined    # called when the execution is completely done (so no more output)
        @execution_queue.push(opts)

    _execute_cell_server_side: (opts) =>
        opts = defaults opts,
            cell   : required
            cb     : undefined    # called when the execution is completely done (so no more output)

        #dbg = (m...) -> console.log("execute_cell_server_side:", m...)
        dbg = () ->

        cell  = opts.cell
        input = cell.input()

        if not input?
            dbg("cell vanished/invalid")
            opts.cb?("cell vanished/invalid")
            return

        cur_height = cell.get_output_height()
        output_uuid = cell.new_output_uuid()
        if not output_uuid?
            dbg("output_uuid not defined")
            opts.cb?("output_uuid no longer defined")
            return

        # set cell to running mode
        cell.set_cell_flag(FLAGS.running)

        # used to reduce flicker, which again makes things feel slow/awkward
        cell.set_output_min_height(cur_height)

        done = =>
            cell.remove_cell_flag(FLAGS.running)
            cell.set_cell_flag(FLAGS.this_session)
            setTimeout(cell.set_output_min_height, 1000) # wait a second, e.g., for async loading of images to finish
            @sync()
            opts.cb?()

        t0 = new Date()
        cleared_output = false
        clear_output = =>
            if not cleared_output
                cleared_output = true
                cell.set_output([])

        # Give the cell one second to get output from backend.  If not, then we clear output.
        # These reduces "flicker", which makes things seem slow.
        setTimeout(clear_output, 1000)
        first_output = true
        @execute_code
            code         : input
            output_uuid  : output_uuid
            cb           : (mesg) =>
                if first_output  # we *always* clear the first time, even if we cleared above via the setTimeout.
                    first_output = false
                    clear_output()
                cell.append_output_message(mesg)
                if mesg.done
                    done?()
                    done = undefined
                @sync()

    # enqueue all of the auto cells for execution
    execute_auto_cells: () =>
        for cell in @get_all_cells()
            is_auto = cell.is_auto()
            if is_auto? and is_auto
                cell.action(execute:true)

    split_cell_at: (pos) =>
        # Split the cell at the given pos.
        @cell_start_marker(pos.line)
        @sync()

    # returns the line number where the previous cell ends
    move_cursor_to_next_cell: () =>
        cm = @focused_codemirror()
        line = cm.getCursor().line + 1
        while line < cm.lineCount()
            x = cm.getLine(line)
            if x.length > 0 and x[0] == MARKERS.cell
                cm.setCursor(line:line+1, ch:0)
                return line-1
            line += 1
        # there is no next cell, so we create one at the last non-whitespace line
        while line > 0 and $.trim(cm.getLine(line)).length == 0
            line -= 1
        @cell_start_marker(line+1)
        cm.setCursor(line:line+2, ch:0)
        return line

    ##########################################
    # Codemirror-based cell manipulation code
    #   This is tightly tied to codemirror, so only makes sense on the client.
    ##########################################
    get_input_line_flagstring: (line) =>
        if not line?
            return ''
        cm = @focused_codemirror()
        x = cm.getLine(line)
        if not misc.is_valid_uuid_string(x.slice(1,37))
            # worksheet is somehow corrupt
            # TODO: should fix things at this point, or make sure this is never hit; could be caused by
            # undo conflicting with updates.
            return undefined
        return x.slice(37,x.length-1)

    get_cell_flagstring: (marker) =>
        if not marker?
            return undefined
        pos = marker.find()
        if not pos?
            return ''
        return @get_input_line_flagstring(pos.from.line)

    set_input_line_flagstring: (line, value) =>
        cm = @focused_codemirror()
        x = cm.getLine(line)
        cm.replaceRange(value, {line:line, ch:37}, {line:line, ch:x.length-1})

    set_cell_flagstring: (marker, value) =>
        if not marker?
            return
        pos = marker.find()
        @focused_codemirror().replaceRange(value, {line:pos.from.line, ch:37}, {line:pos.to.line, ch:pos.to.ch-1})

    get_cell_uuid: (marker) =>
        if not marker?
            return
        pos = marker.find()
        if not pos?
            return ''
        return @focused_codemirror().getLine(pos.line).slice(1,38)

    set_cell_flag: (marker, flag) =>
        if not marker?
            return
        s = @get_cell_flagstring(marker)
        if s? and flag not in s
            @set_cell_flagstring(marker, flag + s)

    remove_cell_flag: (marker, flag) =>
        if not marker?
            return
        s = @get_cell_flagstring(marker)
        if s? and flag in s
            s = s.replace(new RegExp(flag, "g"), "")
            @set_cell_flagstring(marker, s)

    insert_new_cell: (line) =>
        pos = {line:line, ch:0}
        cm = cm = @focused_codemirror()
        cm.replaceRange('\n', pos)
        @process_sage_updates(start:line, stop:line+1, caller:"insert_new_cell")
        cm.focus()
        cm.setCursor(pos)
        @cell_start_marker(line)
        @process_sage_updates(start:line, stop:line+1, caller:"insert_new_cell")
        @sync()

    cell_start_marker: (line) =>
        if not line?
            throw Error("cell_start_marker: line must be defined")
        cm = @focused_codemirror()
        current_line = cm.getLine(line)
        if current_line.length < 38 or current_line[0] != MARKERS.cell or current_line[current_line.length-1] != MARKERS.cell
            # insert marker uuid text, since it isn't there already
            uuid = misc.uuid()
            cm.replaceRange(MARKERS.cell + uuid + MARKERS.cell + '\n', {line:line, ch:0})
        else
            uuid = current_line.slice(1,37)
            x = cm.findMarksAt(line:line, ch:0)
            if x.length > 0 and x[0].type == MARKERS.cell
                # already properly marked
                return {marker:x[0], created:false, uuid:uuid}
        if cm.lineCount() < line + 2
            # insert a newline
            cm.replaceRange('\n',{line:line+1,ch:0})
        # this creates the mark itself:
        @process_sage_updates(start:line, stop:line+1, caller:"cell_start_marker")
        x = cm.findMarksAt(line:line, ch:0)
        if x.length > 0 and x[0].type == MARKERS.cell
            # now properly marked
            return {marker:x[0], created:true, uuid:uuid}
        else
            # didn't get marked for some reason
            return {marker:undefined, created:true, uuid:uuid}

    # map from uuids in document to true.
    doc_uuids: () =>
        uuids = {}
        @focused_codemirror().eachLine (z) ->
            if z.text[0] == MARKERS.cell or z.text[0] == MARKERS.output
                uuids[z.text.slice(1,37)] = true
            return false
        return uuids

    remove_this_session_from_line: (n) =>
        s = @get_input_line_flagstring(n)
        if s? and FLAGS.this_session in s
            s = s.replace(new RegExp(FLAGS.this_session, "g"), "")
            @set_input_line_flagstring(n, s)

    remove_this_session_flags_from_range: (start, end) =>
        {start} = @current_input_block(start)
        n = start
        @codemirror.eachLine start, end+1, (line) =>
            if line.text[0] == MARKERS.cell
                @remove_this_session_from_line(n)
            n += 1
            return false

    remove_this_session_flags_from_changeObj_range: (changeObj) =>
        @remove_this_session_flags_from_range(changeObj.from.line, changeObj.to.line)
        if changeObj.next?
            @remove_cell_flags_from_changeObj(changeObj.next)

    remove_cell_flags_from_changeObj: (changeObj, flags, uuids) =>
        if not uuids?
            uuids = @doc_uuids()
        # Remove cell flags from *contiguous* text in the changeObj.
        # This is useful for cut/copy/paste.
        # This function modifies changeObj in place.
        @remove_cell_flags_from_text(changeObj.text, flags, uuids)
        if changeObj.next?
            @remove_cell_flags_from_changeObj(changeObj.next, flags, uuids)

    remove_cell_flags_from_text: (text, flags, uuids) =>
        # !! The input "text" is an array of strings, one for each line;
        # this function modifies this array in place.
        # Replace all lines of the form
        #    [MARKERS.cell][36-character uuid][flags][MARKERS.cell]
        # by
        #    [MARKERS.cell][uuid][flags2][MARKERS.cell]
        # where flags2 has the flags in the second argument (an array) removed,
        # or all flags removed if the second argument is undefined
        for i in [0...text.length]
            s = text[i]
            if s.length >= 38
                if s[0] == MARKERS.cell
                    if flags?
                        text[i] = s.slice(0,37) + (x for x in s.slice(37,s.length-1) when x not in flags) + MARKERS.cell
                    else
                        text[i] = s.slice(0,37) + MARKERS.cell
                if (s[0] == MARKERS.cell or s[0] == MARKERS.output) and uuids?[text[i].slice(1,37)]
                    text[i] = text[i][0] + misc.uuid() + text[i].slice(37)

    output_elements: () =>
        cm = @editor.codemirror
        v = []
        for line in [0...cm.lineCount()]
            marks = cm.findMarksAt({line:line, ch:1})
            if not marks? or marks.length == 0
                continue
            for mark in marks
                elt = mark.replacedWith
                if elt?
                    elt = $(elt)
                    if elt.hasClass('sagews-output')
                        v.push(elt)
        return v

    print_to_pdf_data: () =>
        data = {}
        sage3d = data.sage3d = {}

        # Useful extra data about 3d plots (a png data url)
        for elt in @output_elements()
            for e in elt.find(".salvus-3d-container")
                f = $(e)
                scene = $(e).data('salvus-threejs')
                scene.set_static_renderer()
                data_url = scene.static_image
                if data_url?
                    uuid = f.data('uuid')
                    if not sage3d[uuid]?
                        sage3d[uuid] = []
                    sage3d[uuid].push({'data-url':data_url, 'width':f.data('width')})

        if misc.len(sage3d) == 0
            return undefined

        return data

    refresh_soon: (wait) =>
        if not wait?
            wait = 1000
        if @_refresh_soon?
            # We have already set a timer to do a refresh soon.
            #console.log("not refresh_soon since -- We have already set a timer to do a refresh soon.")
            return
        do_refresh = () =>
            delete @_refresh_soon
            for cm in [@codemirror, @codemirror1]
                cm?.refresh()
        @_refresh_soon = setTimeout(do_refresh, wait)

    close_on_action: (element) =>
        # Close popups (e.g., introspection) that are set to be closed when an
        # action, such as "execute", occurs.
        if element?
            if not @_close_on_action_elements?
                @_close_on_action_elements = [element]
            else
                @_close_on_action_elements.push(element)
        else if @_close_on_action_elements?
            for e in @_close_on_action_elements
                e.remove()
            @_close_on_action_elements = []

class ExecutionQueue
    constructor: (@_exec, @worksheet) ->
        if not @_exec
            throw Error("BUG: execution function must be provided")
        @_queue   = []
        @_state   = 'ready'

    close: () =>
        @dbg("close")()
        @_state = 'closed'
        delete @_queue

    dbg: (f) =>
        return () ->  # disabled logging
        #return (m...) -> console.log("ExecutionQueue.#{f}(): #{misc.to_json(m)}")

    push: (opts) =>
        opts = defaults opts,
            cell   : required
            cb     : undefined
        @dbg("push")()
        if @_state == 'closed'
            return
        uuid = opts.cell.start_uuid()
        if not uuid? # removed
            return
        for x in @_queue
            if x.cell.start_uuid() == uuid
                return # cell already queued up to run
        if uuid == @_running_uuid
            # currently running
            return
        @_queue.push(opts)
        opts.cell.set_cell_flag(FLAGS.waiting)
        @_process()

    clear: () =>
        @dbg("clear")()
        if @_state == 'closed'
            return
        # TODO/NOTE: this of course doesn't fully account for multiple users!
        # E.g., two people start, one cancels, the other will still be
        # queued up... But we have to start somewhere, to even know what
        # state needs to be sync'd around.
        for x in @_queue
            x.cell.remove_cell_flag(FLAGS.waiting)
        @_queue = []
        @_state = 'ready'

    _process: () =>
        if @_state == 'closed'
            return
        dbg = @dbg('process')
        dbg()
        if @worksheet._restarting
            dbg("waiting for restart to finish")
            @worksheet.once 'restarted', =>
                @_process()
            return
        if @_state == 'running'
            dbg("running...")
            return
        dbg("length ",  @_queue.length)
        if @_queue.length == 0
            return
        x = @_queue.shift()
        uuid = x.cell.start_uuid()
        if not uuid?
            # cell no longer exists
            @_process()
            return
        @_running_uuid = uuid
        orig_cb = x.cb
        x.cb = (args...) =>
            if @_state == 'closed'
                # ignore further output
                return
            orig_cb?(args...)
            @_state = 'ready'
            delete @_running_uuid
            @_process()
        @_state = 'running'
        x.cell.remove_cell_flag(FLAGS.waiting)
        @_exec(x)

class SynchronizedWorksheetCell
    constructor: (@doc, start, end) ->
        # Determine input and end lines of the cell that contains the given line, and
        # the corresponding uuid's.
        @cm = @doc.focused_codemirror()

        # Input
        x = @cm.getLine(start)
        if x[0] == MARKERS.cell
            if misc.is_valid_uuid_string(x.slice(1,37)) and x[x.length-1] == MARKERS.cell
                # valid input line
                @_start_uuid = x.slice(1,37)
            else
                # replace input line by valid one
                @_start_uuid = misc.uuid()
                @cm.replaceRange(MARKERS.cell + @_start_uuid + MARKERS.cell, {line:start, ch:0}, {line:start,ch:x.length})
        else
            @_start_uuid = misc.uuid()
            @cm.replaceRange(MARKERS.cell + @_start_uuid + MARKERS.cell + '\n', {line:start, ch:0})
            end += 1
        @_start_line = start

        # Output
        x = @cm.getLine(end)
        if x[0] == MARKERS.output
            if misc.is_valid_uuid_string(x.slice(1,37)) and x[37] == MARKERS.output
                # valid output line
                @_output_uuid = x.slice(1,37)
            else
                # replace output line by valid one
                @_output_uuid = misc.uuid()
                @cm.replaceRange(MARKERS.output + @_output_uuid + MARKERS.output, {line:end, ch:0}, {line:end, ch:x.length})
            @_end_line = end
        else
            @_output_uuid = misc.uuid()
            s = MARKERS.output + @_output_uuid + MARKERS.output + '\n'
            if @cm.lineCount() <= end+1
                # last line of document, so insert new empty line
                s = '\n' + s
                end += 1
            @cm.replaceRange(s, {line:end+1, ch:0})
            @_end_line = end+1

    start_line: =>
        if (@cm.getLine(@_start_line)?.indexOf(@_start_uuid) ? -1) != -1
            return @_start_line
        return @_start_line = @cm.find_in_line(@_start_uuid)?.line

    end_line: =>
        if (@cm.getLine(@_end_line)?.indexOf(@_start_uuid) ? -1) != -1
            return @_end_line
        return @_end_line = @cm.find_in_line(@_output_uuid)?.line

    start_uuid: =>
        return @_start_uuid

    output_uuid: =>
        return @_output_uuid

    # generate a new random output uuid and replace the existing one
    new_output_uuid: =>
        line = @end_line()
        if not line?
            return
        output_uuid = misc.uuid()
        @cm.replaceRange(output_uuid, {line:line, ch:1}, {line:line, ch:37})
        @_output_uuid = output_uuid
        return output_uuid

    # return current content of the input of this cell, including uuid marker line
    raw_input: (offset=0) =>
        start = @start_line()
        if not start?
            return
        end   = @end_line()
        if not end?
            return
        return @cm.getRange({line:start+offset,ch:0}, {line:end, ch:0})

    input: =>
        return @raw_input(1)

    is_auto: =>
        input = @input()
        if input?
            for line in input.split('\n')
                if line.length > 0 and line[0] != '#'
                    return line.slice(0,5) == '%auto'
            return false

    # return current content of the output line of this cell as a string (or undefined)
    raw_output: =>
        x = @_get_output()
        if not x?
            return
        return @cm.getLine(x.loc.from.line)

    output: =>
        v = []
        raw = @raw_output()
        if not raw?  # might return undefined, see above
            return v
        for x in raw.slice(38).split(MARKERS.output)
            if x?.length > 0 # empty strings cause json deserialization problems (i.e. that warning below)
                try
                    v.push(misc.from_json(x))
                catch
                    console.warn("unable to read json message in worksheet: #{x}")
        return v

    _get_output: () =>
        n = @end_line()
        if not n?
            console.warn("_get_output: unable to append output message since cell no longer exists")
            return
        loc = {from:{line:n,ch:0}, to:{line:n,ch:@cm.getLine(n).length}}
        s  = @cm.getLine(n)
        return {loc: loc, s: s, n: n}

    output_element: () =>
        end = @end_line()
        if not end?
            return
        return @cm.findMarksAt({line:end, ch:0})?[0]?.element

    get_output_height: () =>
        return @output_element()?.height()

    set_output_min_height: (min_height='') =>
        @output_element()?.css('min-height', min_height)

    mesg_to_json: (mesg) =>
        return stringify(misc.copy_without(mesg, ['id', 'event']))

    # append an output message to this cell
    append_output_message: (mesg) =>
        x = @_get_output()
        if not x?
            return
        s = @mesg_to_json(mesg)
        if x.s[x.s.length-1] != MARKERS.output
            s  = MARKERS.output + s
        @cm.replaceRange(s, x.loc.to, x.loc.to)

    # Delete the last num output messages in this cell
    delete_last_output: (num) =>
        x = @_get_output()
        if not x?
            return
        {loc, s, n} = x
        for _ in misc.range(num)
            i = s.lastIndexOf(MARKERS.output)
            if i == -1
                @set_output()  # delete it all
                return
            s = s.slice(0,i)
        s = s.slice(37)
        @cm.replaceRange(s, {line:loc.from.line, ch:37}, loc.to)

    # For a given list output of messages, set the output of that cell to them.
    set_output: (output=[]) =>
        line = @end_line()
        if not line?
            console.warn("set_output: unable to append output message since cell no longer exists")
            return
        ch = @cm.getLine(line).length
        if output.length == 0 and loc?.to.ch == 38
            # nothing to do -- already empty
            return
        s  = MARKERS.output + (@mesg_to_json(mesg) for mesg in output).join(MARKERS.output)
        @cm.replaceRange(s, {line:line, ch:37}, {line:line, ch:ch})

    remove_cell_flag: (flag) =>
        n = @start_line()
        if n?
            s = @doc.get_input_line_flagstring(n)
            if s? and flag in s
                s = s.replace(new RegExp(flag, "g"), "")
                @doc.set_input_line_flagstring(n, s)

    set_cell_flag: (flag) =>
        n = @start_line()
        if n?
            s = @doc.get_input_line_flagstring(n)
            if flag not in s
                @doc.set_input_line_flagstring(n, s + flag)

    # returns a string with the flags in it
    get_cell_flags: =>
        return @doc.get_input_line_flagstring(@start_line())

    action: (opts={}) =>
        opts = defaults opts,
            execute       : false  # if false, do whatever else we would do, but don't actually execute code; if true, execute
            toggle_input  : false  # if true; toggle whether input is displayed; ranges all toggle same as first
            toggle_output : false  # if true; toggle whether output is displayed; ranges all toggle same as first
            delete_output : false  # if true; delete all the the output in the range
            cm            : undefined
        if opts.toggle_input
            n = @start_line()
            if not n?
                return
            if FLAGS.hide_input in @get_cell_flags()
                # input is currently hidden
                @remove_cell_flag(FLAGS.hide_input)
            else
                # input is currently visible
                @set_cell_flag(FLAGS.hide_input)
        if opts.toggle_output
            flags = @get_cell_flags()
            n = @start_line()
            if not n?
                return
            if FLAGS.hide_output in @get_cell_flags()
                # output is currently hidden
                @remove_cell_flag(FLAGS.hide_output)
            else
                # output is currently visible
                @set_cell_flag(FLAGS.hide_output)
        if opts.delete_output
            if FLAGS.hide_input in @get_cell_flags()
                # input is currently hidden -- so we do NOT delete output (this confuses people too much)
                return
            @set_output([])
            # also show it if hidden (since nothing there)
            if FLAGS.hide_output in @get_cell_flags()
                # output is currently hidden
                @remove_cell_flag(FLAGS.hide_output)
        if opts.execute
            flags = @get_cell_flags()
            if not flags?
                # broken/gone
                return
            if FLAGS.hide_output in flags
                # output is currently hidden
                @remove_cell_flag(FLAGS.hide_output)
            if FLAGS.execute in flags or FLAGS.running in flags
                # already running or queued up for execution.
                return
            x = @client_side()
            if x
                x.cell = @
                @doc.execute_cell_client_side(x)
            else
                @doc.execute_cell_server_side(cell : @)

    # Determine if this cell can be evaluated client side, and if so return
    # {mode:?, hide:?, once:?, code:?}, where code is everything after the mode line.
    # Otherwise, returns undefined.
    client_side: =>
        s = @input()
        if not s?
            return # no longer defined
        s = s.trim()
        i = s.indexOf('\n')
        if i != -1
            line0 = s.slice(0,i)
            rest = s.slice(i+1)
            s = line0.replace(/\s/g,'').toLowerCase()      # remove whitespace
            x = CLIENT_SIDE_MODE_LINES[s]
            if x?
                x.code = rest
                return x
        return false


exports.SynchronizedWorksheet = SynchronizedWorksheet
