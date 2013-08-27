##################################################
# Editor for files in a project
##################################################

async = require('async')

message = require('message')

{salvus_client} = require('salvus_client')
{EventEmitter}  = require('events')
{alert_message} = require('alerts')

feature = require("feature")
IS_MOBILE = feature.IS_MOBILE

misc = require('misc')
# TODO: undo doing the import below -- just use misc.[stuff] is more readable.
{copy, trunc, from_json, to_json, keys, defaults, required, filename_extension, len, path_split, uuid} = require('misc')

syncdoc = require('syncdoc')

top_navbar =  $(".salvus-top_navbar")

codemirror_associations =
    c      : 'text/x-c'
    'c++'  : 'text/x-c++src'
    cpp    : 'text/x-c++src'
    cc     : 'text/x-c++src'
    csharp : 'text/x-csharp'
    'c#'   : 'text/x-csharp'
    coffee : 'coffeescript'
    css    : 'css'
    diff   : 'text/x-diff'
    ecl    : 'ecl'
    f      : 'python'    # Ondrej Certik says Python modes sucks less than other modes, but it still sucks.
    f90    : 'python'
    f95    : 'python'
    h      : 'text/x-c++hdr'
    html   : 'htmlmixed'
    java   : 'text/x-java'
    js     : 'javascript'
    lua    : 'lua'
    md     : 'markdown'
    patch  : 'text/x-diff'
    php    : 'php'
    py     : 'python'
    pyx    : 'python'
    pl     : 'text/x-perl'
    r      : 'r'
    rst    : 'rst'
    rb     : 'text/x-ruby'
    sage   : 'python'
    sagews : 'sagews'
    scala  : 'text/x-scala'
    sh     : 'shell'
    spyx   : 'python'
    sql    : 'mysql'
    txt    : 'text'
    tex    : 'stex'
    bib    : 'stex'
    bbl    : 'stex'
    xml    : 'xml'
    yaml   : 'yaml'
    ''     : 'text'

file_associations = exports.file_associations = {}
for ext, mode of codemirror_associations
    file_associations[ext] =
        editor : 'codemirror'
        opts   : {mode:mode}

file_associations['tex'] =
    editor : 'latex'
    icon   : 'icon-edit'
    opts   : {mode:'stex', indent_unit:4, tab_size:4}

file_associations['html'] =
    editor : 'codemirror'
    icon   : 'icon-edit'
    opts   : {mode:'htmlmixed', indent_unit:4, tab_size:4}

file_associations['css'] =
    editor : 'codemirror'
    icon   : 'icon-edit'
    opts   : {mode:'css', indent_unit:4, tab_size:4}

file_associations['sage-terminal'] =
    editor : 'terminal'
    icon   : 'icon-credit-card'
    opts   : {}

file_associations['term'] =
    editor : 'terminal'
    icon   : 'icon-credit-card'
    opts   : {}

file_associations['sage-worksheet'] =
    editor : 'worksheet'
    icon   : 'icon-list-ul'
    opts   : {}

file_associations['sage-spreadsheet'] =
    editor : 'spreadsheet'
    opts   : {}

file_associations['sage-slideshow'] =
    editor : 'slideshow'
    opts   : {}

for ext in ['png', 'jpg', 'gif', 'svg']
    file_associations[ext] =
        editor : 'image'
        opts   : {}

file_associations['pdf'] =
    editor : 'pdf'
    opts   : {}


# Multiplex'd worksheet mode

MARKERS = require('diffsync').MARKERS

sagews_decorator_modes = [
    ['coffeescript', 'coffeescript'],
    ['cython'      , 'python'],
    ['file'        , 'text'],
    ['html'        , 'htmlmixed'],
    ['javascript'  , 'javascript'],
    ['latex'       , 'stex']
    ['lisp'        , 'ecl'],
    ['md'          , 'markdown'],
    ['perl'        , 'text/x-perl'],
    ['python3'     , 'python'],
    ['python'      , 'python'],
    ['ruby'        , 'text/x-ruby'],   # !! more specific name must be first or get mismatch!
    ['r'           , 'r'],
    ['sage'        , 'python'],
    ['script'      , 'shell'],
    ['sh'          , 'shell'],
]

CodeMirror.defineMode "sagews", (config) ->
    options = []
    for x in sagews_decorator_modes
        options.push(open:"%" + x[0], close : MARKERS.cell, mode : CodeMirror.getMode(config, x[1]))
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "python"), options...)

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

templates = $("#salvus-editor-templates")

class exports.Editor
    constructor: (opts) ->
        opts = defaults opts,
            project_page   : required
            initial_files : undefined # if given, attempt to open these files on creation
            counter       : undefined # if given, is a jQuery set of DOM objs to set to the number of open files

        @counter = opts.counter

        @project_page  = opts.project_page
        @project_path = opts.project_page.project.location.path
        @project_id = opts.project_page.project.project_id
        @element = templates.find(".salvus-editor").clone().show()


        @nav_tabs = @element.find(".nav-pills")

        @tabs = {}   # filename:{useful stuff}

        @init_openfile_search()
        @init_close_all_tabs_button()

        @element.find("a[href=#save-all]").click () =>
            @save()
            return false

        if opts.initial_files?
            for filename in opts.initial_files
                @open(filename)

        # TODO -- maybe neither of these get freed properly when project is closed.
        # Also -- it's a bit weird to call them even if project not currently visible.
        # Add resize trigger
        $(window).resize(@_window_resize_while_editing)

        $(document).on 'keyup', (ev) =>
            if (ev.metaKey or ev.ctrlKey) and ev.keyCode == 79
                @focus()
                @project_page.display_tab("project-editor")
                return false


    focus: () =>
        @hide_editor_content()
        @show_recent_file_list()
        @element.find(".salvus-editor-search-openfiles-input").focus()

    hide_editor_content: () =>
        @_editor_content_visible = false
        @element.find(".salvus-editor-content").hide()

    show_editor_content: () =>
        @_editor_content_visible = true
        @element.find(".salvus-editor-content").show()
        # temporary / ugly
        for tab in @project_page.tabs
            tab.label.removeClass('active')

        @project_page.container.css('position', 'fixed')


    # Used for resizing editor windows.
    editor_top_position: () =>
        if $(".salvus-fullscreen-activate").is(":visible")
            return @element.find(".salvus-editor-content").position().top
        else
            return 0

    refresh: () =>
        @_window_resize_while_editing()

    _window_resize_while_editing: () =>
        @resize_open_file_tabs()
        if not @active_tab? or not @_editor_content_visible
            return
        @active_tab.editor().show()

    init_close_all_tabs_button: () =>
        @element.find("a[href=#close-all-tabs]").click () =>
            v = []
            for filename, tab of @tabs
                @close(filename)
                @remove_from_recent(filename)
                v.push(filename)
            undo = @element.find("a[href=#undo-close-all-tabs]")
            undo.stop().show().animate(opacity:100).fadeOut(duration:60000).click () =>
                undo.hide()
                for filename in v
                    if not @tabs[filename]?
                        @create_tab(filename:filename)
                return false
            alert_message(type:'info', message:"Closed all recently opened files.")
            return false

    init_openfile_search: () =>
        search_box = @element.find(".salvus-editor-search-openfiles-input")
        include = 'active' #salvus-editor-openfile-included-in-search'
        exclude = 'salvus-editor-openfile-excluded-from-search'
        search_box.focus () =>
            search_box.select()

        search_box.keyup (event) =>
            @active_tab?.editor().hide()

            if (event.metaKey or event.ctrlKey) and event.keyCode == 79     # control-o
                @project_page.display_tab("project-new-file")
                return false

            if event.keyCode == 27  and @active_tab? # escape - open last viewed tab
                @display_tab(path:@active_tab.filename)
                return

            v = $.trim(search_box.val()).toLowerCase()
            if v == ""
                for filename, tab of @tabs
                    tab.link.removeClass(include)
                    tab.link.removeClass(exclude)
                match = (s) -> true
            else
                terms = v.split(' ')
                match = (s) ->
                    s = s.toLowerCase()
                    for t in terms
                        if s.indexOf(t) == -1
                            return false
                    return true

            first = true

            for link in @nav_tabs.children()
                tab = $(link).data('tab')
                filename = tab.filename
                if match(filename)
                    if first and event.keyCode == 13 # enter -- select first match (if any)
                        @display_tab(path:filename)
                        first = false
                    if v != ""
                        tab.link.addClass(include); tab.link.removeClass(exclude)
                else
                    if v != ""
                        tab.link.addClass(exclude); tab.link.removeClass(include)

    update_counter: () =>
        if @counter?
            @counter.text(len(@tabs))

    open: (filename, cb) =>   # cb(err, actual_opened_filename)
        if not filename?
            cb("BUG -- open(undefined) makes no sense")
            return

        if filename == ".sagemathcloud.log"
            cb("You can only edit '.sagemathcloud.log' via the terminal.")
            return

        if filename_extension(filename).toLowerCase() == "sws"   # sagenb worksheet
            alert_message(type:"info",message:"Opening converted Sagemath Cloud worksheet file instead of '#{filename}...")
            @convert_sagenb_worksheet filename, (err, sagews_filename) =>
                if not err
                    @open(sagews_filename, cb)
                else
                    cb("Error converting Sage Notebook sws file -- #{err}")
            return

        if filename_extension(filename).toLowerCase() == "docx"   # Microsoft Word Document
            alert_message(type:"info", message:"Opening converted plane text file instead of '#{filename}...")
            @convert_docx_file filename, (err, new_filename) =>
                if not err
                    @open(new_filename, cb)
                else
                    cb("Error converting Microsoft Docx file -- #{err}")
            return

        if not @tabs[filename]?   # if it is defined, then nothing to do -- file already loaded
            @tabs[filename] = @create_tab(filename:filename)

        cb(false, filename)

    convert_sagenb_worksheet: (filename, cb) =>
        salvus_client.exec
            project_id : @project_id
            command    : "sws2sagews.py"
            args       : [filename]
            cb         : (err, output) =>
                if err
                    cb("#{err}, #{misc.to_json(output)}")
                else
                    cb(false, filename.slice(0,filename.length-3) + 'sagews')

    convert_docx_file: (filename, cb) =>
        salvus_client.exec
            project_id : @project_id
            command    : "docx2txt.py"
            args       : [filename]
            cb         : (err, output) =>
                if err
                    cb("#{err}, #{misc.to_json(output)}")
                else
                    cb(false, filename.slice(0,filename.length-4) + 'txt')

    file_options: (filename, content) =>   # content may be undefined
        ext = filename_extension(filename)?.toLowerCase()
        if not ext? and content?   # no recognized extension, but have contents
            ext = guess_file_extension_type(content)
        x = file_associations[ext]
        if not x?
            x = file_associations['']
        return x

    create_tab: (opts) =>
        opts = defaults opts,
            filename     : required
            content      : undefined

        filename = opts.filename
        if @tabs[filename]?
            return @tabs[filename]

        content = opts.content
        opts0 = @file_options(filename, content)
        extra_opts = copy(opts0.opts)
        if opts.session_uuid?
            extra_opts.session_uuid = opts.session_uuid

        local_storage(@project_id, filename, "auto_open", true)

        link = templates.find(".salvus-editor-filename-pill").clone().show()
        link_filename = link.find(".salvus-editor-tab-filename")
        link_filename.text(trunc(filename,64))

        link.find(".salvus-editor-close-button-x").click () =>
            if ignore_clicks
                return false
            @close(filename)
            @remove_from_recent(filename)

        containing_path = misc.path_split(filename).head
        ignore_clicks = false
        link.find("a").mousedown (e) =>
            if ignore_clicks
                return false
            foreground = not(e.which==2 or e.ctrlKey)
            @display_tab(path:link_filename.text(), foreground:foreground)
            if foreground
                @project_page.set_current_path(containing_path)

        create_editor_opts =
            editor_name : opts0.editor
            filename    : filename
            content     : content
            extra_opts  : extra_opts

        editor = undefined
        @tabs[filename] =
            link     : link
            filename : filename
            editor   : () =>
                if editor?
                    return editor
                else
                    editor = @create_editor(create_editor_opts)
                    @element.find(".salvus-editor-content").append(editor.element.hide())
                    @create_opened_file_tab(filename)
                    return editor
            hide_editor: () -> editor?.hide()
            editor_open : ()->editor?
            close_editor: () ->
                if editor?
                    editor.disconnect_from_session()
                    editor.remove()
                editor = undefined
                # We do *NOT* want to recreate the editor next time it is opened with the *same* options, or we
                # will end up overwriting it with stale contents.
                delete create_editor_opts.content


        link.data('tab', @tabs[filename])
        ###
        link.draggable
            zIndex      : 1000
            #containment : @element
            stop        : () =>
                ignore_clicks = true
                setTimeout( (() -> ignore_clicks=false), 100)
        ###

        @nav_tabs.append(link)

        @update_counter()
        return @tabs[filename]

    create_editor: (opts) =>
        {editor_name, filename, content, extra_opts} = defaults opts,
            editor_name : required
            filename    : required
            content     : undefined
            extra_opts  : required

        if editor_name == 'codemirror'
            if filename.slice(filename.length-7) == '.sagews'
                typ = 'worksheet'  # TODO: only because we don't use Worksheet below anymore
            else
                typ = 'file'
        else
            typ = editor_name
        @project_page.project_activity({event:'open', filename:filename, type:typ})


        # Some of the editors below might get the content later and will call @file_options again then.
        switch editor_name
            # codemirror is the default... TODO: JSON, since I have that jsoneditor plugin.
            when 'codemirror', undefined
                editor = codemirror_session_editor(@, filename, extra_opts)
            when 'terminal'
                editor = new Terminal(@, filename, content, extra_opts)
            when 'worksheet'
                editor = new Worksheet(@, filename, content, extra_opts)
            when 'spreadsheet'
                editor = new Spreadsheet(@, filename, content, extra_opts)
            when 'slideshow'
                editor = new Slideshow(@, filename, content, extra_opts)
            when 'image'
                editor = new Image(@, filename, content, extra_opts)
            when 'latex'
                editor = new LatexEditor(@, filename, content, extra_opts)
            when 'pdf'
                editor = new PDF_PreviewEmbed(@, filename, content, extra_opts)
            else
                throw("Unknown editor type '#{editor_name}'")

        return editor

    create_opened_file_tab: (filename) =>
        link_bar = @project_page.container.find(".project-pages")

        link = templates.find(".salvus-editor-filename-pill").clone()
        link.tooltip(title:filename, placement:'bottom', delay:{show: 500, hide: 0})

        link.data('name', filename)

        link_filename = link.find(".salvus-editor-tab-filename")
        display_name = path_split(filename).tail
        link_filename.text(display_name)

        open_file = (name) =>
            @project_page.set_current_path(misc.path_split(name).head)
            @project_page.display_tab("project-editor")
            @display_tab(path:name)

        close_tab = () =>
            if ignore_clicks
                return false

            if @active_tab? and @active_tab.filename == filename
                @active_tab = undefined

            if not @active_tab?
                next = link.next()
                # skip past div's inserted by tooltips
                while next.is("div")
                    next = next.next()
                name = next.data('name')  # need li selector because tooltip inserts itself after in DOM
                if name?
                    open_file(name)

            link.tooltip('destroy')
            link.hide()
            link.remove()

            if not @active_tab?
                # open last file if there is one
                next_link = link_bar.find("li").last()
                name = next_link.data('name')
                if name?
                    open_file(name)
                else
                    # just show the recent files
                    @project_page.display_tab('project-editor')

            tab = @tabs[filename]
            if tab?
                if tab.open_file_pill?
                    delete tab.open_file_pill
                tab.editor().disconnect_from_session()
                tab.close_editor()

            @resize_open_file_tabs()
            return false

        link.find(".salvus-editor-close-button-x").click(close_tab)

        ignore_clicks = false
        link.find("a").mousedown (e) =>
            if ignore_clicks
                return false
            if e.which==2 or e.ctrlKey
                # middle (or control-) click on open tab: close the editor
                close_tab()
                return false
            open_file(filename)
            return false

        #link.draggable
        #    zIndex      : 1000
        #    containment : "parent"
        #    stop        : () =>
        #        ignore_clicks = true
        #        setTimeout( (() -> ignore_clicks=false), 100)

        @tabs[filename].open_file_pill = link

        link_bar.append(link)
        @resize_open_file_tabs()

    open_file_tabs: () =>
        x = []
        file_tabs = false
        for a in @project_page.container.find(".project-pages").children()
            t = $(a)
            if t.hasClass("project-search-menu-item")
                file_tabs = true
                continue
            else if file_tabs and t.hasClass("salvus-editor-filename-pill")
                x.push(t)
        return x

    close_all_open_files: () =>
        for filename, tab of @tabs
            tab.close_editor()

    resize_open_file_tabs: () =>
        # Make a list of the tabs after the search menu.
        x = @open_file_tabs()
        if x.length == 0
            return

        # Determine the width
        if $(window).width() <= 979
            # responsive mode
            width = 204
        else
            start = x[0].offset().left
            end   = x[0].parent().offset().left + x[0].parent().width()

            n = x.length
            if n <= 2
                n = 3
            width = (end - start - 10)/n
            if width < 0
                width = 0

        for a in x
            a.width(width)

    make_open_file_pill_active: (link) =>
        @project_page.container.find(".project-pages").children().removeClass('active')
        link.addClass('active')

    # Close this tab.
    close: (filename) =>
        tab = @tabs[filename]
        if not tab? # nothing to do -- tab isn't opened anymore
            return

        # Disconnect from remote session (if relevant)
        if tab.editor_open()
            tab.editor().disconnect_from_session()
            tab.editor().remove()

        tab.link.remove()
        delete @tabs[filename]
        @update_counter()

    remove_from_recent: (filename) =>
        # Do not show this file in "recent" next time.
        local_storage_delete(@project_id, filename, "auto_open")


    # Reload content of this tab.  Warn user if this will result in changes.
    reload: (filename) =>
        tab = @tabs[filename]
        if not tab? # nothing to do
            return
        salvus_client.read_text_file_from_project
            project_id : @project_id
            timeout    : 5
            path       : filename
            cb         : (err, mesg) =>
                if err
                    alert_message(type:"error", message:"Communications issue loading new version of #{filename} -- #{err}")
                else if mesg.event == 'error'
                    alert_message(type:"error", message:"Error loading new version of #{filename} -- #{to_json(mesg.error)}")
                else
                    current_content = tab.editor().val()
                    new_content = mesg.content
                    if current_content != new_content
                        @warn_user filename, (proceed) =>
                            if proceed
                                tab.editor().val(new_content)

    # Warn user about unsaved changes (modal)
    warn_user: (filename, cb) =>
        cb(true)

    hide_recent_file_list: () =>
        $(".salvus-editor-recent-files").hide()
        $(".project-editor-recent-files-header").hide()

    show_recent_file_list: () =>
        $(".salvus-editor-recent-files").show()
        $(".project-editor-recent-files-header").show()

    # Make the tab appear in the tabs at the top, and if foreground=true, also make that tab active.
    display_tab: (opts) =>
        opts = defaults opts,
            path       : required
            foreground : true      # display in foreground as soon as possible

        filename = opts.path

        if not @tabs[filename]?
            return

        if opts.foreground
            @hide_recent_file_list()
            @show_editor_content()

        prev_active_tab = @active_tab
        for name, tab of @tabs
            if name == filename
                @active_tab = tab
                ed = tab.editor()

                if opts.foreground
                    ed.show()
                    setTimeout((() -> ed.show(); ed.focus()), 100)
                    @element.find(".btn-group").children().removeClass('disabled')

                top_link = @active_tab.open_file_pill
                if top_link?
                    if opts.foreground
                        @make_open_file_pill_active(top_link)
                else
                    @create_opened_file_tab(filename)
                    if opts.foreground
                        @make_open_file_pill_active(@active_tab.open_file_pill)
            else
                tab.hide_editor()

        if prev_active_tab? and prev_active_tab.filename != @active_tab.filename and @tabs[prev_active_tab.filename]?   # ensure is still open!
            @nav_tabs.prepend(prev_active_tab.link)

    add_tab_to_navbar: (filename) =>
        navbar = require('top_navbar').top_navbar
        tab = @tabs[filename]
        if not tab?
            return
        id = @project_id + filename
        if not navbar.pages[id]?
            navbar.add_page
                id     : id
                label  : misc.path_split(filename).tail
                onshow : () =>
                    navbar.switch_to_page(@project_id)
                    @display_tab(path:filename)
                    navbar.make_button_active(id)

    onshow: () =>  # should be called when the editor is shown.
        #if @active_tab?
        #    @display_tab(@active_tab.filename)
        if not IS_MOBILE
            @element.find(".salvus-editor-search-openfiles-input").focus()

    # Save the file to disk/repo
    save: (filename, cb) =>       # cb(err)
        if not filename?  # if filename not given, save all *open* files
            tasks = []
            for filename, tab of @tabs
                if tab.editor_open()
                    f = (c) =>
                        @save(arguments.callee.filename, c)
                    f.filename = filename
                    tasks.push(f)
            async.parallel(tasks, cb)
            return

        tab = @tabs[filename]
        if not tab?
            cb?()
            return

        if not tab.editor().has_unsaved_changes()
            # nothing to save
            cb?()
            return

        tab.editor().save(cb)

    change_tab_filename: (old_filename, new_filename) =>
        tab = @tabs[old_filename]
        if not tab?
            # TODO -- fail silently or this?
            alert_message(type:"error", message:"change_tab_filename (bug): attempt to change #{old_filename} to #{new_filename}, but there is no tab #{old_filename}")
            return
        tab.filename = new_filename
        tab.link.find(".salvus-editor-tab-filename").text(new_filename)
        delete @tabs[old_filename]
        @tabs[new_filename] = tab


###############################################
# Abstract base class for editors
###############################################
# Derived classes must:
#    (1) implement the _get and _set methods
#    (2) show/hide/remove
#
# Events ensure that *all* users editor the same file see the same
# thing (synchronized).
#

class FileEditor extends EventEmitter
    constructor: (@editor, @filename, content, opts) ->
        @val(content)

    init_autosave: () =>
        if @_autosave_interval?
            # This function can safely be called again to *adjust* the
            # autosave interval, in case user changes the settings.
            clearInterval(@_autosave_interval)

        # Use the most recent autosave value.
        autosave = require('account').account_settings.settings.autosave
        if autosave
            save_if_changed = () =>
                if not @editor.tabs[@filename]?
                    # don't autosave anymore if the doc is closed
                    clearInterval(@_autosave_interval)
                    return
                if @has_unsaved_changes()
                    if @click_save_button?
                        # nice gui feedback
                        @click_save_button()
                    else
                        @save()
            @_autosave_interval = setInterval(save_if_changed, autosave * 1000)

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
            @_has_unsaved_changes = val

    focus: () => # TODO in derived class

    _get: () =>
        throw("TODO: implement _get in derived class")

    _set: (content) =>
        throw("TODO: implement _set in derived class")

    restore_cursor_position: () =>
        # implement in a derived class if you need this

    disconnect_from_session: (cb) =>
        # implement in a derived class if you need this

    local_storage: (key, value) =>
        return local_storage(@editor.project_id, @filename, key, value)

    show: () =>
        @element.show()

    hide: () =>
        @element.hide()

    remove: () =>
        @element.remove()

    terminate_session: () =>
        # If some backend session on a remote machine is serving this session, terminate it.

    save: (cb) =>
        content = @val()
        if not content?
            # do not overwrite file in case editor isn't initialized
            alert_message(type:"error", message:"Editor of '#{filename}' not initialized, so nothing to save.")
            cb?()
            return

        salvus_client.write_text_file_to_project
            project_id : @editor.project_id
            timeout    : 10
            path       : @filename
            content    : content
            cb         : (err, mesg) =>
                # TODO -- on error, we *might* consider saving to localStorage...
                if err
                    alert_message(type:"error", message:"Communications issue saving #{filename} -- #{err}")
                    cb?(err)
                else if mesg.event == 'error'
                    alert_message(type:"error", message:"Error saving #{filename} -- #{to_json(mesg.error)}")
                    cb?(mesg.error)
                else
                    cb?()

###############################################
# Codemirror-based File Editor
###############################################
class CodeMirrorEditor extends FileEditor
    constructor: (@editor, @filename, content, opts) ->

        editor_settings = require('account').account_settings.settings.editor_settings

        opts = @opts = defaults opts,
            mode              : required
            geometry          : undefined  # (default=full screen);
            read_only         : false
            delete_trailing_whitespace : editor_settings.strip_trailing_whitespace  # delete on save
            allow_javascript_eval : true  # if false, the one use of eval isn't allowed.
            line_numbers      : editor_settings.line_numbers
            first_line_number : editor_settings.first_line_number
            indent_unit       : editor_settings.indent_unit
            tab_size          : editor_settings.tab_size
            smart_indent      : editor_settings.smart_indent
            electric_chars    : editor_settings.electric_chars
            undo_depth        : editor_settings.undo_depth
            match_brackets    : editor_settings.match_brackets
            line_wrapping     : editor_settings.line_wrapping
            style_active_line : 15    # editor_settings.style_active_line  # (a number between 0 and 127)
            bindings          : editor_settings.bindings  # 'standard', 'vim', or 'emacs'
            theme             : editor_settings.theme

            # I'm making the times below very small for now.  If we have to adjust these to reduce load, due to lack
            # of capacity, then we will.  Or, due to lack of optimization (e.g., for big documents). These parameters
            # below would break editing a huge file right now, due to slowness of applying a patch to a codemirror editor.

            cursor_interval   : 1000   # minimum time (in ms) between sending cursor position info to hub -- used in sync version
            sync_interval     : 750    # minimum time (in ms) between synchronizing text with hub. -- used in sync version below

            completions_size  : 20    # for tab completions (when applicable, e.g., for sage sessions)

        @project_id = @editor.project_id
        @element = templates.find(".salvus-editor-codemirror").clone()

        @init_save_button()
        @init_edit_buttons()

        @init_close_button()
        filename = @filename
        if filename.length > 30
            filename = "…" + filename.slice(filename.length-30)
        @element.find(".salvus-editor-codemirror-filename").text(filename)

        elt = @element.find(".salvus-editor-codemirror-input-box").find("textarea")
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

            "Shift-Ctrl-." : (editor)   => @change_font_size(editor, +1)
            "Shift-Ctrl-," : (editor)   => @change_font_size(editor, -1)
            "Shift-Cmd-."  : (editor)   => @change_font_size(editor, +1)
            "Shift-Cmd-,"  : (editor)   => @change_font_size(editor, -1)

            "Shift-Tab"    : (editor)   => editor.unindent_selection()

            "Ctrl-Space"   : "indentAuto"
            "Ctrl-'"       : "indentAuto"

            "Tab"          : (editor)   => @press_tab_key(editor)
            "Shift-Ctrl-C" : (editor)   => @interrupt_key()

        # We will replace this by a general framework...
        if misc.filename_extension(filename) == "sagews"
            evaluate_key = require('account').account_settings.settings.evaluate_key.toLowerCase()
            if evaluate_key == "enter"
                evaluate_key = "Enter"
            else
                evaluate_key = "Shift-Enter"
            extraKeys[evaluate_key] = (editor)   => @action_key(execute: true, advance:true, split:false)

        make_editor = (node) =>
            options =
                firstLineNumber : opts.first_line_number
                autofocus       : false
                mode            : opts.mode
                lineNumbers     : opts.line_numbers
                indentUnit      : opts.indent_unit
                tabSize         : opts.tab_size
                smartIndent     : opts.smart_indent
                electricChars   : opts.electric_chars
                undoDepth       : opts.undo_depth
                matchBrackets   : opts.match_brackets
                lineWrapping    : opts.line_wrapping
                readOnly        : opts.read_only
                styleActiveLine : opts.style_active_line
                extraKeys       : extraKeys
                cursorScrollMargin : 40

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

            return cm


        @codemirror = make_editor(elt[0])

        elt1 = @element.find(".salvus-editor-codemirror-input-box-1").find("textarea")

        @codemirror1 = make_editor(elt1[0])

        buf = @codemirror.linkedDoc({sharedHist: true})
        @codemirror1.swapDoc(buf)
        $(@codemirror1.getWrapperElement()).css('border-top':'2px solid #aaa')

        @codemirror.on 'focus', () =>
            @codemirror_with_last_focus = @codemirror

        @codemirror1.on 'focus', () =>
            @codemirror_with_last_focus = @codemirror1


        @_split_view = false

        @init_change_event()

    disconnect_from_session: (cb) =>
        # implement in a derived class if you need this
        @syncdoc?.disconnect_from_session()
        cb?()

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
        editor.tab_as_space()

    init_edit_buttons: () =>
        that = @
        for name in ['search', 'next', 'prev', 'replace', 'undo', 'redo', 'autoindent',
                     'shift-left', 'shift-right', 'split-view','increase-font', 'decrease-font', 'goto-line' ]
            e = @element.find("a[href=##{name}]")
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
            when 'prev'
                if cm._searchState?.query
                    CodeMirror.commands.findPrev(cm)
                else
                    CodeMirror.commands.goPageUp(cm)
            when 'replace'
                CodeMirror.commands.replace(cm)
            when 'undo'
                cm.undo()
            when 'redo'
                cm.redo()
            when 'split-view'
                @toggle_split_view(cm)
            when 'autoindent'
                CodeMirror.commands.indentAuto(cm)
            when 'shift-left'
                cm.unindent_selection()
            when 'shift-right'
                @press_tab_key(cm)
            when 'increase-font'
                @change_font_size(cm, +1)
            when 'decrease-font'
                @change_font_size(cm, -1)
            when 'goto-line'
                @goto_line(cm)

    change_font_size: (cm, delta) =>
        elt = $(cm.getWrapperElement())
        size = elt.data('font-size')
        if not size?
            s = elt.css('font-size')
            size = parseInt(s.slice(0,s.length-2))
        new_size = size + delta
        if new_size > 1
            elt.css('font-size', new_size + 'px')
            elt.data('font-size', new_size)
        @show()

    toggle_split_view: (cm) =>
        @_split_view = not @_split_view
        @show()
        @focus()
        cm.focus()

    goto_line: (cm) =>
        focus = () =>
            @focus()
            cm.focus()
        bootbox.prompt "Goto line... (1-#{cm.lineCount()} or n%)", (result) =>
            if result != null
                result = result.trim()
                if result.length >= 1 and result[result.length-1] == '%'
                    line = Math.floor( cm.lineCount() * parseInt(result.slice(0,result.length-1)) / 100.0)
                else
                    line = parseInt(result)-1
                cm.setCursor({line:line, ch:0})
            setTimeout(focus, 100)

    init_close_button: () =>
        @element.find("a[href=#close]").click () =>
            @editor.project_page.display_tab("project-file-listing")
            return false

    init_save_button: () =>
        @save_button = @element.find("a[href=#save]").tooltip().click(@click_save_button)
        @save_button.find(".spinner").hide()

    click_save_button: () =>
        if not @save_button.hasClass('disabled')
            show_save = () =>
                @save_button.find('span').text("Saving...")
                @save_button.find(".spinner").show()
            spin = setTimeout(show_save, 250)
            @editor.save @filename, (err) =>
                clearTimeout(spin)
                @save_button.find(".spinner").hide()
                @save_button.find('span').text('Save')
                if not err
                    @save_button.addClass('disabled')
                    @has_unsaved_changes(false)
        return false

    init_change_event: () =>
        @codemirror.on 'change', (instance, changeObj) =>
            @has_unsaved_changes(true)
            @save_button.removeClass('disabled')

    _get: () =>
        return @codemirror.getValue()

    _set: (content) =>
        {from} = @codemirror.getViewport()
        @codemirror.setValue(content)
        @codemirror.scrollIntoView(from)
        # even better, if available
        @restore_cursor_position()

    restore_cursor_position: () =>
        pos = @local_storage("cursor")
        if pos?
            @codemirror.setCursor(pos)
            # todo -- would be better to center rather than a magic "5".
            @codemirror.scrollIntoView({line:pos.line-5, ch:0})

    _style_active_line: (rgb) =>
        v = (parseInt(x) for x in rgb.slice(4,rgb.length-1).split(','))
        amount = @opts.style_active_line
        for i in [0..2]
            if v[i] >= 128
                v[i] -= amount
            else
                v[i] += amount
        $("body").append("<style type=text/css>.CodeMirror-activeline{background:rgb(#{v[0]},#{v[1]},#{v[2]});}</style>")

    show: () =>
        if not (@element? and @codemirror?)
            return

        if @syncdoc?
            @syncdoc.sync()

        @element.show()
        @codemirror.refresh()

        if @opts.style_active_line
            @_style_active_line($(@codemirror.getWrapperElement()).css('background-color'))

        if @_split_view
            @codemirror1.refresh()
            $(@codemirror1.getWrapperElement()).show()
        else
            $(@codemirror1.getWrapperElement()).hide()

        height = $(window).height()

        top = @editor.editor_top_position()
        elem_height = height - top - 5

        button_bar_height = @element.find(".salvus-editor-codemirror-button-container").height()
        font_height = @codemirror.defaultTextHeight()

        cm_height = Math.floor((elem_height - button_bar_height)/font_height) * font_height

        @element.css(top:top)
        @element.find(".salvus-editor-codemirror-chat-column").css(top:top+button_bar_height)

        @element.height(elem_height).show()
        @element.show()

        chat = @_chat_is_hidden? and not @_chat_is_hidden
        if chat
            width = @element.find(".salvus-editor-codemirror-chat-column").offset().left
        else
            width = $(window).width()

        if @opts.geometry? and @opts.geometry == 'left half'
            @empty_space = {start: width/2, end:width, top:top+button_bar_height}
            width = width/2

        if @_split_view
            v = [@codemirror, @codemirror1]
            ht = cm_height/2
        else
            v = [@codemirror]
            ht = cm_height

        for cm in v
            scroller = $(cm.getScrollerElement())
            scroller.css('height':ht)
            cm_wrapper = $(cm.getWrapperElement())
            cm_wrapper.css
                height : ht
                width  : width
            cm.refresh()

        if chat
            chat_elt = @element.find(".salvus-editor-codemirror-chat")
            chat_elt.height(cm_height)

            chat_output = chat_elt.find(".salvus-editor-codemirror-chat-output")

            chat_input = chat_elt.find(".salvus-editor-codemirror-chat-input")
            chat_input_top = $(window).height()-chat_input.height() - 15
            chat_input.offset({top:chat_input_top})
            chat_output.height(chat_input_top - top - 41)

        @emit 'show', ht

    focus: () =>
        if not @codemirror?
            return
        @show()
        if not IS_MOBILE
            @codemirror.focus()
            if @_split_view
                @codemirror1.focus()

codemirror_session_editor = exports.codemirror_session_editor = (editor, filename, extra_opts) ->
    ext = filename_extension(filename)

    E = new CodeMirrorEditor(editor, filename, "", extra_opts)
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
            E.syncdoc = new (syncdoc.SynchronizedWorksheet)(E, opts)
            E.action_key = E.syncdoc.action
            E.interrupt_key = E.syncdoc.interrupt
            E.tab_nothing_selected = () => E.syncdoc.introspect()
        else
            E.syncdoc = new (syncdoc.SynchronizedDocument)(E, opts)
    return E


###############################################
# LateX Editor
###############################################

# Make a temporary uuid-named directory in path.
tmp_dir = (project_id, path, cb) ->      # cb(err, directory_name)
    name = "." + uuid()   # hidden
    salvus_client.exec
        project_id : project_id
        path       : path
        command    : "mkdir"
        args       : [name]
        cb         : (err, output) =>
            if err
                cb("Problem creating temporary PDF preview path.")
            else
                cb(false, name)

remove_tmp_dir = (project_id, path, tmp_dir, cb) ->
    salvus_client.exec
        project_id : project_id
        path       : path
        command    : "rm"
        args       : ['-rf', tmp_dir]
        cb         : (err, output) =>
            cb?(err)


# Class that wraps "a remote latex doc with PDF preview":
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
        @filename_pdf  =  @base_filename + '.pdf'

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
                input = s.slice(i+8, s.indexOf('\n',i+3))

                # normalize path to be relative to project home
                j = input.indexOf('/./')
                if j != -1
                    fname = input.slice(j+3)
                else
                    j = input.indexOf('/../')
                    fname = input.slice(j+1)
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
        a = "pdflatex -synctex=1 -interact=nonstopmode "
        if @filename_tex.indexOf(' ') != -1
            a += "'#{@filename_tex}'"
        else
            a += @filename_tex
        return a

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
        ], (err) =>
            opts.cb?(err, log))

    _run_latex: (command, cb) =>
        if not command?
            command = @default_tex_command()
        @_exec
            command : command + " < /dev/null 2</dev/null"
            bash    : true
            timeout : 20
            cb      : (err, output) =>
                if err
                    cb?(err)
                else
                    log = output.stdout + '\n\n' + output.stderr
                    if log.indexOf('Rerun to get cross-references right') != -1
                        @_need_to_run.latex = true

                    run_sage_on = '\nRun Sage on'
                    i = log.indexOf(run_sage_on)
                    if i != -1
                        j = log.indexOf(', and then run LaTeX', i)
                        if j != -1
                            @_need_to_run.sage = log.slice(i + run_sage_on.length, j).trim()

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


    _parse_latex_log: (log) =>
        # todo -- parse through text file of log putting the errors in the corresponding @pages dict.

        # number of pages:  "Output written on rh.pdf (135 pages, 7899064 bytes)."
        i = log.indexOf("Output written")
        if i != -1
            i = log.indexOf("(", i)
            if i != -1
                j = log.indexOf(" pages", i)
                try
                    @num_pages = parseInt(log.slice(i+1,j))
                catch e
                    console.log("BUG parsing number of pages")

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
        EXT = ['aux', 'log', 'bbl', 'synctex.gz', 'pdf', 'sagetex.py', 'sagetex.sage', 'sagetex.scmd', 'sagetex.sout']
        @_exec
            command : "rm"
            args    : (@base_filename + "." + ext for ext in EXT)
            cb      : cb

    _parse_text: (text) =>
        # todo -- parse through the text file putting the pages in the correspondings @pages dict.
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
    # It assumes the pdf files is there already, and doesn't run pdflatex.
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

        if opts.first_page <= 0
            opts.first_page = 1

        if opts.last_page < opts.first_page
            # easy peasy
            opts.cb?(false,[])
            return

        tmp = undefined
        sha1_changed = []
        changed_pages = []
        async.series([
            (cb) =>
                tmp_dir @project_id, "/tmp", (err, _tmp) =>
                    tmp = "/tmp/#{_tmp}"
                    cb(err)
            (cb) =>
                if @image_type == "png"
                    args = ["-r#{opts.resolution}",
                               '-dBATCH', '-dNOPAUSE',
                               "-sDEVICE=png#{opts.device}",
                               "-sOutputFile=#{tmp}/%d.png",
                               "-dFirstPage=#{opts.first_page}",
                               "-dLastPage=#{opts.last_page}",
                               "-dDownScaleFactor=#{opts.png_downscale}",
                               @filename_pdf]
                else if @image_type == "jpg"
                    args = ["-r#{opts.resolution}",
                               '-dBATCH', '-dNOPAUSE',
                               '-sDEVICE=jpeg',
                               "-sOutputFile=#{tmp}/%d.jpg",
                               "-dFirstPage=#{opts.first_page}",
                               "-dLastPage=#{opts.last_page}",
                               "-dJPEGQ=#{opts.jpeg_quality}",
                               @filename_pdf]
                else
                    cb("unknown image type #{@image_type}")
                    return

                #console.log('gs ' + args.join(" "))
                @_exec
                    command : 'gs'
                    args    : args
                    err_on_exit : true
                    cb      : (err, output) ->
                        cb(err)

            # get the new sha1 hashes
            (cb) =>
                @_exec
                    command : "sha1sum *.png *.jpg"
                    bash    : true
                    path    : tmp
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
                        timeout    : 5  # a single page shouldn't take long
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
            remove_tmp_dir(@project_id, "/", tmp)
            opts.cb?(err, changed_pages)
        )

# FOR debugging only
exports.PDFLatexDocument = PDFLatexDocument

class PDF_Preview extends FileEditor
    constructor: (@editor, @filename, contents, opts) ->
        @pdflatex = new PDFLatexDocument(project_id:@editor.project_id, filename:@filename, image_type:"png")
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

    zoom: (opts) =>
        opts = defaults opts,
            delta : undefined
            width : undefined

        images = @output.find("img")
        if images.length == 0
            console.log('do nothing')
            return # nothing to do

        if opts.delta?
            max_width = images.css('max-width')
            max_width = parseInt(max_width.slice(0, max_width.length-1))
            max_width += opts.delta
        else if opts.width?
            max_width = opts.width

        if max_width?
            @zoom_width = max_width
            n = @current_page().number
            margin_left = "#{-(max_width-100)/2}%"
            max_width = "#{max_width}%"
            images.css
                'max-width'   : max_width
                width         : max_width
                'margin-left' : margin_left
            @scroll_into_view(n : n, highlight_line:false, y:$(window).height()/2)



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

    highlight_middle: () =>
        @highlight.show().offset(top:$(window).height()/2)
        @highlight.fadeOut(3000)

    scroll_into_view: (opts) =>
        opts = defaults opts,
            n              : required   # page
            y              : 0          # y-coordinate on page
            highlight_line : true
        pg = @pdflatex.page(opts.n)
        t = @output.offset().top
        @output.scrollTop(0)  # reset to 0 first so that pg.element.offset().top is correct below
        top = (pg.element.offset().top + opts.y) - $(window).height() / 2
        @output.scrollTop(top)
        if opts.highlight_line
            # highlight location of interest
            @highlight_middle()

    remove: () =>
        if @_f?
            clearInterval(@_f)
        @element.remove()

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

        #@spinner.show().spin(true)
        @_updating = true

        @output.maxheight()
        if @element.width()
            @output.width(@element.width())

        # we do text conversion in parallel to any image updating below -- it takes about a second for a 100 page file...
        # @pdflatex.update_text (err) =>
            #if not err

        n = @current_page().number

        f = (opts, cb) =>

            opts.cb = (err, changed_pages) =>
                if err
                    cb(err)
                else if changed_pages.length == 0
                    cb()
                else
                    g = (n, cb) =>
                        @_update_page(n, cb)
                    async.map(changed_pages, g, cb)
            @pdflatex.update_images(opts)

        hq_window = opts.window_size
        if n == 1
            hq_window *= 2

        f {first_page : n, last_page  : n+1, resolution:@opts.resolution*3, device:'16m', png_downscale:3}, (err) =>
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
            # todo: delete page and all following it from DOM
            for m in [n .. @last_page]
                @output.remove(".salvus-editor-pdf-preview-page-#{m}")
            if @last_page >= n
                @last_page = n-1
        else
            # update page
            that = @
            page = @output.find(".salvus-editor-pdf-preview-page-#{n}")
            if page.length == 0
                # create
                for m in [@last_page+1 .. n]
                    #page = $("<div style='text-align:center;' class='salvus-editor-pdf-preview-page-#{m}'><div class='salvus-editor-pdf-preview-text'></div><img alt='Page #{m}' class='salvus-editor-pdf-preview-image img-rounded'><br></div>")
                    page = $("<div style='text-align:center;' class='salvus-editor-pdf-preview-page-#{m}'><img alt='Page #{m}' class='salvus-editor-pdf-preview-image img-rounded'><br></div>")
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
                            'margin-left' : self._margin_left

                    if @_first_output
                        @output.empty()
                        @_first_output = false
                    @output.append(page)
                    @pdflatex.page(m).element = page

                @last_page = n
            img =  page.find("img")
            img.attr('src', url).data('resolution', resolution)

            if @zoom_width?
                max_width = @zoom_width
                margin_left = "#{-(max_width-100)/2}%"
                max_width = "#{max_width}%"
                img.css
                    'max-width'   : max_width
                    width         : max_width
                    'margin-left' : margin_left

            #page.find(".salvus-editor-pdf-preview-text").text(p.text)
        cb()

    show: (geometry={}) =>
        geometry = defaults geometry,
            left   : undefined
            top    : undefined
            width  : $(window).width()
            height : undefined

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


class PDF_PreviewEmbed extends FileEditor
    constructor: (@editor, @filename, contents, @opts) ->
        @element = templates.find(".salvus-editor-pdf-preview-embed").clone()
        @element.find(".salvus-editor-pdf-title").text(@filename)

        @spinner = @element.find(".salvus-editor-pdf-preview-embed-spinner")

        s = path_split(@filename)
        @path = s.head
        if @path == ''
            @path = './'
        @file = s.tail

        @output = @element.find(".salvus-editor-pdf-preview-embed-page")

        @element.find("a[href=#refresh]").click () =>
            @update()
            return false

    focus: () =>

    update: (cb) =>
        height = @element.height()
        if height == 0
            # not visible.
            return
        width = @element.width()

        button = @element.find("a[href=#refresh]")
        button.icon_spin(true)

        @_last_width = width
        @_last_height = height

        output_height = height - ( @output.offset().top - @element.offset().top)
        @output.height(output_height)
        @output.width(width)

        @spinner.show().spin(true)
        salvus_client.read_file_from_project
            project_id : @editor.project_id
            path       : @filename
            timeout    : 20
            cb         : (err, result) =>
                button.icon_spin(false)
                @spinner.spin(false).hide()
                if err or not result.url?
                    alert_message(type:"error", message:"unable to get pdf -- #{err}")
                else
                    @output.html("<object data='#{result.url}' type='application/pdf' width='#{width}' height='#{output_height-10}'><br><br>Your browser doesn't support embedded PDF's, but you can <a href='#{result.url}'>download #{@filename}</a></p></object>")

    show: (geometry={}) =>
        geometry = defaults geometry,
            left   : undefined
            top    : undefined
            width  : $(window).width()
            height : undefined

        @element.show()

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


class LatexEditor extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        # The are three components:
        #     * latex_editor -- a CodeMirror editor
        #     * preview -- display the images (page forward/backward/resolution)
        #     * log -- log of latex command
        opts.mode = 'stex'
        opts.geometry = 'left half'

        @element = templates.find(".salvus-editor-latex").clone()

        @_pages = {}

        # initialize the latex_editor
        @latex_editor = codemirror_session_editor(@editor, filename, opts)
        @_pages['latex_editor'] = @latex_editor
        @element.find(".salvus-editor-latex-latex_editor").append(@latex_editor.element)
        @latex_editor.action_key = @action_key
        @element.find(".salvus-editor-latex-buttons").show()

        @latex_editor.on 'show', () =>
            @show_page()

        @latex_editor.syncdoc.on 'connect', () =>
            @preview.zoom_width = @load_conf().zoom_width
            @update_preview()

        v = path_split(@filename)
        @_path = v.head
        @_target = v.tail

        # initialize the previews
        n = @filename.length

        # The pdf preview.
        @preview = new PDF_Preview(@editor, @filename, undefined, {resolution:200})
        @element.find(".salvus-editor-latex-png-preview").append(@preview.element)
        @_pages['png-preview'] = @preview
        @preview.on 'shift-click', (opts) => @_inverse_search(opts)

        # Embedded pdf page (not really a "preview" -- it's the real thing).
        @preview_embed = new PDF_PreviewEmbed(@editor, @filename.slice(0,n-3)+"pdf", undefined, {})
        @element.find(".salvus-editor-latex-pdf-preview").append(@preview_embed.element)
        @_pages['pdf-preview'] = @preview_embed

        # initalize the log
        @log = @element.find(".salvus-editor-latex-log")
        @log.find("a").tooltip(delay:{ show: 500, hide: 100 })
        @_pages['log'] = @log
        @log_input = @log.find("input")
        @log_input.keyup (e) =>
            if e.keyCode == 13
                latex_command = @log_input.val()
                @set_conf(latex_command: latex_command)
                @save()

        @errors = @element.find(".salvus-editor-latex-errors")
        @_pages['errors'] = @errors
        @_error_message_templates =


        @_init_buttons()

        # This synchronizes the editor and png preview -- it's kind of disturbing.
        # If people request it, make it a non-default option...
        if false
            @preview.output.on 'scroll', @_passive_inverse_search
            cm0 = @latex_editor.codemirror
            cm1 = @latex_editor.codemirror1
            cm0.on 'cursorActivity', @_passive_forward_search
            cm1.on 'cursorActivity', @_passive_forward_search
            cm0.on 'change', @_pause_passive_search
            cm1.on 'change', @_pause_passive_search

    set_conf: (obj) =>
        conf = @load_conf()
        for k, v of obj
            conf[k] = v
        @save_conf(conf)

    load_conf: () =>
        doc = @latex_editor.codemirror.getValue()
        i = doc.indexOf("%sagemathcloud=")
        if i == -1
            return {}

        j = doc.indexOf('=',i)
        k = doc.indexOf('\n',i)
        if k == -1
            k = doc.length
        try
            conf = misc.from_json(doc.slice(j+1,k))
        catch
            conf = {}

        return conf

    save_conf: (conf) =>
        cm  = @latex_editor.codemirror
        doc = cm.getValue()
        i = doc.indexOf('%sagemathcloud=')
        line = '%sagemathcloud=' + misc.to_json(conf)
        if i != -1
            # find the line m where it is already
            for n in [0..cm.doc.lastLine()]
                z = cm.getLine(n)
                if z.indexOf('%sagemathcloud=') != -1
                    m = n
                    break
            cm.setLine(m, line)
        else
            cm.replaceRange('\n'+line, {line:cm.doc.lastLine()+1,ch:0})


    _pause_passive_search: (cb) =>
        @_passive_forward_search_disabled = true
        @_passive_inverse_search_disabled = true
        f = () =>
            @_passive_inverse_search_disabled = false
            @_passive_forward_search_disabled = false

        setTimeout(f, 3000)


    _passive_inverse_search: (cb) =>
        if @_passive_inverse_search_disabled
            cb?(); return
        @_pause_passive_search()
        @inverse_search
            active : false
            cb     : (err) =>
                cb?()

    _passive_forward_search: (cb) =>
        if @_passive_forward_search_disabled
            cb?(); return
        @forward_search
            active : false
            cb     : (err) =>
                @_pause_passive_search()
                cb?()

    action_key: () =>
        @forward_search(active:true)

    remove: () =>
        @element.remove()
        @preview.remove()
        @preview_embed.remove()

    _init_buttons: () =>
        @element.find("a").tooltip(delay:{ show: 500, hide: 100 })

        @element.find("a[href=#forward-search]").click () =>
            @show_page('png-preview')
            @forward_search(active:true)
            return false

        @element.find("a[href=#inverse-search]").click () =>
            @show_page('png-preview')
            @inverse_search(active:true)
            return false

        @element.find("a[href=#png-preview]").click () =>
            @show_page('png-preview')
            @preview.focus()
            @save()
            return false

        @element.find("a[href=#zoom-preview-out]").click () =>
            @preview.zoom(delta:-5)
            @set_conf(zoom_width:@preview.zoom_width)
            return false

        @element.find("a[href=#zoom-preview-in]").click () =>
            @preview.zoom(delta:5)
            @set_conf(zoom_width:@preview.zoom_width)
            return false

        @element.find("a[href=#zoom-preview-fullpage]").click () =>
            @preview.zoom(width:100)
            @set_conf(zoom_width:@preview.zoom_width)
            return false

        @element.find("a[href=#zoom-preview-width]").click () =>
            @preview.zoom(width:160)
            @set_conf(zoom_width:@preview.zoom_width)
            return false


        @element.find("a[href=#pdf-preview]").click () =>
            @show_page('pdf-preview')
            @preview_embed.focus()
            return false

        @element.find("a[href=#log]").click () =>
            @show_page('log')
            @element.find(".salvus-editor-latex-log").find("textarea").maxheight()
            t = @log.find("textarea")
            t.scrollTop(t[0].scrollHeight)
            return false

        @element.find("a[href=#latex-errors]").click () =>
            @show_page('errors')
            return false

        @number_of_errors = @element.find("a[href=#latex-errors]").find(".salvus-latex-errors-counter")
        @number_of_warnings = @element.find("a[href=#latex-errors]").find(".salvus-latex-warnings-counter")

        @element.find("a[href=#pdf-download]").click () =>
            @download_pdf()
            return false

        @element.find("a[href=#preview-resolution]").click () =>
            @set_resolution()
            return false

        @element.find("a[href=#latex-command-undo]").click () =>
            @log_input.val(@preview.pdflatex.default_tex_command())
            return false

        trash_aux_button = @element.find("a[href=#latex-trash-aux]")
        trash_aux_button.click () =>
            trash_aux_button.icon_spin(true)
            @preview.pdflatex.trash_aux_files () =>
                trash_aux_button.icon_spin(false)
            return false

        run_sage = @element.find("a[href=#latex-sage]")
        run_sage.click () =>
            @log.find("textarea").text("Running Sage...")
            run_sage.icon_spin(true)
            @preview.pdflatex._run_sage undefined, (err, log) =>
                run_sage.icon_spin(false)
                @log.find("textarea").text(log)
            return false

        run_latex = @element.find("a[href=#latex-latex]")
        run_latex.click () =>
            @log.find("textarea").text("Running Latex...")
            run_latex.icon_spin(true)
            @preview.pdflatex._run_latex @load_conf().latex_command, (err, log) =>
                run_latex.icon_spin(false)
                @log.find("textarea").text(log)
            return false

        run_bibtex = @element.find("a[href=#latex-bibtex]")
        run_bibtex.click () =>
            @log.find("textarea").text("Running Bibtex...")
            run_bibtex.icon_spin(true)
            @preview.pdflatex._run_bibtex (err, log) =>
                run_bibtex.icon_spin(false)
                @log.find("textarea").text(log)
            return false


    set_resolution: (res) =>
        if not res?
            bootbox.prompt "Change preview resolution from #{@get_resolution()} dpi to...", (result) =>
                if result
                    @set_resolution(result)
        else
            console.log('setting res to #{res}')
            try
                res = parseInt(res)
                if res < 150
                    res = 150
                else if res > 600
                    res = 600
                @preview.opts.resolution = res
                @preview.update()
            catch e
                alert_message(type:"error", message:"Invalid resolution #{res}")

    get_resolution: () =>
        return @preview.opts.resolution


    click_save_button: () =>
        @latex_editor.click_save_button()

    save: (cb) =>
        @latex_editor.save (err) =>
            cb?(err)
            if not err
                @update_preview()

    update_preview: (cb) =>
        @run_latex
            command : @load_conf().latex_command
            cb      : () =>
                @preview.update
                    cb: (err) =>
                        cb?(err)

    _get: () =>
        return @latex_editor._get()

    _set: (content) =>
        @latex_editor._set(content)

    show: () =>
        @element?.show()
        @latex_editor?.show()
        if not @_show_before?
            @show_page('png-preview')
            @_show_before = true

    focus: () =>
        @latex_editor?.focus()

    has_unsaved_changes: (val) =>
        return @latex_editor?.has_unsaved_changes(val)

    show_page: (name) =>
        if not name?
            name = @_current_page
        if not name?
            name = 'png-preview'
        for n in ['png-preview', 'pdf-preview', 'log', 'errors']
            page = @_pages[n]
            e = @element.find(".salvus-editor-latex-#{n}")
            button = @element.find("a[href=#" + n + "]")
            if n == name
                e.show()
                es = @latex_editor.empty_space
                g  = left : es.start, top:es.top+3, width:es.end-es.start-3
                console.log("g = ", g)
                if n not in ['log', 'errors']
                    page.show(g)
                else
                    page.offset({left:g.left, top:g.top}).width(g.width)
                    page.maxheight()
                    if n == 'log'
                        c = @load_conf().latex_command
                        if c
                            @log_input.val(c)
                button.addClass('btn-primary')
            else
                e.hide()
                button.removeClass('btn-primary')
        @_current_page = name

    run_latex: (opts={}) =>
        opts = defaults opts,
            command : undefined
            cb      : undefined
        button = @element.find("a[href=#log]")
        button.icon_spin(true)
        log_output = @log.find("textarea")
        log_output.text("")
        if not opts.command?
            opts.command = @preview.pdflatex.default_tex_command()
        @log_input.val(opts.command)

        build_status = button.find("span")
        status = (mesg) =>
            if mesg.start
                build_status.text(' - ' + mesg.start)
                log_output.text(log_output.text() + '\n\n-----------------------------------------------------\nRunning ' + mesg.start + '...\n\n\n\n')
            else
                if mesg.end == 'latex'
                    @render_error_page()
                build_status.text('')
                log_output.text(log_output.text() + '\n' + mesg.log + '\n')
            # Scroll to the bottom of the textarea
            log_output.scrollTop(log_output[0].scrollHeight)

        @preview.pdflatex.update_pdf
            status        : status
            latex_command : opts.command
            cb            : (err, log) =>
                button.icon_spin(false)
                opts.cb?()


    render_error_page: () =>
        log = @preview.pdflatex.last_latex_log
        if not log?
            return
        p = (new LatexParser(log)).parse()
        console.log(p)
        @number_of_errors.text(p.errors.length)
        @number_of_warnings.text(p.warnings.length + p.typesetting.length)

        elt = @errors.find(".salvus-latex-errors")
        if p.errors.lenght == 0
            elt.html("None")
        else
            elt.html("")
            for mesg in p.errors
                elt.append(@render_error_message(mesg))

        elt = @errors.find(".salvus-latex-warnings")
        if p.warnings.length == 0
            elt.html("None")
        else
            elt.html("")
            for mesg in p.warnings
                elt.append(@render_error_message(mesg))

        elt = @errors.find(".salvus-latex-typesetting")
        if p.warnings.length == 0
            elt.html("None")
        else
            elt.html("")
            for mesg in p.typesetting
                elt.append(@render_error_message(mesg))


    render_error_message: (mesg) =>
        elt = @_error_message_templates[mesg.level].clone()
        elt.

    download_pdf: () =>
        button = @element.find("a[href=#pdf-download]")
        button.icon_spin(true)
        # TODO: THIS replicates code in project.coffee
        salvus_client.read_file_from_project
            project_id : @editor.project_id
            path       : @filename.slice(0,@filename.length-3)+"pdf"
            timeout    : 45
            cb         : (err, result) =>
                button.icon_spin(false)
                if err
                    alert_message(type:"error", message:"Error downloading PDF: #{err} -- #{misc.to_json(result)}")
                else
                    url = result.url + "&download"
                    iframe = $("<iframe>").addClass('hide').attr('src', url).appendTo($("body"))
                    setTimeout((() -> iframe.remove()), 1000)

    _inverse_search: (opts) =>
        active = opts.active  # whether user actively clicked, in which case we may open a new file -- otherwise don't open anything.
        delete opts.active
        cb = opts.cb
        opts.cb = (err, res) =>
            if err
                if active
                    alert_message(type:"error", message: "Inverse search error -- #{err}")
            else
                if res.input != @filename
                    if active
                        @editor.open res.input, (err, fname) =>
                            @editor.display_tab(path:fname)
                else
                    cm = @latex_editor.codemirror_with_last_focus
                    pos = {line:res.line, ch:0}
                    cm.setCursor(pos)
                    info = cm.getScrollInfo()
                    cm.scrollIntoView(pos, info.clientHeight/2)
                    cm.focus()
            cb?()

        @preview.pdflatex.inverse_search(opts)

    inverse_search: (opts={}) =>
        opts = defaults opts,
            active : required
            cb     : undefined
        number = @preview.current_page().number
        elt    = @preview.pdflatex.page(number).element
        output = @preview.output
        nH     = elt.find("img")[0].naturalHeight
        y      = (output.height()/2 + output.offset().top - elt.offset().top) * nH / elt.height()
        @_inverse_search({n:number, x:0, y:y, resolution:@preview.pdflatex.page(number).resolution, cb:opts.cb})

    forward_search: (opts={}) =>
        opts = defaults opts,
            active : true
            cb     : undefined
        cm = @latex_editor.codemirror_with_last_focus
        if not cm?
            opts.cb?()
            return
        n = cm.getCursor().line + 1
        @preview.pdflatex.forward_search
            n  : n
            cb : (err, result) =>
                if err
                    if opts.active
                        alert_message(type:"error", message:err)
                else
                    y = result.y
                    pg = @preview.pdflatex.page(result.n)
                    res = pg.resolution
                    img = pg.element.find("img")
                    nH = img[0].naturalHeight
                    if not res?
                        y = 0
                    else
                        y *= res / 72 * img.height() / nH
                    @preview.scroll_into_view
                        n              : result.n
                        y              : y
                        highlight_line : true
                opts.cb?(err)



class Terminal extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        @element = $("<div>").hide()
        salvus_client.read_text_file_from_project
            project_id : @editor.project_id
            path       : @filename
            cb         : (err, result) =>
                if err
                    alert_message(type:"error", message: "Error connecting to console server.")
                else
                    # New session or connect to session
                    opts = @opts = defaults opts,
                        session_uuid : result.content
                        rows         : 24
                        cols         : 80

                    elt = @element.salvus_console
                        title   : "Terminal"
                        filename : filename
                        cols    : @opts.cols
                        rows    : @opts.rows
                        resizable: false
                        close   : () => @editor.project_page.display_tab("project-file-listing")
                        #reconnect    : @connect_to_server  # -- doesn't work yet!
                    @console = elt.data("console")
                    @element = @console.element
                    @connect_to_server()

    connect_to_server: (cb) =>
        mesg =
            timeout    : 30  # just for making the connection; not the timeout of the session itself!
            type       : 'console'
            project_id : @editor.project_id
            cb : (err, session) =>
                if err
                    alert_message(type:'error', message:err)
                    cb?(err)
                else
                    @console.set_session(session)
                    if @element.is(":visible")
                        setTimeout(@show, 100)
                    salvus_client.write_text_file_to_project
                        project_id : @editor.project_id
                        path       : @filename
                        content    : session.session_uuid
                        cb         : cb

        path = misc.path_split(@filename).head
        mesg.params  = {command:'bash', rows:@opts.rows, cols:@opts.cols, path:path}
        if @opts.session_uuid?
            mesg.session_uuid = @opts.session_uuid
            salvus_client.connect_to_session(mesg)
        else
            salvus_client.new_session(mesg)

        # TODO
        #@filename_tab.set_icon('console')


    _get: () =>  # TODO
        return 'history saving not yet implemented'

    _set: (content) =>  # TODO

    focus: () =>
        @console?.focus()

    terminate_session: () =>
        #@console?.terminate_session()
        @local_storage("auto_open", false)

    show: () =>
        @element.show()
        if @console?
            e = $(@console.terminal.element)
            top = @editor.editor_top_position() + @element.find(".salvus-console-topbar").height()
            # We leave a gap at the bottom of the screen, because often the
            # cursor is at the bottom, but tooltips, etc., would cover that
            ht = $(window).height() - top - 6
            if feature.isMobile.iOS()
                ht = Math.floor(ht/2)
            e.height(ht)
            @element.css(top:@editor.editor_top_position(), position:'fixed')   # TODO: this is hack-ish; needs to be redone!
            @console.focus()

class Worksheet extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts,
            session_uuid : undefined
        @element = $("<div>Opening worksheet...</div>")  # TODO -- make much nicer
        if content?
            @_set(content)
        else
            salvus_client.read_text_file_from_project
                project_id : @editor.project_id
                timeout    : 40
                path       : filename
                cb         : (err, mesg) =>
                    if err
                        alert_message(type:"error", message:"Communications issue loading worksheet #{@filename} -- #{err}")
                    else if mesg.event == 'error'
                        alert_message(type:"error", message:"Error loading worksheet #{@filename} -- #{to_json(mesg.error)}")
                    else
                        @_set(mesg.content)

    connect_to_server: (session_uuid, cb) =>
        if @session?
            cb('already connected or attempting to connect')
            return
        @session = "init"
        async.series([
            (cb) =>
                # If the worksheet specifies a specific session_uuid,
                # try to connect to that one, in case it is still
                # running.
                if session_uuid?
                    salvus_client.connect_to_session
                        type         : 'sage'
                        timeout      : 60
                        project_id   : @editor.project_id
                        session_uuid : session_uuid
                        cb           : (err, _session) =>
                            if err or _session.event == 'error'
                                # NOPE -- try to make a new session (below)
                                cb()
                            else
                                # Bingo -- got it!
                                @session = _session
                                cb()
                else
                    # No session_uuid requested.
                    cb()
            (cb) =>
                if @session? and @session != "init"
                    # We successfully got a session above.
                    cb()
                else
                    # Create a completely new session on the given project.
                    salvus_client.new_session
                        timeout    : 60
                        type       : "sage"
                        project_id : @editor.project_id
                        cb : (err, _session) =>
                            if err
                                @element.text(err)  # TODO -- nicer
                                alert_message(type:'error', message:err)
                                @session = undefined
                            else
                                @session = _session
                            cb(err)
        ], cb)

    _get: () =>
        if @worksheet?
            obj = @worksheet.to_obj()
            # Make JSON nice, so more human readable *and* more diff friendly (for git).
            return JSON.stringify(obj, null, '\t')
        else
            return undefined

    _set: (content) =>
        content = $.trim(content)
        if content.length > 0
            {content, session_uuid} = from_json(content)
        else
            content = undefined
            session_uuid = undefined

        @connect_to_server session_uuid, (err) =>
            if err
                return
            @element.salvus_worksheet
                content     : content
                path        : @filename
                session     : @session
                project_id  : @editor.project_id
                cwd         : misc.path_split(@editor.project_path + '/' + @filename).head

            @worksheet = @element.data("worksheet")
            @worksheet.save(@filename)
            @element   = @worksheet.element
            @worksheet.on 'save', (new_filename) =>
                if new_filename != @filename
                    @editor.change_tab_filename(@filename, new_filename)
                    @filename = new_filename

            @worksheet.on 'change', () =>
                @has_unsaved_changes(true)

    focus: () =>
        if not IS_MOBILE
            @worksheet?.focus()

    show: () =>
        if not @worksheet?
            return
        @element.show()
        win = $(window)
        @element.width(win.width())
        top = @editor.editor_top_position()
        @element.css(top:top)
        if top == 0
            @element.css('position':'fixed')
            @element.find(".salvus-worksheet-filename").hide()
            @element.find(".salvus-worksheet-controls").hide()
            @element.find(".salvus-cell-checkbox").hide()
            # TODO: redo these three by adding/removing a CSS class!
            input = @element.find(".salvus-cell-input")
            @_orig_css_input =
                'font-size' : input.css('font-size')
                'line-height' : input.css('line-height')
            input.css
                'font-size':'11pt'
                'line-height':'1.1em'
            output = @element.find(".salvus-cell-output")
            @_orig_css_input =
                'font-size' : output.css('font-size')
                'line-height' : output.css('line-height')
            output.css
                'font-size':'11pt'
                'line-height':'1.1em'
        else
            @element.find(".salvus-worksheet-filename").show()
            @element.find(".salvus-worksheet-controls").show()
            @element.find(".salvus-cell-checkbox").show()
            if @_orig_css_input?
                @element.find(".salvus-cell-input").css(@_orig_css_input)
                @element.find(".salvus-cell-output").css(@_orig_css_output)

        @element.height(win.height() - top)
        if top > 0
            bar_height = @element.find(".salvus-worksheet-controls").height()
            @element.find(".salvus-worksheet-worksheet").height(win.height() - top - bar_height)
        else
            @element.find(".salvus-worksheet-worksheet").height(win.height())

    disconnect_from_session : (cb) =>
        # We define it this way for now, since we don't have sync yet.
        @worksheet?.save()
        cb?()


class Image extends FileEditor
    constructor: (@editor, @filename, url, opts) ->
        opts = @opts = defaults opts,{}
        @element = templates.find(".salvus-editor-image").clone()
        @element.find(".salvus-editor-image-title").text(@filename)

        refresh = @element.find("a[href=#refresh]")
        refresh.click () =>
            refresh.icon_spin(true)
            @update (err) =>
                refresh.icon_spin(false)
            return false

        if url?
            @element.find("img").attr('src', url)
        else
            @update()

    update: (cb) =>
        salvus_client.read_file_from_project
            project_id : @editor.project_id
            timeout    : 30
            path       : @filename
            cb         : (err, mesg) =>
                if err
                    alert_message(type:"error", message:"Communications issue loading #{@filename} -- #{err}")
                    cb?(err)
                else if mesg.event == 'error'
                    alert_message(type:"error", message:"Error getting #{@filename} -- #{to_json(mesg.error)}")
                    cb?(mesg.event)
                else
                    @element.find("img").attr('src', mesg.url)
                    cb?()

    focus: () =>
        @element.maxheight()
        @element.find(".salvus-editor-image-container").maxheight()

class Spreadsheet extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts,{}
        @element = $("<div>Salvus spreadsheet not implemented yet.</div>")

class Slideshow extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts,{}
        @element = $("<div>Salvus slideshow not implemented yet.</div>")
