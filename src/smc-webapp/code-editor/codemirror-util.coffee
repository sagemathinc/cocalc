
###
Save and restore the scroll position of a cm editor in a JSON-friendly format,
so it can be stored in local storage.

This is extremely hard if the user has word wrap on since every wrapped line changes the total
editor height, and the Codemirror API not providing a simple way to deal with this.
###

misc = require('smc-util/misc')

VERSION = 2

exports.get_state = (cm) ->
    info = cm.getScrollInfo()
    if info.height <= 0
        # The editor view not properly configured yet (get negative values) -- ignore;
        # this was the source of https://github.com/sagemathinc/cocalc/issues/2801
        return
    pos = misc.copy_with(cm.coordsChar(info, 'local'), ['line', 'ch'])
    state =
        pos: pos
        sel: cm.listSelections()
        ver: VERSION
    #console.log 'get_state', info, state.pos
    return state

exports.restore_state = (cm, state) ->
    if not cm?
        return
    #console.log 'restore_state', cm.getValue().length, state
    if not state? or state.ver < VERSION  # ignore
        #console.log 'old ver'
        return

    if state.pos?
        elt = $(cm.getWrapperElement()).find('.CodeMirror-scroll')
        elt.css('opacity', 0)
        # We **have to** do the scrollTo in the next render loop, since otherwise
        # the coords below will return the sizing data about
        # the cm instance before the above css font-size change has been rendered.
        # The opacity business avoids some really painful "flicker".
        f = ->
            elt.css('opacity', 1)
            cm.scrollTo(0, cm.cursorCoords(state.pos, 'local').top)
            cm.refresh()
        setTimeout(f, 0)

    sel = state.sel
    if sel?
        cm.setSelections(sel)

