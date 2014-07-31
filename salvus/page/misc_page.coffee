{IS_MOBILE}    = require("feature")

misc = require('misc')

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
        return "#{bytes}"
    if bytes < 1000000
        b = Math.floor(bytes/100)
        return "#{b/10}K"
    if bytes < 1000000000
        b = Math.floor(bytes/100000)
        return "#{b/10}M"
    b = Math.floor(bytes/100000000)
    return "#{b/10}G"


#############################################
# JQuery Plugins
#############################################
{required, defaults} = require('misc')

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



# MathJax some code -- jQuery plugin
$.fn.extend
    mathjax: (opts={}) ->
        opts = defaults opts,
            tex : undefined
            display : false
            inline  : false
            cb      : undefined     # if defined, gets called as cb(t) for *every* element t in the jquery set!
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
            MathJax.Hub.Queue(["Typeset", MathJax.Hub, element[0]])
            if opts.cb?
                MathJax.Hub.Queue([opts.cb, t])
            return t


# Mathjax-enabled Contenteditable Editor plugin
$.fn.extend
    make_editable: (opts={}) ->
        @each () ->
            opts = defaults opts,
                onchange : undefined   # function that gets called with a diff when content changes
                interval : 250         # milliseconds interval between sending update change events about content
                one_line : false       # if true, blur when user presses the enter key

            t = $(this)
            t.attr('contenteditable', true)

            # set the text content; it will be subsequently processed by mathjax
            set_value = (value) ->
                t.data
                    raw  : value
                    mode : 'view'
                t.text(value)
                t.mathjax()

            set_value(t.text())

            get_value = () ->
                if t.data('mode') == 'view'
                    return t.data('raw')
                else
                    return t.text()

            t.data('set_value', set_value)
            t.data('get_value', get_value)

            t.on 'focus', ->
                if t.data('mode') == 'edit'
                    return
                t.data('mode', 'edit')
                t = $(this)
                x = t.data('raw')
                t.text(x).data('before', x)
                #controls = $("<span class='editor-controls'><br><hr><a class='btn'>bold</a><a class='btn'>h1</a><a class='btn'>h2</a></span>")
                #t.append(controls)

            t.blur () ->
                t = $(this)
                #t.find('.editor-controls').remove()
                t.data
                    raw  : t.text()
                    mode : 'view'
                t.mathjax()

            f = (evt) ->
                t = $(this)
                if opts.onchange? and not t.data('change-timer')
                    t.data('change-timer', true)
                    setTimeout( (() ->
                        t.data('change-timer', false)
                        before = t.data('before')
                        if t.data('mode') == 'edit'
                            now = t.text()
                        else
                            now = t.data('raw')
                        if before isnt now
                            opts.onchange(t, local_diff(before, now))
                            t.data('before', now)
                        ),
                        opts.interval
                    )

            t.on('paste', f)
            t.on('blur', f)
            t.on('keyup', f)

            t.on 'keydown', (evt) ->
                if evt.which == 27 or (opts.one_line and evt.which == 13)
                    t.blur()
                    return false

            return t


# Expand element to be vertically maximal in height, keeping its current top position.
$.fn.maxheight = (opts={}) ->
    if not opts.offset?
        opts.offset = 0
    @each ->
        elt = $(this)
        elt.height($(window).height() - elt.offset().top - opts.offset)
    this

$.fn.icon_spin = (start) ->
    if typeof start == "object"
        {start,delay} = defaults start,
            start : true
            delay : 0
    else
        delay = 0
    @each () ->
        elt = $(this)
        if start
            f = () ->
                if elt.find("i.fa-spinner").length == 0  # fa-spin
                    elt.append("<i class='fa fa-spinner' style='margin-left:1em'> </i>")
                    # do not do this on Chrome, where it is TOTALLY BROKEN in that it uses tons of CPU
                    # (and the font-awesome people can't work around it):
                    #    https://github.com/FortAwesome/Font-Awesome/issues/701
                    #if not $.browser.chrome
                    ## -- re-enabling soince fontawesome 4.0 is way faster.
                    elt.find("i.fa-spinner").addClass('fa-spin')
            if delay
                elt.data('fa-spin', setTimeout(f, delay))
            else
                f()
        else
            t = elt.data('fa-spin')
            if t?
                clearTimeout(t)
            elt.find("i.fa-spinner").remove()




####################################
# Codemirror Extensions
####################################

CodeMirror.defineExtension 'unindent_selection', () ->
    editor     = @

    start = editor.getCursor('head')
    end   = editor.getCursor('anchor')
    if end.line <= start.line or (end.line ==start.line and end.ch <= start.ch)
        # swap start and end.
        t = start
        start = end
        end = t

    start_line = start.line
    end_line   = if end.ch > 0 then end.line else end.line - 1
    if end_line < start_line
        end_line = start_line
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

# Set the value of the buffer to something new, and make some attempt
# to maintain the view, e.g., cursor position and scroll position.
# This function is very, very naive now, but will get better using better algorithms.
CodeMirror.defineExtension 'setValueNoJump', (value) ->
    try
        scroll = @getScrollInfo()
        pos = @getCursor()
    catch e
        # nothing
    @setValue(value)
    try
        @setCursor(pos)
        @scrollTo(scroll.left, scroll.top)
        @scrollIntoView(pos)   #I've seen tracebacks from this saying "cannot call method chunckSize of undefined"
                               #which cause havoc on the reset of sync, which assumes setValueNoJump works, and
                               # leads to user data loss.  I consider this a codemirror bug, but of course
                               # just not moving the view in such cases is a reasonable workaround.
    catch e
        # nothing




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
        type      : required   # 'docstring', 'source-code' -- TODO: curr ignored
        target    : required
    editor = @
    element = templates.find(".salvus-codemirror-introspect").clone()
    element.find(".salvus-codemirror-introspect-title").text(opts.target)
    element.find(".salvus-codemirror-introspect-content").text(opts.content)
    element.find(".salvus-codemirror-introspect-close").click () -> element.remove()
    pos = editor.cursorCoords(opts.from)
    element.css
        left : pos.left + 'px'
        top  : pos.bottom + 'px'
    $("body").prepend element
    if not IS_MOBILE
        element.draggable(handle: element.find(".salvus-codemirror-introspect-title")).resizable
            alsoResize : element.find(".salvus-codemirror-introspect-content")
            maxHeight: 650
            handles : 'all'
    element.focus()
    return element


exports.download_file = (url) ->
    iframe = $("<iframe>").addClass('hide').attr('src', url).appendTo($("body"))
    setTimeout((() -> iframe.remove()), 30000)

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









marked = require('marked')

marked.setOptions
    renderer    : new marked.Renderer()
    gfm         : true
    tables      : true
    breaks      : false
    pedantic    : false
    sanitize    : false
    smartLists  : true
    smartypants : true

exports.markdown_to_html = (s) ->
    # replace mathjax, which is delimited by $, $$, \( \), and \[ \]
    v = misc.parse_mathjax(s)
    if v.length > 0
        w = []
        has_mathjax = true
        x0 = [0,0]
        s0 = ''
        i = 0
        for x in v
            w.push(s.slice(x[0], x[1]))
            s0 += s.slice(x0[1], x[0]) + "@@@@#{i}@@@@"
            x0 = x
            i += 1
        s = s0 + s.slice(x0[1])
    else
        has_mathjax = false

    # render s to html (from markdown)
    s = marked(s)

    # if there was any mathjax, put it back in the s
    if has_mathjax
        for i in [0...w.length]
            s = s.replace("@@@@#{i}@@@@", misc.mathjax_escape(w[i].replace(/\$/g, "$$$$")))

    return {s:s, has_mathjax:has_mathjax}


# return true if d is a valid string -- see http://stackoverflow.com/questions/1353684/detecting-an-invalid-date-date-instance-in-javascript
exports.is_valid_date = (d) ->
    if Object::toString.call(d) isnt "[object Date]"
        return false
    else
        return not isNaN(d.getTime())













