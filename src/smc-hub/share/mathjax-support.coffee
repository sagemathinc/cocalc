###
Running MathJax on the backend.

###

async   = require('async')

console.log("loading mathjax-node...")
mathjax = require('mathjax-node')

# TODO: see
# mathjax.config(...)

{remove_math} = require('smc-util/mathjax-utils')

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

exports.mathjax = (html, cb) ->
    html = replace_scripts(html)
    [text, math] = remove_math(html)

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
        mathjax.typeset {math:s, format:'TeX', svg:true}, (data) ->
            math[i] = data.svg
            if display
                math[i] = '<div align=center>' + math[i] + '</div>'
            cb()

    async.map [0...math.length], f, ->
        cb(undefined, replace_math(text, math))

console.log("loaded mathjax.")
