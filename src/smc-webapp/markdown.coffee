###
Conversion between Markdown and HTML

Has the option to render math inside the markdown
###

{defaults} = require('smc-util/misc')
{macros}   = require('./math_katex')
katex = require('@iktakahiro/markdown-it-katex')
create_processor = require('markdown-it')

md_with_math = create_processor
    html : true
    typographer : true
.use(katex, {macros : macros})

md_no_math = create_processor
    html : true
    typographer : true

exports.markdown_to_html = (markdown_string, opts) ->
    opts = defaults opts,
        process_math : false

    if opts.process_math
        return md_with_math.render(markdown_string)
    else
        return md_no_math.render(markdown_string)
