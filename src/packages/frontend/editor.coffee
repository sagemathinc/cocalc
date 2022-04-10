#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

$ = window.$

# Do this first, before any templates are initialized (e.g., elsewhere too).

templates_html = \
  require("./console.html").default +
  require("./editor.html").default +
  require("./jupyter.html").default +
  require("./sagews/interact.html").default +
  require("./sagews/3d.html").default +
  require("./sagews/d3.html").default;
$("body").append(templates_html);

templates = $("#webapp-editor-templates")

{ init_buttonbars } = require("./editors/editor-button-bar")
init_buttonbars()

# Editor files in a project
# Show button labels if there are at most this many file tabs opened.
# This is in exports so that an elite user could customize this by doing, e.g.,
#    require('./editor').SHOW_BUTTON_LABELS=0
exports.SHOW_BUTTON_LABELS = 4

exports.MIN_SPLIT = MIN_SPLIT = 0.02
exports.MAX_SPLIT = MAX_SPLIT = 0.98  # maximum pane split proportion for editing

TOOLTIP_DELAY = delay: {show: 500, hide: 100}

async = require('async')

message = require('@cocalc/util/message')

{redux} = require('./app-framework')

_ = underscore = require('underscore')

{webapp_client} = require('./webapp-client')
{EventEmitter}  = require('events')
{alert_message} = require('./alerts')
{ appBasePath } = require("@cocalc/frontend/customize/app-base-path");

feature = require('./feature')
IS_MOBILE = feature.IS_MOBILE

misc = require('@cocalc/util/misc')
{drag_start_iframe_disable, drag_stop_iframe_enable, sagews_canonical_mode} = require('./misc')

# Ensure CodeMirror is available and configured
CodeMirror = require("codemirror")

# Ensure the console jquery plugin is available
require('./console')

# SMELL: undo doing the import below -- just use misc.[stuff] is more readable.
{copy, trunc, from_json, to_json, keys, defaults, required, filename_extension, filename_extension_notilde,
 len, path_split, uuid} = require('@cocalc/util/misc')

syncdoc  = require('./syncdoc')
sagews   = require('./sagews/sagews')
printing = require('./printing')

{file_nonzero_size} = require('./project/utils')

{render_snippets_dialog} = require('./assistant/legacy')

copypaste = require('./copy-paste-buffer')

extra_alt_keys = (extraKeys, editor, opts) ->
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
        'Alt-Up'      : (cm) => cm.execCommand('goPageUp')
        'Alt-Down'    : (cm) => cm.execCommand('goPageDown')
        'Alt-K'       : (cm) => cm.execCommand('goPageUp')
        'Alt-J'       : (cm) => cm.execCommand('goPageDown')
        'Alt-P'       : (cm) => cm.execCommand('goLineUp')
        'Alt-N'       : (cm) => cm.execCommand('goLineDown')

    if editor?.goto_line?
        extraKeys['Alt-L'] = (cm) => editor.goto_line(cm)
    if editor?.toggle_split_view?
        extraKeys['Alt-I'] = (cm) => editor.toggle_split_view(cm)
    if editor?.copy?
        extraKeys['Alt-C'] = (cm) => editor.copy(cm)  # gets overwritten for vim mode, of course
    else
        extraKeys['Alt-C'] = (cm) => copypaste.set_buffer(cm.getSelection())

    if editor?.cut?
        extraKeys['Alt-X'] = (cm) => editor.cut(cm)
    else
        extraKeys['Alt-X'] = (cm) =>
            copypaste.set_buffer(cm.getSelection())
            cm.replaceSelection('')
    if editor?.paste?
        extraKeys['Alt-V'] = (cm) => editor.paste(cm)
    else
        extraKeys['Alt-V'] = (cm) => cm.replaceSelection(copypaste.get_buffer())
    if editor?.click_save_button?
        extraKeys['Alt-S'] = (cm) => editor.click_save_button()
    else if editor?.save?
        extraKeys['Alt-S'] = (cm) => editor.save()

    if opts.bindings == 'vim'
        # An additional key to get to visual mode in vim (added for ipad Smart Keyboard)
        extraKeys["Alt-C"] = (cm) =>
            CodeMirror.Vim.exitInsertMode(cm)
        extraKeys["Alt-F"] = (cm) =>
            cm.execCommand('goPageDown')
        extraKeys["Alt-B"] = (cm) =>
            cm.execCommand('goPageUp')


{file_associations, VIDEO_EXTS} = require('./file-associations')

file_nonzero_size_cb = (project_id, path, cb) =>
    try
        if not await file_nonzero_size(project_id, path)
            cb("Unable to convert file to PDF")
        else
            cb()
    catch err
        cb(err)


initialize_new_file_type_list = () ->
    file_types_so_far = {}
    v = misc.keys(file_associations)
    v.sort()
    f = (elt, ext, exclude) ->
        if not ext
            return
        data = file_associations[ext]
        if exclude and data.exclude_from_menu
            return
        if data.name? and not file_types_so_far[data.name]
            file_types_so_far[data.name] = true
            e = $("<li><a href='#new-file' data-ext='#{ext}'><i style='width: 18px;' class='fa #{data.icon}'></i> <span style='text-transform:capitalize'>#{data.name} </span> <span class='lighten'>(.#{ext})</span></a></li>")
            elt.append(e)

    elt = $(".smc-new-file-type-list")
    for ext in v
        f(elt, ext, true)

    elt = $(".smc-mini-new-file-type-list")
    file_types_so_far = {}
    for ext in ['sagews', 'term', 'ipynb', 'tex', 'md', 'tasks', 'course', 'sage', 'py']
        f(elt, ext)
    elt.append($("<li class='divider'></li><li><a href='#new-folder'><i style='width: 18px;' class='fa fa-folder'></i> <span>Folder </span></a></li>"))

    elt.append($("<li class='divider'></li><li><a href='#projects-add-collaborators'><i style='width: 18px;' class='fa fa-user'></i> <span>Collaborators... </span></a></li>"))

initialize_new_file_type_list()

exports.file_icon_class = file_icon_class = (ext) ->
    assoc = exports.file_options('x.' + ext)
    return assoc.icon

# This defines a bunch of custom modes and gets some info about special case of sagews
{sagews_decorator_modes} = require('./codemirror/custom-modes')

exports.file_options = require("./editor-tmp").file_options

# old "local storage" code was here, now moved to TS
editor_local_storage         = require('./editor-local-storage')
exports.local_storage_delete = editor_local_storage.local_storage_delete
exports.local_storage        = editor_local_storage.local_storage
local_storage                = exports.local_storage # used below

###############################################
# Abstract base class for editors (not exports.Editor)
###############################################
# Derived classes must:
#    (1) implement the _get and _set methods
#    (2) show/hide/remove
#
# Events ensure that *all* users editor the same file see the same
# thing (synchronized).
#

class FileEditor extends EventEmitter
    # ATTN it is crucial to call this constructor in subclasses via super(@project_id, @filename)
    constructor: (project_id, filename) ->
        super()
        @project_id = project_id
        @filename = filename
        @ext = misc.filename_extension_notilde(@filename)?.toLowerCase()
        @_show = underscore.debounce(@_show, 50)

    is_active: () =>
        misc.tab_to_path(redux.getProjectStore(@project_id).get('active_project_tab')) == @filename

    # call it, to set the @default_font_size from the account settings
    init_font_size: () =>
        @default_font_size = redux.getStore('account').get('font_size')

    val: (content) =>
        if not content?
            # If content not defined, returns current value.
            return @_get()
        else
            # If content is defined, sets value.
            @_set(content)

    # has_unsaved_changes() returns the state, where true means that
    # there are unsaved changed.  To set the state, do
    # has_unsaved_changes(true or false).
    has_unsaved_changes: (val) =>
        if not val?
            return @_has_unsaved_changes
        else
            if not @_has_unsaved_changes? or @_has_unsaved_changes != val
                if val
                    @save_button.removeClass('disabled')
                else
                    @_when_had_no_unsaved_changes = new Date()  # when we last knew for a fact there are no unsaved changes
                    @save_button.addClass('disabled')
            @_has_unsaved_changes = val

    # committed means "not saved to the database/server", whereas save above
    # means "saved to *disk*".
    has_uncommitted_changes: (val) =>
        if not val?
            return @_has_uncommitted_changes
        else
            @_has_uncommitted_changes = val
            if val
                if not @_show_uncommitted_warning_timeout?
                    # We have not already started a timer, so start one -- if we do not hear otherwise, show
                    # the warning in 30s.
                    @_show_uncommitted_warning_timeout = setTimeout((()=>@_show_uncommitted_warning()), 30000)
            else
                if @_show_uncommitted_warning_timeout?
                    clearTimeout(@_show_uncommitted_warning_timeout)
                    delete @_show_uncommitted_warning_timeout
                @uncommitted_element?.hide()

    _show_uncommitted_warning: () =>
        delete @_show_uncommitted_warning_timeout
        @uncommitted_element?.show()

    focus: () => # FUTURE in derived class (???)

    _get: () =>
        console.warn("Incomplete: editor -- needs to implement _get in derived class")

    _set: (content) =>
        console.warn("Incomplete: editor -- needs to implement _set in derived class")

    restore_cursor_position: () =>
        # implement in a derived class if you need this

    disconnect_from_session: (cb) =>
        # implement in a derived class if you need this

    local_storage: (key, value) =>
        return local_storage(@project_id, @filename, key, value)

    show: (opts) =>
        if not opts?
            if @_last_show_opts?
                opts = @_last_show_opts
            else
                opts = {}
        @_last_show_opts = opts

        # only re-render the editor if it is active. that's crucial, because e.g. the autosave
        # of latex triggers a build, which in turn calls @show to update itself. that would cause
        # the latex editor to be visible despite not being the active editor.
        if not @is_active?()
            return

        @element.show()
        # if above line reveals it, give it a bit time to do the layout first
        @_show(opts)  # critical -- also do an initial layout!  Otherwise get a horrible messed up animation effect.
        setTimeout((=> @_show(opts)), 10)
        if DEBUG
            window?.smc?.doc = @  # useful for debugging...

    _show: (opts={}) =>
        # define in derived class

    hide: () =>
        #@element?.hide()

    remove: () =>
        @syncdoc?.close()
        @element?.remove()
        @removeAllListeners()

    terminate_session: () =>
        # If some backend session on a remote machine is serving this session, terminate it.

exports.FileEditor = FileEditor

###############################################
# Codemirror-based File Editor

#     - 'saved' : when the file is successfully saved by the user
#     - 'show'  :
#     - 'toggle-split-view' :
###############################################
class CodeMirrorEditor extends FileEditor
    constructor: (project_id, filename, content, opts) ->
        super(project_id, filename)
        editor_settings = redux.getStore('account').get_editor_settings()
        opts = @opts = defaults opts,
            mode                      : undefined
            geometry                  : undefined  # (default=full screen);
            read_only                 : false
            delete_trailing_whitespace: editor_settings.strip_trailing_whitespace  # delete on save
            show_trailing_whitespace  : editor_settings.show_trailing_whitespace
            allow_javascript_eval     : true  # if false, the one use of eval isn't allowed.
            line_numbers              : editor_settings.line_numbers
            first_line_number         : editor_settings.first_line_number
            indent_unit               : editor_settings.indent_unit
            tab_size                  : editor_settings.tab_size
            smart_indent              : editor_settings.smart_indent
            electric_chars            : editor_settings.electric_chars
            undo_depth                : editor_settings.undo_depth   # no longer relevant, since done via sync system
            match_brackets            : editor_settings.match_brackets
            code_folding              : editor_settings.code_folding
            auto_close_brackets       : editor_settings.auto_close_brackets
            match_xml_tags            : editor_settings.match_xml_tags
            auto_close_xml_tags       : editor_settings.auto_close_xml_tags
            line_wrapping             : editor_settings.line_wrapping
            spaces_instead_of_tabs    : editor_settings.spaces_instead_of_tabs
            style_active_line         : 15    # editor_settings.style_active_line  # (a number between 0 and 127)
            bindings                  : editor_settings.bindings  # 'standard', 'vim', or 'emacs'
            theme                     : editor_settings.theme
            track_revisions           : editor_settings.track_revisions
            public_access             : false
            latex_editor              : false

            # I'm making the times below very small for now.  If we have to adjust these to reduce load, due to lack
            # of capacity, then we will.  Or, due to lack of optimization (e.g., for big documents). These parameters
            # below would break editing a huge file right now, due to slowness of applying a patch to a codemirror editor.

            cursor_interval           : 1000   # minimum time (in ms) between sending cursor position info to hub -- used in sync version
            sync_interval             : 500    # minimum time (in ms) between synchronizing text with hub. -- used in sync version below

            completions_size          : 20    # for tab completions (when applicable, e.g., for sage sessions)

        #console.log("mode =", opts.mode)

        @element = templates.find(".webapp-editor-codemirror").clone()

        @element.data('editor', @)

        @init_save_button()
        @init_uncommitted_element()
        @init_history_button()
        @init_edit_buttons()

        @init_file_actions()

        filename = @filename
        if filename.length > 30
            filename = "…" + filename.slice(filename.length-30)

        # not really needed due to highlighted tab; annoying.
        #@element.find(".webapp-editor-codemirror-filename").text(filename)

        @show_exec_warning = redux.getStore('account').getIn(['editor_settings', 'show_exec_warning']) ? true
        if @show_exec_warning and @ext in ['py', 'r', 'sage', 'f90']
            msg = "<strong>INFO:</strong> you can only run <code>*.#{@ext}</code> files in a terminal or create a worksheet/notebook. <a href='#'>Close</a>"
            msg_el = @element.find('.webapp-editor-codemirror-message')
            msg_el.html(msg)
            msg_el.find('a').click ->
                msg_el.hide()
                redux.getTable('account').set(editor_settings:{show_exec_warning:false})

        @_video_is_on = @local_storage("video_is_on")
        if not @_video_is_on?
            @_video_is_on = false

        extraKeys =
            "Alt-Enter"    : (editor)   => @action_key(execute: true, advance:false, split:false)
            "Cmd-Enter"    : (editor)   => @action_key(execute: true, advance:false, split:false)
            "Ctrl-Enter"   : (editor)   => @action_key(execute: true, advance:true, split:true)
            "Ctrl-;"       : (editor)   => @action_key(split:true, execute:false, advance:false)
            "Cmd-;"        : (editor)   => @action_key(split:true, execute:false, advance:false)
            "Ctrl-\\"      : (editor)   => @action_key(execute:false, toggle_input:true)
            #"Cmd-x"  : (editor)   => @action_key(execute:false, toggle_input:true)
            "Shift-Ctrl-\\" : (editor)   => @action_key(execute:false, toggle_output:true)
            #"Shift-Cmd-y"  : (editor)   => @action_key(execute:false, toggle_output:true)

            "Cmd-S"        : (editor)   => @click_save_button()
            "Alt-S"        : (editor)   => @click_save_button()

            "Ctrl-L"       : (editor)   => @goto_line(editor)
            "Cmd-L"        : (editor)   => @goto_line(editor)

            "Shift-Ctrl-I" : (editor)   => @toggle_split_view(editor)
            "Shift-Cmd-I"  : (editor)   => @toggle_split_view(editor)

            "Shift-Cmd-L"  : (editor)   => editor.align_assignments()
            "Shift-Ctrl-L" : (editor)   => editor.align_assignments()

            "Shift-Ctrl-." : (editor)   => @change_font_size(editor, +1)
            "Shift-Ctrl-," : (editor)   => @change_font_size(editor, -1)

            "Shift-Cmd-."  : (editor)   => @change_font_size(editor, +1)
            "Shift-Cmd-,"  : (editor)   => @change_font_size(editor, -1)

            "Shift-Tab"    : (editor)   => editor.unindent_selection()

            "Ctrl-'"       : "indentAuto"
            "Cmd-'"        : "indentAuto"

            "Cmd-/"        : "toggleComment"
            "Ctrl-/"       : "toggleComment"    # shortcut chosen by jupyter project (undocumented)

            "Tab"          : (editor)   => @press_tab_key(editor)
            "Shift-Ctrl-C" : (editor)   => @interrupt_key()

            "Ctrl-Space"   : "autocomplete"
            "Alt-Space": "autocomplete"

        if feature.IS_TOUCH
            # Better more external keyboard friendly shortcuts, motivated by iPad.
            extra_alt_keys(extraKeys, @, opts)

        if opts.match_xml_tags
            extraKeys['Ctrl-J'] = "toMatchingTag"

        if opts.bindings != 'emacs'
            # Emacs uses control s for find.
            extraKeys["Ctrl-S"] = (editor) => @click_save_button()

        # FUTURE: We will replace this by a general framework...
        if misc.filename_extension_notilde(filename).toLowerCase() == "sagews"
            evaluate_key = redux.getStore('account').get('evaluate_key').toLowerCase()
            if evaluate_key == "enter"
                evaluate_key = "Enter"
            else
                evaluate_key = "Shift-Enter"
            extraKeys[evaluate_key] = (editor) => @action_key(execute: true, advance:true, split:false)
        else
            extraKeys["Shift-Enter"] = =>
                alert_message
                    type    : "error"
                    message : "You can only evaluate code in a file that ends with the extension 'sagews' or 'ipynb'.   Create a Sage Worksheet or Jupyter notebook instead."

        # Layouts:
        #   0 - one single editor
        #   1 - two editors, one on top of the other
        #   2 - two editors, one next to the other

        if IS_MOBILE
            @_layout = 0
        else
            @_layout = @local_storage("layout") ? 0    # WARNING/UGLY: used by syncdoc.coffee and sagews.coffee !
        if @_layout not in [0, 1, 2]
            # IMPORTANT: If this were anything other than what is listed, the user
            # would never be able to open tex files. So it's important that this be valid.
            @_layout = 0
        @_last_layout = undefined

        if feature.isMobile.Android()
            # see https://github.com/sragemathinc/smc/issues/1360
            opts.style_active_line = false

        make_editor = (node) =>
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
                viewportMargin          : 300 # larger than the default of 10 specifically so *sage worksheets* (which are the only thing that uses this)
                                              # don't feel jumpy when re-rendering output.
                                              # NOTE that in cocalc right now, no remaining non-sagews editors use this code.

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
                #cursorBlinkRate: 1000

            if opts.theme? and opts.theme != "standard"
                options.theme = opts.theme

            cm = CodeMirror.fromTextArea(node, options)
            cm.save = () => @click_save_button()

            # The Codemirror themes impose their own weird fonts, but most users want whatever
            # they've configured as "monospace" in their browser.  So we force that back:
            e = $(cm.getWrapperElement())
            e.attr('style', e.attr('style') + '; height:100%; font-family:monospace !important;')
            # see http://stackoverflow.com/questions/2655925/apply-important-css-style-using-jquery

            if opts.bindings == 'vim'
                # annoying due to api change in vim mode
                cm.setOption("vimMode", true)

            return cm

        elt = @element.find(".webapp-editor-textarea-0"); elt.text(content)

        @codemirror = make_editor(elt[0])
        @codemirror.name = '0'
        #window.cm = @codemirror

        elt1 = @element.find(".webapp-editor-textarea-1")

        @codemirror1 = make_editor(elt1[0])
        @codemirror1.name = '1'

        buf = @codemirror.linkedDoc({sharedHist: true})
        @codemirror1.swapDoc(buf)

        @codemirror.on 'focus', () =>
            @codemirror_with_last_focus = @codemirror

        @codemirror1.on 'focus', () =>
            @codemirror_with_last_focus = @codemirror1

        if @opts.bindings == 'vim'
            @_vim_mode = 'visual'
            @codemirror.on 'vim-mode-change', (obj) =>
                if obj.mode == 'normal'
                    @_vim_mode = 'visual'
                    @element.find("a[href='#vim-mode-toggle']").text('esc')
                else
                    @_vim_mode = 'insert'
                    @element.find("a[href='#vim-mode-toggle']").text('i')

        if feature.IS_TOUCH
            # ugly hack so more usable on touch...
            @element.find(".webapp-editor-resize-bar-layout-1").height('12px')
            @element.find(".webapp-editor-resize-bar-layout-2").width('12px')

        @init_font_size() # get the @default_font_size
        @restore_font_size()

        @init_draggable_splits()

        if opts.read_only
            @set_readonly_ui()

        if misc.filename_extension(@filename)?.toLowerCase() == 'sagews'
            @init_sagews_edit_buttons()

        @snippets_dialog = null
        # Render all icons using React.
        @element.processIcons()

    programmatical_goto_line: (line) =>
        cm = @codemirror_with_last_focus
        return if not cm?
        pos = {line:line-1, ch:0}
        info = cm.getScrollInfo()
        cm.scrollIntoView(pos, info.clientHeight/2)

    get_users_cursors: (account_id) =>
        return @syncdoc?.get_users_cursors(account_id)

    init_file_actions: () =>
        if not @element?
            return
        dom_node = @element.find('.smc-editor-file-info-dropdown')[0]
        require('./editors/file-info-dropdown').render_file_info_dropdown(@filename, @project_id, dom_node, @opts.public_access)

    init_draggable_splits: () =>
        @_layout1_split_pos = @local_storage("layout1_split_pos")
        @_layout2_split_pos = @local_storage("layout2_split_pos")

        layout1_bar = @element.find(".webapp-editor-resize-bar-layout-1")
        layout1_bar.draggable
            axis        : 'y'
            containment : @element
            zIndex      : 10
            start       : drag_start_iframe_disable
            stop        : (event, ui) =>
                drag_stop_iframe_enable()
                # compute the position of bar as a number from 0 to 1, with
                # 0 being at top (left), 1 at bottom (right), and .5 right in the middle
                e   = @element.find(".webapp-editor-codemirror-input-container-layout-1")
                top = e.offset().top
                ht  = e.height()
                p   = layout1_bar.offset().top + layout1_bar.height()/2
                @_layout1_split_pos = (p - top) / ht
                @local_storage("layout1_split_pos", @_layout1_split_pos)
                # redraw, which uses split info
                @show()

        layout2_bar = @element.find(".webapp-editor-resize-bar-layout-2")
        layout2_bar.draggable
            axis        : 'x'
            containment : @element
            zIndex      : 100
            start       : drag_start_iframe_disable
            stop        : (event, ui) =>
                drag_stop_iframe_enable()
                # compute the position of bar as a number from 0 to 1, with
                # 0 being at top (left), 1 at bottom (right), and .5 right in the middle
                e     = @element.find(".webapp-editor-codemirror-input-container-layout-2")
                left  = e.offset().left
                width = e.width()
                p     = layout2_bar.offset().left
                @_layout2_split_pos = (p - left) / width
                @local_storage("layout2_split_pos", @_layout2_split_pos)
                # redraw, which uses split info
                @show()

    hide_content: () =>
        @element.find(".webapp-editor-codemirror-content").hide()

    show_content: () =>
        @hide_startup_message()
        @element.find(".webapp-editor-codemirror-content").show()
        for cm in @codemirrors()
            cm_refresh(cm)

    hide_startup_message: () =>
        @element.find(".webapp-editor-codemirror-startup-message").hide()

    show_startup_message: (mesg, type='info') =>
        @hide_content()
        if typeof(mesg) != 'string'
            mesg = JSON.stringify(mesg)
        e = @element.find(".webapp-editor-codemirror-startup-message").show().text(mesg)
        for t in ['success', 'info', 'warning', 'danger']
            e.removeClass("alert-#{t}")
        e.addClass("alert-#{type}")

    is_active: () =>
        return @codemirror? and misc.tab_to_path(redux.getProjectStore(@project_id).get('active_project_tab')) == @filename

    set_theme: (theme) =>
        # Change the editor theme after the editor has been created
        for cm in @codemirrors()
            cm.setOption('theme', theme)
        @opts.theme = theme

    # add something visual to the UI to suggest that the file is read only
    set_readonly_ui: (readonly=true) =>
        @opts.read_only = readonly
        @element.find(".webapp-editor-write-only").toggle(!readonly)
        @element.find(".webapp-editor-read-only").toggle(readonly)
        for cm in @codemirrors()
            cm.setOption('readOnly', readonly)

    set_cursor_center_focus: (pos, tries=5) =>
        if tries <= 0
            return
        cm = @codemirror_with_last_focus
        if not cm?
            cm = @codemirror
        if not cm?
            return
        cm.setCursor(pos)
        info = cm.getScrollInfo()
        try
            # This call can fail during editor initialization (as of codemirror 3.19, but not before).
            cm.scrollIntoView(pos, info.clientHeight/2)
        catch e
            setTimeout((() => @set_cursor_center_focus(pos, tries-1)), 250)
        cm.focus()

    disconnect_from_session: (cb) =>
        # implement in a derived class if you need this
        @syncdoc?.disconnect_from_session()
        cb?()

    codemirrors: () =>
        c = [@codemirror, @codemirror1]
        return underscore.filter(c, ((x) -> x?))

    focused_codemirror: () =>
        if @codemirror_with_last_focus?
            return @codemirror_with_last_focus
        else
            return @codemirror

    action_key: (opts) =>
        # opts ignored by default; worksheets use them....
        @click_save_button()

    interrupt_key: () =>
        # does nothing for generic editor, but important, e.g., for the sage worksheet editor.

    press_tab_key: (editor) =>
        if editor.somethingSelected()
            CodeMirror.commands.defaultTab(editor)
        else
            @tab_nothing_selected(editor)

    tab_nothing_selected: (editor) =>
        if @opts.spaces_instead_of_tabs
            editor.tab_as_space()
        else
            CodeMirror.commands.defaultTab(editor)

    init_edit_buttons: () =>
        that = @
        button_names = ['search', 'next', 'prev', 'replace', 'undo', 'redo', 'autoindent',
                        'shift-left', 'shift-right', 'split-view','increase-font', 'decrease-font', 'goto-line',
                        'copy', 'paste', 'vim-mode-toggle']

        if @opts.bindings != 'vim'
            @element.find("a[href='#vim-mode-toggle']").remove()

        # if the file extension indicates that we know how to print it, show and enable the print button
        if printing.can_print(@ext)
            button_names.push('print')
        else
            @element.find('a[href="#print"]').remove()

        # sagews2pdf conversion
        if @ext == 'sagews'
            button_names.push('sagews2pdf')
            button_names.push('sagews2ipynb')
        else
            @element.find('a[href="#sagews2pdf"]').remove()
            @element.find('a[href="#sagews2ipynb"]').remove()

        for name in button_names
            e = @element.find("a[href=\"##{name}\"]")
            e.data('name', name).tooltip(delay:{ show: 500, hide: 100 }).click (event) ->
                that.click_edit_button($(@).data('name'))
                return false

    click_edit_button: (name) =>
        cm = @codemirror_with_last_focus
        if not cm?
            cm = @codemirror
        if not cm?
            return
        switch name
            when 'search'
                CodeMirror.commands.find(cm)
            when 'next'
                if cm._searchState?.query
                    CodeMirror.commands.findNext(cm)
                else
                    CodeMirror.commands.goPageDown(cm)
                    cm.focus()
            when 'prev'
                if cm._searchState?.query
                    CodeMirror.commands.findPrev(cm)
                else
                    CodeMirror.commands.goPageUp(cm)
                    cm.focus()
            when 'replace'
                CodeMirror.commands.replace(cm)
            when 'undo'
                cm.undo()
                cm.focus()
            when 'redo'
                cm.redo()
                cm.focus()
            when 'split-view'
                @toggle_split_view(cm)
            when 'autoindent'
                CodeMirror.commands.indentAuto(cm)
            when 'shift-left'
                cm.unindent_selection()
                cm.focus()
            when 'shift-right'
                @press_tab_key(cm)
                cm.focus()
            when 'increase-font'
                @change_font_size(cm, +1)
                cm.focus()
            when 'decrease-font'
                @change_font_size(cm, -1)
                cm.focus()
            when 'goto-line'
                @goto_line(cm)
            when 'copy'
                @copy(cm)
                cm.focus()
            when 'paste'
                @paste(cm)
                cm.focus()
            when 'sagews2pdf'
                @print(sagews2html = false)
            when 'sagews2ipynb'
                @convert_to_ipynb()
            when 'print'
                @print(sagews2html = true)
            when 'vim-mode-toggle'
                if @_vim_mode == 'visual'
                    CodeMirror.Vim.handleKey(cm, 'i')
                else
                    CodeMirror.Vim.exitInsertMode(cm)
                cm.focus()

    restore_font_size: () =>
        # we set the font_size from local storage
        # or fall back to the default from the account settings
        for i, cm of @codemirrors()
            size = @local_storage("font_size#{i}")
            if size?
                @set_font_size(cm, size)
            else if @default_font_size?
                @set_font_size(cm, @default_font_size)

    get_font_size: (cm) ->
        if not cm?
            return
        elt = $(cm.getWrapperElement())
        return elt.data('font-size') ? @default_font_size

    set_font_size: (cm, size) =>
        if not cm?
            return
        if size > 1
            elt = $(cm.getWrapperElement())
            elt.css('font-size', size + 'px')
            elt.data('font-size', size)

    change_font_size: (cm, delta) =>
        if not cm?
            return
        #console.log("change_font_size #{cm.name}, #{delta}")
        scroll_before = cm.getScrollInfo()

        elt = $(cm.getWrapperElement())
        size = elt.data('font-size')
        if not size?
            s = elt.css('font-size')
            size = parseInt(s.slice(0,s.length-2))
        new_size = size + delta
        @set_font_size(cm, new_size)
        @local_storage("font_size#{cm.name}", new_size)

        # we have to do the scrollTo in the next render loop, since otherwise
        # the getScrollInfo function below will return the sizing data about
        # the cm instance before the above css font-size change has been rendered.
        f = () =>
            cm_refresh(cm)
            scroll_after = cm.getScrollInfo()
            x = (scroll_before.left / scroll_before.width) * scroll_after.width
            y = (((scroll_before.top+scroll_before.clientHeight/2) / scroll_before.height) * scroll_after.height) - scroll_after.clientHeight/2
            cm.scrollTo(x, y)
        setTimeout(f, 0)

    toggle_split_view: (cm) =>
        if not cm?
            return
        @_layout = (@_layout + 1) % 3
        @local_storage("layout", @_layout)
        @show()
        if cm? and not feature.IS_TOUCH
            if @_layout > 0
                cm.focus()
            else
                # focus first editor since it is only one that is visible.
                @codemirror.focus()
        f = () =>
            for x in @codemirrors()
                x.scrollIntoView()  # scroll the cursors back into view -- see https://github.com/sagemathinc/cocalc/issues/1044
        setTimeout(f, 1)   # wait until next loop after codemirror has laid itself out.
        @emit 'toggle-split-view'

    goto_line: (cm) =>
        if not cm?
            return
        focus = () =>
            @focus()
            cm.focus()
        dialog = templates.find(".webapp-goto-line-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            setTimeout(focus, 50)
            return false
        input = dialog.find(".webapp-goto-line-input")
        input.val(cm.getCursor().line+1)  # +1 since line is 0-based
        dialog.find(".webapp-goto-line-range").text("1-#{cm.lineCount()} or n%")
        dialog.find(".webapp-goto-line-input").focus().select()
        submit = () =>
            dialog.modal('hide')
            result = input.val().trim()
            if result.length >= 1 and result[result.length-1] == '%'
                line = Math.floor( cm.lineCount() * parseInt(result.slice(0,result.length-1)) / 100.0)
            else
                line = Math.min(parseInt(result)-1)
            if line >= cm.lineCount()
                line = cm.lineCount() - 1
            if line <= 0
                line = 0
            pos = {line:line, ch:0}
            cm.setCursor(pos)
            info = cm.getScrollInfo()
            cm.scrollIntoView(pos, info.clientHeight/2)
            setTimeout(focus, 50)
        dialog.find(".btn-submit").off('click').click(submit)
        input.keydown (evt) =>
            if evt.which == 13 # enter
                submit()
                return false
            if evt.which == 27 # escape
                setTimeout(focus, 50)
                dialog.modal('hide')
                return false

    copy: (cm) =>
        if not cm?
            return
        copypaste.set_buffer(cm.getSelection())

    convert_to_ipynb: () =>
        p = misc.path_split(@filename)
        v = p.tail.split('.')
        if v.length <= 1
            ext = ''
            base = p.tail
        else
            ext = v[v.length-1]
            base = v.slice(0,v.length-1).join('.')

        if ext != 'sagews'
            console.error("editor.print called on file with extension '#{ext}' but only supports 'sagews'.")
            return

        async.series([
            (cb) =>
                @save(cb)
            (cb) =>
                webapp_client.exec
                    project_id  : @project_id
                    command     : "cc-sagews2ipynb"
                    args        : [@filename]
                    err_on_exit : true
                    cb          : (err, output) =>
                        if err
                            alert_message(type:"error", message:"Error occured converting '#{@filename}' -- #{err}")
                        else
                            path = base + '.ipynb'
                            if p.head
                                path = p.head + '/' + path
                            redux.getProjectActions(@project_id).open_file
                                path               : path
                                foreground         : true
        ])

    cut: (cm) =>
        if not cm?
            return
        copypaste.set_buffer(cm.getSelection())
        cm.replaceSelection('')

    paste: (cm) =>
        if not cm?
            return
        cm.replaceSelection(copypaste.get_buffer())

    print: (sagews2html = true) =>
        switch @ext
            when 'sagews'
                if sagews2html
                    @print_html()
                else
                    @print_sagews()
            when 'txt', 'csv'
                print_button = @element.find('a[href="#print"]')
                print_button.icon_spin(start:true, delay:0).addClass("disabled")
                printing.Printer(@, @filename + '.pdf').print (err) ->
                    print_button.removeClass('disabled')
                    print_button.icon_spin(false)
                    if err
                        alert_message
                            type    : "error"
                            message : "Printing error -- #{err}"

    print_html: =>
        dialog     = null
        d_content  = null
        d_open     = null
        d_download = null
        d_progress = _.noop
        output_fn  = null # set this before showing the dialog

        show_dialog = (cb) =>
            # this creates the dialog element and defines the action functions like d_progress
            dialog = $("""
            <div class="modal" tabindex="-1" role="dialog">
              <div class="modal-dialog" role="document">
                <div class="modal-content">
                  <div class="modal-header">
                    <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
                    <h4 class="modal-title">Print to HTML</h4>
                  </div>
                  <div class="modal-body">
                    <div class="progress">
                      <div class="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;">
                        0 %
                      </div>
                    </div>
                    <div class="content" style="text-align: center;"></div>
                    <div style="margin-top: 25px;">
                      <p><b>More information</b></p>
                      <p>
                      This SageWS to HTML conversion transforms the current worksheet
                      to a static HTML file.
                      <br/>
                      <a href="https://github.com/sagemathinc/cocalc/wiki/sagews2html" target='_blank'>Click here for more information</a>.
                      </p>
                    </div>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn-download btn btn-primary disabled">Download</button>
                    <button type="button" class="btn-open btn btn-success disabled">Open</button>
                    <button type="button" class="btn-close btn btn-default" data-dismiss="modal">Close</button>
                  </div>
                </div>
              </div>
            </div>
            """)
            d_content  = dialog.find('.content')
            d_open     = dialog.find('.btn-open')
            d_download = dialog.find('.btn-download')
            action     = redux.getProjectActions(@project_id)
            d_progress = (p) ->
                pct = "#{Math.round(100 * p)}%"
                dialog.find(".progress-bar").css('width', pct).text(pct)
            dialog.find('.btn-close').click ->
                dialog.modal('hide')
                return false
            d_open.click =>
                action.download_file
                    path : output_fn
                    auto : false  # open in new tab
            d_download.click =>
                action.download_file
                    path : output_fn
                    auto : true
            dialog.modal('show')
            cb()

        convert = (cb) =>
            # initiates the actual conversion via printing.Printer ...
            switch @ext
                when 'sagews'
                    output_fn = @filename + '.html'
                    progress = (percent, mesg) =>
                        d_content.text(mesg)
                        d_progress(percent)
                    progress = _.debounce(progress, 5)
                    progress(.01, "Loading ...")
                    done = (err) =>
                        #console.log 'Printer.print_html is done: err = ', err
                        if err
                            progress(0, "Problem printing to HTML: #{err}")
                        else
                            progress(1, 'Printing finished.')
                            # enable open & download buttons
                            dialog.find('button.btn').removeClass('disabled')
                    printing.Printer(@, output_fn).print(done, progress)
                    cb(); return

            # fallback
            cb("err -- unable to convert files with extension '@ext'")

        async.series([show_dialog, convert], (err) =>
            if err
                msg = "problem printing -- #{misc.to_json(err)}"
                alert_message
                    type    : "error"
                    message : msg
                dialog.content.text(msg)
        )

    # WARNING: this "print" is actually for printing Sage worksheets, not arbitrary files.
    print_sagews: =>
        dialog = templates.find(".webapp-file-print-dialog").clone()
        dialog.processIcons()
        p = misc.path_split(@filename)
        v = p.tail.split('.')
        if v.length <= 1
            ext = ''
            base = p.tail
        else
            ext = v[v.length-1]
            base = v.slice(0,v.length-1).join('.')

        ext = ext.toLowerCase()
        if ext != 'sagews'
            console.error("editor.print called on file with extension '#{ext}' but only supports 'sagews'.")
            return

        submit = () =>
            dialog.find(".webapp-file-printing-progress").show()
            dialog.find(".webapp-file-printing-link").hide()
            $print_tempdir = dialog.find(".smc-file-printing-tempdir")
            $print_tempdir.hide()
            is_subdir = dialog.find(".webapp-file-print-keepfiles").is(":checked")
            dialog.find(".btn-submit").icon_spin(start:true)
            pdf = undefined
            async.series([
                (cb) =>
                    @save(cb)
                (cb) =>
                    # get info from the UI and attempt to convert the sagews to pdf
                    options =
                        title      : dialog.find(".webapp-file-print-title").text()
                        author     : dialog.find(".webapp-file-print-author").text()
                        date       : dialog.find(".webapp-file-print-date").text()
                        contents   : dialog.find(".webapp-file-print-contents").is(":checked")
                        subdir     : is_subdir
                        base_url   : require('./misc').BASE_URL  # really is a base url (not base path)
                        extra_data : misc.to_json(@syncdoc.print_to_pdf_data())  # avoid de/re-json'ing

                    printing.Printer(@, @filename + '.pdf').print
                        project_id  : @project_id
                        path        : @filename
                        options     : options
                        cb          : (err, _pdf) =>
                            if err and not is_subdir
                                cb(err)
                            else
                                pdf = _pdf
                                cb()
                (cb) =>
                    file_nonzero_size_cb(@project_id, pdf, cb)
                (cb) =>
                    if is_subdir or not pdf?
                        cb(); return
                    # pdf file exists -- show it in the UI
                    url = webapp_client.project_client.read_file
                        project_id  : @project_id
                        path        : pdf
                    dialog.find(".webapp-file-printing-link").attr('href', url).text(pdf).show()
                    cb()
                (cb) =>
                    if not is_subdir
                        cb(); return
                    {join} = require('path')
                    subdir_texfile = join(p.head, "#{base}-sagews2pdf", "tmp.tex")
                    # check if generated tmp.tex exists and has nonzero size
                    file_nonzero_size_cb @project_id, subdir_texfile, (err) =>
                        if err
                            cb("Unable to create directory of temporary Latex files. -- #{err}")
                            return
                        tempdir_link = $('<a>').text('Click to open temporary file')
                        tempdir_link.click =>
                            redux.getProjectActions(@project_id).open_file
                                path       : subdir_texfile
                                foreground : true
                            dialog.modal('hide')
                            return false
                        $print_tempdir.html(tempdir_link)
                        $print_tempdir.show()
                        cb()
                (cb) =>
                    # if there is no subdirectory of temporary files, print generated pdf file
                    if not is_subdir
                        redux.getProjectActions(@project_id).print_file(path: pdf)
                    cb()
            ], (err) =>
                dialog.find(".btn-submit").icon_spin(false)
                dialog.find(".webapp-file-printing-progress").hide()
                if err
                    alert_message(type:"error", message:"problem printing '#{p.tail}' -- #{misc.to_json(err)}")
            )
            return false

        dialog.find(".webapp-file-print-filename").text(@filename)
        dialog.find(".webapp-file-print-title").text(base)
        dialog.find(".webapp-file-print-author").text(redux.getStore('account').get_fullname())
        dialog.find(".webapp-file-print-date").text((new Date()).toLocaleDateString())
        dialog.find(".btn-submit").click(submit)
        dialog.find(".btn-close").click(() -> dialog.modal('hide'); return false)
        if ext == "sagews"
            dialog.find(".webapp-file-options-sagews").show()
        dialog.modal('show')

    init_save_button: () =>
        @save_button = @element.find("a[href=\"#save\"]").tooltip().click(@click_save_button)
        @save_button.find(".spinner").hide()

    init_uncommitted_element: () =>
        @uncommitted_element = @element.find(".smc-uncommitted")

    init_history_button: () =>
        if not @opts.public_access and @filename.slice(@filename.length-13) != '.sage-history'
            @history_button = @element.find(".webapp-editor-history-button")
            @history_button.click(@click_history_button)
            @history_button.show()
            @history_button.css
                display: 'inline-block'   # this is needed due to subtleties of jQuery show().

    click_save_button: () =>
        if @opts.read_only
            return
        if not @save?  # not implemented...
            return
        if @_saving
            return
        @_saving = true
        @syncdoc?.delete_trailing_whitespace?()  # only delete trailing whitespace on explicit save -- never on AUTOSAVE.
        @save_button.icon_spin(start:true, delay:8000)
        @save (err) =>
            # WARNING: As far as I can tell, this doesn't call FileEditor.save
            if err
                if redux.getProjectStore(@project_id).is_file_open(@filename)  # only show error if file actually opened
                    alert_message(type:"error", message:"Error saving '#{@filename}' (#{err}) -- (you might need to close and open this file or restart this project)")
            else
                @emit('saved')
            @save_button.icon_spin(false)
            @_saving = false
        return false

    click_history_button: () =>
        redux.getProjectActions(@project_id).open_file
            path       : misc.history_path(@filename)
            foreground : true

    _get: () =>
        return @codemirror?.getValue()

    _set: (content) =>
        if not @codemirror?
            # document is already closed and freed up.
            return
        {from} = @codemirror.getViewport()
        @codemirror.setValue(content)
        @codemirror.scrollIntoView(from)
        # even better -- fully restore cursors, if available in localStorage
        setTimeout((()=>@restore_cursor_position()),1)  # do in next round, so that both editors get set by codemirror first (including the linked one)

    # save/restore view state -- hooks used by React editor wrapper.
    save_view_state: =>
        state =
            scroll : (cm.getScrollInfo() for cm in @codemirrors())
        @_view_state = state
        return state

    restore_view_state: (second_try) =>
        state = @_view_state
        if not state?
            return
        cms = @codemirrors()
        i = 0
        for v in state.scroll
            cm = cms[i]
            if cm?
                cm.scrollTo(v.left, v.top)
                info = cm.getScrollInfo()
                # THIS IS HORRIBLE and SUCKS, but I can't understand what is going on sufficiently
                # well to remove this.  Sometimes scrollTo fails (due to the document being reported as much
                # smaller than it is for a few ms) **and** it's then not possible to scroll,
                # so we just try again. See https://github.com/sagemathinc/cocalc/issues/1327
                if not second_try and info.top != v.top
                    # didn't work -- not fully visible; try again one time when rendering is presumably done.
                    setTimeout((=>@restore_view_state(true)), 250)
            i += 1

    restore_cursor_position: () =>
        for i, cm of @codemirrors()
            if cm?
                pos = @local_storage("cursor#{cm.name}")
                if pos?
                    cm.setCursor(pos)
                    #console.log("#{@filename}: setting view #{cm.name} to cursor pos -- #{misc.to_json(pos)}")
                    info = cm.getScrollInfo()
                    try
                        cm.scrollIntoView(pos, info.clientHeight/2)
                    catch e
                        #console.log("#{@filename}: failed to scroll view #{cm.name} into view -- #{e}")
        @codemirror?.focus()

    # set background color of active line in editor based on background color (which depends on the theme)
    _style_active_line: () =>
        if not @opts.style_active_line
            return
        rgb = $(@codemirror.getWrapperElement()).css('background-color')
        v = (parseInt(x) for x in rgb.slice(4,rgb.length-1).split(','))
        amount = @opts.style_active_line
        for i in [0..2]
            if v[i] >= 128
                v[i] -= amount
            else
                v[i] += amount
        $("body").remove("#webapp-cm-activeline")
        $("body").append("<style id='webapp-cm-activeline' type=text/css>.CodeMirror-activeline{background:rgb(#{v[0]},#{v[1]},#{v[2]});}</style>")   # this is a memory leak!

    _show_codemirror_editors: (height) =>
        # console.log("_show_codemirror_editors: #{@_layout}")
        if not @codemirror?
            # already closed so can't show (in syncdoc, .codemirorr is deleted on close)
            return
        switch @_layout
            when 0
                p = 1
            when 1
                p = @_layout1_split_pos ? 0.5
            when 2
                p = @_layout2_split_pos ? 0.5

        # Change the height of the *top* div that contain the editors; the bottom one then
        # uses of all remaining vertical height.
        if @_layout > 0
            p = Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, p))

        # We set only the default size of the *first* div -- everything else expands accordingly.
        elt = @element.find(".webapp-editor-codemirror-input-container-layout-#{@_layout}").show()

        if @_layout == 1
            @element.find(".webapp-editor-resize-bar-layout-1").css(top:0)
        else if @_layout == 2
            @element.find(".webapp-editor-resize-bar-layout-2").css(left:0)

        c = elt.find(".webapp-editor-codemirror-input-box")
        if @_layout == 0
            c.css('flex', 1)   # use the full vertical height
        else
            c.css('flex-basis', "#{p*100}%")

        if @_last_layout != @_layout
            # The layout has changed
            btn = @element.find('a[href="#split-view"]')

            if @_last_layout?
                # Hide previous
                btn.find(".webapp-editor-layout-#{@_last_layout}").hide()
                @element.find(".webapp-editor-codemirror-input-container-layout-#{@_last_layout}").hide()

            # Show current
            btn.find(".webapp-editor-layout-#{@_layout}").show()

            # Put editors in their place -- in the div inside of each box
            elt.find(".webapp-editor-codemirror-input-box div").empty().append($(@codemirror.getWrapperElement()))
            elt.find(".webapp-editor-codemirror-input-box-1 div").empty().append($(@codemirror1.getWrapperElement()))

            # Save for next time
            @_last_layout = @_layout

        # Workaround a major and annoying bug in Safari:
        #     https://github.com/philipwalton/flexbugs/issues/132
        if $.browser.safari and @_layout == 1
            # This is only needed for the "split via a horizontal line" layout, since
            # the flex layout with column direction is broken on Safari.
            @element.find(".webapp-editor-codemirror-input-container-layout-#{@_layout}").make_height_defined()

        refresh = (cm) =>
            return if not cm?
            cm_refresh(cm)
            # See https://github.com/sagemathinc/cocalc/issues/1327#issuecomment-265488872
            setTimeout((=>cm_refresh(cm)), 1)

        for cm in @codemirrors()
            refresh(cm)

        @emit('show')

    _show: (opts={}) =>
        # show the element that contains this editor
        #@element.show()
        # show the codemirror editors, resizing as needed
        @_show_codemirror_editors()

    focus: () =>
        if not @codemirror?
            return
        @show()
        if not (IS_MOBILE or feature.IS_TOUCH)
            @codemirror_with_last_focus?.focus()

    ############
    # Editor button bar support code
    ############
    textedit_command: (cm, cmd, args) =>
        # ATTN when adding more cases, also edit textedit_only_show_known_buttons
        switch cmd
            when "link"
                cm.insert_link(cb:() => @syncdoc?.sync())
                return false  # don't return true or get an infinite recurse
            when "image"
                cm.insert_image(cb:() => @syncdoc?.sync())
                return false  # don't return true or get an infinite recurse
            when "SpecialChar"
                cm.insert_special_char(cb:() => @syncdoc?.sync())
                return false  # don't return true or get an infinite recurse
            else
                cm.edit_selection
                    cmd  : cmd
                    args : args
                @syncdoc?.sync()
                # needed so that dropdown menu closes when clicked.
                return true

    snippets_dialog_handler: () =>
        # @snippets_dialog is an ExampleActions object, unique for each editor instance
        lang = @_current_mode
        # special case sh → bash
        if lang == 'sh' then lang = 'bash'

        if not @snippets_dialog?
            $target = @mode_display.parent().find('.react-target')
            @snippets_dialog = render_snippets_dialog(
                target     : $target[0]
                project_id : @project_id
                path       : @filename
                lang       : lang
            )
        else
            @snippets_dialog.show(lang)
        @snippets_dialog.set_handler(@example_insert_handler)

    example_insert_handler: (insert) =>
        # insert : {lang: string, descr: string, code: string[]}
        {code, lang} = insert
        cm = @focused_codemirror()
        line = cm.getCursor().line
        # ATTN: to make this work properly, code and descr need to have a newline at the end (stripped by default)
        if insert.descr?
            @syncdoc?.insert_new_cell(line)
            # insert a "hidden" markdown cell and evaluate it
            cm.replaceRange("%md(hide=True)\n#{insert.descr}\n", {line : line+1, ch:0})
            @action_key(execute: true, advance:false, split:false)

        # inserting one or more code cells
        for c in code
            line = cm.getCursor().line
            # next, we insert the code cell and prefix it with a mode change,
            # iff the mode is different from the current one
            @syncdoc?.insert_new_cell(line)
            cell = "#{c}\n"
            if lang != @_current_mode
                # special case: %sh for bash language
                if lang == 'bash' then lang = 'sh'
                cell = "%#{lang}\n#{cell}"
            cm.replaceRange(cell, {line : line+1, ch:0})
            # and we evaluate and sync all this, too…
            @action_key(execute: true, advance:false, split:false)
        @syncdoc?.sync()

    # add a textedit toolbar to the editor
    init_sagews_edit_buttons: () =>
        if @opts.read_only  # no editing button bar needed for read-only files
            return

        if IS_MOBILE  # no edit button bar on mobile either -- too big (for now at least)
            return

        if not redux.getStore('account').get_editor_settings().extra_button_bar
            # explicitly disabled by user
            return

        NAME_TO_MODE = {xml:'html', markdown:'md', mediawiki:'wiki'}
        for x in sagews_decorator_modes
            mode = x[0]
            name = x[1]
            v = name.split('-')
            if v.length > 1
                name = v[1]
            NAME_TO_MODE[name] = "#{mode}"

        name_to_mode = (name) ->
            n = NAME_TO_MODE[name]
            if n?
                return n
            else
                return "#{name}"

        # add the text editing button bar
        e = @element.find(".webapp-editor-codemirror-textedit-buttons")
        @textedit_buttons = templates.find(".webapp-editor-textedit-buttonbar").clone().hide()
        e.append(@textedit_buttons).show()

        # add the code editing button bar
        @codeedit_buttons = templates.find(".webapp-editor-codeedit-buttonbar").clone()
        e.append(@codeedit_buttons)

        # the r-editing button bar
        @redit_buttons =  templates.find(".webapp-editor-redit-buttonbar").clone()
        e.append(@redit_buttons)

        # the Julia-editing button bar
        @julia_edit_buttons =  templates.find(".webapp-editor-julia-edit-buttonbar").clone()
        e.append(@julia_edit_buttons)

        # the sh-editing button bar
        @sh_edit_buttons =  templates.find(".webapp-editor-sh-edit-buttonbar").clone()
        e.append(@sh_edit_buttons)

        @cython_buttons =  templates.find(".webapp-editor-cython-buttonbar").clone()
        e.append(@cython_buttons)

        @fallback_buttons = templates.find(".webapp-editor-fallback-edit-buttonbar").clone()
        e.append(@fallback_buttons)

        all_edit_buttons = [@textedit_buttons, @codeedit_buttons, @redit_buttons,
                            @cython_buttons, @julia_edit_buttons, @sh_edit_buttons, @fallback_buttons]

        # activite the buttons in the bar
        that = @
        edit_button_click = (e) ->
            e.preventDefault()
            args = $(this).data('args')
            cmd  = $(this).attr('href').slice(1)
            if cmd == 'todo'
                return
            if args? and typeof(args) != 'object'
                args = "#{args}"
                if args.indexOf(',') != -1
                    args = args.split(',')
            return that.textedit_command(that.focused_codemirror(), cmd, args)

        # FUTURE: activate color editing buttons -- for now just hide them
        @element.find(".sagews-output-editor-foreground-color-selector").hide()
        @element.find(".sagews-output-editor-background-color-selector").hide()

        @fallback_buttons.find('a[href="#todo"]').click () =>
            bootbox.alert("<i class='fa fa-wrench' style='font-size: 18pt;margin-right: 1em;'></i> Button bar not yet implemented in <code>#{mode_display.text()}</code> cells.")
            return false

        for edit_buttons in all_edit_buttons
            edit_buttons.find("a").click(edit_button_click)
            edit_buttons.find("*[title]").tooltip(TOOLTIP_DELAY)

        @mode_display = mode_display = @element.find(".webapp-editor-codeedit-buttonbar-mode")
        @_current_mode = "sage"
        @mode_display.show()

        # not all textedit buttons are known
        textedit_only_show_known_buttons = (name) =>
            EDIT_COMMANDS = require('./editors/editor-button-bar').commands
            default_mode = @focused_codemirror()?.get_edit_mode() ? 'sage'
            mode = sagews_canonical_mode(name, default_mode)
            #if DEBUG then console.log "textedit_only_show_known_buttons: mode #{name} → #{mode}"
            known_commands = misc.keys(EDIT_COMMANDS[mode] ? {})
            # see special cases in 'textedit_command' and codemirror/extensions: 'edit_selection'
            known_commands = known_commands.concat(['link', 'image', 'SpecialChar', 'font_size'])
            for button in @textedit_buttons.find('a')
                button = $(button)
                cmd = button.attr('href').slice(1)
                # in theory, this should also be done for html&md, but there are many more special cases
                # therefore we just make sure they're all activated again
                button.toggle((mode != 'tex') or (cmd in known_commands))

        set_mode_display = (name) =>
            #console.log("set_mode_display: #{name}")
            if name?
                mode = name_to_mode(name)
            else
                mode = ""
            mode_display.text("%" + mode)
            @_current_mode = mode

        show_edit_buttons = (which_one, name) =>
            for edit_buttons in all_edit_buttons
                edit_buttons.toggle(edit_buttons == which_one)
            if which_one == @textedit_buttons
                textedit_only_show_known_buttons(name)
            set_mode_display(name)

        # show the assistant button to reveal the dialog for example selection
        @element.find('.webapp-editor-codeedit-buttonbar-assistant').show()
        assistant_button = @element.find('a[href="#assistant"]')
        assistant_button.click(@snippets_dialog_handler)

        # The code below changes the bar at the top depending on where the cursor
        # is located.  We only change the edit bar if the cursor hasn't moved for
        # a while, to be more efficient, avoid noise, and be less annoying to the user.
        # Replaced by http://underscorejs.org/#debounce
        #bar_timeout = undefined
        #f = () =>
        #    if bar_timeout?
        #        clearTimeout(bar_timeout)
        #    bar_timeout = setTimeout(update_context_sensitive_bar, 250)

        update_context_sensitive_bar = () =>
            cm = @focused_codemirror()
            if not cm?
                return
            pos = cm.getCursor()
            name = cm.getModeAt(pos).name
            #console.log("update_context_sensitive_bar, pos=#{misc.to_json(pos)}, name=#{name}")
            if name in ['xml', 'stex', 'markdown', 'mediawiki']
                show_edit_buttons(@textedit_buttons, name)
            else if name == "r"
                show_edit_buttons(@redit_buttons, name)
            else if name == "julia"
                show_edit_buttons(@julia_edit_buttons, name)
            else if name == "cython"  # doesn't work yet, since name=python still
                show_edit_buttons(@cython_buttons, name)
            else if name == "python"  # doesn't work yet, since name=python still
                show_edit_buttons(@codeedit_buttons, "sage")
            else if name == "shell"
                show_edit_buttons(@sh_edit_buttons, name)
            else
                show_edit_buttons(@fallback_buttons, name)

        for cm in @codemirrors()
            cm.on('cursorActivity', _.debounce(update_context_sensitive_bar, 250))

        update_context_sensitive_bar()
        @element.find(".webapp-editor-codemirror-textedit-buttons").mathjax()


exports.codemirror_editor = (project_id, filename, extra_opts) ->
    return new CodeMirrorEditor(project_id, filename, "", extra_opts)

codemirror_session_editor = exports.codemirror_session_editor = (project_id, filename, extra_opts) ->
    #console.log("codemirror_session_editor '#{filename}'")
    ext = filename_extension_notilde(filename).toLowerCase()

    E = new CodeMirrorEditor(project_id, filename, "", extra_opts)
    # Enhance the editor with synchronized session capabilities.
    opts =
        cursor_interval : E.opts.cursor_interval
        sync_interval   : E.opts.sync_interval

    switch ext
        when "sagews"
            # temporary.
            opts =
                cursor_interval : 2000
                sync_interval   : 250
            E.syncdoc = new (sagews.SynchronizedWorksheet)(E, opts)
            E.action_key = E.syncdoc.action
            E.interrupt_key = E.syncdoc.interrupt
            E.tab_nothing_selected = () => E.syncdoc.introspect()
        when "sage-history"
            # no syncdoc
        else
            E.syncdoc = new (syncdoc.SynchronizedDocument2)(E, opts)

    E.save = E.syncdoc?.save
    return E

class Terminal extends FileEditor
    constructor: (project_id, filename, content, opts) ->
        super(project_id, filename)
        @element = $("<div>").hide()
        elt = @element.webapp_console
            title      : "Terminal"
            filename   : @filename
            project_id : @project_id
            path       : @filename
            editor     : @
        @console = elt.data("console")
        @console.is_hidden = true
        @element = @console.element
        @console.blur()

    _get: =>  # FUTURE ??
        return @opts.session_uuid ? ''

    _set: (content) =>  # FUTURE ??

    save: =>
        # DO nothing -- a no-op for now
        # FUTURE: Add notion of history
        cb?()

    focus: =>
        @console?.is_hidden = false
        @console?.focus()

    blur: =>
        @console?.is_hidden = false
        @console?.blur()

    terminate_session: () =>

    remove: =>
        @element.webapp_console(false)
        super()

    hide: =>
        @console?.is_hidden = true
        @console?.blur()

    _show: () =>
        @console?.is_hidden = false
        @console?.resize_terminal()



class FileEditorWrapper extends FileEditor
    constructor: (project_id, filename, content, opts) ->
        super(project_id, filename)
        @content = content
        @opts = opts
        @init_wrapped(@project_id, @filename, @content, @opts)

    init_wrapped: () =>
        # Define @element and @wrapped in derived class
        throw Error('must define in derived class')

    save: (cb) =>
        if @wrapped?.save?
            @wrapped.save(cb)
        else
            cb?()

    has_unsaved_changes: (val) =>
        return @wrapped?.has_unsaved_changes?(val)

    has_uncommitted_changes: (val) =>
        return @wrapped?.has_uncommitted_changes?(val)

    _get: () =>
        # FUTURE
        return 'history saving not yet implemented'

    _set: (content) =>
        # FUTURE ???

    focus: () =>

    terminate_session: () =>

    disconnect_from_session: () =>
        @wrapped?.destroy?()

    remove: () =>
        super()
        @wrapped?.destroy?()
        delete @filename; delete @content; delete @opts

    show: () =>
        if not @is_active()
            return
        if not @element?
            return
        @element.show()

        if IS_MOBILE
            @element.css(position:'relative')

        @wrapped?.show?()

    hide: () =>
        @element?.hide()
        @wrapped?.hide?()


###
# Jupyter notebook
###
jupyter = require('./editor_jupyter')

class JupyterNotebook extends FileEditorWrapper
    init_wrapped: () =>
        @element = $("<div><span>&nbsp;&nbsp;Loading...</span></div>")
        require.ensure [], =>
            @init_font_size() # get the @default_font_size
            # console.log("JupyterNotebook@default_font_size: #{@default_font_size}")
            @opts.default_font_size = @default_font_size
            @element = jupyter.jupyter_notebook(@, @filename, @opts)
            @wrapped = @element.data('jupyter_notebook')

    mount: () =>
        if not @mounted
            $(document.body).append(@element)
            @mounted = true
        return @mounted

class JupyterNBViewer extends FileEditorWrapper
    init_wrapped: () ->
        @element = jupyter.jupyter_nbviewer(@project_id, @filename, @content, @opts)
        @wrapped = @element.data('jupyter_nbviewer')

class JupyterNBViewerEmbedded extends FileEditor
    # this is like JupyterNBViewer but https://nbviewer.jupyter.org in an iframe
    # it's only used for public files and when not part of the project or anonymous
    constructor: (project_id, filename, content, opts) ->
        super(project_id, filename)
        @content = content
        @element = $(".smc-jupyter-templates .smc-jupyter-nbviewer").clone()
        @init_buttons()

    init_buttons: () =>
        # code duplication from editor_jupyter/JupyterNBViewer
        @element.find('a[href="#copy"]').click () =>
            actions = redux.getProjectActions(@project_id)
            actions.load_target('files')
            actions.set_all_files_unchecked()
            actions.set_file_checked(@filename, true)
            actions.set_file_action('copy')
            return false

        @element.find('a[href="#download"]').click () =>
            actions = redux.getProjectActions(@project_id)
            actions.load_target('files')
            actions.set_all_files_unchecked()
            actions.set_file_checked(@filename, true)
            actions.set_file_action('download')
            return false

    show: () =>
        if not @is_active()
            return
        if not @iframe?
            @iframe = @element.find(".smc-jupyter-nbviewer-content").find('iframe')
            {join} = require('path')
            ipynb_src = join(window.location.hostname,
                             appBasePath,
                             @project_id,
                             'raw',
                             @filename)
            # for testing, set it to a src like this: (smc-in-smc doesn't work for published files, since it
            # still requires the user to be logged in with access to the host project)
            #ipynb_src = 'cocalc.com/14eed217-2d3c-4975-a381-b69edcb40e0e/raw/scratch/1_notmnist.ipynb'
            @iframe.attr('src', "//nbviewer.jupyter.org/urls/#{ipynb_src}")
        @element.show()

exports.register_nonreact_editors = ->

    # Make non-react editors available in react rewrite
    reg = require('./editors/react-wrapper').register_nonreact_editor

    # wrapper for registering private and public editors
    exports.register = register = (is_public, cls, extensions) ->
        icon = file_icon_class(extensions[0])
        reg
            ext       : extensions
            is_public : is_public
            icon      : icon
            f         : (project_id, path, opts) ->
                e = new cls(project_id, path, undefined, opts)
                if not e.ext?
                    console.error('You have to call super(@project_id, @filename) in the constructor to properly initialize this FileEditor instance.')
                return e

    if feature.IS_TOUCH
        register(false, Terminal, ['term', 'sage-term'])

    exports.switch_to_ipynb_classic = ->
        register(false, JupyterNotebook,  ['ipynb'])

    # Editing Sage worksheets
    reg
        ext       : 'sagews'
        f         : (project_id, path, opts) -> codemirror_session_editor(project_id, path, opts)
        is_public : false



# See https://github.com/sagemathinc/cocalc/issues/3538
cm_refresh = (cm) ->
    if not cm?
        return
    try
        cm.refresh()
    catch err
        console.warn("cm refresh err", err)

