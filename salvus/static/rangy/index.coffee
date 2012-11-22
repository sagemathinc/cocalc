###
# coffee -w -c index.coffee
### 

uuid = ->
    `'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });`

$(() ->
    $.fn.extend
        salvus_worksheet: (opts) ->
            return @each () ->
                worksheet = $(".salvus-templates").find(".salvus-worksheet").clone()
                $(this).append(worksheet)
                worksheet.append_salvus_cell()
                
        append_salvus_cell: (opts) ->
            return @each () ->
                cell = $(".salvus-templates").find(".salvus-cell").clone().data("worksheet", $(this))
                id = uuid()
                cell.attr('id', id)
                button = cell.find(".btn")
                button.data("cell",cell).click((e) ->
                    execute_code($(this).data("cell"))
                    $(this).hide()
                ).hide()
                cell.find(".salvus-cell-input").data("cell", cell)
                    .keydown((e) ->
                        if e.which is 13 and e.shiftKey
                            execute_code($(this).data("cell"))
                    )
                    .focus((e) ->
                        $(this).data("cell").find(".btn").show()
                    )
                    .focus()
                $(this).append(cell)
    
    execute_code = (cell) ->
        input = cell.find(".salvus-cell-input")
        input_text = input.text()
        output = cell.find(".salvus-cell-output")

        output.text(eval(input_text))

        next = cell.next()
        if next.length == 0
            next = cell.data("worksheet").append_salvus_cell()
        next.find(".salvus-cell-input").focus()
        return false
    
    page = $("#page")
    page.salvus_worksheet()
)
