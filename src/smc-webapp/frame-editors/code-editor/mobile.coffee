###
Extra CodeMirror keybindings that are mainly aimed to make mobile
external keyboard devices more usable, e.g., iPad.

Basically, certain browsers intercept or don't properly send the control or cmd
keys to the browser javascript.  However, the option=alt key isn't used for
much, so we add it for many keyboard shortcuts here.
###

misc = require('smc-util/misc')
copypaste = require('smc-webapp/copy-paste-buffer')

exports.extra_alt_keys = (extraKeys, actions, frame_id, opts) ->
    misc.merge extraKeys,
        "Shift-Alt-L" : (cm) => cm.align_assignments()
        'Alt-Z'       : (cm) => cm.undo()
        'Shift-Alt-Z' : (cm) => cm.redo()
        'Alt-A'       : (cm) => cm.execCommand('selectAll')
        'Shift-Alt-A' : (cm) => cm.execCommand('selectAll')
        'Alt-K'       : (cm) => cm.execCommand('killLine')
        'Alt-D'       : (cm) => cm.execCommand('selectNextOccurrence')
        'Alt-F'       : (cm) => cm.execCommand('find')
        'Shift-Alt-F' : (cm) => cm.execCommand('replace')
        'Shift-Alt-R' : (cm) => cm.execCommand('replaceAll')
        'Shift-Alt-D' : (cm) => cm.execCommand('duplicateLine')
        'Alt-G'       : (cm) => cm.execCommand('findNext')
        'Shift-Alt-G' : (cm) => cm.execCommand('findPrev')
        'Cmd-Up'      : (cm) => cm.execCommand('goPageUp')
        'Cmd-Down'    : (cm) => cm.execCommand('goPageDown')
        'Alt-K'       : (cm) => cm.execCommand('goPageUp')
        'Alt-J'       : (cm) => cm.execCommand('goPageDown')
        'Alt-P'       : (cm) => cm.execCommand('goLineUp')
        'Alt-N'       : (cm) => cm.execCommand('goLineDown')
        'Alt-L'       : (cm) => cm.execCommand('jumpToLine')
        'Alt-C'       : (cm) => actions.copy(frame_id)  # gets overwritten for vim mode, of course
        'Alt-X'       : (cm) => actions.cut(frame_id)
        'Alt-V'       : (cm) => actions.paste(frame_id)
        'Alt-S'       : (cm) => actions.save(true)

    if opts.bindings == 'vim'
        # An additional key to get to visual mode in vim (added for ipad Smart Keyboard)
        extraKeys["Alt-C"] = (cm) =>
            CodeMirror.Vim.exitInsertMode(cm)
        extraKeys["Alt-F"] = (cm) =>
            cm.execCommand('goPageDown')
        extraKeys["Alt-B"] = (cm) =>
            cm.execCommand('goPageUp')

