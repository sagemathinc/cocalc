###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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


{IS_MOBILE} = require('./feature')
misc        = require('smc-util/misc')
{dmp}       = require('diffsync')
buttonbar   = require('./buttonbar')
markdown    = require('./markdown')

templates = $("#salvus-misc-templates")

exports.is_shift_enter = (e) -> e.which is 13 and e.shiftKey
exports.is_enter       = (e) -> e.which is 13 and not e.shiftKey
exports.is_ctrl_enter  = (e) -> e.which is 13 and e.ctrlKey
exports.is_escape      = (e) -> e.which is 27

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


exports.human_readable_size = (bytes) ->
    if bytes < 1000
        return "#{bytes} bytes"
    if bytes < 1000000
        b = Math.floor(bytes/100)
        return "#{b/10} KB"
    if bytes < 1000000000
        b = Math.floor(bytes/100000)
        return "#{b/10} MB"
    b = Math.floor(bytes/100000000)
    return "#{b/10} GB"


#############################################
# JQuery Plugins
#############################################
{required, defaults} = require('smc-util/misc')

# jQuery plugin for spinner (/spin/spin.min.js)
$.fn.spin = (opts) ->
    @each ->
        $this = $(this)
        data = $this.data()
        if data.spinner
            data.spinner.stop()
            delete data.spinner
        if opts isnt false
            data.spinner = new Spinner($.extend({color: $this.css("color")}, opts)).spin(this)
    this

# make all links open internally or in a new tab; etc.
# opts={project_id:?, file_path:path that contains file}
$.fn.process_smc_links = (opts={}) ->
    @each ->
        e = $(this)
        a = e.find('a')
        # make links open in a new tab by default
        a.attr("target","_blank")
        for x in a
            y = $(x)
            href = y.attr('href')
            if href?
                if href.indexOf(document.location.origin) == 0
                    # target starts with cloud URL or is absolute, so we open the
                    # link directly inside this browser tab
                    y.click (e) ->
                        n = (document.location.origin + '/projects/').length
                        target = $(@).attr('href').slice(n)
                        require('./projects').load_target(decodeURI(target), not(e.which==2 or (e.ctrlKey or e.metaKey)))
                        return false
                else if href.indexOf('http://') != 0 and href.indexOf('https://') != 0
                    # internal link
                    y.click (e) ->
                        target = $(@).attr('href')
                        if target.indexOf('/projects/') == 0
                            # fully absolute (but without https://...)
                            target = decodeURI(target.slice('/projects/'.length))
                        else if target[0] == '/' and target[37] == '/' and misc.is_valid_uuid_string(target.slice(1,37))
                            # absolute path with /projects/ omitted -- /..project_id../files/....
                            target = decodeURI(target.slice(1))  # just get rid of leading slash
                        else if target[0] == '/' and opts.project_id
                            # absolute inside of project
                            target = "#{opts.project_id}/files#{decodeURI(target)}"
                        else if opts.project_id and opts.file_path?
                            # realtive to current path
                            target = "#{opts.project_id}/files/#{opts.file_path}/#{decodeURI(target)}"
                        require('./projects').load_target(target, not(e.which==2 or (e.ctrlKey or e.metaKey)))
                        return false

        # make relative links to images use the raw server
        if opts.project_id and opts.file_path?
            a = e.find("img")
            for x in a
                y = $(x)
                src = y.attr('src')
                if src.indexOf('://') != -1
                    continue
                new_src = "/#{opts.project_id}/raw/#{opts.file_path}/#{src}"
                y.attr('src', new_src)

        return e


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
$.fn.extend
    mathjax: (opts={}) ->
        opts = defaults opts,
            tex                 : undefined
            display             : false
            inline              : false
            hide_when_rendering : false  # if true, entire element will get hidden until mathjax is rendered
            cb                  : undefined     # if defined, gets called as cb(t) for *every* element t in the jquery set!
        @each () ->
            t = $(this)
            if not opts.tex? and not opts.display and not opts.inline
                # Doing this test is still much better than calling mathjax below, since I guess
                # it doesn't do a simple test first... and mathjax is painful.
                html = t.html()
                if html.indexOf('$') == -1 and html.indexOf('\\') == -1
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
            MathJax.Hub.Queue(["Typeset", MathJax.Hub, element[0]])
            if opts.hide_when_rendering
                MathJax.Hub.Queue([=>t.show()])
            if opts.cb?
                MathJax.Hub.Queue([opts.cb, t])
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
                # TODO: clear state -- get rid of function data...
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
        line = cm.getLine(start.line).trimLeft()
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
                            return [i, j + END.length]

            else if startswith(line, "\\[")
                for i in [start.line+1..cm.lastLine()]
                    if startswith(cm.getLine(i).trimLeft(), "\\]")
                        return [i, 0]

            else if startswith(line, "\\(")
                for i in [start.line+1..cm.lastLine()]
                    if startswith(cm.getLine(i).trimLeft(), "\\)")
                        return [i, 0]

            else if startswith(line, "\\documentclass")
                # pre-amble
                for i in [start.line+1..cm.lastLine()]
                    if startswith(cm.getLine(i).trimLeft(), "\\begin{document}")
                        return [i - 1, 0]

            else if startswith(line, "\\chapter")
                # book chapter
                for i in [start.line+1..cm.lastLine()]
                    if startswith(cm.getLine(i).trimLeft(), ["\\chapter", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()

            else if startswith(line, "\\section")
                # article section
                for i in [start.line+1..cm.lastLine()]
                    if startswith(cm.getLine(i).trimLeft(), ["\\chapter", "\\section", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()

            else if startswith(line, "\\subsection")
                # article subsection
                for i in [start.line+1..cm.lastLine()]
                    if startswith(cm.getLine(i).trimLeft(), ["\\chapter", "\\section", "\\subsection", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()
            else if startswith(line, "\\subsubsection")
                # article subsubsection
                for i in [start.line+1..cm.lastLine()]
                    if startswith(cm.getLine(i).trimLeft(), ["\\chapter", "\\section", "\\subsection", "\\subsubsection", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()
            else if startswith(line, "\\subsubsubsection")
                # article subsubsubsection
                for i in [start.line+1..cm.lastLine()]
                    if startswith(cm.getLine(i).trimLeft(), ["\\chapter", "\\section", "\\subsection", "\\subsubsection", "\\subsubsubsection", "\\end{document}"])
                        return [i - 1, 0]
                return cm.lastLine()
            else if startswith(line, "%\\begin{}")
                # support what texmaker supports for custom folding -- http://tex.stackexchange.com/questions/44022/code-folding-in-latex
                for i in [start.line+1..cm.lastLine()]
                    if startswith(cm.getLine(i).trimLeft(), "%\\end{}")
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
    CodeMirror.defineExtension 'setValueNoJump', (value) ->
        cur_value = @getValue()
        @.diffApply(dmp.diff_main(@getValue(), value))

    CodeMirror.defineExtension 'patchApply', (patch) ->
        ## TODO: this is a very stupid/inefficient way to turn
        ## a patch into a diff.  We should just directly rewrite
        ## the code below to work with patch.
        cur_value = @getValue()
        new_value = dmp.patch_apply(patch, cur_value)[0]
        diff = dmp.diff_main(cur_value, new_value)
        @.diffApply(diff)

    CodeMirror.defineExtension 'diffApply', (diff) ->
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
                    @replaceRange("", pos, pos1)
                    #console.log("deleting from ", pos, " to ", pos1)
                when +1 # insert
                    # Insert the new text right here.
                    @replaceRange(val, pos)
                    #console.log("inserted new text at ", pos)
                    # Move our pointer to just beyond the text we just inserted.
                    pos = pos1

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
            insert(target + completions[0])
            return

        sel = $("<select>").css('width','auto')
        complete = $("<div>").addClass("salvus-completions").append(sel)
        for c in completions
            sel.append($("<option>").text(target + c))
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
            type      : required   # 'docstring', 'source-code' -- TODO
            target    : required
        element = templates.find(".salvus-codemirror-introspect")
        element.find(".salvus-codemirror-introspect-title").text(opts.target)
        element.modal()
        element.find(".salvus-codemirror-introspect-content-docstring").text('')
        element.find(".salvus-codemirror-introspect-content-source-code").text('')
        element.data('editor', @)
        if opts.type == 'source-code'
            CodeMirror.runMode(opts.content, 'python', element.find(".salvus-codemirror-introspect-content-source-code")[0])
        else
            CodeMirror.runMode(opts.content, 'text/x-rst', element.find(".salvus-codemirror-introspect-content-docstring")[0])

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

    $.get '/static/codemirror-extra/data/latex-completions.txt', (data) ->
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
            when 'python' # TODO how to tell it to return sage when in a sagews file?
                return 'python'
            when 'r'
                return 'r'
            when 'julia'
                return 'julia'
            when 'sagews'    # this doesn't work
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
        cm = @
        default_mode = opts.mode
        if not default_mode?
            default_mode = cm.get_edit_mode()

        canonical_mode = (name) ->
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
                else
                    return default_mode

        args = opts.args
        cmd = opts.cmd

        #console.log("edit_selection '#{misc.to_json(opts)}', mode='#{default_mode}'")

        # TODO: will have to make this more sophisticated, so it can
        # deal with nesting.
        strip = (src, left, right) ->
            #console.log("strip:'#{src}','#{left}','#{right}'")
            left  = left.trim().toLowerCase()
            right = right.trim().toLowerCase()
            src0   = src.toLowerCase()
            i = src0.indexOf(left)
            if i != -1
                j = src0.lastIndexOf(right)
                if j != -1
                    #console.log('strip match')
                    return src.slice(0,i) + src.slice(i+left.length,j) + src.slice(j+right.length)

        selections = cm.listSelections()
        #selections.reverse()
        for selection in selections
            mode = canonical_mode(cm.getModeAt(selection.head).name)
            #console.log("edit_selection(mode='#{mode}'), selection=", selection)
            from = selection.from()
            to = selection.to()
            src = cm.getRange(from, to)
            # trim whitespace
            i = 0
            while i<src.length and /\s/.test(src[i])
                i += 1
            j = src.length-1
            while j > 0 and /\s/.test(src[j])
                j -= 1
            j += 1
            left_white = src.slice(0,i)
            right_white = src.slice(j)
            src = src.slice(i,j)
            src0 = src

            mode1 = mode
            how = EDIT_COMMANDS[mode1][cmd]
            if not how?
                if mode1 in ['md', 'mediawiki', 'rst']
                    # html fallback for markdown
                    mode1 = 'html'
                else if mode1 == "python"
                    # Sage fallback in python mode. TODO There should be a Sage mode.
                    mode1 = "sage"
                how = EDIT_COMMANDS[mode1][cmd]

            done = false
            if how?.wrap?
                if how.strip?
                    # Strip out any tags/wrapping from conflicting modes.
                    for c in how.strip
                        wrap = EDIT_COMMANDS[mode1][c].wrap
                        if wrap?
                            {left, right} = wrap
                            src1 = strip(src, left, right)
                            if src1?
                                src = src1

                left  = if how.wrap.left?  then how.wrap.left else ""
                right = if how.wrap.right? then how.wrap.right else ""
                src1 = strip(src, left, right)
                if src1
                    # strip the wrapping
                    src = src1
                else
                    # do the wrapping
                    src = "#{left}#{src}#{right}"
                done = true

            if how?.insert? # to insert the code snippet right below, next line
                # TODO no idea what the strip(...) above is actually doing
                # if text is selected (is that src?) then there is only some new stuff below it. that's it.
                src = "#{src}\n#{how.insert}"
                done = true

            if cmd == 'font_size'
                if mode in ['html', 'md', 'mediawiki']
                    for i in [1..7]
                        src1 = strip(src, "<font size=#{i}>", '</font>')
                        if src1
                            src = src1
                    if args != '3'
                        src = "<font size=#{args}>#{src}</font>"

            if cmd == 'color'
                if mode in ['html', 'md', 'mediawiki']
                    src0 = src.toLowerCase().trim()
                    if src0.slice(0,12) == "<font color="
                        i = src.indexOf('>')
                        j = src.lastIndexOf('<')
                        src = src.slice(i+1,j)
                    src = "<font color=#{args}>#{src}</font>"

            if cmd == 'background-color'
                if mode in ['html', 'md', 'mediawiki']
                    src0 = src.toLowerCase().trim()
                    if src0.slice(0,23) == "<span style='background"
                        i = src.indexOf('>')
                        j = src.lastIndexOf('<')
                        src = src.slice(i+1,j)
                    src = "<span style='background-color:#{args}'>#{src}</span>"

            if cmd == 'font_face'
                if mode in ['html', 'md', 'mediawiki']
                    for face in FONT_FACES
                        src1 = strip(src, "<font face='#{face}'>", '</font>')
                        if src1
                            src = src1
                    src = "<font face='#{args}'>#{src}</font>"

            if cmd == 'clean'
                if mode == 'html'
                    src = html_beautify($("<div>").html(src).html())
                    done = true

            if cmd == 'unformat'
                if mode == 'html'
                    src = $("<div>").html(src).text()
                    done = true
                else if mode == 'md'
                    src = $("<div>").html(markdown.markdown_to_html(src).s).text()
                    done = true

            if not done?
                #console.log("not implemented")
                return "not implemented"

            if src == src0
                continue

            cm.replaceRange(left_white + src + right_white, from, to)
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
                cm.addSelection(from, {line:to.line, ch:to.ch+delta})


    CodeMirror.defineExtension 'insert_link', (opts={}) ->
        opts = defaults opts,
            cb : undefined
        cm = @
        dialog = $("#salvus-editor-templates").find(".salvus-html-editor-link-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            setTimeout(focus, 50)
            return false
        url = dialog.find(".salvus-html-editor-url")
        url.focus()
        display = dialog.find(".salvus-html-editor-display")
        target  = dialog.find(".salvus-html-editor-target")
        title   = dialog.find(".salvus-html-editor-title")

        selected_text = cm.getSelection()
        display.val(selected_text)

        mode = cm.get_edit_mode()

        if mode in ['md', 'rst', 'tex']
            dialog.find(".salvus-html-editor-target-row").hide()

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
        # TODO: actually implement this!

        # in latex document do one thing

        # in sagews will do something to %latex.

    CodeMirror.defineExtension 'insert_image', (opts={}) ->
        opts = defaults opts,
            cb : undefined
        cm = @

        dialog = $("#salvus-editor-templates").find(".salvus-html-editor-image-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            return false
        url = dialog.find(".salvus-html-editor-url")
        url.focus()

        mode = cm.get_edit_mode()

        if mode == "tex"
            # different units and don't let user specify the height
            dialog.find(".salvus-html-editor-height-row").hide()
            dialog.find(".salvus-html-editor-image-width-header-tex").show()
            dialog.find(".salvus-html-editor-image-width-header-default").hide()
            dialog.find(".salvus-html-editor-width").val('80')

        submit = () =>
            dialog.modal('hide')
            title  = dialog.find(".salvus-html-editor-title").val().trim()
            height = width = ''
            h = dialog.find(".salvus-html-editor-height").val().trim()
            if h.length > 0
                height = " height=#{h}"
            w = dialog.find(".salvus-html-editor-width").val().trim()
            if w.length > 0
                width = " width=#{w}"

            if mode == 'rst'
                # .. image:: picture.jpeg
                #    :height: 100px
                #    :width: 200 px
                #    :alt: alternate text
                #    :align: right
                s = "\n.. image:: #{url.val()}\n"
                height = dialog.find(".salvus-html-editor-height").val().trim()
                if height.length > 0
                    s += "   :height: #{height}px\n"
                width = dialog.find(".salvus-html-editor-width").val().trim()
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
                width = parseInt(dialog.find(".salvus-html-editor-width").val(), 10)
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

        dialog = $("#salvus-editor-templates").find(".salvus-html-editor-symbols-dialog").clone()
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
            # TODO HTML-based formats will work, but not LaTeX.
            # As long as the input encoding in LaTeX is utf8, just insert the actual utf8 character (target.text())

            selections = cm.listSelections()
            selections.reverse()
            for sel in selections
                cm.replaceRange(s, sel.head)
            opts.cb?()

        dialog.find(".salvus-html-editor-symbols-dialog-table").off("click").click(selected)
        dialog.keydown (evt) =>
            if evt.which == 13 # enter
                submit()
                return false
            if evt.which == 27 # escape
                dialog.modal('hide')
                opts.cb?()
                return false


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

codemirror_introspect_modal = templates.find(".salvus-codemirror-introspect")

codemirror_introspect_modal.find("button").click () ->
    codemirror_introspect_modal.modal('hide')

# see http://stackoverflow.com/questions/8363802/bind-a-function-to-twitter-bootstrap-modal-close
codemirror_introspect_modal.on 'hidden.bs.modal', () ->
    codemirror_introspect_modal.data('editor').focus?()
    codemirror_introspect_modal.data('editor',0)

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
        cb()
    else
        console.log("loading coffee-script...")
        $.getScript "/static/coffeescript/coffee-script.js", (script, status) ->
            console.log("loaded CoffeeScript -- #{status}")
            cb()

# Convert html to text safely using jQuery (see http://api.jquery.com/jquery.parsehtml/)

exports.html_to_text = (html) -> $($.parseHTML(html)).text()

exports.language = () ->
    (if navigator.languages then navigator.languages[0] else (navigator.language or navigator.userLanguage))


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
# Note/TODO: the ones based on google-caja-sanitizer seem to have a smaller footprint,
# but I (hsy) wasn't able to configure them in such a way that all tags/attributes are allowed.
# It seems like there is some bug in the library, because the definitions to allow e.g. src in img are there.

exports.sanitize_html = (html) ->
    return jQuery("<div>").html(html).html()


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
