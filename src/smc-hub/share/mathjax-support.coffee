###
Running MathJax on the backend.

###

async   = require('async')

console.log("loading mathjax-node...")
mathjax = require('mathjax-node')

{defaults} = require('smc-util/misc')

# Deriving MyMathJaxConfig from the webapp's MathJaxConfig
# It's the same, execpt for the entries that reference additional .js files
# Otherwise the rendered page wouldn't even show up, so I assume there is no support for that
{MathJaxConfig} = require('smc-util/mathjax-config')
MathJaxConfig = require('smc-util/misc').deep_copy(MathJaxConfig)
delete MathJaxConfig.TeX.extensions

MyMathJaxConfig =
    tex2jax     : MathJaxConfig.tex2jax
    #extensions  : MathJaxConfig.extensions   # commented on purpose, see above
    TeX         : MathJaxConfig.TeX
    "HTML-CSS"  : MathJaxConfig["HTML-CSS"]
    SVG         : MathJaxConfig.SVG

mathjax.config(
    displayErrors: false
    MathJax: MyMathJaxConfig
)

{remove_math} = require('smc-util/mathjax-utils')

replace_math = (text, math) ->
    math_group_process = (match, n) -> math[n]
    return text.replace(/@@(\d+)@@/g, math_group_process)

# Sage's Jupyter kernel does this...
SCRIPT = '<script type="math/tex; mode=display">'
replace_scripts = (html) ->
    i = 0
    while true
        i = html.indexOf(SCRIPT)
        if i == -1
            break
        j = html.indexOf('</script>', i)
        if j == -1
            break
        html = html.slice(0, i) + '\n$$' + html.slice(i+SCRIPT.length, j) + '$$\n' + html.slice(j+'</script>'.length)
    return html

process_using_mathjax = (html, cb) ->
    html = replace_scripts(html)

    [text, math] = remove_math(html)
    f = (i, cb) ->
        s = math[i]
        display = false
        if s.slice(0,2) == '$$'
            s = s.slice(2,s.length-2)
            display = true
        else if s.slice(0,1) == '$'
            s = s.slice(1,s.length-1)
        else if s.slice(0,3) == "\\\\\(" or s.slice(0,3) == "\\\\\["
            s = s.slice(3, s.length-3)
            display = s[2] == '['
        else if s.slice(0,6) == "\\begin"
            s = s.slice(s.indexOf('}')+1, s.lastIndexOf('\\end'))
            display = true
        mathjax.typeset {math:s, format:'TeX', svg:true}, (data) ->
            math[i] = data.svg
            if display
                math[i] = '<div align=center>' + math[i] + '</div>'
            cb()

    async.map [0...math.length], f, ->
        cb(undefined, replace_math(text, math))


$.fn.extend
    mathjax: (opts={}) ->
        opts = defaults opts,
            tex                 : undefined
            display             : false
            inline              : false
            hide_when_rendering : false         # ignored
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
            process_using_mathjax element.html(), (err, processed) ->
                if not err
                    element.html(processed)
                opts.cb?(err)
            return t

console.log("loaded mathjax.")
