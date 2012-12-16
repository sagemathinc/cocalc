######
# Test client for worksheet/cell code
######
#

{Cell} = require("cell")
{Worksheet} = require("worksheet")
{to_json} = require("misc")
{salvus_client}    = require('salvus_client')

{diff}   = require("misc_page")

worksheet2 = $("#worksheet2")

init = () ->
    testbox = worksheet2.find(".salvus-worksheet2-testbox")
    if testbox.html() != ''
        return

    ##################
    # Worksheet tests
    ##################
    #
    #
    $(".math-formula").mathjax(tex:"x^3 + y^3 = z^3")

    worksheet2_test_div = $("#worksheet2-test-worksheet")
    ws1 = $("<div>ws1</div>")
    worksheet2_test_div.append(ws1)
    cell_opts =
        output_line_wrapping : true
        editor_line_numbers  : true
        hide:['note']
    w = new Worksheet(element: ws1, title:"Worksheet 1", description:"as obj directly",cell_opts:cell_opts)

    ws2 = $("<div>ws2</div>")
    worksheet2_test_div.append(ws2)
    ws2.salvus_worksheet(title:"Worksheet 2", description:"via jQuery plugin")
    ws2 = ws2.data('worksheet')


    ##################
    # Cell Tests
    ##################
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
        limits: {walltime:60*15}
        type: 'sage'
        cb : (err, session) ->
            if err
                console.log "Error getting session: #{err}"
            else
                w.set_session(session)
                ws2.set_session(session)
                c3 = worksheet2.find(".worksheet2-cell1").salvus_cell(session:session, editor_value:"factor(2930239*27)").data('cell').hide('note').selected()
                c3.execute(session)
                for x in cell_slides
                    x.set_session(session)

    worksheet2.find(".worksheet2-cell0").salvus_cell().data('cell').hide('editor')
    worksheet2.find(".worksheet2-cell2").salvus_cell()

    worksheet2.find(".well-cell1").css('z-index',100).draggable()

    cell_slides = ($(x).data('cell') for x in $(".slide-cell").salvus_cell(editor_line_numbers:false, editor_line_wrapping:true))
    $('.deck-container').hide()

    load_slideshow = () ->
        console.log("loading slideshow")
        padding_top = $('body').css('padding-top')  # this might not be 0 due to bootstrap menu, so we save it
        $('body').css('padding-top', '0px')
        $('body').children().hide()
        $('.deck-container').show()
        console.log("showed deck container")
        #$.deck('.slide')
        #$.deck('enableScale')

    $('.deck-activate').click(load_slideshow)

init_console = (elt) ->
    elt = $(elt)
    salvus_client.new_session
        limits : {walltime:60*15}
        type : 'console'
        cb : (err, session) ->
            if err
                console.log "Error starting console session: #{err}"
            else
                elt.salvus_console(title:"A Test Console", session:session)
                c = elt.data('console')
                c.element.focus()

# each with different session
init_consoles = (elts) ->
    console.log("init_consoles")
    for elt in elts
        init_console(elt)

# all with same session
init_consoles2 = (elts) ->
    salvus_client.new_session
        limits : {walltime:60*15}
        type : 'console'
        cb : (err, session) ->
            if err
                console.log "Error starting console session: #{err}"
            else
                for elt in elts
                    elt = $(elt)
                    elt.salvus_console(title:"A Test Console", session:session)
                    c = elt.data('console')
                    c.element.focus()

# use "connect_to_session"
init_consoles3 = (elts) ->
    salvus_client.new_session
        limits : {walltime:60*15}
        type : 'console'
        cb : (err, session) ->
            if err
                console.log "Error starting console session: #{err}"
            else
                salvus_client.connect_to_session
                    type         : 'console'
                    session_uuid : session.session_uuid
                    cb : (err, session2) ->
                        if err
                            console.log "Error connecting to existing console session: #{err}"
                        else
                            for elt in elts
                                elt = $(elt)
                                elt.salvus_console(title:"A Test Console", session:session2)
                                c = elt.data('console')
                                c.element.focus()

{top_navbar}       = require('top_navbar')
top_navbar.on "switch_to_page-worksheet2", () ->
    #init()
    c = worksheet2.find(".salvus-test-console")
    console.log(c.length)
    init_consoles(c)
