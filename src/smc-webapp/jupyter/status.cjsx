###
Kernel display
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon, ImmutablePureRenderMixin, Loading, Tip} = require('../r_misc')

{get_logo_url} = require('./server-urls')

misc = require('smc-util/misc')

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
    margin      : '5px'
    color       : 'rgb(33, 150, 243)'
    borderLeft  : '1px solid #666'
    paddingLeft : '5px'

KERNEL_ERROR_STYLE =
    margin          : '5px'
    color           : '#fff'
    padding         : '5px'
    backgroundColor : 'red'

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
            kernels       : rtypes.immutable.List
            project_id    : rtypes.string
            kernel_info   : rtypes.immutable.Map
            backend_state : rtypes.string
            kernel_state  : rtypes.string
            trust         : rtypes.bool

    getInitialState: ->
        logo_failed : ''

    render_logo: ->
        kernel = @props.kernel
        if @state.logo_failed == kernel or not @props.project_id?
            <img style   = {width:'0px', height:'32px'} />
        else
            <img
                src     = {get_logo_url(@props.project_id, kernel) + "?n=#{Math.random()}"}
                style   = {width:'32px', height:'32px'}
                onError = {=> if @props.kernel_info? then @setState(logo_failed: kernel)}
            />

    render_name: ->
        display_name = @props.kernel_info?.get('display_name')
        if not display_name? and @props.kernels?
            # Definitely an unknown kernel
            <span style={KERNEL_ERROR_STYLE}>
                Unknown kernel <span style={fontWeight:'bold'}>{@props.kernel}</span> (select a valid kernel from the Kernel menu)
            </span>
        else
            # List of known kernels just not loaded yet.
            display_name ?= @props.kernel
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
        color = undefined
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
                        color = '#5cb85c'
                    when 'idle'
                        name = 'circle-o'
                        kernel_tip = ' Kernel is idle.'
                    else
                        name = 'circle-o'
                        kernel_tip = ' Kernel will start when you run code.'

        icon  = <Icon name={name} spin={spin} style={color:color}/>
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

    render_trust: ->
        if @props.trust
            <span style={color:'#888'}>Trusted</span>
        else
            <span
                title = {'Notebook is not trusted'}
                style = {background:'#5bc0de', color:'white', cursor:'pointer', padding: '3px', borderRadius: '3px'}
                onClick={=>@props.actions.trust_notebook()}
            >
                Not Trusted
            </span>

    render : ->
        if not @props.kernel?
            return <span/>
        <div className='pull-right' style={color:'#666'}>
            {@render_trust()}
            {@render_name()}
            {@render_backend_state()}
            {@render_logo()}
        </div>

