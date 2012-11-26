###
# coffee -w -c index.coffee
###

$(() ->
    misc = require('misc')
    uuid = misc.uuid
    required = misc.required
    defaults = misc.defaults

    html_to_text = require("client").html_to_text

    active_cell = undefined
    last_active_cell = undefined

    worksheet1 = $("#worksheet1")

    $.fn.extend
        salvus_worksheet: (opts) ->
            worksheet = undefined
            @each () ->
                worksheet = worksheet1.find(".salvus-templates").find(".salvus-worksheet").clone()
                $(this).append(worksheet)
                worksheet.append_salvus_cell()
                worksheet.find("a[href='#worksheet1-execute_code']").click((e) -> active_cell=last_active_cell; execute_code(); return false)
                worksheet.find("a[href='#worksheet1-interrupt_session']").button().click((e) -> interrupt_session(); return false)
                worksheet.find("a[href='#worksheet1-tab']").button().click((e) -> active_cell=last_active_cell; tab_completion(); return false)
                worksheet.find("a[href='#worksheet1-restart_session']").button().click((e) -> restart_session(); return false)
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
                cell.find(".salvus-cell-input").focus()#.blur((e) -> active_cell=undefined; highlight(input:$(this)) )
            return cell

    $(document).keydown (e) ->
        switch e.which
            when 13 # enter
                if e.shiftKey
                    return execute_code()
                else
                    e = $(document.activeElement)
                    if e.hasClass("salvus-cell-input")
                        console.log("doing it")
                        #range = rangy.createRange()
                        #range.selectNode(e[0])
                        sel = rangy.getSelection()
                        range = sel.getRangeAt(0)
                        newNode = $("<span><br><br></span>")[0]   # need to figure out how to get rid of this space (?)
                        range.insertNode(newNode)

                        r2 = rangy.createRange()
                        r2.setStart(newNode,1)
                        r2.setEnd(newNode,1)
                        if sel.rangeCount > 0
                            sel.removeAllRanges()
                        sel.addRange(r2)
                        
                        sel.removeAllRanges()

                        r2 = rangy.createRange()
                        r2.selectNodeContents(newNode)
                        r2.moveStart("character", 1)
                        sel.setSingleRange(r2)
                        sel.deleteFromDocument(r2)
                        return false

            when 40 # down arrow
                if e.altKey or e.ctrlKey
                    return focus_next_editable()
            when 38 # up arrow
                if e.altKey or e.ctrlKey
                    return focus_previous_editable()
            when 27 # escape
                interrupt_session()
            when 9 # tab key
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

    focus_next_editable = () ->
        e = $(document.activeElement)
        #console.log(containing_cell(e))
        containing_cell(e).next().find(".salvus-cell-input").focus()
        return false

    focus_previous_editable = () ->
        e = $(document.activeElement)
        containing_cell(e).prev().find(".salvus-cell-input").focus()
        return false

    highlight = (opts) ->
        opts = defaults opts,
            input    : required   # DOM element to de-html and syntax highlight
            cb       : undefined  # called with (error, plain_text) when done.
            language : 'python'

        console.log("raw_html='#{opts.input.html()}'")
        console.log(rangy.innerText(opts.input[0]))

        # html_to_text
        #     html : opts.input.html()
        #     cb   : (error, plain_text) ->
        #         if error
        #             opts.cb?(error)
        #         else
        #             #if plain_text.match(/\S/)
        #                 #Rainbow.color(plain_text, opts.language, ((highlighted) -> opts.input.html(highlighted)))
        #             opts.cb?(false, plain_text)
            

        console.log(opts.input.html())
        console.log(rangy.innerText(opts.input[0]))
        plain_text = rangy.innerText(opts.input[0])
        # &nbsp;'s are converted to character code 160, not 32 (which is a space).
        # We thus must replace all 32's by 160, or sage will be unhappy:
        plain_text = plain_text.replace(/\xA0/g, " ")
        if not plain_text.match(/\S/)
            # easy special case -- whitespace
            opts.cb?(false, '')
            return
        console.log("plain_text='#{plain_text}'")
        Rainbow.color(plain_text, opts.language, ((highlighted) -> console.log("highlighted='#{highlighted}'"); opts.input.html(highlighted)))
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
                #console.log("input_text='#{input_text}'")
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

    page = $("#worksheet1")

    worksheet = page.salvus_worksheet()

    persistent_session = null

    session = (cb) ->
        if persistent_session == null
            salvus.conn.new_session
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

    tab_completion = () ->
        alert("not implemented")

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


)
