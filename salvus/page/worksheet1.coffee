###
# coffee -w -c index.coffee
### 

$(() ->
    misc = require('misc')
    uuid = misc.uuid
    required = misc.required
    defaults = misc.defaults
    
    active_cell = undefined

    worksheet1 = $("#worksheet1")
    
    $.fn.extend
        salvus_worksheet: (opts) ->
            worksheet = undefined
            @each () ->
                worksheet = worksheet1.find(".salvus-templates").find(".salvus-worksheet").clone()
                $(this).append(worksheet)
                worksheet.append_salvus_cell()
            return worksheet
                
        append_salvus_cell: (opts) ->
            cell = undefined
            @each () ->
                cell = $("#worksheet1").find(".salvus-templates").find(".salvus-cell").clone().data("worksheet", $(this))
                id = uuid()
                cell.attr('id', id)
                cell.find(".salvus-cell-input").data("cell", cell).click((e) ->
                    active_cell = $(this).data('cell')
                ).focus((e) -> active_cell = $(this).data('cell'))
                $(this).append(cell)
                #cell.draggable().bind("click", () -> $(this).focus())
                active_cell = cell
                cell.find(".salvus-cell-input").focus().blur((e) -> highlight($(this)))
            return cell

    
    $(document).keydown((e) ->
        if e.which is 13 and not e.shiftKey
            return execute_code()
    )

    highlight = (input) ->
        Rainbow.color(input.text(), "python", ((highlighted) -> input.html(highlighted)))

    execute_code = () ->
        e = $(document.activeElement)
        if not e.hasClass('salvus-cell-input')
            return true
        cell = active_cell
        if not cell?
            console?.log("BUG -- active cell not defined")
            return
        input = cell.find(".salvus-cell-input")
        
        input_text = input.text()
        #input_text = input.val()

        # syntax highlight input:
        highlight(input)
        
        output = cell.find(".salvus-cell-output")
        
        stdout = output.find(".salvus-stdout")
        stderr = output.find(".salvus-stderr")
        
        stdout.text("")
        stderr.text("")
        salvus_exec
            input: input_text
            cb: (mesg) ->
                if mesg.stdout?
                    stdout.text(stdout.text() + mesg.stdout)
                if mesg.stderr?
                    stderr.text(stderr.text() + mesg.stderr)
                    
        next = cell.next()
        if next.length == 0
            next = worksheet.append_salvus_cell()
        next.find(".salvus-cell-input").focus()
        active_cell = next
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
