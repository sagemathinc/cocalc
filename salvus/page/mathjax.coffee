###
Load and configure mathjax

CRITICAL! Ignore the following and you'll massively break everything
without knowing it (due to race conditions so you won't notice):
See http://mathjax.readthedocs.org/en/latest/dynamic.html#ajax-mathjax: "Note that the only reliable way to configure MathJax is to use an in-line configuration block of the type discussed above. You should not call MathJax.Hub.Config() directly in your code, as it will not run at the correct time — it will either run too soon, in which case MathJax may not be defined and the function will throw an error, or it will run too late, after MathJax has already finished its configuration process, so your changes will not have the desired effect."


# We instead have to use html to include mathjax, since mathjax has its own async loader,
# which conflicts with Webpack.
#require('mathjax')  # NO

###


# As mentioned above (!) this must be done via inline configuration tag.


window._configure_mathjax = ->
    window.MathJax.Hub.Config
        skipStartupTypeset: true
        extensions: ["tex2jax.js","asciimath2jax.js"]
        jax: ["input/TeX","input/AsciiMath", "output/SVG"]
        tex2jax:
            inlineMath     : [ ['$','$'], ["\\(","\\)"] ]
            displayMath    : [ ['$$','$$'], ["\\[","\\]"] ]
            processEscapes : true
        TeX:
           extensions: ["autoload-all.js"]
           Macros:                          # see sage/misc/latex.py
                Bold:  ["\\mathbb{#1}", 1]
                ZZ:    ["\\Bold{Z}", 0]
                NN:    ["\\Bold{N}", 0]
                RR:    ["\\Bold{R}", 0]
                CC:    ["\\Bold{C}", 0]
                FF:    ["\\Bold{F}", 0]
                QQ:    ["\\Bold{Q}", 0]
                QQbar: ["\\overline{\\QQ}", 0]
                CDF:   ["\\Bold{C}", 0]
                CIF:   ["\\Bold{C}", 0]
                CLF:   ["\\Bold{C}", 0]
                RDF:   ["\\Bold{R}", 0]
                RIF:   ["\\Bold{I} \\Bold{R}", 0]
                RLF:   ["\\Bold{R}", 0]
                CFF:   ["\\Bold{CFF}", 0]
                GF:    ["\\Bold{F}_{#1}", 1]
                Zp:    ["\\ZZ_{#1}", 1]
                Qp:    ["\\QQ_{#1}", 1]
                Zmod:  ["\\ZZ/#1\\ZZ", 1]
       "HTML-CSS" :
            linebreaks: { automatic: true }
       SVG:
            linebreaks: { automatic: true }
       showProcessingMessages: false

field = if window.opera then 'innerHTML' else 'text'
$("head").append($("<script />", {type:"text/x-mathjax-config", "#{field}":"_configure_mathjax()"}))



