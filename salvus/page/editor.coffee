##################################################
# Editor for files in a project
##################################################

async = require('async')

{salvus_client} = require('salvus_client')
{EventEmitter}  = require('events')
{alert_message} = require('alerts')

{trunc, from_json, to_json, keys, defaults, required, filename_extension, len, path_split, uuid} = require('misc')

codemirror_associations =
    c      : 'text/x-c'
    'c++'  : 'text/x-c++src'
    cpp    : 'text/x-c++src'
    cc     : 'text/x-c++src'
    csharp : 'text/x-csharp'
    'c#'   : 'text/x-csharp'
    java   : 'text/x-java'
    coffee : 'coffeescript'
    php    : 'php'
    py     : 'python'
    pyx    : 'python'
    css    : 'css'
    diff   : 'diff'
    ecl    : 'ecl'
    h      : 'text/x-c++hdr'
    html   : 'htmlmixed'
    js     : 'javascript'
    lua    : 'lua'
    md     : 'markdown'  : 'python'
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
        
file_associations['pdf'] =
    editor : 'pdf'
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
                when 'pdf'
                    @tabs[filename] = @create_tab(filename:filename)                    
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
                tab.editor.show()
                setTimeout(tab.editor.focus, 100)
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
            when 'pdf'
                editor = new PDF_Preview(@, filename, undefined, x.opts)
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

        scroller = $(@codemirror.getScrollerElement())                  
        #scroller.css
            #'max-height' : @opts.editor_max_height
            #margin       : '5px'
        scroller.css('height':$(window).height()*2/3)                
        @element.resizable(alsoResize:scroller, handles: "s").on('resize', @focus)                                                                          

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
        $(@codemirror.getScrollerElement()).width(@element.width()).css
            'max-height' : @element.height()
        @codemirror?.focus()
        @codemirror?.refresh()
                
###############################################
# LateX Editor
###############################################

# Make a temporary uuid-named directory in path.
tmp_dir = (project_id, path, cb) ->      # cb(err, directory_name)
    name = uuid()
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
    # Compute single page
    constructor: (@editor, @filename, contents, opts) ->
        @element = templates.find(".salvus-editor-pdf-preview").clone()
        @spinner = @element.find(".salvus-editor-pdf-preview-spinner")
                
        @page_number = 1
        @density = 250  # impacts the clarity
        
        s = path_split(@filename)
        @path = s.head
        if @path == ''
            @path = './'
        @file = s.tail

        #@element.find("a[href=#prev]").click(@prev_page)
        #@element.find("a[href=#next]").click(@next_page)
        #@element.find("a[href=#zoom-in]").click(@zoom_in)
        #@element.find("a[href=#zoom-out]").click(@zoom_out)
        
        @output = @element.find(".salvus-editor-pdf-preview-page")
        
        @element.css('height':$(window).height()*2/3)                
        @element.resizable(handles: "s,se")   #.on('resize', @focus)   
        
        @update()

    update: (cb) =>    
        @spinner.show().spin(true)
        tmp_dir @editor.project_id, @path, (err, tmp) =>
            if err
                @spinner.hide().spin(false)
                alert_message(type:"error", message:err)
                cb?(err)
                return
            # Update the PNG's which provide a preview of the PDF  
            console.log('path=', @path, 'filename = ', @filename)
            salvus_client.exec
                project_id : @editor.project_id
                path       : @path                
                command    : 'gs'            
                args       : ["-dBATCH", "-dNOPAUSE",
                              "-sDEVICE=pngmono", 
                              "-sOutputFile=#{tmp}/%d.png", "-r#{@density}", @file]
                
                timeout    : 10
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
                            console.log(png_file)
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
                                            @output.append($("<img src='#{url}' class='salvus-editor-pdf-preview-image'>"))
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
        @latex_editor = new CodeMirrorEditor(@editor, @filename, content, opts)  
        @element.find(".salvus-editor-latex-latex_editor").append(@latex_editor.element)
        
        v = path_split(@filename)
        @_path = v.head
        @_target = v.tail        
        
        # initialize the preview
        n = @filename.length
        @preview = new PDF_Preview(@editor, @_target.slice(0,n-3)+"pdf", undefined, {})
        @element.find(".salvus-editor-latex-preview").append(@preview.element)
        
        # initalize the log
        @log = @element.find(".salvus-editor-latex-log")   
        
        @_init_buttons()
        
        @preview.update()
        
    _init_buttons: () =>
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
        
    compile_and_update: (cb) =>
        async.series([
            (cb) =>
                @editor.save(@filename, cb)
            (cb) =>
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
        salvus_client.exec
            project_id : @editor.project_id
            path       : @_path
            command    : 'pdflatex'
            args       : ['-interaction=nonstopmode', '\\input', @_target]
            timeout    : 5
            err_on_exit : false
            cb         : (err, output) =>
                if err
                    alert_message(type:"error", message:err)
                else
                    @log.find("textarea").text(output.stdout + '\n\n' + output.stderr)     
                    # Scroll to the bottom of the textarea
                    f = @log.find('textarea')
                    f.scrollTop(f[0].scrollHeight)
                    
                cb?()    
        
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
