# Multiplex'd worksheet mode

{MARKERS} = require('smc-util/sagews')
_ = require('underscore')

exports.sagews_decorator_modes = sagews_decorator_modes = [
    ['cjsx'        , 'text/cjsx'],
    ['coffeescript', 'coffeescript'],
    ['cython'      , 'cython'],
    ['file'        , 'text'],
    ['fortran'     , 'text/x-fortran'],
    ['html'        , 'htmlmixed'],
    ['javascript'  , 'javascript'],
    ['java'        , 'text/x-java'],    # !! more specific name must be first!!!! (java vs javascript!)
    ['latex'       , 'stex']
    ['lisp'        , 'ecl'],
    ['md'          , 'gfm2'],
    ['gp'          , 'text/pari'],
    ['go'          , 'text/x-go']
    ['perl'        , 'text/x-perl'],
    ['python3'     , 'python'],
    ['python'      , 'python'],
    ['ruby'        , 'text/x-ruby'],   # !! more specific name must be first or get mismatch!
    ['r'           , 'r'],
    ['sage'        , 'python'],
    ['script'      , 'shell'],
    ['sh'          , 'shell'],
    ['julia'       , 'text/x-julia'],
    ['wiki'        , 'mediawiki'],
    ['mediawiki'   , 'mediawiki']
]

# Many of the modes below are multiplexed

require('codemirror/addon/mode/multiplex.js')
require('./multiplex')

# not using these two gfm2 and htmlmixed2 modes, with their sub-latex mode, since
# detection of math isn't good enough.  e.g., \$ causes math mode and $ doesn't seem to...   \$500 and $\sin(x)$.
CodeMirror.defineMode "gfm2", (config) ->
    options = []
    for x in [['$$','$$'], ['$','$'], ['\\[','\\]'], ['\\(','\\)']]
        options.push
            open  : x[0]
            close : x[1]
            mode  : CodeMirror.getMode(config, 'stex')
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "gfm"), options...)

CodeMirror.defineMode "htmlmixed2", (config) ->
    options = []
    for x in [['$$','$$'], ['$','$'], ['\\[','\\]'], ['\\(','\\)']]
        options.push
            open  : x[0]
            close : x[1]
            mode  : CodeMirror.getMode(config, mode)
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "htmlmixed"), options...)

CodeMirror.defineMode "stex2", (config) ->
    options = []
    for x in ['sagesilent', 'sageblock']
        options.push
            open  : "\\begin{#{x}}"
            close : "\\end{#{x}}"
            mode  : CodeMirror.getMode(config, 'sagews')
    options.push
        open  : "\\sage{"
        close : "}"
        mode  : CodeMirror.getMode(config, 'sagews')
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "stex"), options...)

CodeMirror.defineMode "cython", (config) ->
    # FUTURE: need to figure out how to do this so that the name
    # of the mode is cython
    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "python"))

CodeMirror.defineMode "sagews", (config) ->
    options = []
    close = new RegExp("[#{MARKERS.output}#{MARKERS.cell}]")
    for x in sagews_decorator_modes
        # NOTE: very important to close on both MARKERS.output *and* MARKERS.cell,
        # rather than just MARKERS.cell, or it will try to
        # highlight the *hidden* output message line, which can
        # be *enormous*, and could take a very very long time, but is
        # a complete waste, since we never see that markup.
        options.push
            open  : "%" + x[0]
            start : true    # must be at beginning of line
            close : close
            mode  : CodeMirror.getMode(config, x[1])

    return CodeMirror.smc_multiplexing_mode(CodeMirror.getMode(config, "python"), options...)

CodeMirror.defineMode "rmd", (config) ->
    # derived from the sagews modes with some additions
    modes = _.clone(_.object(sagews_decorator_modes))
    modes['fortran95'] = modes['fortran']
    modes['octave'] = 'octave'
    modes['bash'] = modes['sh']

    options = []

    # blocks (ATTN ruby before r!)
    # all engine modes: names(knitr::knit_engines$get())
    for name in  ['ruby', 'r', 'python', 'octave', 'fortran95', 'fortran',  'octave', 'bash', 'go', 'julia', 'perl']
        mode = modes[name]
        open = new RegExp("```\\s*{#{name}[^}]*?}")
        options.push
            open  : open
            close : "```"
            delimStyle : 'gfm'
            mode  : CodeMirror.getMode(config, mode)

    # ATTN: this case must come later, it is less specific
    # inline, just `r ...` exists, not for other languages.
    options.push
        open : '`r'
        close: '`'
        mode  : CodeMirror.getMode(config, 'r')

    return CodeMirror.multiplexingMode(CodeMirror.getMode(config, "yaml-frontmatter"), options...)

###
# ATTN: if that's ever going to be re-activated again,
# this needs to be require("script!...") in the spirit of webpack
$.get '/static/codemirror-extra/data/sage-completions.txt', (data) ->
    s = data.split('\n')
    sagews_hint = (editor) ->
        console.log("sagews_hint")
        cur   = editor.getCursor()
        token = editor.getTokenAt(cur)
        console.log(token)
        t = token.string
        completions = (a for a in s when a.slice(0,t.length) == t)
        ans =
            list : completions,
            from : CodeMirror.Pos(cur.line, token.start)
            to   : CodeMirror.Pos(cur.line, token.end)
    CodeMirror.registerHelper("hint", "sagews", sagews_hint)
###