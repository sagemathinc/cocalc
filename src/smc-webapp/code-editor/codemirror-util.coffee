
###
Save and restore the scroll position of a cm editor in a JSON-friendly format,
so it can be stored in local storage.

This is extremely hard if the user has word wrap on since every wrapped line changes the total
editor height, and the Codemirror API not providing a simple way to deal with this.
###

misc = require('smc-util/misc')

VERSION = 2

exports.get_state = (cm) ->
    state =
        pos: misc.copy_with(cm.coordsChar(cm.getScrollInfo(), 'local'), ['line', 'ch'])
        sel: cm.listSelections()
        ver: VERSION
    return state

exports.restore_state = (cm, state) ->
    if not state? or state.ver < VERSION  # ignore
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

