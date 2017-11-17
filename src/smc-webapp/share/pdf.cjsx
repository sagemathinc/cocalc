###
Embedded PDF viewer.
###

{rclass, React, rtypes} = require('../smc-react')

exports.PDF = rclass
    propTypes :
        src : rtypes.string.isRequired

    render_embed: ->
        <embed
            width  = '100%'
            height = '100%'
            src    = {@props.src}
            type   = 'application/pdf'
        />

    render: ->
        <div style={display: 'flex', flexDirection: 'column', flex: '1 1 0%', overflow: 'auto'}>
            <div>
                {@render_embed()}
            </div>
        </div>