############################################
# Scratch -- the salvus default scratchpad
############################################

set_evaluate_key = undefined # exported

(() ->
    mswalltime = require("misc").mswalltime

    persistent_session = null    


    $("#execute").click((event) -> execute_code())
    

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
        $("body").keydown(keydown_handler)
        Mercury.trigger('toggle:interface');

    top_navbar.on "switch_from_page-scratch", () ->
        $("body").unbind("keydown", keydown_handler)
        Mercury.trigger('toggle:interface');

    ######################################################################
    # extend Mercury for salvus: (note the online docs at
    # https://github.com/jejacks0n/mercury/wiki/Extending-Mercury are
    # out of date...)
    #

    $(window).on 'mercury:loaded', () ->
        orig_primary = Mercury.config.toolbars.primary
        Mercury.config.toolbars.primary = {}
        Mercury.config.toolbars.primary =
            execute: ['Evaluate', "Execute code using Sage"]
            undoredo: orig_primary.undoredo
            
        
        
        Mercury.config.behaviors.execute = (selection, options) ->
            code = selection.textContent()
            output = "<div class='sage-stdout'>"
            salvus_exec code, (mesg) ->
                console.log(mesg)
                if mesg.stdout?
                    output += mesg.stdout
                if mesg.stderr?
                    output += "<div class='sage-stderr'>#{mesg.stderr}</div>"
                if mesg.done
                    output += "</div>"
                selection.insertNode("<div>" + code + "<hr>" + output + "</div><hr><br>")
        
    $(window).on 'mercury:ready', () ->

    # TODO: this won't work when code contains ''' -- replace by a more sophisticated message to the sage server
    eval_wrap = (input, system) -> 'print ' + system + ".eval(r'''" + input + "''')" 

    salvus_exec = (input, cb) ->
        if persistent_session == null
            salvus.conn.new_session
                limits: {}
                timeout: 10
                cb: (error, session) ->
                    if error
                        # failed to create session quickly enough -- give an error; user could try later.
                        alert_message(type:"error", message:error)
                    else
                        persistent_session = session
            return  # can't evaluate the code yet -- will try again when the callback above succeeds

        #system = $("#scratch-system").val()
        system = 'sage'
        switch system
            when 'sage'
                preparse = true
            when 'python'
                preparse = false
                # nothing
            else
                preparse = false                
                input = eval_wrap(input, system)

        console.log("input = ", input)

        persistent_session.execute_code
            code        : input
            cb          : cb
            preparse    : preparse
    
)()