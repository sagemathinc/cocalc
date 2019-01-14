###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

$ = window.$

{IS_MOBILE} = require('./feature')
misc        = require('smc-util/misc')
{dmp}       = require('smc-util/sync/editor/generic/util')
buttonbar   = require('./buttonbar')
markdown    = require('./markdown')
theme       = require('smc-util/theme')

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


exports.is_shift_enter = (e) -> e.which is 13 and e.shiftKey
exports.is_enter       = (e) -> e.which is 13 and not e.shiftKey
exports.is_ctrl_enter  = (e) -> e.which is 13 and e.ctrlKey
exports.is_escape      = (e) -> e.which is 27

{join} = require('path')
exports.APP_BASE_URL = window?.app_base_url ? ''
exports.BASE_URL = if window? then "#{window.location.protocol}//#{join(window.location.hostname, window.app_base_url ? '')}" else theme.DOMAIN_NAME

local_diff = exports.local_diff = (before, after) ->
    # Return object
    #
    #    {pos:index_into_before, orig:"substring of before starting at pos", repl:"what to replace string by"}
    #
    # that explains how to transform before into after via a substring
    # replace.  This addresses the case when before has been *locally*
    # edited to obtain after.
    #
    if not before?
        return {pos:0, orig:'', repl:after}
    i = 0
    while i < before.length and before[i] == after[i]
        i += 1
    # We now know that they differ at position i
    orig = before.slice(i)
    repl = after.slice(i)

    # Delete the biggest string in common at the end of orig and repl.
    # This works well for local edits, which is what this command is
    # aimed at.
    j = orig.length - 1
    d = repl.length - orig.length
    while j >= 0 and d+j>=0 and orig[j] == repl[d+j]
        j -= 1
    # They differ at position j (resp., d+j)
    orig = orig.slice(0, j+1)
    repl = repl.slice(0, d+j+1)
    return {pos:i, orig:orig, repl:repl}

exports.scroll_top = () ->
    # Scroll smoothly to the top of the page.
    $("html, body").animate({ scrollTop: 0 })


#############################################
# JQuery Plugins
#############################################
{required, defaults} = require('smc-util/misc')

# These should all get moved to this subdir and be in typescript.  For now there is one:
require('./jquery-plugins/katex')

# Force reload all images by appending random query param to their src URL.
# But not for base64 data images -- https://github.com/sagemathinc/cocalc/issues/3141
$.fn.reload_images = (opts) ->
    @each ->
        for img in $(this).find('img')
            src = $(img).attr('src')
            if misc.startswith(src, 'data:')
                continue
            $(img).attr('src', src + '?' + Math.random())

# Highlight all code blocks that have CSS class language-r, language-python.
# TODO: I just put in r and python for now, since this is mainly
# motivated by rmd files.
$.fn.highlight_code = (opts) ->
    @each ->
        for mode in ['r', 'python']
            for elt in $(this).find("code.language-#{mode}")
                code = $(elt)
                CodeMirror.runMode(code.text(), mode, elt)
                code.addClass('cm-s-default')
                code.removeClass('language-#{mode}')  # done

# jQuery plugin for spinner (/spin/spin.min.js)
$.fn.spin = (opts) ->
    @each ->
        $this = $(this)
        data = $this.data()
        if data.spinner
            data.spinner.stop()
            delete data.spinner
        if opts isnt false
            Spinner = require("spin/spin.min.js")
            data.spinner = new Spinner($.extend({color: $this.css("color")}, opts)).spin(this)
    return this

# jQuery plugin for spinner (/spin/spin.min.js)
$.fn.exactly_cover = (other) ->
    @each ->
        elt = $(this)
        elt.offset(other.offset())
        elt.width(other.width())
        elt.height(other.height())
    return this

# Easily enable toggling details of some elements...
# (grep code for usage examples)
$.fn.smc_toggle_details = (opts) ->
    opts = defaults opts,
        show   : required   # string -- jquery selector
        hide   : required   # string -- jquery selector
        target : required   # string -- jquery selector
    @each ->
        elt = $(this)
        elt.find(opts.show).click () ->
            elt.find(opts.show).hide()
            elt.find(opts.hide).show()
            elt.find(opts.target).show()
            elt.addClass('smc-toggle-show')
        elt.find(opts.hide).click () ->
            elt.find(opts.hide).hide()
            elt.find(opts.show).show()
            elt.find(opts.target).hide()
            elt.removeClass('smc-toggle-show')
        return elt


# jQuery plugin that sets the innerHTML of an element and doesn't do anything with script tags;
# in particular, doesn't explicitly remove and run them like jQuery does.
$.fn.html_noscript = (html) ->
    @each ->
        this.innerHTML = html
        t = $(this)
        t.find('script').remove()
        return t

# MathJax some code -- jQuery plugin
# ATTN: do not call MathJax directly, but always use this .mathjax() plugin.
# from React.js, the canonical way to call it is $(ReactDOM.findDOMNode(@)).mathjax() (e.g. Markdown in r_misc)

# this queue is used, when starting up or when it isn't configured (yet)
mathjax_queue = []
mathjax_enqueue = (x) ->
    if MathJax?.Hub?
        if x[0] == 'Typeset'
            # insert MathJax.Hub as 2nd entry
            MathJax.Hub.Queue([x[0], MathJax.Hub, x[1]])
        else
            MathJax.Hub.Queue(x)
    else
        mathjax_queue.push(x)

exports.mathjax_finish_startup = ->
    for x in mathjax_queue
        mathjax_enqueue(x)

mathjax_typeset = (el) ->
    # no MathJax.Hub, since there is no MathJax defined!
    mathjax_enqueue(["Typeset", el])

$.fn.extend
    mathjax: (opts={}) ->
        opts = defaults opts,
            tex                 : undefined
            display             : false
            inline              : false
            hide_when_rendering : false         # if true, entire element will get hidden until mathjax is rendered
            cb                  : undefined     # if defined, gets called as cb(t) for *every* element t in the jquery set!
        @each () ->
            t = $(this)
            if not opts.tex? and not opts.display and not opts.inline
                # Doing this test is still much better than calling mathjax below, since I guess
                # it doesn't do a simple test first... and mathjax is painful.
                html = t.html().toLowerCase()
                if html.indexOf('$') == -1 and html.indexOf('\\') == -1 and html.indexOf('math/tex') == -1
                    opts.cb?()
                    return t
                # this is a common special case - the code below would work, but would be
                # stupid, since it involves converting back and forth between html
                element = t
            else
                if opts.tex?
                    tex = opts.tex
                else
                    tex = t.html()
                if opts.display
                    tex = "$${#{tex}}$$"
                else if opts.inline
                    tex = "\\({#{tex}}\\)"
                element = t.html(tex)
            if opts.hide_when_rendering
                t.hide()
            mathjax_typeset(element[0])
            if opts.hide_when_rendering
                mathjax_enqueue([=>t.show()])
            if opts.cb?
                mathjax_enqueue([opts.cb, t])
            return t

$.fn.extend
    unmathjax: (opts={}) ->
        opts = defaults(opts,{})
        @each () ->
            t = $(this)
            for c in "MathJax_Preview MathJax_SVG MathJax_SVG_Display MathJax MathJax_MathML".split(' ')
                t.find(".#{c}").remove()
            for s in t.find("script[type='math/tex']")
                a = $(s)
                a.replaceWith(" $#{a.text()}$ ")
            for s in t.find("script[type='math/tex; mode=display']")
                a = $(s)
                a.replaceWith(" $$#{a.text()}$$ ")
            return t

$.fn.extend
    equation_editor: (opts={}) ->
        opts = defaults opts,
            display  : false
            value    : ''
            onchange : undefined
        @each () ->
            t = $(this)
            if opts.display
                delim = '$$'
                s = $("<div class='sagews-editor-latex-raw' style='width:50%'><textarea></textarea><br><div class='sagews-editor-latex-preview'></div></div>")
            else
                delim = '$'
                s = $("<div class='sagews-editor-latex-raw' style='width:50%'><textarea></textarea><br><div class='sagews-editor-latex-preview'></div></span>")
            s.attr('id', misc.uuid())
            ed = s.find("textarea")
            options =
                autofocus               : true
                mode                    : {name:'stex', globalVars: true}
                lineNumbers             : false
                showTrailingSpace       : false
                indentUnit              : 4
                tabSize                 : 4
                smartIndent             : true
                electricChars           : true
                undoDepth               : 100
                matchBrackets           : true
                autoCloseBrackets       : true
                autoCloseTags           : true
                lineWrapping            : true
                readOnly                : false
                styleActiveLine         : 15
                indentWithTabs          : false
                showCursorWhenSelecting : true
                viewportMargin          : Infinity
                extraKeys               : {}

            t.replaceWith(s)
            cm = CodeMirror.fromTextArea(ed[0], options)
            #console.log("setting value to '#{opts.value}'")
            trim_dollars = (code) ->
                code = code.trim()
                while code[0] == '$'
                    code = code.slice(1)
                while code[code.length-1] == '$'
                    code = code.slice(0,code.length-1)
                return code.trim()

            cm.setValue(delim + '\n\n' + opts.value + '\n\n' +  delim)
            cm.setCursor(line:2,ch:0)
            ed.val(opts.value)
            #cm.clearHistory()  # ensure that the undo history doesn't start with "empty document"
            $(cm.getWrapperElement()).css(height:'auto')
            preview = s.find(".sagews-editor-latex-preview")
            preview.click () =>
                cm.focus()
            update_preview = () ->
                preview.mathjax
                    tex     : trim_dollars(cm.getValue())
                    display : opts.display
                    inline  : not opts.display
            if opts.onchange?
                cm.on 'change', () =>
                    update_preview()
                    opts.onchange()
                    ed.val(trim_dollars(cm.getValue()))
            s.data('delim', delim)
            update_preview()
            return t

# Mathjax-enabled Contenteditable Editor plugin
$.fn.extend
    make_editable: (opts={}) ->
        @each () ->
            opts = defaults opts,
                value    : undefined   # defaults to what is already there
                onchange : undefined   # function that gets called when content changes
                interval : 250         # call onchange if there was a change, but no more for this many ms.
                one_line : false       # if true, blur when user presses the enter key
                mathjax  : false       # if false, completey ignore ever running mathjax -- probably a good idea since support for running it is pretty broken.

                cancel   : false       # if given, instead removes all handlers/editable from element

            t = $(this)

            if opts.cancel
                t.data('cancel_editor')?()
                # FUTURE: clear state -- get rid of function data...
                return

            if not opts.value?
                opts.value = t.html()

            last_sync = opts.value

            t.data('onchange', opts.onchange)

            change_timer = undefined
            report_change = () ->
                change_timer = undefined
                last_update = t.data('last_update')
                if t.data('mode') == 'edit'
                    now = t.html()
                else
                    now = t.data('raw')
                if last_update isnt now
                    #console.log("reporting change since '#{last_update}' != '#{now}'")
                    opts.onchange(now, t)
                    t.data('last_update', now)
                    last_sync = now

            set_change_timer = () ->
                if opts.onchange?
                    if change_timer?
                        clearTimeout(change_timer)
                    change_timer = setTimeout(report_change, opts.interval)

            # set the text content; it will be subsequently processed by mathjax, if opts.mathjax is true
            set_value = (value) ->
                t.data
                    raw         : value
                    mode        : 'view'
                t.html(value)
                if opts.mathjax
                    t.mathjax()
                set_change_timer()

            get_value = () ->
                if t.data('mode') == 'view'
                    return t.data('raw')
                else
                    return t.html()

            set_upstream = (upstream) ->
                cur = get_value()
                if cur != upstream
                    last = last_sync
                    p = dmp.patch_make(last, upstream)
                    #console.log("syncing:\ncur='#{cur}'\nupstream='#{upstream}'\nlast='#{last}'\npatch='#{misc.to_json(p)}'")
                    new_cur = dmp.patch_apply(p, cur)[0]
                    last_sync = new_cur
                    if new_cur != cur
                        #console.log("new_cur='#{new_cur}'")
                        set_value(new_cur)
                        report_change()

            on_focus = () ->
                #console.log("on_focus")
                if t.data('mode') == 'edit'
                    return
                t.data('mode', 'edit')
                t = $(this)
                x = t.data('raw')

            on_blur = () ->
                #console.log("on_blur")
                t = $(this)
                t.data
                    raw  : t.html()
                    mode : 'view'
                if opts.mathjax
                    t.mathjax()


            #on_keydown = (evt) ->
            #    if evt.which == 27 or (opts.one_line and evt.which == 13)
            #        t.blur()
            #        return false

            t.attr('contenteditable', true)

            handlers =
                focus   : on_focus
                blur    : on_blur
                paste   : set_change_timer
                keyup   : set_change_timer
                keydown : set_change_timer

            for evt, f of handlers
                t.on(evt, f)

            data =
                set_value    : set_value
                get_value    : get_value
                set_upstream : set_upstream
                last_update  : opts.value

            t.data(data)

            t.data 'cancel_editor', () =>
                #console.log("cancel_editor")
                t.attr('contenteditable', false)
                for evt, f of handlers
                    t.unbind(evt, f)
                for key,_ of data
                    t.removeData(key)

            set_value(opts.value)
            return t



####################################
# Codemirror Extensions
####################################

# We factor out this extension so it can be applied to CodeMirror's in iframes, e.g., Jupyter's.

exports.cm_define_diffApply_extension = (cm) ->
    # applies a diff and returns last pos modified
    cm.defineExtension 'diffApply', (diff) ->
        editor = @
        next_pos = (val, pos) ->
            # This functions answers the question:
            # If you were to insert the string val at the CodeMirror position pos
            # in a codemirror document, at what position (in codemirror) would
            # the inserted string end at?
            number_of_newlines = (val.match(/\n/g)||[]).length
            if number_of_newlines == 0
                return {line:pos.line, ch:pos.ch+val.length}
            else
                return {line:pos.line+number_of_newlines, ch:(val.length - val.lastIndexOf('\n')-1)}

        pos = {line:0, ch:0}  # start at the beginning
        last_pos = undefined
        for chunk in diff
            #console.log(chunk)
            op  = chunk[0]  # 0 = stay same; -1 = delete; +1 = add
            val = chunk[1]  # the actual text to leave same, delete, or add
            pos1 = next_pos(val, pos)

            switch op
                when 0 # stay the same
                    # Move our pos pointer to the next position
                    pos = pos1
                    #console.log("skipping to ", pos1)
                when -1 # delete
                    # Delete until where val ends; don't change pos pointer.
                    editor.replaceRange("", pos, pos1)
                    last_pos = pos
                    #console.log("deleting from ", pos, " to ", pos1)
                when +1 # insert
                    # Insert the new text right here.
                    editor.replaceRange(val, pos)
                    #console.log("inserted new text at ", pos)
                    # Move our pointer to just beyond the text we just inserted.
                    pos = pos1
                    last_pos = pos1
        return last_pos

exports.cm_define_testbot = (cm) ->
    cm.defineExtension 'testbot', (opts) ->
        opts = defaults opts,
            n     : 30
            delay : 500
            f     : undefined  # if defined, gets called after each change.
        e = @
        pos = e.getCursor()
        ch = pos.ch
        k = 1
        f = () ->
            s = "#{k} "
            ch += s.length
            e.replaceRange(s, {line:pos.line, ch:ch})
            opts.f?()
            if k < opts.n
                k += 1
                setTimeout(f, opts.delay)
        f()

exports.sagews_canonical_mode = (name, default_mode) ->
    switch name
        when 'markdown'
            return 'md'
        when 'xml'
            return 'html'
        when 'mediawiki'
            return 'mediawiki'
        when 'stex'
            return 'tex'
        when 'python'
            return 'python'
        when 'r'
            return 'r'
        when 'sagews'
            return 'sage'
        when 'shell'
            return 'shell'
        else
            return default_mode

exports.define_codemirror_extensions = () ->

    # LaTeX code folding (isn't included in CodeMirror)

    get_latex_environ = (s) ->
        i = s.indexOf('{')
        j = s.indexOf('}')
        if i != -1 and j != -1
            return s.slice(i+1,j).trim()
        else
            return undefined

    startswith = misc.startswith

    CodeMirror.registerHelper "fold", "stex", (cm, start) ->
        trimStart = require('lodash/trimStart')
        line = trimStart(cm.getLine(start.line))
        find_close = () ->
            BEGIN = "\\begin"
            if startswith(line, BEGIN)
                # \begin{foo}
                # ...
                # \end{foo}
                # find environment close
                environ = get_latex_environ(line.slice(BEGIN.length))
                if not environ?
                    return [undefined, undefined]
                # find environment close
                END   = "\\end"
                level = 0
                begin = new RegExp("\\\\begin\\s*{#{environ}}")
                end   = new RegExp("\\\\end\\s*{#{environ}}")
                for i in [start.line..cm.lastLine()]
                    cur = cm.getLine(i)
                    m = cur.search(begin)
                    j = cur.search(end)
                    if m != -1 and (j == -1 or m < j)
                        level += 1
                    if j != -1
                        level -= 1
                        if level == 0
                            return [i, j + END.length - 1]

            else if startswith(line, "\\[")
                for i in [start.line+1..cm.lastLine()]
                    if startswith(trimStart(cm.getLine(i)), "\\]")
                        return [i, 0]

            else if startswith(line, "\\(")
                for i in [start.line+1..cm.lastLine()]
                    if startswith(trimStart(cm.getLine(i)), "\\)")
                        return [i, 0]

            else if startswith(line, "\\documentclass")
                # pre-amble
                for i in [start.line+1..cm.lastLine()]
                    if startswith(trimStart(cm.getLine(i)), "\\begin{document}")
                        return [i - 1, 0]

            else if startswith(line, "\\chapter")
                # book chapter
                for i in [start.line+1..cm.lastLine()]
                    if startswith(trimStart(cm.getLine(i)), ["\\chapter", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()

            else if startswith(line, "\\section")
                # article section
                for i in [start.line+1..cm.lastLine()]
                    if startswith(trimStart(cm.getLine(i)), ["\\chapter", "\\section", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()

            else if startswith(line, "\\subsection")
                # article subsection
                for i in [start.line+1..cm.lastLine()]
                    if startswith(trimStart(cm.getLine(i)), ["\\chapter", "\\section", "\\subsection", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()

            else if startswith(line, "\\subsubsection")
                # article subsubsection
                for i in [start.line+1..cm.lastLine()]
                    if startswith(trimStart(cm.getLine(i)), ["\\chapter", "\\section", "\\subsection", "\\subsubsection", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()

            else if startswith(line, "\\subsubsubsection")
                # article subsubsubsection
                for i in [start.line+1..cm.lastLine()]
                    if startswith(trimStart(cm.getLine(i)), ["\\chapter", "\\section", "\\subsection", "\\subsubsection", "\\subsubsubsection", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()

            else if startswith(line, "%\\begin{}")
                # support what texmaker supports for custom folding -- http://tex.stackexchange.com/questions/44022/code-folding-in-latex
                for i in [start.line+1..cm.lastLine()]
                    if startswith(trimStart(cm.getLine(i)), "%\\end{}")
                        return [i, 0]

            return [undefined, undefined]  # no folding here...

        [i, j] = find_close()
        if i?
            line = cm.getLine(start.line)
            k = line.indexOf("}")
            if k == -1
                k = line.length
            range =
                from : CodeMirror.Pos(start.line, k+1)
                to   : CodeMirror.Pos(i, j)
            return range
        else
            # nothing to fold
            return undefined

    CodeMirror.defineExtension 'unindent_selection', () ->
        editor     = @

        for selection in editor.listSelections()
            {start_line, end_line} = cm_start_end(selection)
            all_need_unindent = true
            for n in [start_line .. end_line]
                s = editor.getLine(n)
                if not s?
                    return
                if s.length ==0 or s[0] == '\t' or s[0] == ' '
                    continue
                else
                    all_need_unindent = false
                    break
            if all_need_unindent
                for n in [start_line .. end_line]
                    editor.indentLine(n, "subtract")

    CodeMirror.defineExtension 'tab_as_space', () ->
        cursor = @getCursor()
        for i in [0...@.options.tabSize]
            @replaceRange(' ', cursor)

    # Apply a CodeMirror changeObj to this editing buffer.
    CodeMirror.defineExtension 'apply_changeObj', (changeObj) ->
        @replaceRange(changeObj.text, changeObj.from, changeObj.to)
        if changeObj.next?
            @apply_changeObj(changeObj.next)

    exports.cm_define_diffApply_extension(CodeMirror)
    exports.cm_define_testbot(CodeMirror)

    # Delete all trailing whitespace from the editor's buffer.
    CodeMirror.defineExtension 'delete_trailing_whitespace', (opts={}) ->
        opts = defaults opts,
            omit_lines : {}
        # We *could* easily make a one-line version of this function that
        # just uses setValue.  However, that would mess up the undo
        # history (!), and potentially feel jumpy.
        changeObj = undefined
        val       = @getValue()
        text1     = val.split('\n')
        text2     = misc.delete_trailing_whitespace(val).split('\n')    # a very fast regexp.
        pos       = @getCursor()
        if text1.length != text2.length
            console.log("Internal error -- there is a bug in misc.delete_trailing_whitespace; please report.")
            return
        opts.omit_lines[pos.line] = true
        for i in [0...text1.length]
            if opts.omit_lines[i]?
                continue
            if text1[i].length != text2[i].length
                obj = {from:{line:i,ch:text2[i].length}, to:{line:i,ch:text1[i].length}, text:[""]}
                if not changeObj?
                    changeObj = obj
                    currentObj = changeObj
                else
                    currentObj.next = obj
                    currentObj = obj
        if changeObj?
            @apply_changeObj(changeObj)

    # Set the value of the buffer to something new by replacing just the ranges
    # that changed, so that the view/history/etc. doesn't get messed up.
    # Setting scroll_last to ture sets cursor to last changed position and puts cursors
    # there; this is used for undo/redo.
    CodeMirror.defineExtension 'setValueNoJump', (value, scroll_last) ->
        if not value?
            # Special case -- trying to set to value=undefined.  This is the sort of thing
            # that might rarely happen right as the document opens or closes, for which
            # there is no meaningful thing to do but "do nothing".  We detected this periodically
            # by catching user stacktraces in production...  See https://github.com/sagemathinc/cocalc/issues/1768
            return
        current_value = @getValue()
        if value == current_value
            # Nothing to do
            return

        r = @getOption('readOnly')
        if not r
            @setOption('readOnly', true)
        @_setValueNoJump = true  # so the cursor events that happen as a direct result of this setValue know.

        # Determine information so we can restore the scroll position
        t      = @getScrollInfo().top
        b      = @setBookmark(line:@lineAtHeight(t, 'local'))
        before = @heightAtLine(@lineAtHeight(t, 'local'))

        # Change the buffer in place by applying the diffs as we go; this avoids replacing the entire buffer,
        # which would cause total chaos.
        last_pos = @diffApply(dmp.diff_main(current_value, value))

        # Now, if possible, restore the exact scroll position.
        n = b.find()?.line
        if n?
            @scrollTo(undefined, @getScrollInfo().top - (before - @heightAtLine(b.find().line)))
            b.clear()

        if not r
            @setOption('readOnly', false)
            if scroll_last and last_pos?
                @scrollIntoView(last_pos)
                @setCursor(last_pos)

        delete @_setValueNoJump

        # Just do an expensive double check that the above worked.  I have no reason
        # to believe the above could ever fail... but maybe it does in some very rare
        # cases, and if it did, the results would be PAINFUL.  So... we just brutally
        # do the set if it fails.  This will mess up cursors, etc., but that's a reasonable
        # price to pay for correctness.
        if value != @getValue()
            console.warn("setValueNoJump failed -- just setting value directly")
            @setValue(value)

    CodeMirror.defineExtension 'patchApply', (patch) ->
        ## OPTIMIZATION: this is a very stupid/inefficient way to turn
        ## a patch into a diff.  We should just directly rewrite
        ## the code below to work with patch.
        cur_value = @getValue()
        new_value = dmp.patch_apply(patch, cur_value)[0]
        diff = dmp.diff_main(cur_value, new_value)
        @diffApply(diff)

    # This is an improved rewrite of simple-hint.js from the CodeMirror3 distribution.
    CodeMirror.defineExtension 'showCompletions', (opts) ->
        {from, to, completions, target, completions_size} = defaults opts,
            from             : required
            to               : required
            completions      : required
            target           : required
            completions_size : 20

        if completions.length == 0
            return

        start_cursor_pos = @getCursor()
        that = @
        insert = (str) ->
            pos = that.getCursor()
            from.line = pos.line
            to.line   = pos.line
            shift = pos.ch - start_cursor_pos.ch
            from.ch += shift
            to.ch   += shift
            that.replaceRange(str, from, to)

        if completions.length == 1
            # do not include target in appended completion if it has a '*'
            if target.indexOf('*') == -1
                insert(target + completions[0])
            else
                insert(completions[0])
            return

        sel = $("<select>").css('width','auto')
        complete = $("<div>").addClass("webapp-completions").append(sel)
        for c in completions
            # do not include target in appended completion if it has a '*'
            if target.indexOf('*') == -1
                sel.append($("<option>").text(target + c))
            else
                sel.append($("<option>").text(c))
        sel.find(":first").attr("selected", true)
        sel.attr("size", Math.min(completions_size, completions.length))
        pos = @cursorCoords(from)

        complete.css
            left : pos.left   + 'px'
            top  : pos.bottom + 'px'
        $("body").append(complete)
        # If we're at the edge of the screen, then we want the menu to appear on the left of the cursor.
        winW = window.innerWidth or Math.max(document.body.offsetWidth, document.documentElement.offsetWidth)
        if winW - pos.left < sel.attr("clientWidth")
            complete.css(left: (pos.left - sel.attr("clientWidth")) + "px")
        # Hide scrollbar
        if completions.length <= completions_size
            complete.css(width: (sel.attr("clientWidth") - 1) + "px")

        done = false

        close = () ->
            if done
                return
            done = true
            complete.remove()

        pick = () ->
            insert(sel.val())
            close()
            if not IS_MOBILE
                setTimeout((() -> that.focus()), 50)

        sel.blur(pick)
        sel.dblclick(pick)
        if not IS_MOBILE  # do not do this on mobile, since it makes it unusable!
            sel.click(pick)
        sel.keydown (event) ->
            code = event.keyCode
            switch code
                when 13 # enter
                    pick()
                    return false
                when 27
                    close()
                    that.focus()
                    return false
                else
                    if code != 38 and code != 40 and code != 33 and code != 34 and not CodeMirror.isModifierKey(event)
                        close()
                        that.focus()
                        # Pass to CodeMirror (e.g., backspace)
                        that.triggerOnKeyDown(event)
        sel.focus()
        return sel

    CodeMirror.defineExtension 'showIntrospect', (opts) ->
        opts = defaults opts,
            from      : required
            content   : required
            type      : required   # 'docstring', 'source-code' -- FUTURE:
            target    : required
        if typeof(opts.content) != 'string'
            # If for some reason the content isn't a string (e.g., undefined or an object or something else),
            # convert it a string, which will display fine.
            opts.content = "#{JSON.stringify(opts.content)}"
        element = get_inspect_dialog(@)
        element.find(".webapp-codemirror-introspect-title").text(opts.target)
        element.show()
        if opts.type == 'source-code'
            elt = element.find(".webapp-codemirror-introspect-content-source-code")[0]
            if elt? # see https://github.com/sagemathinc/cocalc/issues/1993
                CodeMirror.runMode(opts.content, 'python', elt)
        else
            elt = element.find(".webapp-codemirror-introspect-content-docstring")[0]
            if elt?  # see https://github.com/sagemathinc/cocalc/issues/1993
                CodeMirror.runMode(opts.content, 'text/x-rst', elt)

    # Codemirror extension that takes as input an arrow of words (or undefined)
    # and visibly keeps those marked as misspelled.  If given empty input, cancels this.
    # If given another input, that replaces the current one.
    CodeMirror.defineExtension 'spellcheck_highlight', (words) ->
        cm = @
        if cm._spellcheck_highlight_overlay?
            cm.removeOverlay(cm._spellcheck_highlight_overlay)
            delete cm._spellcheck_highlight_overlay
        if words? and words.length > 0
            v = {}
            # make faster-to-check dictionary
            for w in words
                v[w] = true
            words = v
            # define overlay mode
            token = (stream, state) ->
                # stream.match(/^\w+/) means "begins with 1 or more word characters", and eats them all.
                if stream.match(/^\w+/) and words[stream.current()]
                    return 'spell-error'
                # eat whitespace
                while stream.next()?
                    # stream.match(/^\w+/, false) means "begins with 1 or more word characters", but don't eat them up
                    if stream.match(/^\w+/, false)
                        return
            cm._spellcheck_highlight_overlay = {token: token}
            cm.addOverlay(cm._spellcheck_highlight_overlay)

    CodeMirror.defineExtension 'foldCodeSelectionAware', (mode) ->
        editor = @
        # The variable mode determines whether we are mode or unfolding *everything*
        # selected.  If mode='fold', mode everything; if mode='unfold', unfolding everything;
        # and if mode=undefined, not yet decided.  If undecided, it's decided on the first
        # thing that we would toggle, e.g., if the first fold point is unfolded, we make sure
        # everything is folded in all ranges, but if the first fold point is not folded, we then
        # make everything unfolded.
        for selection in editor.listSelections()
            {start_line, end_line} = cm_start_end(selection)
            for n in [start_line .. end_line]
                pos = CodeMirror.Pos(n)
                if mode?
                    editor.foldCode(pos, null, mode)
                else
                    # try to toggle and see if anything happens
                    is_folded = editor.isFolded(pos)
                    editor.foldCode(pos)
                    if editor.isFolded(pos) != is_folded
                        # this is a foldable line, and what did we do?  keep doing it.
                        mode = if editor.isFolded(pos) then "fold" else "unfold"

    # $.get '/static/codemirror-extra/data/latex-completions.txt', (data) ->
    require.ensure [], =>
        data = require('raw-loader!codemirror-extra/data/latex-completions.txt')
        s = data.split('\n')
        tex_hint = (editor) ->
            cur   = editor.getCursor()
            token = editor.getTokenAt(cur)
            #console.log(token)
            t = token.string
            completions = (a for a in s when a.slice(0,t.length) == t)
            ans =
                list : completions,
                from : CodeMirror.Pos(cur.line, token.start)
                to   : CodeMirror.Pos(cur.line, token.end)
        CodeMirror.registerHelper("hint", "stex", tex_hint)


    EDIT_COMMANDS = buttonbar.commands

    CodeMirror.defineExtension 'get_edit_mode', (opts) ->
        opts = defaults opts, {}
        cm = @
        switch cm.getModeAt(cm.getCursor()).name
            when 'markdown'
                return 'md'
            when 'xml'
                return 'html'
            when 'mediawiki'
                return 'mediawiki'
            when 'stex'
                return 'tex'
            when 'python' # FUTURE how to tell it to return sage when in a sagews file?
                return 'python'
            when 'r'
                return 'r'
            when 'julia'
                return 'julia'
            when 'sagews'    # WARNING: this doesn't work
                return 'sage'
            else
                mode = cm.getOption('mode').name
                if mode.slice(0,3) == 'gfm'
                    return 'md'
                else if mode.slice(0,9) == 'htmlmixed'
                    return 'html'
                else if mode.indexOf('mediawiki') != -1
                    return 'mediawiki'
                else if mode.indexOf('rst') != -1
                    return 'rst'
                else if mode.indexOf('stex') != -1
                    return 'tex'
                if mode not in ['md', 'html', 'tex', 'rst', 'mediawiki', 'sagews', 'r']
                    return 'html'

    CodeMirror.defineExtension 'edit_selection', (opts) ->
        opts = defaults opts,
            cmd  : required
            args : undefined
            mode : undefined
            cb   : undefined  # called after done; if there is a dialog, this could be a while.
        cm = @
        default_mode = opts.mode
        if not default_mode?
            default_mode = cm.get_edit_mode()

        canonical_mode = (name) ->
            exports.sagews_canonical_mode(name, default_mode)

        args = opts.args
        cmd = opts.cmd

        #console.log("edit_selection '#{misc.to_json(opts)}', mode='#{default_mode}'")

        # FUTURE: will have to make this more sophisticated, so it can
        # deal with nesting, spans, etc.
        strip = (src, left, right) ->
            #console.log("strip:'#{src}','#{left}','#{right}'")
            left  = left.toLowerCase()
            right = right.toLowerCase()
            src0  = src.toLowerCase()
            i = src0.indexOf(left)
            if i != -1
                j = src0.lastIndexOf(right)
                if j != -1
                    #console.log('strip match')
                    opts.cb?()
                    return src.slice(0,i) + src.slice(i+left.length,j) + src.slice(j+right.length)

        selections = cm.listSelections()
        #selections.reverse()
        for selection in selections
            mode = canonical_mode(cm.getModeAt(selection.head).name)
            #console.log("edit_selection(mode='#{mode}'), selection=", selection)
            from = selection.from()
            to = selection.to()
            src = cm.getRange(from, to)
            start_line_beginning = from.ch == 0
            until_line_ending    = cm.getLine(to.line).length == to.ch

            mode1 = mode
            data_for_mode = EDIT_COMMANDS[mode1]
            if not data_for_mode?
                console.warn("mode '#{mode1}' is not defined!")
                opts.cb?()
                return
            how = data_for_mode[cmd]
            if not how?
                if mode1 in ['md', 'mediawiki', 'rst']
                    # html fallback for markdown
                    mode1 = 'html'
                else if mode1 == "python"
                    # Sage fallback in python mode. FUTURE: There should be a Sage mode.
                    mode1 = "sage"
                how = EDIT_COMMANDS[mode1][cmd]

            # trim whitespace
            i = 0
            j = src.length-1
            if how? and (if how.trim? then how.trim else true)
                while i < src.length and /\s/.test(src[i])
                    i += 1
                while j > 0 and /\s/.test(src[j])
                    j -= 1
            j += 1
            left_white  = src.slice(0,i)
            right_white = src.slice(j)
            src         = src.slice(i,j)
            src0        = src

            done = false

            # this is an abuse, but having external links to the documentation is good
            if how?.url?
                tab = window.open(how.url, '_blank')
                tab.focus()
                done = true

            if how?.wrap?
                space = how.wrap.space
                left  = how.wrap.left  ? ""
                right = how.wrap.right ? ""
                process = (src) ->
                    if how.strip?
                        # Strip out any tags/wrapping from conflicting modes.
                        for c in how.strip
                            wrap = EDIT_COMMANDS[mode1][c].wrap
                            if wrap?
                                src1 = strip(src, wrap.left ? '', wrap.right ? '')
                                if src1?
                                    src = src1
                                    if space and src[0] == ' '
                                        src = src.slice(1)

                    src1  = strip(src, left, right)
                    if src1
                        # strip the wrapping
                        src = src1
                        if space and src[0] == ' '
                            src = src.slice(1)
                    else
                        # do the wrapping
                        src = "#{left}#{if space then ' ' else ''}#{src}#{right}"
                    return src

                if how.wrap.multi
                    src = (process(x) for x in src.split('\n')).join('\n')
                else
                    src = process(src)
                if how.wrap.newline
                    src = '\n' + src + '\n'
                    if not start_line_beginning
                        src = '\n' + src
                    if not until_line_ending
                        src += '\n'
                done = true

            if how?.insert? # to insert the code snippet right below, next line
                # SMELL: no idea what the strip(...) above is actually doing
                # no additional newline, if nothing is selected and at start of line
                if selection.empty() and from.ch == 0
                    src = how.insert
                else
                    # this also inserts a new line, if cursor is inside/end of line
                    src = "#{src}\n#{how.insert}"
                done = true

            switch cmd
                when 'link'
                    cm.insert_link(cb:opts.cb)
                    return
                when 'image'
                    cm.insert_image(cb:opts.cb)
                    return
                when 'SpecialChar'
                    cm.insert_special_char(cb:opts.cb)
                    return
                when 'font_size'
                    if mode in ['html', 'md', 'mediawiki']
                        for i in [1..7]
                            src1 = strip(src, "<font size=#{i}>", '</font>')
                            if src1
                                src = src1
                        if args != '3'
                            src = "<font size=#{args}>#{src}</font>"
                        done = true
                    else if mode == 'tex'
                        # we need 6 latex sizes, for size 1 to 7 (default 3, at index 2)
                        latex_sizes = ['tiny', 'footnotesize', 'normalsize', 'large', 'LARGE', 'huge', 'Huge']
                        i = parseInt(args)
                        if i in [1..7]
                            size = latex_sizes[i - 1]
                            src = "{\\#{size} #{src}}"
                        done = true

                when 'font_size_new'
                    if mode in ['html', 'md', 'mediawiki']
                        src0 = src.toLowerCase().trim()
                        if misc.startswith(src0, "<span style='font-size")
                            i = src.indexOf('>')
                            j = src.lastIndexOf('<')
                            src = src.slice(i+1,j)
                        if args != 'medium'
                            src = "<span style='font-size:#{args}'>#{src}</span>"
                        done = true
                    else if mode == 'tex'
                        # we need 6 latex sizes, for size 1 to 7 (default 3, at index 2)
                        latex_sizes = ['tiny', 'footnotesize', 'normalsize', 'large', 'LARGE', 'huge', 'Huge']
                        i = parseInt(args)
                        if i in [1..7]
                            size = latex_sizes[i - 1]
                            src = "{\\#{size} #{src}}"
                        done = true

                when 'color'
                    if mode in ['html', 'md', 'mediawiki']
                        src0 = src.toLowerCase().trim()
                        if misc.startswith(src0, "<span style='color")
                            i = src.indexOf('>')
                            j = src.lastIndexOf('<')
                            src = src.slice(i+1,j)
                        src = "<span style='color:#{args}'>#{src}</span>"
                        done = true

                when 'background-color'
                    if mode in ['html', 'md', 'mediawiki']
                        src0 = src.toLowerCase().trim()
                        if misc.startswith(src0, "<span style='background")
                            i = src.indexOf('>')
                            j = src.lastIndexOf('<')
                            src = src.slice(i+1,j)
                        src = "<span style='background-color:#{args}'>#{src}</span>"
                        done = true

                when 'font_face'  # old -- still used in some old non-react editors
                    if mode in ['html', 'md', 'mediawiki']
                        for face in FONT_FACES
                            src1 = strip(src, "<font face='#{face}'>", '</font>')
                            if src1
                                src = src1
                        src = "<font face='#{args}'>#{src}</font>"
                        done = true

                when 'font_family'  # new -- html5 style
                    if mode in ['html', 'md', 'mediawiki']
                        src0 = src.toLowerCase().trim()
                        if misc.startswith(src0, "<span style='font-family")
                            i = src.indexOf('>')
                            j = src.lastIndexOf('<')
                            src = src.slice(i+1,j)
                        if not src
                            src = '    '
                        src = "<span style='font-family:#{args}'>#{src}</span>"
                        done = true

                when 'clean'
                    if mode == 'html'
                        src = html_beautify($("<div>").html(src).html())
                        done = true

                when 'unformat'
                    if mode == 'html'
                        src = $("<div>").html(src).text()
                        done = true
                    else if mode == 'md'
                        src = $("<div>").html(markdown.markdown_to_html(src)).text()
                        done = true

            if not done?
                if DEBUG and not how?
                    console.warn("CodeMirror/edit_selection: unknown for mode1='#{mode1}' and cmd='#{cmd}'")

                #console.log("not implemented")
                opts.cb?()
                return "not implemented"

            if src == src0
                continue

            cm.focus()
            cm.replaceRange(left_white + src + right_white, from, to)

            if not how?.insert? and not how?.wrap?
                if selection.empty()
                    # restore cursor
                    if left?
                        delta = left.length
                    else
                        delta = 0
                    cm.setCursor({line:from.line, ch:to.ch+delta})
                else
                    # now select the new range
                    delta = src.length - src0.length
                    cm.extendSelection(from, {line:to.line, ch:to.ch+delta})
            opts.cb?()


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
                    target = " target='_blank'"

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

    # Find pos {line:line, ch:ch} of first line that contains the
    # string s, or returns undefined if no single line contains s.
    # Should be much faster than calling getLine or getValue.
    CodeMirror.defineExtension 'find_in_line', (s) ->
        line = undefined
        ch   = undefined
        i = 0
        @eachLine (z) ->
            ch = z.text.indexOf(s)
            if ch != -1
                line = i
                return true  # undocumented - calling false stops iteration
            i += 1
            return false
        if line?
            return {line:line, ch:ch}

    # Format the selected block (or blocks) of text, so it looks like this:
    #    stuff  : 'abc'
    #    foo    : 1
    #    more_0 : 'blah'
    # Or
    #    stuff  = 'abc'
    #    foo    = 1
    #    more_0 = 'blah'
    # The column separate is the first occurence in the first line of
    # one of '=' or ':'.  Selected lines that don't contain either symbol
    # are ignored.
    CodeMirror.defineExtension 'align_assignments', () ->
        for sel in @listSelections()
            {start_line, end_line} = cm_start_end(sel)
            symbol = undefined
            column = 0
            # first pass -- figure out what the symbol is and what column we will move it to.
            for n in [start_line .. end_line]
                x = @getLine(n)
                if not symbol?
                    # we still don't know what the separate symbol is.
                    if ':' in x
                        symbol = ':'
                    else if '=' in x
                        symbol = '='
                i = x.indexOf(symbol)
                if i == -1
                    continue   # no symbol in this line, so skip
                # reduce i until x[i-1] is NOT whitespace.
                while i > 0 and x[i-1].trim() == ''
                    i -= 1
                i += 1
                column = Math.max(i, column)
            if not symbol? or not column
                continue  # no symbol in this selection, or no need to move it.  Done.
            # second pass -- move symbol over by inserting space
            for n in [start_line .. end_line]
                x = @getLine(n)
                i = x.indexOf(symbol)
                if i != -1
                    # There is a symbol in this line -- put it in the spot where we want it.
                    if i < column
                        # symbol is too early -- add space
                        spaces = (' ' for j in [0...(column-i)]).join('')  # column - i spaces
                        # insert spaces in front of the symbol
                        @replaceRange(spaces, {line:n, ch:i}, {line:n, ch:i})
                    else if i > column
                        # symbol is too late -- remove spaces
                        @replaceRange('', {line:n, ch:column}, {line:n, ch:i})
                    # Ensure the right amount of whitespace after the symbol -- exactly one space
                    j = i + 1  # this will be the next position after x[i] that is not whitespace
                    while j < x.length and x[j].trim() == ''
                        j += 1
                    if j - i >= 2
                        # remove some spaces
                        @replaceRange('', {line:n, ch:column+1}, {line:n, ch:column+(j-i-1)})
                    else if j - i == 1
                        # insert a space
                        @replaceRange(' ', {line:n, ch:column+1}, {line:n, ch:column+1})





    # Natural analogue of getLine, which codemirror doesn't have for some reason
    #CodeMirror.defineExtension 'setLine', (n, value) ->
    #    @replaceRange()

FONT_FACES = buttonbar.FONT_FACES

cm_start_end = (selection) ->
    {head, anchor} = selection
    start = head
    end   = anchor
    if end.line <= start.line or (end.line ==start.line and end.ch <= start.ch)
        [start, end] = [end, start]
    start_line = start.line
    end_line   = if end.ch > 0 then end.line else end.line - 1
    if end_line < start_line
        end_line = start_line
    return {start_line:start_line, end_line:end_line}

exports.download_file = (url) ->
    #console.log("download_file(#{url})")
    ## NOTE: the file has to be served with
    ##    res.setHeader('Content-disposition', 'attachment')
    iframe = $("<iframe>").addClass('hide').attr('src', url).appendTo($("body"))
    setTimeout((() -> iframe.remove()), 60000)

# Get the DOM node that the currently selected text starts at, as a jquery wrapped object;
# if the selection is a caret (hence empty) returns empty object
exports.get_selection_start_node = () ->
    node = undefined
    selection = undefined
    if window.getSelection # FF3.6, Safari4, Chrome5, IE11 (DOM Standards)
        selection = getSelection()
        if selection.isCollapsed
            return $()
        node = selection.anchorNode
    if not node and document.selection # old IE
        selection = document.selection
        range = (if selection.getRangeAt then selection.getRangeAt(0) else selection.createRange())
        node = (if range.commonAncestorContainer then range.commonAncestorContainer else (if range.parentElement then range.parentElement() else range.item(0)))
    if node
        $(if node.nodeName is "#text" then node.parentNode else node)
    else
        $()

###
# This doesn't work yet, since it can only work when this is a
# Chrome Extension, which I haven't done yet.  See http://www.pakzilla.com/2012/03/20/how-to-copy-to-clipboard-in-chrome-extension/
# This is how hterm works.
# Copy the given text to the clipboard.  This will only work
# on a very limited range of browsers (like Chrome!),
# but when it does... it is nice.
exports.copy_to_clipboard = (text) ->
    copyDiv = document.createElement('div')
    copyDiv.contentEditable = true
    document.body.appendChild(copyDiv)
    copyDiv.innerHTML = text
    copyDiv.unselectable = "off"
    copyDiv.focus()
    document.execCommand('SelectAll')
    document.execCommand("Copy", false, null)
    document.body.removeChild(copyDiv)
###

# return true if d is a valid string -- see http://stackoverflow.com/questions/1353684/detecting-an-invalid-date-date-instance-in-javascript
exports.is_valid_date = (d) ->
    if Object::toString.call(d) isnt "[object Date]"
        return false
    else
        return not isNaN(d.getTime())

# Bootstrap 3 modal fix
$("html").on "hide.bs.modal", "body > .modal", (e) ->
    $(@).remove()
    return

# Bootstrap 3 tooltip fix
$("body").on "show.bs.tooltip", (e) ->
    setTimeout ( ->
        $(e.target).parent().find(".tooltip").tooltip "hide"
    ), 3000

exports.load_coffeescript_compiler = (cb) ->
    if CoffeeScript?
        cb?()
    else
        require.ensure [], =>
            # this should define window.CoffeeScript as the compiler instance.
            require("script-loader!coffeescript/lib/coffeescript/index.js")
            console.log("loaded CoffeeScript via require.ensure")
            cb?()

# Convert html to text safely using jQuery (see http://api.jquery.com/jquery.parsehtml/)

exports.html_to_text = (html) -> $($.parseHTML(html)).text()

exports.language = () ->
    (if navigator?.languages then navigator?.languages[0] else (navigator?.language or navigator?.userLanguage))


# get the currently selected html
exports.save_selection = () ->
    if window.getSelection
        sel = window.getSelection()
        if sel.getRangeAt and sel.rangeCount
            range = sel.getRangeAt(0)
    else if document.selection
        range = document.selection.createRange()
    return range

exports.restore_selection = (selected_range) ->
    if window.getSelection || document.createRange
        selection = window.getSelection()
        if selected_range
            try
                selection.removeAllRanges()
            catch ex
                document.body.createTextRange().select()
                document.selection.empty()
            selection.addRange(selected_range)
    else if document.selection and selected_range
        selected_range.select()


# this HTML sanitization is necessary in such a case, where the user enters
# arbitrary HTML and then this HTML is added to the DOM. For example, a loose
# open tag can cause the entire smc page to "crash", when it is inserted via
# a chat message and show in the chat box as a message.
# There are various tools available to do this, e.g.
# * https://www.npmjs.com/package/sanitize-html (which depends on other utilitis, might be handy?)
# * https://www.npmjs.com/package/sanitize or *-caja (from google, more standalone)
# * https://www.npmjs.com/package/google-caja-sanitizer (only the google thing)
# * another option: using <jQuery object>.html("<html>").html()
#
# in any case, almost all tags should be allowed here, no need to be too strict.
#
# FUTURE: the ones based on google-caja-sanitizer seem to have a smaller footprint,
# but I (hsy) wasn't able to configure them in such a way that all tags/attributes are allowed.
# It seems like there is some bug in the library, because the definitions to allow e.g. src in img are there.

exports.sanitize_html = (html) ->
    return jQuery("<div>").html(html).html()

# http://api.jquery.com/jQuery.parseHTML/ (expanded behavior in version 3+)
exports.sanitize_html = (html, keepScripts = true, keepUnsafeAttributes = true, post_hook = undefined) ->
    {sanitize_html_attributes} = require('smc-util/misc')
    sani = jQuery(jQuery.parseHTML('<div>' + html + '</div>', null, keepScripts))
    if not keepUnsafeAttributes
        sani.find('*').each ->
            sanitize_html_attributes(jQuery, this)
    if post_hook?
        post_hook(sani)
    return sani.html()

exports.sanitize_html_safe = (html, post_hook=undefined) ->
    exports.sanitize_html(html, false, false, post_hook)

###
_sanitize_html_lib = require('sanitize-html')

_sanitize_html_allowedTags = [ 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
  'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
  'img', 'br', 'hr', 'section', 'code', 'input', "strong",
  'table', 'thead', 'caption', 'tbody', 'tfoot', 'tr', 'th', 'td', 'pre' ]

_sanitize_html_allowedAttributes =
    a: [ 'href', 'name', 'target', 'style' ]
    img: [ 'src', 'style' ]
    '*': [ 'href', 'align', 'alt', 'center', 'bgcolor', 'style' ]

return _sanitize_html_lib html,
        allowedTags: _sanitize_html_allowedTags
        allowedAttributes: _sanitize_html_allowedAttributes
###

# `analytics` is a generalized wrapper for reporting data to google analytics, pwiki, parsley, ...
# for now, it either does nothing or works with GA
# this API basically allows to send off events by name and category

exports.analytics = (type, args...) ->
    # GoogleAnalyticsObject contains the possibly customized function name of GA.
    # It's a good idea to call it differently from the default 'ga' to avoid name clashes...
    if window.GoogleAnalyticsObject?
        ga = window[window.GoogleAnalyticsObject]
        if ga?
            switch type
                when 'event', 'pageview'
                    ga('send', type, args...)
                else
                    console.warn("unknown analytics event '#{type}'")

exports.analytics_pageview = (args...) ->
    exports.analytics('pageview', args...)

exports.analytics_event = (args...) ->
    exports.analytics('event', args...)

# conversion tracking (commercial only)
exports.track_conversion = (type, amount) ->
    return if not require('./customize').commercial
    return if DEBUG

    theme = require('smc-util/theme')
    if type == 'create_account'
        tag = theme.sign_up_id
        amount = 1 # that's not true
    else if type == 'subscription'
        tag = theme.conversion_id
    else
        console.warn("unknown conversion type: #{type}")
        return

    window.gtag?('event', 'conversion',
        send_to     : "#{theme.gtag_id}/#{tag}"
        value       : amount
        currency    : 'USD'
    )


# These are used to disable pointer events for iframes when dragging something that may move over an iframe.
# See http://stackoverflow.com/questions/3627217/jquery-draggable-and-resizeable-over-iframes-solution
exports.drag_start_iframe_disable = ->
    $("iframe:visible").css('pointer-events', 'none')

exports.drag_stop_iframe_enable = ->
    $("iframe:visible").css('pointer-events', 'auto')

exports.open_popup_window = (url, opts) ->
    exports.open_new_tab(url, true, opts)

# open new tab and check if user allows popups. if yes, return the tab -- otherwise show an alert and return null
exports.open_new_tab = (url, popup=false, opts) ->
    # if popup=true, it opens a smaller overlay window instead of a new tab (though depends on browser)

    opts = misc.defaults opts,
        menubar    : 'yes'
        toolbar    : 'no'
        resizable  : 'yes'
        scrollbars : 'yes'
        width      : '800'
        height     : '640'

    if popup
        popup_opts = ("#{k}=#{v}" for k, v of opts when v?).join(',')
        tab = window.open(url, '_blank', popup_opts)
    else
        tab = window.open(url, '_blank')
    if not tab?.closed? or tab.closed   # either tab isn't even defined (or doesn't have close method) -- or already closed -- popup blocked
        {alert_message} = require('./alerts')
        if url
            message = "Either enable popups for this website or <a href='#{url}' target='_blank'>click on this link</a>."
        else
            message = "Enable popups for this website and try again."
        alert_message
            title   : "Popups blocked."
            message : message
            type    : 'info'
            timeout : 15
        return null
    return tab

exports.get_cookie = (name) ->
    value = "; " + document.cookie
    parts = value.split("; " + name + "=")
    return parts.pop().split(";").shift() if (parts.length == 2)

exports.delete_cookie = (name) ->
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/'

exports.set_cookie = (name, value, days) ->
    expires = ''
    if days
        date = new Date()
        date.setTime(date.getTime() + (days*24*60*60*1000))
        expires = "; expires=" + date.toUTCString()
    document.cookie = name + "=" + value + expires + "; path=/"

# see http://stackoverflow.com/questions/3169786/clear-text-selection-with-javascript
exports.clear_selection = ->
    if window.getSelection?().empty?
        window.getSelection().empty() # chrome
    else if window.getSelection?().removeAllRanges?
        window.getSelection().removeAllRanges() # firefox
    else
        document.selection?.empty?()

# read the query string of the URL and transform it to a key/value map
# based on: https://stackoverflow.com/a/4656873/54236
# the main difference is that multiple identical keys are collected in an array
# test: check that /app?fullscreen&a=1&a=4 gives {fullscreen : true, a : [1, 4]}
# NOTE: the comments on that stackoverflow are very critical of this; in particular,
# there's no URI decoding, so I added that below...
exports.get_query_params = ->
    vars = {}
    href = window.location.href
    for part in href.slice(href.indexOf('?') + 1).split('&')
        [k, v] = part.split('=')
        v = decodeURIComponent(v)
        if vars[k]?
            if not Array.isArray(vars[k])
                vars[k] = [vars[k]]
            vars[k] = vars[k].concat(v)
        else
            vars[k] = v ? true
    return vars

exports.get_query_param = (p) ->
    return exports.get_query_params()[p]

# If there is UTM information in the known cookie, extract and return it
# Then, delete this cookie.
# Reference: https://en.wikipedia.org/wiki/UTM_parameters
#
# Parameter                 Purpose/Example
# utm_source (required)     Identifies which site sent the traffic, and is a required parameter.
#                           utm_source=Google
#
# utm_medium                Identifies what type of link was used,
#                           such as cost per click or email.
#                           utm_medium=cpc
#
# utm_campaign              Identifies a specific product promotion or strategic campaign.
#                           utm_campaign=spring_sale
#
# utm_term                  Identifies search terms.
#                           utm_term=running+shoes
#
# utm_content               Identifies what specifically was clicked to bring the user to the site,
#                           such as a banner ad or a text link. It is often used for A/B testing
#                           and content-targeted ads.
#                           utm_content=logolink or utm_content=textlink


# get eventually available information form the utm cookie
# delete it afterwards
exports.get_utm = ->
    c = exports.get_cookie(misc.utm_cookie_name)
    return if not c
    try
        data = misc.from_json(window.decodeURIComponent(c))
        if DEBUG then console.log("get_utm cookie data", data)
        exports.delete_cookie(misc.utm_cookie_name)
        return data

# get referrer information
exports.get_referrer = ->
    c = exports.get_cookie(misc.referrer_cookie_name)
    return if not c
    exports.delete_cookie(misc.referrer_cookie_name)
    return c
