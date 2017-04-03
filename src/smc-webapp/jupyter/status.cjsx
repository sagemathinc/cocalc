###
Kernel display
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{ImmutablePureRenderMixin} = require('../r_misc')
{Icon, Loading, Tip} = require('../r_misc')

util = require('./util')

exports.Mode = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            mode : rtypes.string

    mixins: [ImmutablePureRenderMixin]

    render : ->
        if @props.mode != 'edit'
            return <span />
        <div className='pull-right' style={color:'#666', margin:'5px', paddingRight:'5px'}>
            <Icon name='pencil' />
        </div>

KERNEL_NAME_STYLE =
    marginLeft  : '5px'
    marginRight : '5px'
    color        : 'rgb(33, 150, 243)'

BACKEND_STATE_STYLE =
    marginRight : '5px'
    color       : KERNEL_NAME_STYLE.color

exports.Kernel = rclass ({name}) ->
    propTypes:
        actions : rtypes.object.isRequired

    mixins: [ImmutablePureRenderMixin]

    reduxProps:
        "#{name}" :
            kernel        : rtypes.string
            kernels       : rtypes.immutable.List  # call to get_kernel_info depends on this...
            project_id    : rtypes.string
            kernel_info   : rtypes.immutable.Map
            backend_state : rtypes.string
            kernel_state  : rtypes.string

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
        display_name = @props.kernel_info?.get('display_name') ? @props.kernel
        <span style={KERNEL_NAME_STYLE}>
            {display_name ? "No Kernel"}
        </span>

    render_backend_state: ->
        backend_state = @props.backend_state
        if not backend_state?
            return <Loading />
        ###
        The backend_states are:
           'init' --> 'ready'  --> 'spawning' --> 'starting' --> 'running'

        When the backend_state is 'running', then the kernel_state is either
            'idle' or 'running'
        ###
        spin = false
        backend_tip = "Backend is #{backend_state}."
        kernel_tip = ''
        switch backend_state
            when 'init'
                name = 'unlink'
            when 'ready'
                name = 'circle-o-notch'
            when 'spawning'
                name = 'circle-o-notch'
                spin = true
            when 'starting'
                name = 'circle-o-notch'
                spin = true
            when 'running'
                switch @props.kernel_state
                    when 'busy'
                        name = 'circle'
                        kernel_tip = ' Kernel is busy.'
                    when 'idle'
                        name = 'circle-o'
                        kernel_tip = ' Kernel is idle.'
                    else
                        name = 'circle-o'
                        kernel_tip = ' Kernel will start when you run code.'

        icon  = <Icon name={name} spin={spin} />
        title = <span>{icon} Jupyter State</span>
        tip = <span>{backend_tip}{<br/> if kernel_tip}{kernel_tip}</span>
        <Tip
            title     = {title}
            tip       = {tip}
            placement = 'left' >
            <span style={BACKEND_STATE_STYLE}>
                {icon}
            </span>
        </Tip>


    render : ->
        if not @props.kernel?
            return <span/>
        <div className='pull-right' style={color:'#666', borderLeft:'1px solid #666'}>
            {@render_name()}
            {@render_backend_state()}
            {@render_logo()}
        </div>

