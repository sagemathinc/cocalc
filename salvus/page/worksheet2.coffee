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

    c.on "change", (m) ->
        console.log("change: #{to_json(m)}")

    c.append_output(stream:'stdout', value:"hello there")
    c.append_output(stream:'stderr', value:"<b>major error!</b>")
    c.append_output(stream:'html', value:"<b><i>major error!</i></b>")
    c.append_output(stream:'tex', value:{tex:"x^n+y^n=z^n", display:true})
    c.append_output(stream:'file', value:{filename:"foo.png", uuid:"aslkdjf", show:true})
    c.append_output(stream:'javascript', value:{code:"console.log('hi 1')"}).append_output(stream:'javascript', value:{code:"console.log 'hi 1'", coffeescript:true})

    testbox.append(c.element)
    c.refresh()

    d = $("<div>")
    testbox.append(d)
    d.salvus_cell(editor_line_numbers:true, editor_value:"range(100)\ni=5\nb=7", editor_match_brackets:false, output_value:"laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf<br>lasdjf<br>laksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlaksdf\nlasdjf\nlajsdfljasdlfkjaslkdfjalksdjflaksjdflkasjdflkjasdfjaskldfjaklsdjfklasjdfklasjdfkljaskdlf  jaksldjfklasjdfklasjdfkljasdlkfjasdfjasldfjasdfjasldkfj  alskdjflaksdjflkasjdflkasjdfkljaslkasjdflkjasdlkfjaskldfjkalsjd  fklasjdflkasjdfkljaskdlfjaskdfjaskljdfklasjdfkasdfkajskdfjaslkdfjaskl")

    c2 = d.data('cell')
    c2.selected(true)

    worksheet2.find(".worksheet2-cell0").salvus_cell().data('cell').hide('editor')
    worksheet2.find(".worksheet2-cell1").salvus_cell().data('cell').hide('note').selected()
    worksheet2.find(".worksheet2-cell2").salvus_cell()

    worksheet2.find(".well-cell1").css('z-index',100).draggable()

{top_navbar}       = require('top_navbar')
top_navbar.on "switch_to_page-worksheet2", () ->
    init()
