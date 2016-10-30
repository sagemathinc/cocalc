
#############################################
# Editor for LaTeX documents
#############################################

$ = window.$

misc = require('smc-util/misc')

{defaults, required} = misc

{alert_message} = require('./alerts')
{redux} = require('./smc-react')
editor = require('./editor')

templates = $("#salvus-editor-templates")

MAX_LATEX_ERRORS   = 10
MAX_LATEX_WARNINGS = 50

class exports.LatexEditor extends editor.FileEditor
    constructor: (@project_id, @filename, content, opts) ->
        # The are three components:
        #     * latex_editor -- a CodeMirror editor
        #     * preview -- display the images (page forward/backward/resolution)
        #     * log -- log of latex command
        opts.mode = 'stex2'

        @element = templates.find(".salvus-editor-latex").clone()

        @_pages = {}

        # initialize the latex_editor
        @latex_editor = editor.codemirror_session_editor(@project_id, @filename, opts)
        @_pages['latex_editor'] = @latex_editor
        @element.find(".salvus-editor-latex-latex_editor").append(@latex_editor.element)
        @latex_editor.action_key = @action_key
        @element.find(".salvus-editor-latex-buttons").show()

        latex_buttonbar = @element.find(".salvus-editor-latex-buttonbar")
        latex_buttonbar.show()

        @latex_editor.on 'saved', () =>
            @update_preview () =>
                if @_current_page == 'pdf-preview'
                    @preview_embed.update()
            @spell_check()

        @latex_editor.syncdoc.on 'connect', () =>
            @preview.zoom_width = @load_conf().zoom_width
            @update_preview()
            @spell_check()

        v = misc.path_split(@filename)
        @_path = v.head
        @_target = v.tail

        # initialize the previews
        n = @filename.length

        # The pdf preview.
        @preview = new editor.PDF_Preview(@project_id, @filename, undefined, {resolution:@get_resolution()})
        @element.find(".salvus-editor-latex-png-preview").append(@preview.element)
        @_pages['png-preview'] = @preview
        @preview.on 'shift-click', (opts) => @_inverse_search(opts)

        # Embedded pdf page (not really a "preview" -- it's the real thing).
        @preview_embed = new editor.PDF_PreviewEmbed(@project_id, @filename.slice(0,n-3)+"pdf", undefined, {})
        @element.find(".salvus-editor-latex-pdf-preview").append(@preview_embed.element)
        @preview_embed.element.find(".salvus-editor-pdf-title").hide()
        @preview_embed.element.find("a[href=\"#refresh\"]").hide()
        @_pages['pdf-preview'] = @preview_embed

        # Initalize the log
        @log = @element.find(".salvus-editor-latex-log")
        @log.find("a").tooltip(delay:{ show: 500, hide: 100 })
        @_pages['log'] = @log
        @log_input = @log.find("input")
        save_custom_build_command = () =>
            @set_conf_doc(latex_command: @log_input.val())
            @save()
        @log_input.keyup (e) =>
            if e.keyCode == 13
                save_custom_build_command()
        @log_input.on('blur', save_custom_build_command)

        @errors = @element.find(".salvus-editor-latex-errors")
        @_pages['errors'] = @errors
        @_error_message_template = @element.find(".salvus-editor-latex-mesg-template")

        @_init_buttons()
        @init_draggable_split()

        # this is entirely because of the chat
        # currently being part of @latex_editor, and
        # only calling the show for that; once chat
        # is refactored out, delete this.
        @latex_editor.on 'show-chat', () =>
            @show()
        @latex_editor.on 'hide-chat', () =>
            @show()

        # This synchronizes the editor and png preview -- it's kind of disturbing.
        # If people request it, make it a non-default option...
        ###
            @preview.output.on 'scroll', @_passive_inverse_search
            cm0 = @latex_editor.codemirror
            cm1 = @latex_editor.codemirror1
            cm0.on 'cursorActivity', @_passive_forward_search
            cm1.on 'cursorActivity', @_passive_forward_search
            cm0.on 'change', @_pause_passive_search
            cm1.on 'change', @_pause_passive_search
        ###

    spell_check: (cb) =>
        @preview.pdflatex.spell_check
            lang : @load_conf_doc().lang
            cb   : (err, words) =>
                if err
                    cb?(err)
                else
                    @latex_editor.codemirror.spellcheck_highlight(words)
                    @latex_editor.codemirror1.spellcheck_highlight(words)

    init_draggable_split: () =>
        @_split_pos = @local_storage("split_pos")
        @_dragbar = dragbar = @element.find(".salvus-editor-latex-resize-bar")
        dragbar.css(position:'absolute')
        dragbar.draggable
            axis : 'x'
            containment : @element
            zIndex      : 100
            stop        : (event, ui) =>
                # compute the position of bar as a number from 0 to 1
                left  = @element.offset().left
                chat_pos = @element.find(".salvus-editor-codemirror-chat").offset()
                if chat_pos.left
                    width = chat_pos.left - left
                else
                    width = @element.width()
                p     = dragbar.offset().left
                @_split_pos = (p - left) / width
                @local_storage('split_pos', @_split_pos)
                #dragbar.css(left: )
                @show()

    set_conf: (obj) =>
        conf = @load_conf()
        for k, v of obj
            conf[k] = v
        @save_conf(conf)

    load_conf: () =>
        conf = @local_storage('conf')
        if not conf?
            conf = {}
        return conf

    save_conf: (conf) =>
        @local_storage('conf', conf)

    set_conf_doc: (obj) =>
        conf = @load_conf_doc()
        for k, v of obj
            conf[k] = v
        @save_conf_doc(conf)

    load_conf_doc: () =>
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
        catch e
            conf = {}

        return conf

    save_conf_doc: (conf) =>
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
            cm.replaceRange(line+'\n', {line:m,ch:0}, {line:m+1,ch:0})
        else
            if misc.len(conf) == 0
                # don't put it in there if empty
                return
            cm.replaceRange('\n'+line, {line:cm.doc.lastLine()+1,ch:0})
        @latex_editor.syncdoc.sync()

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
        @show_page('png-preview')
        @forward_search(active:true)

    remove: () =>
        @element.remove()
        @preview.remove()
        @preview_embed.remove()

    _init_buttons: () =>
        @element.find("a").tooltip(delay:{ show: 500, hide: 100 } )

        @element.find("a[href=\"#forward-search\"]").click () =>
            @show_page('png-preview')
            @forward_search(active:true)
            return false

        @element.find("a[href=\"#inverse-search\"]").click () =>
            @show_page('png-preview')
            @inverse_search(active:true)
            return false

        @element.find("a[href=\"#png-preview\"]").click () =>
            @show_page('png-preview')
            @preview.focus()
            @save()
            return false

        @element.find("a[href=\"#zoom-preview-out\"]").click () =>
            @preview.zoom(delta: -5)
            @set_conf(zoom_width: @preview.zoom_width)
            return false

        @element.find("a[href=\"#zoom-preview-in\"]").click () =>
            @preview.zoom(delta:5)
            @set_conf(zoom_width:@preview.zoom_width)
            return false

        @element.find("a[href=\"#zoom-preview-fullpage\"]").click () =>
            @preview.zoom(width:100)
            @set_conf(zoom_width:@preview.zoom_width)
            return false

        @element.find("a[href=\"#zoom-preview-width\"]").click () =>
            @preview.zoom(width:160)
            @set_conf(zoom_width:@preview.zoom_width)
            return false


        @element.find("a[href=\"#pdf-preview\"]").click () =>
            @show_page('pdf-preview')
            @preview_embed.focus()
            @preview_embed.update()
            return false

        @element.find("a[href=\"#log\"]").click () =>
            @show_page('log')
            @element.find(".salvus-editor-latex-log").find("textarea").maxheight()
            t = @log.find("textarea")
            t.scrollTop(t[0].scrollHeight)
            return false

        @element.find("a[href=\"#errors\"]").click () =>
            @show_page('errors')
            return false

        @number_of_errors = @element.find("a[href=\"#errors\"]").find(".salvus-latex-errors-counter")
        @number_of_warnings = @element.find("a[href=\"#errors\"]").find(".salvus-latex-warnings-counter")

        @element.find("a[href=\"#pdf-download\"]").click () =>
            @download_pdf()
            return false

        @element.find("a[href=\"#preview-resolution\"]").click () =>
            @set_resolution()
            return false

        @element.find("a[href=\"#latex-command-undo\"]").click () =>
            c = @preview.pdflatex.default_tex_command()
            @log_input.val(c)
            @set_conf_doc(latex_command: c)
            return false

        trash_aux_button = @element.find("a[href=\"#latex-trash-aux\"]")
        trash_aux_button.click () =>
            trash_aux_button.icon_spin(true)
            @preview.pdflatex.trash_aux_files () =>
                trash_aux_button.icon_spin(false)
            return false

        run_sage = @element.find("a[href=\"#latex-sage\"]")
        run_sage.click () =>
            @log.find("textarea").text("Running Sage...")
            run_sage.icon_spin(true)
            @preview.pdflatex._run_sage undefined, (err, log) =>
                run_sage.icon_spin(false)
                @log.find("textarea").text(log)
            return false

        run_latex = @element.find("a[href=\"#latex-latex\"]")
        run_latex.click () =>
            @log.find("textarea").text("Running Latex...")
            run_latex.icon_spin(true)
            @preview.pdflatex._run_latex @load_conf_doc().latex_command, (err, log) =>
                run_latex.icon_spin(false)
                @log.find("textarea").text(log)
            return false

        run_bibtex = @element.find("a[href=\"#latex-bibtex\"]")
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
            try
                res = parseInt(res)
                if res < 75
                    res = 75
                else if res > 600
                    res = 600
                @preview.opts.resolution = res
                @set_conf(resolution : res)
                @preview.update()
            catch e
                alert_message(type:"error", message:"Invalid resolution #{res}")

    get_resolution: () =>
        if not @preview?
            return @load_conf()['resolution'] ? 150
        return @preview.opts.resolution

    # This function isn't called on save button click since
    # the codemirror's save button is called...
    click_save_button: () =>
        @latex_editor.click_save_button()

    # This function isn't called on save
    # @latex_editor.save is called instead for some reason
    save: (cb) =>
        @latex_editor.save (err) =>
            cb?(err)
            if not err
                @update_preview () =>
                    if @_current_page == 'pdf-preview'
                        @preview_embed.update()
                @spell_check()


    update_preview: (cb) =>
        @run_latex
            command : @load_conf_doc().latex_command
            cb      : () =>
                @preview.update
                    cb: (err) =>
                        cb?(err)

    _get: () =>
        return @latex_editor._get()

    _set: (content) =>
        @latex_editor._set(content)

    mount : () =>
        if not @mounted
            $(document.body).append(@element)
            @mounted = true
        return @mounted

    _show: (opts={}) =>
        if not @_split_pos?
            @_split_pos = .5
        @_split_pos = Math.max(editor.MIN_SPLIT,Math.min(editor.MAX_SPLIT, @_split_pos))

        @element.css(top:redux.getProjectStore(@project_id).get('editor_top_position'), position:'fixed')
        @element.width($(window).width())

        width = @element.width()
        chat_pos = @element.find(".salvus-editor-codemirror-chat").offset()
        if chat_pos.left
            width = chat_pos.left

        {top, left} = @element.offset()
        editor_width = (width - left) * @_split_pos

        @_dragbar.css('left', editor_width + left)
        @latex_editor.show(width:editor_width)

        button_bar_height = @element.find(".salvus-editor-codemirror-button-row").height()

        @_right_pane_position =
            start : editor_width + left + 7
            end   : width
            top   : top + button_bar_height + 1

        if not @_show_before?
            @show_page('png-preview')
            @_show_before = true
        else
            @show_page()

        @_dragbar.height(@latex_editor.element.height())
        @_dragbar.css('top', button_bar_height + 2)

    focus: () =>
        @latex_editor?.focus()

    has_unsaved_changes: (val) =>
        return @latex_editor?.has_unsaved_changes(val)

    show_page: (name) =>
        if not @_right_pane_position?
            return

        if not name?
            name = @_current_page
        @_current_page = name
        if not name?
            name = 'png-preview'

        pages = ['png-preview', 'pdf-preview', 'log', 'errors']
        for n in pages
            @element.find(".salvus-editor-latex-#{n}").hide()

        pos = @_right_pane_position
        g  = {left : pos.start, top:pos.top+3, width:pos.end-pos.start-3}
        if g.width < 50
            @element.find(".salvus-editor-latex-png-preview").find(".btn-group").hide()
            @element.find(".salvus-editor-latex-log").find(".btn-group").hide()
        else
            @element.find(".salvus-editor-latex-png-preview").find(".btn-group").show()
            @element.find(".salvus-editor-latex-log").find(".btn-group").show()

        for n in pages
            page = @_pages[n]
            if not page?
                continue
            e = @element.find(".salvus-editor-latex-#{n}")
            button = @element.find("a[href=\"#" + n + "\"]")
            if n == name
                e.show()
                if n not in ['log', 'errors']
                    page.show(g)
                else
                    page.offset({left:g.left, top:g.top}).width(g.width)
                    page.maxheight()
                    if n == 'log'
                        c = @load_conf_doc().latex_command
                        if c
                            @log_input.val(c)
                    else if n == 'errors'
                        @render_error_page()
                button.addClass('btn-primary')
            else
                button.removeClass('btn-primary')

    run_latex: (opts={}) =>
        opts = defaults opts,
            command : undefined
            cb      : undefined
        button = @element.find("a[href=\"#log\"]")
        button.icon_spin(true)
        @_show() # update layout, since showing spinner might cause a linebreak in the button bar
        log_output = @log.find("textarea")
        log_output.text("")
        if not opts.command?
            opts.command = @preview.pdflatex.default_tex_command()
        @log_input.val(opts.command)

        build_status = button.find(".salvus-latex-build-status")
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
                @_show() # update layout, since hiding spinner might cause a linebreak in the button bar to go away
                opts.cb?()

    render_error_page: () =>
        log = @preview.pdflatex.last_latex_log
        if not log?
            return
        p = (new LatexParser(log)).parse()

        if p.errors.length
            @number_of_errors.text(p.errors.length)
            @element.find("a[href=\"#errors\"]").addClass("btn-danger")
        else
            @number_of_errors.text('')
            @element.find("a[href=\"#errors\"]").removeClass("btn-danger")

        k = p.warnings.length + p.typesetting.length
        if k
            @number_of_warnings.text("(#{k})")
        else
            @number_of_warnings.text('')

        if @_current_page != 'errors'
            return

        elt = @errors.find(".salvus-latex-errors")
        if p.errors.length == 0
            elt.html("None")
        else
            elt.html("")
            cnt = 0
            for mesg in p.errors
                cnt += 1
                if cnt > MAX_LATEX_ERRORS
                    elt.append($("<h4>(Not showing #{p.errors.length - cnt + 1} additional errors.)</h4>"))
                    break
                elt.append(@render_error_message(mesg))

        elt = @errors.find(".salvus-latex-warnings")
        if p.warnings.length == 0
            elt.html("None")
        else
            elt.html("")
            cnt = 0
            for mesg in p.warnings
                cnt += 1
                if cnt > MAX_LATEX_WARNINGS
                    elt.append($("<h4>(Not showing #{p.warnings.length - cnt + 1} additional warnings.)</h4>"))
                    break
                elt.append(@render_error_message(mesg))

        elt = @errors.find(".salvus-latex-typesetting")
        if p.typesetting.length == 0
            elt.html("None")
        else
            elt.html("")
            cnt = 0
            for mesg in p.typesetting
                cnt += 1
                if cnt > MAX_LATEX_WARNINGS
                    elt.append($("<h4>(Not showing #{p.typesetting.length - cnt + 1} additional typesetting issues.)</h4>"))
                    break
                elt.append(@render_error_message(mesg))

    _show_error_in_file: (mesg, cb) =>
        file = mesg.file
        if not file
            alert_message(type:"error", "No way to open unknown file.")
            cb?()
            return
        if not mesg.line
            if mesg.page
                @_inverse_search
                    n          : mesg.page
                    active     : false
                    x          : 50
                    y          : 50
                    resolution : @get_resolution()
                    cb         : cb
            else
                alert_message(type:"error", "Unknown location in '#{file}'.")
                cb?()
                return
        else
            if @preview.pdflatex.filename_tex == file
                @latex_editor.set_cursor_center_focus({line:mesg.line-1, ch:0})
            else
                if @_path # make relative to home directory of project
                    file = @_path + '/' + file
                @redux.getProjectActions(@project_id).open_file
                    path : file
            cb?()

    _show_error_in_preview: (mesg) =>
        if @preview.pdflatex.filename_tex == mesg.file
            @_show_error_in_file mesg, () =>
                @show_page('png-preview')
                @forward_search(active:true)

    render_error_message: (mesg) =>
        if not mesg.line
            r = mesg.raw
            i = r.lastIndexOf('[')
            j = i+1
            while j < r.length and r[j] >= '0' and r[j] <= '9'
                j += 1
            mesg.page = r.slice(i+1,j)

        if mesg.file?.slice(0,2) == './'
            mesg.file = mesg.file.slice(2)

        elt = @_error_message_template.clone().show()
        elt.find("a:first").click () =>
            @_show_error_in_file(mesg)
            return false
        elt.find("a:last").click () =>
            @_show_error_in_preview(mesg)
            return false

        elt.addClass("salvus-editor-latex-mesg-template-#{mesg.level}")
        if mesg.line
            elt.find(".salvus-latex-mesg-line").text("line #{mesg.line}").data('line', mesg.line)
        if mesg.page
            elt.find(".salvus-latex-mesg-page").text("page #{mesg.page}").data('page', mesg.page)
        if mesg.file
            elt.find(".salvus-latex-mesg-file").text(" of #{mesg.file}").data('file', mesg.file)
        if mesg.message
            elt.find(".salvus-latex-mesg-message").text(mesg.message)
        if mesg.content
            elt.find(".salvus-latex-mesg-content").show().text(mesg.content)
        return elt


    download_pdf: () =>
        redux.getProjectActions(@project_id).download_file
            path : @filename.slice(0,@filename.length-3) + "pdf"

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
                        redux.getProjectActions(@project_id).open_file
                            path : res.input
                else
                    @latex_editor.set_cursor_center_focus({line:res.line, ch:0})
            cb?()

        @preview.pdflatex.inverse_search(opts)

    inverse_search: (opts={}) =>
        opts = defaults opts,
            active : required
            cb     : undefined
        number = @preview.current_page().number
        elt    = @preview.pdflatex.page(number).element
        if not elt?
            opts.cb?("Preview not yet loaded.")
            return
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
                    img = pg.element?.find("img")
                    if not img?
                        opts.cb?("Page #{result.n} not yet loaded.")
                        return
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
