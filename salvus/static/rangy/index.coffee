###
# coffee -w -c index.coffee
### 

$(() ->
    $.fn.extend
        salvus_worksheet: (opts) ->
            return @each () ->
                worksheet = $(".salvus-templates").find(".salvus-worksheet").clone()
                $(this).append(worksheet)
                worksheet.append_salvus_cell()
                return worksheet
                
        append_salvus_cell: (opts) ->
            return @each () ->
                cell = $(".salvus-templates").find(".salvus-cell").clone().data("worksheet", $(this))
                cell.find(".salvus-cell-input").data("cell", cell).keydown(execute_code)
                cell.draggable(handle:".span1")
                $(this).append(cell)
                return cell
    
    execute_code = (e) ->
        if e.which is 13 and e.shiftKey
            t = $(this)
            cell = t.data("cell")
            input_text = t.text()
            output = cell.find(".salvus-cell-output")
            console.log(input_text)
            
            output.text(eval(input_text))
            
            next = cell.next()
            if next.length == 0
                next = cell.data("worksheet").append_salvus_cell()
            console.log(next.find(".salvus-cell-input"))
            next.find(".salvus-cell-input").focus()
            return false
    
    page = $("#page")
    page.salvus_worksheet()
)
