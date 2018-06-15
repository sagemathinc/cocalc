###
The kernel's logo display
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{get_logo_url} = require('./server-urls')


exports.Logo = rclass
    propTypes:
        kernel            : rtypes.string.isRequired
        project_id        : rtypes.string.isRequired
        kernel_info_known : rtypes.bool.isRequired

    getInitialState: ->
        logo_failed : ''

    shouldComponentUpdate: (n, s) ->
        return n.kernel != @props.kernel or \
            n.project_id != @props.project_id or \
            n.kernel_info_known != @props.kernel_info_known or \
            s.logo_failed != @state.logo_failed

    render: ->
        kernel = @props.kernel
        if @state.logo_failed == kernel
            <img style   = {width:'0px', height:'32px'} />
        else
            <img
                src     = {get_logo_url(@props.project_id, kernel) + "?n=#{Math.random()}"}
                style   = {width:'32px', height:'32px'}
                onError = {=> if @props.kernel_info_known then @setState(logo_failed: kernel)}
            />

