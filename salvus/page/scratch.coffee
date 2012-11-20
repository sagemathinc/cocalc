############################################
# Scratch -- the salvus default scratchpad
############################################

set_evaluate_key = undefined # exported

(() ->
    mswalltime = require("misc").mswalltime


    $("#execute").click((event) -> execute_code())
    

    execute_code = () ->
        $("#output").val("")
        $("#time").html("")
        $("#run_status").html("running...")
        t0 = mswalltime()
        code = $("#input").val()
        system = $("#demo1-system").val()
        
        # TODO: this won't work when code contains ''' -- replace by a more sophisticated message to the sage server
        eval_wrap = (code, system) -> 'print ' + system + ".eval(r'''" + code + "''')" 

        switch system
            when 'sage'
                preparse = true
            when 'python'
                preparse = false
                # nothing
            else
                preparse = false                
                code = eval_wrap(code, system)
        
        salvus.execute_code(
            code  : code
            cb    : (mesg) ->
                $("#time").html("#{mswalltime() - t0} ms") 
                o = $("#output")
                o.val(o.val() + mesg.stdout)
                if mesg.stderr
                    o.val(o.val() + "\n!!!!!!!!!!!!!!\n#{mesg.stderr}\n!!!!!!!!!!!!!\n") 
                $("#run_status").html(if mesg.done then "" else "running...")
            preparse : preparse
            allow_cache : $("#script-cache").is(':checked')
        )

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

    jQuery(window).on 'mercury:ready', () ->
        console.log(Mercury.config.toolbars.editable)
        Mercury.config.toolbars.editable.titleAndContent = ['Simple Markup', 'Inserts a title, paragraph tag, and a button']
        Mercury.config.behaviors.titleAndContent = (selection) ->
            url = prompt('Enter the link for the button')
            selection.replace('<div><h2>Title</h2><p>content</p><a href="' + url + '" class="button">button</a><hr/></div>')

    window.salvus_exec = (input, f) ->
        salvus.execute_code(
            code: input
            cb : f
            preparse: true
            allow_cache: false
        )
    
)()