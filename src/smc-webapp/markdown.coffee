###
Conversion between Markdown and HTML

Automatically parses math with Katex
###
unified          = require('unified')

markdown         = require('remark-parse')
math             = require('remark-math')
remark2rehype    = require('remark-rehype')
remark_stringify = require('remark-stringify')

rehype           = require('rehype')
raw              = require('rehype-raw')
katex            = require('rehype-katex')
rehype2remark    = require('rehype-remark')
rehype_stringify = require('rehype-stringify')

katex_markdown_processor = unified()
    .use(markdown)
    .use(math)
    .use(remark2rehype, {allowDangerousHTML: true})
    .use(raw)
    .use(katex)
    .use(rehype_stringify)

markdown_processor = unified()
    .use(markdown)
    .use(remark2rehype, {allowDangerousHTML: true})
    .use(raw)
    .use(rehype_stringify)

html_processor = unified()
    .use(rehype)
    .use(rehype2remark)
    .use(remark_stringify)

exports.html_to_markdwon = (html_string) ->
    return html_processor.processSynce(html_string).toString()

exports.markdown_to_html = (markdown_string, opts) ->
    if opts.process_math
        return katex_markdown_processor.processSync(raw_string).toString()
    else
        return markdown_processor.processSync(raw_string).toString()
