
$(() ->
    async = require('async')
    misc = require('misc')
    client = require('client')
    uuid = misc.uuid
    required = misc.required
    defaults = misc.defaults

    html_to_text = require("client").html_to_text

    active_cell = undefined
    last_active_cell = undefined

    page = $("#worksheet1")
    worksheet1 = $("#worksheet1")
    templates = worksheet1.find(".salvus-templates")
    views =
        worksheet : undefined
        edit      : templates.find(".salvus-worksheet-edit").clone().hide().appendTo(page)
        text      : templates.find(".salvus-worksheet-text").clone().hide().appendTo(page)

    views.edit.data('editor',
        CodeMirror.fromTextArea(views.edit.find("textarea")[0],
            lineNumbers  : true
            indentUnit   : 4
            tabSize      : 4
            lineWrapping : false
            matchBrackets: true
            undoDepth    : 200
            mode         : "javascript"
        )
    )

    views.edit.data('editor').on('change', () -> views.edit.find('.btn').removeClass("disabled"))

    # TODO: this does not work.
    views.edit.data('editor').on('gutterClick', CodeMirror.newFoldFunction(CodeMirror.braceRangeFinder))

    get_completions = (editor, cb) ->
        completions = []
        to = editor.getCursor()
        from   = {line:to.line, ch:0}
        session = null
        async.series([
            (cb) ->
                get_session (error, s) ->
                    if error
                        alert_message(type:"error", message:"Unable to start a Sage session in which to introspect.")
                        cb(true)
                    else
                        session = s
                        cb()
            (cb) ->
                input = editor.getRange(from, to)
                session.introspect
                    text_before_cursor : input
                    text_after_cursor  : undefined  # TODO
                    cb : (error, mesg) ->
                        if error
                            alert_message(type:"error", message:mesg.error)
                        else
                            completions = mesg.completions
                        cb()
        ], () -> cb(completions:completions, from:from, to:to))

    COMPLETIONS_SIZE = 13
    CodeMirror.commands.autocomplete = (editor) ->
        get_completions(editor, (result) ->        # code below based on simple-hint.js from the CodeMirror3 distribution
            {from, to, completions} = result
            if completions.length == 0
                return
            sel = $("<select>")
            complete = $("<div>").addClass("salvus-completions").append(sel)
            for c in completions
                sel.append($("<option>").text(c))
            sel.find(":first").attr("selected", true)
            sel.attr("size", Math.min(COMPLETIONS_SIZE, completions.length))
            pos = editor.cursorCoords(from)

            insert = (str) ->
                editor.replaceRange(str, from, to)
            if completions.length == 1
                insert(completions[0])
                return

            complete.css
                left : pos.left   + 'px'
                top  : pos.bottom + 'px'
            $("body").append(complete)
            # If we're at the edge of the screen, then we want the menu to appear on the left of the cursor.
            winW = window.innerWidth or Math.max(document.body.offsetWidth, document.documentElement.offsetWidth)
            if winW - pos.left < sel.attr("clientWidth")
                complete.css(left: (pos.left - sel.attr("clientWidth")) + "px")
            # Hide scrollbar
            if completions.length <= COMPLETIONS_SIZE
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

        )

    activate_worksheet = (worksheet) ->
        # make the title and description notify when the worksheet is dirty.
        worksheet.find("[contenteditable]").endow_contenteditable_with_change_event(
        ).on("change", () -> worksheet_is_dirty())

    activate_salvus_cell = (cell) ->
        # initialize the insert-cell bar
        cell.find(".salvus-cell-insert-before").click((e) -> insert_cell_before(cell))
        cell.find(".salvus-cell-insert-after").click((e) -> insert_cell_after(cell))

        # initialize the code editor
        input = cell.find(".salvus-cell-input")
        editor = CodeMirror.fromTextArea input[0],
            mode           : "python"
            lineNumbers    : false
            firstLineNumber: 1
            indentUnit     : 4
            tabSize        : 4
            lineWrapping   : true
            undoDepth      : 40
            autofocus      : false
            extraKeys      : extraKeys
            matchBrackets  : true

        cell.data('editor', editor)
        editor.cell = cell
        $(editor.getWrapperElement()).addClass('salvus-input-cell-blur')

        editor.on "focus", (e) ->
            last_active_cell = active_cell = cell
            $(e.getWrapperElement()).addClass('salvus-input-cell-focus').removeClass('salvus-input-cell-blur')
        editor.on "blur", (e) ->
            $(e.getWrapperElement()).addClass('salvus-input-cell-blur').removeClass('salvus-input-cell-focus')
        editor.on "change", (e, changeObj) ->
            worksheet_is_dirty()

        # setup the note part of the cell:
        cell.find(".salvus-cell-note").endow_contenteditable_with_change_event(
        ).on("change", (note) -> worksheet_is_dirty())

        ##how one could dynamically set something in css...
        ##$(editor.getScrollerElement()).css('max-height', Math.floor($(window).height()/2))



    salvus_cell = (opts={}) ->
        opts = defaults opts,
            id : undefined
        cell = templates.find(".salvus-cell").clone().attr('id', if opts.id? then opts.id else uuid())

        activate_salvus_cell(cell)
        return cell

    $.fn.extend
        endow_contenteditable_with_change_event: (opts) ->
            @each () ->
                $(this).live('focus', ->
                    $this = $(this)
                    $this.data('before', $this.html())
                    return $this
                ).live('blur keyup paste', ->
                    $this = $(this)
                    if $this.data('before') isnt $this.html()
                        $this.data('before', $this.html())
                        $this.trigger('change')
                    return $this)

        salvus_worksheet: (opts) ->
            # salvus_worksheet: appends a Salvus worksheet to each element of the jQuery
            # wrapped set; results in the last worksheet created as a
            # jQuery wrapped object.
            worksheet = undefined
            @each () ->
                worksheet = templates.find(".salvus-worksheet").clone()
                $(this).append(worksheet)
                activate_worksheet(worksheet)
                worksheet.append_salvus_cell()
            return worksheet

        salvus_cell: (opts={}) ->
            # Convert each element of the wrapped set into a salvus cell.
            # If the optional id is given, then the first cell created
            # will have that id attribute (the rest will be random).
            opts = defaults opts,
                id: undefined
            @each () ->
                t = $(this)
                if t.hasClass("salvus-cell")
                    # this is already a Salvus Cell, so we activate its javascript
                    activate_salvus_cell(t)
                else
                    # create new cell and replace this with it.
                    $(this).replaceWith(salvus_cell(id:opts.id))
                opts.id = undefined if opts.id?

        append_salvus_cell: (opts={}) ->
            opts = defaults opts,
                id : undefined
            cell = undefined
            @each () ->
                cell = salvus_cell(opts).appendTo($(this))
                refresh_editor(cell)
            return cell

        select_all: (opts={}) ->
            @each () ->
                if window.getSelection
                    range = document.createRange()
                    range.selectNode(this)
                    window.getSelection().addRange(range)
                else if document.selection
                    range = document.body.createTextRange()
                    range.moveToElementText(this)
                    range.select()



    ####################################################
    # keyboard control -- rewrite to use some library
    ####################################################
    keydown_handler = (e) ->
        switch e.which
            when 27 # escape = 27
                interrupt_session()

    top_navbar.on "switch_to_page-scratch", () ->
        $(document).keydown(keydown_handler)

    top_navbar.on "switch_from_page-scratch", () ->
        $(document).unbind("keydown", keydown_handler)

    ########################################
    # Serialization to JSON-safe object
    ########################################
    # {
    # title:
    # description:
    # cells: [ {id:<uuid text>, type:"code", note:<html>, input:<text>, output:[{class:..., html:...}, ...,]} ]
    # }
    #

    cell_to_plain_text = (cell, prompt='sage: ') ->   # NOTE -- the prompt can't have dollar signs in it!
        r = ''
        note = client.html_to_text(cell.find(".salvus-cell-note").html()).trim()
        if note != ""
            if note.length >= 2
                if note[note.length-1] != ':'
                    note += '::'
                else if note[note.length-2] != ':'
                    note += ':'
            r += '\n' + note + '\n\n'
        code = cell.data('editor').getValue().trim()
        if code != ''
            # The first regexp replaces a newline followed by a whitespace character by a newline followed by indented dots.
            # The second regexp replaces a newline that is followed by non-whitespace by an indented prompt.
            p = '\n    ' + prompt
            r += '    sage: ' + code.replace(/\n\s/g,'\n    ...    ').replace(/\n(\S)(.*)/g, p+'$1$2')
        for o in cell.find(".salvus-cell-output").children()
            s = $(o)
            cls = s.attr('class').slice(7)
            switch cls
                when 'javascript', 'coffeescript'
                    value = "#{cls}: #{s.data('value').trim()}"
                else
                    value = s.text().trim()
            r += '\n' + '    ' + value.replace(/\n/g, '\n    ')
        return r

    cell_to_obj = (cell) ->
        cell   = $(cell)
        output = []
        for o in cell.find(".salvus-cell-output").children()
            s = $(o)
            cls = s.attr('class').slice(7)
            switch cls
                when 'javascript', 'coffeescript'
                    value = s.data('value')
                else
                    value = s.html()
            output.push(class:cls, value:value)
        return {
            id     : cell.attr("id")
            note   : cell.find(".salvus-cell-note").html()
            input  : cell.data("editor").getValue()
            output : output
            type   : "code"
        }

    obj_to_cell = (obj, cell) ->
        cell = $(cell)
        cell.attr("id", obj.id)
        cell.find(".salvus-cell-note").html(obj.note)
        cell.data("editor").setValue(obj.input)

        for s in obj.output
            append_cell_output
                cell  : cell
                class : s.class
                value : s.value

    worksheet_to_obj = () ->
        # jquery officially iterates through objects in DOM order, as of 1.3.2.
        obj = {
            title       : views.worksheet.find(".salvus-worksheet-title").html()
            description : views.worksheet.find(".salvus-worksheet-description").html()
            cells       : []
        }
        $.each(views.worksheet.find(".salvus-cell"), (key, cell) -> obj.cells.push(cell_to_obj(cell)))
        return obj

    set_worksheet_from_obj = (obj) ->
        views.worksheet.find(".salvus-worksheet-title").html(obj.title)
        views.worksheet.find(".salvus-worksheet-description").html(obj.description)
        views.worksheet.find(".salvus-cell").remove()
        for cell_obj in obj.cells
            obj_to_cell(cell_obj, views.worksheet.append_salvus_cell()[0])

    worksheet_to_plain_text = () ->
        r = '-------------------------------------------------------------------------\n'
        r += 'Title: ' + views.worksheet.find(".salvus-worksheet-title").text() + '\n'
        r += 'Description: ' + views.worksheet.find(".salvus-worksheet-description").text()
        r += '\n-------------------------------------------------------------------------\n'
        $.each(views.worksheet.find(".salvus-cell"), (key, cell) ->
            r += '\n' + cell_to_plain_text($(cell))
        )
        return r

    ########################################
    # The tab key
    ########################################

    autoindent_button = () ->
        if active_cell?
            CodeMirror.commands.indentAuto(active_cell.data('editor'))
            focus_editor(active_cell)

    tab_button = () ->
        if active_cell?
            tab_cell(active_cell)
            focus_editor(active_cell)

    # Simulates pressing the tab key in a cell.  Causes either
    # indentation, de-dentation, or introspection, depending on the
    # status of the cell.
    tab_cell = (cell) ->
        editor = cell.data('editor')
        # 1. If anything is selected, send a normal tab key
        if editor.somethingSelected()
            CodeMirror.commands.defaultTab(editor)
            return
        # 2. If there is not a non-whitespace character right before the cursor (on the same line), send a normal tab key.
        pos = editor.getCursor()
        if pos.ch == 0 or editor.getRange({line:pos.line, ch:pos.ch-1}, pos).search(/\s/) != -1
            CodeMirror.commands.defaultTab(editor)
            return
        # 3. Otherwise, introspect.
        introspect_cell(cell)

    introspect_cell = (cell) ->
        CodeMirror.commands.autocomplete(cell.data('editor'))

    ########################################
    # Splitting/joining/deleting
    ########################################
    join_cells = (cell) ->
        prev_cell = cell.prev()
        # 1. If no cell above this one, do nothing then return.
        if prev_cell.length == 0
            focus_editor(cell)
            return
        worksheet_is_dirty()
        # 2. Copy note contents to end of note of cell above.
        append_to_note(prev_cell, "<br>" + cell.find('.salvus-cell-note').html())
        # 3. Copy input contents to end of input contents of cell above.
        editor = cell.data('editor')
        prev_editor = prev_cell.data('editor')
        prev_editor.replaceRange("\n" + editor.getValue(), {line:prev_editor.lineCount(),ch:0})

        # 4. Delete this cell
        delete_cell(cell:cell, keep_note:false)
        # 5. Delete all output (now invalid)
        delete_cell_output(prev_cell)
        # 6. Focus cell above.
        focus_editor(prev_cell)

    split_cell = (cell) ->
        worksheet_is_dirty()
        # 1. create new cell after this one
        new_cell = insert_cell_after(cell)
        # 2. move all text after cursor in this cell to beginning of new cell
        editor = cell.data('editor')
        from = editor.getCursor()
        to   = {line:editor.lineCount(), ch:0}
        code = editor.getRange(from, to)
        editor.replaceRange('', from, to)
        new_editor = new_cell.data('editor')
        new_editor.replaceRange(code, {line:new_editor.lineCount(),ch:0})
        # 3. delete output
        delete_cell_output(cell)
        focus_editor(new_cell)

    move_cell_up = (cell) ->
        prev = previous_cell(cell)
        if prev?
            worksheet_is_dirty()
            cell.insertBefore(prev)
            focus_editor(cell)

    move_cell_down = (cell) ->
        next = next_cell(cell)
        if next?
            worksheet_is_dirty()
            cell.insertAfter(next)
            focus_editor(cell)

    delete_cell_output = (cell) ->
        cell.find(".salvus-cell-output").children().remove()

    delete_cell_contents = (opts) ->
        opts = defaults opts,
            cell      : required
            keep_note : false
        delete_cell_output(opts.cell)
        opts.cell.data('editor').setValue('')
        if not opts.keep_note
            opts.cell.find('.salvus-cell-note').html('')

    delete_cell = (opts) ->
        opts = defaults opts,
            cell      : required
            keep_note : false
        worksheet_is_dirty()
        if number_of_cells() == 1    # it's the only cell on the worksheet, don't delete -- just empty
            delete_cell_contents(cell:opts.cell, keep_note:opts.keep_note)
            return
        cell = opts.cell
        note = cell.find(".salvus-cell-note").html()
        cell_above = cell.prev()
        cell_below = cell.next()
        if note != "" and opts.keep_note
            # TODO: use append_to_note above.
            note_below = cell_below.find(".salvus-cell-note")
            note_below.html(note + '<br>' + note_below.html())
        cell.remove()
        if cell_above.length > 0 and cell_above.hasClass("salvus-cell")
            focus_editor(cell_above)
        else if cell_below.length > 0 and cell_below.hasClass("salvus-cell")
            focus_editor(cell_below)
        else
            new_cell = views.worksheet.append_salvus_cell()
            new_cell.find(".salvus-cell-note").html(note)
            focus_editor(new_cell)

    ########################################
    # Moving around / focus
    ########################################

    next_cell = (cell) ->
        next = cell.next()
        if next.hasClass("salvus-cell")
            return next
        else
            return undefined

    previous_cell = (cell) ->
        prev = cell.prev()
        if prev.hasClass("salvus-cell")
            return prev
        else
            return undefined

    containing_cell = (elt) ->
        p = elt.parentsUntil(".salvus-cell")
        if p.length == 0
            return elt.parent()
        else
            return p.parent()

    refresh_editor = (cell) ->
        cell.data('editor').refresh()

    focus_editor = (cell) ->
        cell.data('editor').focus()
        active_cell = last_active_cell = cell

    focus_editor_on_first_cell = () ->
        views.worksheet.find(".salvus-cell:first")
        focus_editor(views.worksheet.find(".salvus-cell:first"))

    focus_next_cell = (cell) ->
        next = next_cell(cell)
        if next?
            focus_editor(next)

    focus_previous_cell = (cell) ->
        prev = previous_cell(cell)
        if prev?
            focus_editor(prev)

    insert_cell_before = (cell) ->
        worksheet_is_dirty()
        new_cell = salvus_cell()
        cell.before(new_cell)
        refresh_editor(new_cell)
        focus_editor(new_cell)
        return new_cell

    insert_cell_after = (cell) ->
        worksheet_is_dirty()
        new_cell = salvus_cell()
        cell.after(new_cell)
        refresh_editor(new_cell)
        focus_editor(new_cell)
        return new_cell

    append_to_note = (cell, html) ->
        note = cell.find(".salvus-cell-note")
        note.html(note.html() + html)

    append_cell_output_from_mesg = (cell, mesg) ->
        if mesg.stdout?
            append_cell_output
                cell  : cell
                class : 'stdout'
                value  : mesg.stdout
        if mesg.stderr?
            append_cell_output
                cell  : cell
                class : 'stderr'
                value  : mesg.stderr
        if mesg.html?
            append_cell_output
                cell  : cell
                class : 'html'
                value  : mesg.html
        if mesg.javascript?
            append_cell_output
                cell  : cell
                class : 'javascript'
                value : mesg.javascript
        if mesg.coffeescript?
            append_cell_output
                cell  : cell
                class : 'coffeescript'
                value : mesg.coffeescript

    append_cell_output = (opts) ->
        opts = defaults opts,
            cell  : required
            class : required
            value  : required

        # ignore all empty output.
        if opts.value == ""
            return

        cell = opts.cell
        output = opts.cell.find(".salvus-cell-output").show()
        css_class_selector = ".salvus-#{opts.class}"
        switch opts.class
            when 'javascript', 'coffeescript'
                output.append(templates.find(css_class_selector).clone().data('value', opts.value))
                # do it (!)
                #console.log("eval'ing: #{opts.value}")
                if opts.class == 'javascript'
                    eval(opts.value)
                else
                    eval(CoffeeScript.compile(opts.value))
            else
                last_output = output.find(":last-child")
                if last_output.length > 0 and last_output.hasClass()
                    last_output.html(last_output.html() + opts.value)
                else
                    output.append(templates.find(css_class_selector).clone().html(opts.value))

    ########################################
    # Countdown timer until session expires
    ########################################
    
    start_session_timer = (seconds) ->
        console.log(seconds)
        t = new Date()
        t.setTime(t.getTime() + seconds*1000)
        views.worksheet.find('.salvus-worksheet-countdown-timer').show().draggable().countdown('destroy').countdown
            until      : t
            compact    : true
            layout     : '{hnn}{sep}{mnn}{sep}{snn}'
            expiryText : "session killed (after #{seconds} seconds)"
            onExpiry   : mark_session_as_dead

    ########################################
    # Editing / Executing code
    ########################################

    execute_all = () ->
        for cell in views.worksheet.find(".salvus-cell")
            execute_cell($(cell))

    start_cell_spinner = (cell) ->
        cell.find(".salvus-running").show().spin(
            lines   : 15
            length  : 7
            width   : 2
            radius  : 4
            corners : 1.0
            rotate  : 0
            trail   : 60
            speed   : 1.1
            shadow  : false
            hwaccel : false # crashes VirtualBox...
            top     : -5
            left    : 2
        ).click((e) -> interrupt_session())

    stop_cell_spinner = (cell) ->
        cell.find(".salvus-running").spin(false).hide()


    execute_cell = (cell) ->
        worksheet_is_dirty()
        input_text = cell.data('editor').getValue()
        input = cell.find(".salvus-cell-input")
        output = cell.find(".salvus-cell-output").show()
        delete_cell_output(cell)

        if input_text.trim() != ""
            # activity() -- looks bad and crashes chrome on linux hard.
            # # .activity(width:1.5, segments:14)
            timer = setTimeout((() -> start_cell_spinner(cell)), 400)

            salvus_exec
                input: input_text
                cb: (mesg) ->
                    append_cell_output_from_mesg(cell, mesg)
                    if mesg.done
                        clearTimeout(timer)
                        stop_cell_spinner(cell)

        next = cell.next()
        if next.length == 0
            next = views.worksheet.append_salvus_cell()
        focus_editor(next)
        last_active_cell = active_cell = next

    ##############################################################################################

    persistent_session = null

    mark_session_as_dead = () -> persistent_session = null

    get_session = (cb) ->
        if persistent_session == null
            salvus_client.new_session
                timeout: 5
                cb: (error, session) ->
                    if error
                        cb(true, error)
                    else
                        persistent_session = session
                        cb(false, persistent_session)
                        start_session_timer(session.limits.walltime)
                        session.on("close", () ->
                            mark_session_as_dead()
                        )
        else
            cb(false, persistent_session)

    interrupt_session = () ->
        if persistent_session
            persistent_session.interrupt()

    restart_session = () ->
        if persistent_session
            persistent_session.kill()
            alert_message(type:"success", message:"Restarted your Sage session.  (WARNING: Your variables are no longer defined.)")
            persistent_session = null
            views.worksheet.find(".salvus-running").hide()

    number_of_cells = () ->
        return views.worksheet.find(".salvus-cell").length

    delete_all_output = () ->
        for cell in views.worksheet.find(".salvus-cell")
            delete_cell_output($(cell))

    hide_all_output = () ->
        views.worksheet.find(".salvus-cell-output").hide()

    show_all_output = () ->
        views.worksheet.find(".salvus-cell-output").show()

    clear_worksheet= () ->
        # TODO: confirmation, or better -- make it easy to undo last clear.... ?
        views.worksheet?.remove()
        worksheet_is_dirty()
        views.worksheet = page.salvus_worksheet()
        if not IS_MOBILE
            focus_editor_on_first_cell()

    save_worksheet = (notify=false) ->
        salvus_client.save_scratch_worksheet
            data : misc.to_json(worksheet_to_obj())
            cb   : (error, msg) ->
                if notify
                    if error
                        alert_message(type:"error", message:msg)
                    else
                        alert_message(type:"info", message:msg)
                if not error
                    worksheet_is_clean()


    _worksheet_is_dirty = true

    worksheet_is_clean = () ->
        _worksheet_is_dirty = false
        worksheet1.find("a[href='#worksheet1-save_worksheet']").addClass("disabled")

    worksheet_is_dirty = () ->
        _worksheet_is_dirty = true
        worksheet1.find("a[href='#worksheet1-save_worksheet']").removeClass('disabled')


    window.onbeforeunload = (e=window.event) ->
        if _worksheet_is_dirty
            return "Your scratch worksheet is not saved."

    salvus_exec = (opts) ->
        opts = defaults opts,
            input: required
            cb: required

        get_session (error, s) ->
            if error
                alert_message(type:"error", message:"Unable to start a new Sage session.")
                views.worksheet.find(".salvus-running").hide()
            else
                s.execute_code
                    code        : opts.input
                    cb          : opts.cb
                    preparse    : true

    ###############################################################
    # Keyboard shortcuts -- defined at the bottom, because some of
    # these depend on functions above being defined.
    ###############################################################

    extraKeys =
        "Ctrl-Backspace" : (editor) -> join_cells(editor.cell)
        "Ctrl-;"         : (editor) -> split_cell(editor.cell)
        "Ctrl-Up"        : (editor) -> move_cell_up(editor.cell)
        "Ctrl-Down"      : (editor) -> move_cell_down(editor.cell)
        "Shift-Enter"    : (editor) -> execute_cell(editor.cell)
        "Up"             : (editor) ->
            if editor.getCursor().line == 0
                focus_previous_cell(editor.cell)
            else
                throw CodeMirror.Pass
        "Down"           : (editor) ->
            if editor.getCursor().line >= editor.lineCount() - 1
                focus_next_cell(editor.cell)
            else
                throw CodeMirror.Pass

        "Esc"            : (editor) ->
            interrupt_session()

        "Tab"            : (editor) ->
            tab_cell(editor.cell)

        "Backspace"      : (editor) ->
            if editor.getValue() == ""
                delete_cell(cell:editor.cell, keep_note:true)
            else
                throw CodeMirror.Pass

    ##############################################################################################
    # 3 worksheet views: live, edit, text
    ##############################################################################################

    current_view = 'worksheet'
    show_view = (name) ->
        current_view = name
        for n in ['worksheet', 'edit', 'text']
            button = worksheet1.find("a[href='#worksheet1-#{n}-view']")
            if n == name
                button.addClass('btn-primary').removeClass('btn-info').removeClass('disabled')
                views[n]?.show()
            else
                button.addClass('btn-info').removeClass('btn-primary').removeClass('disabled')
                views[n]?.hide()

    worksheet_view = () ->
        $(".salvus-worksheet-buttons").find(".btn").removeClass('disabled')
        show_view('worksheet')
        if views.worksheet?
            for cell in views.worksheet.find('.salvus-cell')
                $(cell).data('editor').refresh()

    edit_view = () ->
        $(".salvus-worksheet-buttons").find(".btn").addClass('disabled')
        show_view('edit')
        editor = views.edit.data('editor')
        editor.refresh()
        editor.setValue(JSON.stringify(worksheet_to_obj(), null, 4))
        views.edit.find('.btn').addClass("disabled")

    edit_view_save_changes = () ->
        value = views.edit.data('editor').getValue()
        try
            obj = JSON.parse(value)
            set_worksheet_from_obj(obj)
            return true
        catch e
            alert("Invalid JSON")
            return false

    text_view = () ->
        $(".salvus-worksheet-buttons").find(".btn").addClass('disabled')
        show_view('text')
        output = views.text.find(".salvus-worksheet-text-text")
        output.text(worksheet_to_plain_text())
        output.select_all()

    # Activate buttons:

    worksheet1.find("a[href='#worksheet1-execute_code']").click((e) -> active_cell=last_active_cell; execute_cell(active_cell); return false)
    worksheet1.find("a[href='#worksheet1-interrupt_session']").button().click((e) -> interrupt_session(); return false)
    worksheet1.find("a[href='#worksheet1-tab']").button().click((e) -> active_cell=last_active_cell; tab_button(); return false)
    worksheet1.find("a[href='#worksheet1-autoindent']").button().click((e) -> active_cell=last_active_cell; autoindent_button(); return false)
    worksheet1.find("a[href='#worksheet1-restart_session']").button().click((e) -> restart_session(); return false)
    worksheet1.find("a[href='#worksheet1-execute_all']").button().click((e) -> return false if $(this).hasClass('disabled'); execute_all(); return false)
    worksheet1.find("a[href='#worksheet1-clear_worksheet']").button().click((e) -> clear_worksheet(); return false)
    worksheet1.find("a[href='#worksheet1-delete_all_output']").button().click((e) -> delete_all_output(); return false)
    worksheet1.find("a[href='#worksheet1-hide_all_output']").button().click((e) -> hide_all_output(); return false)
    worksheet1.find("a[href='#worksheet1-show_all_output']").button().click((e) -> show_all_output(); return false)
    worksheet1.find("a[href='#worksheet1-save_worksheet']").button().click((e) -> save_worksheet(false); return false)

    worksheet1.find("a[href='#worksheet1-delete_cell']").button().click((e) -> active_cell=last_active_cell; delete_cell(cell:active_cell, keep_note:true); return false)
    worksheet1.find("a[href='#worksheet1-join_cells']").button().click((e) -> active_cell=last_active_cell; join_cells(active_cell); return false)
    worksheet1.find("a[href='#worksheet1-split_cell']").button().click((e) -> active_cell=last_active_cell; split_cell(active_cell); return false)
    worksheet1.find("a[href='#worksheet1-move_cell_up']").button().click((e) -> active_cell=last_active_cell; move_cell_up(active_cell); return false)
    worksheet1.find("a[href='#worksheet1-move_cell_down']").button().click((e) -> active_cell=last_active_cell; move_cell_down(active_cell); return false)

    worksheet1.find("a[href='#worksheet1-worksheet-view']").button().click((e) ->
        if current_view == 'edit'
            if edit_view_save_changes()
                worksheet_view()
        else
            worksheet_view()
        return false
    )
    worksheet1.find("a[href='#worksheet1-edit-view']").button().click((e) -> edit_view(); return false)
    worksheet1.find("a[href='#worksheet1-text-view']").button().click((e) -> text_view(); return false)

    # TODO: "are you sure?"
    worksheet1.find("a[href='#salvus-worksheet-edit-cancel']").button().click((e) -> worksheet_view(); return false)
    worksheet1.find("a[href='#salvus-worksheet-edit-save']").button().click((e) ->
        if edit_view_save_changes()
            $(this).addClass('disabled')
            worksheet_view()
        return false
    )

    load_scratch_worksheet = () ->
        salvus_client.load_scratch_worksheet
            timeout: 10
            cb: (error, data) ->
                worksheet_view()
                if views.worksheet?
                    views.worksheet.remove()
                if error
                    views.worksheet = page.salvus_worksheet()
                else
                    obj = misc.from_json(data)
                    views.worksheet = templates.find(".salvus-worksheet").clone()
                    page.append(views.worksheet)
                    activate_worksheet(views.worksheet)
                    set_worksheet_from_obj(obj)
                worksheet_is_clean()
                if not isMobile.any()
                    focus_editor_on_first_cell()

    salvus_client.once "connected", () ->
        load_scratch_worksheet()
    salvus_client.on "signed_in", () ->
        load_scratch_worksheet()

)
