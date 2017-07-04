###
Extra CodeMirror keybindings that are mainly aimed to make mobile
external keyboard devices more usable, e.g., iPad.

Basically, certain browsers intercept or don't properly send the control or cmd
keys to the browser javascript.  However, the option=alt key isn't used for
much, so we add it for many keyboard shortcuts here.
###

misc = require('smc-util/misc')

exports.extra_alt_keys = (extraKeys, editor, opts) ->
    misc.merge extraKeys,
        "Shift-Alt-L"  : (cm) => cm.align_assignments()
        'Alt-Z'        : (cm) => cm.undo()
        'Shift-Alt-Z'  : (cm) => cm.redo()
        'Alt-A'        : (cm) => cm.execCommand('selectAll')
        'Shift-Alt-A'  : (cm) => cm.execCommand('selectAll')
        'Alt-K'        : (cm) => cm.execCommand('killLine')
        'Alt-D'        : (cm) => cm.execCommand('selectNextOccurrence')
        'Alt-F'        : (cm) => cm.execCommand('find')
        'Shift-Alt-F'  : (cm) => cm.execCommand('replace')
        'Shift-Alt-R'  : (cm) => cm.execCommand('replaceAll')
        'Shift-Alt-D'  : (cm) => cm.execCommand('duplicateLine')
        'Alt-G'        : (cm) => cm.execCommand('findNext')
        'Alt-Up'       : (cm) => cm.execCommand('goPageUp')
        'Alt-Down'     : (cm) => cm.execCommand('goPageDown')
        'Alt-P'        : (cm) => cm.execCommand('goLineUp')
        'Alt-N'        : (cm) => cm.execCommand('goLineDown')

    if editor?
        if editor.goto_line?
            extraKeys['Alt-L'] = (cm) => editor.goto_line(cm)
        if editor.toggle_split_view?
            extraKeys['Alt-I'] = (cm) => editor.toggle_split_view(cm)
        if editor.copy?
            extraKeys['Alt-C'] = (cm) => editor.copy(cm)  # gets overwritten for vim mode, of course
        if editor.cut?
            extraKeys['Alt-X'] = (cm) => editor.cut(cm)
        if editor.paste?
            extraKeys['Alt-V'] = (cm) => editor.paste(cm)
        if editor.click_save_button?
            extraKeys['Alt-S'] = (cm) => editor.click_save_button()

    if opts.bindings == 'vim'
        # An additional key to get to visual mode in vim (added for ipad Smart Keyboard)
        extraKeys["Alt-C"] = (cm) =>
            CodeMirror.Vim.exitInsertMode(cm)
        extraKeys["Alt-F"] = (cm) =>
            cm.execCommand('goPageDown')
        extraKeys["Alt-B"] = (cm) =>
            cm.execCommand('goPageUp')
