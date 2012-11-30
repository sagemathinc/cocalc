
$(() ->
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

    extraKeys =
        "Shift-Enter":(editor) -> execute_code()
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
    

    activate_salvus_cell = (cell) ->
        input = cell.find(".salvus-cell-input"
        ).click( (e) ->
            active_cell = containing_cell($(this))
        ).focus( (e) ->
            last_active_cell = active_cell = containing_cell($(this))
        )
        editor = CodeMirror.fromTextArea input[0],
            lineNumbers    : false
            firstLineNumber: 1
            indentUnit     : 4
            tabSize        : 4
            lineWrapping   : true
            undoDepth      : 200
            autofocus      : false
            extraKeys      : extraKeys
    
        cell.data('editor',editor)
        editor.on "focus", (e) ->
            last_active_cell = active_cell = cell
            $(e.getWrapperElement()).addClass('salvus-input-cell-focus').removeClass('salvus-input-cell-blur')
        editor.on "blur", (e) ->
            $(e.getWrapperElement()).addClass('salvus-input-cell-blur').removeClass('salvus-input-cell-focus')

        #$(editor.getScrollerElement()).css('max-height', Math.floor($(window).height()/2))

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
        salvus_worksheet: (opts) ->
            # salvus_worksheet: appends a Salvus worksheet to each element of the jQuery
            # wrapped set; resuts in the last worksheet created as a
            # jQuery wrapped object.
            worksheet = undefined
            @each () ->
                worksheet = worksheet1.find(".salvus-templates").find(".salvus-worksheet").clone()
                $(this).append(worksheet)
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

        append_salvus_cell: (opts) ->
            cell = undefined
            @each () ->
                cell = salvus_cell().appendTo($(this))
                editor = cell.data('editor')
                editor.refresh()
                editor.focus()
            return cell


    ####################################################
    # keyboard control -- rewrite to use some library
    ####################################################
    keydown_caret_position = null

    keydown_handler = (e) ->
        switch e.which
            when 27 # escape = 27
                interrupt_session()

    top_navbar.on "switch_to_page-scratch", () ->
        $(document).keydown(keydown_handler)

    top_navbar.on "switch_from_page-scratch", () ->
        $(document).unbind("keydown", keydown_handler)

    ########################################
    # introspection
    ########################################

    introspect = () ->
        if not active_cell?
            return true

        session (error, s) ->
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


    containing_cell = (elt) ->
        p = elt.parentsUntil(".salvus-cell")
        if p.length == 0
            return elt.parent()
        else
            return p.parent()

    # returns jquery wrapped active element
    save_caret_position = () ->
        return $(document.activeElement).data("caret_position", get_caret_position())

    focus_editor = (cell) ->
        cell.data('editor').focus()

    focus_next_cell = () ->
        focus_editor(active_cell.next())

    focus_previous_cell = () ->
        focus_editor(active_cell.prev())

    execute_code = () ->
        cell = active_cell
        if not cell?
            return
        worksheet_changed()
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

    session = (cb) ->
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
        worksheet.remove()
        worksheet = page.salvus_worksheet()
        salvus_client.delete_scratch_worksheet()

    tab_button = () ->
        # TODO: could also just be indenting a block
        introspect()

    save_scratch_worksheet = (notify=false) ->
        salvus_client.save_scratch_worksheet
            data : worksheet.html()
            cb   : (error, msg) ->
                if notify
                    if error
                        alert_message(type:"error", message:msg)
                    else
                        alert_message(type:"info", message:msg)
                if not error
                    worksheet_saved()

    worksheet_is_saved = true

    worksheet_saved = () ->
        worksheet_is_saved = true
        worksheet1.find("a[href='#worksheet1-save_worksheet']").addClass('btn-success')

    worksheet_changed = () ->
        worksheet_is_saved = false
        worksheet1.find("a[href='#worksheet1-save_worksheet']").removeClass('btn-success')

    window.onbeforeunload = (e=window.event) ->
        if not worksheet_is_saved
            return "Your scratch worksheet is not saved."

    salvus_exec = (opts) ->
        opts = defaults opts,
            input: required
            cb: required

        session (error, s) ->
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
    worksheet1.find("a[href='#worksheet1-save_worksheet']").button().click((e) -> save_scratch_worksheet(true); return false)

    load_scratch_worksheet = () ->
        salvus_client.load_scratch_worksheet
            cb: (error, result) ->
                if worksheet?
                    worksheet.remove()
                if error
                    worksheet = page.salvus_worksheet()
                else
                    worksheet = worksheet1.find(".salvus-templates").find(".salvus-worksheet").clone()
                    worksheet.html(result)
                    c = worksheet.find(".salvus-cell").salvus_cell()
                    $(c[0]).find(".salvus-cell-input").focus()
                    page.append(worksheet)

    salvus_client.on "connected", () ->
        load_scratch_worksheet()
    salvus_client.on "signed_in", () ->
        load_scratch_worksheet()

)
