# this loads the "traditional" js files via webpack.config.coffee
# it doesn't minify them (so you have to!), etc.
# evals them right into the global context
# TODO switch to npm packaging

require('script!./static/primus/primus-engine.min.js')

require('script!./static/jquery/jquery.min.js')
require('script!./static/jquery/jquery-ui/js/jquery-ui.min.js')

# Hack to make jQuery UI work on mobile devices: http://touchpunch.furf.com/
require('script!./static/jquery/plugins/jquery.ui.touch-punch.min.js')

# Hack to make jQuery hide and show not break with Bootstrap 3
require('script!./static/jquery/plugins/bootstrap_hide_show.js')

# Timeago jQuery plugin
require('script!./static/jquery/plugins/jquery.timeago.min.js')

# Scroll into view plugin
require('script!./static/jquery/plugins/jquery.scrollintoview.min.js')

#  Highlight jQuery plugin: http://bartaz.github.io/sandbox.js/jquery.highlight.html
require('script!./static/jquery/plugins/jquery.highlight.min.js')

# Caret Position jQuery plugin
require('script!./static/jquery/plugins/caret/jquery.caret.js')

# Activity spinner
require('script!./static/spin/spin.min.js')

# Bootstrap
require('script!./static/bootstrap-3.3.0/js/bootstrap.min.js')

# Bootbox: usable dialogs for bootstrap
require('script!./static/bootbox/bootbox.min.js')

# Bootstrap switch: https://github.com/nostalgiaz/bootstrap-switch 
require('script!./static/bootstrap-switch/bootstrap-switch.min.js')

# Bootstrap Colorpicker Plugin
require('script!./static/jquery/plugins/bootstrap-colorpicker/js/bootstrap-colorpicker.js')

# Pnotify: Notification framework from http://pinesframework.org/pnotify
require('script!./static/pnotify/jquery.pnotify.min.js')

# XTerm terminal emulator
require('script!./static/term/term.min.js')
require('script!./static/term/color_themes.js')

# LaTeX log parser
require('script!./static/latex/latex-log-parser.js')

# Datetime picker
require('script!./static/datetimepicker/bootstrap-datetimepicker.min.js')

# Make html look nice
require('script!./static/jsbeautify/beautify-html.min.js')

# Make html into markdown
require('script!./static/remarked/reMarked.min.js')

# MathJax at the end
window.MathJax =
   skipStartupTypeset: true
   extensions: ["tex2jax.js","asciimath2jax.js"]  # "static/mathjax_extensions/xypic.js"
   jax: ["input/TeX","input/AsciiMath", "output/SVG"]
   tex2jax:
      inlineMath: [ ['$','$'], ["\\(","\\)"] ]
      displayMath: [ ['$$','$$'], ["\\[","\\]"] ]
      processEscapes: true

   TeX:
       extensions: ["autoload-all.js"]
       Macros:  # get these from sage/misc/latex.py
            Bold:  ["\\mathbb{#1}",1]
            ZZ:    ["\\Bold{Z}",0]
            NN:    ["\\Bold{N}",0]
            RR:    ["\\Bold{R}",0]
            CC:    ["\\Bold{C}",0]
            FF:    ["\\Bold{F}",0]
            QQ:    ["\\Bold{Q}",0]
            QQbar: ["\\overline{\\QQ}",0]
            CDF:   ["\\Bold{C}",0]
            CIF:   ["\\Bold{C}",0]
            CLF:   ["\\Bold{C}",0]
            RDF:   ["\\Bold{R}",0]
            RIF:   ["\\Bold{I} \\Bold{R}",0]
            RLF:   ["\\Bold{R}",0]
            CFF:   ["\\Bold{CFF}",0]
            GF:    ["\\Bold{F}_{#1}",1]
            Zp:    ["\\ZZ_{#1}",1]
            Qp:    ["\\QQ_{#1}",1]
            Zmod:  ["\\ZZ/#1\\ZZ",1]

   # do not use "xypic.js", frequently causes crash!
   "HTML-CSS":
        linebreaks: { automatic: true }
   SVG:
        linebreaks: { automatic: true }
   showProcessingMessages: false

# require('script!./static/mathjax/MathJax.js') # doesn't work
$('<script type="text/javascript" src="static/mathjax/MathJax.js"></script>').appendTo(document.body)
