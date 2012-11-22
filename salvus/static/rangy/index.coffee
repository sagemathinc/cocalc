###
# coffee -w -c index.coffee
### 

uuid = ->
    `'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });`

$(() ->
    active_cell = undefined
    
    $.fn.extend
        salvus_worksheet: (opts) ->
            return @each () ->
                worksheet = $(".salvus-templates").find(".salvus-worksheet").clone()
                $(this).append(worksheet)
                worksheet.append_salvus_cell()
                worksheet.append_salvus_cell()
                worksheet.append_salvus_cell()                                
                
        append_salvus_cell: (opts) ->
            return @each () ->
                cell = $(".salvus-templates").find(".salvus-cell").clone().data("worksheet", $(this))
                id = uuid()
                cell.attr('id', id)
                cell.find(".salvus-cell-input").data("cell", cell).focus().click((e) ->
                    active_cell = $(this).data('cell')
                )
                $(this).append(cell)
                active_cell = cell

    
    $(document).keydown((e) ->
        if e.which is 13 and not e.shiftKey
            execute_code()
            return false
    )

    execute_code = () ->
        cell = active_cell
        console.log('execute_code!', cell)
        input = cell.find(".salvus-cell-input")
        input_text = input.text()
        console.log(input_text)
        output = cell.find(".salvus-cell-output")

        output_text = eval(input_text)
        worksheet.attr('contenteditable',false); output.text(output_text);
        worksheet.attr('contenteditable',true)
        
        console.log(output.html())
        return false

        next = cell.next()
        if next.length == 0
            next = cell.data("worksheet").append_salvus_cell()
            
        next.find(".salvus-cell-input").focus()
        return false
    
    page = $("#page")
    worksheet = page.salvus_worksheet()
    
)
