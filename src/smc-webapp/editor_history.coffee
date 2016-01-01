
###
# Viewer for history of changes to a document
###

misc = require('smc-util/misc')

{salvus_client} = require('./salvus_client')

{FileEditor, codemirror_session_editor} = require('./editor')

sagews  = require('./sagews')
jupyter = require('./jupyter')


templates = $("#salvus-editor-templates")

class exports.HistoryEditor extends FileEditor
    constructor: (@editor, @filename, content, opts) ->
        window.s = @
        @init_syncstring()
        @init_view_doc(opts)
        @init_slider()

    init_syncstring: =>
        #   @filename = ".[path].sage-history"
        path = @filename.slice(1, @filename.length - ".sage-history".length)
        @syncstring = salvus_client.sync_string
            project_id : @editor.project_id
            path       : path
        @syncstring.once 'change', =>
            @render_slider()
            @syncstring.on 'change', =>
                @resize_slider()

    close: () =>
        @syncstring.close()

    init_view_doc: (opts) =>
        opts.mode = ''
        opts.read_only = true
        @element  = templates.find(".salvus-editor-history").clone()
        @view_doc = codemirror_session_editor(@editor, @filename, opts)  # TODO: ensure doesn't try to create a sync_string!

        fname     = misc.path_split(@filename).tail
        @ext      = misc.filename_extension(fname[1..-14])

        @element.find(".salvus-editor-history-history_editor").append(@view_doc.element)
        @view_doc.show()

        if @ext == "sagews"
            opts0 =
                allow_javascript_eval : false
                static_viewer         : true
                read_only             : true
            @worksheet = new (sagews.SynchronizedWorksheet)(@view_doc, opts0)

    init_slider: =>
        @slider         = @element.find(".salvus-editor-history-slider")
        @forward_button = @element.find("a[href=#forward]")
        @back_button    = @element.find("a[href=#back]")

        @element.find(".editor-btn-group").children().not(".btn-history").hide()
        @element.find(".salvus-editor-save-group").hide()
        @element.find(".salvus-editor-chat-title").hide()
        @element.find(".smc-editor-file-info-dropdown").hide()
        @element.find(".salvus-editor-history-controls").show()

        @slider.show()

        @forward_button.click () =>
            if @forward_button.hasClass("disabled")
                return false
            @slider.slider("option", "value", @revision_num + 1)
            @goto_revision(@revision_num + 1)
            return false

        @back_button.click () =>
            if @back_button.hasClass("disabled")
                return false
            @slider.slider("option", "value", @revision_num - 1)
            @goto_revision(@revision_num - 1)
            return false

    goto_revision: (num) ->
        time = @syncstring.versions()[num]
        if not time?
            num  = @length - 1
            time = @syncstring.versions()[num]
        @revision_num = num
        @update_buttons()
        @element.find(".salvus-editor-history-revision-number").text("Revision #{num+1} (of #{@length}), ")
        @element.find(".salvus-editor-history-revision-time").text(time.toLocaleString())
        name = smc.redux.getStore('users').get_name(@syncstring.account_id(time))
        username = " (#{misc.trunc_middle(name,100)})"
        @element.find(".salvus-editor-history-revision-user").text(username)
        @view_doc.codemirror.setValueNoJump(@syncstring.version(time))
        @process_view()

    update_buttons: =>
        if @revision_num == 0         then @back_button.addClass("disabled")    else @back_button.removeClass("disabled")
        if @revision_num == @length-1 then @forward_button.addClass("disabled") else @forward_button.removeClass("disabled")

    render_slider: =>
        @length = @syncstring.versions().length
        console.log('render_slider ', @length)
        @revision_num = @length - 1
        if @ext != "" and require('./editor').file_associations[@ext]?.opts.mode?
            @view_doc.codemirror.setOption("mode", require('./editor').file_associations[@ext].opts.mode)
        @slider.slider
            animate : false
            min     : 0
            max     : @length - 1
            step    : 1
            value   : @revision_num
            slide  : (event, ui) => # TODO: debounce this
                @goto_revision(ui.value)
        @goto_revision(@revision_num)

    resize_slider: =>
        new_len = @syncstring.versions().length
        if new_len == @length
            return
        @length = new_len
        console.log('resize_slider ', @length)
        @slider.slider
            max : @length - 1
        @update_buttons()

    process_view: () =>
        if @ext == 'sagews'
            @worksheet.process_sage_updates()
        else if @ext == 'syncdoc4'
            # Jupyter notebook history
            jupyter.process_history_editor(@view_doc.codemirror)

    show: () =>
        if not @is_active()
            return
        @element?.show()
        @view_doc?.show()
        if @ext == 'sagews'
            @worksheet.process_sage_updates()

