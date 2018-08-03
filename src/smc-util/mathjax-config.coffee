# mathjax configuration: this could be cleaned up further or even parameterized with some code during startup
# ATTN: do not use "xypic.js", frequently causes crash!

exports.MathJaxConfig =
    skipStartupTypeset: true
    extensions: ["tex2jax.js","asciimath2jax.js","Safe.js"]  # "static/mathjax_extensions/xypic.js"
    # NOTE: "output/CommonHTML" is the output default: http://docs.mathjax.org/en/latest/output.html
    # However, **DO NOT** use "output/CommonHTML" for the output JAX; it completely breaks
    # Sage worksheet output right now.  Maybe when/if worksheets are rewritten
    # using React, we can change, but not now.  Using "output/SVG" works just fine.
    #   https://github.com/sagemathinc/cocalc/issues/1962
    jax: ["input/TeX","input/AsciiMath", "output/SVG"]
    # http://docs.mathjax.org/en/latest/options/tex2jax.html
    tex2jax:
        inlineMath     : [ ['$','$'], ["\\(","\\)"] ]
        displayMath    : [ ['$$','$$'], ["\\[","\\]"] ]
        processEscapes : true
        ignoreClass    : "tex2jax_ignore"
        skipTags       : ["script","noscript","style","textarea","pre","code"]

    TeX:
        MAXBUFFER  : 100000  # see https://github.com/mathjax/MathJax/issues/910
        extensions : ["autoload-all.js", "noUndefined.js", "noErrors.js"]
        Macros     : # get these from sage/misc/latex.py; also in cocalc/src/smc-webapp/math_katex.coffee
            Bold  : ["\\mathbb{#1}",1]
            ZZ    : ["\\Bold{Z}",0]
            NN    : ["\\Bold{N}",0]
            RR    : ["\\Bold{R}",0]
            CC    : ["\\Bold{C}",0]
            FF    : ["\\Bold{F}",0]
            QQ    : ["\\Bold{Q}",0]
            QQbar : ["\\overline{\\QQ}",0]
            CDF   : ["\\Bold{C}",0]
            CIF   : ["\\Bold{C}",0]
            CLF   : ["\\Bold{C}",0]
            RDF   : ["\\Bold{R}",0]
            RIF   : ["\\Bold{I} \\Bold{R}",0]
            RLF   : ["\\Bold{R}",0]
            CFF   : ["\\Bold{CFF}",0]
            GF    : ["\\Bold{F}_{#1}",1]
            Zp    : ["\\ZZ_{#1}",1]
            Qp    : ["\\QQ_{#1}",1]
            Zmod  : ["\\ZZ/#1\\ZZ",1]
        noErrors:  # http://docs.mathjax.org/en/latest/tex.html#noerrors
            inlineDelimiters : ["$","$"]
            multiLine        : true
            style:
                "font-size"  : "85%"
                "text-align" : "left"
                "color"      : "red"
                "padding"    : "1px 3px"
                "background" : "#FFEEEE"
                "border"     : "none"
        noUndefined:  # http://docs.mathjax.org/en/latest/tex.html#noundefined
            attributes:
                mathcolor      : "red"
                mathbackground : "#FFEEEE"
                mathsize       : "90%"

    # do not use "xypic.js", frequently causes crash!
    "HTML-CSS":
        linebreaks:
            automatic: true
    SVG:
        linebreaks:
            automatic: true
    showProcessingMessages: false
