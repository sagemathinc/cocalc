###
The stopwatch component
###

{Button, ButtonGroup, Well} = require('react-bootstrap')

{React, rclass, rtypes}     = require('../smc-react')
{Icon, SetIntervalMixin}    = require('../r_misc')
{webapp_client}             = require('../webapp_client')

exports.Stopwatch = Stopwatch = rclass
    propTypes:
        label        : rtypes.string.isRequired  # a text label
        total        : rtypes.number.isRequired  # total time accumulated before entering current state
        state        : rtypes.string.isRequired  # 'paused' or 'running' or 'stopped'
        time         : rtypes.number.isRequired  # when entered this state
        click_button : rtypes.func.isRequired
        compact      : rtypes.bool

    mixins: [SetIntervalMixin]

    componentDidMount: ->
        @setInterval((=> @forceUpdate()), 1000)

    render_start_button: ->
        <Button
            bsStyle = {if not @props.compact then 'primary'}
            onClick = {=>@props.click_button('start')}
            style   = {if not @props.compact then {width:'8em'}}
            bsSize  = {if @props.compact then "xsmall"} >
            <Icon name='play'/> {if not @props.compact then 'Start'}
        </Button>

    render_stop_button: ->
        <Button
            bsStyle = {if not @props.compact then 'warning'}
            onClick = {=>@props.click_button('stop')}
            bsSize  = {if @props.compact then "xsmall"}>
            <Icon name='stop'/> {if not @props.compact then 'Stop'}
        </Button>

    render_pause_button: ->
        <Button
            bsStyle = {if not @props.compact then 'info'}
            onClick = {=>@props.click_button('pause')}
            style   = {if not @props.compact then {width:'8em'}}
            bsSize  = {if @props.compact then "xsmall"} >
            <Icon name='pause'/> {if not @props.compact then 'Pause'}
        </Button>

    render_time: ->
        switch @props.state
            when 'stopped'
                amount = 0
            when 'paused'
                amount = @props.total
            when 'running'
                amount = @props.total + (webapp_client.server_time() - @props.time)
            else
                return <div>Invalid state {@props.state}</div>

        return <TimeAmount key={'time'} amount={amount} compact={@props.compact} />

    render_buttons: ->
        switch @props.state
            when 'stopped'
                <span key={'buttons'}>
                    {@render_start_button()}
                </span>
            when 'paused'
                <ButtonGroup key={'buttons'}>
                    {@render_start_button()}
                    {@render_stop_button()}
                </ButtonGroup>
            when 'running'
                <ButtonGroup key={'buttons'} >
                    {@render_pause_button()}
                    {@render_stop_button()}
                </ButtonGroup>

    content: ->
        return [@render_time(), @render_buttons()]

    render: ->
        if @props.compact
            <div>
                {@content()}
            </div>
        else
            <Well>
                {@content()}
            </Well>

zpad = (n) ->
    n = "#{n}"
    if n.length == 1
        n = "0" + n
    return n

TimeAmount = rclass
    propTypes :
        amount  : rtypes.number.isRequired
        compact : rtypes.bool

    render : ->
        t = Math.round(@props.amount / 1000)
        hours = Math.floor(t/3600)
        t -= 3600*hours
        minutes = Math.floor(t/60)
        t -= 60*minutes
        seconds = t
        <div style={fontSize:(if not @props.compact then '50pt'), fontFamily:'courier'}>
            {zpad(hours)}:{zpad(minutes)}:{zpad(seconds)}
        </div>
