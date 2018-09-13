###
Mapping from file extension to what editor edits it.

This is mainly used to support editor.coffee, which is legacy.

The **complete** list of extensions --> what edits them is done
via the newer registration system.
###

codemirror_associations =
    c      : 'text/x-c'
    'c++'  : 'text/x-c++src'
    cql    : 'text/x-sql'
    cpp    : 'text/x-c++src'
    cc     : 'text/x-c++src'
    tcc    : 'text/x-c++src'
    conf   : 'nginx'   # should really have a list of different types that end in .conf and autodetect based on heuristics, letting user change.
    csharp : 'text/x-csharp'
    'c#'   : 'text/x-csharp'
    clj    : 'text/x-clojure'
    cljs   : 'text/x-clojure'
    cljc   : 'text/x-clojure'
    edn    : 'text/x-clojure'
    elm    : 'text/x-elm'
    cjsx   : 'text/cjsx'
    coffee : 'coffeescript'
    css    : 'css'
    diff   : 'text/x-diff'
    dtd    : 'application/xml-dtd'
    e      : 'text/x-eiffel'
    ecl    : 'ecl'
    f      : 'text/x-fortran'    # https://github.com/mgaitan/CodeMirror/tree/be73b866e7381da6336b258f4aa75fb455623338/mode/fortran
    f90    : 'text/x-fortran'
    f95    : 'text/x-fortran'
    h      : 'text/x-c++hdr'
    hpp    : 'text/x-c++hdr'
    hs     : 'text/x-haskell'
    lhs    : 'text/x-haskell'
    html   : 'htmlmixed'
    java   : 'text/x-java'
    jl     : 'text/x-julia'
    js     : 'javascript'
    jsx    : 'jsx'
    json   : 'javascript'
    lean   : 'lean'   # obviously nowhere close...
    ls     : 'text/x-livescript'
    lua    : 'lua'
    m      : 'text/x-octave'
    md     : 'gfm'
    ml     : 'text/x-ocaml'
    mysql  : 'text/x-sql'
    patch  : 'text/x-diff'
    gp     : 'text/pari'
    go     : 'text/x-go'
    pari   : 'text/pari'
    pegjs  : 'pegjs'
    php    : 'php'
    pl     : 'text/x-perl'
    py     : 'python'
    pyx    : 'python'
    r      : 'r'
    rmd    : 'gfm'
    rnw    : 'stex2'
    rtex   : 'stex2'
    rst    : 'rst'
    rb     : 'text/x-ruby'
    ru     : 'text/x-ruby'
    sage   : 'python'
    scala  : 'text/x-scala'
    scm    : 'text/x-scheme'
    sh     : 'shell'
    spyx   : 'python'
    sql    : 'text/x-sql'
    ss     : 'text/x-scheme'
    sty    : 'stex2'
    txt    : 'text'
    tex    : 'stex2'
    ts     : 'application/typescript'
    tsx    : 'text/typescript-jsx'
    toml   : 'text/x-toml'
    bib    : 'stex'
    bbl    : 'stex'
    xml    : 'xml'
    xsl    : 'xsl'
    ''     : 'text'

file_associations = exports.file_associations = {}
for ext, mode of codemirror_associations
    name = mode
    i = name.indexOf('x-')
    if i != -1
        name = name.slice(i+2)
    name = name.replace('src','')
    icon = switch mode
        when 'python'
            'cc-icon-python'
        when 'coffeescript'
            'fa-coffee'
        when 'javascript'
            'fab fa-js-square'
        when 'jsx'
            'fab fa-node-js'
        when 'application/typescript' # it would be nice to have proper TS icons...
            'fab fa-js-square'
        when 'text/typescript-jsx'    # would be nice to have proper TS...
            'fab fa-node-js'
        else
            'fa-file-code-o'
    if ext in ['r', 'rmd']
        icon = 'cc-icon-r'
    file_associations[ext] =
        editor : 'codemirror'
        binary : false
        icon   : icon
        opts   : {mode:mode}
        name   : name

# noext = means file with no extension but the given name.
file_associations['noext-dockerfile'] =
    editor : 'codemirror'
    binary : false
    icon   : 'fa-ship'
    opts   : {mode:'dockerfile', indent_unit:2, tab_size:2}
    name   : 'Dockerfile'

file_associations['tex'] =
    editor : 'latex'
    icon   : 'cc-icon-tex-file'
    opts   : {mode:'stex2', indent_unit:2, tab_size:2}
    name   : "LaTeX"

file_associations['rnw'] =
    editor : 'latex'
    icon   : 'cc-icon-tex-file'
    opts   : {mode:'stex2', indent_unit:4, tab_size:4}
    name   : "R Knitr Rnw"

file_associations['rtex'] =
    editor : 'latex'
    icon   : 'cc-icon-tex-file'
    opts   : {mode:'stex2', indent_unit:4, tab_size:4}
    name   : "R Knitr Rtex"

file_associations['html'] =
    icon   : 'fa-file-code-o'
    opts   : {indent_unit:4, tab_size:4, mode:'htmlmixed'}
    name   : "html"

file_associations['md'] =
    icon   : 'cc-icon-markdown'
    opts   : {indent_unit:4, tab_size:4, mode:'gfm'}
    name   : "markdown"

file_associations['rmd'] =
    icon   : 'cc-icon-r'
    opts   : {indent_unit:4, tab_size:4, mode:'gfm'}
    name   : "Rmd"

file_associations['rst'] =
    icon   : 'fa-file-code-o'
    opts   : {indent_unit:4, tab_size:4, mode:'rst'}
    name   : "ReST"

file_associations['java'] =
    editor : 'codemirror'
    icon   : 'fa-file-code-o'
    opts   : {indent_unit:4, tab_size:4, mode:'text/x-java'}
    name   : "Java"

file_associations['mediawiki'] = file_associations['wiki'] =
    editor : 'html-md'
    icon   : 'fa-file-code-o'
    opts   : {indent_unit:4, tab_size:4, mode:'mediawiki'}
    name   : "MediaWiki"

file_associations['sass'] =
    editor : 'codemirror'
    icon   : 'fa-file-code-o'
    opts   : {mode:'text/x-sass', indent_unit:2, tab_size:2}
    name   : "SASS"

file_associations['yml'] = file_associations['yaml'] =
    editor : 'codemirror'
    icon   : 'fa-code'
    opts   : {mode:'yaml', indent_unit:2, tab_size:2}
    name   : "YAML"

file_associations['pug'] = file_associations['jade'] =
    editor : 'codemirror'
    icon   : 'fa-code'
    opts   : {mode:'text/x-pug', indent_unit:2, tab_size:2}
    name   : "PUG"

file_associations['css'] =
    editor : 'codemirror'
    icon   : 'fa-file-code-o'
    opts   : {mode:'css', indent_unit:4, tab_size:4}
    name   : "CSS"

for m in ['noext-makefile', 'noext-gnumakefile', 'make', 'build']
    file_associations[m] =
        editor : 'codemirror'
        icon   : 'fa-cogs'
        opts   : {mode:'makefile', indent_unit:4, tab_size:4, spaces_instead_of_tabs: false}
        name   : "Makefile"

file_associations['term'] =
    editor : 'terminal'
    icon   : 'fa-terminal'
    opts   : {}
    name   : "Terminal"

file_associations['ipynb'] =
    editor : 'ipynb'
    icon   : 'cc-icon-ipynb'
    opts   : {}
    name   : "Jupyter Notebook"

for ext in ['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp']
    file_associations[ext] =
        editor : 'media'
        icon   : 'fa-file-image-o'
        opts   : {}
        name   : ext
        binary : true
        exclude_from_menu : true

# See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img
exports.IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'apng', 'svg', 'ico']

exports.VIDEO_EXTS = ['webm', 'mp4', 'avi', 'mkv', 'ogv', 'ogm', '3gp']

file_associations['pdf'] =
    editor : 'pdf'
    icon   : 'fa-file-pdf-o'
    opts   : {}
    name   : 'pdf'
    binary : true
    exclude_from_menu : true

file_associations['tasks'] =
    editor : 'tasks'
    icon   : 'fa-tasks'
    opts   : {}
    name   : 'task list'

file_associations['course'] =
    editor : 'course'
    icon   : 'fa-graduation-cap'
    opts   : {}
    name   : 'course'

file_associations['sage-chat'] =
    editor : 'chat'
    icon   : 'fa-comment'
    opts   : {}
    name   : 'chat'

file_associations['sage-git'] =
    editor : 'git'
    icon   : 'fa-git-square'
    opts   : {}
    name   : 'git'

file_associations['sage-template'] =
    editor : 'template'
    icon   : 'fa-clone'
    opts   : {}
    name   : 'template'

file_associations['sage-history'] =
    editor : 'history'
    icon   : 'fa-history'
    opts   : {}
    name   : 'sage history'
    exclude_from_menu : true

# For tar, see http://en.wikipedia.org/wiki/Tar_%28computing%29
archive_association =
    editor : 'archive'
    icon   : 'fa-file-archive-o'
    opts   : {}
    name   : 'archive'

# Fallback for any type not otherwise explicitly specified
file_associations[''] =
    editor : 'codemirror'
    icon   : 'fa-file-code-o'
    opts   : {mode:'text', indent_unit:4, tab_size:4}
    name   : ''

for ext in 'zip gz bz2 z lz xz lzma tgz tbz tbz2 tb2 taz tz tlz txz lzip'.split(' ')
    file_associations[ext] = archive_association

file_associations['sage'].name = "sage code"
file_associations['sage'].icon = 'cc-icon-sagemath-bold'

file_associations['sagews'] =
    editor            : 'sagews'
    binary            : false
    icon              : 'cc-icon-sagemath-file'
    opts              : {mode:'sagews'}
    name              : 'sagews'
    exclude_from_menu : true
