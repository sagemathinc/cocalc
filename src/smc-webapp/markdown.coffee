###
Conversion between Markdown and HTML

Automatically parses math with Katex
###
unified       = require('unified')

markdown      = require('remark-parse')
math          = require('remark-math')
remark2rehype = require('remark-rehype')

raw           = require('rehype-raw')
katex         = require('rehype-katex')
stringify     = require('rehype-stringify')

katex_markdown_processor = unified()
    .use(markdown)
    .use(math)
    .use(remark2rehype, {allowDangerousHTML: true})
    .use(raw)
    .use(katex)
    .use(stringify)

markdown_processor = unified()
    .use(markdown)
    .use(remark2rehype, {allowDangerousHTML: true})
    .use(raw)
    .use(stringify)

exports.markdown_to_html = (markdown_string, opts) ->
    if opts.process_math
        return katex_markdown_processor.processSync(raw_string).toString()
    else
        return markdown_processor.processSync(raw_string).toString()
