###
Kernel display
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon, Loading, Tip} = require('../r_misc')
{closest_kernel_match} = require('smc-util/misc')
{Logo} = require('./logo')

exports.Mode = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            mode : rtypes.string

    shouldComponentUpdate: (next) ->
        return next.mode != @props.mode

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

KERNEL_USAGE_STYLE =
    margin       : '5px'
    color        : '#666'
    borderRight  : '1px solid #666'
    paddingRight : '5px'

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

    reduxProps:
        "#{name}" :
            kernel        : rtypes.string
            kernels       : rtypes.immutable.List
            project_id    : rtypes.string
            kernel_info   : rtypes.immutable.Map
            backend_state : rtypes.string
            kernel_state  : rtypes.string
            kernel_usage  : rtypes.immutable.Map
            trust         : rtypes.bool
            read_only     : rtypes.bool

    shouldComponentUpdate: (next) ->
        return next.kernel     != @props.kernel or \
            next.kernels?      != @props.kernels? or # yes, only care about defined state\
            next.project_id    != @props.project_id or \
            next.kernel_info   != @props.kernel_info or \
            next.backend_state != @props.backend_state or \
            next.kernel_state  != @props.kernel_state or \
            next.kernel_usage  != @props.kernel_usage or \
            next.trust         != @props.trust or \
            next.read_only     != @props.read_only

    render_logo: ->
        if not @props.project_id? or not @props.kernel?
            return
        <span className='pull-right'>
            <Logo
                project_id        = {@props.project_id}
                kernel            = {@props.kernel}
                kernel_info_known = {@props.kernel_info?}
                />
        </span>

    render_name: ->
        display_name = @props.kernel_info?.get('display_name')
        if not display_name? and @props.kernels?
            console.log(@props.kernels.toJS())
            # Definitely an unknown kernel
            closestKernel = closest_kernel_match(@props.kernel,@props.kernels)
            closestKernelDisplayName = closestKernel.get("display_name")
            closestKernelName = closestKernel.get("name")
            <span style={KERNEL_ERROR_STYLE} onClick={() => @props.actions.set_kernel(closestKernelName)}>
                Unknown kernel <span style={fontWeight:'bold'}>{@props.kernel}</span>, click here to use {closestKernelDisplayName} instead.
            </span>
        else
            # List of known kernels just not loaded yet.
            display_name ?= @props.kernel
            <span style={KERNEL_NAME_STYLE}>
                {display_name ? "No Kernel"}
            </span>

    render_backend_state_icon: ->
        if @props.read_only
            return
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
                        color = '#5cb85c'
                    when 'idle'
                        name = 'circle-o'
                    else
                        name = 'circle-o'

        <span style={BACKEND_STATE_STYLE}>
            <Icon name={name} spin={spin} style={color:color}/>
        </span>

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

    render_tip: (title, body) ->
        backend_state = @props.backend_state
        backend_tip   = "Backend is #{backend_state}."
        if backend_state == 'running'
            switch @props.kernel_state
                when 'busy'
                    kernel_tip = ' Kernel is busy.'
                when 'idle'
                    kernel_tip = ' Kernel is idle.'
                else
                    kernel_tip = ' Kernel will start when you run code.'
        else
            kernel_tip  = ''

        tip = <span>{backend_tip}{<br/> if kernel_tip}{kernel_tip}</span>
        <Tip
            title     = {title}
            tip       = {tip}
            placement = 'bottom'
        >
            {body}
        </Tip>

    render_usage: ->
        if not @props.kernel_usage?
            # unknown, e.g, not reporting/working or old backend.
            return
        if @props.backend_state != 'running' and @props.backend_state != 'starting'
            # not using resourcesw
            memory = cpu = 0
        else
            memory = @props.kernel_usage.get('memory')
            if not memory?
                return
            cpu = @props.kernel_usage.get('cpu')
            if not cpu?
                return
            memory = Math.round(memory/1000000)
            cpu    = Math.round(cpu)
            cpu_style = memory_style = undefined
            if cpu > 10 and cpu < 50
                cpu_style = {backgroundColor:'yellow'}
            if cpu > 50
                cpu_style = {backgroundColor:'rgb(92,184,92)', color:'white'}
            if memory > 500
                memory_style = {backgroundColor:'yellow'}
            if memory > 800  # TODO: depend on upgrades...?
                memory_style = {backgroundColor:'red', color:'white'}
        tip = <div>
            Usage of the kernel process updated every few seconds.
            <br/>
            Does NOT include subprocesses.
            <br/>
            You can clear all memory by selecting Close and Halt from the File menu or restarting your kernel.
        </div>
        <Tip
            title     = "Kernel CPU and Memory Usage"
            tip       = {tip}
            placement = 'bottom'
        >
            <span style={KERNEL_USAGE_STYLE}>
                CPU: <span style={cpu_style}>{cpu}%</span>
            </span>
            <span style={KERNEL_USAGE_STYLE}>
                Memory: <span style={memory_style}>{memory}MB</span>
            </span>
        </Tip>

    render : ->
        if not @props.kernel?
            return <span/>
        title = <span>{@render_usage()}{@render_trust()}{@render_name()}</span>
        body = <div className='pull-right' style={color:'#666', cursor:'pointer', marginTop:'7px'}>
                {title}
                {@render_backend_state_icon()}
            </div>
        <span>
            {@render_logo()}
            {@render_tip(title, body)}
        </span>
