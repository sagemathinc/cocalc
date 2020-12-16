#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

## TODO: rewrite/refactor this in typescript and move to misc-page/

$ = window.$

{IS_MOBILE} = require('./feature')
misc        = require('smc-util/misc')
{dmp}       = require('smc-util/sync/editor/generic/util')
markdown    = require('./markdown')
{sagews_canonical_mode} = require('./misc-page')

get_inspect_dialog = (editor) ->
    dialog = $('''
    <div class="webapp-codemirror-introspect modal"
         data-backdrop="static" tabindex="-1" role="dialog" aria-hidden="true">
        <div class="modal-dialog" style="width:90%">
            <div class="modal-content">
                <div class="modal-header">
                    <button type="button" class="close" aria-hidden="true">
                        <span style="font-size:20pt;">×</span>
                    </button>
                    <h4><div class="webapp-codemirror-introspect-title"></div></h4>
                </div>

                <div class="webapp-codemirror-introspect-content-source-code cm-s-default">
                </div>
                <div class="webapp-codemirror-introspect-content-docstring cm-s-default">
                </div>


                <div class="modal-footer">
                    <button class="btn btn-close btn-default">Close</button>
                </div>
            </div>
        </div>
    </div>
    ''')
    dialog.modal()
    dialog.data('editor', editor)

    dialog.find("button").click () ->
        dialog.modal('hide')
        dialog.remove() # also removing, we no longer have any use for this element!

    # see http://stackoverflow.com/questions/8363802/bind-a-function-to-twitter-bootstrap-modal-close
    dialog.on 'hidden.bs.modal', () ->
        dialog.data('editor').focus?()
        dialog.data('editor', 0)

    return dialog


#############################################
# JQuery Plugins
#############################################
{required, defaults} = require('smc-util/misc')


####################################
# Codemirror Extensions
####################################

# We factor out this extension so it can be applied to CodeMirror's in iframes, e.g., Jupyter's.

exports.cm_define_diffApply_extension = require('./codemirror/extensions/diff-apply').cm_define_diffApply_extension


exports.define_codemirror_extensions = () ->
    require('./codemirror/extensions/latex-code-folding');
    require('./codemirror/extensions/unindent');
    require('./codemirror/extensions/tab-as-space');
    require('./codemirror/extensions/set-value-nojump');
    require('./codemirror/extensions/spellcheck-highlight');
    require('./codemirror/extensions/fold-code-selection');
    require('./codemirror/extensions/latex-completions');
    require('./codemirror/extensions/align-assignments');
    require('./codemirror/extensions/find-in-line');
    require('./codemirror/extensions/sagews');
    require('./codemirror/extensions/edit-selection');

    exports.cm_define_diffApply_extension(CodeMirror)


    CodeMirror.defineExtension 'insert_link', (opts={}) ->
        opts = defaults opts,
            cb : undefined
        cm = @
        dialog = $("#webapp-editor-templates").find(".webapp-html-editor-link-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            setTimeout(focus, 50)
            return false
        url = dialog.find(".webapp-html-editor-url")
        url.focus()
        display = dialog.find(".webapp-html-editor-display")
        target  = dialog.find(".webapp-html-editor-target")
        title   = dialog.find(".webapp-html-editor-title")

        selected_text = cm.getSelection()
        display.val(selected_text)

        mode = cm.get_edit_mode()

        if mode in ['md', 'rst', 'tex']
            dialog.find(".webapp-html-editor-target-row").hide()

        submit = () =>
            dialog.modal('hide')
            if mode == 'md'
                # [Python](http://www.python.org/)
                title  = title.val()

                if title.length > 0
                    title = " \"#{title}\""

                d = display.val()
                if d.length > 0
                    s = "[#{d}](#{url.val()}#{title})"
                else
                    s = url.val()

            else if mode == "rst"
                # `Python <http://www.python.org/#target>`_

                if display.val().length > 0
                    display = "#{display.val()}"
                else
                    display = "#{url.val()}"

                s = "`#{display} <#{url.val()}>`_"

            else if mode == "tex"
                # \url{http://www.wikibooks.org}
                # \href{http://www.wikibooks.org}{Wikibooks home}
                cm.tex_ensure_preamble?("\\usepackage{url}")
                display = display.val().trim()
                url = url.val()
                url = url.replace(/#/g, "\\\#")  # should end up as \#
                url = url.replace(/&/g, "\\&")   # ... \&
                url = url.replace(/_/g, "\\_")   # ... \_
                if display.length > 0
                    s = "\\href{#{url}}{#{display}}"
                else
                    s = "\\url{#{url}}"

            else if mode == "mediawiki"
                # https://www.mediawiki.org/wiki/Help:Links
                # [http://mediawiki.org MediaWiki]
                display = display.val().trim()
                if display.length > 0
                    display = " #{display}"
                s = "[#{url.val()}#{display}]"

            else   # if mode == "html"  ## HTML default fallback
                target = target.val().trim()
                title  = title.val().trim()

                if target == "_blank"
                    target = " target='_blank' rel='noopener'"

                if title.length > 0
                    title = " title='#{title}'"

                if display.val().length > 0
                    display = "#{display.val()}"
                else
                    display = url.val()
                s = "<a href='#{url.val()}'#{title}#{target}>#{display}</a>"

            selections = cm.listSelections()
            selections.reverse()
            for sel in selections
                if sel.empty()
                    #console.log(cm, s, sel.head)
                    cm.replaceRange(s, sel.head)
                else
                    cm.replaceRange(s, sel.from(), sel.to())
            opts.cb?()

        dialog.find(".btn-submit").off('click').click(submit)
        dialog.keydown (evt) =>
            if evt.which == 13 # enter
                submit()
                return false
            if evt.which == 27 # escape
                dialog.modal('hide')
                opts.cb?()
                return false



    CodeMirror.defineExtension 'tex_ensure_preamble', (code) ->
        cm = @
        # ensures that the given line is the pre-amble of the latex document.
        # FUTURE: actually implement this!

        # in latex document do one thing

        # in sagews will do something to %latex.

    CodeMirror.defineExtension 'insert_image', (opts={}) ->
        opts = defaults opts,
            cb : undefined
        cm = @

        dialog = $("#webapp-editor-templates").find(".webapp-html-editor-image-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            return false
        url = dialog.find(".webapp-html-editor-url")
        url.focus()

        mode = cm.get_edit_mode()

        if mode == "tex"
            # different units and don't let user specify the height
            dialog.find(".webapp-html-editor-height-row").hide()
            dialog.find(".webapp-html-editor-image-width-header-tex").show()
            dialog.find(".webapp-html-editor-image-width-header-default").hide()
            dialog.find(".webapp-html-editor-width").val('80')

        submit = () =>
            dialog.modal('hide')
            title  = dialog.find(".webapp-html-editor-title").val().trim()
            height = width = ''
            h = dialog.find(".webapp-html-editor-height").val().trim()
            if h.length > 0
                height = " height=#{h}"
            w = dialog.find(".webapp-html-editor-width").val().trim()
            if w.length > 0
                width = " width=#{w}"

            if mode == 'rst'
                # .. image:: picture.jpeg
                #    :height: 100px
                #    :width: 200 px
                #    :alt: alternate text
                #    :align: right
                s = "\n.. image:: #{url.val()}\n"
                height = dialog.find(".webapp-html-editor-height").val().trim()
                if height.length > 0
                    s += "   :height: #{height}px\n"
                width = dialog.find(".webapp-html-editor-width").val().trim()
                if width.length > 0
                    s += "   :width: #{width}px\n"
                if title.length > 0
                    s += "   :alt: #{title}\n"

            else if mode == 'md' and width.length == 0 and height.length == 0
                # use markdown's funny image format if width/height not given
                if title.length > 0
                    title = " \"#{title}\""
                s = "![](#{url.val()}#{title})"

            else if mode == "tex"
                cm.tex_ensure_preamble("\\usepackage{graphicx}")
                width = parseInt(dialog.find(".webapp-html-editor-width").val(), 10)
                if "#{width}" == "NaN"
                    width = "0.8"
                else
                    width = "#{width/100.0}"
                if title.length > 0
                    s = """
                        \\begin{figure}[p]
                            \\centering
                            \\includegraphics[width=#{width}\\textwidth]{#{url.val()}}
                            \\caption{#{title}}
                        \\end{figure}
                        """
                else
                    s = "\\includegraphics[width=#{width}\\textwidth]{#{url.val()}}"

            else if mode == "mediawiki"
                # https://www.mediawiki.org/wiki/Help:Images
                # [[File:Example.jpg|<width>[x<height>]px]]
                size = ""
                if w.length > 0
                    size = "|#{w}"
                    if h.length > 0
                        size += "x#{h}"
                    size += "px"
                s = "[[File:#{url.val()}#{size}]]"

            else # fallback for mode == "md" but height or width is given
                if title.length > 0
                    title = " title='#{title}'"
                s = "<img src='#{url.val()}'#{width}#{height}#{title}>"
            selections = cm.listSelections()
            selections.reverse()
            for sel in selections
                cm.replaceRange(s, sel.head)
            opts.cb?()

        dialog.find(".btn-submit").off('click').click(submit)
        dialog.keydown (evt) =>
            if evt.which == 13 # enter
                submit()
                return false
            if evt.which == 27 # escape
                dialog.modal('hide')
                opts.cb?()
                return false

    CodeMirror.defineExtension 'insert_special_char', (opts={}) ->
        opts = defaults opts,
            cb : undefined
        cm = @

        mode = cm.get_edit_mode()
        if mode not in ['html', 'md']
            bootbox.alert("<h3>Not Implemented</h3><br>#{mode} special symbols not yet implemented")
            return

        dialog = $("#webapp-editor-templates").find(".webapp-html-editor-symbols-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            return false


        selected = (evt) =>
            target = $(evt.target)
            if target.prop("tagName") != "SPAN"
                return
            dialog.modal('hide')
            code = target.attr("title")
            s = "&#{code};"
            # FUTURE: HTML-based formats will work, but not LaTeX.
            # As long as the input encoding in LaTeX is utf8, just insert the actual utf8 character (target.text())

            selections = cm.listSelections()
            selections.reverse()
            for sel in selections
                cm.replaceRange(s, sel.head)
            opts.cb?()

        dialog.find(".webapp-html-editor-symbols-dialog-table").off("click").click(selected)
        dialog.keydown (evt) =>
            if evt.which == 13 # enter
                submit()
                return false
            if evt.which == 27 # escape
                dialog.modal('hide')
                opts.cb?()
                return false




