############################################
# Command line REPL session
############################################

execute_code_demo2 = () ->
    i = $("#input2")
    o = $("#output2")
    if o.val() == ""
        o.val("\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n")  # hackish
    code = i.val()
    i.val("")
    o.val(o.val() + ">>> #{code}\n")
    o.scrollTop(o[0].scrollHeight)
    persistent_session.execute_code(
        code : code
        cb   :(mesg) ->
            if mesg.stdout?
                o.val(o.val() + mesg.stdout)
                o.scrollTop(o[0].scrollHeight)
            if mesg.stderr?
                o.val(o.val() + "!!!!\n" + mesg.stderr + "!!!!\n")
                o.scrollTop(o[0].scrollHeight)
        preparse: true
    )

interrupt_exec2 = () ->
    console.log('interrupt')
    persistent_session.interrupt()

$("#interrupt2").button().click(interrupt_exec2)
