###
Display information about a public path.

###

{rclass, React, rtypes} = require('../app-framework')

{Space} = require('../r_misc')

misc = require('smc-util/misc')


exports.PublicPathInfo = rclass
    displayName: "PublicPathInfo"

    propTypes :
        info : rtypes.immutable.Map
        path : rtypes.string.isRequired

    render_external_links: ->
        href = misc.path_split(@props.path).tail
        if href.length == 0
            href = '.'
        # follow raw links only in a few special cases (not html!)
        if misc.filename_extension(@props.path)?.toLowerCase() in ['pdf', 'md']
            raw_rel = undefined
        else
            raw_rel = 'nofollow'

        <div className='pull-right' style={marginRight: '5px'}>
            <a href={href} target='_blank' rel={raw_rel} style={textDecoration:'none'}>Raw</a>
            <Space/>
            <Space/>
            <a href={href + '?viewer=embed'} target='_blank' rel='nofollow' style={textDecoration:'none'}>Embed</a>
        </div>

    render_desc: ->
        desc = @props.info?.get('description')
        if desc
            desc = desc[0].toUpperCase() + desc.slice(1)
            <div style={color:'#444', marginLeft:'30px'}>
                {desc}
            </div>

    render: ->
        <div style={background:"#ddd"}>
            {@render_external_links()}
            {@render_desc()}
        </div>
