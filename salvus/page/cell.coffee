######################################################
#
# A Compute Cell
#
######################################################

# imports
{EventEmitter} = require('events')

{copy, filename_extension, required, defaults, to_json} = require('misc')

{local_diff} = require('misc_page')



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

           # subarray of ['note','editor','output']; if given, hides
           # the given components when the cell is created
            hide                  : undefined

            # milliseconds interval between sending update change events about note
            note_change_timer     : 250
            # maximum height of note part of cell.
            note_max_height       : "auto"
            # initial value of the note (HTML)
            note_value            : undefined

            # language mode of the input editor
            editor_mode           : "python"
            # whether to display line numbers in the input code editor
            editor_line_numbers   : false
            # number of spaces to indent in the code editor
            editor_indent_spaces  : 4
            # whether or not to wrap lines in the code editor
            editor_line_wrapping  : true
            # undo depth for code editor
            editor_undo_depth     : 40
            # whether to do bracket matching in the code editor
            editor_match_brackets : true
            # css maximum height of code editor (scroll bars appear beyond this)
            editor_max_height     : "20em"
            # initial value of the code editor (TEXT)
            editor_value          : undefined

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

            # maximum height of output (scroll bars appear beyond this)
            output_max_height     : "20em"
            # whether or not to wrap lines in the output; if not wrapped, scrollbars appear
            output_line_wrapping  : false
            # initial value of the output area (JSON)
            output_value          : undefined
            # show output stopwatch during code evaluation.
            stopwatch             : true

            # a session -- needed to execute code in a cell
            session               : undefined

        if not @opts.element?
            @opts.element = $("<div>")

        e = $(@opts.element)

        if not @opts.editor_value?
            @opts.editor_value = e.text()

        @opts.note_value = e.data('note_value') if not @opts.note_value?
        @opts.output_value = e.data('output_value') if not @opts.output_value?

        @_note_change_timer_is_set = false

        @element = cell_template.clone()

        @_initialize_checkbox()
        @_initialize_insert_above()
        @_initialize_note()
        @_initialize_input()
        @_initialize_output()

        @element.data("cell", @)
        $(@opts.element).replaceWith(@element)

        @_editor.setValue(@opts.editor_value)
        @refresh()

        if @opts.hide?
            for e in @opts.hide
                @hide(e)


    #######################################################################
    # Private Methods
    #######################################################################
    #

    _initialize_checkbox: () ->
        @_checkbox = @element.find(".salvus-cell-checkbox").find("input")
        @_checkbox.click (event) =>
            @emit "checkbox-change", event.shiftKey
            return true

    _initialize_insert_above: () ->
        @element.find(".salvus-cell-insert-above").tooltip(delay:500, title:"Click to insert a cell.").click () =>
            @emit "insert-new-cell-before"

    _initialize_note: () ->
        # make note fire change event when changed
        @_note = @element.find(".salvus-cell-note")
        @_note.tooltip(delay:1000, title:"Write a note about this cell.")
        if @opts.note_value != ""
            @_note.html(@opts.note_value)
        @_note.css('max-height', @opts.note_max_height)
        that = @
        @_note.live('focus', ->
            $this = $(this)
            $this.data('before', $this.html())
        ).live('paste blur keyup', () ->
            if not that._note_change_timer_is_set
                that._note_change_timer_is_set = true
                setTimeout( (() ->
                    that._note_change_timer_is_set = false
                    before = that._note.data('before')
                    now    = that._note.html()
                    if before isnt now
                        that.emit('change', {'note':local_diff(before, now)})
                        that._note.data('before', now)
                    ),
                    that.opts.note_change_timer
                )
        )

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
                    throw CodeMirror.Pass
            "Down" : (editor) =>
                if editor.getCursor().line >= editor.lineCount() - 1
                    @emit "next-cell"
                else
                    throw CodeMirror.Pass
            "Backspace" : (editor) =>
                if editor.getValue() == ""
                    @emit "delete-cell"
                else
                    throw CodeMirror.Pass

        extraKeys[@opts.keys.execute] = (editor) =>
            @execute()
            @emit "next-cell", true

        extraKeys[@opts.keys.move_cell_up] = (editor) =>
            @emit "move-cell-up"

        extraKeys[@opts.keys.move_cell_down] = (editor) =>
            @emit "move-cell-down"

        extraKeys[@opts.keys.interrupt] = (editor) =>
            @opts.session.interrupt()

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

        $(@_editor.getWrapperElement()).addClass('salvus-cell-editor').tooltip(delay:1000, title:"Enter code to evaluate.")
        $(@_editor.getScrollerElement()).css('max-height' : @opts.editor_max_height)

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
        @_output.html(@opts.output_value)
        @_output.css('max-height', @opts.output_max_height)
        if @opts.output_line_wrapping
            @_output_line_wrapping_on()

    _output_line_wrapping_on: ->
        @_output.css
            'white-space'  : 'pre-wrap'
            'word-wrap'    : 'break-word'
            'overflow-wrap': 'break-word'

    _output_line_wrapping_off: ->
        @_output.removeClass('white-space word-wrap overflow-wrap')

    _interrupt: =>
        if @element.find('.salvus-cell-stopwatch').hasClass('salvus-cell-stopwatch-running')
            @opts.session.interrupt(); return false

    #######################################################################
    # Public API
    # Unless otherwise stated, these methods can be chained.
    #######################################################################

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
            @element.find(".salvus-cell-stopwatch").addClass('salvus-cell-stopwatch-waiting'
            ).text('waiting...').show()

    start_stopwatch: () ->
        if @opts.stopwatch
            @element.find(".salvus-cell-stopwatch").removeClass('salvus-cell-stopwatch-waiting').addClass('salvus-cell-stopwatch-running'
            ).show().countdown('destroy').countdown(
                since   : new Date()
                compact : true
                layout  : '{hnn}{sep}{mnn}{sep}{snn}'
            ).click(@_interrupt).tooltip('destroy').tooltip(title:"Time running; click to interrupt.")

    stop_stopwatch: () ->
        if @opts.stopwatch
            @element.find(".salvus-cell-stopwatch").countdown('pause').removeClass('salvus-cell-stopwatch-running').tooltip('destroy').tooltip(delay:1000, title:"Time this took to run.")

    destroy_stopwatch: () ->
        if @opts.stopwatch
            @element.find(".salvus-cell-stopwatch").countdown('destroy').hide()

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

    # Mark the cell as selected or not selected
    selected: (is_selected=true) ->
        if is_selected
            @_input.addClass("salvus-cell-input-selected")
        else
            @_input.removeClass("salvus-cell-input-selected")
        return @

    # Show an individual component of the cell:
    #
    #       cell.show("note"), cell.show("editor"), cell.show("output").
    #
    # Also, cell.show() will show the complete cell (not show each
    # component) if it was hidden; this does not impact which
    # components are hidden/shown.
    show: (e) ->
        if not e?
            @element.show()
            return
        switch e
            when 'note'
                @_note.show()
            when 'editor'
                $(@_editor.getWrapperElement()).show()
                @_editor.refresh()
            when 'output'
                @_output.show()
            else
                throw "unknown component #{e}"
        return @

    # Hide an individual component of the cell --
    #
    #  cell.hide("note"), cell.hide("editor"), cell.hide("output")
    #
    # Also, cell.hide() will hide the complete cell (not hide each
    # component); this does not impact which individual components are
    # hidden/shown.
    hide: (e) ->
        if not e?
            @element.hide()
            return
        switch e
            when 'note'
                @_note.hide()
            when 'editor'
                $(@_editor.getWrapperElement()).hide()
            when 'output'
                @_output.hide()
            else
                throw "unknown component #{e}"
        return @

    delete_output: () ->
        @_output.html('')

    output: (val) =>
        if val?
            @_output.replaceWith(val)
        else
            return @_output

    append_to_output: (elt) => # elt = jquery wrapped set
        @_output.append(elt)

    # Append new output to one output stream of the cell.
    # This is not to be confused with "append_to_output", which
    # simply appends to the DOM.
    append_output : (opts) ->
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
            value  : required

        @emit("change", {output:opts})
        e = templates.find(".salvus-cell-output-#{opts.stream}").clone()
        if e.length != 1
            throw "ERROR -- missing template with class .salvus-cell-output-#{opts.stream}"
        @_output.append(e)
        switch opts.stream
            when 'stdout', 'stderr'
                e.text(opts.value)
            when 'html'
                e.html(opts.value)
            when 'tex'
                e.text(opts.value).data('value', opts.value).mathjax(
                                        tex: opts.value.tex, display:opts.value.display)
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
                if opts.value.coffeescript
                    eval(CoffeeScript.compile(opts.value.code))
                else
                    eval(opts.value.code)
            else
                throw "unknown stream '#{opts.stream}'"
        return @

    set_session: (session) ->
        @opts.session = session

    execute: () ->
        if not @opts.session
            throw "Attempt to execute code on a cell whose session has not been set."
        @emit 'execute'
        code = $.trim(@_editor.getValue())
        if code == ""
            # easy special case -- empty input
            @delete_output()
            return
        first_message = true
        s = setTimeout( (() => @prepare_stopwatch()), 250)
        @_last_execute_uuid = @opts.session.execute_code
            code     : code
            preparse : true
            cb       : (mesg) =>
                clearTimeout(s)
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

                @append_output(stream:'stdout',     value:mesg.stdout)     if mesg.stdout?
                @append_output(stream:'stderr',     value:mesg.stderr)     if mesg.stderr?
                @append_output(stream:'html',       value:mesg.html)       if mesg.html?
                @append_output(stream:'tex',        value:mesg.tex)        if mesg.tex?
                @append_output(stream:'file',       value:mesg.file)       if mesg.file?
                @append_output(stream:'javascript', value:mesg.javascript) if mesg.javascript?

                if mesg.done
                    @stop_stopwatch()
                    if mesg.id == @_last_execute_uuid
                        @emit 'execute-done'

    # Remove this cell from the DOM
    remove: () =>
        @element.remove()

    # Set or get the HTML value of the note field
    note: (val) =>
        if val?
            @_note.html(val)
        else
            return @_note.html()

exports.Cell = Cell

$.fn.extend
    salvus_cell: (opts={}) ->
        return @each () ->
            opts0 = copy(opts)
            opts0.element = this
            $(this).data('cell', new Cell(opts0))

