######
# Test client for worksheet/cell code
######
#

{Cell} = require("cell")
{to_json} = require("misc")

{diff}   = require("misc_page")

worksheet2 = $("#worksheet2")

init = () ->

    testbox = worksheet2.find(".salvus-worksheet2-testbox")

    c = new Cell
        element:$("<div>")
        editor_max_height:"auto"
        note_max_height:'5em'
        editor_line_wrapping: false
        editor_value : "for i in range(10):\n    print(i)"

    #c.on "change", (m) ->
    #    console.log("change: #{to_json(m)}")

    testbox.append(c.element)
    c.refresh()

    d = $("<div>")
    testbox.append(d)
    d.salvus_cell(editor_line_numbers:true, editor_value:"range(100)\ni=5\nb=7", editor_match_brackets:false)

    c2 = d.data('cell')
    c2.select()

    worksheet2.find(".worksheet2-cell1").salvus_cell()
    worksheet2.find(".worksheet2-cell2").salvus_cell()

{top_navbar}       = require('top_navbar')
top_navbar.on "switch_to_page-worksheet2", () ->
    init()
