
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
    worksheet = undefined


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
                setTimeout((() -> editor.focus()), 50)

            sel.blur(pick)
            #sel.click(pick)
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

    extraKeys =
        "Ctrl-Space"  : "autocomplete"
        "Shift-Enter" : (editor) -> execute_code()
        "Up":(editor) ->
            if editor.getCursor().line == 0
                focus_previous_cell()
            else
                throw CodeMirror.Pass
        "Down":(editor) ->
            if editor.getCursor().line >= editor.lineCount() - 1
                focus_next_cell()
            else
                throw CodeMirror.Pass

        "Esc":(editor) ->
            interrupt_session()

        "Tab":(editor) ->
            # decide if we can "tab complete"
            throw CodeMirror.Pass

        "Backspace":(editor) ->
            if editor.getValue() == ""
                delete_cell(containing_cell($(editor.getWrapperElement())))
            else
                throw CodeMirror.Pass

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
            lineNumbers    : false
            firstLineNumber: 1
            indentUnit     : 4
            tabSize        : 4
            lineWrapping   : true
            undoDepth      : 200
            autofocus      : false
            extraKeys      : extraKeys
            matchBrackets  : true

        cell.data('editor', editor)
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
        cell = $("#worksheet1"
        ).find(".salvus-templates"
        ).find(".salvus-cell"
        ).clone(
        ).attr('id', if opts.id? then opts.id else uuid())

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
                worksheet = worksheet1.find(".salvus-templates").find(".salvus-worksheet").clone()
                $(this).append(worksheet)
                activate_worksheet(worksheet)
                focus_editor(worksheet.append_salvus_cell())
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
    # cells: [ {id:<uuid text>, type:"code", note:<html>, input:<text>, output:{stdout:<html>, stderr:<html>}} ]
    # }

    cell_to_obj = (cell) ->
        cell   = $(cell)
        output = {}
        for stream in ['stdout', 'stderr']
            x = cell.find(".salvus-#{stream}").html()
            if x.trim() != ""
                output[stream] = x
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
        if obj.output.stdout?
            cell.find(".salvus-stdout").html(obj.output.stdout).show()
        if obj.output.stderr?
            cell.find(".salvus-stderr").html(obj.output.stderr).show()

    worksheet_to_obj = () ->
        # jquery officially iterates through objects in DOM order, as of 1.3.2.
        obj = {
            title       : worksheet.find(".salvus-worksheet-title").html()
            description : worksheet.find(".salvus-worksheet-description").html()
            cells       : []
        }
        $.each(worksheet.find(".salvus-cell"), (key, cell) -> obj.cells.push(cell_to_obj(cell)))
        return obj

    set_worksheet_from_obj = (obj) ->
        worksheet.find(".salvus-worksheet-title").html(obj.title)
        worksheet.find(".salvus-worksheet-description").html(obj.description)
        worksheet.find(".salvus-cell").remove()
        for cell_obj in obj.cells
            obj_to_cell(cell_obj, worksheet.append_salvus_cell()[0])


    ########################################
    # introspection
    ########################################

    introspect = () ->
        if not active_cell?
            return true

        get_session (error, s) ->
            if error
                alert_message(type:"error", message:"Unable to start a Sage session in which to introspect.")
                return true

            input = active_cell.find(".salvus-cell-input")
            s.introspect
                text_before_cursor: input.getValue()
                text_after_cursor: undefined
                cb: (error, mesg) ->
                    if error
                        alert_message(type:"error", message:mesg.error)
                    if mesg?
                        alert_message(type:"info", message:misc.to_json(mesg.completions))

        return false

    ########################################
    # Moving around / focus
    ########################################

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
        worksheet.find(".salvus-cell:first")
        focus_editor(worksheet.find(".salvus-cell:first"))

    focus_next_cell = () ->
        focus_editor(active_cell.next())

    focus_previous_cell = () ->
        focus_editor(active_cell.prev())

    insert_cell_before = (cell) ->
        worksheet_is_dirty()
        new_cell = salvus_cell()
        cell.before(new_cell)
        refresh_editor(new_cell)
        focus_editor(new_cell)

    insert_cell_after = (cell) ->
        worksheet_is_dirty()
        new_cell = salvus_cell()
        cell.after(new_cell)
        refresh_editor(new_cell)
        focus_editor(new_cell)

    delete_cell = (cell) ->
        worksheet_is_dirty()
        note = cell.find(".salvus-cell-note").html()
        cell_above = cell.prev()
        cell_below = cell.next()
        if not cell_below.hasClass("salvus-cell")  # it's the last cell on the worksheet, so don't delete
            return
        if note != ""
            note_below = cell_below.find(".salvus-cell-note")
            note_below.html(note + '<br>' + note_below.html())
        cell.remove()
        if cell_above.length > 0 and cell_above.hasClass("salvus-cell")
            focus_editor(cell_above)
        else if cell_below.length > 0 and cell_below.hasClass("salvus-cell")
            focus_editor(cell_below)
        else
            new_cell = worksheet.append_salvus_cell()
            new_cell.find(".salvus-cell-note").html(note)
            focus_editor(new_cell)

    ########################################
    # Editing / Executing code
    ########################################

    execute_code = () ->
        cell = active_cell
        if not cell?
            return
        worksheet_is_dirty()
        execute_code_in_cell(cell.data('editor').getValue(), cell)
        return false


    execute_code_in_cell = (input_text, cell) ->
        input = cell.find(".salvus-cell-input")
        output = cell.find(".salvus-cell-output")
        stdout = output.find(".salvus-stdout")
        stderr = output.find(".salvus-stderr")

        # delete any output already in the output area
        stdout.text("")
        stderr.text("")

        if input_text != ""
            # activity() -- looks bad and crashes chrome on linux hard.
            # # .activity(width:1.5, segments:14)
            timer = setTimeout((() -> cell.find(".salvus-running").show()), 1000)

            salvus_exec
                input: input_text
                cb: (mesg) ->
                    if mesg.stdout?
                        stdout.text(stdout.text() + mesg.stdout).show()
                    if mesg.stderr?
                        stderr.text(stderr.text() + mesg.stderr).show()
                    if mesg.done
                        clearTimeout(timer)
                        cell.find(".salvus-running").hide()

        next = cell.next()
        if next.length == 0
            next = worksheet.append_salvus_cell()
        focus_editor(next)
        last_active_cell = active_cell = next

    ##############################################################################################

    persistent_session = null

    get_session = (cb) ->
        if persistent_session == null
            salvus_client.new_session
                limits: {walltime:600, cputime:60}
                timeout: 2
                cb: (error, session) ->
                    if error
                        cb(true, error)
                    else
                        persistent_session = session
                        cb(false, persistent_session)
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
            worksheet.find(".salvus-running").hide()

    delete_worksheet= () ->
        # TODO: confirmation
        worksheet?.remove()
        worksheet = page.salvus_worksheet()
        salvus_client.delete_scratch_worksheet()

    tab_button = () ->
        # TODO: could also just be indenting a block
        if active_cell?
            CodeMirror.commands.autocomplete(active_cell.data('editor'))
            return false

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
        worksheet1.find("a[href='#worksheet1-save_worksheet']").addClass('btn-success')

    worksheet_is_dirty = () ->
        _worksheet_is_dirty = true
        worksheet1.find("a[href='#worksheet1-save_worksheet']").removeClass('btn-success')
        

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
                worksheet.find(".salvus-running").hide()
            else
                s.execute_code
                    code        : opts.input
                    cb          : opts.cb
                    preparse    : true


    ##############################################################################################

    worksheet1.find("a[href='#worksheet1-execute_code']").click((e) -> active_cell=last_active_cell; execute_code(); return false)
    worksheet1.find("a[href='#worksheet1-interrupt_session']").button().click((e) -> interrupt_session(); return false)
    worksheet1.find("a[href='#worksheet1-tab']").button().click((e) -> active_cell=last_active_cell; tab_button(); return false)
    worksheet1.find("a[href='#worksheet1-restart_session']").button().click((e) -> restart_session(); return false)
    worksheet1.find("a[href='#worksheet1-delete_worksheet']").button().click((e) -> delete_worksheet(); return false)
    worksheet1.find("a[href='#worksheet1-save_worksheet']").button().click((e) -> save_worksheet(true); return false)

    load_scratch_worksheet = () ->
        salvus_client.load_scratch_worksheet
            timeout: 10
            cb: (error, data) ->
                if worksheet?
                    worksheet.remove()
                if error
                    worksheet = page.salvus_worksheet()
                else
                    obj = misc.from_json(data)
                    worksheet = worksheet1.find(".salvus-templates").find(".salvus-worksheet").clone()
                    page.append(worksheet)
                    activate_worksheet(worksheet)
                    set_worksheet_from_obj(obj)
                    focus_editor_on_first_cell()
                worksheet_is_clean()

    salvus_client.on "connected", () ->
        load_scratch_worksheet()
    salvus_client.on "signed_in", () ->
        load_scratch_worksheet()

)
