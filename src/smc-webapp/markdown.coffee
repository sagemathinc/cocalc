misc = require('smc-util/misc')

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

exports.markdown_to_html = markdown_to_html = (s) ->
    # render s to html (from markdown)
    s = marked(s)

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

    # if there was any mathjax, put it back in the s
    if has_mathjax
        for i in [0...w.length]
            s = s.replace("@@@@#{i}@@@@", misc.mathjax_escape(w[i].replace(/\$/g, "$$$$")))
    else if '\$' in s
        has_mathjax = true # still need to parse it to turn \$'s to $'s.

    return {s:s, has_mathjax:has_mathjax}

opts =
    gfm_code  : true
    li_bullet :'-'
    h_atx_suf : false
    h1_setext : false
    h2_setext : false
    br_only   : true

if reMarked?
    # html_to_markdown is used only in browser frontend where reMarked is available.
    reMarker = new reMarked(opts)
    exports.html_to_markdown = (s) ->
        return reMarker.render(s)

