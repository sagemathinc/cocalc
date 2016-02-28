async = require('async')

{MARKERS, FLAGS, ACTION_FLAGS} = require('smc-util/sagews')

{SynchronizedDocument2} = require('./syncdoc')

misc     = require('smc-util/misc')
{defaults, required} = misc

misc_page = require('./misc_page')
message  = require('smc-util/message')
markdown = require('./markdown')
{salvus_client} = require('./salvus_client')
{alert_message} = require('./alerts')

{IS_MOBILE} = require('./feature')

templates           = $("#salvus-editor-templates")
cell_start_template = templates.find(".sagews-input")
output_template     = templates.find(".sagews-output")

CLICK_TO_EDIT = "(double click to edit)"

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


class SynchronizedWorksheet extends SynchronizedDocument2
    constructor: (@editor, @opts) ->
        # these two lines are assumed, at least by the history browser
        @codemirror  = @editor.codemirror
        @codemirror1 = @editor.codemirror1

        if @opts.static_viewer
            @readonly   = true
            @project_id = @editor.project_id
            @filename   = @editor.filename
            return

        opts0 =
            cursor_interval : @opts.cursor_interval
            sync_interval   : @opts.sync_interval
        super @editor, opts0, () =>
            @process_sage_updates(caller:"constructor")

        @init_worksheet_buttons()
        @init_html_editor_buttons()

        @on 'sync', () =>
            #console.log("sync")
            @process_sage_update_queue()

        @editor.on 'show', (height) =>
            @process_sage_updates(caller:"show")

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
                    line = changeObj.from.line
                    mark = @find_input_mark(line)
                    if mark?
                        @remove_cell_flag(mark, FLAGS.this_session)

                if changeObj.origin == 'paste'
                    changeObj.cancel()
                    # WARNING: The Codemirror manual says "Note: you may not do anything
                    # from a "beforeChange" handler that would cause changes to the
                    # document or its visualization."  I think this is OK below though
                    # since we just canceled the change.
                    @remove_cell_flags_from_changeObj(changeObj, ACTION_FLAGS)
                    @_apply_changeObj(changeObj)
                    @process_sage_updates(caller:"paste")
                    @sync()

            cm.sage_update_queue = []
            cm.on 'change', (instance, changeObj) =>
                #console.log('changeObj=', changeObj)
                if changeObj.origin == 'undo' or changeObj.origin == 'redo'
                    return
                start = changeObj.from.line
                stop  = changeObj.to.line + changeObj.text.length  # changeObj.text is an array of lines`
                if not @_update_queue_start? or start < @_update_queue_start
                    @_update_queue_start = start
                if not @_update_queue_stop? or stop > @_update_queue_stop
                    @_update_queue_stop = stop
                @process_sage_update_queue()
                #if @editor._split_view
                    # TODO: make faster by using change object to determine line range to consider!
                #    @process_sage_updates
                #        cm            : instance
                #        ignore_output : true
                #        caller: "change"

    _apply_changeObj: (changeObj) =>
        @codemirror.replaceRange(changeObj.text, changeObj.from, changeObj.to)
        if changeObj.next?
            @_apply_changeObj(changeObj.next)


    cell: (line) ->
        return new SynchronizedWorksheetCell(@, line)
        # NOTE: We do **NOT** cache cells.  The reason is that client code should create
        # a cell for a specific purpose, then call cell.clear() when done.
        # The reason is that at any time new input cell lines can be added in the
        # middle of a cell, and in general the document can change arbitrarily.
        # Keeping a big list of cells in sync with the document would be
        # extremely difficult and inefficient.  Instead, this cell class just provides
        # a clean abstraction for doing specific things with cells.

    # Return list of all cells that are touched by the current selection
    # or contain any cursors.
    get_current_cells: ->
        cm = @focused_codemirror()
        cells = []
        top = undefined
        process_line = (n) =>
            if not top? or n < top
                cell = @cell(n)
                cells.push(cell)
                top = cell.get_input_mark().find().from.line
        for sel in cm.listSelections().reverse()   # "These will always be sorted, and never overlap (overlapping selections are merged)."
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

    process_sage_update_queue: () =>
        #console.log("process, start=#{@_update_queue_start}, stop=#{@_update_queue_stop}")
        if @_update_queue_start?
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
        buttons.find("a[href=#execute]").click () =>
            @action(execute:true, advance:true)
            return false
        buttons.find("a[href=#toggle-input]").click () =>
            @action(execute:false, toggle_input:true)
            return false
        buttons.find("a[href=#toggle-output]").click () =>
            @action(execute:false, toggle_output:true)
            return false
        buttons.find("a[href=#delete-output]").click () =>
            @action(execute:false, delete_output:true)
            return false

        buttons.find("a[href=#tab]").click () =>
            @editor.press_tab_key(@editor.codemirror_with_last_focus)
            return false

        buttons.find("a[href=#new-html]").click () =>
            cm = @focused_codemirror()
            line = cm.lineCount()-1
            while line >= 0 and cm.getLine(line) == ""
                line -= 1
            if line >= 0 and cm.getLine(line)[0] == MARKERS.cell
                cm.replaceRange("%html\n#{CLICK_TO_EDIT}", {line:line+1,ch:0})
                cm.setCursor(line:line+1, ch:0)
            else
                cm.replaceRange("\n\n\n", {line:line+1,ch:0})
                @cell_start_marker(line+1)
                @cell_start_marker(line+3)
                cm.replaceRange("%html\n#{CLICK_TO_EDIT}", {line:line+2,ch:0})
                cm.setCursor(line:line+2, ch:0)
            @action
                execute : true
                advance : true

        interrupt_button = buttons.find("a[href=#interrupt]").click () =>
            interrupt_button.find("i").addClass('fa-spin')
            @interrupt
                maxtime : 15
                cb : (err) =>
                    interrupt_button.find("i").removeClass('fa-spin')
                    if err
                        alert_message(type:"error", message:"Unable to interrupt worksheet; try restarting the worksheet instead.")
            return false
        kill_button = buttons.find("a[href=#kill]").click () =>
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
                    line = cm.getLine(c.from.line)
                    if line? and line.length > 0 and (line[0] == MARKERS.output or line[0] == MARKERS.cell)
                        return true
            for t in c.text
                if MARKERS.output in t or MARKERS.cell in t
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

    on_redo: (cm, changeObj) =>
        u = cm.getHistory().done
        if u.length > 0 and @_is_dangerous_undo_step(cm, u[u.length-1].changes)
            try
                cm.redo()
                # TODO: having to do this is potentially very bad/slow if document has large number
                # of outputs.  However, codemirror throws away all the line classes on redo.  So have
                # to do this.  This is temporary anyways, since we plan to get rid of using codemirror
                # undo entirely.
                @set_all_output_line_classes()
            catch e
                console.warn("skipping redo: ",e)

    interrupt: (opts={}) =>
        opts = defaults opts,
            maxtime : 15
            cb      : undefined
        if @readonly
            opts.cb?(); return
        @close_on_action()
        t = misc.walltime()
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

    kill: (opts={}) =>
        opts = defaults opts,
            restart : false
            maxtime : 60
            cb      : undefined
        if @readonly
            opts.cb?(); return
        t = misc.walltime()
        @close_on_action()
        # Set any running cells to not running.
        for cm in [@codemirror, @codemirror1]
            for marker in cm.getAllMarks()
                if marker.type == MARKERS.cell
                    for flag in ACTION_FLAGS
                        @remove_cell_flag(marker, flag)
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
                line     : "open?"
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
            cb    : () => opts.cb?()

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
            preparse : true
            timeout  : undefined
            cb       : required
        @sage_call
            input :
                event    : 'introspect'
                line     : opts.line
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
        line = cm.getLine(pos.line).slice(0, pos.ch)
        if pos.ch == 0 or line[pos.ch-1] in ")]}'\"\t "
            if @editor.opts.spaces_instead_of_tabs
                cm.tab_as_space()
            else
                CodeMirror.commands.defaultTab(cm)
            return
        @introspect_line
            line : line
            cb   : (mesg) =>
                if mesg.event == "error"
                    # showing user an alert_message at this point isn't usable; but do want to know
                    # about this.
                    salvus_client.log_error("Unable to instrospect -- #{err}, #{mesg?.error}")
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
        # For each line in the editor (or starting at line start), check if the line
        # starts with a cell or output marker and is not already marked.
        # If not marked, mark it appropriately, and possibly process any
        # changes to that line.
        ##tm = misc.mswalltime()
        before = @editor.codemirror.getValue()
        if opts.pad_bottom
            @pad_bottom_with_newlines(opts.pad_bottom)
        try
            if not opts.cm?
                @_process_sage_updates(@editor.codemirror, opts.start, opts.stop)
                if @editor._split_view
                    @_process_sage_updates(@editor.codemirror1, opts.start, opts.stop)
            else
                @_process_sage_updates(opts.cm, opts.start, opts.stop)
        catch e
            console.log("Error rendering worksheet", e)
        ##console.log("process_sage_updates(opts=#{misc.to_json({caller:opts.caller, start:opts.start, stop:opts.stop})}): time=#{misc.mswalltime(tm)}ms")
        after = @editor.codemirror.getValue()
        if before != after
            @_syncstring.set(after)

    _process_sage_updates: (cm, start, stop) =>
        #console.log("process_sage_updates(start=#{start}, stop=#{stop}):'#{cm.getValue()}'")
        if not start?
            start = 0
        if not stop?
            stop = cm.lineCount()-1

        for line in [start..stop]
            x = cm.getLine(line)
            #console.log("line=#{line}: '#{misc.trunc(x,256)}'")
            if not x?
                continue

            if x[0] == MARKERS.cell
                marks = cm.findMarksAt({line:line})
                if not marks? or marks.length == 0
                    first_pass = true
                    @mark_cell_start(cm, line)
                else
                    first_pass = false
                    first = true
                    for mark in marks
                        if not first # there should only be one mark
                            console.warn("found extra mark!", mark)
                            mark.clear()
                            continue
                        first = false
                        # The mark should only span one line:
                        #   insertions when applying a patch can unfortunately mess this up,
                        #   so we have to re-do any that accidentally span multiple lines.
                        m = mark.find()
                        if m.from.line != m.to.line
                            mark.clear()
                            @mark_cell_start(cm, line)
                        else if m.from.ch != 0
                            console.warn("deleting beginning of line", m)
                            cm.replaceRange('', {line:line,ch:0}, m.from)
                flagstring = x.slice(37, x.length-1)
                mark = cm.findMarksAt({line:line, ch:0})[0]
                #console.log("at line=#{line} we have flagstring=#{flagstring}, mark.flagstring=#{mark?.flagstring}")
                # It's possible mark isn't defined above, in case of some weird file corruption (say
                # intentionally by the user).  That's why we have "mark?" in the condition below.
                if mark? and flagstring != mark.flagstring
                    # only do something if the flagstring changed.
                    if not mark.flagstring?
                        mark.flagstring = ''
                    if not @opts.static_viewer
                        elt = @elt_at_mark(mark)
                        if FLAGS.execute in flagstring
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

                    if FLAGS.hide_input in flagstring and FLAGS.hide_input not in mark.flagstring
                        @hide_input(line)
                    else if FLAGS.hide_input in mark.flagstring and FLAGS.hide_input not in flagstring
                        @show_input(line)

                    if FLAGS.hide_output in flagstring and FLAGS.hide_output not in mark.flagstring
                        @hide_output(line)
                    else if FLAGS.hide_output in mark.flagstring and FLAGS.hide_output not in flagstring
                        @show_output(line)

                    if not first_pass
                        # During the first pass the output cells haven't been created yet.   So the
                        # attempts to hide them above fail.  If we set mark.flagstring = flagstring,
                        # then we won't try again during the second pass.
                        mark.flagstring = flagstring

            else
                if x[0] == MARKERS.output
                    marks = cm.findMarksAt({line:line, ch:1})
                    if marks.length == 0
                        @mark_output_line(cm, line)
                    mark = cm.findMarksAt({line:line, ch:1})[0]
                    output = @elt_at_mark(mark)
                    if mark? and output? and not mark.finish_editing? and mark.processed != x
                        new_output = false
                        f = (elt, mesg) =>
                            new_output = true
                            try
                                @process_output_mesg
                                    mesg    : JSON.parse(mesg)
                                    element : elt
                                    mark    : mark
                            catch e
                                console.log(e.stack)
                                log("BUG: error rendering output: '#{mesg}' -- #{e}")

                        # This is more complicated than you might think because past messages can
                        # be modified at any time -- it's not a linear stream.
                        # appearance of output shows output
                        output.removeClass('sagews-output-hide')
                        messages = x.split(MARKERS.output).slice(2) # skip output uuid
                        elts = output.find(".sagews-output-messages")
                        outputs = elts.children()
                        for i in [0...Math.max(messages.length, outputs.length)]
                            if i >= messages.length
                                $(outputs[i]).remove()
                            else if i >= outputs.length
                                mesg = messages[i]
                                elt = $("<span>")
                                elt.data('mesg',mesg)
                                elts.append(elt)
                                if mesg.length > 0
                                    f(elt, mesg)
                            else
                                elt = $(outputs[i])
                                mesg = messages[i]
                                if elt.data('mesg') != mesg
                                    elt.empty().data('mesg', mesg)
                                    if mesg.length > 0
                                        f(elt, mesg)
                        mark.processed = x

                else if x.indexOf(MARKERS.output) != -1
                    #console.log("correcting merge/paste issue with output marker line (line=#{line})")
                    ch = x.indexOf(MARKERS.output)
                    cm.replaceRange('\n', {line:line, ch:ch})
                    @process_sage_updates(start:line, stop:line+2, caller:"fix output")
                    return

                else if x.indexOf(MARKERS.cell) != -1
                    #console.log("correcting merge/paste issue with cell marker (line=#{line})")
                    ch = x.indexOf(MARKERS.cell)
                    cm.replaceRange('\n', {line:line, ch:ch})
                    @process_sage_updates(start:line, stop:line+2, caller:"fix input")
                    return

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
            run_state  : undefined    # undefined, 'execute', 'running', 'done'
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
            if opts.run_state == 'execute'
                e.addClass('sagews-input-execute').removeClass('sagews-input-running').addClass('blink')
            else if opts.run_state == 'running'
                e.addClass('sagews-input-running').removeClass('sagews-input-execute').addClass('blink')
            else if opts.run_state == 'done'
                e.removeClass('sagews-input-execute').removeClass('sagews-input-running').removeClass('blink')

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
            @_syncstring._evaluator.call
                program : 'sage'
                input   : opts.input
                cb      : opts.cb
        return

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
        interact_elt.sage_interact(desc:desc, execute_code:@execute_code, process_output_mesg:f)

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

        # make links open in a new tab
        a.attr("target","_blank")

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
                        require('./projects').load_target(decodeURI(target), not(e.which==2 or (e.ctrlKey or e.metaKey)))
                        return false
                else if href.indexOf('http://') != 0 and href.indexOf('https://') != 0
                    # internal link
                    y.click (e) ->
                        target = $(@).attr('href')
                        if target.indexOf('/projects/') == 0
                            # fully absolute (but without https://...)
                            target = decodeURI(target.slice('/projects/'.length))
                        else if target[0] == '/' and target[37] == '/' and misc.is_valid_uuid_string(target.slice(1,37))
                            # absolute path with /projects/ omitted -- /..project_id../files/....
                            target = decodeURI(target.slice(1))  # just get rid of leading slash
                        else if target[0] == '/'
                            # absolute inside of project
                            target = "#{that.project_id}/files#{decodeURI(target)}"
                        else
                            # realtive to current path
                            target = "#{that.project_id}/files/#{that.file_path()}/#{decodeURI(target)}"
                        require('./projects').load_target(target, not(e.which==2 or (e.ctrlKey or e.metaKey)))
                        return false

        # make relative links to images use the raw server
        a = e.find("img")
        for x in a
            y = $(x)
            src = y.attr('src')
            if src.indexOf('://') != -1
                continue
            new_src = "/#{@project_id}/raw/#{@file_path()}/#{src}"
            y.attr('src', new_src)

    _post_save_success: () =>
        @remove_output_blob_ttls()

    remove_output_blob_ttls: (cb) =>
        # TODO: prioritize automatic testing of this highly... since it is easy to break by changing
        # how worksheets render slightly.
        v = {}
        for a in @cm_wrapper().find(".sagews-output-messages").children()
            blobs = $(a).data('blobs')
            if blobs?
                for uuid in blobs
                    v[uuid] = true
        uuids = misc.keys(v)
        if uuids?
            salvus_client.remove_blob_ttls
                uuids : uuids
                cb    : cb

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
                console.log("submitting raw_input...")
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
                switch misc.filename_extension(val.filename)
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

                    when 'svg', 'png', 'gif', 'jpg'
                        img = $("<img src='#{target}' class='sagews-output-image'>")
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
                        output.append($("<a href='#{target}' class='sagews-output-link' target='_new'>#{val.filename} (this temporary link expires in a minute)</a> "))

        if mesg.javascript? and @allow_javascript_eval()
            (() =>
             cell      = new Cell(output : opts.element)
             worksheet = new Worksheet(@)
             print     = (s...) -> cell.output.append($("<div></div>").text("#{s.join(' ')}"))

             code = mesg.javascript.code
             async.series([
                 (cb) =>
                     if mesg.javascript.coffeescript or code.indexOf('CoffeeScript') != -1 or mesg.javascript.cjsx
                         misc_page.load_coffeescript_compiler(cb)
                     else
                         cb()
                 (cb) =>
                     # DEPRECATED for now -- not useful.
                     #if mesg.javascript.cjsx
                     #    code = CoffeeScript.compile(require('coffee-react-transform')(code))
                     if mesg.javascript.coffeescript
                         code = CoffeeScript.compile(code)
                     if mesg.obj?
                         obj  = JSON.parse(mesg.obj)

                     # The eval below is an intentional cross-site scripting vulnerability in the fundamental design of Salvus.
                     # Note that there is an allow_javascript document option, which (at some point) users
                     # will be able to set.  There is one more instance of eval below in _receive_broadcast.
                     eval(code)
                     @refresh_soon()
                     cb()
             ])
            )()

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

        if mesg.auto?
            if opts.mark?
                line = opts.mark.find()?.from.line
                if line?
                    cell = @cell(line)
                    if cell?
                        if mesg.auto
                            cell.set_cell_flag(FLAGS.auto)
                        else
                            cell.remove_cell_flag(FLAGS.auto)

        # NOTE: Right now the "state object" is a just a list of messages in the output of a cell. It's viewed as something that should get rendered in order, with no dependence between them. Instead alll thoose messages should get fed into one single state object, which then gets rendered each time it changes. React makes that approach easy and efficient. Without react (or something similar) it is basically impossible.  When sage worksheets are rewritten using react, this will change.
        if mesg.clear
            line = opts.mark.find()?.from.line
            if line?
                @cell(line)?.set_output()

        if mesg.delete_last
            line = opts.mark.find()?.from.line
            if line?
                # we pass in 2 to delete the delete_last message itself.
                @cell(line)?.delete_last_output(2)

        if mesg.done
            output.removeClass('sagews-output-running')
            output.addClass('sagews-output-done')

        @refresh_soon()

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
                         worksheet = new Worksheet(@)
                         cell      = new Cell(cell_id : mesg.cell_id)
                         print     = (s...) -> console.log("#{s.join(' ')}") # doesn't make sense, but better than printing to printer...
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
                                 eval(code)
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
                        cm.replaceRange("%html\n#{CLICK_TO_EDIT}", {line:line+1,ch:0})
                        @action
                            execute : true
                            advance : false
                    if (e.altKey or e.metaKey)
                        cm.replaceRange("%md\n#{CLICK_TO_EDIT}", {line:line+1,ch:0})
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
            inclusiveLeft  : false
            inclusiveRight : false
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
        cm = @focused_codemirror()
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
            output.dblclick () =>
                # Double click output to toggle input
                @action(pos:{line:mark.find().from.line-1, ch:0}, toggle_input:true)

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
    # or of the block that contains the given line number.
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

    enter_key: (cm) =>
        marks = cm.findMarksAt({line:cm.getCursor().line,ch:1})
        if marks.length > 0
            @edit_cell
                line : marks[0].find().from.line
                cm   : cm
        else
            return CodeMirror.Pass

    action: (opts={}) =>
        opts = defaults opts,
            pos           : undefined
            advance       : false
            split         : false  # split cell at cursor (selection is ignored)
            execute       : false  # if false, do whatever else we would do, but don't actually execute code.
            toggle_input  : false  # if true; toggle whether input is displayed; ranges all toggle same as first
            toggle_output : false  # if true; toggle whether output is displayed; ranges all toggle same as first
            delete_output : false  # if true; delete all the the output in the range

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
                cells = @get_current_cells()
            for cell in cells
                cell.action
                    execute       : opts.execute
                    toggle_input  : opts.toggle_input
                    toggle_output : opts.toggle_output
                    delete_output : opts.delete_output
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
            opts.hide = true
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

        #dbg = (m...) -> console.log("execute_cell_server_side:", m...)
        #dbg("block=#{misc.to_json(opts.block)}")
        if @_restarting
            @once 'restarted', (err) =>
                if not err
                    @execute_cell_server_side(opts)
                else
                    opts.cb?(err)
            return

        cell  = opts.cell
        input = cell.input()
        if not input?
            #dbg("cell vanished/invalid")
            return

        cur_height = cell.get_output_height()
        output_uuid = cell.new_output_uuid()
        if not output_uuid?
            #dbg("output_uuid not defined")
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
                #console.log("got mesg ", mesg, new Date() - t0); t0 = new Date()
                cell.append_output_message(mesg)
                if mesg.done
                    done()
                @sync()

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
    get_cell_flagstring: (marker) =>
        if not marker?
            return undefined
        pos = marker.find()
        if not pos?
            return ''
        cm = @focused_codemirror()
        if not misc.is_valid_uuid_string(cm.getRange({line:pos.from.line,ch:1},{line:pos.from.line, ch:37}))
            # worksheet is somehow corrupt
            # TODO: should fix things at this point, or make sure this is never hit; could be caused by
            # undo conflicting with updates.
            return undefined
        return cm.getRange({line:pos.from.line,ch:37},{line:pos.from.line, ch:pos.to.ch-1})

    set_cell_flagstring: (marker, value) =>
        if not marker?
            return
        pos = marker.find()
        #console.log("set_cell_flagstring '#{value}' at #{misc.to_json(pos)}")
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
        x = cm.findMarksAt(line:line, ch:0)
        if x.length > 0 and x[0].type == MARKERS.cell
            # already properly marked
            return {marker:x[0], created:false}
        if cm.lineCount() < line + 2
            cm.replaceRange('\n',{line:line+1,ch:0})
        uuid = misc.uuid()
        cm.replaceRange(MARKERS.cell + uuid + MARKERS.cell + '\n', {line:line, ch:0})
        @process_sage_updates(start:line, stop:line+1, caller:"cell_start_marker")  # this creates the mark
        x = cm.findMarksAt(line:line, ch:0)
        if x.length > 0 and x[0].type == MARKERS.cell
            # already properly marked
            return {marker:x[0], created:true}
        else
            return {marker:@mark_cell_start(cm, line), created:true}

    remove_cell_flags_from_changeObj: (changeObj, flags) =>
        # Remove cell flags from *contiguous* text in the changeObj.
        # This is useful for cut/copy/paste.
        # This function modifies changeObj in place.
        @remove_cell_flags_from_text(changeObj.text, flags)
        if changeObj.next?
            @remove_cell_flags_from_changeObj(changeObj.next, flags)

    remove_cell_flags_from_text: (text, flags) =>
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
            if s.length >= 38 and s[0] == MARKERS.cell
                if flags?
                    text[i] = s.slice(0,37) + (x for x in s.slice(37,s.length-1) when x not in flags) + MARKERS.cell
                else
                    text[i] = s.slice(0,37) + MARKERS.cell

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
                data_url  = scene.static_image
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

    interrupt: (opts) =>
        opts = defaults opts,
            maxtime : 15
            cb      : undefined
        if @readonly
            opts.cb?()
            return
        @close_on_action()
        t = misc.walltime()
        async.series([
            (cb) =>
                @send_signal
                    signal : 2
                    cb     : cb
            (cb) =>
                @start
                    maxtime : opts.maxtime - misc.walltime(t)
                    cb      : cb
        ], (err) =>
            opts.cb?(err)
        )

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

class SynchronizedWorksheetCell
    constructor: (@doc, line) ->
        # Set an id; this is useful to keep track of this cell for this client only;
        # since input and output cell id can change, need this.
        @_init(line)

    # remove this cell when it is no longer needed -- like CodeMirror clear method on marks.
    clear: =>
        if @_input_mark?
            @_input_mark.clear()
            delete @_input_mark
        if @_output_mark?
            @_output_mark.clear()
            delete @_output_mark

    _init: (line) =>
        # Determine input and end lines of the cell that contains the given line.
        # Then ensure there is a cell input marker a cell end marker, and get the correspondings
        # marks so that we can keep track of the extent of the cell.  As long as either marker
        # is defined, we can compute/define the other one.
        x = @doc.current_input_block(line)
        input = x.start; end = x.end
        if not @_input_mark?
            {marker, created} = @doc.cell_start_marker(input)
            @_input_mark = marker
            if created  # just added a new line when creating start marker
                @doc.process_sage_updates(start:input, stop:input, caller:"SynchronizedWorksheetCell._init")
                end += 1
        if not @_output_mark?
            output_line = @doc.find_output_line(end)
            cm = @doc.focused_codemirror()
            if output_line?
                @_output_mark = @doc.find_output_mark(output_line, cm)
                if not @_output_mark?
                    @_output_mark = @doc.mark_output_line(cm, output_line)
                    @doc.process_sage_updates(start:output_line, stop:output_line, caller:"SynchronizedWorksheetCell._init")
            else
                # insert new empty output line after input
                s = MARKERS.output + misc.uuid() + MARKERS.output + '\n'
                cm.replaceRange(s, {line:end+1,ch:0}, {line:end+1,ch:0})
                @doc.process_sage_updates(start:end, stop:end+1, caller:"SynchronizedWorksheetCell._init")
                @_output_mark = @doc.find_output_mark(end, cm)

    # Return range of lines containing this cell right now.  Or undefined if cell is gone.
    #    {from:{line:?,ch:?}, to:{line:?, ch:?}}
    find: =>
        loc0 = @get_input_mark()?.find()
        if not loc0?
            return
        loc1 = @get_output_mark()?.find()
        if not loc1?
            return
        return {from:loc0.from, to:loc1.to}

    # Assuming @_input_mark is no longer in the document, attempt to find or create
    # the input marker for this cell, using the output marker (assuming it exits)
    # This will be possible if
    _find_input_mark: =>
        loc = @_output_mark?.find()
        if not loc?
            return  # nothing to do -- can't find
        delete @_input_mark
        @_init(loc.from.line)
        return @_input_mark

    # returns the input mark or undefined; if defined, then the mark is guaranteed to be in
    # the document, so .find() will return a location.
    get_input_mark: =>
        if not @_input_mark?.find()
            return @_find_input_mark()
        else
            return @_input_mark

    _find_output_mark: =>
        loc = @_input_mark?.find()
        if not loc?
            return  # nothing to do -- can't find
        delete @_output_mark
        @_init(loc.from.line)
        return @_output_mark

    # Returns the output mark or undefined; if defined, then the mark is guaranteed to be in
    # the document, so .find() will return a location.
    get_output_mark: =>
        if not @_output_mark?.find()
            return @_find_output_mark()
        else
            return @_output_mark

    get_output_height: =>
        return @get_output_mark()?.element?.height()

    set_output_min_height: (min_height='') =>
        if not min_height
            min_height = ''
        @get_output_mark()?.element?.css('min-height', min_height)

    input_uuid: =>
        return @raw_input()?.slice(1,37)

    output_uuid: =>
        return @raw_output()?.slice(1,37)

    # generate a new random output uuid and replace the existing one
    new_output_uuid: =>
        line = @get_output_mark()?.find()?.from.line
        if not line?
            return
        output_uuid = misc.uuid()
        cm = @doc.focused_codemirror()
        cm.replaceRange(output_uuid, {line:line,ch:1}, {line:line,ch:37})
        return output_uuid

    # return current content of the input of this cell, including uuid marker line
    raw_input: (offset=0) =>
        loc0 = @get_input_mark()?.find()
        if not loc0?
            return
        loc1 = @get_output_mark()?.find()
        if not loc1?
            return
        return @doc.focused_codemirror().getRange({line:loc0.from.line+offset,ch:0}, {line:loc1.from.line, ch:0})

    input: =>
        return @raw_input(1)

    # return current content of the output line of this cell as a string (or undefined)
    raw_output: =>
        loc = @get_output_mark()?.find()
        if not loc?
            return
        return @doc.focused_codemirror().getLine(loc.from.line)

    output: =>
        return (misc.from_json(x) for x in @raw_output().slice(38).split(MARKERS.output) when x)

    _get_output: () =>
        mark = @get_output_mark()
        loc = mark?.find()
        if not loc?
            console.warn("unable to append output message since cell no longer exists")
            return
        else
            cm = @doc.focused_codemirror()
            n  = loc.from.line
            s  = cm.getLine(n)
            return {cm: cm, loc: loc, s: s, n: n}

    # append an output message to this cell
    append_output_message: (mesg) =>
        x = @_get_output()
        if not x?
            return
        {cm, loc, n} = x
        t  = MARKERS.output + misc.to_json(mesg)
        cm.replaceRange(t, loc.to, loc.to)
        @doc.process_sage_updates(start:n, stop:n, caller:"SynchronizedWorksheetCell.append_output_message")

    # Delete the last num output messages in this cell
    delete_last_output: (num) =>
        x = @_get_output()
        if not x?
            return
        {cm, loc, s, n} = x
        for _ in misc.range(num)
            i = s.lastIndexOf(MARKERS.output)
            if i == -1
                @set_output()  # delete it all
                return
            s = s.slice(0,i)
        s = s.slice(37)
        cm.replaceRange(s, {line:loc.from.line, ch:37}, loc.to)
        @doc.process_sage_updates(start:n, stop:n, caller:"SynchronizedWorksheetCell.delete_last_output")

    # For a given list output of messages, set the output of that cell to them.
    set_output: (output=[]) =>
        loc = @get_output_mark()?.find()
        if not loc?
            console.warn("unable to append output message since cell no longer exists")
            return
        if output.length == 0 and loc.to.ch == 38
            # nothing to do -- already empty
            return
        cm = @doc.focused_codemirror()
        n  = loc.from.line
        s  = MARKERS.output + (misc.to_json(mesg) for mesg in output).join(MARKERS.output)
        cm.replaceRange(s, {line:loc.from.line, ch:37}, loc.to)
        @doc.process_sage_updates(start:n, stop:n, caller:"SynchronizedWorksheetCell.set_output")

    remove_cell_flag: (flag) =>
        mark = @get_input_mark()
        if mark?
            @doc.remove_cell_flag(mark, flag)

    set_cell_flag: (flag) =>
        mark = @get_input_mark()
        if mark?
            @doc.set_cell_flag(mark, flag)
        n = mark.find()?.from?.line
        if n?
            @doc.process_sage_updates(start:n, stop:n, caller:"set_cell_flag")

    # returns a string with the flags in it
    get_cell_flags: =>
        mark = @get_input_mark()
        if mark?
            @doc.get_cell_flagstring(mark)

    action: (opts={}) =>
        opts = defaults opts,
            execute       : false  # if false, do whatever else we would do, but don't actually execute code; if true, execute
            toggle_input  : false  # if true; toggle whether input is displayed; ranges all toggle same as first
            toggle_output : false  # if true; toggle whether output is displayed; ranges all toggle same as first
            delete_output : false  # if true; delete all the the output in the range
            cm            : undefined
        input = @get_input_mark()
        if not input?  # cell no longer exists
            return
        if opts.toggle_input
            if FLAGS.hide_input in @get_cell_flags()
                # input is currently hidden
                @remove_cell_flag(FLAGS.hide_input)
            else
                # input is currently visible
                @set_cell_flag(FLAGS.hide_input)
            n = input.find().from.line
            @doc.process_sage_updates(start:n, stop:n, caller:"SynchronizedWorksheetCell.action - toggle_input")
        if opts.toggle_output
            if FLAGS.hide_output in @get_cell_flags()
                # output is currently hidden
                @remove_cell_flag(FLAGS.hide_output)
            else
                # output is currently visible
                @set_cell_flag(FLAGS.hide_output)
            n = input.find().from.line
            @doc.process_sage_updates(start:n, stop:n, caller:"SynchronizedWorksheetCell.action - toggle_output")
        if opts.delete_output
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

###
Cell and Worksheet below are used when eval'ing %javascript blocks.
###

class Cell
    constructor : (opts) ->
        @opts = defaults opts,
            output  : undefined # jquery wrapped output area
            cell_id : undefined
        @output = opts.output
        @cell_id = opts.cell_id

class Worksheet
    constructor : (@worksheet) ->
        @project_page = @worksheet.editor.editor.project_page
        @editor = @worksheet.editor.editor

    execute_code: (opts) =>
        if typeof opts == "string"
            opts = {code:opts}
        @worksheet.execute_code(opts)

    interrupt: () =>
        @worksheet.interrupt()

    kill: () =>
        @worksheet.kill()

    set_interact_var : (opts) =>
        elt = @worksheet.element.find("#" + opts.id)
        if elt.length == 0
            log("BUG: Attempt to set var of interact with id #{opts.id} failed since no such interact known.")
        else
            i = elt.data('interact')
            if not i?
                log("BUG: interact with id #{opts.id} doesn't have corresponding data object set.", elt)
            else
                i.set_interact_var(opts)

    del_interact_var : (opts) =>
        elt = @worksheet.element.find("#" + opts.id)
        if elt.length == 0
            log("BUG: Attempt to del var of interact with id #{opts.id} failed since no such interact known.")
        else
            i = elt.data('interact')
            if not i?
                log("BUG: interact with id #{opts.id} doesn't have corresponding data object del.", elt)
            else
                i.del_interact_var(opts.name)

exports.SynchronizedWorksheet = SynchronizedWorksheet
