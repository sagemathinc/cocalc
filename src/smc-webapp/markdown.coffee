###
Conversion between Markdown and HTML

Has the option to render math inside the markdown
###

{defaults} = require('smc-util/misc')
{macros}   = require('./math_katex')
create_processor = require('markdown-it')
katex = require('@iktakahiro/markdown-it-katex')
task_lists = require('markdown-it-task-lists')

md_with_math = create_processor
    html : true
    typographer : true
.use(katex, {macros : macros, "throwOnError" : false, "errorColor" : " #cc0000"})
.use(task_lists)

md_no_math = create_processor
    html : true
    typographer : true
.use(task_lists)

exports.markdown_to_html = (markdown_string, opts) ->
    opts = defaults opts,
        process_math : false

    if opts.process_math
        return md_with_math.render(markdown_string)
    else
        return md_no_math.render(markdown_string)
