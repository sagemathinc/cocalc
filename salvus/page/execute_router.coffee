#####################################
# Code execution router
#####################################
# 
execute_code = ->
    switch active_page
        when "#demo1"
            execute_code_demo1()
        when "#demo2"
            execute_code_demo2()

# execute when clicking the button
$("#execute").button().click(execute_code)
$("#execute2").button().click(execute_code)

# execute when pressing "shift-enter"
$("body").keydown (e) ->
    switch active_page
        when "#demo1"
            if e.which is 13 and e.shiftKey
                execute_code_demo1()
                return false
        when "#demo2"
            if e.which is 13 and not e.shiftKey
                execute_code_demo2()
                return false
            if e.which is 27
                interrupt_exec2()
                return false
  