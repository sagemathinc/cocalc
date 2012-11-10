#####################################
# Code execution router
#####################################

execute_router = {}

(() ->
    execute_code = () ->
        switch controller.active_page
            when "demo1"
                execute_code_demo1()
            when "demo2"
                execute_code_demo2()

    # execute when clicking the button
    $("#execute").button().click(execute_code)
    $("#execute2").button().click(execute_code)

    is_shift_enter = (e) -> e.which is 13 and e.shiftKey
    is_enter       = (e) -> e.which is 13 and not e.shiftKey
    is_ctrl_enter  = (e) -> e.which is 13 and e.ctrlKey
    is_escape      = (e) -> e.which is 27

    is_evaluate_key = is_shift_enter

    execute_router.set_evaluate_key = (key) ->
        switch key
            when "shift-enter"
                is_evaluate_key = is_shift_enter
            when "control-enter"
                is_evaluate_key = is_ctrl_enter
            when "enter"
                is_evaluate_key = is_enter
            else
                alert_message(type:"error", message:"Unknown evaluate key #{key}; using shift-enter instead.")
                is_evaluate_key = is_shift_enter

    # execute when pressing "shift-enter"
    $("body").keydown (e) ->
        switch controller.active_page
            when "demo1"
                if is_evaluate_key(e)
                    execute_code_demo1()
                    return false
            when "demo2"
                if is_evaluate_key(e)
                    execute_code_demo2()
                    return false
                if is_escape(e.which)
                    interrupt_exec2()
                    return false
)()      