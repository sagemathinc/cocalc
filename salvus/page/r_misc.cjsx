###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

{React, rclass, rtypes} = require('flux')

{Button, Col, Input, Row} = require('react-bootstrap')

misc = require('misc')

# Font Awesome component -- obviously TODO move to own file
# Converted from https://github.com/andreypopp/react-fa
exports.Icon = Icon = rclass
    propTypes:
        name       : React.PropTypes.string.isRequired
        size       : React.PropTypes.oneOf(['lg', '2x', '3x', '4x', '5x'])
        rotate     : React.PropTypes.oneOf(['45', '90', '135', '180', '225', '270', '315'])
        flip       : React.PropTypes.oneOf(['horizontal', 'vertical'])
        fixedWidth : React.PropTypes.bool
        spin       : React.PropTypes.bool
        stack      : React.PropTypes.oneOf(['1x', '2x'])
        inverse    : React.PropTypes.bool

    render : ->
        {name, size, rotate, flip, spin, fixedWidth, stack, inverse, className, style} = @props
        classNames = "fa fa-#{name}"
        if size
            classNames += " fa-#{size}"
        if rotate
            classNames += " fa-rotate-#{rotate}"
        if flip
            classNames += " fa-flip-#{flip}"
        if fixedWidth
            classNames += " fa-fw"
        if spin
            classNames += " fa-spin"
        if stack
            classNames += " fa-stack-#{stack}"
        if inverse
            classNames += " fa-inverse"
        if className
            classNames += " #{className}"
        return <span style={style} className={classNames} />

exports.Loading = Loading = rclass
    render : ->
        <span><Icon name="circle-o-notch" spin /> Loading...</span>

exports.Saving = Saving = rclass
    render : ->
        <span><Icon name="circle-o-notch" spin /> Saving...</span>

exports.ErrorDisplay = ErrorDisplay = rclass
    propTypes:
        error   : rtypes.string
        onClose : rtypes.func
    render : ->
        <Row style={backgroundColor:'white', margin:'1ex', padding:'1ex', border:'1px solid lightgray', dropShadow:'3px 3px 3px lightgray', borderRadius:'3px'}>
            <Col md=8 xs=8>
                <span style={color:'red', marginRight:'1ex'}>{@props.error}</span>
            </Col>
            <Col md=4 xs=4>
                <Button className="pull-right" onClick={@props.onClose} bsSize="small">
                    <Icon name='times' />
                </Button>
            </Col>
        </Row>

exports.SelectorInput = SelectorInput = rclass
    propTypes:
        selected  : rtypes.string
        options   : rtypes.object.isRequired
        on_change : rtypes.func

    render_options: ->
        if misc.is_array(@props.options)
            for x in @props.options
                <option key={x.value} value={x.value}>{x.display}</option>
        else
            v = misc.keys(@props.options); v.sort()
            for value in v
                display = @props.options[value]
                <option key={value} value={value}>{display}</option>

    render: ->
        <Input value={@props.selected} defaultValue={@props.selected} type='select' ref='input'
               onChange={=>@props.on_change?(@refs.input.getValue())}>
            {@render_options()}
        </Input>

exports.NumberInput = NumberInput = rclass
    propTypes:
        number    : rtypes.number.isRequired
        min       : rtypes.number.isRequired
        max       : rtypes.number.isRequired
        on_change : rtypes.func.isRequired

    componentWillReceiveProps: (next_props) ->
        if @props.number != next_props.number
            # so when the props change the state stays in sync (e.g., so save button doesn't appear, etc.)
            @setState(number : next_props.number)

    getInitialState: ->
        number : @props.number

    saveChange : (event) ->
        event.preventDefault()
        n = parseInt(@state.number)
        if "#{n}" == "NaN"
            n = @props.number
        if n < @props.min
            n = @props.min
        else if n > @props.max
            n = @props.max
        @setState(number:n)
        @props.on_change(n)

    render_save_button : ->
        if @state.number? and @state.number != @props.number
            <Button className="pull-right" bsStyle='primary' onClick={@saveChange}>Save</Button>

    render : ->
        <Row>
            <Col xs=6>
                <form onSubmit={@saveChange}>
                    <Input type="text" ref="input"
                           value={if @state.number? then @state.number else @props.number}
                           onChange={=>@setState(number:@refs.input.getValue())}/>
                </form>
            </Col>
            <Col xs=6>
                {@render_save_button()}
            </Col>
        </Row>

exports.LabeledRow = LabeledRow = rclass
    propTypes:
        label : rtypes.string.isRequired
    render : ->
        <Row>
            <Col xs=4>
                {@props.label}
            </Col>
            <Col xs=8>
                {@props.children}
            </Col>
        </Row>
