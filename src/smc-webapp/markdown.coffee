###
Conversion between Markdown and HTML
###

marked = require('marked')

misc = require('smc-util/misc')
{remove_math, replace_math} = require('smc-util/mathjax-utils')

marked.setOptions
    renderer    : new marked.Renderer()
    gfm         : true
    tables      : true
    breaks      : false
    pedantic    : false
    sanitize    : false
    smartLists  : true
    smartypants : false

exports.markdown_to_html = markdown_to_html = (s) ->
    # See https://github.com/sagemathinc/smc/issues/1801
    [text, math] = remove_math(s)
    if math.length > 0
        has_mathjax = true
    html = marked(text)
    s = replace_math(html, math)
    return {s:s, has_mathjax:has_mathjax}

opts =
    gfm_code  : true
    li_bullet :'-'
    h_atx_suf : false
    h1_setext : false
    h2_setext : false
    br_only   : true

reMarked = require('remarked')
if reMarked?
    # html_to_markdown is used only in browser frontend where reMarked is available.
    #reMarker = new reMarked(opts)
    reMarked.setOptions(opts)
    exports.html_to_markdown = (s) ->
        return reMarker.render(s)
