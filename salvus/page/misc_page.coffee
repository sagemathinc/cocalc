misc_page={}

(() ->
    misc_page.is_shift_enter = (e) -> e.which is 13 and e.shiftKey
    misc_page.is_enter       = (e) -> e.which is 13 and not e.shiftKey
    misc_page.is_ctrl_enter  = (e) -> e.which is 13 and e.ctrlKey
    misc_page.is_escape      = (e) -> e.which is 27
)()
