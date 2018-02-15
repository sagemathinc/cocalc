console.log("loading katex")

async         = require('async')
unified       = require('unified')
markdown      = require('remark-parse')
math          = require('remark-math')
remark2rehype = require('remark-rehype')
raw           = require('rehype-raw')
katex         = require('rehype-katex')
stringify     = require('rehype-stringify')

math_processor = unified()
    .use(markdown)
    .use(math)
    .use(remark2rehype, {allowDangerousHTML: true})
    .use(raw)
    .use(katex)
    .use(stringify)

# Sage's Jupyter kernel does this for displaying math
SCRIPT = '<script type="math/tex; mode=display">'
replace_scripts = (html) ->
    i = 0
    while true
        i = html.indexOf(SCRIPT)
        if i == -1
            break
        j = html.indexOf('</script>', i)
        if j == -1
            break
        html = html.slice(0, i) + '\n$$' + html.slice(i+SCRIPT.length, j) + '$$\n' + html.slice(j+'</script>'.length)
    return html

# html: string
exports.process_math = (html) ->
    html = replace_scripts(html)
    html = math_processor.processSync(html).toString()

console.log("loaded math KaTex processing")
