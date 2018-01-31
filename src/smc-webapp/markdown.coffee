###
Conversion between Markdown and HTML
###
unified       = require('unified')
markdown      = require('remark-parse')
math          = require('remark-math')
remark2rehype = require('remark-rehype')
raw           = require('rehype-raw')
katex         = require('rehype-katex')
stringify     = require('rehype-stringify')

processor = unified()
    .use(markdown)
    .use(math)
    .use(remark2rehype, {allowDangerousHTML: true})
    .use(raw)
    .use(katex)
    .use(stringify)

exports.markdown_to_html_v2 = (raw_string) ->
    processor.processSync(raw_string).toString()

###
# Old Method retained for backwards compatibility
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

checkboxes = (s) ->
    s = misc.replace_all(s, '[ ]', "<i class='fa fa-square-o'></i>")
    return misc.replace_all(s, '[x]', "<i class='fa fa-check-square-o'></i>")

exports.markdown_to_html = markdown_to_html = (s) ->
    # See https://github.com/sagemathinc/cocalc/issues/1801
    [text, math] = remove_math(s)
    if math.length > 0
        has_mathjax = true
    text = checkboxes(text)
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
