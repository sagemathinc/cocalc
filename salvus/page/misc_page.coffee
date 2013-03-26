misc = require('misc')

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
# Plugins
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
        @each () ->
            t = $(this)
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
            return t

# Mathjax-enabled Contenteditable Editor plugin
$.fn.extend
    make_editable: (opts={}) ->
        @each () ->
            opts = defaults opts,
                onchange : undefined   # function that gets called with a diff when content changes
                interval : 250         # milliseconds interval between sending update change events about content

            t = $(this)
            t.attr('contenteditable', true)
            t.data
                raw  : t.html()
                mode : 'view'
            t.mathjax()

            t.live 'focus', ->
                if t.data('mode') == 'edit'
                    return
                t.data('mode', 'edit')
                t = $(this)
                x = t.data('raw')
                t.html(x).data('before', x)
                #controls = $("<span class='editor-controls'><br><hr><a class='btn'>bold</a><a class='btn'>h1</a><a class='btn'>h2</a></span>")
                #t.append(controls)

            t.blur () ->
                t = $(this)
                #t.find('.editor-controls').remove()
                t.data
                    raw  : t.html()
                    mode : 'view'
                t.mathjax()

            t.live 'paste blur keyup', (evt) ->
                t = $(this)
                if opts.onchange? and not t.data('change-timer')
                    t.data('change-timer', true)
                    setTimeout( (() ->
                        t.data('change-timer', false)
                        before = t.data('before')
                        if t.data('mode') == 'edit'
                            now = t.html()
                        else
                            now = t.data('raw')
                        if before isnt now
                            opts.onchange(t, local_diff(before, now))
                            t.data('before', now)
                        ),
                        opts.interval
                    )


            return t


####################################
# Codemirror Extensions
####################################

CodeMirror.defineExtension 'unindent_selection', () ->
    editor     = @
    start      = editor.getCursor(true)
    start_line = start.line
    end        = editor.getCursor()
    end_line   = if end.ch > 0 then end.line else end.line - 1
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
CodeMirror.defineExtension 'delete_trailing_whitespace', () ->
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
    for i in [0...text1.length]
        if i == pos.line   # very jarring to delete whitespace in line that user's cursor is in.
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
    scroll = @getScrollInfo()
    pos = @getCursor()
    @setValue(value)
    @setCursor(pos)
    @scrollTo(scroll.left, scroll.top)
    @scrollIntoView(pos)