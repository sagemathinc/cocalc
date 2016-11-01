###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014--2016, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

$ = window.$

# Editor files in a project
# Show button labels if there are at most this many file tabs opened.
# This is in exports so that an elite user could customize this by doing, e.g.,
#    require('./editor').SHOW_BUTTON_LABELS=0
exports.SHOW_BUTTON_LABELS = 4

exports.MIN_SPLIT = MIN_SPLIT = 0.02
exports.MAX_SPLIT = MAX_SPLIT = 0.98  # maximum pane split proportion for editing

TOOLTIP_DELAY = delay: {show: 500, hide: 100}

async = require('async')

message = require('smc-util/message')

{redux} = require('./smc-react')

profile = require('./profile')

_ = underscore = require('underscore')

{salvus_client} = require('./salvus_client')
{EventEmitter}  = require('events')
{alert_message} = require('./alerts')

feature = require('./feature')
IS_MOBILE = feature.IS_MOBILE

misc = require('smc-util/misc')
misc_page = require('./misc_page')

# Ensure CodeMirror is available and configured
require('./codemirror/codemirror')
require('./codemirror/multiplex')

# Ensure the console jquery plugin is available
require('./console')

# SMELL: undo doing the import below -- just use misc.[stuff] is more readable.
{copy, trunc, from_json, to_json, keys, defaults, required, filename_extension, filename_extension_notilde,
 len, path_split, uuid} = require('smc-util/misc')

syncdoc = require('./syncdoc')
sagews  = require('./sagews')

codemirror_associations =
    c      : 'text/x-c'
    'c++'  : 'text/x-c++src'
    cql    : 'text/x-sql'
    cpp    : 'text/x-c++src'
    cc     : 'text/x-c++src'
    tcc    : 'text/x-c++src'
    conf   : 'nginx'   # should really have a list of different types that end in .conf and autodetect based on heuristics, letting user change.
    csharp : 'text/x-csharp'
    'c#'   : 'text/x-csharp'
    clj    : 'text/x-clojure'
    cljs   : 'text/x-clojure'
    cljc   : 'text/x-clojure'
    edn    : 'text/x-clojure'
    elm    : 'text/x-elm'
    cjsx   : 'text/cjsx'
    coffee : 'coffeescript'
    css    : 'css'
    diff   : 'text/x-diff'
    dtd    : 'application/xml-dtd'
    e      : 'text/x-eiffel'
    ecl    : 'ecl'
    f      : 'text/x-fortran'    # https://github.com/mgaitan/CodeMirror/tree/be73b866e7381da6336b258f4aa75fb455623338/mode/fortran
    f90    : 'text/x-fortran'
    f95    : 'text/x-fortran'
    h      : 'text/x-c++hdr'
    hpp    : 'text/x-c++hdr'
    hs     : 'text/x-haskell'
    lhs    : 'text/x-haskell'
    html   : 'htmlmixed'
    jade   : 'text/x-jade'
    java   : 'text/x-java'
    jl     : 'text/x-julia'
    js     : 'javascript'
    json   : 'javascript'
    lua    : 'lua'
    m      : 'text/x-octave'
    md     : 'gfm2'
    ml     : 'text/x-ocaml'
    mysql  : 'text/x-sql'
    patch  : 'text/x-diff'
    gp     : 'text/pari'
    go     : 'text/x-go'
    pari   : 'text/pari'
    php    : 'php'
    pl     : 'text/x-perl'
    pug    : 'text/x-jade'
    py     : 'python'
    pyx    : 'python'
    r      : 'r'
    rmd    : 'gfm2'
    rst    : 'rst'
    rb     : 'text/x-ruby'
    ru     : 'text/x-ruby'
    sage   : 'python'
    sagews : 'sagews'
    scala  : 'text/x-scala'
    scm    : 'text/x-scheme'
    sh     : 'shell'
    spyx   : 'python'
    sql    : 'text/x-sql'
    ss     : 'text/x-scheme'
    sty    : 'stex2'
    txt    : 'text'
    tex    : 'stex2'
    ts     : 'application/typescript'
    toml   : 'text/x-toml'
    bib    : 'stex'
    bbl    : 'stex'
    xml    : 'xml'
    xsl    : 'xsl'
    yaml   : 'yaml'
    ''     : 'text'

file_associations = exports.file_associations = {}
for ext, mode of codemirror_associations
    name = mode
    i = name.indexOf('x-')
    if i != -1
        name = name.slice(i+2)
    name = name.replace('src','')
    file_associations[ext] =
        editor : 'codemirror'
        binary : false
        icon   : 'fa-file-code-o'
        opts   : {mode:mode}
        name   : name

# noext = means file with no extension but the given name.
file_associations['noext-Dockerfile'] =
    editor : 'codemirror'
    binary : false
    icon   : 'fa-ship'
    opts   : {mode:'dockerfile', indent_unit:2, tab_size:2}
    name   : 'Dockerfile'

file_associations['tex'] =
    editor : 'latex'
    icon   : 'fa-file-excel-o'
    opts   : {mode:'stex2', indent_unit:4, tab_size:4}
    name   : "LaTeX"
#file_associations['tex'] =  # WARNING: only for TESTING!!!
#    editor : 'html-md'
#    icon   : 'fa-file-code-o'
#    opts   : {indent_unit:4, tab_size:4, mode:'stex2'}


file_associations['html'] =
    editor : 'html-md'
    icon   : 'fa-file-code-o'
    opts   : {indent_unit:4, tab_size:4, mode:'htmlmixed'}
    name   : "html"

file_associations['md'] =
    editor : 'html-md'
    icon   : 'fa-file-code-o'
    opts   : {indent_unit:4, tab_size:4, mode:'gfm2'}
    name   : "markdown"

file_associations['rst'] =
    editor : 'html-md'
    icon   : 'fa-file-code-o'
    opts   : {indent_unit:4, tab_size:4, mode:'rst'}
    name   : "ReST"

file_associations['mediawiki'] = file_associations['wiki'] =
    editor : 'html-md'
    icon   : 'fa-file-code-o'
    opts   : {indent_unit:4, tab_size:4, mode:'mediawiki'}
    name   : "MediaWiki"

file_associations['sass'] =
    editor : 'codemirror'
    icon   : 'fa-file-code-o'
    opts   : {mode:'text/x-sass', indent_unit:2, tab_size:2}
    name   : "SASS"

file_associations['css'] =
    editor : 'codemirror'
    icon   : 'fa-file-code-o'
    opts   : {mode:'css', indent_unit:4, tab_size:4}
    name   : "CSS"

file_associations['term'] =
    editor : 'terminal'
    icon   : 'fa-terminal'
    opts   : {}
    name   : "Terminal"

file_associations['ipynb'] =
    editor : 'ipynb'
    icon   : 'fa-list-alt'
    opts   : {}
    name   : "jupyter notebook"

for ext in ['png', 'jpg', 'gif', 'svg']
    file_associations[ext] =
        editor : 'image'
        icon   : 'fa-file-image-o'
        opts   : {}
        name   : ext
        binary : true
        exclude_from_menu : true

file_associations['pdf'] =
    editor : 'pdf'
    icon   : 'fa-file-pdf-o'
    opts   : {}
    name   : 'pdf'
    binary : true
    exclude_from_menu : true

file_associations['tasks'] =
    editor : 'tasks'
    icon   : 'fa-tasks'
    opts   : {}
    name   : 'task list'

file_associations['course'] =
    editor : 'course'
    icon   : 'fa-graduation-cap'
    opts   : {}
    name   : 'course'

file_associations['sage-chat'] =
    editor : 'chat'
    icon   : 'fa-comment'
    opts   : {}
    name   : 'chat'

file_associations['sage-git'] =
    editor : 'git'
    icon   : 'fa-git-square'
    opts   : {}
    name   : 'git'

file_associations['sage-template'] =
    editor : 'template'
    icon   : 'fa-clone'
    opts   : {}
    name   : 'template'

file_associations['sage-history'] =
    editor : 'history'
    icon   : 'fa-history'
    opts   : {}
    name   : 'sage history'
    exclude_from_menu : true

# For tar, see http://en.wikipedia.org/wiki/Tar_%28computing%29
archive_association =
    editor : 'archive'
    icon   : 'fa-file-archive-o'
    opts   : {}
    name   : 'archive'

for ext in 'zip gz bz2 z lz xz lzma tgz tbz tbz2 tb2 taz tz tlz txz lzip'.split(' ')
    file_associations[ext] = archive_association

file_associations['sage'].name = "sage code"

file_associations['sagews'].name = "sage worksheet"
file_associations['sagews'].exclude_from_menu = true

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
    if (file_associations[ext]? and file_associations[ext].icon?)
        return file_associations[ext].icon
    else
        return 'fa-file-o'

PUBLIC_ACCESS_UNSUPPORTED = ['terminal','latex','history','tasks','course', 'chat', 'git', 'template']

# public access file types *NOT* yet supported
# (this should quickly shrink to zero)
exports.public_access_supported = (filename) ->
    ext = filename_extension_notilde(filename)
    x = file_associations[ext]
    if x?.editor in PUBLIC_ACCESS_UNSUPPORTED
        return false
    else
        return true

# Multiplex'd worksheet mode

{MARKERS} = require('smc-util/sagews')

sagews_decorator_modes = [
    ['cjsx'        , 'text/cjsx'],
    ['coffeescript', 'coffeescript'],
    ['cython'      , 'cython'],
    ['file'        , 'text'],
    ['fortran'     , 'text/x-fortran'],
    ['html'        , 'htmlmixed'],
    ['javascript'  , 'javascript'],
    ['latex'       , 'stex']
    ['lisp'        , 'ecl'],
    ['md'          , 'gfm2'],
    ['gp'          , 'text/pari'],
    ['go'          , 'text/x-go']
    ['perl'        , 'text/x-perl'],
    ['python3'     , 'python'],
    ['python'      , 'python'],
    ['ruby'        , 'text/x-ruby'],   # !! more specific name must be first or get mismatch!
    ['r'           , 'r'],
    ['sage'        , 'python'],
    ['script'      , 'shell'],
    ['sh'          , 'shell'],
    ['julia'       , 'text/x-julia'],
    ['wiki'        , 'mediawiki'],
    ['mediawiki'   , 'mediawiki']
]

# Called immediately below.  It's just nice putting this code in a function.
define_codemirror_sagews_mode = () ->

    # not using these two gfm2 and htmlmixed2 modes, with their sub-latex mode, since
    # detection of math isn't good enough.  e.g., \$ causes math mode and $ doesn't seem to...   \$500 and $\sin(x)$.
    CodeMirror.defineMode "gfm2", (config) ->
        options = []
        for x in [['$$','$$'], ['$','$'], ['\\[','\\]'], ['\\(','\\)']]
            options.push
                open  : x[0]
                close : x[1]
                mode  : CodeMirror.getMode(config, 'stex')
        return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "gfm"), options...)

    CodeMirror.defineMode "htmlmixed2", (config) ->
        options = []
        for x in [['$$','$$'], ['$','$'], ['\\[','\\]'], ['\\(','\\)']]
            options.push
                open  : x[0]
                close : x[1]
                mode  : CodeMirror.getMode(config, mode)
        return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "htmlmixed"), options...)

    CodeMirror.defineMode "stex2", (config) ->
        options = []
        for x in ['sagesilent', 'sageblock']
            options.push
                open  : "\\begin{#{x}}"
                close : "\\end{#{x}}"
                mode  : CodeMirror.getMode(config, 'sagews')
        options.push
            open  : "\\sage{"
            close : "}"
            mode  : CodeMirror.getMode(config, 'sagews')
        return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "stex"), options...)

    CodeMirror.defineMode "cython", (config) ->
        # FUTURE: need to figure out how to do this so that the name
        # of the mode is cython
        return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "python"))

    CodeMirror.defineMode "sagews", (config) ->
        options = []
        close = new RegExp("[#{MARKERS.output}#{MARKERS.cell}]")
        for x in sagews_decorator_modes
            # NOTE: very important to close on both MARKERS.output *and* MARKERS.cell,
            # rather than just MARKERS.cell, or it will try to
            # highlight the *hidden* output message line, which can
            # be *enormous*, and could take a very very long time, but is
            # a complete waste, since we never see that markup.
            options.push
                open  : "%" + x[0]
                start : true    # must be at beginning of line
                close : close
                mode  : CodeMirror.getMode(config, x[1])

        return CodeMirror.smc_multiplexing_mode(CodeMirror.getMode(config, "python"), options...)

    ###
    # ATTN: if that's ever going to be re-activated again,
    # this needs to be require("script!...") in the spirit of webpack
    $.get '/static/codemirror-extra/data/sage-completions.txt', (data) ->
        s = data.split('\n')
        sagews_hint = (editor) ->
            console.log("sagews_hint")
            cur   = editor.getCursor()
            token = editor.getTokenAt(cur)
            console.log(token)
            t = token.string
            completions = (a for a in s when a.slice(0,t.length) == t)
            ans =
                list : completions,
                from : CodeMirror.Pos(cur.line, token.start)
                to   : CodeMirror.Pos(cur.line, token.end)
        CodeMirror.registerHelper("hint", "sagews", sagews_hint)
    ###

# Initialize all of the codemirror modes and extensions, since the editor may need them.
# OPTIMIZATION: defer this until we actually open a document that actually relies on codemirror.
# (one step at a time!)
define_codemirror_sagews_mode()
misc_page.define_codemirror_extensions()

# Given a text file (defined by content), try to guess
# what the extension should be.
guess_file_extension_type = (content) ->
    content = $.trim(content)
    i = content.indexOf('\n')
    first_line = content.slice(0,i).toLowerCase()
    if first_line.slice(0,2) == '#!'
        # A script.  What kind?
        if first_line.indexOf('python') != -1
            return 'py'
        if first_line.indexOf('bash') != -1 or first_line.indexOf('sh') != -1
            return 'sh'
    if first_line.indexOf('html') != -1
        return 'html'
    if first_line.indexOf('/*') != -1 or first_line.indexOf('//') != -1   # kind of a stretch
        return 'c++'
    return undefined

exports.file_options = (filename, content) ->   # content may be undefined
    ext = misc.filename_extension_notilde(filename)?.toLowerCase()
    if not ext? and content?   # no recognized extension, but have contents
        ext = guess_file_extension_type(content)
    if ext == ''
        x = file_associations["noext-#{misc.path_split(filename).tail}"]
    else
        x = file_associations[ext]
    if not x?
        x = file_associations['']
    return x

SEP = "\uFE10"

_local_storage_prefix = (project_id, filename, key) ->
    s = project_id
    if filename?
        s += filename + SEP
    if key?
        s += key
    return s
#
# Set or get something about a project from local storage:
#
#    local_storage(project_id):  returns everything known about this project.
#    local_storage(project_id, filename):  get everything about given filename in project
#    local_storage(project_id, filename, key):  get value of key for given filename in project
#    local_storage(project_id, filename, key, value):   set value of key
#
# In all cases, returns undefined if localStorage is not supported in this browser.
#

if misc.has_local_storage()
    local_storage_delete = exports.local_storage_delete = (project_id, filename, key) ->
        storage = window.localStorage
        if storage?
            prefix = _local_storage_prefix(project_id, filename, key)
            n = prefix.length
            for k, v of storage
                if k.slice(0,n) == prefix
                    delete storage[k]

    local_storage = exports.local_storage = (project_id, filename, key, value) ->
        storage = window.localStorage
        if storage?
            prefix = _local_storage_prefix(project_id, filename, key)
            n = prefix.length
            if filename?
                if key?
                    if value?
                        storage[prefix] = misc.to_json(value)
                    else
                        x = storage[prefix]
                        if not x?
                            return x
                        else
                            return misc.from_json(x)
                else
                    # Everything about a given filename
                    obj = {}
                    for k, v of storage
                        if k.slice(0,n) == prefix
                            obj[k.split(SEP)[1]] = v
                    return obj
            else
                # Everything about project
                obj = {}
                for k, v of storage
                    if k.slice(0,n) == prefix
                        x = k.slice(n)
                        z = x.split(SEP)
                        filename = z[0]
                        key = z[1]
                        if not obj[filename]?
                            obj[filename] = {}
                        obj[filename][key] = v
                return obj
else
    # no-op fallback
    console.warn("cursor saving won't work due to lack of localStorage")
    local_storage_delete = local_storage = () ->

templates = $("#salvus-editor-templates")

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
    constructor: (@project_id, @filename, content, opts) ->
        @_show = underscore.debounce(@_show, 50)
        @val(content)

    show_chat_window: () =>
        @syncdoc?.show_chat_window()

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
                    # the warning in 10s.
                    @_show_uncommitted_warning_timeout = setTimeout((()=>@_show_uncommitted_warning()), 10000)
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
        @_show(opts)  # critical -- also do an intial layout!  Otherwise get a horrible messed up animation effect.
        setTimeout((=> @_show(opts)), 10)
        if DEBUG
            window?.smc?.doc = @  # useful for debugging...

    _show: (opts={}) =>
        # define in derived class

    hide: () =>
        @element?.hide()

    remove: () =>
        @element?.remove()
        @removeAllListeners()

    terminate_session: () =>
        # If some backend session on a remote machine is serving this session, terminate it.

    save: (cb) =>
        content = @val?()   # may not be defined in which case save not supported
        if not content?
            # do not overwrite file in case editor isn't initialized
            cb?()
            return

        salvus_client.write_text_file_to_project
            project_id : @project_id
            timeout    : 10
            path       : @filename
            content    : content
            cb         : (err, mesg) =>
                # FUTURE -- on error, we *might* consider saving to localStorage...
                if err
                    alert_message(type:"error", message:"Communications issue saving #{@filename} -- #{err}")
                    cb?(err)
                else if mesg.event == 'error'
                    alert_message(type:"error", message:"Error saving #{@filename} -- #{to_json(mesg.error)}")
                    cb?(mesg.error)
                else
                    cb?()

exports.FileEditor = FileEditor

###############################################
# Codemirror-based File Editor

#     - 'saved' : when the file is successfully saved by the user
#     - 'show'  :
#     - 'toggle-split-view' :
###############################################
class CodeMirrorEditor extends FileEditor
    constructor: (@project_id, @filename, content, opts) ->
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

            # I'm making the times below very small for now.  If we have to adjust these to reduce load, due to lack
            # of capacity, then we will.  Or, due to lack of optimization (e.g., for big documents). These parameters
            # below would break editing a huge file right now, due to slowness of applying a patch to a codemirror editor.

            cursor_interval           : 1000   # minimum time (in ms) between sending cursor position info to hub -- used in sync version
            sync_interval             : 500    # minimum time (in ms) between synchronizing text with hub. -- used in sync version below

            completions_size          : 20    # for tab completions (when applicable, e.g., for sage sessions)

        #console.log("mode =", opts.mode)

        @project_id = @project_id
        @element = templates.find(".salvus-editor-codemirror").clone()

        if not opts.public_access
            profile.render_new_viewing_doc(@project_id, @filename, @element.find('.smc-users-viewing-document')[0], redux, @get_users_cursors, @programmatical_goto_line)

        @element.data('editor', @)

        @init_save_button()
        @init_uncommitted_element()
        @init_history_button()
        @init_edit_buttons()

        @init_file_actions()

        filename = @filename
        if filename.length > 30
            filename = "…" + filename.slice(filename.length-30)

        @chat_filename = misc.meta_file(@filename, 'chat')

        # not really needed due to highlighted tab; annoying.
        #@element.find(".salvus-editor-codemirror-filename").text(filename)

        @_video_is_on = @local_storage("video_is_on")
        if not @_video_is_on?
            @_video_is_on = false

        @_chat_is_hidden = @local_storage("chat_is_hidden")
        if not @_chat_is_hidden?
            @_chat_is_hidden = true

        @_layout = @local_storage("layout")
        if not @_layout?
            @_layout = 1
        @_last_layout = @_layout

        layout_elt = @element.find(".salvus-editor-codemirror-input-container-layout-#{@_layout}").show()
        elt = layout_elt.find(".salvus-editor-codemirror-input-box").find("textarea")
        elt.text(content)

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

            "Ctrl-S"       : (editor)   => @click_save_button()
            "Cmd-S"        : (editor)   => @click_save_button()

            "Ctrl-L"       : (editor)   => @goto_line(editor)
            "Cmd-L"        : (editor)   => @goto_line(editor)

            "Ctrl-I"       : (editor)   => @toggle_split_view(editor)
            "Cmd-I"        : (editor)   => @toggle_split_view(editor)

            "Shift-Cmd-L"  : (editor)   => editor.align_assignments()
            "Shift-Ctrl-L" : (editor)   => editor.align_assignments()

            "Shift-Ctrl-." : (editor)   => @change_font_size(editor, +1)
            "Shift-Ctrl-," : (editor)   => @change_font_size(editor, -1)
            "Shift-Cmd-."  : (editor)   => @change_font_size(editor, +1)
            "Shift-Cmd-,"  : (editor)   => @change_font_size(editor, -1)

            "Shift-Tab"    : (editor)   => editor.unindent_selection()

            "Ctrl-'"       : "indentAuto"
            "Cmd-'"        : "indentAuto"

            "Tab"          : (editor)   => @press_tab_key(editor)
            "Shift-Ctrl-C" : (editor)   => @interrupt_key()

            "Ctrl-Space"   : "autocomplete"

            #"F11"          : (editor)   => console.log('fs', editor.getOption("fullScreen")); editor.setOption("fullScreen", not editor.getOption("fullScreen"))

        if opts.match_xml_tags
            extraKeys['Ctrl-J'] = "toMatchingTag"

        # FUTURE: We will replace this by a general framework...
        if misc.filename_extension_notilde(filename) == "sagews"
            evaluate_key = redux.getStore('account').get('evaluate_key').toLowerCase()
            if evaluate_key == "enter"
                evaluate_key = "Enter"
            else
                evaluate_key = "Shift-Enter"
            extraKeys[evaluate_key] = (editor)   => @action_key(execute: true, advance:true, split:false)

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
                viewportMargin          : 125

            if opts.match_xml_tags
                options.matchTags = {bothTags: true}

            if opts.code_folding
                extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
                options.foldGutter  = true
                options.gutters     = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]

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
            e.attr('style', e.attr('style') + '; font-family:monospace !important')  # see http://stackoverflow.com/questions/2655925/apply-important-css-style-using-jquery

            if opts.bindings == 'vim'
                # annoying due to api change in vim mode
                cm.setOption("vimMode", true)

            return cm


        @codemirror = make_editor(elt[0])
        @codemirror.name = '0'

        elt1 = layout_elt.find(".salvus-editor-codemirror-input-box-1").find("textarea")

        @codemirror1 = make_editor(elt1[0])
        @codemirror1.name = '1'

        buf = @codemirror.linkedDoc({sharedHist: true})
        @codemirror1.swapDoc(buf)

        @codemirror.on 'focus', () =>
            @codemirror_with_last_focus = @codemirror

        @codemirror1.on 'focus', () =>
            @codemirror_with_last_focus = @codemirror1

        @init_font_size() # get the @default_font_size
        @restore_font_size()

        @_split_view = @local_storage("split_view")
        if not @_split_view?
            @_split_view = false

        @init_draggable_splits()

        if opts.read_only
            @set_readonly_ui()

        if @filename.slice(@filename.length-7) == '.sagews'
            @init_sagews_edit_buttons()

        @wizard = null

    programmatical_goto_line: (line) =>
        cm = @codemirror_with_last_focus
        pos = {line:line-1, ch:0}
        info = cm.getScrollInfo()
        cm.scrollIntoView(pos, info.clientHeight/2)

    get_users_cursors: (account_id) =>
        return @syncdoc?.get_users_cursors(account_id)

    init_file_actions: () =>
        if not @element?
            return
        actions = redux.getProjectActions(@project_id)
        dom_node = @element.find('.smc-editor-file-info-dropdown')[0]
        require('./r_misc').render_file_info_dropdown(@filename, actions, dom_node, @opts.public_access)

    init_draggable_splits: () =>
        @_layout1_split_pos = @local_storage("layout1_split_pos")
        @_layout2_split_pos = @local_storage("layout2_split_pos")

        layout1_bar = @element.find(".salvus-editor-resize-bar-layout-1")
        layout1_bar.draggable
            axis        : 'y'
            containment : @element
            zIndex      : 100
            stop        : (event, ui) =>
                # compute the position of bar as a number from 0 to 1, with 0 being at top (left), 1 at bottom (right), and .5 right in the middle
                e   = @element.find(".salvus-editor-codemirror-input-container-layout-1")
                top = e.offset().top
                ht  = e.height()
                p   = layout1_bar.offset().top + layout1_bar.height()/2
                @_layout1_split_pos = (p - top) / ht
                @local_storage("layout1_split_pos", @_layout1_split_pos)
                layout1_bar.css(top:0)
                # redraw, which uses split info
                @show()

        layout2_bar = @element.find(".salvus-editor-resize-bar-layout-2")
        layout2_bar.css(position:'absolute')
        layout2_bar.draggable
            axis        : 'x'
            containment : @element
            zIndex      : 100
            stop        : (event, ui) =>
                # compute the position of bar as a number from 0 to 1, with 0 being at top (left), 1 at bottom (right), and .5 right in the middle
                e     = @element.find(".salvus-editor-codemirror-input-container-layout-2")
                left  = e.offset().left
                width = e.width()
                p     = layout2_bar.offset().left
                @_layout2_split_pos = (p - left) / width
                @local_storage("layout2_split_pos", @_layout2_split_pos)
                layout2_bar.css(left:left + width*p)
                # redraw, which uses split info
                @show()

    hide_content: () =>
        @element.find(".salvus-editor-codemirror-content").hide()

    show_content: () =>
        @hide_startup_message()
        @element.find(".salvus-editor-codemirror-content").show()
        for cm in @codemirrors()
            cm?.refresh()

    hide_startup_message: () =>
        @element.find(".salvus-editor-codemirror-startup-message").hide()

    show_startup_message: (mesg, type='info') =>
        @hide_content()
        if typeof(mesg) != 'string'
            mesg = JSON.stringify(mesg)
        e = @element.find(".salvus-editor-codemirror-startup-message").show().text(mesg)
        for t in ['success', 'info', 'warning', 'danger']
            e.removeClass("alert-#{t}")
        e.addClass("alert-#{type}")

    is_active: () =>
        return @codemirror? and misc.tab_to_path(redux.getProjectStore(@project_id).get('active_project_tab')) == @filename

    set_theme: (theme) =>
        # Change the editor theme after the editor has been created
        @codemirror.setOption('theme', theme)
        @codemirror1.setOption('theme', theme)
        @opts.theme = theme

    # add something visual to the UI to suggest that the file is read only
    set_readonly_ui: (readonly=true) =>
        @opts.read_only = readonly
        if readonly
            @element.find(".salvus-editor-write-only").hide()
            @element.find(".salvus-editor-read-only").show()
            @codemirror.setOption('readOnly', true)
            @codemirror1.setOption('readOnly', true)
        else
            @element.find(".salvus-editor-write-only").show()
            @element.find(".salvus-editor-read-only").hide()
            @codemirror.setOption('readOnly', false)
            @codemirror1.setOption('readOnly', false)

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
        return [@codemirror, @codemirror1]

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
        for name in ['search', 'next', 'prev', 'replace', 'undo', 'redo', 'autoindent',
                     'shift-left', 'shift-right', 'split-view','increase-font', 'decrease-font', 'goto-line', 'print' ]
            e = @element.find("a[href=\"##{name}\"]")
            e.data('name', name).tooltip(delay:{ show: 500, hide: 100 }).click (event) ->
                that.click_edit_button($(@).data('name'))
                return false

        # FUTURE: implement printing for other file types
        if @filename.slice(@filename.length-7) != '.sagews'
            @element.find("a[href=\"#print\"]").unbind().hide()

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
            when 'print'
                @print()


    restore_font_size: () =>
        # we set the font_size from local storage
        # or fall back to the default from the account settings
        for i, cm of [@codemirror, @codemirror1]
            size = @local_storage("font_size#{i}")
            if size?
                @set_font_size(cm, size)
            else if @default_font_size?
                @set_font_size(cm, @default_font_size)

    set_font_size: (cm, size) =>
        if size > 1
            elt = $(cm.getWrapperElement())
            elt.css('font-size', size + 'px')
            elt.data('font-size', size)

    change_font_size: (cm, delta) =>
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
            cm.refresh()
            scroll_after = cm.getScrollInfo()
            x = (scroll_before.left / scroll_before.width) * scroll_after.width
            y = (((scroll_before.top+scroll_before.clientHeight/2) / scroll_before.height) * scroll_after.height) - scroll_after.clientHeight/2
            cm.scrollTo(x, y)
        setTimeout(f, 0)

    toggle_split_view: (cm) =>
        if @_split_view
            if @_layout == 1
                @_layout = 2
            else
                @_split_view = false
        else
            @_split_view = true
            @_layout = 1
        @local_storage("split_view", @_split_view)  # store state so can restore same on next open
        @local_storage("layout", @_layout)
        @show()
        if cm?
            if @_split_view
                cm.focus()
            else
                # focus first editor since it is only one that is visible.
                @codemirror.focus()
        f = () =>
            for x in @codemirrors()
                x.scrollIntoView()  # scroll the cursors back into view -- see https://github.com/sagemathinc/smc/issues/1044
        setTimeout(f, 1)   # wait until next loop after codemirror has laid itself out.
        @emit 'toggle-split-view'

    goto_line: (cm) =>
        focus = () =>
            @focus()
            cm.focus()
        dialog = templates.find(".salvus-goto-line-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            setTimeout(focus, 50)
            return false
        input = dialog.find(".salvus-goto-line-input")
        input.val(cm.getCursor().line+1)  # +1 since line is 0-based
        dialog.find(".salvus-goto-line-range").text("1-#{cm.lineCount()} or n%")
        dialog.find(".salvus-goto-line-input").focus().select()
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

    # WARNING: this "print" is actually for printing Sage worksheets, not arbitrary files.
    print: () =>
        dialog = templates.find(".salvus-file-print-dialog").clone()
        p = misc.path_split(@filename)
        v = p.tail.split('.')
        if v.length <= 1
            ext = ''
            base = p.tail
        else
            ext = v[v.length-1]
            base = v.slice(0,v.length-1).join('.')
        if ext != 'sagews'
            alert_message(type:'info', message:'Only printing of Sage Worksheets is currently implemented.')
            return

        submit = () =>
            dialog.find(".salvus-file-printing-progress").show()
            dialog.find(".salvus-file-printing-link").hide()
            $print_tempdir = dialog.find(".smc-file-printing-tempdir")
            $print_tempdir.hide()
            is_subdir = dialog.find(".salvus-file-print-keepfiles").is(":checked")
            dialog.find(".btn-submit").icon_spin(start:true)
            pdf = undefined
            async.series([
                (cb) =>
                    @save(cb)
                (cb) =>
                    salvus_client.print_to_pdf
                        project_id  : @project_id
                        path        : @filename
                        options     :
                            title      : dialog.find(".salvus-file-print-title").text()
                            author     : dialog.find(".salvus-file-print-author").text()
                            date       : dialog.find(".salvus-file-print-date").text()
                            contents   : dialog.find(".salvus-file-print-contents").is(":checked")
                            subdir     : is_subdir
                            extra_data : misc.to_json(@syncdoc.print_to_pdf_data())  # avoid de/re-json'ing
                        cb          : (err, _pdf) =>
                            if err
                                cb(err)
                            else
                                pdf = _pdf
                                cb()
                (cb) =>
                    salvus_client.read_file_from_project
                        project_id : @project_id
                        path       : pdf
                        cb         : (err, mesg) =>
                            if err
                                cb(err)
                            else
                                url = mesg.url + "?nocache=#{Math.random()}"
                                dialog.find(".salvus-file-printing-link").attr('href', url).text(pdf).show()
                                if is_subdir
                                    {join} = require('path')
                                    subdir_texfile = join(p.head, "#{base}-sagews2pdf", "tmp.tex")
                                    # if not reading it, tmp.tex is blank (?)
                                    salvus_client.read_file_from_project
                                        project_id : @project_id
                                        path       : subdir_texfile
                                        cb         : (err, mesg) =>
                                            if err
                                                cb(err)
                                            else
                                                tempdir_link = $('<a>').text('Click to open temporary file')
                                                tempdir_link.click =>
                                                    redux.getProjectActions(@project_id).open_file
                                                        path       : subdir_texfile
                                                        foreground : true
                                                    dialog.modal('hide')
                                                    return false
                                                $print_tempdir.html(tempdir_link)
                                                $print_tempdir.show()
                                else
                                    window.open(url, '_blank')
                                cb()
            ], (err) =>
                dialog.find(".btn-submit").icon_spin(false)
                dialog.find(".salvus-file-printing-progress").hide()
                if err
                    alert_message(type:"error", message:"problem printing '#{p.tail}' -- #{misc.to_json(err)}")
            )
            return false

        dialog.find(".salvus-file-print-filename").text(@filename)
        dialog.find(".salvus-file-print-title").text(base)
        dialog.find(".salvus-file-print-author").text(redux.getStore('account').get_fullname())
        dialog.find(".salvus-file-print-date").text((new Date()).toLocaleDateString())
        dialog.find(".btn-submit").click(submit)
        dialog.find(".btn-close").click(() -> dialog.modal('hide'); return false)
        if ext == "sagews"
            dialog.find(".salvus-file-options-sagews").show()
        dialog.modal('show')

    init_save_button: () =>
        @save_button = @element.find("a[href=\"#save\"]").tooltip().click(@click_save_button)
        @save_button.find(".spinner").hide()

    init_uncommitted_element: () =>
        @uncommitted_element = @element.find(".smc-uncommitted")

    init_history_button: () =>
        if not @opts.public_access and @filename.slice(@filename.length-13) != '.sage-history'
            @history_button = @element.find(".salvus-editor-history-button")
            @history_button.click(@click_history_button)
            @history_button.show()
            @history_button.css
                display: 'inline-block'   # this is needed due to subtleties of jQuery show().

    click_save_button: () =>
        if @opts.read_only
            return
        if @_saving
            return
        @_saving = true
        @save_button.icon_spin(start:true, delay:8000)
        @save (err) =>
            # WARNING: As far as I can tell, this doesn't call FileEditor.save
            if err
                if redux.getProjectStore(@project_id).is_file_open(@filename)  # only show error if file actually opened
                    alert_message(type:"error", message:"Error saving #{@filename} -- #{err}; please try later")
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
        return @codemirror.getValue()

    _set: (content) =>
        {from} = @codemirror.getViewport()
        @codemirror.setValue(content)
        @codemirror.scrollIntoView(from)
        # even better -- fully restore cursors, if available in localStorage
        setTimeout((()=>@restore_cursor_position()),1)  # do in next round, so that both editors get set by codemirror first (including the linked one)

    restore_cursor_position: () =>
        for i, cm of [@codemirror, @codemirror1]
            if cm?
                pos = @local_storage("cursor#{i}")
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
        $("body").remove("#salvus-cm-activeline")
        $("body").append("<style id='salvus-cm-activeline' type=text/css>.CodeMirror-activeline{background:rgb(#{v[0]},#{v[1]},#{v[2]});}</style>")


    # hide/show the second linked codemirror editor, depending on whether or not it's enabled
    _show_extra_codemirror_view: () =>
        $(@codemirror1.getWrapperElement()).toggle(@_split_view)

    _show_codemirror_editors: (height, width) =>
        # console.log("_show_codemirror_editors: #{width} x #{height}")
        if not width or not height
            return
        # in case of more than one view on the document...
        @_show_extra_codemirror_view()

        btn = @element.find("a[href=\"#split-view\"]")
        btn.find("i").hide()
        if not @_split_view
            @element.find(".salvus-editor-codemirror-input-container-layout-1").width(width)
            @element.find(".salvus-editor-resize-bar-layout-1").hide()
            @element.find(".salvus-editor-resize-bar-layout-2").hide()
            btn.find(".salvus-editor-layout-0").show()
            # one full editor
            v = [{cm:@codemirror,height:height,width:width}]
        else
            if @_layout == 1
                @element.find(".salvus-editor-codemirror-input-container-layout-1").width(width)
                @element.find(".salvus-editor-resize-bar-layout-1").show()
                @element.find(".salvus-editor-resize-bar-layout-2").hide()
                btn.find(".salvus-editor-layout-1").show()
                p = @_layout1_split_pos
                if not p?
                    p = 0.5
                p = Math.max(MIN_SPLIT,Math.min(MAX_SPLIT, p))
                v = [{cm:@codemirror,  height:height*p,     width:width},
                     {cm:@codemirror1, height:height*(1-p), width:width}]
            else
                @element.find(".salvus-editor-resize-bar-layout-1").hide()
                @element.find(".salvus-editor-resize-bar-layout-2").show()
                p = @_layout2_split_pos
                if not p?
                    p = 0.5
                p = Math.max(MIN_SPLIT,Math.min(MAX_SPLIT, p))
                width0 = width*p
                width1 = width*(1-p)
                btn.find(".salvus-editor-layout-2").show()
                e = @element.find(".salvus-editor-codemirror-input-container-layout-2")
                e.width(width)
                e.find(".salvus-editor-resize-bar-layout-2").height(height).css(left : e.offset().left + width*p)
                e.find(".salvus-editor-codemirror-input-box").width(width0-7)
                v = [{cm:@codemirror,  height:height, width:width0},
                     {cm:@codemirror1, height:height, width:width1-8}]

        if @_last_layout != @_layout
            # move the editors to the correct layout template and show it.
            @element.find(".salvus-editor-codemirror-input-container-layout-#{@_last_layout}").hide()
            layout_elt = @element.find(".salvus-editor-codemirror-input-container-layout-#{@_layout}").show()
            layout_elt.find(".salvus-editor-codemirror-input-box").empty().append($(@codemirror.getWrapperElement()))
            layout_elt.find(".salvus-editor-codemirror-input-box-1").empty().append($(@codemirror1.getWrapperElement()))
            @_last_layout = @_layout

        for {cm,height,width} in v
            scroller = $(cm.getScrollerElement())
            scroller.css('height':height)
            cm_wrapper = $(cm.getWrapperElement())
            cm_wrapper.css
                height : height
                width  : width

        # This is another hack that specifically hopefully addresses an
        # issue where when I open a tab often the scrollbar is completely
        # hosed.  Zooming in and out manually always fixes it, so maybe
        # what's below will also.  Testing it.
        f = () =>
            for {cm,height,width} in v
                cm.refresh()
                ###
                scroll = cm.getScrollInfo(); pos = cm.getCursor()
                # above refresh
                scroll_after = cm.getScrollInfo(); pos_after = cm.getCursor()
                if scroll.left != scroll_after.left or scroll.top != scroll_after.top or pos.line != pos_after.line or pos.ch != pos_after.ch
                    console.log("WARNING: codemirror refresh lost pos -- RESETTING position; before=#{misc.to_json([scroll,pos])}, after=#{misc.to_json([scroll_after,pos_after])}")
                    cm.setCursor(pos)
                    cm.scrollTo(scroll.left, scroll.top)
                ###
        setTimeout(f, 1)

        @emit('show', height)


    _show: (opts={}) =>
        # show the element that contains this editor
        @element.show()

        # do size computations: determine height and width of the codemirror editor(s)
        if not opts.top?
            top           = redux.getProjectStore(@project_id).get('editor_top_position')
        else
            top           = opts.top

        height            = $(window).height()
        elem_height       = height - top
        button_bar_height = @element.find(".salvus-editor-codemirror-button-row").height()
        font_height       = @codemirror.defaultTextHeight()
        chat              = @_chat_is_hidden? and not @_chat_is_hidden
        chat_video        = @_video_is_on? and @_video_is_on

        # width of codemirror editors
        if chat
            width         = @element.find(".salvus-editor-codemirror-chat-column").offset().left
        else
            width         = $(window).width()

        if opts.width?
            width         = opts.width

        if opts.top?
            top           = opts.top

        # height of codemirror editors
        cm_height         = Math.floor((elem_height - button_bar_height)/font_height) * font_height

        # position the editor element on the screen
        @element.css(top:top, left:0)
        @element.css(left:0)
        # and position the chat column
        @element.find(".salvus-editor-codemirror-chat-column").css(top:top+button_bar_height + 2)

        # set overall height of the element
        @element.height(elem_height)

        # show the codemirror editors, resizing as needed
        @_show_codemirror_editors(cm_height, width)

        if chat
            # changes the width on resize change
            width_resize = () =>
                width = @element.find(".salvus-editor-codemirror-chat-column").offset().left
                @_show_codemirror_editors(cm_height, width)
            $(window).on("resize", width_resize)
        else
            $(window).off()

        @chat_elt = @element.find(".salvus-editor-codemirror-chat")

#         if chat
#             chat_elt = @element.find(".salvus-editor-codemirror-chat")
#             chat_elt.height(cm_height)

#             chat_video_loc = chat_elt.find(".salvus-editor-codemirror-chat-video")
#             chat_output    = chat_elt.find(".salvus-editor-codemirror-chat-output")
#             chat_input     = chat_elt.find(".salvus-editor-codemirror-chat-input")

#             chat_input_top = $(window).height() - chat_input.height() - 15

#             if chat_video
#                 video_height = chat_video_loc.height()
#             else
#                 video_height = 0

#             video_top = chat_video_loc.offset().top

#             chat_output_height = $(window).height() - chat_input.height() - video_top - video_height - 30
#             chat_output_top = video_top + video_height

#             chat_input.offset({top:chat_input_top})

#             chat_output.height(chat_output_height)
#             chat_output.offset({top:chat_output_top})

    focus: () =>
        if not @codemirror?
            return
        @show()
        if not IS_MOBILE
            @codemirror_with_last_focus?.focus()

    # Removes the resize event handler when the user closes sagews
    # For future if sagews gets rewritten in react, move this to componentWillUnmount
    # so that when user moves away from the sagews tab, it removes the event handlers
    # right now it does not remove them when user moves away from tab. Only when they close the tab.
    remove: () =>
        $(window).off()

    ############
    # Editor button bar support code
    ############
    textedit_command: (cm, cmd, args) =>
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

    wizard_handler: () =>
        $target = @mode_display.parent().find('.react-target')
        {render_wizard} = require('./wizard')
        # @wizard is this WizardActions object
        if not @wizard?
            @wizard = render_wizard($target[0], @project_id, @filename, lang = @_current_mode, cb = @wizard_insert_handler)
        else
            @wizard.show(lang = @_current_mode)

    wizard_insert_handler: (insert) =>
        code = insert.code
        lang = insert.lang
        cm = @focused_codemirror()
        line = cm.getCursor().line
        # console.log "wizard insert:", lang, code, insert.descr
        if insert.descr?
            @syncdoc?.insert_new_cell(line)
            cm.replaceRange("%md\n#{insert.descr}", {line : line+1, ch:0})
            @action_key(execute: true, advance:false, split:false)
        line = cm.getCursor().line
        @syncdoc?.insert_new_cell(line)
        cell = code
        if lang != @_current_mode
            cell = "%#{lang}\n#{cell}"
        cm.replaceRange(cell, {line : line+1, ch:0})
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
        e = @element.find(".salvus-editor-codemirror-textedit-buttons")
        @textedit_buttons = templates.find(".salvus-editor-textedit-buttonbar").clone().hide()
        e.append(@textedit_buttons).show()

        # add the code editing button bar
        @codeedit_buttons = templates.find(".salvus-editor-codeedit-buttonbar").clone()
        e.append(@codeedit_buttons)

        # the r-editing button bar
        @redit_buttons =  templates.find(".salvus-editor-redit-buttonbar").clone()
        e.append(@redit_buttons)

        # the Julia-editing button bar
        @julia_edit_buttons =  templates.find(".salvus-editor-julia-edit-buttonbar").clone()
        e.append(@julia_edit_buttons)

        # the sh-editing button bar
        @sh_edit_buttons =  templates.find(".salvus-editor-sh-edit-buttonbar").clone()
        e.append(@sh_edit_buttons)

        @cython_buttons =  templates.find(".salvus-editor-cython-buttonbar").clone()
        e.append(@cython_buttons)

        @fallback_buttons = templates.find(".salvus-editor-fallback-edit-buttonbar").clone()
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

        @fallback_buttons.find("a[href=\"#todo\"]").click () =>
            bootbox.alert("<i class='fa fa-wrench' style='font-size: 18pt;margin-right: 1em;'></i> Button bar not yet implemented in <code>#{mode_display.text()}</code> cells.")
            return false

        for edit_buttons in all_edit_buttons
            edit_buttons.find("a").click(edit_button_click)
            edit_buttons.find("*[title]").tooltip(TOOLTIP_DELAY)

        @mode_display = mode_display = @element.find(".salvus-editor-codeedit-buttonbar-mode")
        @_current_mode = "sage"

        set_mode_display = (name) =>
            #console.log("set_mode_display: #{name}")
            if name?
                mode = name_to_mode(name)
            else
                mode = ""
            mode_display.text("%" + mode)
            @_current_mode = mode

        show_edit_buttons = (which_one, name) ->
            for edit_buttons in all_edit_buttons
                edit_buttons.toggle(edit_buttons == which_one)
            set_mode_display(name)

        mode_display.click(@wizard_handler)

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

        for cm in [@codemirror, @codemirror1]
            cm.on('cursorActivity', _.debounce(update_context_sensitive_bar, 250))

        update_context_sensitive_bar()
        @element.find(".salvus-editor-codemirror-textedit-buttons").mathjax()


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
    return E


###############################################
# LateX Editor
###############################################

# Make a (server-side) self-destructing temporary uuid-named directory in path.
tmp_dir = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        ttl        : 120            # self destruct in this many seconds
        cb         : required       # cb(err, directory_name)
    path_name = "." + uuid()   # hidden
    if "'" in opts.path
        opts.cb("there is a disturbing ' in the path: '#{opts.path}'")
        return
    remove_tmp_dir
        project_id : opts.project_id
        path       : opts.path
        tmp_dir    : path_name
        ttl        : opts.ttl
    salvus_client.exec
        project_id : opts.project_id
        path       : opts.path
        command    : "mkdir"
        args       : [path_name]
        cb         : (err, output) =>
            if err
                opts.cb("Problem creating temporary directory in '#{opts.path}'")
            else
                opts.cb(false, path_name)

remove_tmp_dir = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        tmp_dir    : required
        ttl        : 120            # run in this many seconds (even if client disconnects)
        cb         : undefined
    salvus_client.exec
        project_id : opts.project_id
        command    : "sleep #{opts.ttl} && rm -rf '#{opts.path}/#{opts.tmp_dir}'"
        timeout    : 10 + opts.ttl
        cb         : (err, output) =>
            cb?(err)


# Class that wraps "a remote latex doc with PDF preview"
class PDFLatexDocument
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required
            filename   : required
            image_type : 'png'  # 'png' or 'jpg'

        @project_id = opts.project_id
        @filename   = opts.filename
        @image_type = opts.image_type

        @_pages     = {}
        @num_pages  = 0
        @latex_log  = ''
        s = path_split(@filename)
        @path = s.head
        if @path == ''
            @path = './'
        @filename_tex  = s.tail
        @base_filename = @filename_tex.slice(0, @filename_tex.length-4)
        @filename_pdf  = @base_filename + '.pdf'

    dbg: (mesg) =>
        #console.log("PDFLatexDocument: #{mesg}")

    page: (n) =>
        if not @_pages[n]?
            @_pages[n] = {}
        return @_pages[n]

    _exec: (opts) =>
        opts = defaults opts,
            path        : @path
            project_id  : @project_id
            command     : required
            args        : []
            timeout     : 30
            err_on_exit : false
            bash        : false
            cb          : required
        #console.log(opts.path)
        #console.log(opts.command + ' ' + opts.args.join(' '))
        salvus_client.exec(opts)

    spell_check: (opts) =>
        opts = defaults opts,
            lang : undefined
            cb   : required
        if not opts.lang?
            opts.lang = misc_page.language()
        if opts.lang == 'disable'
            opts.cb(undefined,[])
            return
        @_exec
            command : "cat '#{@filename_tex}'|aspell --mode=tex --lang=#{opts.lang} list|sort|uniq"
            bash    : true
            cb      : (err, output) =>
                if err
                    opts.cb(err); return
                if output.stderr
                    opts.cb(output.stderr); return
                opts.cb(undefined, output.stdout.slice(0,output.stdout.length-1).split('\n'))  # have to slice final \n

    inverse_search: (opts) =>
        opts = defaults opts,
            n          : required   # page number
            x          : required   # x coordinate in unscaled png image coords (as reported by click EventEmitter)...
            y          : required   # y coordinate in unscaled png image coords
            resolution : required   # resolution used in ghostscript
            cb         : required   # cb(err, {input:'file.tex', line:?})

        scale = opts.resolution / 72
        x = opts.x / scale
        y = opts.y / scale
        @_exec
            command : 'synctex'
            args    : ['edit', '-o', "#{opts.n}:#{x}:#{y}:#{@filename_pdf}"]
            path    : @path
            timeout : 7
            cb      : (err, output) =>
                if err
                    opts.cb(err); return
                if output.stderr
                    opts.cb(output.stderr); return
                s = output.stdout
                i = s.indexOf('\nInput:')
                input = s.slice(i+7, s.indexOf('\n',i+3))

                # normalize path to be relative to project home
                j = input.indexOf('/./')
                if j != -1
                    fname = input.slice(j+3)
                else
                    j = input.indexOf('/../')
                    if j != -1
                        fname = input.slice(j+1)
                    else
                        fname = input
                if @path != './'
                    input = @path + '/' + fname
                else
                    input = fname

                i = s.indexOf('Line')
                line = parseInt(s.slice(i+5, s.indexOf('\n',i+1)))
                opts.cb(false, {input:input, line:line-1})   # make line 0-based

    forward_search: (opts) =>
        opts = defaults opts,
            n  : required
            cb : required   # cb(err, {page:?, x:?, y:?})    x,y are in terms of 72dpi pdf units

        @_exec
            command : 'synctex'
            args    : ['view', '-i', "#{opts.n}:0:#{@filename_tex}", '-o', @filename_pdf]
            path    : @path
            cb      : (err, output) =>
                if err
                    opts.cb(err); return
                if output.stderr
                    opts.cb(output.stderr); return
                s = output.stdout
                i = s.indexOf('\nPage:')
                n = s.slice(i+6, s.indexOf('\n',i+3))
                i = s.indexOf('\nx:')
                x = parseInt(s.slice(i+3, s.indexOf('\n',i+3)))
                i = s.indexOf('\ny:')
                y = parseInt(s.slice(i+3, s.indexOf('\n',i+3)))
                opts.cb(false, {n:n, x:x, y:y})

    default_tex_command: () =>
        # errorstopmode recommended by http://tex.stackexchange.com/questions/114805/pdflatex-nonstopmode-with-tikz-stops-compiling
        # since in some cases things will hang (using )
        #return "pdflatex -synctex=1 -interact=errorstopmode '#{@filename_tex}'"
        # However, users hate nostopmode, so we use nonstopmode, which can hang in rare cases with tikz.
        # See https://github.com/sagemathinc/smc/issues/156
        return "pdflatex -synctex=1 -interact=nonstopmode '#{@filename_tex}'"

    # runs pdflatex; updates number of pages, latex log, parsed error log
    update_pdf: (opts={}) =>
        opts = defaults opts,
            status        : undefined  # status(start:'latex' or 'sage' or 'bibtex'), status(end:'latex', 'log':'output of thing running...')
            latex_command : undefined
            cb            : undefined
        @pdf_updated = true
        if not opts.latex_command?
            opts.latex_command = @default_tex_command()
        @_need_to_run = {}
        log = ''
        status = opts.status
        async.series([
            (cb) =>
                 status?(start:'latex')
                 @_run_latex opts.latex_command, (err, _log) =>
                     log += _log
                     status?(end:'latex', log:_log)
                     cb(err)
            (cb) =>
                 if @_need_to_run.sage
                     status?(start:'sage')
                     @_run_sage @_need_to_run.sage, (err, _log) =>
                         log += _log
                         status?(end:'sage', log:_log)
                         cb(err)
                 else
                     cb()
            (cb) =>
                 if @_need_to_run.bibtex
                     status?(start:'bibtex')
                     @_run_bibtex (err, _log) =>
                         status?(end:'bibtex', log:_log)
                         log += _log
                         cb(err)
                 else
                     cb()
            (cb) =>
                 if @_need_to_run.latex
                     status?(start:'latex')
                     @_run_latex opts.latex_command, (err, _log) =>
                          log += _log
                          status?(end:'latex', log:_log)
                          cb(err)
                 else
                     cb()
            (cb) =>
                 if @_need_to_run.latex
                     status?(start:'latex')
                     @_run_latex opts.latex_command, (err, _log) =>
                          log += _log
                          status?(end:'latex', log:_log)
                          cb(err)
                 else
                     cb()
            (cb) =>
                @update_number_of_pdf_pages(cb)
        ], (err) =>
            opts.cb?(err, log))

    _run_latex: (command, cb) =>
        if not command?
            command = @default_tex_command()
        sagetex_file = @base_filename + '.sagetex.sage'
        sha_marker = 'sha1sums'
        # yes x business recommended by http://tex.stackexchange.com/questions/114805/pdflatex-nonstopmode-with-tikz-stops-compiling
        @_exec
            command : "yes x | " + command + "; echo '#{sha_marker}'; sha1sum '#{sagetex_file}'"
            bash    : true
            timeout : 20
            err_on_exit : false
            cb      : (err, output) =>
                if err
                    cb?(err)
                else
                    i = output.stdout.lastIndexOf(sha_marker)
                    if i != -1
                        shas = output.stdout.slice(i+sha_marker.length+1)
                        output.stdout = output.stdout.slice(0,i)
                        for x in shas.split('\n')
                            v = x.split(/\s+/)
                            if v[1] == sagetex_file and v[0] != @_sagetex_file_sha
                                @_need_to_run.sage = sagetex_file
                                @_sagetex_file_sha = v[0]

                    log = output.stdout + '\n\n' + output.stderr

                    if log.indexOf('Rerun to get cross-references right') != -1
                        @_need_to_run.latex = true

                    run_sage_on = '\nRun Sage on'
                    i = log.indexOf(run_sage_on)
                    if i != -1
                        j = log.indexOf(', and then run LaTeX', i)
                        if j != -1
                            # the .replace(/"/g,'') is because sagetex tosses "'s around part of the filename
                            # in some cases, e.g., when it has a space in it.  Tex itself won't accept
                            # filenames with quotes, so this replacement isn't dangerous.  We don't need
                            # or want these quotes, since we're not passing this command via bash/sh.
                            @_need_to_run.sage = log.slice(i + run_sage_on.length, j).trim().replace(/"/g,'')

                    i = log.indexOf("No file #{@base_filename}.bbl.")
                    if i != -1
                        @_need_to_run.bibtex = true

                    @last_latex_log = log
                    cb?(false, log)

    _run_sage: (target, cb) =>
        if not target?
            target = @base_filename + '.sagetex.sage'
        @_exec
            command : 'sage'
            args    : [target]
            timeout : 45
            cb      : (err, output) =>
                if err
                    cb?(err)
                else
                    log = output.stdout + '\n\n' + output.stderr
                    @_need_to_run.latex = true
                    cb?(false, log)

    _run_bibtex: (cb) =>
        @_exec
            command : 'bibtex'
            args    : [@base_filename]
            timeout : 10
            cb      : (err, output) =>
                if err
                    cb?(err)
                else
                    log = output.stdout + '\n\n' + output.stderr
                    @_need_to_run.latex = true
                    cb?(false, log)

    pdfinfo: (cb) =>   # cb(err, info)
        @_exec
            command     : "pdfinfo"
            args        : [@filename_pdf]
            bash        : false
            err_on_exit : true
            cb          : (err, output) =>
                if err
                    console.log("Make sure pdfinfo is installed!  sudo apt-get install poppler-utils.")
                    cb(err)
                    return
                v = {}
                for x in output.stdout?.split('\n')
                    w = x.split(':')
                    if w.length == 2
                        v[w[0].trim()] = w[1].trim()
                cb(undefined, v)

    update_number_of_pdf_pages: (cb) =>
        before = @num_pages
        @pdfinfo (err, info) =>
            # if err maybe no pdf yet -- just don't do anything
            if not err and info?.Pages?
                @num_pages = info.Pages
                # Delete trailing removed pages from our local view of things; otherwise, they won't properly
                # re-appear later if they look identical, etc.
                if @num_pages < before
                    for n in [@num_pages ... before]
                        delete @_pages[n]
            cb()

    # runs pdftotext; updates plain text of each page.
    # (not used right now, since we are using synctex instead...)
    update_text: (cb) =>
        @_exec
            command : "pdftotext"   # part of the "calibre" ubuntu package
            args    : [@filename_pdf, '-']
            cb      : (err, output) =>
                if not err
                    @_parse_text(output.stdout)
                cb?(err)

    trash_aux_files: (cb) =>
        EXT = ['aux', 'log', 'bbl', 'synctex.gz', 'sagetex.py', 'sagetex.sage', 'sagetex.scmd', 'sagetex.sout']
        @_exec
            command : "rm"
            args    : (@base_filename + "." + ext for ext in EXT)
            cb      : cb

    _parse_text: (text) =>
        # FUTURE -- parse through the text file putting the pages in the correspondings @pages dict.
        # for now... for debugging.
        @_text = text
        n = 1
        for t in text.split('\x0c')  # split on form feed
            @page(n).text = t
            n += 1

    # Updates previews for a given range of pages.
    # This computes images on backend, and fills in the sha1 hashes of @pages.
    # If any sha1 hash changes from what was already there, it gets temporary
    # url for that file.
    # It assumes the pdf files are there already, and doesn't run pdflatex.
    update_images: (opts={}) =>
        opts = defaults opts,
            first_page : 1
            last_page  : undefined  # defaults to @num_pages, unless 0 in which case 99999
            cb         : undefined  # cb(err, [array of page numbers of pages that changed])
            resolution : 50         # number
            device     : '16m'      # one of '16', '16m', '256', '48', 'alpha', 'gray', 'mono'  (ignored if image_type='jpg')
            png_downscale : 2       # ignored if image type is jpg
            jpeg_quality  : 75      # jpg only -- scale of 1 to 100


        res = opts.resolution
        if @image_type == 'png'
            res /= opts.png_downscale

        if not opts.last_page?
            opts.last_page = @num_pages
            if opts.last_page == 0
                opts.last_page = 99999

        #console.log("opts.last_page = ", opts.last_page)

        if opts.first_page <= 0
            opts.first_page = 1
        if opts.last_page > @num_pages
            opts.last_page = @num_pages

        if opts.last_page < opts.first_page
            # easy special case
            opts.cb?(false,[])
            return

        @dbg("update_images: #{opts.first_page} to #{opts.last_page} with res=#{opts.resolution}")

        tmp = undefined
        sha1_changed = []
        changed_pages = []
        pdf = undefined
        async.series([
            (cb) =>
                tmp_dir
                    project_id : @project_id
                    path       : "/tmp"
                    ttl        : 180
                    cb         : (err, _tmp) =>
                        tmp = "/tmp/#{_tmp}"
                        cb(err)
            (cb) =>
                pdf = "#{tmp}/#{@filename_pdf}"
                @_exec
                    command : 'cp'
                    args    : [@filename_pdf, pdf]
                    timeout : 15
                    err_on_exit : true
                    cb      : cb
            (cb) =>
                if @image_type == "png"
                    args = ["-r#{opts.resolution}",
                               '-dBATCH', '-dNOPAUSE',
                               "-sDEVICE=png#{opts.device}",
                               "-sOutputFile=#{tmp}/%d.png",
                               "-dFirstPage=#{opts.first_page}",
                               "-dLastPage=#{opts.last_page}",
                               "-dDownScaleFactor=#{opts.png_downscale}",
                               pdf]
                else if @image_type == "jpg"
                    args = ["-r#{opts.resolution}",
                               '-dBATCH', '-dNOPAUSE',
                               '-sDEVICE=jpeg',
                               "-sOutputFile=#{tmp}/%d.jpg",
                               "-dFirstPage=#{opts.first_page}",
                               "-dLastPage=#{opts.last_page}",
                               "-dJPEGQ=#{opts.jpeg_quality}",
                               pdf]
                else
                    cb("unknown image type #{@image_type}")
                    return

                #console.log('gs ' + args.join(" "))
                @_exec
                    command : 'gs'
                    args    : args
                    err_on_exit : true
                    timeout : 120
                    cb      : (err, output) ->
                        cb(err)

            # get the new sha1 hashes
            (cb) =>
                @_exec
                    command : "sha1sum *.png *.jpg"
                    bash    : true
                    path    : tmp
                    timeout : 15
                    cb      : (err, output) =>
                        if err
                            cb(err); return
                        for line in output.stdout.split('\n')
                            v = line.split(' ')
                            if v.length > 1
                                try
                                    filename = v[2]
                                    n = parseInt(filename.split('.')[0]) + opts.first_page - 1
                                    if @page(n).sha1 != v[0]
                                        sha1_changed.push( page_number:n, sha1:v[0], filename:filename )
                                catch e
                                    console.log("sha1sum: error parsing line=#{line}")
                        cb()

            # get the images whose sha1's changed
            (cb) =>
                #console.log("sha1_changed = ", sha1_changed)
                update = (obj, cb) =>
                    n = obj.page_number
                    salvus_client.read_file_from_project
                        project_id : @project_id
                        path       : "#{tmp}/#{obj.filename}"
                        timeout    : 10  # a single page shouldn't take long
                        cb         : (err, result) =>
                            if err
                                cb(err)
                            else if not result.url?
                                cb("no url in result for a page")
                            else
                                p = @page(n)
                                p.sha1 = obj.sha1
                                p.url = result.url
                                p.resolution = res
                                changed_pages.push(n)
                                cb()
                async.mapSeries(sha1_changed, update, cb)
        ], (err) =>
            opts.cb?(err, changed_pages)
        )

# FOR debugging only
if DEBUG
    exports.PDFLatexDocument = PDFLatexDocument

class PDF_Preview extends FileEditor
    constructor: (@project_id, @filename, contents, opts) ->
        @pdflatex = new PDFLatexDocument(project_id:@project_id, filename:@filename, image_type:"png")
        @opts = opts
        @_updating = false
        @element = templates.find(".salvus-editor-pdf-preview").clone()
        @spinner = @element.find(".salvus-editor-pdf-preview-spinner")
        s = path_split(@filename)
        @path = s.head
        if @path == ''
            @path = './'
        @file = s.tail
        @element.maxheight()
        @last_page = 0
        @output = @element.find(".salvus-editor-pdf-preview-page")
        @highlight = @element.find(".salvus-editor-pdf-preview-highlight").hide()
        @output.text("Loading preview...")
        @_first_output = true
        @_needs_update = true

    dbg: (mesg) =>
        #console.log("PDF_Preview: #{mesg}")

    zoom: (opts) =>
        opts = defaults opts,
            delta : undefined
            width : undefined

        images = @output.find("img")
        if images.length == 0
            return # nothing to do

        if opts.delta?
            if not @zoom_width?
                @zoom_width = 160   # NOTE: hardcoded also in editor.css class .salvus-editor-pdf-preview-image
            max_width = @zoom_width
            max_width += opts.delta
        else if opts.width?
            max_width = opts.width

        if max_width?
            @zoom_width = max_width
            n = @current_page().number
            max_width = "#{max_width}%"
            images.css
                'max-width'   : max_width
                width         : max_width
            @scroll_into_view(n : n, highlight_line:false, y:$(window).height()/2)

        @recenter()

    recenter: () =>
        container_width = @output.find(":first-child:first").width()
        content_width = @output.find("img:first-child:first").width()
        @output.scrollLeft((content_width - container_width)/2)

    watch_scroll: () =>
        if @_f?
            clearInterval(@_f)
        timeout = undefined
        @output.on 'scroll', () =>
            @_needs_update = true
        f = () =>
            if @_needs_update and @element.is(':visible')
                @_needs_update = false
                @update cb:(err) =>
                    if err
                        @_needs_update = true
        @_f = setInterval(f, 1000)

    highlight_middle: (fade_time) =>
        if not fade_time?
            fade_time = 5000
        @highlight.show().offset(top:$(window).height()/2)
        @highlight.stop().animate(opacity:.3).fadeOut(fade_time)

    scroll_into_view: (opts) =>
        opts = defaults opts,
            n              : required   # page
            y              : 0          # y-coordinate on page
            highlight_line : true
        pg = @pdflatex.page(opts.n)
        if not pg?
            # the page has vanished in the meantime...
            return
        t = @output.offset().top
        @output.scrollTop(0)  # reset to 0 first so that pg.element.offset().top is correct below
        top = (pg.element.offset().top + opts.y) - $(window).height() / 2
        @output.scrollTop(top)
        if opts.highlight_line
            # highlight location of interest
            @highlight_middle()

    remove: () =>
        if @_f?
            $(window).off()
            clearInterval(@_f)
        super()

    focus: () =>
        @element.maxheight()
        @output.height(@element.height())
        @output.width(@element.width())

    current_page: () =>
        tp = @output.offset().top
        for _page in @output.children()
            page = $(_page)
            offset = page.offset()
            if offset.top > tp
                n = page.data('number')
                if n > 1
                    n -= 1
                return {number:n, offset:offset.top}
        if page?
            return {number:page.data('number')}
        else
            return {number:1}

    update: (opts={}) =>
        opts = defaults opts,
            window_size : 4
            cb          : undefined

        if @_updating
            opts.cb?("already updating")  # don't change string
            return

        @dbg("update")
        #@spinner.show().spin(true)
        @_updating = true

        @output.maxheight()
        if @element.width()
            @output.width(@element.width())

        # Hide trailing pages.
        if @pdflatex.num_pages?
            @dbg("update: num_pages = #{@pdflatex.num_pages}")
            # This is O(N), but behaves better given the async nature...
            for p in @output.children()
                page = $(p)
                if page.data('number') > @pdflatex.num_pages
                    @dbg("update: removing page number #{page.data('number')}")
                    page.remove()

        n = @current_page().number
        @dbg("update: current_page=#{n}")

        f = (opts, cb) =>
            opts.cb = (err, changed_pages) =>
                if err
                    cb(err)
                else if changed_pages.length == 0
                    cb()
                else
                    g = (m, cb) =>
                        @_update_page(m, cb)
                    async.map(changed_pages, g, cb)
            @pdflatex.update_images(opts)

        hq_window = opts.window_size
        if n == 1
            hq_window *= 2

        f {first_page: n, last_page: n+1, resolution:@opts.resolution*3, device:'16m', png_downscale:3}, (err) =>
            if err
                #@spinner.spin(false).hide()
                @_updating = false
                opts.cb?(err)
            else if not @pdflatex.pdf_updated? or @pdflatex.pdf_updated
                @pdflatex.pdf_updated = false
                g = (obj, cb) =>
                    if obj[2]
                        f({first_page:obj[0], last_page:obj[1], resolution:'300', device:'16m', png_downscale:3}, cb)
                    else
                        f({first_page:obj[0], last_page:obj[1], resolution:'150', device:'gray', png_downscale:1}, cb)
                v = []
                v.push([n-hq_window, n-1, true])
                v.push([n+2, n+hq_window, true])

                k1 = Math.round((1 + n-hq_window-1)/2)
                v.push([1, k1])
                v.push([k1+1, n-hq_window-1])
                if @pdflatex.num_pages
                    k2 = Math.round((n+hq_window+1 + @pdflatex.num_pages)/2)
                    v.push([n+hq_window+1,k2])
                    v.push([k2,@pdflatex.num_pages])
                else
                    v.push([n+hq_window+1,999999])
                async.map v, g, (err) =>
                    #@spinner.spin(false).hide()
                    @_updating = false

                    # If first time, start watching for scroll movements to update.
                    if not @_f?
                        @watch_scroll()
                    opts.cb?()
            else
                @_updating = false
                opts.cb?()


    # update page n based on currently computed data.
    _update_page: (n, cb) =>
        p          = @pdflatex.page(n)
        url        = p.url
        resolution = p.resolution
        if not url?
            # delete page and all following it from DOM
            for m in [n .. @last_page]
                @output.remove(".salvus-editor-pdf-preview-page-#{m}")
            if @last_page >= n
                @last_page = n-1
        else
            @dbg("_update_page(#{n}) using #{url}")
            # update page
            recenter = (@last_page == 0)
            that = @
            page = @output.find(".salvus-editor-pdf-preview-page-#{n}")
            if page.length == 0
                # create
                for m in [@last_page+1 .. n]
                    page = $("<div class='salvus-editor-pdf-preview-page-single salvus-editor-pdf-preview-page-#{m}'><span class='lighten'>Page #{m}</span><br><img alt='Page #{m}' class='salvus-editor-pdf-preview-image'><br></div>")
                    page.data("number", m)

                    f = (e) ->
                        pg = $(e.delegateTarget)
                        n  = pg.data('number')
                        offset = $(e.target).offset()
                        x = e.pageX - offset.left
                        y = e.pageY - offset.top
                        img = pg.find("img")
                        nH = img[0].naturalHeight
                        nW = img[0].naturalWidth
                        y *= nH/img.height()
                        x *= nW/img.width()
                        that.emit 'shift-click', {n:n, x:x, y:y, resolution:img.data('resolution')}
                        return false

                    page.click (e) ->
                        if e.shiftKey or e.ctrlKey
                            f(e)
                        return false

                    page.dblclick(f)

                    if self._margin_left?
                        # A zoom was set via the zoom command -- maintain it.
                        page.find("img").css
                            'max-width'   : self._max_width
                            width         : self._max_width

                    if @_first_output
                        @output.empty()
                        @_first_output = false

                    # Insert page in the right place in the output.  Since page creation
                    # can happen in parallel/random order (esp because of deletes of trailing pages),
                    # we have to work at this a bit.
                    done = false
                    for p in @output.children()
                        pg = $(p)
                        if pg.data('number') > m
                            page.insertBefore(pg)
                            done = true
                            break
                    if not done
                        @output.append(page)

                    @pdflatex.page(m).element = page

                @last_page = n
            img =  page.find("img")
            #console.log("setting an img src to", url)
            img.attr('src', url).data('resolution', resolution)
            load_error = () ->
                img.off('error', load_error)
                setTimeout((()->img.attr('src',url)), 2000)
            img.on('error', load_error)

            if recenter
                img.one 'load', () =>
                    @recenter()

            if @zoom_width?
                max_width = @zoom_width
                max_width = "#{max_width}%"
                img.css
                    'max-width'   : max_width
                    width         : max_width

            #page.find(".salvus-editor-pdf-preview-text").text(p.text)
        cb()

    show: (geometry={}) =>
        geometry = defaults geometry,
            left   : undefined
            top    : undefined
            width  : $(window).width()
            height : undefined
        if not @is_active()
            return

        @element.show()

        f = () =>
            @element.width(geometry.width)
            @element.offset
                left : geometry.left
                top  : geometry.top

            if geometry.height?
                @element.height(geometry.height)
            else
                @element.maxheight()
                geometry.height = @element.height()

            @focus()
        # We wait a tick for the element to appear before positioning it, otherwise it
        # can randomly get messed up.
        setTimeout(f, 1)

    hide: () =>
        @element.hide()

exports.PDF_Preview = PDF_Preview

class PDF_PreviewEmbed extends FileEditor
    constructor: (@project_id, @filename, contents, @opts) ->
        @element = templates.find(".salvus-editor-pdf-preview-embed").clone()
        @pdf_title = @element.find(".salvus-editor-pdf-title")
        @pdf_title.find("span").text("loading ...")

        @spinner = @element.find(".salvus-editor-pdf-preview-embed-spinner")

        s = path_split(@filename)
        @path = s.head
        if @path == ''
            @path = './'
        @file = s.tail

        @output = @element.find(".salvus-editor-pdf-preview-embed-page")

        @element.find("a[href=\"#refresh\"]").click () =>
            @update()
            return false

    focus: () =>

    update: (cb) =>
        height = @element.height()
        if height == 0
            # not visible.
            return
        width = @element.width()

        button = @element.find("a[href=\"#refresh\"]")
        button.icon_spin(true)

        @_last_width = width
        @_last_height = height

        output_height = height - (@output.offset().top - @element.offset().top)
        @output.height(output_height)
        @output.width(width)

        @spinner.show().spin(true)
        salvus_client.read_file_from_project
            project_id : @project_id
            path       : @filename
            timeout    : 20
            cb         : (err, result) =>
                button.icon_spin(false)
                @spinner.spin(false).hide()
                if err or not result.url?
                    alert_message(type:"error", message:"unable to get pdf -- #{err}")
                else
                    @pdf_title.find("span").text(@filename)
                    @pdf_title.attr('target', '_blank').attr("href", result.url)
                    @output.find("iframe").attr('src', result.url).width(width).height(output_height-10)
                    @output.find("a").attr('href',"#{result.url}?random=#{Math.random()}")
                    @output.find("span").text(@filename)

    mount : () =>
        if not @mounted
            $(document.body).append(@element)
            @mounted = true
        return @mounted

    show: (geometry={}) =>
        geometry = defaults geometry,
            left   : undefined
            top    : undefined
            width  : $(window).width()
            height : undefined

        @element.show()
        if not geometry.top?
            @element.css(top: redux.getProjectStore(@project_id).get('editor_top_position'))

        if geometry.height?
            @element.height(geometry.height)
        else
            @element.maxheight()
            geometry.height = @element.height()

        @element.width(geometry.width)

        @element.offset
            left : geometry.left
            top  : geometry.top

        if @_last_width != geometry.width or @_last_height != geometry.height
            @update()

        @focus()

    hide: () =>
        @element.hide()

exports.PDF_PreviewEmbed = PDF_PreviewEmbed

class Terminal extends FileEditor
    constructor: (@project_id, @filename, content, opts) ->
        @element = $("<div>").hide()
        elt = @element.salvus_console
            title     : "Terminal"
            filename  : @filename
            project_id: @project_id
            resizable : false
            editor    : @
        @console = elt.data("console")
        @element = @console.element
        salvus_client.read_text_file_from_project
            project_id : @project_id
            path       : @filename
            cb         : (err, result) =>
                if err
                    alert_message(type:"error", message: "Error connecting to console server -- #{err}")
                else
                    # New session or connect to session
                    if result.content? and result.content.length < 36
                        # empty/corrupted -- messed up by bug in early version of SMC...
                        delete result.content
                    @opts = defaults opts,
                        session_uuid : result.content
                    @connect_to_server()

    connect_to_server: (cb) =>
        mesg =
            timeout    : 30  # just for making the connection; not the timeout of the session itself!
            type       : 'console'
            project_id : @project_id
            cb : (err, session) =>
                if err
                    alert_message(type:'error', message:err)
                    cb?(err)
                else
                    if @element.is(":visible")
                        @show()
                    @console.set_session(session)
                    @opts.session_uuid = session.session_uuid
                    salvus_client.write_text_file_to_project
                        project_id : @project_id
                        path       : @filename
                        content    : session.session_uuid
                        cb         : cb

        path = misc.path_split(@filename).head
        mesg.params  = {command:'bash', rows:@opts.rows, cols:@opts.cols, path:path, filename:@filename}
        if @opts.session_uuid?
            mesg.session_uuid = @opts.session_uuid
            salvus_client.connect_to_session(mesg)
        else
            salvus_client.new_session(mesg)


    _get: () =>  # FUTURE ??
        return @opts.session_uuid ? ''

    _set: (content) =>  # FUTURE ??

    save: (cb) =>
        # DO nothing -- a no-op for now
        # FUTURE: Add notion of history
        cb?()

    focus: () =>
        @console?.focus()

    blur: () =>
        @console?.blur()

    terminate_session: () =>

    remove: () =>
        @element.salvus_console(false)
        super()

    hide : () =>
        if @console?
            @element?.hide()
            @console.blur()

    _show: () =>
        if @console?
            e = $(@console.terminal.element)
            top = redux.getProjectStore(@project_id).get('editor_top_position') + @element.find(".salvus-console-topbar").height()
            # We leave a gap at the bottom of the screen, because often the
            # cursor is at the bottom, but tooltips, etc., would cover that
            ht = $(window).height() - top - 6
            if feature.isMobile.iOS()
                ht = Math.floor(ht/2)
            e.height(ht)
            @element.css(left:0, top:redux.getProjectStore(@project_id).get('editor_top_position'), position:'fixed')   # HACK: this is hack-ish; needs to be redone!
            @console.focus(true)

class Image extends FileEditor
    constructor: (@project_id, @filename, url, @opts) ->
        @element = templates.find(".salvus-editor-image").clone()
        @element.find(".salvus-editor-image-title").text(@filename)

        refresh = @element.find("a[href=\"#refresh\"]")
        refresh.click () =>
            refresh.icon_spin(true)
            @update (err) =>
                refresh.icon_spin(false)
            return false

        @element.find("a[href=\"#close\"]").click () =>
            return false

        if url?
            @element.find(".salvus-editor-image-container").find("span").hide()
            @element.find("img").attr('src', url)
        else
            @update()

    update: (cb) =>
        @element.find("a[href=\"#refresh\"]").icon_spin(start:true)
        salvus_client.read_file_from_project
            project_id : @project_id
            timeout    : 30
            path       : @filename
            cb         : (err, mesg) =>
                @element.find("a[href=\"#refresh\"]").icon_spin(false)
                @element.find(".salvus-editor-image-container").find("span").hide()
                if err
                    alert_message(type:"error", message:"Communications issue loading #{@filename} -- #{err}")
                    cb?(err)
                else if mesg.event == 'error'
                    alert_message(type:"error", message:"Error getting #{@filename} -- #{to_json(mesg.error)}")
                    cb?(mesg.event)
                else
                    @element.find("img").attr('src', mesg.url + "?random=#{Math.random()}")
                    cb?()

    show: () =>
        if not @is_active()
            return
        @element.show()
        @element.css(top: redux.getProjectStore(@project_id).get('editor_top_position'))
        @element.maxheight()



class PublicHTML extends FileEditor
    constructor: (@project_id, @filename, @content, opts) ->
        @element = templates.find(".salvus-editor-static-html").clone()
        if not @content?
            @content = 'Loading...'
            # Now load the content from the backend...
            salvus_client.public_get_text_file
                project_id : @project_id
                path       : @filename
                timeout    : 60
                cb         : (err, content) =>
                    if err
                        @content = "Error opening file -- #{err}"
                    else
                        @content = content
                    if @iframe?
                        @set_iframe()

    show: () =>
        if not @is_active()
            return
        if not @iframe?
            # Setting the iframe in the *next* tick is critical on Firefox; otherwise, the browser
            # just deletes what we set.  I do not claim to fully understand why, but this does work.
            # See https://github.com/sagemathinc/smc/issues/843
            # -- wstein
            setTimeout(@set_iframe, 1)
        else
            @set_iframe()
        @element.show()
        #  redux.getProjectStore(@project_id).get('editor_top_position'))
        @element.maxheight(offset:18)

    set_iframe: () =>
        @iframe = @element.find(".salvus-editor-static-html-content").find('iframe')
        # We do this, since otherwise just loading the iframe using
        #      @iframe.contents().find('html').html(@content)
        # messes up the parent html page...
        @iframe.contents().find('body')[0].innerHTML = @content
        @iframe.contents().find('body').find("a").attr('target','_blank')
        @iframe.maxheight()

class PublicCodeMirrorEditor extends CodeMirrorEditor
    constructor: (@project_id, @filename, content, opts, cb) ->
        opts.read_only = true
        opts.public_access = true
        super(@project_id, @filename, "Loading...", opts)
        @element.find("a[href=\"#save\"]").hide()       # no need to even put in the button for published
        @element.find("a[href=\"#readonly\"]").hide()   # ...
        salvus_client.public_get_text_file
            project_id : @project_id
            path       : @filename
            timeout    : 60
            cb         : (err, content) =>
                if err
                    content = "Error opening file -- #{err}"
                @_set(content)
                cb?(err)

class PublicSagews extends PublicCodeMirrorEditor
    constructor: (@project_id, @filename, content, opts) ->
        opts.allow_javascript_eval = false
        super @project_id, @filename, content, opts, (err) =>
            @element.find("a[href=\"#split-view\"]").hide()  # disable split view
            if not err
                @syncdoc = new (sagews.SynchronizedWorksheet)(@, {static_viewer:true})
                @syncdoc.process_sage_updates()
                @syncdoc.init_hide_show_gutter()

class FileEditorWrapper extends FileEditor
    constructor: (@project_id, @filename, @content, @opts) ->
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
        @element.css(top:redux.getProjectStore(@project_id).get('editor_top_position'))

        if IS_MOBILE
            @element.css(position:'relative')
        else
            @element.css(position:'fixed')
        @wrapped?.show?()

    hide: () =>
        @element?.hide()
        @wrapped?.hide?()

###
# Task list
###

class TaskList extends FileEditorWrapper
    init_wrapped: () =>
        @element = $("<div><span>&nbsp;&nbsp;Loading...</span></div>")
        require.ensure [], () =>
            tasks = require('./tasks')
            elt = tasks.task_list(@project_id, @filename, {})
            @element.replaceWith(elt)
            @element = elt
            @wrapped = elt.data('task_list')
            @show()  # need to do this due to async loading -- otherwise once it appears it isn't the right size, which is BAD.

    mount : () =>
        if not @mounted
            $(document.body).append(@element)
            @mounted = true
        return @mounted

###
# Jupyter notebook
###
jupyter = require('./editor_jupyter')

class JupyterNotebook extends FileEditorWrapper
    init_wrapped: () =>
        @init_font_size() # get the @default_font_size
        # console.log("JupyterNotebook@default_font_size: #{@default_font_size}")
        @opts.default_font_size = @default_font_size
        @element = jupyter.jupyter_notebook(@, @filename, @opts)
        @wrapped = @element.data('jupyter_notebook')

    mount : () =>
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
    constructor: (@project_id, @filename, @content, opts) ->
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
                             window.smc_base_url,
                             @project_id,
                             'raw',
                             @filename)
            # for testing, set it to a src like this: (smc-in-smc doesn't work for published files, since it
            # still requires the user to be logged in with access to the host project)
            #ipynb_src = 'cloud.sagemath.com/14eed217-2d3c-4975-a381-b69edcb40e0e/raw/scratch/1_notmnist.ipynb'
            @iframe.attr('src', "//nbviewer.jupyter.org/urls/#{ipynb_src}")
        @element.show()
        @element.css(top:redux.getProjectStore(@project_id).get('editor_top_position'))
        @element.maxheight(offset:18)
        @iframe.maxheight()

{HTML_MD_Editor} = require('./editor-html-md/editor-html-md')

{LatexEditor} = require('./editor_latex')

exports.register_nonreact_editors = () ->

    # Make non-react editors available in react rewrite
    reg = require('./editor_react_wrapper').register_nonreact_editor

    reg
        ext : ''  # fallback for any type not otherwise explicitly specified
        f   : (project_id, path, opts) -> codemirror_session_editor(project_id, path, opts)
        is_public : false

    # Editors for private normal editable files.
    reg0 = (cls, extensions) ->
        icon = file_icon_class(extensions[0])
        reg
            ext       : extensions
            is_public : false
            icon      : icon
            f         : (project_id, path, opts) -> new cls(project_id, path, undefined, opts)

    reg0 HTML_MD_Editor,   ['md', 'html', 'htm']
    reg0 LatexEditor,      ['tex']
    reg0 Terminal,         ['term', 'sage-term']
    reg0 Image,            ['png', 'jpg', 'gif', 'svg']

    {HistoryEditor} = require('./editor_history')
    reg0 HistoryEditor,    ['sage-history']
    reg0 PDF_PreviewEmbed, ['pdf']
    reg0 TaskList,         ['tasks']
    reg0 JupyterNotebook,  ['ipynb']

    # "Editors" for read-only public files
    reg1 = (cls, extensions) ->
        icon = file_icon_class(extensions[0])
        reg
            ext       : extensions
            is_public : true
            icon      : icon
            f         : (project_id, path, opts) -> new cls(project_id, path, undefined, opts)

    reg1 PublicCodeMirrorEditor,  ['']
    reg1 PublicHTML,              ['html']
    reg1 PublicSagews,            ['sagews']
    reg1 JupyterNBViewerEmbedded, ['ipynb']
