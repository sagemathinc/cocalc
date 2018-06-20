###
Replaces instances of mathmode tex inside HTML as a string with Katex

Use:

```coffee
katex = require('./math_katex')
html = '<div>$\frac{23}{x}$</div>'
has_math = katex.render(html)
```

###

katex = require('katex')
{remove_math} = require('smc-util/mathjax-utils')
{replace_all} = require('smc-util/misc')

replace_math = (text, math) ->
    math_group_process = (match, n) -> math[n]
    return text.replace(/@@(\d+)@@/g, math_group_process)

# get these from sage/misc/latex.py
# This same info is **also** in cocalc/src/mathjax-config.coffee
exports.macros =
    "\\Bold"  : "\\mathbb{#1}"
    "\\ZZ"    : "\\Bold{Z}"
    "\\NN"    : "\\Bold{N}"
    "\\RR"    : "\\Bold{R}"
    "\\CC"    : "\\Bold{C}"
    "\\FF"    : "\\Bold{F}"
    "\\QQ"    : "\\Bold{Q}"
    "\\QQbar" : "\\overline{\\QQ}"
    "\\CDF"   : "\\Bold{C}"
    "\\CIF"   : "\\Bold{C}"
    "\\CLF"   : "\\Bold{C}"
    "\\RDF"   : "\\Bold{R}"
    "\\RIF"   : "\\Bold{I} \\Bold{R}"
    "\\RLF"   : "\\Bold{R}"
    "\\CFF"   : "\\Bold{CFF}"
    "\\GF"    : "\\Bold{F}_{#1}"
    "\\Zp"    : "\\ZZ_{#1}"
    "\\Qp"    : "\\QQ_{#1}"
    "\\Zmod"  : "\\ZZ/#1\\ZZ"

