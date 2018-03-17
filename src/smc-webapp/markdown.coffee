###
Conversion between Markdown and HTML

Has the option to render math inside the markdown
###

{defaults} = require('smc-util/misc')
{macros}   = require('./math_katex')
create_processor = require('markdown-it')
katex = require('@cocalc/markdown-it-katex')
task_lists = require('markdown-it-task-lists')
{remove_math, replace_math} = require('smc-util/mathjax-utils')

md_with_katex = create_processor
    html : true
    typographer : true
.use(katex, {macros : macros, "throwOnError" : true})
.use(task_lists)

md_no_math = create_processor
    html : true
    typographer : true
.use(task_lists)

exports.has_math = (markdown_string) ->
    [text, math] = remove_math(html, true)
    return math.length > 0

exports.markdown_to_html = (markdown_string, opts) ->
    opts = defaults opts,
        process_math : false

    if opts.process_math
        return md_with_katex.render(markdown_string)
    else
        # Assume it'll be rendered by mathjax later...
        # See https://github.com/sagemathinc/cocalc/issues/1801
        [text, math] = remove_math(markdown_string)
        html = md_no_math.render(text)
        return replace_math(html, math)
