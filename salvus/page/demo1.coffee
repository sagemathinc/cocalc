############################################
# Demo 1 -- a single script: Execute the code that is in the #input box
############################################

mswalltime = require("misc").mswalltime

execute_code_demo1 = () ->
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
