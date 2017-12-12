###
This module will handle setting the codemirror options for various kernels.
###

immutable = require('immutable')

{IS_TOUCH} = require('../feature')

# mode = codemirror mode object
# editor_settings - from account store.
exports.cm_options = (mode, editor_settings, line_numbers, read_only) ->
    editor_settings ?= {}
    mode ?= {name:'python'}
    if typeof(mode) == 'string'
        mode = {name:mode}
    if mode.name == 'gp'  # TODO; more substitutions?
        mode.name = 'pari'
    if mode.name == 'singular'
        mode.name = 'clike'  # better than nothing

    options =
        mode                    : mode
        firstLineNumber         : editor_settings.first_line_number
        showTrailingSpace       : editor_settings.show_trailing_whitespace or mode?.name == 'gfm2'
        indentUnit              : editor_settings.indent_unit
        tabSize                 : editor_settings.tab_size
        smartIndent             : editor_settings.smart_indent
        electricChars           : editor_settings.electric_chars
        undoDepth               : editor_settings.undo_depth
        matchBrackets           : editor_settings.match_brackets
        autoCloseBrackets       : editor_settings.auto_close_brackets
        autoCloseTags           : editor_settings.auto_close_xml_tags
        foldGutter              : editor_settings.code_folding
        lineWrapping            : true
        readOnly                : read_only
        indentWithTabs          : not editor_settings.spaces_instead_of_tabs
        showCursorWhenSelecting : true
        extraKeys               : {}

    if IS_TOUCH
        {extra_alt_keys} = require('mobile/codemirror')
        extra_alt_keys(options.extraKeys, undefined, editor_settings)

    if line_numbers?
        options.lineNumbers = line_numbers
        # NOTE: We ignore the account-wide default for now because line numbers are less necessary
        # in jupyter, off by default in the official client, and they are currently slower
        # due to our static fallback not being done for them (will do in #v2).
        # TODO: Implement jupyter-specific account-wide default setting.

    if editor_settings.bindings? and editor_settings.bindings != "standard"
        options.keyMap = editor_settings.bindings

    if editor_settings.theme? and editor_settings.theme != "standard"
        options.theme = editor_settings.theme

    if options.mode.name == 'ipython'
        # See https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/codemirror-ipython.js
        # This ipython mode is because the jupyter devs don't directly
        # run the CodeMirror parser; also, it will only work for
        # python -- what about other languages. See parsing.coffee
        # for our approach.
        options.mode.name = 'python'

    return options
