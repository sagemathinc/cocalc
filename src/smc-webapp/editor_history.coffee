###
Viewer for history of changes to a document
###

misc = require('smc-util/misc')

{salvus_client} = require('./salvus_client')

{FileEditor, codemirror_session_editor} = require('./editor')

sagews  = require('./sagews')
jupyter = require('./editor_jupyter')
tasks   = require('./tasks')

templates = $("#salvus-editor-templates")

underscore = require('underscore')

class exports.HistoryEditor extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        @init_paths()
        @init_view_doc opts, (err) =>
            if not err
                @init_syncstring()
                @init_slider()
            else
                # TODO -- better way to report this
                console.warn("FAILED to configure view_doc")

    init_paths: =>
        #   @filename = "path/to/.file.sage-history"
        s = misc.path_split(@filename)
        @_path = s.tail.slice(1, s.tail.length - ".sage-history".length)
        @_open_file_path = @_path
        if s.head
            @_open_file_path = s.head + '/' + @_path
        else
            @_open_file_path = @_path
        @ext = misc.filename_extension(@_path)
        if @ext == 'ipynb'
            @_path = '.' + @_path + require('./editor_jupyter').IPYTHON_SYNCFILE_EXTENSION
        if s.head
            @_path = s.head + '/' + @_path

    init_syncstring: =>
        @syncstring = salvus_client.sync_string
            project_id : @editor.project_id
            path       : @_path
        @syncstring.once 'connected', =>
            @render_slider()
            @syncstring.on 'change', =>
                @resize_slider()
            if @syncstring.has_full_history()
                @load_all.hide()
            else
                @load_all.show()

    close: () =>
        @syncstring?.close()

    disconnect_from_session: =>
        @close()

    init_view_doc: (opts, cb) =>
        opts.mode = ''
        opts.read_only = true
        @element  = templates.find(".salvus-editor-history").clone()
        switch @ext
            when 'ipynb'
                @view_doc = jupyter.jupyter_notebook(@editor, @_open_file_path, opts).data("jupyter_notebook")
            when 'tasks'
                @view_doc = tasks.task_list(undefined, undefined, {viewer:true}).data('task_list')
            else
                @view_doc = codemirror_session_editor(@editor, @filename, opts)

        if @ext in ['course', 'sage-chat']
            @element.find(".salvus-editor-history-no-viewer").show()
            @top_elt = @element.find(".salvus-editor-history-no-viewer")
        else
            @top_elt = @element.find(".salvus-editor-history-slider")

        @element.find(".salvus-editor-history-history_editor").append(@view_doc.element)

        if @ext == "sagews"
            opts0 =
                allow_javascript_eval : false
                static_viewer         : true
                read_only             : true
            @worksheet = new (sagews.SynchronizedWorksheet)(@view_doc, opts0)

        if @ext == 'ipynb'
            @view_doc.once 'ready', =>
                @view_doc.element.find(".smc-jupyter-notebook-buttons").hide()
                @show()
                cb()
            @view_doc.once('failed', => cb('failed'))
        else
            cb()

    init_slider: =>
        @slider         = @element.find(".salvus-editor-history-slider")
        @forward_button = @element.find("a[href=#forward]")
        @back_button    = @element.find("a[href=#back]")
        @load_all       = @element.find("a[href=#all]")

        ##element.children().not(".btn-history").hide()
        @element.find(".salvus-editor-save-group").hide()
        @element.find(".salvus-editor-chat-title").hide()
        @element.find(".smc-editor-file-info-dropdown").hide()

        @slider.show()

        @load_all.click () =>
            @load_full_history (err) =>
                if not err
                    @load_all.hide()

        @forward_button.click () =>
            if @forward_button.hasClass("disabled")
                return false
            @set_doc(@goto_revision(@revision_num + 1))
            return false

        @back_button.click () =>
            if @back_button.hasClass("disabled")
                return false
            @set_doc(@goto_revision(@revision_num - 1))
            return false

        open_file = () =>
            @editor.project_page.open_file
                path       : @_open_file_path
                foreground : true

        @element.find("a[href=#file]").click(open_file)

        @element.find("a[href=#revert]").click () =>
            if not @revision_num?
                return
            time  = @syncstring?.all_versions()?[@revision_num]
            if not time?
                return
            @syncstring.set(@syncstring.version(time))
            @syncstring.save()
            open_file()
            @syncstring.emit('change')

    set_doc: (time) ->
        if not time?
            return
        val = @syncstring.version(time)
        switch @ext
            when 'ipynb'
                @view_doc.dom.set(val)
            when 'tasks'
                @view_doc.set_value(val)
            else
                @view_doc.codemirror.setValueNoJump(val)
        @process_view()

    goto_revision: (num) ->
        if not num?
            num = @revision_num
        if not num?
            return
        versions = @syncstring.all_versions()
        if not versions?
            # not yet initialized
            return
        time = versions[num]
        if not time?
            num  = @length - 1
            time = versions[num]
        @revision_num = num
        if not time?
            return
        @slider.slider("option", "value", @revision_num)
        @update_buttons()
        #@element.find(".salvus-editor-history-revision-time").text(time.toLocaleString())
        t = time.toLocaleString()
        @element.find(".salvus-editor-history-revision-time").text($.timeago(t)).attr('title', t)
        @element.find(".salvus-editor-history-revision-number").text(", revision #{num+1} (of #{@length})")
        account_id = @syncstring.account_id(time)
        time_sent  = @syncstring.time_sent(time)
        name = smc.redux.getStore('users')?.get_name(account_id)
        if not name?
            name = smc.redux.getStore('projects')?.get_title(account_id)
            if name?
                name = "Project: #{name}"
        if name?
            username = ", #{misc.trunc_middle(name,35)}"
        else
            username = ''  # don't know user or maybe no recorded user (e.g., initial version)
        if time_sent?
            username += "  (OFFLINE WARNING: sent #{$.timeago(time_sent)}) "
        @element.find(".salvus-editor-history-revision-user").text(username)
        return time

    update_buttons: =>
        if @revision_num == 0         then @back_button.addClass("disabled")    else @back_button.removeClass("disabled")
        if @revision_num == @length-1 then @forward_button.addClass("disabled") else @forward_button.removeClass("disabled")

    render_slider: =>
        @length = @syncstring.all_versions().length
        @revision_num = @length - 1
        if @ext != "" and require('./editor').file_associations[@ext]?.opts.mode?
            @view_doc.codemirror?.setOption("mode", require('./editor').file_associations[@ext].opts.mode)

        # debounce actually setting the document content just a little
        set_doc = underscore.debounce(((time)=>@set_doc(time)), 150)

        @slider.slider
            animate : false
            min     : 0
            max     : @length - 1
            step    : 1
            value   : @revision_num
            slide  : (event, ui) => # TODO: debounce this
                set_doc(@goto_revision(ui.value))
        @set_doc(@goto_revision(@revision_num))

    resize_slider: =>
        new_len = @syncstring.all_versions().length
        if new_len == @length
            return
        @length = new_len
        @slider.slider
            max : @length - 1
        @update_buttons()
        @goto_revision()

    process_view: () =>
        if @ext == 'sagews'
            @worksheet.process_sage_updates()

    show: () =>
        if not @is_active() or not @element? or not @view_doc?
            return
        top = @editor.editor_top_position()
        @element.css('top', top)
        if top == 0
            @element.css('position':'fixed', 'width':'100%')
        @element.show()
        x = @top_elt
        @view_doc.show(top:x.offset().top + x.height() + 15)
        if @ext == 'sagews'
            @worksheet?.process_sage_updates()

    load_full_history: (cb) =>
        n = @syncstring.all_versions().length
        @syncstring.load_full_history (err) =>
            if err
                cb?(err)
            else
                @resize_slider()
                if @revision_num?
                    num_added = @syncstring.all_versions().length - n
                    @goto_revision(@revision_num + num_added)
                cb?()

