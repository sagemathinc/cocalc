###
Conversion between Markdown and HTML

Automatically parses math with Katex
###
{defaults} = require('smc-util/misc')
{macros}   = require(('./math_katex'))
React = require('react')

unified       = require('unified')

markdown      = require('remark-parse')
math          = require('remark-math')
remark2rehype = require('remark-rehype')

raw           = require('rehype-raw')
katex         = require('rehype-katex')
stringify     = require('rehype-stringify')
reactify      = require('rehype-react')


katex_markdown_processor = unified()
    .use(markdown)
    .use(math)
    .use(remark2rehype, {allowDangerousHTML: true})
    .use(raw)
    .use(katex, {macros: macros})
    .use(stringify)

markdown_processor = unified()
    .use(markdown)
    .use(remark2rehype, {allowDangerousHTML: true})
    .use(raw)
    .use(stringify)

exports.markdown_to_html = (markdown_string, opts) ->
    opts = defaults opts,
        process_math : false

    if opts.process_math
        p = katex_markdown_processor.processSync(markdown_string)
        window.mark = p
        console.log "markdown.coffee produced: #{p.toString()}"
        return katex_markdown_processor.processSync(markdown_string).toString()
    else
        return markdown_processor.processSync(markdown_string).toString()
