(() ->
    misc = require('misc')
    client = require('client')
    uuid = misc.uuid
    required = misc.required
    defaults = misc.defaults

    page = $("#worksheet-cm")
    templates = $(".worksheet-cm-templates")
    e = templates.find(".worksheet-cm").clone().show().appendTo(page).find("textarea")[0]
    editor = CodeMirror.fromTextArea(e, lineNumbers: false)

    editor.input_block_info = () ->
        to = editor.getCursor()
        from = {line:to.line, ch:0}
        while from.line >= 0
            if editor.findMarksAt(from).length > 0
                break
            from.line -= 1
        from.line += 1
        return {from:from, to:to}

    editor.input_text = () ->
        {from, to} = editor.input_block_info()
        return editor.getRange(from, to)

    editor.insert_output = (opts) ->
        opts = defaults opts,
            value : required
            type  : 'stdout'
        pos = editor.getCursor()
        num_lines = 1
        editor.replaceRange(opts.value, {line:pos.line+1, ch:0})
        editor.markText({line:pos.line+1,ch:0}, {line:pos.line + 1+num_lines,ch:0}, {className:"worksheet-cm-#{opts.type}", atomic:true})
        editor.setCursor({line:pos.line+num_lines+1,ch:0})

    keydown_handler = (e) ->
        switch e.which
            when 13 # enter
                if e.shiftKey
                    return execute_code()
            when 27 # escape = 27
                return interrupt_session()
            when 9  # tab key = 9
                return introspect()

    top_navbar.on "switch_to_page-worksheet-cm", () ->
        $(document).keydown(keydown_handler)
        editor.refresh()

    top_navbar.on "switch_from_page-worksheet-cm", () ->
        $(document).unbind("keydown", keydown_handler)

    execute_code = () ->
        console.log("execute_code")
        input = editor.input_text()
        output = "#{eval(input)}"
        editor.insert_output(value:output, type:'stdout')
        return false

        # pos = editor.getCursor()
        # node = $("<img src='http://vertramp.org/framed.png'>").draggable()[0]
        # editor.replaceRange(output, {line:pos.line+1, ch:0})
        # editor.markText({line:pos.line+1,ch:0}, {line:pos.line+2,ch:0}, {className:"worksheet-cm-output", atomic:true, replacedWith:node})
        # editor.setCursor({line:pos.line+2,ch:0})
        # #widget = editor.addLineWidget(line, output)
        # #editor.setBookmark({line:pos.line, ch:0}, output)

    interrupt_session = () ->
        return true

    introspect = () ->
        return true

    restart_session = () ->
        return true

    delete_worksheet = () ->
        return true

    save_worksheet = () ->
        return true

    activate_buttons = () ->
        page.find("a[href='#worksheet-cm-execute_code']").click((e) -> execute_code(); return false)
        page.find("a[href='#worksheet-cm-interrupt_session']").button().click((e) -> interrupt_session(); return false)
        page.find("a[href='#worksheet-cm-introspect']").button().click((e) -> introspect(); return false)
        page.find("a[href='#worksheet-cm-restart_session']").button().click((e) -> restart_session(); return false)
        page.find("a[href='#worksheet-cm-delete_worksheet']").button().click((e) -> delete_worksheet(); return false)
        page.find("a[href='#worksheet-cm-save_worksheet']").button().click((e) -> save_worksheet(); return false)

    activate_buttons() 
)()

