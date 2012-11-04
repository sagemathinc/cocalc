############################################
# Demo 1 -- a single script: Execute the code that is in the #input box
############################################

mswalltime = require("misc").mswalltime
execute_code_demo1 = () ->
    $("#output").val("")
    $("#time").html("")
    $("#run_status").html("running...")
    t0 = mswalltime()
    salvus.execute_code(
        code  : $("#input").val()
        cb    : (mesg) ->
            $("#time").html("#{mswalltime() - t0} ms") 
            o = $("#output")
            o.val(o.val() + mesg.stdout)
            if mesg.stderr
                o.val(o.val() + "\n!!!!!!!!!!!!!!\n#{mesg.stderr}\n!!!!!!!!!!!!!\n") 
            $("#run_status").html(if mesg.done then "" else "running...")
        preparse: true
        allow_cache: $("#script-cache").is(':checked')
    )
