###
Embedded PDF viewer.
###

{rclass, React, rtypes} = require('../app-framework')

exports.PDF = rclass
    propTypes :
        src : rtypes.string.isRequired

    render: ->
        <embed
            width  = '100%'
            height = '100%'
            src    = {@props.src}
            type   = 'application/pdf'
        />
