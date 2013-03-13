##################################################
# Editor for files in a project
##################################################

async = require('async')

{salvus_client} = require('salvus_client')
{EventEmitter}  = require('events')
{alert_message} = require('alerts')

{trunc, from_json, to_json, keys, defaults, required, filename_extension, len} = require('misc')

codemirror_associations =
    c      : 'text/x-c'
    'c++'  : 'text/x-c++src'
    cpp    : 'text/x-c++src'
    cc     : 'text/x-c++src'
    csharp : 'text/x-csharp'
    'c#'   : 'text/x-csharp'
    java   : 'text/x-java'
    coffee : 'coffeescript'
    css    : 'css'
    diff   : 'diff'
    ecl    : 'ecl'
    h      : 'text/x-c++hdr'
    html   : 'htmlmixed'
    js     : 'javascript'
    lua    : 'lua'
    md     : 'markdown'
    php    : 'php'
    py     : 'python'
    pyx    : 'python'
    r      : 'r'
    rst    : 'rst'
    sage   : 'python'
    scala  : 'text/x-scala'
    sh     : 'shell'
    spyx   : 'python'
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
    opts   : {mode:'stex', indent_unit:2, tab_size:2}    

file_associations['salvus-terminal'] =
    editor : 'terminal'
    icon   : 'icon-credit-card'
    opts   : {}

file_associations['salvus-worksheet'] =
    editor : 'worksheet'
    icon   : 'icon-list-ul'
    opts   : {}

file_associations['salvus-spreadsheet'] =
    editor : 'spreadsheet'
    opts   : {}

file_associations['salvus-slideshow'] =
    editor : 'slideshow'
    opts   : {}

for ext in ['png', 'jpg', 'gif', 'svg']
    file_associations[ext] =
        editor : 'image'
        opts   : {}
        


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







templates = $("#salvus-editor-templates")

class exports.Editor
    constructor: (opts) ->
        opts = defaults opts,
            project_id    : required
            initial_files : undefined # if given, attempt to open these files on creation
            counter       : undefined # if given, is a jQuery set of DOM objs to set to the number of open files

        @counter = opts.counter

        @project_id = opts.project_id
        @element = templates.find(".salvus-editor").clone().show()
        @nav_tabs = @element.find(".nav-tabs")

        @tabs = {}   # filename:{useful stuff}

        if opts.initial_files?
            for filename in opts.initial_files
                @open(filename)

        that = @
        # Enable the save/close/commit buttons
        @element.find("a[href=#save]").addClass('disabled').click () ->
            if not $(@).hasClass("disabled")
                that.save(that.active_tab.filename)
            return false

        @element.find("a[href=#close]").addClass('disabled').click () ->
            if not $(@).hasClass("disabled")
                that.close(that.active_tab.filename)
            return false

        @element.find("a[href=#reload]").addClass('disabled').click () ->
            if not $(@).hasClass("disabled")
                that.reload(that.active_tab.filename)
            return false

        @element.find("a[href=#commit]").addClass('disabled').click () ->
            if not $(@).hasClass("disabled")
                filename = that.active_tab.filename
                that.commit(filename, "save #{filename}")
            return false

    update_counter: () =>
        if @counter?
            @counter.text(len(@tabs))

    open: (filename) =>
        if not @tabs[filename]?   # if it is defined, then nothing to do -- file already loaded
            ext = filename_extension(filename)
            switch ext
                when 'png', 'svg', 'jpg', 'gif'
                    salvus_client.read_file_from_project
                        project_id : @project_id
                        timeout    : 10
                        path       : filename
                        cb         : (err, mesg) =>
                            if err
                                alert_message(type:"error", message:"Communications issue loading #{filename} -- #{err}")
                            else if mesg.event == 'error'
                                alert_message(type:"error", message:"Error getting #{filename} -- #{to_json(mesg.error)}")
                            else
                                @tabs[filename] = @create_tab(filename:filename, url:mesg.url)
                else
                    salvus_client.read_text_file_from_project
                        project_id : @project_id
                        timeout    : 10
                        path       : filename
                        cb         : (err, mesg) =>
                            if err
                                alert_message(type:"error", message:"Communications issue loading #{filename} -- #{err}")
                            else if mesg.event == 'error'
                                alert_message(type:"error", message:"Error loading #{filename} -- #{to_json(mesg.error)}")
                            else
                                @tabs[filename] = @create_tab(filename:filename, content:mesg.content)

    # Close this tab.  If it has unsaved changes, the user will be warned.
    close: (filename) =>
        @save filename, (err) =>
            if not err
                tab = @tabs[filename]
                if not tab? # nothing to do -- file isn't opened anymore
                    return
                tab.link.remove()
                tab.editor.remove()
                delete @tabs[filename]
                @update_counter()

                names = keys(@tabs)
                if names.length > 0
                    # select new tab
                    @display_tab(names[0])

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
                    current_content = tab.editor.val()
                    new_content = mesg.content
                    if current_content != new_content
                        @warn_user filename, (proceed) =>
                            if proceed
                                tab.editor.val(new_content)

    # Warn user about unsaved changes (modal)
    warn_user: (filename, cb) =>
        cb(true)

    # Make the give tab active.
    display_tab: (filename) =>
        if not @tabs[filename]?
            return
        for name, tab of @tabs
            if name == filename
                @active_tab = tab
                tab.link.addClass("active")
                tab.editor.element.show()
                @element.find(".btn-group").children().removeClass('disabled')
            else
                tab.link.removeClass("active")
                tab.editor.hide()

    # Save the file to disk/repo
    save: (filename, cb) =>       # cb(err)
        if not filename?  # if filename not given, save all files
            tasks = []
            for filename in keys(@tabs)
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

        if not tab.editor.has_unsaved_changes()
            # nothing to save
            cb?()
            return

        content = tab.editor.val()
        if not content?
            # do not overwrite file in case editor isn't initialized
            alert_message(type:"error", message:"Editor of '#{filename}' not initialized, so nothing to save.")
            cb?()
            return

        salvus_client.write_text_file_to_project
            project_id : @project_id
            timeout    : 10
            path       : filename
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
                    # TODO -- change some state to reflect success (?)

    create_tab: (opts) =>
        opts = defaults opts,
            filename : required
            content  : undefined
            url      : undefined

        filename = opts.filename
        ext = filename_extension(opts.filename)
        if not ext? and opts.content?   # no recognized extension
            ext = guess_file_extension_type(content)
        x = file_associations[ext]
        if not x?
            x = file_associations['']

        content = opts.content
        url = opts.url
        switch x.editor
            # codemirror is the default... since it is the only thing implemented now.  JSON will be next, since I have that plugin.
            when 'codemirror', undefined
                editor = new CodeMirrorEditor(@, filename, content, x.opts)
            when 'terminal'
                editor = new Terminal(@, filename, content, x.opts)
            when 'worksheet'
                editor = new Worksheet(@, filename, content, x.opts)
            when 'spreadsheet'
                editor = new Spreadsheet(@, filename, content, x.opts)
            when 'slideshow'
                editor = new Slideshow(@, filename, content, x.opts)
            when 'image'
                editor = new Image(@, filename, url, x.opts)
            when 'latex'
                editor = new LatexEditor(@, filename, content, x.opts)
            else
                throw("Unknown editor type '#{x.editor}'")

        link = templates.find(".super-menu").clone().show()
        link_filename = link.find(".salvus-editor-tab-filename")
        link_filename.text(filename) #trunc(filename,15))
        link.find(".salvus-editor-close-button-x").click () =>
            @close(link_filename.text())
        link.find("a").click () => @display_tab(link_filename.text())
        @nav_tabs.append(link)
        @tabs[filename] =
            link     : link
            editor   : editor
            filename : filename
        @display_tab(filename)
        @element.find(".salvus-editor-content").append(editor.element.show())
        @update_counter()
        setTimeout(editor.focus, 250)
        return @tabs[filename]

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


    show: () =>
        @element.show()

    hide: () =>
        @element.hide()

    remove: () =>
        @element.remove()


###############################################
# Codemirror-based File Editor
###############################################
class CodeMirrorEditor extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts,
            mode              : required
            line_numbers      : true
            indent_unit       : 4
            tab_size          : 4
            smart_indent      : true
            undo_depth        : 100
            editor_max_height : "30em"
            match_brackets    : true
            line_wrapping     : true
            theme             : "solarized"  # see static/codemirror*/themes or head.html


        @element = templates.find(".salvus-editor-codemirror").clone()
        @element.find("textarea").text(content)
        @codemirror = CodeMirror.fromTextArea @element.find("textarea")[0],
            firstLineNumber : 1
            autofocus       : false
            mode            : opts.mode
            lineNumbers     : opts.line_numbers
            indentUnit      : opts.indent_unit
            tabSave         : opts.tab_size
            smartIndent     : opts.smart_indent
            undoDepth       : opts.undo_depth
            matchBrackets   : opts.match_brackets
            theme           : opts.theme
            lineWrapping    : opts.line_wrapping
            extraKeys       :
                "Shift-Enter" : (editor) => @click_save_button()
                "Ctrl-S" : (editor) => @click_save_button()
                "Shift-Tab" : (editor) => editor.unindent_selection()
                "Tab"       : (editor) =>
                    c = editor.getCursor(); d = editor.getCursor(true)
                    if c.line==d.line and c.ch == d.ch
                        editor.tab_as_space()
                    else
                        CodeMirror.commands.defaultTab(editor)

        $(@codemirror.getScrollerElement()).css
            'max-height' : @opts.editor_max_height
            margin       : '5px'
            
        @element.resizable(handles: "sw,se").on('resize', @focus)                                                                          

        @init_save_button()
        @init_change_event()
        
    init_save_button: () =>
        save = @save = @element.find("a[href=#save]")
        save.find(".spinner").hide()
        save.click @click_save_button

    click_save_button: () =>
        if not @save.hasClass('disabled')
            @save.find('span').text("Saving...")
            spin = setTimeout((() => @save.find(".spinner").show()), 100)
            @editor.save @filename, (err) =>
                clearTimeout(spin)
                @save.find(".spinner").hide()
                @save.find('span').text('Save')
                if not err
                    @save.addClass('disabled')
                    @has_unsaved_changes(false)
        return false

    init_change_event: () =>
        @codemirror.on 'change', (instance, changeObj) =>
            @has_unsaved_changes(true)
            @save.removeClass('disabled')

    _get: () =>
        return @codemirror.getValue()

    _set: (content) =>
        @codemirror.setValue(content)

    show: () =>
        @element?.show()
        @codemirror?.refresh()

    focus: () =>
        console.log(@element.height(), @element.find(".salvus-editor-codemirror-button-row").height())        
        $(@codemirror.getScrollerElement()).width(@element.width()).css
            'max-height' : @element.height() - 3*@element.find(".salvus-editor-codemirror-button-row").height()
        @codemirror?.focus()
        @codemirror?.refresh()
                
###############################################
# LateX Editor
###############################################
class PDF_Preview
    # Compute single page: convert -density 150 file.pdf[2] file.png
    constructor: (@filename, opts) ->
        @element = templates.find(".salvus-editor-pdf-preview").clone()

class LatexEditor extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        # The are three components:
        #     * latex_editor -- a CodeMirror editor
        #     * preview -- display the images (page forward/backward/resolution)
        #     * log -- log of latex command
        opts.mode = 'stex'

        @element = templates.find(".salvus-editor-latex").clone()
        
        # initialize the latex_editor
        @latex_editor = new CodeMirrorEditor(@editor, @filename, content, opts)  
        @element.find(".salvus-editor-latex-latex_editor").append(@latex_editor.element)
        
        # initialize the preview
        n = @filename.length
        @preview = new PDF_Preview(@filename.slice(0,n-3)+"pdf", {})
        @element.find(".salvus-editor-latex-preview").append(@preview.element)
        
        # initalize the log
        @log = @element.find(".salvus-editor-latex-log")        
        
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
        

class Terminal extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts, {}
        @connect_to_server()

    connect_to_server: (cb) =>
        @element = $("<div>Connecting to console server...</div>")  # TODO -- make much nicer
        salvus_client.new_session
            timeout    : 15  # make longer later -- TODO -- mainly for testing!
            type       : 'console'
            project_id : @editor.project_id
            params     : {command:'bash', rows:@opts.rows, cols:@opts.cols}
            cb : (err, session) =>
                if err
                    @element.text(err)   # TODO--nicer
                    alert_message(type:'error', message:err)
                else
                    @element.salvus_console
                        title   : "Terminal"
                        session : session,
                        cols    : @opts.cols
                        rows    : @opts.rows
                    @console = @element.data("console")
                    @element = @console.element
                cb?(err)

        # TODO
        #@filename_tab.set_icon('console')

    _get: () =>  # TODO
        return 'history saving not yet implemented'

    _set: (content) =>  # TODO

    focus: () =>
        @console?.focus()

class Worksheet extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts,{}  # nothing yet
        @_set(content)
        @element = $("<div>Opening worksheet...</div>")  # TODO -- make much nicer

    connect_to_server: (session_uuid, cb) =>
        if @session?
            # already connected
            return
        @session = undefined
        async.series([
            (cb) =>
                # If the worksheet specifies a specific session_uuid,
                # try to connect to that one, in case it is still
                # running.
                if session_uuid?
                    salvus_client.connect_to_session
                        type         : 'sage'
                        timeout      : 15
                        project_id   : @editor.project_id
                        session_uuid : session_uuid
                        cb           : (err, _session) =>
                            if err
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
                if @session?
                    # We successfully got a session above.
                    cb()
                else
                    # Create a completely new session on the given project.
                    salvus_client.new_session
                        timeout    : 15
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
            {title, description, content, session_uuid} = from_json(content)
        else
            title = "Untitled"
            description = "No description"
            content = undefined
            session_uuid = undefined

        @connect_to_server session_uuid, (err) =>
            if err
                return
            @element.salvus_worksheet
                title       : title
                description : description
                content     : content
                path        : @filename
                session     : @session
                project_id  : @editor.project_id

            @worksheet = @element.data("worksheet")
            @element   = @worksheet.element
            @worksheet.on 'save', (new_filename) =>
                if new_filename != @filename
                    @editor.change_tab_filename(@filename, new_filename)
                    @filename = new_filename

            @worksheet.on 'change', () =>
                @has_unsaved_changes(true)

    focus: () =>
        @worksheet?.focus()

class Image extends FileEditor
    constructor: (@editor, @filename, url, opts) ->
        opts = @opts = defaults opts,{}
        @element = $("<img src='#{url}'>")

class Spreadsheet extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts,{}
        @element = $("<div>Salvus spreadsheet not implemented yet.</div>")

class Slideshow extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        opts = @opts = defaults opts,{}
        @element = $("<div>Salvus slideshow not implemented yet.</div>")
