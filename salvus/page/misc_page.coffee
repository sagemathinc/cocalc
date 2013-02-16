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