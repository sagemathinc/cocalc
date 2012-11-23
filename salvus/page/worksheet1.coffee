###
# coffee -w -c index.coffee
### 

$(() ->
    uuid = require('misc').uuid
    
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
                cell.find(".salvus-cell-input").focus()
            return cell

    
    $(document).keydown((e) ->
        if e.which is 13 and not e.shiftKey
            return execute_code()
    )

    execute_code = () ->
        e = $(document.activeElement)
        if not e.hasClass('salvus-cell-input')
            return true
        cell = active_cell
        if not cell?
            return
        console?.log('execute_code!', cell)
        input = cell.find(".salvus-cell-input")
        input_text = input.text()
        #input_text = input.val()
        console?.log(input_text)
        output = cell.find(".salvus-cell-output")

        #output_text = eval(input_text)
        #worksheet.attr('contenteditable',false)
        salvus_exec
            input: input_text
            cb: (mesg) ->
                console.log("CALLBACK", mesg)
                #if mesg.stdout?
                #    output.text(mesg.stdout)
                #if mesg.stderr?
        
        next = cell.next()
        if next.length == 0
            next = worksheet.append_salvus_cell()
        next.find(".salvus-cell-input").focus()
        active_cell = next
        return false
    
    page = $("#worksheet1")
    worksheet = page.salvus_worksheet()
    console?.log(worksheet)


    persistent_session = null    

    session = (cb) ->
        if persistent_session == null
            salvus.conn.new_session
                limits: {}
                timeout: 10
                cb: (error, session) ->
                    console.log("session", session)
                    if error
                        cb(true, error)
                    else
                        persistent_session = session
                        cb(false, persistent_session)
        else
            cb(false, persistent_session)

    salvus_exec = (input, cb) ->
        console.log("a!")        
        session (error, s) ->
            if error
                console.log("ERROR GETTING SESSION")
                return
            console.log("go!")
            s.execute_code
                code        : input
                cb          : (x) -> console.log(x)
                preparse    : true
    
    
)
