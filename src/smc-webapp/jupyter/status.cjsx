###
Kernel display
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{ImmutablePureRenderMixin} = require('../r_misc')
{Icon} = require('../r_misc')

util = require('./util')

exports.Mode = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            mode : rtypes.string

    mixins: [ImmutablePureRenderMixin]

    render : ->
        if @props.mode != 'edit'
            return <span />
        <div className='pull-right' style={color:'#666', margin:'5px', padding:'5px'}>
            <Icon name='pencil' />
        </div>

exports.Kernel = rclass ({name}) ->
    propTypes:
        actions : rtypes.object.isRequired

    mixins: [ImmutablePureRenderMixin]

    reduxProps:
        "#{name}" :
            kernel     : rtypes.string
            kernels    : rtypes.immutable.List
            project_id : rtypes.string

    getInitialState: ->
        logo_failed : ''

    render_logo: ->
        kernel = @props.kernel
        if @state.logo_failed == kernel or not @props.project_id?
            <img style   = {width:'0px', height:'32px'} />
        else
            <img
                src     = {util.get_logo_url(@props.project_id, kernel)}
                style   = {width:'32px', height:'32px'}
                onError = {=> @setState(logo_failed: kernel)}
            />

    render_name: ->
        display_name = @props.kernel
        for x in @props.kernels?.toJS() ? []  # slow/inefficient, but ok since this is rarely called
            if x.name == @props.kernel
                display_name = x.display_name
                break
        <span style={paddingLeft:'5px', paddingRight:'5px', color:'rgb(33, 150, 243)'}>
            {display_name ? "No Kernel"}
        </span>

    render : ->
        if not @props.kernel?
            return <span/>
        <div className='pull-right' style={color:'#666', borderLeft:'1px solid #666'}>
            {@render_name()}
            {@render_logo()}
        </div>

