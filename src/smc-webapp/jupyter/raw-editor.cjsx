###
Raw editable view of .ipynb file json, including metadata.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Loading} = require('../r_misc')

json_stable = require('json-stable-stringify')

exports.RawEditor = rclass
    propTypes:
        actions   : rtypes.object.isRequired
        font_size : rtypes.number
        cells     : rtypes.immutable.Map   # ipynb object depends on this
        kernel    : rtypes.string          # ipynb object depends on this, too

    render_desc: ->
        s = "This is an editable view IPynb notebook's underlying .ipynb file "
        s += " (images are replaced by sha1 hashes)."
        <div style={color:"#666", fontSize: '12pt', marginBottom: '15px'}>
            {s}
        </div>

    render_editor: ->
        ipynb = @props.actions.store.get_ipynb()
        if not ipynb?
            return
        json = json_stable(ipynb, {space:1})
        <pre>
            {json}
        </pre>

    render: ->
        style =
            fontSize        : "#{@props.font_size}px"
            paddingLeft     : '20px'
            padding         : '20px'
            backgroundColor : '#eee'
            height          : '100%'
            overflowY       : 'auto'
            overflowX       : 'hidden'

        viewer_style =
            backgroundColor : '#fff'
            padding         : '15px'
            boxShadow       : '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'

        data = @props.actions.store.get_ipynb()
        if not data?
            return <Loading />
        <div style={style}>
            <div style={viewer_style}>
                {@render_desc()}
                {@render_editor()}
            </div>
        </div>

