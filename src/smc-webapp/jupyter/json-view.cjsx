###
Provide nice JSON view of the ipynb
###

Inspector = require('react-json-inspector')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Loading} = require('../r_misc')

exports.JSONView = rclass
    propTypes:
        actions   : rtypes.object.isRequired
        font_size : rtypes.number
        cells     : rtypes.immutable.Map   # ipynb object depends on this
        kernel    : rtypes.string          # ipynb object depends on this, too

    render_desc: ->
        s = "Read-only view of notebook's underlying object structure."
        <div style={color:"#666", fontSize: '12pt', right: '15px', position:'absolute', background:'white'}>
            {s}
        </div>

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
            position        : 'relative'

        data = @props.actions.store.get_ipynb()
        if not data?
            return <Loading />
        <div style={style}>
            <div style={viewer_style}>
                {@render_desc()}
                <Inspector data={data}/>
            </div>
        </div>

