######
# Test client for worksheet/cell code
######
#

{Cell} = require("cell")
{to_json} = require("misc")
{salvus_client}    = require('salvus_client')

{diff}   = require("misc_page")

worksheet2 = $("#worksheet2")

init = () ->

    testbox = worksheet2.find(".salvus-worksheet2-testbox")
    if testbox.html() != ''
        return 
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
    #c.append_output(stream:'file', value:{filename:"foo.png", uuid:"aslkdjf", show:true})
    c.append_output(stream:'javascript', value:{code:"console.log('hi 1')"}).append_output(stream:'javascript', value:{code:"console.log 'hi 1'", coffeescript:true})

    testbox.append(c.element)
    c.refresh()

    d = $("<div>")
    testbox.append(d)
    d.salvus_cell(editor_line_numbers:true, editor_value:"5+7\n1/0", editor_match_brackets:false)

    c2 = d.data('cell')
    c2.selected(true)


    salvus_client.new_session
        limits: {walltime:30}
        cb : (err, session) ->
            if err
                console.log("Error getting session")
            else
                c3 = worksheet2.find(".worksheet2-cell1").salvus_cell(session:session, editor_value:"factor(2930239*27)").data('cell').hide('note').selected()
                c3.execute(session)




    worksheet2.find(".worksheet2-cell0").salvus_cell().data('cell').hide('editor')
    worksheet2.find(".worksheet2-cell2").salvus_cell()

    worksheet2.find(".well-cell1").css('z-index',100).draggable()

{top_navbar}       = require('top_navbar')
top_navbar.on "switch_to_page-worksheet2", () ->
    init()
