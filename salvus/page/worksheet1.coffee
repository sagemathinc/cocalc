###
# coffee -w -c index.coffee
### 

$(() ->
    misc = require('misc')
    uuid = misc.uuid
    required = misc.required
    defaults = misc.defaults
    
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
                worksheet.find("a[href='#worksheet1-tab']").button().click((e) -> tab_completion(); return false)
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
                cell.find(".salvus-cell-input").focus().blur((e) -> active_cell=undefined; highlight($(this)) )
            return cell

    
    $(document).keydown (e) ->
        switch e.which
            when 13 # enter
                if e.shiftKey
                    return execute_code()
            when 40 # down arrow
                if e.altKey or e.ctrlKey
                    return focus_next_editable()
            when 38 # up arrow
                if e.altKey or e.ctrlKey
                    return focus_previous_editable()
            when 27 # escape
                interrupt_session()


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

    highlight = (input) ->
        Rainbow.color(input.text(), "python", ((highlighted) -> input.html(highlighted)))

    execute_code = () ->
        cell = active_cell
        if not cell?
            return
        input = cell.find(".salvus-cell-input")
        
        input_text = input.text()
        
        #console.log(input.html())
        #console.log(input.text())
        # 
        #input_text = input.val()

        # syntax highlight input:
        highlight(input)
        
        output = cell.find(".salvus-cell-output")
        
        stdout = output.find(".salvus-stdout")
        stderr = output.find(".salvus-stderr")
        
        stdout.text("")
        stderr.text("")

        # activity() -- looks bad and crashes chrome on linux hard.
        # # .activity(width:1.5, segments:14)
        timer = setTimeout((() -> cell.find(".salvus-running").show()), 500)
        
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
        return false
    
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
                console?.log("ERROR GETTING SESSION")
                return
            s.execute_code
                code        : opts.input
                cb          : opts.cb
                preparse    : true
    
    
)
