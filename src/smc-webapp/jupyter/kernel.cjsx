###
Kernel display
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.Kernel = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            kernel : rtypes.string

    render : ->
        <div className='pull-right' style={color:'#666', borderLeft:'1px solid #666', margin:'5px', padding:'5px'}>
            {@props.kernel}
        </div>

