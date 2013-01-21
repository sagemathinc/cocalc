##################################################
# Editor for files in a project
##################################################

{to_json, keys, defaults, required, filename_extension, len} = require('misc')

{salvus_client} = require('salvus_client')
{EventEmitter} = require('events')
{alert_message} = require('alerts')

file_associations =
    txt    :
        editor : "codemirror"
        opts   : {mode   : "text"}

    py     :
        editor : "codemirror"
        opts   : {mode   : "python"}

    sagews :
        editor : "worksheet"
        opts   : {mode : "sage"}

    ''     :  # other
        editor : "codemirror"
        opts   : {mode: "text"}

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

        @tabs = {}   # filename:DOM element mapping

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
                that.close(that.active_tab.filename, true)
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
    close: (filename, warn) =>
        tab = @tabs[filename]
        if not tab? # nothing to do -- file isn't opened anymore
            return
        if warn and tab.editor.has_unsaved_changes()
            @warn_user filename, (proceed) =>
                @close(filename, false)

        salvus_client.stopped_editing_file
            project_id : @project_id
            filename   : filename

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
                # TODO!
                @element.find(".btn-group").children().removeClass('disabled')
            else
                tab.link.removeClass("active")
                tab.editor.hide()

    # Save the branch to disk, but do not do any sort of git commit.
    save: (filename) =>
        tab = @tabs[filename]
        if not tab?
            return
        salvus_client.write_text_file_to_project
            project_id : @project_id
            timeout    : 5   # possibly adjust dynamically based on filesize
            path       : filename
            content    : tab.editor.val()
            cb         : (err, mesg) =>
                if err
                    alert_message(type:"error", message:"Communications issue saving #{filename} -- #{err}")
                else if mesg.event == 'error'
                    alert_message(type:"error", message:"Error saving #{filename} -- #{to_json(mesg.error)}")
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
                    alert_message(type:"error", message:"Error loading #{filename} -- #{mesg.error}")
                else
                    tab.editor.val(mesg.content)

    # Save just this file and commit it (only) to the current branch
    # with the given message.
    commit: (filename, message) =>
        console.log("commit(#{filename}, #{message})")

    create_tab: (filename) =>
        ext = filename_extension(filename)
        x = file_associations[ext]
        if not x?
            x = file_associations['']
        switch x.editor
            when "codemirror"
                editor = new CodeMirrorEditor(x.opts)
            when "worksheet"
                editor = new WorksheetEditor(x.opts)
            else
                throw("Unknown editor type '#{x.editor}'")

        link = templates.find(".super-menu").clone().show()
        link.find(".salvus-editor-tab-filename").text(filename)
        link.find(".salvus-editor-close-button-x").click () =>
            @close(filename)
        tab = {link:link, editor:editor, filename:filename}
        link.find("a").click () => @display_tab(filename)
        @nav_tabs.append(link)
        @element.find(".salvus-editor-content").append(editor.element.hide())
        @tabs[filename] = tab
        @update_counter()
        return tab


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
    val: (content) =>
        if not content?
            # If content not defined, returns current value.
            return @_get()
        else
            # If content is defined, sets value.
            @_set(content)

    has_unsaved_changes: () => false # TODO

    _get: () =>
        throw("TODO: implement _get")

    _set: (content) =>
        @_
        throw("TODO: implement _set")


###############################################
# Codemirror-based File Editor
###############################################
class CodeMirrorEditor extends FileEditor
    constructor: (opts) ->
        @opts = defaults opts,
            mode         : required
            line_numbers : true
            indent_unit  : 4
            tab_size     : 4
            smart_indent : true
            undo_depth   : 100

        @element = templates.find(".salvus-editor-codemirror").clone()
        @codemirror = CodeMirror.fromTextArea @element.find("textarea")[0],
            mode        : opts.mode
            lineNumbers : opts.line_numbers
            indentUnit  : opts.indent_unit
            tabSave     : opts.tab_size
            smartIndent : opts.smart_indent
            undoDepth   : opts.undo_depth

    _get: () =>
        return @codemirror.getValue()

    _set: (content) =>
        @codemirror.setValue(content)

    show: () =>
        @element.show()
        @codemirror.refresh()

    hide: () =>
        @element.hide()

    remove: () =>
        @element.remove()


###############################################
# Worksheet based editor
###############################################
class WorksheetEditor extends FileEditor
    constructor: (opts) ->
        @opts = defaults opts,
            mode : required

