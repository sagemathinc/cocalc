###
Replaces instances of mathmode tex inside HTML as a string with Katex

Use:

```coffee
katex = require('./math_katex')
html = '<div>$\frac{23}{x}$</div>'
has_math = katex.render(html)
```

###

katex = require('katex')
{remove_math} = require('smc-util/mathjax-utils')
{replace_all} = require('smc-util/misc')

replace_math = (text, math) ->
    math_group_process = (match, n) -> math[n]
    return text.replace(/@@(\d+)@@/g, math_group_process)

# get these from sage/misc/latex.py
# This same info is **also** in cocalc/src/mathjax-config.coffee
exports.macros =
    "\\Bold"  : "\\mathbb{#1}"
    "\\ZZ"    : "\\Bold{Z}"
    "\\NN"    : "\\Bold{N}"
    "\\RR"    : "\\Bold{R}"
    "\\CC"    : "\\Bold{C}"
    "\\FF"    : "\\Bold{F}"
    "\\QQ"    : "\\Bold{Q}"
    "\\QQbar" : "\\overline{\\QQ}"
    "\\CDF"   : "\\Bold{C}"
    "\\CIF"   : "\\Bold{C}"
    "\\CLF"   : "\\Bold{C}"
    "\\RDF"   : "\\Bold{R}"
    "\\RIF"   : "\\Bold{I} \\Bold{R}"
    "\\RLF"   : "\\Bold{R}"
    "\\CFF"   : "\\Bold{CFF}"
    "\\GF"    : "\\Bold{F}_{#1}"
    "\\Zp"    : "\\ZZ_{#1}"
    "\\Qp"    : "\\QQ_{#1}"
    "\\Zmod"  : "\\ZZ/#1\\ZZ"

# Sage's Jupyter kernel uses this to display math.
# eg. with `show(2/3)`
# We remove `\newcommand...` because we already define \Bold as above
# And \newcommand is not yet supported https://github.com/Khan/KaTeX/issues/37
SCRIPT = '<script type="math/tex; mode=display">\\newcommand{\\Bold}[1]{\\mathbf{#1}}'
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

exports.render = (html) ->
    #console.log "Rendering Katex directly via lib version: #{require('katex/package.json')._id} \nhtml:#{html}"

    html = replace_scripts(html)

    [text, math] = remove_math(html, true)
    text = replace_all(text, '\\$', '$')   # make \$ not involved in math just be $.

    katex_opts =
        macros : exports.macros

    new_math = []
    is_complete = true
    for s in math
        katex_opts.displayMode = false
        unstripped = s
        if s.slice(0,2) == '$$'
            s = s.slice(2,s.length-2)
            katex_opts.displayMode = true
        else if s.slice(0,1) == '$'
            s = s.slice(1,s.length-1)
        else if s.slice(0,3) == "\\\\\(" or s.slice(0,3) == "\\\\\["
            s = s.slice(3, s.length-3)
            katex_opts.displayMode = s[2] == '['
        else if s.slice(0,6) == "\\begin"
            s = s.slice(s.indexOf('}')+1, s.lastIndexOf('\\end'))
            katex_opts.displayMode = true

        # change these HTML entities, since our input format is TeX, **not** HTML (which is not supported by katex)
        s = replace_all(s, '&amp;', '&')
        s = replace_all(s, '&lt;', '<')
        s = replace_all(s, '&gt;', '>')

        try
            new_math.push(katex.renderToString(s, katex_opts))
        catch
            is_complete = false
            new_math.push('<div class="cocalc-katex-error">' + unstripped + '</div>')

    return {html: replace_math(text, new_math), is_complete: is_complete}