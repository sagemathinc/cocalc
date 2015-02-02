###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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


#####################################################
#
# A Compute Cell
#
######################################################

# IMPORTANT - this file is no longer used!!!!


{EventEmitter} = require('events')

{IS_MOBILE}    = require("feature")

{copy, filename_extension, required, defaults, to_json, len} = require('misc')

{local_diff} = require('misc_page')

{alert_message} = require('alerts')

diffsync = require('diffsync')

COMPONENTS = ['editor', 'output', 'checkbox', 'insert-above', 'insert-below']

# templates
templates     = $("#salvus-cell-templates")
cell_template = templates.find(".salvus-cell")

# the Cell class
class Cell extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            # used to tag the cell for synchronizing between clients
            id                    : undefined

            # DOM element (or jquery wrapped element); this is replaced by the cell
            element               : undefined

            # initial value of the code editor (TEXT)
            input                 : undefined
            # initial value of the output area (JSON)
            output                : undefined

            # subarray of COMPONENTS (see definition at top of this file); if given, hides
            # the given components when the cell is created
            hide                  : []

            # If given, and hide is undefined, show only these components
            show                  : undefined

            # language mode of the input editor
            editor_mode           : "python"
            # whether to display line numbers in the input code editor
            editor_line_numbers   : true
            # number of spaces to indent in the code editor
            editor_indent_spaces  : 4
            # whether or not to wrap lines in the code editor
            editor_line_wrapping  : true
            # undo depth for code editor
            editor_undo_depth     : 150
            # whether to do bracket matching in the code editor
            editor_match_brackets : true
            # css maximum height of code editor (scroll bars appear beyond this)
            editor_max_height     : undefined   # e.g., "10em"
            # theme
            editor_theme          : "solarized"  # see static/codemirror*/themes or head.html

            keys                  :
                # key that causes code to be executed
                execute           : "Shift-Enter"   # execute code
                move_cell_up      : "Ctrl-Up"
                move_cell_down    : "Ctrl-Down"
                interrupt         : "Esc"
                introspect        : "Tab"
                join_with_prev    : "Ctrl-Backspace"
                split_cell        : "Ctrl-;"
                execute_insert    : "Ctrl-Enter"
                execute_stay      : "Alt-Enter"
                shift_tab         : "Shift-Tab"

            # maximum height of output (scroll bars appear beyond this)
            output_max_height     : undefined    # e.g., "10em"
            # whether or not to wrap lines in the output; if not wrapped, scrollbars appear
            output_line_wrapping  : true
            # show output stopwatch during code evaluation.
            stopwatch             : true

            # maximum number of completions to show at once when tab completing
            completions_size      : 20

            # a session -- needed to execute code in a cell
            session               : undefined

        if @opts.show? and not @opts.hide?
            @opts.hide = (x for x in COMPONENTS when x not in @opts.show)

        else if not @opts.hide?
            @opts.hide = []

        if not @opts.element?
            @opts.element = $("<div>")

        e = $(@opts.element)

        if not @opts.input?
            @opts.input = e.text()
        @opts.output = e.data('output') if not @opts.output?

        @element = cell_template.clone()

        @_initialize_output()
        @_initialize_checkbox()
        @_initialize_insert()
        @_initialize_input()
        @_initialize_action_button()

        @element.data("cell", @)
        $(@opts.element).replaceWith(@element)

        if @opts.id?
            @opts.element.attr('id', @opts.id)

        @_editor.setValue(@opts.input)
        @refresh()

        if @opts.hide?
            for e in @opts.hide
                if e != 'note' # temporary backwards compat
                    @hide(e)

        @_initialize_dblclick_toggles()

        @execute_if_auto()

    #######################################################################
    # Synchronization support
    #######################################################################
    sync_obj: (obj) =>
        if not obj?
            return new docs.Cell(id:@opts.id, input:@input(), hidden:@hidden_components())
        else
            if @input() != obj.input
                @input(obj.input)
            hidden = @hidden_components()
            for c in COMPONENTS
                if c in hidden    # is hidden
                    if c not in obj.hidden  # shouldn't be hidden
                        x.show(c)
                else  # not hidden
                    if c in obj.hidden # should be hidden
                        x.hide(c)

    patch: (patch) =>
        # Apply a patch to this cell, transforming it into a new cell.
        # The patch must be in exactly the format returned by diff above.
        input_patch     = patch[1]
        component_patch = patch[2]

        input = @input()
        new_input = diffsync.dmp.patch_apply(input_patch, input)[0]
        if input != new_input
            @input(new_input)

        hidden = @hidden_components()
        for x in component_patch
            comp   = x[0]
            action = x[1]
            if action == -1
                # change component from hidden to shown
                if comp in hidden
                    @show(comp)
            else
                # change component from shown to hidden
                if comp not in hidden
                    @hide(comp)

    #######################################################################
    # Private Methods
    #######################################################################

    _initialize_dblclick_toggles: () =>
        if not IS_MOBILE # no "double click" on mobile, right?
            # double click editor: shows output; if output nonempty, also hides editor.
            # double click output: hides output if editor is shown; otherwise, shows everything
            editor = @component('editor')
            output = @component('output')

            editor.dblclick () =>
                @execute()
                @show('output')
                @hide('editor')
                return false

            output.dblclick () =>
                if not editor.hasClass('hide')
                    @hide('output')
                else
                    @show('editor')
                return false

            @element.dblclick () =>
                @show('output')
                @show('editor')
                return false

    _initialize_action_button: () =>
        if IS_MOBILE
            @_action_btns = @element.find(".salvus-cell-action-buttons-mobile")
        else
            @_action_btns = @element.find(".salvus-cell-action-buttons")
        @_action_btns.find("a[href=#execute]").click () =>
            @execute()
            return false
        @_action_btns.find("a[href=#tab]").click () =>
            @_introspect()
            return false
        @_action_btns.find("a[href=#interrupt]").click () =>
            @_interrupt()
            return false
        @_action_btns.find("a[href=#move-up]").click () =>
            @emit "move-cell-up"
            return false
        @_action_btns.find("a[href=#move-down]").click () =>
            @emit "move-cell-down"
            return false

    _initialize_checkbox: () =>
        @_checkbox = @element.find(".salvus-cell-checkbox").find("input")
        @_checkbox.click (event) =>
            @emit "checkbox-change", event.shiftKey
            return true

    _initialize_insert: () ->
        @element.find(".salvus-cell-insert-above").tooltip(delay:500, title:"Click to insert a cell.").click () =>
            @emit "insert-new-cell-before"

        @element.find(".salvus-cell-insert-below").tooltip(delay:500, title:"Click to insert a cell.").click () =>
            @emit "insert-new-cell-after"

    _initialize_input: () ->
        @_input = @element.find(".salvus-cell-input")
        @_initialize_code_editor()

    _initialize_code_editor: () ->
        @_code_editor = @_input.find(".salvus-cell-editor")

        extraKeys =
            "Up" : (editor) =>
                if editor.getCursor().line == 0
                    @emit "previous-cell"
                else
                    return CodeMirror.Pass
            "Down" : (editor) =>
                if editor.getCursor().line >= editor.lineCount() - 1
                    @emit "next-cell"
                else
                    return CodeMirror.Pass
            "Backspace" : (editor) =>
                if editor.getValue() == ""
                    @emit "delete-cell"
                else
                    return CodeMirror.Pass

        extraKeys[@opts.keys.introspect] = (editor) =>
            @_introspect()

        extraKeys[@opts.keys.execute] = (editor) =>
            @execute()
            @emit "next-cell", true

        extraKeys[@opts.keys.move_cell_up] = (editor) =>
            @emit "move-cell-up"

        extraKeys[@opts.keys.move_cell_down] = (editor) =>
            @emit "move-cell-down"

        extraKeys[@opts.keys.interrupt] = (editor) =>
            @opts.session.interrupt()
            @_close_on_action()

        extraKeys[@opts.keys.join_with_prev] = (editor) =>
            @emit "join-with-prev"

        extraKeys[@opts.keys.split_cell] = (editor) =>
            from = @_editor.getCursor()
            to   = {line:@_editor.lineCount(), ch:0}
            before_cursor = $.trim(editor.getRange({line:0, ch:0}, from))
            after_cursor = $.trim(editor.getRange(from, to))
            @emit "split-cell", before_cursor, after_cursor

        extraKeys[@opts.keys.execute_insert] = (editor) =>
            @execute()
            @emit "insert-new-cell-after"
            @emit "next-cell"

        extraKeys[@opts.keys.execute_stay] = (editor) =>
            @execute()

        extraKeys[@opts.keys.shift_tab] = (editor) => editor.unindent_selection()

        @_editor = CodeMirror.fromTextArea @_code_editor[0],
            firstLineNumber : 1
            autofocus       : false
            mode            : @opts.editor_mode
            lineNumbers     : @opts.editor_line_numbers
            indentUnit      : @opts.editor_indent_spaces
            tabSize         : @opts.editor_indent_spaces
            lineWrapping    : @opts.editor_line_wrapping
            undoDepth       : @opts.editor_undo_depth
            matchBrackets   : @opts.editor_match_brackets
            extraKeys       : extraKeys
            theme           : @opts.editor_theme

        $(@_editor.getWrapperElement()).addClass('salvus-cell-editor').css('height':'auto')
        $(@_editor.getScrollerElement()).css
            'max-height' : @opts.editor_max_height
            'height'     : 'auto'
            'overflow-y' : 'hidden'
            'overflow-x' : 'auto'

        @_editor.on "change", (instance, changeObj) =>
            @emit "change", {editor:changeObj}
            @destroy_stopwatch()

        @_editor.on "focus", (e) =>
            @selected(true)
            @emit "focus"

        @_editor.on "blur", (e) =>
            @selected(false)
            @emit "blur"

    _initialize_output: ->
        @_output = @element.find(".salvus-cell-output")

        # Set max height of the output area
        if @opts.output_max_height?
            @_output.css('max-height', @opts.output_max_height)
        # Whether or not to wrap output.
        if @opts.output_line_wrapping
            @_output_line_wrapping_on()

        # Initialize the array of output messages, which define the
        # current output in this cell, since the last evaluation.
        @_persistent_output_messages = []

        # Replay any initial outputs -- this is used, e.g., -- when
        # loading a worksheet from a file.
        if @opts.output?
            @_persistent_output_messages = []
            for mesg in @opts.output
                @append_output_in_mesg(mesg)

    _output_line_wrapping_on: ->
        @_output.css
            'word-wrap'    : 'break-word'
            'overflow-wrap': 'break-word'

    _output_line_wrapping_off: ->
        @_output.removeClass('word-wrap overflow-wrap').css('white-space':'pre')

    _interrupt: (cb) =>
        if @_execute_running? and @_execute_running
            @opts.session.interrupt () =>
                @_execute_running = false
                cb()
        else
            cb()
        return false

    _introspect: =>
        @_close_on_action()

        # If anything is selected, send a normal tab key
        if @_editor.somethingSelected()
            CodeMirror.commands.defaultTab(@_editor)
            return
        # If the character right before the cursor (on the same line)
        # is whitespace, send normal tab key.
        pos = @_editor.getCursor()
        if pos.ch == 0 or @_editor.getRange({line:pos.line, ch:pos.ch-1},
                             pos).search(/[\s|\)]/) != -1
            @_editor.tab_as_space()
            return
        # Otherwise, introspect.
        to   = @_editor.getCursor()
        spinner = spinner_at(editor:@_editor, pos:to, options:{radius:8}, delay:250)
        @opts.session.introspect
            line    : @_editor.getRange({line:0, ch:0}, to)
            timeout : 10
            cb : (err, mesg) =>
                remove_spinner(spinner)
                if err
                    alert_message(type:"error", message:err)
                    @opts.session.interrupt()
                else
                    from = {line:to.line, ch:to.ch-mesg.target.length}
                    switch mesg.event
                        when 'introspect_completions'
                            show_completions
                                editor           : @_editor
                                from             : from
                                to               : to
                                completions      : mesg.completions
                                target           : mesg.target
                                completions_size : @opts.completions_size

                        when 'introspect_docstring'
                            @_close_on_action show_introspect
                                editor    : @_editor
                                from      : from
                                content   : mesg.docstring
                                target    : mesg.target
                                type      : "docstring"

                        when 'introspect_source_code'
                            @_close_on_action show_introspect
                                editor    : @_editor
                                from      : from
                                content   : mesg.source_code
                                target    : mesg.target
                                type      : "source-code"

                        else throw("introspect_cell -- unknown event #{mesg.event}")

    _close_on_action : (element) =>
        if element?
            if not @_close_on_action_elements?
                @_close_on_action_elements = [element]
            else
                @_close_on_action_elements.push(element)
        else if @_close_on_action_elements?
            for e in @_close_on_action_elements
                e.remove()
            @_close_on_action_elements = []

    _set_interact_var: (control_desc) =>
        var0 = control_desc.var

        if control_desc.id?
            panel = $("##{control_desc.id}")
        else
            panel = @_output.closest('.salvus-cell-output-interact')

        controls = panel.find(".salvus-cell-interact-var-#{var0}")
        if controls.length > 0
            # There is already (at least) one control location with this name
            for C in controls
                control = $(C).find(':first-child')
                if control.length > 0
                    control.data("set")(control_desc.default)
                else
                    # No control yet, so make one.
                    new_control = @_interact_control(control_desc, panel.data('update'))
                    $(C).append(new_control)
                    new_control.data('refresh')?()
        else
            # No controls with this name or even place to put it.
            row = $("<div class='row-fluid'></div>")
            container = $("<div class='span12 salvus-cell-interact-var-#{var0}'></div>")
            row.append(container)
            new_control = @_interact_control(control_desc, panel.data('update'))
            if new_control?
                container.append(new_control)
                panel.append(row)
                new_control.data('refresh')?()

    _del_interact_var: (arg) =>
        panel = @_output.closest('.salvus-cell-output-interact')
        control = panel.find(".salvus-cell-interact-var-#{arg}")
        control.remove()

    _initialize_interact: (elt, desc) =>
        elt.attr('id', desc.id)

        # Canonicalize width
        desc.width = parse_width(desc.width)

        # Create the fluid and responsive bootstrap layout canvas.
        labels = {}
        for row in desc.layout
            fluid_row = $("<div class='row-fluid'>")
            if row.length == 0 # empty row -- user wants space
                fluid_row.append($("<br>"))
            else
                for x in row
                    arg = x[0]; span = x[1]; label = x[2]
                    if label?
                        labels[arg] = label
                    t = $("<div class='span#{span} salvus-cell-interact-var-#{arg}'></div>")
                    fluid_row.append(t)
            elt.append(fluid_row)

        # Create cell for the output stream from the function to appear in, if it is defined above
        output = elt.find(".salvus-cell-interact-var-")   # empty string is output
        output_cells = []
        for C in output
            div = $("<div>")
            $(C).append(div)
            o = div.salvus_cell
                show    : ['output']
                session : @opts.session
            output_cells.push(o.data('cell'))

        # Define the update function, which communicates with the server.
        current_id = undefined
        done = true
        update = (vals) =>
            if not done
                @opts.session.interrupt()

            for output_cell in output_cells
                if not desc.flicker
                    height = output_cell._output.height()
                    output_cell._output.css('min-height', height)
                output_cell.delete_output()

            done = false

            # start the stopwatch/interrupt button
            @start_stopwatch()

            current_id = @opts.session.execute_code
                code      : 'salvus._execute_interact(salvus.data["id"], salvus.data["vals"])'
                data      : {id:desc.id, vals:vals}
                preparse  : false
                cb        : (mesg) =>
                    if mesg.id == current_id  # could have left over messages (TODO -- really?)
                        for output_cell in output_cells
                            output_cell.append_output_in_mesg(mesg)
                        if mesg.done
                            # stop the stopwatch
                            @stop_stopwatch()
                            done = true

        # Define the controls.
        created_controls = []
        for control_desc in desc.controls
            containing_div = elt.find(".salvus-cell-interact-var-#{control_desc.var}")
            if labels[control_desc.var]?
                control_desc.label = labels[control_desc.var]
            for X in containing_div
                c = @_interact_control(control_desc, update)
                created_controls.push(c)
                $(X).append(c)

        # Refresh any controls that need refreshing
        for c in created_controls
            c.data('refresh')?()

        elt.attr('style', desc.style)
        elt.data('update', update)

        if desc.width?
            elt.width(desc.width)

        update({})

    _interact_control: (desc, update) ->
        # Create and return a detached DOM element elt that represents
        # the interact control described by desc.  It will call update
        # when it changes.  If elt.data('refresh') is defined, it will
        # be called after the control is inserted into the DOM.

        # Generic initialization code
        control = templates.find(".salvus-cell-interact-control-#{desc.control_type}").clone()
        if control.length == 0
            # nothing to do -- the control no longer exists
            # TODO: for efficiency we should probably send a message somewhere saying this no longer exists.
            return
        if desc.label?
            control.find(".salvus-cell-interact-label").html(desc.label).mathjax()

        # Initialization specific to each control type
        set = undefined
        send = (val) ->
            vals = {}
            vals[desc.var] = val
            update(vals)

        desc.width = parse_width(desc.width)

        switch desc.control_type
            when 'input-box'

                last_sent_val = undefined
                do_send = () ->
                    val = input.val()
                    last_sent_val = val
                    send(val)

                if desc.nrows <= 1
                    input = control.find("input").show()
                    input.keypress (evt) ->
                        if evt.which == 13
                            do_send()
                else
                    input = control.find("textarea").show().attr('rows', desc.nrows)
                    desc.submit_button = true
                    input.keypress (evt) ->
                        if evt.shiftKey and evt.which == 13
                            do_send()
                            return false

                set = (val) ->
                    input.val(val)

                input.on 'blur', () ->
                    if input.val() != last_sent_val
                        do_send()

                if desc.submit_button
                    submit = control.find(".salvus-cell-interact-control-input-box-submit-button").show()
                    submit.find("a").click(() -> send(input.val()))

                if desc.readonly
                    input.attr('readonly', 'readonly')
                input.width(desc.width)


            when 'checkbox'
                input = control.find("input")
                set = (val) ->
                    input.attr('checked', val)
                input.click (evt) ->
                    send(input.is(':checked'))
                if desc.readonly
                    input.attr('disabled', 'disabled')

            when 'button'
                button = control.find("a")
                if desc.classes
                    for cls in desc.classes.split(/\s+/g)
                        button.addClass(cls)
                if desc.width
                    button.width(desc.width)
                if desc.icon
                    button.find('i').addClass(desc.icon)
                else
                    button.find('i').hide()
                button.click (evt) -> send(null)
                set = (val) -> button.find("span").html(val).mathjax()

            when 'text'
                text = control.find(".salvus-cell-interact-control-content")
                if desc.classes
                    for cls in desc.classes.split(/\s+/g)
                        text.addClass(cls)

                # This is complicated because we shouldn't run mathjax until
                # the element is visible.
                set = (val) ->
                    if text.data('val')?
                        # it has already appeared, so safe to mathjax immediately
                        text.html(val).mathjax()

                    text.data('val', val)

                control.data 'refresh', () ->
                    text.mathjax(tex:text.data('val'))

            when 'input-grid'
                grid = control.find(".salvus-cell-interact-control-grid")

                entries = []
                for i in [0...desc.nrows]
                    for j in [0...desc.ncols]
                        cell = $('<input type="text">').css("margin","0")
                        if desc.width
                            cell.width(desc.width)
                        cell.keypress (evt) ->
                            if evt.which == 13
                                send_all()
                        grid.append(cell)
                        entries.push(cell)
                    grid.append($('<br>'))

                send_all = () ->
                    send( (cell.val() for cell in entries) )

                control.find("a").click () ->
                    send_all()

                set = (val) ->
                    cells = grid.find("input")
                    i = 0
                    for r in val
                        for c in r
                            $(cells[i]).val(c).data('last',c)
                            i += 1

            when 'color-selector'
                input = control.find("input").colorpicker()
                sample = control.find("i")
                input.change (ev) ->
                    hex = input.val()
                    input.colorpicker('setValue', hex)
                input.on "changeColor", (ev) ->
                    hex = ev.color.toHex()
                    sample.css("background-color", hex)
                    send(hex)
                sample.click (ev) -> input.colorpicker('show')
                set = (val) ->
                    input.val(val)
                    sample.css("background-color", val)
                if desc.hide_box
                    input.width(0)
                else
                    input.width('8ex')

            when 'slider'
                content = control.find(".salvus-cell-interact-control-content")
                slider = content.find(".salvus-cell-interact-control-slider")
                value = control.find(".salvus-cell-interact-control-value")
                if desc.width?
                    slider.width(desc.width)
                slider.slider
                    animate : desc.animate
                    min     : 0
                    max     : desc.vals.length-1
                    step    : 1
                    value   : desc.default
                    change  : (event, ui) ->
                        if desc.display_value
                            value.text(desc.vals[ui.value])
                        if event.altKey?
                            # This is a genuine event by user, not calling "set" below.
                            send(ui.value)

                set = (val) ->
                    slider.slider('value', val)

            when 'range-slider'
                content = control.find(".salvus-cell-interact-control-content")
                slider = content.find(".salvus-cell-interact-control-slider")
                value = control.find(".salvus-cell-interact-control-value")
                if desc.width
                    content.width(desc.width)
                slider.slider
                    animate : desc.animate
                    range   : true
                    min     : 0
                    max     : desc.vals.length-1
                    step    : 1
                    values  : desc.default
                    change  : (event, ui) ->
                        if desc.display_value
                            v = slider.slider("values")
                            value.text("#{desc.vals[v[0]]} - #{desc.vals[v[1]]}")
                        if event.altKey?
                            # This is a genuine event by user, not calling "set" below.
                            send(slider.slider("values"))

                set = (val) ->
                    slider.slider('values', val)

            when 'selector'
                content = control.find(".salvus-cell-interact-control-content")
                if desc.buttons or desc.nrows != null or desc.ncols != null
                    content.addClass('salvus-cell-interact-control-selector-buttonbox')
                    ########################
                    # Buttons.
                    ########################
                    if desc.ncols != null
                        ncols = desc.ncols
                    else if desc.nrows != null
                        ncols = Math.ceil(desc.lbls.length/desc.nrows)
                    else
                        ncols = desc.lbls.length

                    multi_row = (desc.lbls.length > ncols)

                    bar = $('<span>')
                    if multi_row
                        bar.addClass('btn-group')
                    content.append(bar)

                    i = 0
                    for lbl in desc.lbls
                        button = $("<a class='btn'>").data('value',i).text(lbl)
                        if desc.button_classes != null
                            if typeof desc.button_classes == "string"
                                c = desc.button_classes
                            else
                                c = desc.button_classes[i]
                            for cls in c.split(/\s+/g)
                                button.addClass(cls)
                        if desc.width
                            button.width(desc.width)
                        button.click () ->
                            val = $(@).data('value')
                            send(val)
                            set(val)
                        bar.append(button)
                        i += 1
                        if i % ncols == 0 and i < desc.lbls.length
                            # start a new row in the button bar
                            content.append($('<br>'))
                            bar = $('<span class="btn-group">')
                            content.append(bar)

                    control.data 'refresh', () ->
                        if ncols != desc.lbls.length and not desc.width
                            # If no width param is specified and the
                            # button bar will take up multiple lines, make
                            # all buttons the same width as the widest, so
                            # the buttons look nice.
                            w = Math.max.apply @, ($(x).width() for x in content.find("a"))
                            content.find("a").width(w)

                    set = (val) ->
                        content.find("a.active").removeClass("active")
                        $(content.find("a")[val]).addClass("active")
                else
                    # A standard drop down selector box.
                    select = $("<select>")
                    content.append(select)
                    i = 0
                    for lbl in desc.lbls
                        select.append($("<option>").attr("value",i).attr("label", lbl))
                        i += 1

                    select.change (evt) ->
                        send(select.find(":selected").attr("value"))

                    if desc.width
                        select.width(desc.width)

                    set = (val) ->
                        if typeof val == 'number'
                            $(select.children()[val]).attr("selected", true)
                        else
                            val = String(val)
                            for opt in select.find("option")
                                if opt.attr("value") == val
                                    opt.attr("selected", true)
            else
                throw("Unknown interact control type '#{desc.control_type}'")

        set(desc.default)
        control.data("set", set)
        return control

    #######################################################################
    # Public API
    # Unless otherwise stated, these methods can be chained.
    #######################################################################

    kill: () =>
        @destroy_stopwatch()

    restart: () =>
        @destroy_stopwatch()
        @execute_if_auto()

    execute_if_auto: () =>
        if $.trim(@input()).slice(0,5) == '%auto'
            @execute()

    hidden_components: () =>
        if @_hidden_components? # cache
            return @_hidden_components
        # return list of components of the cell that have been hidden
        return @_hidden_components = (c for c in COMPONENTS when @component(c).data('hide'))

    to_obj: () =>
        obj =
            id     : @opts.id
            input  : @input()
            output : @_persistent_output_messages
            hide   : @hidden_components()

        # optimize-- could do during construction...
        if not obj.input or obj.input.length == 0
            delete obj.input
        if not obj.output or obj.output.length == 0
            delete obj.output
        if obj.hide? and obj.hide.length == 0
            delete obj.hide
        return obj

    to_text: () =>
        obj = @to_obj()  # takes advantage of optimization of cell components
        t = ''
        hidden = @hidden_components()
        if obj.input? and 'editor' not in hidden
            t += 'sage: ' + $.trim(obj.input).replace(/\n/g,'\n      ')
        if obj.output? and 'output' not in hidden
            out = '\n'
            for mesg in obj.output
                for stream, val of mesg
                    switch stream
                        when 'stdout', 'stderr'
                            out += val
                        when 'html'
                            out += val
                        when 'tex'
                            if val.display
                                out += "\n$$#{val.tex}$$\n"
                            else
                                out += " $#{val.tex}$ "
                        else
                            out += "[#{stream}]"
            t += out + '\n'
        return t

    to_rest: () =>
        obj = @to_obj()
        t = ''
        hidden = @hidden_components()
        if (obj.input? and 'editor' not in hidden) or (obj.output? and 'output' not in hidden)
            t += '::\n'
        else
            t += '\n'
        if obj.input? and 'editor' not in hidden
            # TODO -- must be much better
            t += '    sage: ' + $.trim(obj.input).replace(/\n/g,'\n    sage: ')
        if obj.output? and 'output' not in hidden
            out = '\n'
            for mesg in obj.output
                for stream, val of mesg
                    switch stream
                        when 'stdout', 'stderr'
                            out += val
                        when 'html'
                            out += val
                        when 'tex'
                            if val.display
                                out += "\n`#{val.tex}`\n"  # TODO -- how to do display math in ReST ?
                            else
                                out += " `#{val.tex}` "
                        else
                            out += "[#{stream}]"
            t += out + '\n'
            # TODO --indent it all
        return t

    to_latex: () =>
        obj = @to_obj()
        hidden = @hidden_components()
        t = '\n\n'

        if obj.input? and 'editor' not in hidden
            input = $.trim(obj.input)
            if input.length > 0
                t += '\n\\begin{verbatim}\n'
                t += 'sage: ' + input.replace(/\n/g,'\nsage: ')
                t += '\n\\end{verbatim}\n'
        if obj.output? and 'output' not in hidden and obj.output.length > 0
            out = ''
            for mesg in obj.output
                for stream, val of mesg
                    switch stream
                        when 'stdout', 'stderr'
                            v = $.trim(val)
                            if v
                                out += "\n\\begin{verbatim}\n#{v}\n\\end{verbatim}\n"
                        when 'html'
                            out += html_to_latex(val)
                        when 'tex'
                            if val.display
                                out += "\n$$#{val.tex}$$\n"
                            else
                                out += " $#{val.tex}$ "
                        else
                            out += "[#{stream}]"  # TODO: embedded images, ...
            t += out + '\n'
        return t

    checkbox: (checked) =>
        if checked?
            @_checkbox.attr('checked', checked)
        else
            return @_checkbox.is(":checked")

    input: (val) =>
        if val?
            @_editor.setValue(val)
        else
            @_editor.getValue()

    append_to_input: (s) =>
        @_editor.replaceRange(s, {line:@_editor.lineCount(), ch:0})

    prepare_stopwatch: () ->
        if @opts.stopwatch
            @element.find(".salvus-cell-stopwatch:first").addClass('salvus-cell-stopwatch-waiting'
            ).show().find("span").text('waiting...')

    start_stopwatch: () ->
        if @opts.stopwatch
            if not @_stopwatch_counter?
                @_stopwatch_counter = 0
            @_stopwatch_counter += 1
            @element.find(".salvus-cell-stopwatch").hide()
            elt = @element.find(".salvus-cell-stopwatch:first").show().click(@_interrupt).find('span')
            elt.removeClass('salvus-cell-stopwatch-waiting').addClass('salvus-cell-stopwatch-running').show()
            elt.countdown('destroy').countdown(
                since   : new Date()
                compact : true
                layout  : '{hnn}{sep}{mnn}{sep}{snn}'
            )
            # CSS spinner effect -- cool but uses way too much CPU
            #elt.find("i").removeClass('fa-clock-o').addClass("fa-spinner fa-spin")

    stop_stopwatch: () ->
        if @opts.stopwatch
            @_stopwatch_counter -= 1
            if @_stopwatch_counter <= 0 and @opts.stopwatch
                elt = @element.find(".salvus-cell-stopwatch:first")
                elt.removeClass('salvus-cell-stopwatch-running').find('span').countdown('pause')
                # CSS spinner effect -- cool but uses way too much CPU
                # elt.find("i").removeClass('fa-spin fa-spinner').addClass("fa-clock-o")

    destroy_stopwatch: () ->
        if @opts.stopwatch
            @_stopwatch_counter = 0
            elt = @element.find(".salvus-cell-stopwatch")
            elt.hide().find('span').countdown('destroy')
            # CSS spinner effect -- cool but uses way too much CPU
            # elt.find("i").removeClass('fa-spin fa-spinner').addClass("fa-clock-o")

    append_to: (e) ->
        e.append(@element)
        return @

    prepend_to: (e) ->
        e.prepend(@element)
        return @

    # Refresh the cell; this might be needed if you hide the DOM element
    # that contains the editor, change it, then display it again.
    refresh: () ->
        @_editor.refresh()
        return @

    focus: ->
        @selected()
        @_editor.focus()
        @_editor.refresh()
        @element[0].scrollIntoView(false)

    # Mark the cell visibly as selected or not selected
    selected: (is_selected=true) ->
        if is_selected
            @_input.addClass("salvus-cell-input-selected")
            f = () =>
                if @_input.hasClass("salvus-cell-input-selected")
                    @_action_btns.show()
            setTimeout(f, 250)
        else
            @_input.removeClass("salvus-cell-input-selected")
            # Hide on next tick, since this could be a button press.
            setTimeout( (() => @_action_btns.hide()), 250 )
        return @

    component: (e) ->
        if not e?
            return @element
        switch e
            when 'editor'
                return @element.find(".salvus-cell-input")
            when 'output'
                return @_output
            when 'checkbox'
                return @element.find(".salvus-cell-checkbox")
            when 'insert-above'
                return @element.find(".salvus-cell-insert-above")
            when 'insert-below'
                return @element.find(".salvus-cell-insert-below")

    # Show an individual component of the cell:
    #
    #      cell.show("editor"), cell.show("output").
    #
    # Also, cell.show() will show the complete cell (not show each
    # component) if it was hidden; this does not impact which
    # components are hidden/shown.
    show: (e) ->
        @_hidden_components = undefined
        c = @component(e).removeClass('hide').data('hide',false)
        if e == 'editor'
            @_editor.refresh()
        return c

    # Hide an individual component of the cell --
    #
    #  cell.hide("editor"), cell.hide("output")
    #
    # Also, cell.hide() will hide the complete cell (not hide each
    # component); this does not impact which individual components are
    # hidden/shown.
    hide: (e) ->
        @_hidden_components = undefined
        c = @component(e)
        if not c?
            throw "unknown cell component -- '#{e}'"
        return c.data('hide',true).addClass('hide')

    toggle_component: (e) =>
        c = @component(e)
        if c.hasClass('hide')
            @show(e)
        else
            @hide(e)

    delete_output: () ->
        # Delete the array of all received output messages
        @_persistent_output_messages = []
        # Delete all display output in that part of the cell.  This
        # won't delete javascript side-effects the user may have
        # caused, of course.
        @_output.html('')

    output: (val) =>
        if val?
            @_output.replaceWith(val)
        else
            return @_output

    append_to_output: (elt) => # elt = jquery wrapped set
        @_output.append(elt)

    append_output_in_mesg: (mesg) ->
        # Save this output message in case the cell is serialized in
        # its current state.  Note that we only record nonempty
        # messages that we want to appear when we reload the cell.
        # In particular, a message with mesg.once true will not be saved.
        m = {}
        for x, y of mesg
            # No point in saving certain data, e.g., event just tags that it is output,
            # done is used to know when computation completes (no comp done here), etc.
            if x not in ['id', 'event', 'done', 'session_uuid', 'interact']
                m[x] = y
        if len(m) > 0 and not mesg.once
            # changed in a way that would benefit from saving
            @emit 'changed', {output:mesg}
            @_persistent_output_messages.push(m)

        # Handle each possible type of stream that could be in the output message:
        for stream in ['stdout', 'stderr', 'html', 'tex', 'file', 'javascript', 'interact']
            value = mesg[stream]
            if value?
                @append_output
                    stream : stream
                    value  : value
                    obj    : mesg.obj

    # Append new output to one output stream of the cell.
    # This is not to be confused with "append_to_output", which
    # simply appends to the DOM.
    append_output : (opts) =>
        opts = defaults opts,
            # the output stream: 'stdout', 'stderr', 'html', 'tex', 'file', 'javascript'
            stream : required
            # value -- options depends on the output stream:
            #     - stdout -- arbitrary text
            #     - stderr -- arbitrary text
            #     - html -- arbitrary valid html
            #     - tex -- {tex:'latex expression', display:true/false}   --  display math or inline math
            #     - file -- {filename:"...", uuid:"...", show:true/false}
            #     - javascript -- {code:"...", coffeescript:true/false}
            #     - interact - object that describes layout
            value  : required
            obj    : undefined

        @emit("change", {output:opts})
        e = templates.find(".salvus-cell-output-#{opts.stream}").clone()
        if e.length != 1
            throw "ERROR -- missing template with class .salvus-cell-output-#{opts.stream}"

        @_output.append(e)
        switch opts.stream
            when 'stdout', 'stderr'
                e.text(opts.value)
            when 'html'
                e.html(opts.value).mathjax()
            when 'tex'
                arg = {tex:opts.value.tex}
                if opts.value.display
                    arg.display = true
                else
                    arg.inline = true
                e.text(opts.value).data('value', opts.value).mathjax(arg)
            when 'file'
                if opts.value.show
                    target = "/blobs/#{opts.value.filename}?uuid=#{opts.value.uuid}"
                    switch filename_extension(opts.value.filename)
                        # TODO: harden DOM creation below
                        when 'svg', 'png', 'gif', 'jpg'
                            e.append($("<img src='#{target}' class='salvus-cell-output-img'>"))
                        else
                            e.append($("<a href='#{target}' target='_new'>#{opts.value.filename} (this temporary link expires in a minute)</a> "))
            when 'javascript'
                cell = @
                obj = JSON.parse(opts.obj)
                try
                    if opts.value.coffeescript
                        eval(CoffeeScript.compile(opts.value.code))
                    else
                        eval(opts.value.code)
                catch exc
                    e.text("Error evaluating Javascript '#{opts.value.code}': #{exc}")
            when 'interact'
                @_initialize_interact(e, opts.value)
            else
                throw "unknown stream '#{opts.stream}'"
        return @

    set_session: (session) ->
        @opts.session = session

    # NOT USED...
    XXX_parse_cell_decorators: (code) ->
        # Each consecutive line that starts with a "%%" defines a
        # cell decorator, which is a "code decorator" for an entire
        # clel.  The first line not starting with %% ends setting the modes.
        data = [[],null]
        i = 0
        while i+1 < code.length and code[i] == "%"  # and code[i+1] == "%"
            i = code.indexOf('\n')
            if i == -1
                i = code.length
            data[0].push(code.slice(1, i))
            code = code.slice(i+1)
            i = 0

        data[1] = code # remaining code
        return {
            code : 'salvus.execute_with_code_decorators(*salvus.data)'
            data : data
        }

    execute: () =>
        @_interrupt () =>
            @show('output')
            @_close_on_action()
            if not @opts.session
                throw "Attempt to execute code on a cell whose session has not been set."
            @emit 'execute'
            code = $.trim(@input())
            data = undefined
            if code == ""
                # easy special case -- empty input
                @delete_output()
                return
            first_message = true
            s = setTimeout( (() => @prepare_stopwatch()), 250)
            @_last_execute_uuid = @opts.session.execute_code
                code     : code
                data     : data
                preparse : true
                cb       : (mesg) =>
                    clearTimeout(s)
                    @_execute_running = true
                    @emit 'execute-running'

                    # I HAVEN'T DECIDED ON THE SEMANTICS FOR THIS:
                    #if mesg.id != @_last_execute_uuid
                        # The user executed code multiple times in the
                        # same cell before the output from the first
                        # execution finished, and we just got a message
                        # with some output.

                    # NOTE: this callback function gets called
                    # *repeatedly* while this cell is being evaluated.
                    # The last message has the property that mesg.done is
                    # true.  Right When the cell *starts* being evaluated
                    # a mesg is always sent.
                    if first_message
                        @delete_output()
                        first_message = false
                        @start_stopwatch()

                    @append_output_in_mesg(mesg)

                    if mesg.done
                        @stop_stopwatch()
                        if mesg.id == @_last_execute_uuid
                            @_execute_running = false
                            @emit 'execute-done'

    # Remove this cell from the DOM
    remove: () =>
        @element.remove()


exports.Cell = Cell

$.fn.extend
    salvus_cell: (opts={}) ->
        return @each () ->
            opts0 = copy(opts)
            opts0.element = this
            $(this).data('cell', new Cell(opts0))


#################################################################################
# Misc functions that are useful for implementing the cell.  These could
# be moved elsewhere.
#################################################################################

# This is an improved rewrite of simple-hint.js from the CodeMirror3 distribution.
show_completions = (opts) ->
    {editor, from, to, completions, target, completions_size} = defaults opts,
        editor           : required
        from             : required
        to               : required
        completions      : required
        target           : required
        completions_size : 20

    if completions.length == 0
        return

    insert = (str) ->
        editor.replaceRange(str, from, to)

    if completions.length == 1
        insert(target + completions[0])
        return

    sel = $("<select>").css('width','auto')
    complete = $("<div>").addClass("salvus-completions").append(sel)
    for c in completions
        sel.append($("<option>").text(target + c))
    sel.find(":first").attr("selected", true)
    sel.attr("size", Math.min(completions_size, completions.length))
    pos = editor.cursorCoords(from)

    complete.css
        left : pos.left   + 'px'
        top  : pos.bottom + 'px'
    $("body").append(complete)
    # If we're at the edge of the screen, then we want the menu to appear on the left of the cursor.
    winW = window.innerWidth or Math.max(document.body.offsetWidth, document.documentElement.offsetWidth)
    if winW - pos.left < sel.attr("clientWidth")
        complete.css(left: (pos.left - sel.attr("clientWidth")) + "px")
    # Hide scrollbar
    if completions.length <= completions_size
        complete.css(width: (sel.attr("clientWidth") - 1) + "px")

    done = false
    close = () ->
        if done
            return
        done = true
        complete.remove()

    pick = () ->
        insert(sel.val())
        close()
        if not IS_MOBILE
            setTimeout((() -> editor.focus()), 50)

    sel.blur(pick)
    sel.dblclick(pick)
    if not IS_MOBILE  # do not do this on mobile, since it makes it unusable!
        sel.click(pick)
    sel.keydown (event) ->
        code = event.keyCode
        switch code
            when 13 # enter
                pick()
                return false
            when 27
                close()
                editor.focus()
                return false
            else
                if code != 38 and code != 40 and code != 33 and code != 34 and not CodeMirror.isModifierKey(event)
                    close()
                    editor.focus()
                    # Pass to CodeMirror (e.g., backspace)
                    editor.triggerOnKeyDown(event)
    sel.focus()


show_introspect = (opts) ->
    opts = defaults opts,
        editor    : required
        from      : required
        content   : required
        type      : required   # 'docstring', 'source-code' -- TODO: curr ignored
        target    : required
    element = templates.find(".salvus-cell-introspect").clone()
    element.find(".salvus-cell-introspect-title").text(opts.target)
    element.find(".salvus-cell-introspect-content").text(opts.content)
    element.find(".salvus-cell-introspect-close").click () -> element.remove()
    pos = opts.editor.cursorCoords(opts.from)
    element.css
        left : pos.left + 'px'
        top  : pos.bottom + 'px'
    $("body").append element
    if not IS_MOBILE
        element.draggable(handle: element.find(".salvus-cell-introspect-title")).resizable(
            alsoResize : element.find(".salvus-cell-introspect-content")
            maxHeight: 650
        )
    element.focus()
    return element

spinner_at = (opts) ->
    opts = defaults opts,
        editor       : required
        pos          : required # {line:, ch:} position
        delay        : undefined
        options      : undefined

    pos = opts.editor.cursorCoords(opts.pos)
    elt = $("<span style='position:absolute'>").css(left:pos.left+'px', top:pos.bottom+'px')
    $("body").append(elt)
    start = () ->
        elt.spin(opts.options)

    if opts.delay?
        elt.data("timer", setTimeout(start, opts.delay))
    else
        start()
    return elt

remove_spinner = (elt) ->
    clearTimeout(elt.data("timer"))
    elt.spin(false).remove()


parse_width = (width) ->
    if width?
        if typeof width == 'number'
            return "#{width}ex"
        else
            return width

html_to_latex = (s) ->
    # TODO: This is horrible/insecure/etc.
    return $("<div>").html(s).text()
