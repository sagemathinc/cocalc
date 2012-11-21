############################################
# Scratch -- the salvus default scratchpad
############################################

set_evaluate_key = undefined # exported

(() ->
    mswalltime = require("misc").mswalltime

    persistent_session = null    

    session = (cb) ->
        if persistent_session == null
            salvus.conn.new_session
                limits: {}
                timeout: 10
                cb: (error, session) ->
                    if error
                        cb(true, error)
                    else
                        persistent_session = session
                        cb(false, persistent_session)
        else
            cb(false, persistent_session)


    #$("#execute").click((event) -> execute_code())
    #

    is_evaluate_key = misc_page.is_shift_enter
    
    set_evaluate_key = (keyname) ->
        switch keyname
            when "shift_enter"
                is_evaluate_key = misc_page.is_shift_enter
            when "enter"
                is_evaluate_key = misc_page.is_enter
            when "control-enter"
                is_evaluate_key = misc_page.is_ctrl_enter
            else
                is_evaluate_key = misc_page.is_shift_enter
            
    

    keydown_handler = (e) ->
        if is_evaluate_key(e)
            execute_code()
            return false

    top_navbar.on "switch_to_page-scratch", () ->
        #$("#input").focus()
        $(".scratch-worksheet").focus()
        #$("body").keydown(keydown_handler)
        Mercury?.trigger('toggle:interface');

    top_navbar.on "switch_from_page-scratch", () ->
        #$("body").unbind("keydown", keydown_handler)
        Mercury?.trigger('toggle:interface');

    ######################################################################
    # extend Mercury for salvus: (note the online docs at
    # https://github.com/jejacks0n/mercury/wiki/Extending-Mercury are
    # out of date...)
    #

    $(window).on 'mercury:loaded', () ->
        orig = Mercury.config.toolbars.primary
        Mercury.config.toolbars.primary =
            execute2 : ['Execute2', "Execute code using Sage"]
            execute  : ['Execute', "Execute code using Sage"]
            undo:      ['Undo', 'Undo your last action']
            redo:      ['Redo', 'Redo your last action']
            insertLink : orig.insertLink
            insertMedia: orig.insertMedia
            insertTable: orig.insertTable

        orig = Mercury.config.toolbars.editable
        delete Mercury.config.toolbars.editable
        Mercury.config.toolbars.editable =
            _regions:    orig._regions
            formatblock: ['Block Format', null, { select: '/mercury/selects/formatblock.html', preload: true }]
            htmlEditor:          ['Edit HTML', 'Edit the HTML content', { regions: ['full'] }]
            backColor:           ['Background Color', null, { palette: '/mercury/palettes/backcolor.html', context: true, preload: true, regions: ['full'] }]
            foreColor:           ['Text Color', null, { palette: '/mercury/palettes/forecolor.html', context: true, preload: true, regions: ['full'] }]
            decoration: orig.decoration
            script: orig.script
            justify: orig.justify
            list: orig.list
            indent: orig.indent
            rules:orig.rules

        # Make a jQuery plugin for executing the code in a cell
        $.fn.extend
            execute_cell: (opts) -> 
                return @each () ->
                    cell = $(this)
                    # wrap input in sage-input
                    input = this.innerText
                    console.log("input='#{input}'")
                    salvus_exec input, (mesg) ->
                        console.log(mesg)
                        if mesg.stdout?
                            cell.append($("<pre><span class='sage-stdout'>#{mesg.stdout}</span></pre>"))
                        if mesg.stderr?
                            cell.append($("<pre><span class='sage-stderr'>#{mesg.stderr}</span></pre>"))

                                                
        Mercury.config.behaviors.execute2 = (selection, options) ->
            e = selection.wrap('<div class="sage-cell">', true)
            console.log(e)
            e.execute_cell()

        Mercury.config.behaviors.execute = (selection, options) ->
            input = selection.textContent()
            output = ""
            salvus_exec input, (mesg) ->
                console.log(mesg)
                if mesg.stdout?
                    output += "<span class='sage-stdout'>#{mesg.stdout}</span>"
                if mesg.stderr?
                    output += "<span class='sage-stderr'>#{mesg.stderr}</span>"
                selection.insertNode("<span>" + input + "<br>" + output + "</span>")
                Mercury.trigger('reinitialize')
        
    $(window).on 'mercury:ready', () ->


    execute_code = () ->
        console.log("evaluating!")

    # TODO: this won't work when code contains ''' -- replace by a more sophisticated message to the sage server
    eval_wrap = (input, system) -> 'print ' + system + ".eval(r'''" + input + "''')"

    salvus_exec = (input, cb) ->
        session (error, s) ->
            if error
                conosole.log("ERROR GETTING SESSION")
                return
            system = $("iframe").contents().find("#scratch-system").val()
            console.log("Evaluate using '#{system}'")
            switch system
                when 'sage'
                    preparse = true
                when 'python'
                    preparse = false
                    # nothing
                else
                    preparse = false                
                    input = eval_wrap(input, system)
            s.execute_code
                code        : input
                cb          : cb
                preparse    : preparse
        
)()