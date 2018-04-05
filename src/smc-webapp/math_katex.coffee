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
katex_autorender = require('katex/contrib/auto-render/auto-render.js')
{replace_all} = require('smc-util/misc')

# Sage's Jupyter kernel uses this to display math.
# eg. with `show(2/3)`
# We remove `\newcommand...` because we already define \Bold as above
# And \newcommand is not yet supported https://github.com/Khan/KaTeX/issues/37
SCRIPT = '<script type="math/tex; mode=display">\\newcommand{\\Bold}[1]{\\mathbf{#1}}'
exports.replace_sage_scripts = (html) ->
    i = 0
    while true
        i = html.indexOf(SCRIPT)
        if i == -1
            break
        j = html.indexOf('</script>', i)
        if j == -1
            break
        html = html.slice(0, i) + '$$' + html.slice(i+SCRIPT.length, j) + '$$' + html.slice(j+'</script>'.length)
    return html

exports.replace_escaped_dollar_signs = (html) ->
    return replace_all(html, '\\$', '<hack>$</hack>')

# get these from sage/misc/latex.py
# This same info is **also** in cocalc/src/mathjax-config.coffee
macros =
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

delimiters = [
    {left: "$$", right: "$$", display: true}
    {left: "\\[", right: "\\]", display: true}
    {left: "\\(", right: "\\)", display: false}
    {left: "$", right: "$", display: false}
]

ignoredTags = ["script", "noscript", "style", "textarea", "pre", "code", "hack"]

exports.render_math_in_element = (element) ->
    is_complete = true

    errorCallback = ->
        is_complete = false

    katex_autorender.default(element, {delimiters, errorCallback, macros})
    return is_complete
