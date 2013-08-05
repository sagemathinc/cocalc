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

# This image tag below is technically invalid, since src isn't set; but that is done before we
# put it in the DOM.
template_pdf_preview_image = $('<img alt="PDF preview" class="salvus-editor-pdf-preview-image img-rounded">')

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
        link.find("a").click (e) =>
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
        #console.log('create_editor: ', opts)

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
                editor = new PDF_Preview(@, filename, content, extra_opts)
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

        link.find(".salvus-editor-close-button-x").click () =>
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
                tab.close_editor()

            @resize_open_file_tabs()
            return false

        ignore_clicks = false
        link.find("a").click () =>
            if ignore_clicks
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

    resize_open_file_tabs: () =>
        # Make a list of the tabs after the search menu.
        x = []
        file_tabs = false
        for a in @project_page.container.find(".project-pages").children()
            t = $(a)
            if t.hasClass("project-search-menu-item")
                file_tabs = true
                continue
            else if file_tabs and t.hasClass("salvus-editor-filename-pill")
                x.push(t)
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

    restore_cursor_position : () =>
        # implement in a derived class if you need this

    disconnect_from_session : (cb) =>
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
            bindings          : editor_settings.bindings  # 'standard', 'vim', or 'emacs'
            theme             : editor_settings.theme

            # I'm making the times below very small for now.  If we have to adjust these to reduce load, due to lack
            # of capacity, then we will.  Or, due to lack of optimization (e.g., for big documents). These parameters
            # below would break editing a huge file right now, due to slowness of applying a patch to a codemirror editor.

            cursor_interval   : 2000   # minimum time (in ms) between sending cursor position info to hub -- used in sync version
            sync_interval     : 250   # minimum time (in ms) between synchronizing text with hub. -- used in sync version below

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
                extraKeys       : extraKeys
                cursorScrollMargin : 100

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

    show: () =>
        if not (@element? and @codemirror?)
            #console.log('skipping show because things not defined yet.')
            return

        if @syncdoc?
            @syncdoc.sync()

        @element.show()
        @codemirror.refresh()

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

        if @_chat_is_hidden? and not @_chat_is_hidden
            width = $(window).width() - @element.find(".salvus-editor-codemirror-chat-column").width()
        else
            width = $(window).width()

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

        chat = @element.find(".salvus-editor-codemirror-chat")
        chat.height(cm_height)
        chat.width(0)
        output = chat.find(".salvus-editor-codemirror-chat-output")

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

class PDF_Preview extends FileEditor
    constructor: (@editor, @filename, contents, opts) ->
        @element = templates.find(".salvus-editor-pdf-preview").clone()
        @spinner = @element.find(".salvus-editor-pdf-preview-spinner")

        @page_number = 1


        s = path_split(@filename)
        @path = s.head
        if @path == ''
            @path = './'
        @file = s.tail

        #@element.find("a[href=#prev]").click(@prev_page)
        #@element.find("a[href=#next]").click(@next_page)
        #@element.find("a[href=#zoom-in]").click(@zoom_in)
        #@element.find("a[href=#zoom-out]").click(@zoom_out)

        @element.maxheight()
        @output = @element.find(".salvus-editor-pdf-preview-page")
        @update()
        @output.focus()

    focus: () =>
        @element.maxheight()
        @output.height(@element.height())
        @output.width(@element.width())

    update: (cb) =>
        @output.height(@element.height())
        @output.width(@element.width())
        @spinner.show().spin(true)
        tmp_dir @editor.project_id, @path, (err, tmp) =>
            if err
                @spinner.hide().spin(false)
                alert_message(type:"error", message:err)
                cb?(err)
                return
            # Update the PNG's which provide a preview of the PDF
            density = @element.width()/4  # smaller denom = slower = clearer
            if density == 0
                # not visible, so no point.
                return
            salvus_client.exec
                project_id : @editor.project_id
                path       : @path
                command    : 'gs'
                args       : ["-dBATCH", "-dNOPAUSE",
                              "-sDEVICE=pngmono",
                              "-sOutputFile=#{tmp}/%d.png", "-r#{density}", @file]

                timeout    : 20
                err_on_exit: false
                cb         : (err, output) =>
                    if err
                        alert_message(type:"error", message:err)
                        remove_tmp_dir(@editor.project_id, @path, tmp)
                        cb?(err)
                    else
                        i = output.stdout.indexOf("Page")
                        s = output.stdout.slice(i)
                        pages = {}
                        tasks = []
                        while s.length>4
                            i = s.indexOf('\n')
                            if i == -1
                                break
                            page_number = s.slice(5,i)
                            s = s.slice(i+1)

                            png_file = @path + "/#{tmp}/" + page_number + '.png'
                            f = (cb) =>
                                num  = arguments.callee.page_number
                                salvus_client.read_file_from_project
                                    project_id : @editor.project_id
                                    path       : arguments.callee.png_file
                                    cb         : (err, result) =>
                                        if err
                                            cb(err)
                                        else
                                            if result.url?
                                                pages[num] = result.url
                                            cb()

                            f.png_file = png_file
                            f.page_number = parseInt(page_number)
                            tasks.push(f)

                        async.parallel tasks, (err) =>
                            remove_tmp_dir(@editor.project_id, @path, tmp)
                            if err
                                alert_message(type:"error", message:"Error downloading png preview -- #{err}")
                                @spinner.spin(false).hide()
                                cb?(err)
                            else
                                if len(pages) == 0
                                    @output.html('')
                                else
                                    children = @output.children()
                                    # We replace existing pages if possible, which nicely avoids all nasty scrolling issues/crap.
                                    for n in [0...len(pages)]
                                        url = pages[n+1]
                                        if n < children.length
                                            $(children[n]).attr('src', url)
                                        else
                                            img = template_pdf_preview_image.clone()
                                            img.attr('src', url)
                                            # This gives a sort of "2-up" effect.  But this makes things unreadable
                                            # on some screens :-(.
                                            #img.css('width':@output.width()/2-100)
                                            @output.append(img)
                                    # Delete any remaining pages from before (if doc got shorter)
                                    for n in [len(pages)...children.length]
                                        $(children[n]).remove()
                                @spinner.spin(false).hide()
                                cb?()

    next_page: () =>
        @page_number += 1   # TODO: !what if last page?
        @update()

    prev_page: () =>
        if @page_number >= 2
            @page_number -= 1
            @update()

    zoom_out: () =>
        if @density >= 75
            @density -= 25
            @update()

    zoom_in: () =>
        @density += 25
        @update()

    show: () =>
        @element.show()
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

        @_current_page = 'latex_editor'
        @element = templates.find(".salvus-editor-latex").clone()

        # initialize the latex_editor
        @latex_editor = codemirror_session_editor(@editor, filename, opts)
        @element.find(".salvus-editor-latex-latex_editor").append(@latex_editor.element)

        v = path_split(@filename)
        @_path = v.head
        @_target = v.tail

        # initialize the preview
        n = @filename.length
        @preview = new PDF_Preview(@editor, @filename.slice(0,n-3)+"pdf", undefined, {})
        @element.find(".salvus-editor-latex-preview").append(@preview.element)

        # initalize the log
        @log = @element.find(".salvus-editor-latex-log")

        @_init_buttons()

        @preview.update()

    _init_buttons: () =>

        @element.find(".salvus-editor-latex-buttons").draggable()

        @element.find("a[href=#latex_editor]").click () =>
            @show_page('latex_editor')
            @latex_editor.focus()
            return false

        @element.find("a[href=#preview]").click () =>
            @compile_and_update()
            @show_page('preview')
            return false

        #@element.find("a[href=#log]").click () =>
            #@show_page('log')
            return false

        @element.find("a[href=#latex]").click () =>
            @show_page('log')
            @compile_and_update()
            return false

        @element.find("a[href=#pdf]").click () =>
            @download_pdf()
            return false

    click_save_button: () =>
        @latex_editor.click_save_button()

    save: (cb) =>
        @latex_editor.save(cb)

    compile_and_update: (cb) =>
        async.series([
            (cb) =>
                @editor.save(@filename, cb)
            (cb) =>
                @run_latex (err) =>
                    # latex prefers to be run twice...
                    if err
                        cb(err)
                    else
                        @run_latex(cb)

            (cb) =>
                @preview.update(cb)
        ], (err) -> cb?(err))

    _get: () =>
        return @latex_editor._get()

    _set: (content) =>
        @latex_editor._set(content)

    show: () =>
        @element?.show()
        @latex_editor?.show()

    focus: () =>
        @latex_editor?.focus()

    has_unsaved_changes: (val) =>
        return @latex_editor?.has_unsaved_changes(val)

    show_page: (name) =>
        if name == @_current_page
            return
        for n in ['latex_editor', 'preview', 'log']
            e = @element.find(".salvus-editor-latex-#{n}")
            button = @element.find("a[href=#" + n + "]")
            if n == name
                e.show()
                button.addClass('btn-primary')
            else
                e.hide()
                button.removeClass('btn-primary')
        @_current_page = name

    run_latex: (cb) =>
        async.series([
            (cb) =>
                @save(cb)
            (cb) =>
                # NOTE: a lot of filenames aren't really allowed with latex, which sucks. See
                #    http://tex.stackexchange.com/questions/53644/what-are-the-allowed-characters-in-filenames
                salvus_client.exec
                    project_id : @editor.project_id
                    path       : @_path
                    command    : 'pdflatex'
                    args       : ['-interaction=nonstopmode', @_target]
                    timeout    : 10
                    err_on_exit : false
                    cb         : (err, output) =>
                        if err
                            alert_message(type:"error", message:err)
                            cb(err)
                        else
                            if output.stdout.indexOf("I can't find file") != -1
                                @log.find("div").html("<b><i>WARNING:</i> Many filenames aren't allowed with latex! See <a href='http://tex.stackexchange.com/questions/53644/what-are-the-allowed-characters-in-filenames' target='_blank'> this discussion.</b>")
                            else
                                @log.find("div").empty()

                            @log.find("textarea").text(output.stdout + '\n\n' + output.stderr)
                            # Scroll to the bottom of the textarea
                            f = @log.find('textarea')
                            f.scrollTop(f[0].scrollHeight)
                            cb()
        ], (err) =>
            cb?(err)
        )

    download_pdf: () =>
        # TODO: THIS replicates code in project.coffee
        salvus_client.read_file_from_project
            project_id : @editor.project_id
            path       : @filename.slice(0,@filename.length-3)+"pdf"
            cb         : (err, result) =>
                if err
                    alert_message(type:"error", message:"Error downloading PDF: #{err} -- #{misc.to_json(result)}")
                else
                    url = result.url + "&download"
                    iframe = $("<iframe>").addClass('hide').attr('src', url).appendTo($("body"))
                    setTimeout((() -> iframe.remove()), 1000)



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
        #console.log("connect_to_server")
        mesg =
            timeout    : 30  # just for making the connection; not the timeout of the session itself!
            type       : 'console'
            project_id : @editor.project_id
            cb : (err, session) =>
                #console.log(err, session)
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
            #console.log("Connecting to an existing session.")
            mesg.session_uuid = @opts.session_uuid
            salvus_client.connect_to_session(mesg)
        else
            #console.log("Opening a new session at #{path}")
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
        @element = $("<img>")
        if url?
            @element.attr('src', url)
        else
            salvus_client.read_file_from_project
                project_id : @editor.project_id
                timeout    : 30
                path       : @filename
                cb         : (err, mesg) =>
                    if err
                        alert_message(type:"error", message:"Communications issue loading #{@filename} -- #{err}")
                    else if mesg.event == 'error'
                        alert_message(type:"error", message:"Error getting #{@filename} -- #{to_json(mesg.error)}")
                    else
                        @element.attr('src', mesg.url)

class Spreadsheet extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts,{}
        @element = $("<div>Salvus spreadsheet not implemented yet.</div>")

class Slideshow extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts,{}
        @element = $("<div>Salvus slideshow not implemented yet.</div>")
