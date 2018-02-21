katex = require('katex')
{remove_math} = require('smc-util/mathjax-utils')
{replace_all} = require('smc-util/misc')

replace_math = (text, math) ->
    math_group_process = (match, n) -> math[n]
    return text.replace(/@@(\d+)@@/g, math_group_process)

# get these from sage/misc/latex.py
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

exports.render = (html) ->
    [text, math] = remove_math(html, true)
    text = replace_all(text, '\\$', '$')   # make \$ not involved in math just be $.
    katex_opts =
        macros : exports.macros

    math = for s in math
        katex_opts.displayMode = false

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

        katex.renderToString(s, katex_opts)

    return replace_math(text, math)