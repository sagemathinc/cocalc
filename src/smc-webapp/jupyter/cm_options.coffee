###
This module will handle setting the codemirror options for various kernels.
###

immutable = require('immutable')

MD_OPTIONS = immutable.fromJS
    indentUnit      : 4
    tabSize         : 4
    mode            : {name: "gfm2"}
    lineWrapping    : true
    styleActiveLine : true
    indentWithTabs  : true

DEFAULT_OPTIONS = immutable.fromJS
    indentUnit        : 4
    matchBrackets     : true
    autoCloseBrackets : true
    lineWrapping      : true
    styleActiveLine   : true
    indentWithTabs    : true
    mode              :
        name                   : "python"
        version                : 3
        singleLineStringErrors : false

exports.cm_options = (kernel) ->

    if kernel == 'markdown'
        return MD_OPTIONS

    return DEFAULT_OPTIONS

