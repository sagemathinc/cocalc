
###
Save and restore the scroll position of a cm editor in a JSON-friendly format,
so it can be stored in local storage.

This is extremely hard if the user has word wrap on since every wrapped line changes the total
editor height, and the Codemirror API not providing a simple way to deal with this.
###

misc = require('smc-util/misc')

VERSION = 1

exports.get_state0 = (cm) ->
    state = misc.copy_with(cm.getScrollInfo(), ['left', 'top', 'clientHeight', 'height', 'width'])
    state.sel = cm.listSelections()
    state.ver = VERSION
    return state

exports.restore_state0 = (cm, state) ->
    if state.ver < VERSION  # ignore
        return
    scroll_before = state
    scroll_after  = cm.getScrollInfo()
    x = (scroll_before.left / scroll_before.width) * scroll_after.width
    y = (((scroll_before.top+scroll_before.clientHeight/2) / scroll_before.height) * scroll_after.height) - scroll_after.clientHeight/2
    cm.scrollTo(x, y)
    sel = state.sel
    if sel?
        cm.setSelections(sel)

exports.restore_scroll_viewport_change = (cm, state) ->
    scroll_before = state
    scroll_after  = cm.getScrollInfo()
    x = (scroll_before.left / scroll_before.width) * scroll_after.width
    y = (((scroll_before.top+scroll_before.clientHeight/2) / scroll_before.height) * scroll_after.height) - scroll_after.clientHeight/2
    cm.scrollTo(x, y)

exports.get_state = (cm) ->
    #state = misc.copy_with(cm.getScrollInfo(), ['left', 'top', 'clientHeight', 'height', 'width'])
    state = cm.getScrollInfo()
    state.sel = cm.listSelections()
    state.ver = VERSION
    return state

exports.restore_state = (cm, state) ->
    if state.ver < VERSION  # ignore
        return
    if not cm.getOption('lineWrapping')
        # easy case -- no line wrapping
        cm.scrollTo(state.left, state.top)
    else
        # harder
        exports.restore_scroll_viewport_change(cm, state)

    sel = state.sel
    if sel?
        cm.setSelections(sel)

