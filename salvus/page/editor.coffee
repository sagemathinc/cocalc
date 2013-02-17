##################################################
# Editor for files in a project
##################################################

async = require('async')

{salvus_client} = require('salvus_client')
{EventEmitter}  = require('events')
{alert_message} = require('alerts')

{trunc, from_json, to_json, keys, defaults, required, filename_extension, len} = require('misc')

codemirror_associations =
    coffee : 'coffeescript'
    css    : 'css'
    diff   : 'diff'
    ecl    : 'ecl'
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
    sh     : 'shell'
    spyx   : 'python'
    txt    : 'text'
    xml    : 'xml'
    yaml   : 'yaml'
    ''     : 'text'

file_associations = {}
for ext, mode of codemirror_associations
    file_associations[ext] =
        editor : 'codemirror'
        opts   : {mode:mode}

file_associations['salvus-terminal'] =
    editor : 'terminal'
    opts   : {}

file_associations['salvus-worksheet'] =
    editor : 'worksheet'
    opts   : {}

file_associations['salvus-spreadsheet'] =
    editor : 'spreadsheet'
    opts   : {}

file_associations['salvus-slideshow'] =
    editor : 'slideshow'
    opts   : {}

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
        if not @tabs[filename]?   # if defined, then we already have a
                                 # tab with this file, so reload it.
            @tabs[filename] = @create_tab(filename)
        @load(filename)

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
        console.log("TODO: Warn user about unsaved changes (modal) -- not implemented")
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
                tasks.push((c) => @save(filename, c))
            async.series(tasks, cb)
            return

        tab = @tabs[filename]
        if not tab?
            return

        content = tab.editor.val()
        if not content?
            # do not overwrite file in case editor isn't initialized
            alert_message(type:"error", message:"Editor of '#{filename}' not initialized, so nothing to save.")
            return

        salvus_client.write_text_file_to_project
            project_id : @project_id
            timeout    : 5   # possibly adjust dynamically based on filesize
            path       : filename
            content    : content
            cb         : (err, mesg) =>
                if err
                    alert_message(type:"error", message:"Communications issue saving #{filename} -- #{err}")
                    cb?(err)
                else if mesg.event == 'error'
                    alert_message(type:"error", message:"Error saving #{filename} -- #{to_json(mesg.error)}")
                    cb?(mesg.error)
                else
                    cb?()
                    # TODO -- change some state to reflect success, e.g., disable save button

    # Load a file from the backend if there is a tab for this file;
    # otherwise does nothing.
    load: (filename) =>
        tab = @tabs[filename]
        if not tab?
            return

        salvus_client.read_text_file_from_project
            project_id : @project_id
            timeout    : 5
            path       : filename
            cb         : (err, mesg) ->
                if err
                    alert_message(type:"error", message:"Communications issue loading #{filename} -- #{err}")
                else if mesg.event == 'error'
                    alert_message(type:"error", message:"Error loading #{filename} -- #{to_json(mesg.error)}")
                else
                    tab.editor.val(mesg.content)

    create_tab: (filename) =>
        ext = filename_extension(filename)
        x = file_associations[ext]
        if not x?
            x = file_associations['']
        switch x.editor
            # codemirror is the default... since it is the only thing implemented now.  JSON will be next, since I have that plugin.
            when 'codemirror', undefined
                editor = new CodeMirrorEditor(@, filename, x.opts)
            when 'terminal'
                editor = new Terminal(@, filename, x.opts)
            when 'worksheet'
                editor = new Worksheet(@, filename, x.opts)
            when 'spreadsheet'
                editor = new Spreadsheet(@, filename,  x.opts)
            when 'slideshow'
                editor = new Slideshow(@, filename, x.opts)
            else
                throw("Unknown editor type '#{x.editor}'")

        link = templates.find(".super-menu").clone().show()
        link.find(".salvus-editor-tab-filename").text(filename) #trunc(filename,15))
        link.find(".salvus-editor-close-button-x").click () => @close(filename)
        link.find("a").click () => @display_tab(filename)
        @nav_tabs.append(link)
        @element.find(".salvus-editor-content").append(editor.element.hide())
        @tabs[filename] =
            link     : link
            editor   : editor
            filename : filename
        @update_counter()
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
    constructor: (@editor, @filename, opts) ->

    val: (content) =>
        if not content?
            # If content not defined, returns current value.
            return @_get()
        else
            # If content is defined, sets value.
            @_set(content)

    has_unsaved_changes: () => false # TODO

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
    constructor: (@editor, @filename, opts) ->
        opts = @opts = defaults opts,
            mode         : required
            line_numbers : true
            indent_unit  : 4
            tab_size     : 4
            smart_indent : true
            undo_depth   : 100
            editor_max_height: "40em"
            match_brackets: true

        @element = templates.find(".salvus-editor-codemirror").clone()

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

        $(@codemirror.getScrollerElement()).css('max-height' : @opts.editor_max_height)

    _get: () =>
        return @codemirror.getValue()

    _set: (content) =>
        @codemirror.setValue(content)

    show: () =>
        @element.show()
        @codemirror.refresh()

class Terminal extends FileEditor
    constructor: (@editor, @filename, opts) ->
        opts = @opts = defaults opts,{}  # nothing yet
        @connect_to_server()

    connect_to_server: (cb) =>
        @element = $("<div>Connecting to console server...</div>")  # TODO -- make much nicer
        salvus_client.new_session
            timeout    : 15  # make longer later -- TODO -- mainly for testing!
            limits     : { walltime : 60*15 }
            type       : 'console'
            project_id : @editor.project_id
            params     : {command:'bash', args:['--rcfile', '.git/salvus/bashrc']}
            cb : (err, session) =>
                if err
                    @element.text(err)   # TODO--nicer
                    alert_message(type:'error', message:err)
                else
                    @element.salvus_console
                        title   : "Terminal"
                        session : session,
                        cols    : 100
                        rows    : 24
                    @console = @element.data("console")
                    @element = @console.element
                cb?(err)

        # TODO
        #@filename_tab.set_icon('console')

    _get: () =>  # TODO
        return 'history saving not yet implemented'

    _set: (content) =>  # TODO

class Worksheet extends FileEditor
    constructor: (@editor, @filename, opts) ->
        opts = @opts = defaults opts,{}  # nothing yet

        @element = $("<div>Opening worksheet...</div>")  # TODO -- make much nicer

        @connect_to_server()

    connect_to_server: (cb) =>
        salvus_client.new_session
            timeout    : 15
            limits     : {walltime: 60*15}
            type       : "sage"
            project_id : @editor.project_id
            cb : (err, _session) =>
                if err
                    @element.text(err)  # TODO -- nicer
                    alert_message(type:'error', message:err)
                    @session = undefined
                else
                    @session = _session
                cb?(err)

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
            {title, description, content} = from_json(content)
        else
            title = "Untitled"
            description = "No description"
            content = undefined

        @connect_to_server (err) =>
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
                @editor.change_tab_filename(@filename, new_filename)

class Spreadsheet extends FileEditor
    constructor: (@editor, @filename, opts) ->
        opts = @opts = defaults opts,{}
        @element = $("<div>Salvus spreadsheet not implemented yet.</div>")

class Slideshow extends FileEditor
    constructor: (@editor, @filename, opts) ->
        opts = @opts = defaults opts,{}
        @element = $("<div>Salvus slideshow not implemented yet.</div>")
