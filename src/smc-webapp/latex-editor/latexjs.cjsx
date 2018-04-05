###
This is a renderer using LaTeX.js, which is purely client side.

https://github.com/michael-brade/LaTeX.js
###

{throttle} = require('underscore')

{React, ReactDOM, rclass, rtypes} = require('../smc-react')

{Loading} = require('../r_misc')

util = require('../code-editor/util')

#{parse} = require('latex.js')

exports.LaTeXJS = rclass
    displayName: 'LaTeXEditor-LaTeXJS'

    propTypes :
        id            : rtypes.string.isRequired
        actions       : rtypes.object.isRequired
        editor_state  : rtypes.immutable.Map
        is_fullscreen : rtypes.bool
        project_id    : rtypes.string
        path          : rtypes.string
        reload        : rtypes.number
        font_size     : rtypes.number

    render: ->
        <div>
            LaTeX.js
        </div>