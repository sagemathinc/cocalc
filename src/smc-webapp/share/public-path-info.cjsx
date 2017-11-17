###
Display information about a public path.

###

{rclass, React, rtypes} = require('../smc-react')

{Space} = require('../r_misc')

misc = require('smc-util/misc')


exports.PublicPathInfo = rclass
    displayName: "PublicPathInfo"

    propTypes :
        info : rtypes.immutable.Map.isRequired
        path : rtypes.string.isRequired

    render_external_links: ->
        href = misc.path_split(@props.path).tail
        if href.length == 0
            href = '.'
        <div className='pull-right' style={margin: '5px 10px', fontSize: '12pt'}>
            <a href={href} target='_blank'>Raw...</a>
            <Space/>
            <Space/>
            <a href={href + '?viewer=embed'} target='_blank'>Embed...</a>
        </div>

    render_desc: ->
        <div style={color:'#333', fontSize:'12pt', margin:'5px 10px'}>
            {@props.info.get('description')}
        </div>

    render: ->
        <div style={background:"#ddd", borderBottom:'4px solid grey'}>
            {@render_external_links()}
            {@render_desc()}
        </div>
