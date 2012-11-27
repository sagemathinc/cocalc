###
# coffee -w -c index.coffee
###

$(() ->
    misc = require('misc')
    client = require('client')
    async = require('async')
    uuid = misc.uuid
    required = misc.required
    defaults = misc.defaults

    html_to_text = require("client").html_to_text

    active_cell = undefined
    last_active_cell = undefined

    page = $("#worksheet1")
    worksheet1 = $("#worksheet1")
    worksheet = undefined

    $.fn.extend
        salvus_worksheet: (opts) ->
            worksheet = undefined
            @each () ->
                worksheet = worksheet1.find(".salvus-templates").find(".salvus-worksheet").clone()
                $(this).append(worksheet)
                worksheet.append_salvus_cell()

                worksheet1.find("a[href='#worksheet1-execute_code']").click((e) -> active_cell=last_active_cell; execute_code(); return false)
                worksheet1.find("a[href='#worksheet1-interrupt_session']").button().click((e) -> interrupt_session(); return false)
                worksheet1.find("a[href='#worksheet1-tab']").button().click((e) -> active_cell=last_active_cell; tab_completion(); return false)
                worksheet1.find("a[href='#worksheet1-restart_session']").button().click((e) -> restart_session(); return false)
                worksheet1.find("a[href='#worksheet1-delete_worksheet']").button().click((e) -> delete_worksheet(); return false)
            return worksheet

        append_salvus_cell: (opts) ->
            cell = undefined
            @each () ->
                cell = $("#worksheet1").find(".salvus-templates").find(".salvus-cell").clone().data("worksheet", $(this))
                id = uuid()
                cell.attr('id', id)
                cell.find(".salvus-cell-input").data("cell", cell).click((e) ->
                    active_cell = $(this).data('cell')
                ).focus((e) -> last_active_cell = active_cell = $(this).data('cell'))
                $(this).append(cell)
                #cell.draggable().bind("click", () -> $(this).focus())
                last_active_cell = active_cell = cell
                cell.find(".salvus-cell-input").focus()
                #.blur((e) -> active_cell=undefined; highlight(input:$(this)) )
            return cell

    ###############################################################
    # jquery plugins for manipulating the contenteditable editor
    # in ways I need, using rangy mostly for cross-platform support
    # TODO: Move this to its own file.
    ###############################################################
    $.fn.extend
        # set_caret_position: move the cursor to given position in the given element
        salvusws_set_caret_position: (opts={}) ->
            opts = defaults opts,
                offset: 0
                type:   'character'   # 'range', 'character'
            @each () ->
                range = rangy.createRange()
                if opts.type == 'range'
                    range.setStart(this, opts.offset)
                    range.setEnd(this, opts.offset)
                else
                    range.selectCharacters(this, opts.offset, opts.offset)
                sel = rangy.getSelection()
                if sel.rangeCount > 0
                    sel.removeAllRanges()
                sel.addRange(range)

        salvusws_insert_node_at_caret: (opts={}) ->
            opts = defaults opts, {}  # for now
            @each () ->
                sel   = rangy.getSelection()
                range = sel.getRangeAt(0)
                range.insertNode(this)

        salvusws_text: (opts={}) ->   # returns text rather than a jquery wrapped object
            opts = defaults opts, {} # no options
            result = ''
            @each () ->
                that = this
                async.series([
                    (cb) -> client.html_to_text(html:$(that).html(), cb:((error, plain) -> result += plain; cb()))
                ])
                # This was the rangy implementation, but it was 10000 times slower than htmlparser, so screw that!
                #r = rangy.createRange()
                #r.selectNodeContents(this)
                #result += r.text()

            # &nbsp;'s are converted to character code 160, not 32 (which is a space).
            # We thus must replace all 32's by 160, or sage will be unhappy:
            return result.replace(/\xA0/g, " ")

    class CaretPosition
        constructor: (@container, @offset) ->
        equals: (other) ->  # true if this and other are at the same position
            @container == other.container and @offset == other.offset
        set: (type='range') -> # moves the cursor to this position, if it exists
            range = rangy.createRange()
            range.setStart(@container, @offset)
            range.setEnd(@container, @offset)
            sel = rangy.getSelection()
            if sel.rangeCount > 0
                sel.removeAllRanges()
            sel.addRange(range)

    get_caret_position = () ->
        try
            sel   = rangy.getSelection()
            range = sel.getRangeAt(0)
            return new CaretPosition(range.startContainer, range.startOffset)
        catch error
            return undefined  # no caret position

    ####################################################
    # keyboard control -- rewrite to use some library
    ####################################################
    keydown_caret_position = null
    $(document).keydown (e) ->
        switch e.which
            when 13 # enter
                if e.shiftKey
                    return execute_code()
            when 40 # down arrow
                if e.ctrlKey or e.altKey
                    focus_next_editable()
                    return false
                if e.shiftKey
                    return true
                pos = get_caret_position()
                if pos?
                    setTimeout((() -> focus_next_editable() if get_caret_position()?.equals(pos)), 1)
            when 38 # up arrow
                if e.ctrlKey or e.altKey
                    focus_previous_editable()
                    return false
                if e.shiftKey
                    return true
                pos = get_caret_position()
                if pos?
                    setTimeout((() -> focus_previous_editable() if get_caret_position()?.equals(pos)), 1)
            when 27 # escape = 27
                interrupt_session()
            when 9 # tab key = 9
                if input_is_selected()
                    indent_selected_input(e.shiftKey)
                    return false
                else
                    return introspect()


    ########################################
    # indent and unindent block
    ########################################
    input_is_selected = () ->
        # TODO: implement
        return false

    indent_selected_input = (unindent=false) ->
        return false


    ########################################
    # introspection
    ########################################

    # Syntax highlight last active cell, get plain text back along
    # with cursor position, decide whether or not to insert four
    # spaces or introspect.
    introspect = () ->
        if not active_cell?
            return

        session (error, s) ->
            if error
                alert_message(type:"error", message:"Unable to start a Sage session in which to introspect.")
                return

            input = active_cell.find(".salvus-cell-input")
            highlight
                input : input
                cb : (error, input_text) ->
                    if error
                        alert_message(type:"error", message:"Problem parsing a cell for introspection.")
                        return

                    s.introspect
                        text_before_cursor: input_text
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

    focus_next_editable = () ->
        e = save_caret_position()
        n = containing_cell(e).next().find(".salvus-cell-input").focus()
        p = n.data("caret_position")
        if p?
            p.set()
        return false

    focus_previous_editable = () ->
        e = save_caret_position()
        n = containing_cell(e).prev().find(".salvus-cell-input").focus()
        p = n.data("caret_position")
        if p?
            p.set()
        return false

    highlight = (opts) ->
        opts = defaults opts,
            input    : required   # DOM element to de-html and syntax highlight
            cb       : undefined  # called with (error, plain_text) when done.
            language : 'python'

        plain_text = opts.input.salvusws_text()
        if not plain_text.match(/\S/)
            # easy special case -- whitespace
            opts.cb?(false, '')
            return
        Rainbow.color(plain_text, opts.language, ((highlighted) -> opts.input.html(highlighted.replace(/\n/g,'<br>'))))
        opts.cb?(false, plain_text)

    execute_code = () ->
        cell = active_cell
        if not cell?
            return

        input = cell.find(".salvus-cell-input")

        # syntax highlight input, then call execute on the resulting plain text:
        highlight
            input : input
            cb: (error, input_text) ->
                if error
                    alert_message(type:"error", message:"There was an error parsing the content of an input cell.")
                else
                    execute_code_in_cell(input_text, cell)

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
        next.find(".salvus-cell-input").focus()
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

    tab_completion = () ->
        alert("not implemented")

    salvus_exec = (opts) ->
        opts = defaults opts,
            input: required
            cb: required

        salvus_client.save_scratch_worksheet
            data : worksheet.html()
            cb   : (error) ->
                console.log("save_worksheet", error)

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

    salvus_client.on "connected", (protocol) ->
        salvus_client.load_scratch_worksheet
            cb: (error, result) ->
                if error
                    worksheet = page.salvus_worksheet()
                    console.log("set worksheet 1")
                else
                    worksheet = $("<div class='well salvus-worksheet span12'>").html(result)
                    console.log("set worksheet 2")
                    page.append(worksheet)

)
