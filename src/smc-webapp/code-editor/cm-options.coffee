###
Compute the codemirror options for file with given name,
using the given editor settings.
###

{file_associations}  = require('../file-associations')
feature              = require('../feature')
mobile               = require('./mobile')
misc                 = require('smc-util/misc')
{defaults, required} = misc

exports.cm_options = (opts) ->
    {filename, editor_settings, actions, frame_id} = defaults opts,
        filename        : required  # string -- determines editor mode
        editor_settings : required  # immutable.js map
        actions         : undefined
        frame_id        : required

    key = misc.filename_extension_notilde(filename).toLowerCase()
    if not key
        key = "noext-#{misc.path_split(filename).tail}".toLowerCase()
    default_opts = file_associations[key]?.opts ? {}

    opts = defaults default_opts,
        undoDepth                  : 0  # we use our own sync-aware undo.
        mode                       : undefined
        show_trailing_whitespace   : editor_settings.get('show_trailing_whitespace')
        allow_javascript_eval      : true  # if false, the one use of eval isn't allowed.
        line_numbers               : editor_settings.get('line_numbers')
        first_line_number          : editor_settings.get('first_line_number')
        indent_unit                : editor_settings.get('indent_unit')
        tab_size                   : editor_settings.get('tab_size')
        smart_indent               : editor_settings.get('smart_indent')
        electric_chars             : editor_settings.get('electric_chars')
        match_brackets             : editor_settings.get('match_brackets')
        code_folding               : editor_settings.get('code_folding')
        auto_close_brackets        : editor_settings.get('auto_close_brackets')
        match_xml_tags             : editor_settings.get('match_xml_tags')
        auto_close_xml_tags        : editor_settings.get('auto_close_xml_tags')
        line_wrapping              : editor_settings.get('line_wrapping')
        spaces_instead_of_tabs     : editor_settings.get('spaces_instead_of_tabs')
        style_active_line          : !!(editor_settings.get('style_active_line') ? true)
        bindings                   : editor_settings.get('bindings')
        theme                      : editor_settings.get('theme')

    extraKeys =
        "Ctrl-'"       : "indentAuto"
        "Cmd-'"        : "indentAuto"

        "Cmd-/"        : "toggleComment"
        "Ctrl-/"       : "toggleComment"    # shortcut chosen by jupyter project (undocumented)

        "Ctrl-Space"   : "autocomplete"
        "Tab"          : (cm) -> tab_key(cm, opts.spaces_instead_of_tabs)
        "Shift-Tab"    : (cm) -> cm.unindent_selection()

        "Shift-Cmd-L"  : (cm) -> cm.align_assignments()
        "Shift-Ctrl-L" : (cm) -> cm.align_assignments()

    if feature.IS_TOUCH  # maybe should be IS_IPAD... ?
        # Better more external keyboard friendly shortcuts, motivated by iPad.
        mobile.extra_alt_keys(extraKeys, actions, frame_id, opts)

    if actions?
        actionKeys =
            "Cmd-S"        : -> actions.save(true)
            "Alt-S"        : -> actions.save(true)
            "Ctrl-S"       : -> actions.save(true)
            "Shift-Ctrl-." : -> actions.increase_font_size(frame_id)
            "Shift-Ctrl-," : -> actions.decrease_font_size(frame_id)
            "Shift-Cmd-."  : -> actions.increase_font_size(frame_id)
            "Shift-Cmd-,"  : -> actions.decrease_font_size(frame_id)
            "Ctrl-L"       : (cm) -> cm.execCommand('jumpToLine')
            "Cmd-L"        : (cm) -> cm.execCommand('jumpToLine')
            "Cmd-F"        : (cm) -> cm.execCommand('find')
            "Ctrl-F"       : (cm) -> cm.execCommand('find')
            "Cmd-G"        : (cm) -> cm.execCommand('findNext')
            "Ctrl-G"       : (cm) -> cm.execCommand('findNext')
            "Shift-Cmd-G"  : (cm) -> cm.execCommand('findPrev')
            "Shift-Ctrl-G" : (cm) -> cm.execCommand('findPrev')
            "Shift-Enter"  : -> actions.set_error("You can only evaluate code in a file that ends with the extension 'sagews' or 'ipynb'.   Create a Sage Worksheet or Jupyter notebook instead.")
        for k, v of actionKeys
            extraKeys[k] = v

    if opts.match_xml_tags
        extraKeys['Ctrl-J'] = "toMatchingTag"

    if feature.isMobile.Android()
        # see https://github.com/sragemathinc/smc/issues/1360
        opts.style_active_line = false

    options =
        firstLineNumber         : opts.first_line_number
        autofocus               : false
        mode                    : {name:opts.mode, globalVars: true}
        lineNumbers             : opts.line_numbers
        showTrailingSpace       : opts.show_trailing_whitespace
        indentUnit              : opts.indent_unit
        tabSize                 : opts.tab_size
        smartIndent             : opts.smart_indent
        electricChars           : opts.electric_chars
        undoDepth               : opts.undo_depth
        matchBrackets           : opts.match_brackets
        autoCloseBrackets       : opts.auto_close_brackets and (misc.filename_extension_notilde(filename) not in ['hs', 'lhs']) #972
        autoCloseTags           : opts.auto_close_xml_tags
        lineWrapping            : opts.line_wrapping
        readOnly                : opts.read_only
        styleActiveLine         : opts.style_active_line
        indentWithTabs          : not opts.spaces_instead_of_tabs
        showCursorWhenSelecting : true
        extraKeys               : extraKeys
        cursorScrollMargin      : 6
        viewportMargin          : 10

    if opts.match_xml_tags
        options.matchTags = {bothTags: true}

    if opts.code_folding
        extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
        extraKeys["Alt-Q"]  = (cm) -> cm.foldCodeSelectionAware()
        options.foldGutter  = true
        options.gutters     = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]

    if opts.latex_editor
        options.gutters     ?= []
        options.gutters.push("Codemirror-latex-errors")

    if opts.bindings? and opts.bindings != "standard"
        options.keyMap = opts.bindings

    if opts.theme? and opts.theme != "standard"
        options.theme = opts.theme

    return options


tab_key = (editor, spaces_instead_of_tabs) ->
    if editor.somethingSelected()
        CodeMirror.commands.defaultTab(editor)
    else
        if spaces_instead_of_tabs
            editor.tab_as_space()
        else
            CodeMirror.commands.defaultTab(editor)

