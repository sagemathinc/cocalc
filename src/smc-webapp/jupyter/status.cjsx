###
Kernel display
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Icon} = require('../r_misc')

exports.Mode = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            mode : rtypes.string

    render : ->
        if @props.mode != 'edit'
            return <span />
        <div className='pull-right' style={color:'#666', margin:'5px', padding:'5px'}>
            <Icon name='pencil' />
        </div>


exports.Kernel = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            kernel : rtypes.string

    render : ->
        <div className='pull-right' style={color:'#666', borderLeft:'1px solid #666', margin:'5px', padding:'5px'}>
            {@props.kernel ? "No Kernel"}
        </div>

