katex = require('katex')
{remove_math} = require('smc-util/mathjax-utils')
{replace_all} = require('smc-util/misc')

replace_math = (text, math) ->
    math_group_process = (match, n) -> math[n]
    return text.replace(/@@(\d+)@@/g, math_group_process)

exports.render = (html) ->
    console.log "Rendering... Katex"
    [text, math] = remove_math(html, true)
    text = replace_all(text, '\\$', '$')   # make \$ not involved in math just be $.
    katex_opts =
        macros:
            "\\RR" : "\\mathbb{R}"

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

        # change these HTML entities, since our input format is TeX, **not** HTML (which is not supported by mathjax-node)
        s = replace_all(s, '&amp;', '&')
        s = replace_all(s, '&lt;', '<')
        s = replace_all(s, '&gt;', '>')

        katex.renderToString(s, katex_opts)

    return replace_math(text, math)