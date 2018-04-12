###
Conversion between Markdown and HTML

Has the option to render math inside the markdown
###

misc                        = require('smc-util/misc')
{remove_math, replace_math} = require('smc-util/mathjax-utils')
marked                      = require('marked')

checkboxes = (s) ->
    s = misc.replace_all(s, '[ ]', "<i class='fa fa-square-o'></i>")
    return misc.replace_all(s, '[x]', "<i class='fa fa-check-square-o'></i>")

exports.has_math = (markdown_string) ->
    [text, math] = remove_math(html, true)
    return math.length > 0

exports.markdown_to_html = (markdown_string, opts) ->
    opts = misc.defaults opts,
        checkboxes : false   # if true, replace checkboxes by nice rendered version; only used if katex is false.

    # Assume it'll be rendered by mathjax later...
    # See https://github.com/sagemathinc/cocalc/issues/1801
    [text, math] = remove_math(markdown_string)
    if opts.checkboxes
        text = checkboxes(text)
    html = marked(text)
    return replace_math(html, math)
