###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

async = require('async')

{Component, React, ReactDOM, rclass, rtypes, is_redux, is_redux_actions, redux, Store, Actions, Redux} = require('../app-framework')
{Alert, Button, ButtonToolbar, Checkbox, Col, Form, FormControl, FormGroup, ControlLabel, InputGroup, Overlay, OverlayTrigger, Popover, Modal, Tooltip, Row, Well} = require('react-bootstrap')
{HelpEmailLink, SiteName, CompanyName, PricingUrl, PolicyTOSPageUrl, PolicyIndexPageUrl, PolicyPricingPageUrl} = require('../customize')
{UpgradeRestartWarning} = require('../upgrade_restart_warning')
copy_to_clipboard = require('copy-to-clipboard')
{reportException} = require('../../webapp-lib/webapp-error-reporter')
{PROJECT_UPGRADES} = require('smc-util/schema')

{Icon} = require('./icon')
exports.Icon = Icon
{Tip} = require('./tip')
exports.Tip = Tip
{Loading} = require('./loading')
exports.Loading = Loading
{Space} = require('./space')
exports.Space = Space
{CloseX} = require('./close-x')
exports.CloseX = CloseX
{Saving} = require('./saving')
exports.Saving = Saving
{SelectorInput} = require('./selector-input')
exports.SelectorInput = SelectorInput

# injected by webpack, but not for react-static renderings (ATTN don't assign to uppercase vars!)
smc_version = SMC_VERSION ? 'N/A'
build_date  = BUILD_DATE  ? 'N/A'
smc_git_rev = SMC_GIT_REV ? 'N/A'

Combobox    = require('react-widgets/lib/Combobox')

misc        = require('smc-util/misc')
theme       = require('smc-util/theme')
immutable   = require('immutable')
underscore  = require('underscore')

markdown    = require('../markdown')
feature     = require('../feature')

{defaults, required} = misc

exports.MarkdownInput = require('../widget-markdown-input/main').MarkdownInput

# base unit in pixel for margin/size/padding
exports.UNIT = UNIT = 15

# bootstrap blue background
exports.BS_BLUE_BGRND = theme.COLORS.BS_BLUE_BGRND

# This is the applications color scheme
exports.COLORS = COLORS = theme.COLORS

# Checks whether two immutable variables (either ImmutableJS objects or actual
# immutable types) are equal. Gives a warning and returns false (no matter what) if either variable is mutable.
immutable_equals_single = (a, b) ->
    if typeof(a) == "object" or typeof(b) == "object"
        if (is_redux(a) and is_redux(b)) or (is_redux_actions(a) and is_redux_actions(b))
            return a == b
        if immutable.Iterable.isIterable(a) and immutable.Iterable.isIterable(b)
            return immutable.is(a, b)
        if (a? and not b?) or (not a? and b?)
            # if one is undefined and the other is defined, they aren't equal
            return false
        console.warn("Using mutable object in ImmutablePureRenderMixin:", a, b)
        return false
    return a == b

immutable_equals = (objA, objB) ->
    if immutable.is(objA, objB)
        return true
    keysA = misc.keys(objA)
    keysB = misc.keys(objB)
    if keysA.length != keysB.length
        return false

    for key in keysA
        if not objB.hasOwnProperty(key) or not immutable_equals_single(objA[key], objB[key])
            return false
    return true

# Like PureRenderMixin, except only for immutable variables. Will always
# re-render if any props are mutable objects.
exports.ImmutablePureRenderMixin = ImmutablePureRenderMixin =
    shouldComponentUpdate: (nextProps, nextState) ->
        not immutable_equals(@props, nextProps) or not immutable_equals(@state, nextState)

# Gives components a setInterval method that takes a function and time x milliseconds
# then calls that function every x milliseconds. Automatically stops calling
# when component is unmounted. Can be called multiple times for multiple intervals.
exports.SetIntervalMixin =
    componentWillMount: ->
        @intervals = []
    setInterval: (fn, ms) ->
        @intervals.push setInterval fn, ms
    componentWillUnmount: ->
        @intervals.forEach clearInterval

exports.SetIntervalHOC = (Comp) ->
    class SetIntervalWrapper extends Component
        componentWillMount: ->
            @intervals = []

        setInterval: (fn, ms) ->
            @intervals.push setInterval fn, ms

        componentWillUnmount: ->
            @intervals.forEach clearInterval

        render: ->
            Comp.setInterval = @setInterval
            return React.createElement(Comp, @props, @props.children)

# this Octicon icon class requires the CSS file in octicons/octicons/octicons.css (see landing.coffee)
exports.Octicon = rclass
    displayName : 'Octicon'

    propTypes :
        name   : rtypes.string.isRequired
        mega   : rtypes.bool
        spin   : rtypes.bool

    getDefaultProps: ->
        name : 'flame'
        mega : false
        spin : false

    render: ->
        classNames = ['octicon', "octicon-#{@props.name}"]
        if @props.spin
            classNames.push('spin-octicon')
        if @props.mega
            classNames.push('mega-octicon')
        return <span className={classNames.join(' ')} />

exports.SimpleX = SimpleX = ({onClick}) ->
    <a href='' onClick={(e)=>e.preventDefault(); onClick()}>
        <Icon name='times' />
    </a>

exports.SkinnyError = ({error_text, on_close}) ->
    <div style={color:'red'}>
         <SimpleX onClick={on_close} /> {error_text}
    </div>

error_text_style =
    marginRight : '1ex'
    whiteSpace  : 'pre-line'
    maxWidth    : '80ex'

exports.ErrorDisplay = ErrorDisplay = rclass
    displayName : 'Misc-ErrorDisplay'

    propTypes :
        error           : rtypes.oneOfType([rtypes.string,rtypes.object])
        error_component : rtypes.any
        title           : rtypes.string
        style           : rtypes.object
        bsStyle         : rtypes.string
        onClose         : rtypes.func       # TODO: change to on_close everywhere...?

    render_close_button: ->
        <CloseX on_close={@props.onClose} style={fontSize:'11pt'} />

    render_title: ->
        <h4>{@props.title}</h4>

    render: ->
        if @props.style?
            style = misc.copy(error_text_style)
            misc.merge(style, @props.style)
        else
            style = error_text_style
        if @props.error?
            if typeof(@props.error) == 'string'
                error = @props.error
            else
                error = misc.to_json(@props.error)
        else
            error = @props.error_component
        bsStyle = @props.bsStyle ? 'danger'
        <Alert bsStyle={bsStyle} style={style}>
            {@render_close_button() if @props.onClose?}
            {@render_title() if @props.title}
            {error}
        </Alert>

exports.Spinner = rclass
    render : ->
        <Icon name='spinner' spin={true} />

exports.Footer = rclass
    displayName : "Footer"

    mixins: [ImmutablePureRenderMixin]

    render: ->
        <footer style={fontSize:"small",color:"gray",textAlign:"center",padding: "#{2*UNIT}px 0" }>
            <hr/>
            <Space/>
            <SiteName/> by <CompanyName/>
            {' '} &middot; {' '}
            <a target="_blank" href={PolicyIndexPageUrl}>Policies</a>
            {' '} &middot; {' '}
            <a target="_blank" href={PolicyTOSPageUrl}>Terms of Service</a>
            {' '} &middot; {' '}
            <HelpEmailLink />
            {' '} &middot; {' '}
            <span title="Version #{smc_version} @ #{build_date} | #{smc_git_rev[..8]}">&copy; {misc.YEAR}</span>
        </footer>

exports.render_static_footer = ->
    Footer = exports.Footer
    <Footer />

exports.MessageDisplay = MessageDisplay = rclass
    displayName : 'Misc-MessageDisplay'

    propTypes :
        message : rtypes.string
        onClose : rtypes.func

    render: ->
        <Row style={backgroundColor:'white', margin:'1ex', padding:'1ex', border:'1px solid lightgray', dropShadow:'3px 3px 3px lightgray', borderRadius:'3px'}>
            <Col md={8} xs={8}>
                <span style={color:'gray', marginRight:'1ex'}>{@props.message}</span>
            </Col>
            <Col md={4} xs={4}>
                <Button className='pull-right' onClick={@props.onClose} bsSize='small'>
                    <Icon name='times' />
                </Button>
            </Col>
        </Row>

exports.TextInput = rclass
    displayName : 'Misc-TextInput'

    propTypes :
        text : rtypes.string.isRequired
        on_change : rtypes.func.isRequired
        type : rtypes.string
        rows : rtypes.number

    componentWillReceiveProps: (next_props) ->
        if @props.text != next_props.text
            # so when the props change the state stays in sync (e.g., so save button doesn't appear, etc.)
            @setState(text : next_props.text)

    getInitialState: ->
        text : @props.text

    saveChange: (event) ->
        event.preventDefault()
        @props.on_change(@state.text)

    render_save_button: ->
        if @state.text? and @state.text != @props.text
            <Button  style={marginBottom:'15px'} bsStyle={'success'} onClick={@saveChange}><Icon name={'save'} /> Save</Button>

    render_input: ->
        <FormGroup>
            <FormControl type={@props.type ? 'text'} ref={'input'} rows={@props.rows}
                       componentClass={if @props.type == 'textarea' then 'textarea' else 'input'}
                       value={if @state.text? then @state.text else @props.text}
                       onChange={=>@setState(text:ReactDOM.findDOMNode(@refs.input).value)}
            />
        </FormGroup>

    render: ->
        <form onSubmit={@saveChange}>
            {@render_input()}
            {@render_save_button()}
        </form>

exports.NumberInput = NumberInput = rclass
    displayName : 'Misc-NumberInput'

    propTypes :
        number          : rtypes.number
        min             : rtypes.number.isRequired
        max             : rtypes.number.isRequired
        on_change       : rtypes.func.isRequired
        unit            : rtypes.string
        disabled        : rtypes.bool
        formgroupstyle  : rtypes.object
        plusminus       : rtypes.bool     # if true, show [+] and [-] buttons for convenient adjustments (e.g. mobile devices)
        speedup         : rtypes.number   # multiplicates the delta of these +/- change buttons
        select_on_click : rtypes.bool
        bsSize          : rtypes.string
        mantissa_length : rtypes.oneOf([0..8]) # default 0: means to truncate to integer, or pick a number from 1 to 8
        allow_empty     : rtypes.bool          # if allowed, deleting the number leads to "number" to be "undefined/null"
        empty_text      : rtypes.string        # optional text to display (in lighter color) when there is no value

    getDefaultProps: ->
        plusminus       : false
        mantissa_length : 0
        allow_empty     : false
        speedup         : 10
        empty_text      : '(no number)'

    componentWillReceiveProps: (next_props) ->
        if @props.number != next_props.number
            # so when the props change the state stays in sync (e.g., so save button doesn't appear, etc.)
            @setState(number : next_props.number)

    shouldComponentUpdate: (props, state) ->
        update = misc.is_different(@props, props, \
            ['number', 'min', 'max', 'unit', 'disabled', 'plusminus', 'speedup', \
            'select_on_click', 'mantissa_length', 'empty_text', 'allow_empty']
        )
        update or= @state.number != state.number
        return update

    componentDidMount: ->
        {debounce} = require('underscore')
        @on_change_debounce = debounce(((n)=>@props.on_change(n)), 50)

    getInitialState: ->
        number : @props.number

    sanitize_nan: (n) ->
        if "#{n}" == 'NaN'  # or isNaN(n) ?
            n = (@props.number ? 0)
        return n

    sanitize: (n) ->
        if (not n?) or (n == '') or (n == @props.empty_text)
            if @props.allow_empty
                return undefined
            else
                n = 0

        n = @sanitize_nan(n)

        # clip min/max
        if n < @props.min
            n = @props.min
        else if n > @props.max
            n = @props.max

        # rounding to lenth of mantissa
        if @props.mantissa_length == 0
            n = parseInt(n)
        else
            n = misc.roundN(parseFloat(n), @props.mantissa_length)

        return @sanitize_nan(n)

    saveNumber: (n) ->
        n = @sanitize(n)
        @setState(number:n)
        @props.on_change(n)

    saveChange: (e) ->
        e?.preventDefault()
        @saveNumber(@state.number)

    # TODO remove?
    render_save_button: ->
        if @state.number? and @state.number != @props.number
            <Button className='pull-right' bsStyle='success' onClick={@saveChange}><Icon name='save' /> Save</Button>

    plusminus_click: (e, delta) ->
        if e.shiftKey then delta *= @props.speedup
        @setState((prevState, props) =>
            if delta < 0 and props.allow_empty and props.number == props.min
                n = undefined
            else
                n = @sanitize((prevState.number ? 0) + delta)
            @on_change_debounce(n)
            return {number:n}
        )

    plusminus: (delta) ->
        return null if not @props.plusminus
        title = "Hold down your shift key while clicking to accellerate changes by #{@props.speedup}x."

        if delta > 0
            name     = 'plus'
            disabled = @props.number == @props.max
        else
            if @props.allow_empty and @props.number == @props.min
                disabled = false
                name     = 'trash'
                title    = 'Remove the value.'
            else if @props.allow_empty and (not @props.number?)
                disabled = true
                name     = 'ban'
                title    = 'No value set.'
            else
                disabled = @props.number == @props.min
                name     = 'minus'

        <Tip
            title     = {title}
            placement = {'bottom'}
        >
            <Button
                disabled = {disabled}
                bsSize   = {@props.bsSize}
                onClick  = {(e)=>@plusminus_click(e, delta)}
            >
                <Icon name={name} />
            </Button>
        </Tip>

    onClickHandler: (e) ->
        if @props.select_on_click
            e.target.select()

    render_unit: (xs) ->
        return null if not @props.unit?
        unit = if @props.unit? then "#{@props.unit}" else ''
        <Col xs={xs} className="lighten">
            {unit}
        </Col>

    render: ->
        xs      = if @props.unit? then 6 else 12
        fgstyle = @props.formgroupstyle ? {}
        fgstyle = misc.merge({whiteSpace : 'nowrap'}, fgstyle)

        value      = @state.number ? @props.number
        form_style = {textAlign:'right'}
        if not value?
            form_style.color = COLORS.GRAY_L

        <Row>
            <Col xs={xs}>
                <Form onSubmit={@saveChange} inline={@props.plusminus}>
                    <FormGroup style={fgstyle}>
                        {@plusminus(-1)}
                        <FormControl
                            type     = {'text'}
                            ref      = {'input'}
                            bsSize   = {@props.bsSize}
                            value    = {value ? @props.empty_text}
                            onChange = {(e)=>@setState(number:e.target.value)}
                            onBlur   = {@saveChange}
                            onKeyDown= {(e)=>if e.keyCode == 27 then @setState(number:@props.number)}
                            onClick  = {@onClickHandler}
                            disabled = {@props.disabled}
                            style    = {form_style}
                        />
                        {@plusminus(+1)}
                    </FormGroup>
                </Form>
            </Col>
            {@render_unit(xs)}
        </Row>

exports.LabeledRow = LabeledRow = rclass
    displayName : 'Misc-LabeledRow'

    propTypes :
        label      : rtypes.any.isRequired
        style      : rtypes.object            # NOTE: for perf reasons, we do not update if only the style changes!
        label_cols : rtypes.number    # number between 1 and 11 (default: 4)
        className  : rtypes.string

    getDefaultProps: ->
        label_cols : 4

    render: ->
        <Row style={@props.style} className={@props.className} >
            <Col xs={@props.label_cols} style={marginTop:'8px'}>
                {@props.label}
            </Col>
            <Col xs={12-@props.label_cols}  style={marginTop:'8px'}>
                {@props.children}
            </Col>
        </Row>

help_text =
  backgroundColor: 'white'
  padding        : '10px'
  borderRadius   : '5px'
  margin         : '5px'

exports.HelpIcon = rclass
    displayName : 'Misc-Help'

    propTypes :
        title        : rtypes.string.isRequired

    getDefaultProps: ->
        title        : 'Help'

    getInitialState: ->
        closed : true

    close: ->
        @setState(closed : true)

    render: ->
        if @state.closed
            <a onClick={(e)=>e.preventDefault();@setState(closed:false)}><Icon style={color:'#5bc0de'} name='question-circle'/></a>
        else if not @state.closed
            <Modal show={not @state.closed} onHide={@close}>
                <Modal.Header closeButton>
                    <Modal.Title>{@props.title}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {@props.children}
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={@close}>Close</Button>
                </Modal.Footer>
            </Modal>

###
# Customized TimeAgo support
# TODO: internationalize this formatter -- see https://www.npmjs.com/package/react-timeago
###

timeago_formatter = (value, unit, suffix, date) ->
    if value == 0
        return 'now'
    if unit == 'second'
        return "less than a minute #{suffix}"
    if value != 1
        unit += 's'
    return "#{value} #{unit} #{suffix}"

TimeAgo = require('react-timeago').default

# date0 and date1 are string, Date object or number
# This is just used for updates, so is_different if there
# is a chance they are different
exports.is_different_date = is_different_date = (date0, date1) ->
    t0 = typeof(date0)
    t1 = typeof(date1)
    if t0 != t1
        return true
    switch t0
        when 'object'
            return date0 - date1 != 0
        else
            return date0 != date1

# this "element" can also be used without being connected to a redux store - e.g. for the "shared" statically rendered pages
exports.TimeAgoElement = rclass
    displayName : 'Misc-TimeAgoElement'

    propTypes :
        popover           : rtypes.bool
        placement         : rtypes.string
        tip               : rtypes.string     # optional body of the tip popover with title the original time.
        live              : rtypes.bool       # whether or not to auto-update
        time_ago_absolute : rtypes.bool
        date              : rtypes.oneOfType([rtypes.string, rtypes.object, rtypes.number])  # date object or something that convert to date

    getDefaultProps: ->
        popover   : true
        minPeriod : 45    # "minPeriod and maxPeriod now accept seconds not milliseconds. This matches the documentation."
        placement : 'top'
        # critical to use minPeriod>>1000, or things will get really slow in the client!!
        # Also, given our custom formatter, anything more frequent than about 45s is pointless (since we don't show seconds)
        time_ago_absolute : false

    render_timeago_element: (d) ->
        <TimeAgo
            title     = ''
            date      = {d}
            style     = {@props.style}
            formatter = {timeago_formatter}
            minPeriod = {@props.minPeriod}
            live      = {@props.live ? true}
        />

    render_timeago: (d) ->
        if @props.popover
            s = d.toLocaleString()
            <Tip title={s} tip={@props.tip} id={s} placement={@props.placement}>
                {@render_timeago_element(d)}
            </Tip>
        else
            @render_timeago_element(d)

    render_absolute: (d) ->
        <span>{d.toLocaleString()}</span>

    render: ->
        d = if misc.is_date(@props.date) then @props.date else new Date(@props.date)
        try
            d.toISOString()
        catch
            # NOTE: Using isNaN might not work on all browsers, so we use try/except
            # See https://github.com/sagemathinc/cocalc/issues/2069
            return <span>Invalid Date</span>

        if @props.time_ago_absolute
            @render_absolute(d)
        else
            @render_timeago(d)

TimeAgoWrapper = rclass
    displayName : 'Misc-TimeAgoWrapper'

    propTypes :
        popover   : rtypes.bool
        placement : rtypes.string
        tip       : rtypes.string     # optional body of the tip popover with title the original time.
        live      : rtypes.bool       # whether or not to auto-update
        date      : rtypes.oneOfType([rtypes.string, rtypes.object, rtypes.number])  # date object or something that convert to date

    reduxProps :
        account :
            other_settings : rtypes.immutable.Map

    shouldComponentUpdate: (props) ->
        return is_different_date(@props.date, props.date) or \
               misc.is_different(@props, props, ['popover', 'placement', 'tip', 'live']) or \
               @props.other_settings?.get('time_ago_absolute') != props.other_settings?.get('time_ago_absolute')

    render: ->
        <exports.TimeAgoElement
            date              = {@props.date}
            popover           = {@props.popover}
            placement         = {@props.placement}
            tip               = {@props.tip}
            live              = {@props.live}
            time_ago_absolute = {@props.other_settings?.get('time_ago_absolute') ? false}
        />

# The TimeAgoWrapper above is absolutely really necessary **until** the react rewrite is completely
# done.  The reason is that currently we have some non-redux new react stuff that has timeago init,
# e.g., for the TimeTravel view.
exports.TimeAgo = rclass
    displayName : 'Misc-TimeAgo-redux'

    propTypes :
        popover   : rtypes.bool
        placement : rtypes.string
        tip       : rtypes.string     # optional body of the tip popover with title the original time.
        live      : rtypes.bool       # whether or not to auto-update
        date      : rtypes.oneOfType([rtypes.string, rtypes.object, rtypes.number])  # date object or something that convert to date

    shouldComponentUpdate: (props) ->
        return is_different_date(@props.date, props.date) or \
               misc.is_different(@props, props, ['popover', 'placement', 'tip', 'live'])

    render: ->
        <Redux redux={redux}>
            <TimeAgoWrapper
                date      = {@props.date}
                popover   = {@props.popover}
                placement = {@props.placement}
                tip       = {@props.tip}
                live      = {@props.live}
            />
        </Redux>

# Important:
# widget can be controlled or uncontrolled -- use default_value for an *uncontrolled* widget
# with callbacks, and value for a controlled one!
#    See http://facebook.github.io/react/docs/forms.html#controlled-components

# Search input box with the following capabilities
# a clear button (that focuses the input)
# `enter` to submit
# `esc` to clear
exports.SearchInput = rclass
    displayName : 'Misc-SearchInput'

    propTypes :   # style, and the on_ functions changes do not cause component update
        style           : rtypes.object
        autoFocus       : rtypes.bool
        autoSelect      : rtypes.bool
        placeholder     : rtypes.string
        default_value   : rtypes.string
        value           : rtypes.string
        on_change       : rtypes.func    # invoked as on_change(value, get_opts()) each time the search input changes
        on_submit       : rtypes.func    # invoked as on_submit(value, get_opts()) when the search input is submitted (by hitting enter)
        on_escape       : rtypes.func    # invoked when user presses escape key; on_escape(value *before* hitting escape)
        on_up           : rtypes.func    # push up arrow
        on_down         : rtypes.func    # push down arrow
        on_clear        : rtypes.func    # invoked without arguments when input box is cleared (eg. via esc or clicking the clear button)
        clear_on_submit : rtypes.bool    # if true, will clear search box on every submit (default: false)
        buttonAfter     : rtypes.element
        input_class     : rtypes.string  # className for the InputGroup element

    shouldComponentUpdate: (props, state) ->
        return misc.is_different(@state, state, ['value', 'ctrl_down']) or \
               misc.is_different(@props, props, ['clear_on_submit', 'autoFocus', 'autoSelect', 'placeholder', \
                                                 'default_value',  'value', 'buttonAfter'])

    getInitialState: ->
        value     : (@props.value || @props.default_value) ? ''
        ctrl_down : false

    get_opts: ->
        ctrl_down : @state.ctrl_down

    componentWillReceiveProps: (new_props) ->
        if new_props.value?
            @setState(value : new_props.value)

    componentDidMount: ->
        if @props.autoSelect
            try
                ReactDOM.findDOMNode(@refs.input).select()
            catch e
                # Edge sometimes complains about 'Could not complete the operation due to error 800a025e'

    clear_value: ->
        @set_value('')
        @props.on_clear?()

    clear_and_focus_search_input: ->
        @clear_value()
        ReactDOM.findDOMNode(@refs.input).focus()

    search_button: ->
        if @props.buttonAfter?
            return @props.buttonAfter
        else
            s = if @state.value?.length > 0 then 'warning' else "default"
            <Button onClick={@clear_and_focus_search_input} bsStyle={s}>
                <Icon name='times-circle' />
            </Button>

    set_value: (value) ->
        @setState(value:value)
        @props.on_change?(value, @get_opts())

    submit: (e) ->
        e?.preventDefault()
        @props.on_submit?(@state.value, @get_opts())
        if @props.clear_on_submit
            @clear_value()
            @props.on_change?(@state.value, @get_opts())

    key_down: (e) ->
        switch e.keyCode
            when 27
                @escape()
            when 40
                @props.on_down?()
            when 38
                @props.on_up?()
            when 17
                @setState(ctrl_down : true)
            when 13
                @submit()

    key_up: (e) ->
        switch e.keyCode
            when 17
                @setState(ctrl_down : false)

    escape: ->
        @props.on_escape?(@state.value)
        @clear_value()

    render: ->
        <FormGroup style={@props.style}>
            <InputGroup className={@props.input_class}>
                <FormControl
                    autoFocus   = {@props.autoFocus}
                    ref         = 'input'
                    type        = 'text'
                    placeholder = {@props.placeholder}
                    value       = {@state.value}
                    onChange    = {=>@set_value(ReactDOM.findDOMNode(@refs.input).value)}
                    onKeyDown   = {@key_down}
                    onKeyUp     = {@key_up}
                />
                <InputGroup.Button>
                    {@search_button()}
                </InputGroup.Button>
            </InputGroup>
        </FormGroup>

# This is set to true when run from the share server.  All rendering of HTML must then be synchronous.
exports.SHARE_SERVER = false

exports.HTML = HTML = rclass
    displayName : 'Misc-HTML' # this name is assumed and USED in the smc-hub/share/mathjax-support to identify this component; do NOT change!

    propTypes :
        value            : rtypes.string
        style            : rtypes.object
        auto_render_math : rtypes.bool     # optional -- used to detect and render math
        project_id       : rtypes.string   # optional -- can be used to improve link handling (e.g., to images)
        file_path        : rtypes.string   # optional -- ...
        className        : rtypes.string   # optional class
        safeHTML         : rtypes.bool     # optional -- default true, if true scripts and unsafe attributes are removed from sanitized html
        href_transform   : rtypes.func     # optional function that link/src hrefs are fed through
        post_hook        : rtypes.func     # optional function post_hook(elt), which should mutate elt, where elt is
                                           # the jQuery wrapped set that is created (and discarded!) in the course of
                                           # sanitizing input.  Use this as an opportunity to modify the HTML structure
                                           # before it is exported to text and given to react.   Obviously, you can't
                                           # install click handlers here.
        highlight        : rtypes.immutable.Set
        content_editable : rtypes.bool     # if true, makes rendered HTML contenteditable
        reload_images    : rtypes.bool     # if true, after any update to component, force reloading of all images.
        highlight_code   : rtypes.bool     # if true, highlight some <code class='language-r'> </code> blocks.  See misc_page for how tiny this is!
        id               : rtypes.string
        mathjax_selector : rtypes.string   # if given, only run mathjax on result of jquery select with this selector and never use katex.

    getDefaultProps: ->
        auto_render_math : true
        safeHTML         : true

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['value', 'auto_render_math', 'highlight', 'safeHTML', \
                 'reload_images', 'highlight_code']) or \
               not underscore.isEqual(@props.style, next.style)

    _update_mathjax: ->
        if not @_is_mounted  # see https://github.com/sagemathinc/cocalc/issues/1689
            return
        if not @props.auto_render_math
            return
        $(ReactDOM.findDOMNode(@)).katex()

    _update_highlight: ->
        if not @_is_mounted or not @props.highlight?
            return
        # Use jquery-highlight, which is a pretty serious walk of the DOM tree, etc.
        $(ReactDOM.findDOMNode(@)).highlight(@props.highlight.toJS())

    _update_links: ->
        if not @_is_mounted
            return
        $(ReactDOM.findDOMNode(@)).process_smc_links
            project_id     : @props.project_id
            file_path      : @props.file_path
            href_transform : @props.href_transform

    _update_tables: ->
        if not @_is_mounted
            return
        $(ReactDOM.findDOMNode(@)).find("table").addClass('table')

    _update_images: ->
        if @_is_mounted and @props.reload_images
            $(ReactDOM.findDOMNode(@)).reload_images()

    _update_code: ->
        if @_is_mounted and @props.highlight_code
            $(ReactDOM.findDOMNode(@)).highlight_code()

    _do_updates: ->
        if exports.SHARE_SERVER
            return
        @_update_mathjax()
        @_update_links()
        @_update_tables()
        @_update_highlight()
        @_update_code()
        @_update_images()

    update_content: ->
        if not @_is_mounted
            return
        @_do_updates()

    componentDidUpdate: ->
        @update_content()

    componentDidMount: ->
        @_is_mounted = true
        @update_content()

    componentWillUnmount: ->
        # see https://facebook.github.io/react/blog/2015/12/16/ismounted-antipattern.html
        # and https://github.com/sagemathinc/cocalc/issues/1689
        @_is_mounted = false

    render_html: ->
        if not @props.value
            return {__html: ''}

        if @props.safeHTML
            html = require('../misc_page').sanitize_html_safe(@props.value, @props.post_hook)
        else
            html = require('../misc_page').sanitize_html(@props.value, true, true, @props.post_hook)

        if exports.SHARE_SERVER
            {jQuery} = require('smc-webapp/jquery-plugins/katex')  # ensure have plugin here.
            elt = jQuery("<div>")
            elt.html(html)
            if @props.auto_render_math
                elt.katex()
            elt.find("table").addClass("table")
            if @props.highlight_code
                elt.highlight_code()
            html = elt.html()

        return {__html: html}

    render: ->
        # the random key is the whole span (hence the html) does get rendered whenever
        # this component is updated.  Otherwise, it will NOT re-render except when the value changes.
        if @props.content_editable
            <div
                id                      = {@props.id}
                contentEditable         = {true}
                key                     = {Math.random()}
                className               = {@props.className}
                dangerouslySetInnerHTML = {@render_html()}
                style                   = {@props.style} >
            </div>
        else
            <span
                id                      = {@props.id}
                key                     = {Math.random()}
                className               = {@props.className}
                dangerouslySetInnerHTML = {@render_html()}
                style                   = {@props.style} >
            </span>

exports.Markdown = rclass
    displayName : 'Misc-Markdown'

    propTypes :
        value            : rtypes.string
        style            : rtypes.object
        project_id       : rtypes.string   # optional -- can be used to improve link handling (e.g., to images)
        file_path        : rtypes.string   # optional -- ...
        className        : rtypes.string   # optional class
        safeHTML         : rtypes.bool     # optional -- default true, if true scripts and unsafe attributes are removed from sanitized html

        href_transform   : rtypes.func     # optional function used to first transform href target strings
        post_hook        : rtypes.func     # see docs to HTML
        highlight        : rtypes.immutable.Set
        content_editable : rtypes.bool     # if true, makes rendered Markdown contenteditable
        id               : rtypes.string
        reload_images    : rtypes.bool
        highlight_code   : rtypes.bool

    getDefaultProps: ->
        safeHTML         : true

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['value', 'highlight', 'safeHTML',  \
                    'checkboxes', 'reload_images', 'highlight_code']) or \
               not underscore.isEqual(@props.style, next.style)

    to_html: ->
        if not @props.value
            return
        return markdown.markdown_to_html(@props.value)

    render: ->
        <HTML
            id               = {@props.id}
            auto_render_math = {true}
            value            = {@to_html()}
            style            = {@props.style}
            project_id       = {@props.project_id}
            file_path        = {@props.file_path}
            className        = {@props.className}
            href_transform   = {@props.href_transform}
            post_hook        = {@props.post_hook}
            highlight        = {@props.highlight}
            safeHTML         = {@props.safeHTML}
            reload_images    = {@props.reload_images}
            highlight_code   = {@props.highlight_code}
            content_editable = {@props.content_editable} />


activity_style =
    float           : 'right'
    backgroundColor : 'white'
    position        : 'absolute'
    right           : '25px'
    top             : '65px'
    border          : '1px solid #ccc'
    padding         : '10px'
    zIndex          : '10'
    borderRadius    : '5px'
    boxShadow       : '3px 3px 3px #ccc'

activity_item_style =
    whiteSpace   : 'nowrap'
    overflow     : 'hidden'
    textOverflow : 'ellipsis'

exports.ActivityDisplay = rclass
    displayName : 'ActivityDisplay'

    propTypes :
        activity : rtypes.array.isRequired   # array of strings  -- only changing this causes re-render
        trunc    : rtypes.number             # truncate activity messages at this many characters (default: 80)
        on_clear : rtypes.func               # if given, called when a clear button is clicked
        style    : rtypes.object             # additional styles to be merged onto activity_style

    shouldComponentUpdate: (next) ->
        return misc.is_different_array(@props.activity, next.activity)

    render_items: ->
        n = @props.trunc ? 80
        trunc = (s) -> misc.trunc(s, n)
        for desc, i in @props.activity
            <div key={i} style={activity_item_style} >
                <Icon style={padding:'2px 1px 1px 2px'} name='cc-icon-cocalc-ring' spin /> {trunc(desc)}
            </div>

    render: ->
        if misc.len(@props.activity) > 0
            if @props.style
                adjusted_style = Object.assign({}, activity_style, @props.style)

            <div key='activity' style={adjusted_style ? activity_style}>
                {<CloseX on_close={@props.on_clear} /> if @props.on_clear?}
                {@render_items() if @props.activity.length > 0}
            </div>
        else
            <span />

exports.SaveButton = rclass
    displayName : 'Misc-SaveButton'

    propTypes :
        unsaved  : rtypes.bool
        disabled : rtypes.bool
        on_click : rtypes.func.isRequired

    render: ->
        <Button bsStyle='success' disabled={@props.saving or not @props.unsaved} onClick={@props.on_click}>
            <Icon name='save' /> <VisibleMDLG>Sav{if @props.saving then <span>ing... <Icon name='cc-icon-cocalc-ring' spin /></span> else <span>e</span>}</VisibleMDLG>
        </Button>

# Component to attempt opening an smc path in a project
exports.PathLink = rclass
    displayName : 'Misc-PathLink'

    propTypes :
        path         : rtypes.string.isRequired
        project_id   : rtypes.string.isRequired
        display_name : rtypes.string # if provided, show this as the link and show real name in popover
        full         : rtypes.bool   # true = show full path, false = show only basename
        trunc        : rtypes.number # truncate longer names and show a tooltip with the full name
        style        : rtypes.object
        link         : rtypes.bool   # set to false to make it not be a link

    getDefaultProps: ->
        style : {}
        full  : false
        link  : true

    handle_click: (e) ->
        e.preventDefault()
        path_head = 'files/'
        @actions('projects').open_project
            project_id : @props.project_id
            target     : path_head + @props.path
            switch_to  : misc.should_open_in_foreground(e)

    render_link: (text) ->
        if @props.link
            <a onClick={@handle_click} style={@props.style} href=''>{text}</a>
        else
            <span style={@props.style}>{text}</span>

    render: ->
        name = if @props.full then @props.path else misc.path_split(@props.path).tail
        if name.length > @props.trunc or (@props.display_name? and @props.display_name isnt name)
            if @props.trunc?
                text = misc.trunc_middle(@props.display_name ? name, @props.trunc)
            else
                text = @props.display_name ? name
            <Tip title='' tip={name}>
                {@render_link(text)}
            </Tip>
        else
            @render_link(name)

Globalize = require('globalize')
globalizeLocalizer = require('react-widgets-globalize')
globalizeLocalizer(Globalize)

DateTimePicker = require('react-widgets/lib/DateTimePicker')

DATETIME_PARSE_FORMATS = [
    'MMM d, yyyy h:mm tt'
    'MMMM d, yyyy h:mm tt'
    'MMM d, yyyy'
    'MMM d, yyyy H:mm'
    'MMMM d, yyyy'
    'MMMM d, yyyy H:mm'
]

exports.DateTimePicker = rclass
    displayName : 'Misc-DateTimePicker'

    propTypes :
        value       : rtypes.oneOfType([rtypes.string, rtypes.object])
        on_change   : rtypes.func.isRequired
        on_focus    : rtypes.func
        on_blur     : rtypes.func
        autoFocus   : rtypes.bool
        onKeyDown   : rtypes.func
        defaultOpen : rtypes.oneOf([false, 'time', 'date'])

    getDefaultProps: ->
        defaultOpen : 'date'

    render: ->
        <DateTimePicker
            step        = {60}
            editFormat  = {'MMM d, yyyy h:mm tt'}
            format      = {'MMM d, yyyy h:mm tt'}
            parse       = {DATETIME_PARSE_FORMATS}
            value       = {@props.value}
            onChange    = {@props.on_change}
            onFocus     = {@props.on_focus}
            onBlur      = {@props.on_blur}
            autoFocus   = {@props.autoFocus}
            defaultOpen = {@props.defaultOpen}
        />

Calendar = require('react-widgets/lib/Calendar')

exports.Calendar = rclass
    displayName : 'Misc-Calendar'

    propTypes :
        value     : rtypes.oneOfType([rtypes.string, rtypes.object])
        on_change : rtypes.func.isRequired

    render: ->
        <Calendar
            defaultValue = {@props.value}
            onChange     = {@props.on_change}
        />

exports.r_join = (components, sep=', ') ->
    v = []
    n = misc.len(components)
    for x, i in components
        v.push(x)
        if i < n-1
            v.push(<span key={-i-1}>{sep}</span>)
    return v


# NOTE: This component does *NOT* all the update_directory_tree action.  That is currently necessary
# to update the tree as of July 31, 2015, though when there is a sync'd filetree it won't be.
exports.DirectoryInput = rclass
    displayName : 'DirectoryInput'

    reduxProps :
        projects :
            directory_trees : rtypes.immutable

    propTypes :
        project_id    : rtypes.string.isRequired
        on_change     : rtypes.func.isRequired
        default_value : rtypes.string
        placeholder   : rtypes.string
        autoFocus     : rtypes.bool
        on_key_down   : rtypes.func
        on_key_up     : rtypes.func
        exclusions    : rtypes.array

    render: ->
        x = @props.directory_trees?.get(@props.project_id)?.toJS()
        if not x? or new Date() - x.updated >= 15000
            redux.getActions('projects').fetch_directory_tree(@props.project_id, exclusions:@props.exclusions)
        tree = x?.tree
        if tree?
            group = (s) ->
                i = s.indexOf('/')
                if i == -1
                    return s
                else
                    return s.slice(0, i)
        else
            group = (s) -> s
        <Combobox
            autoFocus    = {@props.autoFocus}
            data         = {tree}
            filter       = {'contains'}
            groupBy      = {group}
            defaultValue = {@props.default_value}
            placeholder  = {@props.placeholder}
            messages     = {emptyFilter : '', emptyList : ''}
            onChange     = {(value) => @props.on_change(value)}
            onKeyDown    = {@props.on_key_down}
            onKeyUp      = {@props.on_key_up}
        />

# A warning to put on pages when the project is deleted
# TODO: use this in more places
exports.DeletedProjectWarning = ->
    <Alert bsStyle='danger' style={marginTop:'10px'}>
        <h4><Icon name='exclamation-triangle'/>  Warning: this project is <strong>deleted!</strong></h4>
        <p>If you intend to use this project, you should <strong>undelete it</strong> in Hide or delete under project settings.</p>
    </Alert>

exports.course_warning = (pay) ->
    if not pay
        return false
    {webapp_client} = require('../webapp_client')
    return webapp_client.server_time() <= misc.months_before(-3, pay)  # require subscription until 3 months after start (an estimate for when class ended, and less than when what student did pay for will have expired).

project_warning_opts = (opts) ->
    {upgrades_you_can_use, upgrades_you_applied_to_all_projects, course_info, account_id, email_address, upgrade_type} = opts
    total = upgrades_you_can_use?[upgrade_type] ? 0
    used  = upgrades_you_applied_to_all_projects?[upgrade_type] ? 0
    x =
        total                 : total
        used                  : used
        avail                 : total - used
        course_warning        : exports.course_warning(course_info?.get?('pay'))  # no *guarantee* that course_info is immutable.js since just comes from database
        course_info           : opts.course_info
        account_id            : account_id
        email_address         : email_address
    return x

exports.CourseProjectExtraHelp = CourseProjectExtraHelp = ->
    <div style={marginTop:'10px'}>
       If you have already paid, you can go to the settings in your project and click the "Adjust  your quotas..." button, then click the checkboxes next to network and member hosting.  If it says you do not have enough quota, visit the Upgrades tab in account settings, see where the upgrades are, remove them from another project, then try again.
    </div>

exports.CourseProjectWarning = (opts) ->
    {total, used, avail, course_info, course_warning, account_id, email_address} = project_warning_opts(opts)
    if not course_warning
        # nothing
        return <span></span>
    # We may now assume course_info.get is defined, since course_warning is only true if it is.
    pay = course_info.get('pay')
    billing = require('../billing')
    if avail > 0
        action = <billing.BillingPageLink text="move this project to a members only server" />
    else
        action = <billing.BillingPageLink text="buy a course subscription" />
    is_student = account_id == course_info.get('account_id') or email_address == course_info.get('email_address')
    {webapp_client} = require('../webapp_client')
    if pay > webapp_client.server_time()  # in the future
        if is_student
            deadline  = <span>Your instructor requires you to {action} within <TimeAgo date={pay}/>.</span>
        else
            deadline = <span>Your student must buy a course subscription within <TimeAgo date={pay}/>.</span>
        style = 'warning'
        label = 'Warning'
    else
        if is_student
            deadline  = <span>Your instructor requires you to {action} now to continuing using this project.{<CourseProjectExtraHelp/> if total>0}</span>
        else
            deadline = <span>Your student must buy a course subscription to continue using this project.</span>
        style = 'danger'
        label = 'Error'
    <Alert bsStyle={style} style={marginTop:'10px'}>
        <h4><Icon name='exclamation-triangle'/>  {label}: course payment required</h4>
        {deadline}
    </Alert>

exports.NonMemberProjectWarning = (opts) ->
    {total, used, avail, course_warning} = project_warning_opts(opts)

    ## Disabled until a pay-in-place version gets implemented
    #if course_warning
    #    return exports.CourseProjectWarning(opts)

    if avail > 0
        # have upgrade available
        suggestion = <span><b><i>You have {avail} unused members-only hosting {misc.plural(avail,'upgrade')}</i></b>.  Click 'Adjust your quotas...' below.</span>
    else if avail <= 0
        url = PolicyPricingPageUrl
        if total > 0
            suggestion = <span>Your {total} members-only hosting {misc.plural(total,'upgrade')} are already in use on other projects.  You can <a href={url} target='_blank' style={cursor:'pointer'}>purchase further upgrades </a> by adding a subscription (you can add the same subscription multiple times), or disable member-only hosting for another project to free a spot up for this one.</span>
        else
            suggestion = <span><Space /><a href={url} target='_blank' style={cursor:'pointer'}>Subscriptions start at only $14/month.</a></span>

    <Alert bsStyle='warning' style={marginTop:'10px'}>
        <h4><Icon name='exclamation-triangle'/>  Warning: this project is <strong>running on a free server</strong></h4>
        <p>
            <Space />
            Projects running on free servers compete for resources with a large number of other free projects.
            The free servers are <b><i>randomly rebooted frequently</i></b>,
            and are often <b><i>much more heavily loaded</i></b> than members-only servers.
            {suggestion}
        </p>
    </Alert>

exports.NoNetworkProjectWarning = (opts) ->
    {total, used, avail} = project_warning_opts(opts)
    if avail > 0
        # have upgrade available
        suggestion = <span><b><i>You have {avail} unused internet access {misc.plural(avail,'upgrade')}</i></b>.  Click 'Adjust your quotas...' below.</span>
    else if avail <= 0
        url = PolicyPricingPageUrl
        if total > 0
            suggestion = <span>Your {total} internet access {misc.plural(total,'upgrade')} are already in use on other projects.  You can <a href={url} target='_blank' style={cursor:'pointer'}>purchase further upgrades </a> by adding a subscription (you can add the same subscription multiple times), or disable an internet access upgrade for another project to free a spot up for this one.</span>
        else
            suggestion = <span><Space /><a href={url} target='_blank' style={cursor:'pointer'}>Subscriptions start at only $14/month.</a></span>

    <Alert bsStyle='warning' style={marginTop:'10px'}>
        <h4><Icon name='exclamation-triangle'/>  Warning: this project <strong>does not have full internet access</strong></h4>
        <p>
            Projects without internet access enabled, cannot connect to external websites or download software packages.
            {suggestion}
        </p>
    </Alert>

exports.CheckedIcon = rclass
    displayName : 'Misc-CheckedIcon'

    propTypes :
        checked   : rtypes.bool

    getDefaultProps: ->
        checked   : false

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['checked'])

    render : ->
        name = if @props.checked then 'check-square-o' else 'square-o'
        <Icon name={name} />

exports.LoginLink = rclass
    displayName : 'Misc-LoginLink'

    render: ->  # TODO: the code to switch page below will change when we get a top-level navigation store.
        <Alert bsStyle='info' style={margin:'15px'}>
            <Icon name='sign-in' style={fontSize:'13pt', marginRight:'10px'} /> Please<Space/>
            <a style={cursor: 'pointer'}
                onClick={=>redux.getActions('page').set_active_tab('account')}>
                login or create an account...
            </a>
        </Alert>

COMPUTE_STATES = require('smc-util/schema').COMPUTE_STATES
exports.ProjectState = rclass
    displayName : 'Misc-ProjectState'

    propTypes :
        state     : rtypes.immutable.Map     # {state: 'running', time:'timestamp when switched to that state'}
        show_desc : rtypes.bool

    getDefaultProps: ->
        state     : 'unknown'
        show_desc : false

    render_spinner:  ->
        <span>... <Icon name='cc-icon-cocalc-ring' spin /></span>

    render_desc: (desc) ->
        if not @props.show_desc
            return
        <span>
            <br/>
            <span style={fontSize:'11pt'}>
                {desc}
                {@render_time()}
            </span>
        </span>

    render_time: ->
        time = @props.state?.get('time')
        if time
            return <span><Space/> (<exports.TimeAgo date={time} />)</span>

    render: ->
        s = COMPUTE_STATES[@props.state?.get('state')]
        if not s?
            return <Loading />
        {display, desc, icon, stable} = s
        <span>
            <Icon name={icon} /> {display} {@render_spinner() if not stable}
            {@render_desc(desc)}
        </span>


# info button inside the editor when editing a file. links you back to the file listing with the action prompted
# TODO: move this somewhere else once editor is rewritten
{DropdownButton, MenuItem} = require('react-bootstrap')
exports.EditorFileInfoDropdown = EditorFileInfoDropdown = rclass
    displayName : 'Misc-EditorFileInfoDropdown'

    propTypes :
        filename  : rtypes.string.isRequired # expects the full path name
        actions   : rtypes.object.isRequired
        is_public : rtypes.bool
        bsSize    : rtypes.string
        label     : rtypes.string
        style     : rtypes.object

    shouldComponentUpdate: (next) ->
        return next.filename != @props.filename or next.is_public != next.is_public

    getDefaultProps: ->
        is_public : false
        style     : {marginRight:'2px'}

    handle_click: (name) ->
        @props.actions.show_file_action_panel
            path   : @props.filename
            action : name

    render_menu_item: (name, icon) ->
        <MenuItem onSelect={=>@handle_click(name)} key={name} >
            <Icon name={icon} fixedWidth /> {"#{misc.capitalize(name)}..."}
        </MenuItem>

    render_menu_items: ->
        if @props.is_public
            # Fewer options when viewing the action dropdown in public mode:
            items =
                'download' : 'cloud-download'
                'copy'     : 'files-o'
        else
            # dynamically create a map from 'key' to 'icon'
            {file_actions} = require('../project_store')
            items = underscore.object(([k, v.icon] for k, v of file_actions))

        for name, icon of items
            @render_menu_item(name, icon)

    render_title: ->
        <span>
            <span className={'hidden-xs'}>
                <Icon name={'file'}/> {@props.label ? ''}
                <Space />
            </span>
        </span>

    render: ->
        <DropdownButton
            style   = {@props.style}
            id      = 'file_info_button'
            title   = {@render_title()}
            bsSize  = {@props.bsSize}
            >
            {@render_menu_items()}
        </DropdownButton>

exports.render_file_info_dropdown = (filename, actions, dom_node, is_public) ->
    ReactDOM.render(<EditorFileInfoDropdown filename={filename} actions={actions} is_public={is_public} />, dom_node)

exports.UPGRADE_ERROR_STYLE = UPGRADE_ERROR_STYLE =
    color        : 'white'
    background   : 'red'
    padding      : '1ex'
    borderRadius : '3px'
    fontWeight   : 'bold'
    marginBottom : '1em'

exports.NoUpgrades = NoUpgrades = rclass
    displayName : 'NoUpgrades'

    propTypes :
        cancel : rtypes.func.isRequired

    billing: (e) ->
        e.preventDefault()
        require('../billing').visit_billing_page()

    render: ->
        <Alert bsStyle='info'>
            <h3><Icon name='exclamation-triangle' /> Your account has no upgrades available</h3>
            <p>You can purchase upgrades starting at $7 / month.</p>
            <p><a href='' onClick={@billing}>Visit the billing page...</a></p>
            <Button onClick={@props.cancel}>Cancel</Button>
        </Alert>

###
 Takes current upgrades data and quota parameters and provides an interface for the user to update these parameters.
 submit_upgrade_quotas will receive a javascript object in the same format as quota_params
 cancel_upgrading takes no arguments and is called when the cancel button is hit.
###
exports.UpgradeAdjustor = rclass
    displayName : 'UpgradeAdjustor'

    propTypes :
        quota_params                         : rtypes.object.isRequired # from the schema
        total_project_quotas                 : rtypes.object
        submit_upgrade_quotas                : rtypes.func.isRequired
        cancel_upgrading                     : rtypes.func.isRequired
        disable_submit                       : rtypes.bool
        upgrades_you_can_use                 : rtypes.object
        upgrades_you_applied_to_all_projects : rtypes.object
        upgrades_you_applied_to_this_project : rtypes.object
        omit_header                          : rtypes.bool

    getDefaultProps: ->
        upgrades_you_can_use                 : {}
        upgrades_you_applied_to_all_projects : {}
        upgrades_you_applied_to_this_project : {}
        omit_header                          : false

    getInitialState: ->
        state = {}

        current = @props.upgrades_you_applied_to_this_project

        for name, data of @props.quota_params
            factor = data.display_factor
            if data.input_type == 'checkbox' and @props.submit_text == "Create project with upgrades"
                current_value = current[name] ? 1
            else
                current_value = current[name] ? 0
            state["upgrade_#{name}"] = misc.round2(current_value * factor)

        return state

    get_quota_info : ->
        # This function is quite confusing and tricky.
        # It combines the remaining upgrades of the user with the already applied ones by the same user.
        # Then it limits the applyable upgrades by what's still possible to apply until the maximum is reached.
        # My mental model:
        #
        #   0                           total_upgrades     proj_maximum
        #   |<-------------------------------->|                |
        #   |<----->|<------------------------>|<-------------->|
        #   | admin |  all upgrades by users   | proj remainder |
        #   | +     |<------------>|<--------->|<--------->|    |
        #   | free  |  other users | this user | remaining |    |
        #   |       |              |           | this user |    |
        #   |       |              |<--------------------->|    |
        #   |       |              |  limit for this user  | <= | max
        #
        #   admin/free: could be 0
        #   all upgrades by users is total_project_quotas
        #   remainder: >=0, usually, but if there are already too many upgrades it is negative!
        #   this user: upgrades_you_applied_to_this_project. this is >= 0!
        #   limit for this user: is capped by the user's overall quotas AND the quota maximum

        # NOTE : all units are ^ly 'internal' instead of display, e.g. seconds instead of hours
        quota_params = @props.quota_params
        # how much upgrade you have used between all projects
        user_upgrades = @props.upgrades_you_applied_to_all_projects
        # how much upgrade you currently use on this one project
        user_current = @props.upgrades_you_applied_to_this_project
        # all currently applied upgrades to this project
        total_upgrades = @props.total_project_quotas
        # how much unused upgrade you have remaining
        user_remaining = misc.map_diff(@props.upgrades_you_can_use, user_upgrades)
        # the overall limits are capped by the maximum per project
        proj_maximum = require('smc-util/schema').PROJECT_UPGRADES.max_per_project
        # and they're also limited by what everyone has already applied
        proj_remainder = misc.map_diff(proj_maximum, total_upgrades)
        # note: if quota already exeeds, proj_remainder might have negative values -- don't cap at 0
        # the overall limit for the user is capped by what's left for the project
        limits = misc.map_limit(user_remaining, proj_remainder)
        # and finally, we add up what a user can add (with the maybe negative remainder) and cap at 0
        user_limits = misc.map_max(misc.map_sum(limits, user_current), 0)
        return
            limits         : user_limits
            remaining      : user_remaining
            current        : user_current
            totals         : total_upgrades
            proj_remainder : proj_remainder

    clear_upgrades: ->
        @set_upgrades('min')

    max_upgrades: ->
        @set_upgrades('max')

    set_upgrades: (description) ->
        info = @get_quota_info()
        new_upgrade_state = {}
        for name, data of @props.quota_params
            factor = data.display_factor
            switch description
                when 'max'
                    current_value = info.limits[name]
                when 'min'
                    current_value = 0
            new_upgrade_state["upgrade_#{name}"] = misc.round2(current_value * factor)

        return @setState(new_upgrade_state)

    is_upgrade_input_valid: (input, max) ->
        val = misc.parse_number_input(input, round_number=false)
        if not val? or val > Math.max(0, max)
            return false
        else
            return true

    # the max button will set the upgrade input box to the number given as max
    render_max_button: (name, max) ->
        <Button
            bsSize  = 'xsmall'
            onClick = {=>@setState("upgrade_#{name}" : max)}
            style   = {padding:'0px 5px'}
        >
            Max
        </Button>

    render_addon: (misc, name, display_unit, limit) ->
        <div style={minWidth:'81px'}>{"#{misc.plural(2,display_unit)}"} {@render_max_button(name, limit)}</div>

    render_upgrade_row: (name, data, remaining=0, current=0, limit=0, total=0, proj_remainder=0) ->
        if not data?
            return

        {display, desc, display_factor, display_unit, input_type} = data

        if input_type == 'checkbox'

            # the remaining count should decrease if box is checked
            val = @state["upgrade_#{name}"]
            show_remaining = remaining + current - val
            show_remaining = Math.max(show_remaining, 0)

            if not @is_upgrade_input_valid(Math.max(val, 0), limit)
                reasons = []
                if val > remaining + current then reasons.push('you do not have enough upgrades')
                if val > proj_remainder + current then reasons.push('exceeds the limit')
                reason = reasons.join(' and ')
                label = <div style={UPGRADE_ERROR_STYLE}>Uncheck this: {reason}</div>
            else
                label = if val == 0 then 'Enable' else 'Enabled'

            is_upgraded = if total >= 1 then '(already upgraded)' else '(not upgraded)'

            <Row key={name} style={marginTop:'5px'}>
                <Col sm={6}>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong> {is_upgraded}
                    </Tip>
                    <br/>
                    You have {show_remaining} unallocated {misc.plural(show_remaining, display_unit)}
                </Col>
                <Col sm={6}>
                    <form>
                        <Checkbox
                            ref      = {"upgrade_#{name}"}
                            checked  = {val > 0}
                            onChange = {(e)=>@setState("upgrade_#{name}" : if e.target.checked then 1 else 0)}>
                            {label}
                        </Checkbox>
                    </form>
                </Col>
            </Row>


        else if input_type == 'number'
            remaining = misc.round2(remaining * display_factor)
            proj_remainder = misc.round2(proj_remainder * display_factor)
            display_current = current * display_factor # current already applied
            if current != 0 and misc.round2(display_current) != 0
                current = misc.round2(display_current)
            else
                current = display_current

            limit = misc.round2(limit * display_factor)
            current_input = misc.parse_number_input(@state["upgrade_#{name}"]) ? 0 # current typed in

            # the amount displayed remaining subtracts off the amount you type in
            show_remaining = misc.round2(remaining + current - current_input)

            val_state = @state["upgrade_#{name}"]
            val = misc.parse_number_input(val_state)
            if val?
                if not @is_upgrade_input_valid(Math.max(val, 0), limit)
                    reasons = []
                    if val > remaining + current then reasons.push('not enough upgrades')
                    if val > proj_remainder + current then reasons.push('exceeding limit')
                    reason = reasons.join(' and ')
                    bs_style = 'error'
                    label = <div style={UPGRADE_ERROR_STYLE}>Value too high: {reason}</div>
                else
                    label = <span></span>
            else
                label = <div style={UPGRADE_ERROR_STYLE}>Please enter a number</div>

            remaining_all = Math.max(show_remaining, 0)
            schema_limit = PROJECT_UPGRADES.max_per_project
            display_factor = PROJECT_UPGRADES.params[name].display_factor
            # calculates the amount of remaining quotas: limited by the max upgrades and subtract the already applied quotas
            total_limit = misc.round2(schema_limit[name] * display_factor)
            show_total = misc.round2(total * display_factor)

            unit = misc.plural(show_remaining, display_unit)
            if limit < remaining
                remaining_note = <span>You have {remaining_all} unallocated {unit}<br/>(you may allocate up to {limit} {unit} here)</span>

            else
                remaining_note = <span>You have {remaining_all} unallocated {unit}</span>

            <Row key={name} style={marginTop:'5px'}>
                <Col sm={7}>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong> ({show_total} of {total_limit} {unit})
                    </Tip>
                    <br/>
                    {remaining_note}
                </Col>
                <Col sm={5}>
                    <FormGroup>
                        <InputGroup>
                            <FormControl
                                ref        = {"upgrade_#{name}"}
                                type       = {'text'}
                                value      = {val_state}
                                bsStyle    = {bs_style}
                                onChange   = {=>@setState("upgrade_#{name}" : ReactDOM.findDOMNode(@refs["upgrade_#{name}"]).value)}
                            />
                            <InputGroup.Addon>
                                {@render_addon(misc, name, display_unit, limit)}
                            </InputGroup.Addon>
                        </InputGroup>
                    </FormGroup>
                    {label}
                </Col>
            </Row>
        else
            console.warn('Invalid input type in render_upgrade_row: ', input_type)
            return

    save_upgrade_quotas: (remaining) ->
        current = @props.upgrades_you_applied_to_this_project
        new_upgrade_quotas = {}
        new_upgrade_state  = {}
        for name, data of @props.quota_params
            factor = data.display_factor
            current_val = misc.round2((current[name] ? 0) * factor)
            remaining_val = Math.max(misc.round2((remaining[name] ? 0) * factor), 0) # everything is now in display units

            if data.input_type is 'checkbox'
                input = @state["upgrade_#{name}"] ? current_val
                if input and (remaining_val > 0 or current_val > 0)
                    val = 1
                else
                    val = 0

            else
                # parse the current user input, and default to the current value if it is (somehow) invalid
                input = misc.parse_number_input(@state["upgrade_#{name}"]) ? current_val
                input = Math.max(input, 0)
                limit = current_val + remaining_val
                val = Math.min(input, limit)

            new_upgrade_state["upgrade_#{name}"] = val
            new_upgrade_quotas[name] = misc.round2(val / factor) # only now go back to internal units

        @props.submit_upgrade_quotas(new_upgrade_quotas)
        # set the state so that the numbers are right if you click upgrade again
        @setState(new_upgrade_state)

    # Returns true if the inputs are valid and different:
    #    - at least one has changed
    #    - none are negative
    #    - none are empty
    #    - none are higher than their limit
    valid_changed_upgrade_inputs: (current, limits) ->
        for name, data of @props.quota_params
            factor = data.display_factor
            # the highest number the user is allowed to type
            limit = Math.max(0, misc.round2((limits[name] ? 0) * factor))  # max since 0 is always allowed
            # the current amount applied to the project
            cur_val = misc.round2((current[name] ? 0) * factor)
            # the current number the user has typed (undefined if invalid)
            new_val = misc.parse_number_input(@state["upgrade_#{name}"])
            if ((not new_val?) or (new_val > limit)) and (data.input_type isnt "checkbox")
                return false
            if cur_val isnt new_val
                changed = true
        return changed

    render: ->
        if misc.is_zero_map(@props.upgrades_you_can_use)
            # user has no upgrades on their account
            <NoUpgrades cancel={@props.cancel_upgrading} />
        else
            {limits, remaining, current, totals, proj_remainder} = @get_quota_info()

            <Alert bsStyle='warning' style={@props.style}>
                {<React.Fragment>
                    <h3><Icon name='arrow-circle-up' /> Adjust your project quota contributions</h3>

                    <span style={color:"#666"}>Adjust <i>your</i> contributions to the quotas on this project (disk space, memory, cores, etc.).  The total quotas for this project are the sum of the contributions of all collaborators and the free base quotas.  Go to "Account --> Upgrades" to see how your upgrades are currently allocated.
                    </span>
                    <hr/>
                </React.Fragment> if not @props.omit_header}
                <Row>
                    <Col md={2}>
                        <b style={fontSize:'12pt'}>Quota</b>
                    </Col>
                    <Col md={4}>
                        <Button
                            bsSize  = 'xsmall'
                            onClick = {@max_upgrades}
                            style   = {padding:'0px 5px'}
                        >
                            Max All Upgrades
                        </Button>
                        {' '}
                        <Button
                            bsSize  = 'xsmall'
                            onClick = {@clear_upgrades}
                            style   = {padding:'0px 5px'}
                        >
                            Remove All Upgrades
                        </Button>
                    </Col>
                    <Col md={6}>
                        <b style={fontSize:'12pt'}>Your contribution</b>
                    </Col>
                </Row>
                <hr/>

                {@render_upgrade_row(n, @props.quota_params[n], remaining[n], current[n], limits[n], totals[n], proj_remainder[n]) for n in PROJECT_UPGRADES.field_order}
                <UpgradeRestartWarning />
                {@props.children}
                <ButtonToolbar style={marginTop:'10px'}>
                    <Button
                        bsStyle  = 'success'
                        onClick  = {=>@save_upgrade_quotas(remaining)}
                        disabled = {@props.disable_submit or not @valid_changed_upgrade_inputs(current, limits)}
                    >
                        <Icon name='arrow-circle-up' /> {if @props.submit_text then @props.submit_text else "Save Changes"}
                    </Button>
                    <Button onClick={@props.cancel_upgrading}>
                        Cancel
                    </Button>
                </ButtonToolbar>
            </Alert>


# Takes a value and makes it highlight on click
# Has a copy to clipboard button by default on the end
# See prop descriptions for more details
exports.CopyToClipBoard = rclass
    propTypes:
        value         : rtypes.string
        button_before : rtypes.element # Optional button to place before the copy text
        hide_after    : rtypes.bool    # Hide the default after button

    getInitialState: ->
        show_tooltip : false

    on_button_click: (e) ->
        @setState(show_tooltip : true)
        setTimeout(@close_tool_tip, 2000)
        copy_to_clipboard(@props.value)

    close_tool_tip: ->
        return if not @state.show_tooltip
        @setState(show_tooltip : false)

    render_button_after: ->
        <InputGroup.Button>
            <Overlay
                show      = {@state.show_tooltip}
                target    = {() => ReactDOM.findDOMNode(@refs.clipboard_button)}
                placement = 'bottom'
            >
                <Tooltip id='copied'>Copied!</Tooltip>
            </Overlay>
            <Button
                ref     = "clipboard_button"
                onClick = {@on_button_click}
            >
                <Icon name='clipboard'/>
            </Button>
        </InputGroup.Button>

    render: ->
        <FormGroup>
            <InputGroup>
                {<InputGroup.Button>
                    {@props.button_before}
                </InputGroup.Button> if @props.button_before?}
                <FormControl
                    type     = "text"
                    readOnly = {true}
                    style    = {cursor:"default"}
                    onClick  = {(e)=>e.target.select()}
                    value    = {@props.value}
                />
                {@render_button_after() unless @props.hide_after}
            </InputGroup>
        </FormGroup>

# See https://getbootstrap.com/docs/3.3/css/
# HiddenXS = hide if width < 768px
exports.HiddenXS = rclass
    render: ->
        <span className={'hidden-xs'}>
            {@props.children}
        </span>

# VisibleMDLG = visible on medium or large devices (anything with width > 992px)
exports.VisibleMDLG = VisibleMDLG = rclass
    render: ->
        <span className={'visible-md-inline visible-lg-inline'}>
            {@props.children}
        </span>

# VisibleMDLG = visible on medium or large devices (anything with width > 992px)
exports.VisibleLG = rclass
    render: ->
        <span className={'visible-lg-inline'}>
            {@props.children}
        </span>

# Error boundry. Pass components in as children to create one.
# https://reactjs.org/blog/2017/07/26/error-handling-in-react-16.html
exports.ErrorBoundary = rclass
    displayName: 'Error-Boundary'

    getInitialState: ->
        error : undefined
        info  : undefined

    componentDidCatch: (error, info) ->
        reportException(error,"render error",null,info)
        @setState
            error : error
            info  : info

    render: ->
        # This is way worse than nothing, because it surpresses reporting the actual error to the
        # backend!!!  I'm disabling it completely.
        return @props.children
        if @state.info?
            <Alert
                bsStyle = 'warning'
                style   = {margin:'15px'}
            >
                <h2 style={color:'rgb(217, 83, 79)'}>
                    <Icon name='bug'/> You have just encountered a bug in CoCalc.  This is not your fault.
                </h2>
                <h4>
                    {"You will probably have to refresh your browser to continue."}
                </h4>
                {"We have been notified of this error; however, if this bug is causing you significant trouble, file a support ticket:"}
                <br/>
                <br/>
                <Button onClick={=>redux.getActions('support').show(true)}>
                    Create Ticket
                </Button>
                <br/>
                <br/>
                <details style={whiteSpace:'pre-wrap', cursor:'pointer'} >
                    <summary>Stack trace (in case you are curious)</summary>
                    <div style={cursor:'pointer'} >
                        {@state.error?.toString()}
                        <br/>
                        {@state.info.componentStack}
                    </div>
                </details>
            </Alert>
        else
            @props.children
