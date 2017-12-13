###
Processing React component tree before feeding it to the streaming render.

This involves:

  - Running MathJax on HTML components
  - Changing internal links.

###

async   = require('async')

console.log("loading mathjax-node...")
mathjax = require('mathjax-node')

{defaults, replace_all} = require('smc-util/misc')

# Deriving MyMathJaxConfig from the webapp's MathJaxConfig
# It's the same, execpt for the entries that reference additional .js files
# Otherwise the rendered page wouldn't even show up, so I assume there is no support for that
{MathJaxConfig} = require('smc-util/mathjax-config')
MathJaxConfig = require('smc-util/misc').deep_copy(MathJaxConfig)
delete MathJaxConfig.TeX.extensions

MyMathJaxConfig =
    tex2jax     : MathJaxConfig.tex2jax
    #extensions  : MathJaxConfig.extensions   # commented on purpose, see above
    TeX         : MathJaxConfig.TeX
    SVG         : MathJaxConfig.SVG

mathjax.config(
    displayErrors : false
    MathJax       : MyMathJaxConfig
)

{remove_math} = require('smc-util/mathjax-utils')

{process_internal_links} = require('./process-internal-links')

replace_math = (text, math) ->
    math_group_process = (match, n) -> math[n]
    return text.replace(/@@(\d+)@@/g, math_group_process)

# Sage's Jupyter kernel does this...
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

# NOTE: It is totally impossible to do mathjax synchronously, ever. -- https://github.com/mathjax/MathJax-node/issues/140
process = (html, viewer, cb) ->
    html = process_internal_links(html, viewer)  # has nothing to do with mathjax; putting here for now...
    html = replace_scripts(html)

    [text, math] = remove_math(html, true)
    f = (i, cb) ->
        s = math[i]
        display = false
        if s.slice(0,2) == '$$'
            s = s.slice(2,s.length-2)
            display = true
        else if s.slice(0,1) == '$'
            s = s.slice(1,s.length-1)
        else if s.slice(0,3) == "\\\\\(" or s.slice(0,3) == "\\\\\["
            s = s.slice(3, s.length-3)
            display = s[2] == '['
        else if s.slice(0,6) == "\\begin"
            s = s.slice(s.indexOf('}')+1, s.lastIndexOf('\\end'))
            display = true
        # change these HTML entities, since our input format is TeX, **not** HTML (which is not supported by mathjax-node)
        s = replace_all(s, '&amp;', '&')
        s = replace_all(s, '&lt;', '<')
        s = replace_all(s, '&gt;', '>')
        mathjax.typeset {math:s, format:'TeX', svg:true}, (data) ->
            math[i] = data.svg
            if display
                math[i] = '<div align=center>' + math[i] + '</div>'
            cb()

    text = replace_all(text, '\\$', '$')   # make \$ not involved in math just be $.

    async.map [0...math.length], f, ->
        cb(undefined, replace_math(text, math))

reactTreeWalker = require('react-tree-walker').default
{set_rendered_mathjax} = require('smc-webapp/r_misc')

exports.process_react_component = (component, viewer, cb) ->
    work = []
    visitor = (element, instance, context) ->
        if element.props?.has_mathjax?
            if not element.props.has_mathjax
                return false
            if element.type?.displayName == 'Misc-HTML' and element.props.value
                work.push(element.props.value)
                return false
        return true

    reactTreeWalker(component, visitor).then ->
        f = (html, cb) ->
            process html, viewer, (err, html2) ->
                if not err
                    set_rendered_mathjax(html, html2)
                cb()
        async.map(work, f, cb)

# Replace mathjax jQuery pluging by a no-op, in case anything were to call it (which would be a waste of time).
$.fn.extend
     mathjax: ->


console.log("loaded mathjax.")
