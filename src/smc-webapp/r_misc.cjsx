###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
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

{React, ReactDOM, rclass, rtypes, is_redux, is_redux_actions, redux} = require('./smc-react')
{Alert, Button, ButtonToolbar, Checkbox, Col, FormControl, FormGroup, ControlLabel, InputGroup, OverlayTrigger, Popover, Tooltip, Row, Well} = require('react-bootstrap')
{HelpEmailLink, SiteName, CompanyName, PricingUrl, PolicyTOSPageUrl, PolicyIndexPageUrl, PolicyPricingPageUrl} = require('./customize')

# injected by webpack, but not for react-static renderings (ATTN don't assign to uppercase vars!)
smc_version = SMC_VERSION ? 'N/A'
build_date  = BUILD_DATE  ? 'N/A'
smc_git_rev = SMC_GIT_REV ? 'N/A'

Combobox    = require('react-widgets/lib/Combobox')

misc        = require('smc-util/misc')
immutable   = require('immutable')
underscore  = require('underscore')

markdown    = require('./markdown')

# base unit in pixel for margin/size/padding
exports.UNIT = UNIT = 15

# bootstrap blue background
exports.BS_BLUE_BGRND = "rgb(66, 139, 202)"

exports.SAGE_LOGO_COLOR = exports.BS_BLUE_BGRND

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

exports.Space = Space = ->
    <span>&nbsp</span>

# Font Awesome component -- obviously TODO move to own file
# Converted from https://github.com/andreypopp/react-fa
exports.Icon = Icon = rclass
    displayName : 'Icon'

    propTypes :
        name       : rtypes.string
        size       : rtypes.oneOf(['lg', '2x', '3x', '4x', '5x'])
        rotate     : rtypes.oneOf(['45', '90', '135', '180', '225', '270', '315'])
        flip       : rtypes.oneOf(['horizontal', 'vertical'])
        spin       : rtypes.bool
        fixedWidth : rtypes.bool
        stack      : rtypes.oneOf(['1x', '2x'])
        inverse    : rtypes.bool
        className  : rtypes.string
        style      : rtypes.object
        onClick    : rtypes.func
        onMouseOver: rtypes.func
        onMouseOut : rtypes.func

    getDefaultProps: ->
        name    : 'square-o'
        onClick : ->

    render: ->
        {name, size, rotate, flip, spin, fixedWidth, stack, inverse, className, style} = @props
        # temporary until file_associations can be changed
        if name.slice(0, 3) == 'fa-'
            classNames = "fa #{name}"
        else
            classNames = "fa fa-#{name}"
        if size
            classNames += " fa-#{size}"
        if rotate
            classNames += " fa-rotate-#{rotate}"
        if flip
            classNames += " fa-flip-#{flip}"
        if fixedWidth
            classNames += ' fa-fw'
        if spin
            classNames += ' fa-spin'
        if stack
            classNames += " fa-stack-#{stack}"
        if inverse
            classNames += ' fa-inverse'
        if className
            classNames += " #{className}"
        return <i style={style} className={classNames} onMouseOver={@props.onMouseOver} onMouseOut={@props.onMouseOut} onClick={@props.onClick}>{@props.children}</i>

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

exports.Loading = Loading = rclass
    displayName : 'Misc-Loading'

    render: ->
        <span><Icon name='circle-o-notch' spin /> Loading...</span>

exports.Saving = Saving = rclass
    displayName : 'Misc-Saving'

    render: ->
        <span><Icon name='circle-o-notch' spin /> Saving...</span>

closex_style =
    float      : 'right'
    marginLeft : '5px'

exports.CloseX = CloseX = rclass
    displayName : 'Misc-CloseX'

    propTypes :
        on_close : rtypes.func.isRequired
        style    : rtypes.object   # optional style for the icon itself

    render:->
        <a href='' style={closex_style} onClick={(e)=>e.preventDefault();@props.on_close()}>
            <Icon style={@props.style} name='times' />
        </a>


error_text_style =
    marginRight : '1ex'
    whiteSpace  : 'pre-line'
    maxWidth    : '80ex'

exports.ErrorDisplay = ErrorDisplay = rclass
    displayName : 'Misc-ErrorDisplay'

    propTypes :
        error   : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired
        title   : rtypes.string
        style   : rtypes.object
        bsStyle : rtypes.string
        onClose : rtypes.func       # TODO: change to on_close everywhere...?

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
        if typeof(@props.error) == 'string'
            error = @props.error
        else
            error = misc.to_json(@props.error)
        bsStyle = @props.bsStyle ? 'danger'
        <Alert bsStyle={bsStyle} style={style}>
            {@render_close_button() if @props.onClose?}
            {@render_title() if @props.title}
            {error}
        </Alert>

exports.Footer = rclass
    displayName : "Footer"

    mixins: [ImmutablePureRenderMixin]

    render: ->
        <footer style={fontSize:"small",color:"gray",textAlign:"center",padding: "#{2*UNIT}px 0" }>
            <hr/>
            <Space/>
            <SiteName/> by <CompanyName/>
            {' '} &middot; {' '}
            <a target="_blank" href=PolicyIndexPageUrl>Policies</a>
            {' '} &middot; {' '}
            <a target="_blank" href=PolicyTOSPageUrl>Terms of Service</a>
            {' '} &middot; {' '}
            <HelpEmailLink />
            {' '} &middot; {' '}
            <span title="Version #{smc_version} @ #{build_date} | #{smc_git_rev[..8]}">&copy; {misc.YEAR}</span>
        </footer>


exports.MessageDisplay = MessageDisplay = rclass
    displayName : 'Misc-MessageDisplay'

    propTypes :
        message : rtypes.string
        onClose : rtypes.func

    render: ->
        <Row style={backgroundColor:'white', margin:'1ex', padding:'1ex', border:'1px solid lightgray', dropShadow:'3px 3px 3px lightgray', borderRadius:'3px'}>
            <Col md=8 xs=8>
                <span style={color:'gray', marginRight:'1ex'}>{@props.message}</span>
            </Col>
            <Col md=4 xs=4>
                <Button className='pull-right' onClick={@props.onClose} bsSize='small'>
                    <Icon name='times' />
                </Button>
            </Col>
        </Row>

exports.SelectorInput = SelectorInput = rclass
    displayName : 'Misc-SelectorInput'

    propTypes :
        selected  : rtypes.string
        on_change : rtypes.func
        disabled  : rtypes.bool
        #options   : array or object

    render_options: ->
        if misc.is_array(@props.options)
            if @props.options.length > 0 and typeof(@props.options[0]) == 'string'
                i = 0
                v = []
                for x in @props.options
                    v.push(<option key={i} value={x}>{x}</option>)
                    i += 1
                return v
            else
                for x in @props.options
                    <option key={x.value} value={x.value}>{x.display}</option>
        else
            v = misc.keys(@props.options); v.sort()
            for value in v
                display = @props.options[value]
                <option key={value} value={value}>{display}</option>

    render: ->
        <FormGroup>
            <FormControl
                value          = {@props.selected}
                componentClass = 'select'
                ref            = 'input'
                onChange       = {=>@props.on_change?(ReactDOM.findDOMNode(@refs.input).value)}
                disabled       = {@props.disabled}
            >
                {@render_options()}
            </FormControl>
        </FormGroup>

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
            <Button  style={marginBottom:'15px'} bsStyle='success' onClick={@saveChange}><Icon name='save' /> Save</Button>

    render_input: ->
        <FormGroup>
            <FormControl type={@props.type ? 'text'} ref='input' rows={@props.rows}
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
        number      : rtypes.number.isRequired
        min         : rtypes.number.isRequired
        max         : rtypes.number.isRequired
        on_change   : rtypes.func.isRequired
        unit        : rtypes.string
        disabled    : rtypes.bool

    componentWillReceiveProps: (next_props) ->
        if @props.number != next_props.number
            # so when the props change the state stays in sync (e.g., so save button doesn't appear, etc.)
            @setState(number : next_props.number)

    getInitialState: ->
        number : @props.number

    saveChange: (e) ->
        e?.preventDefault()
        n = parseInt(@state.number)
        if "#{n}" == "NaN"
            n = @props.number
        if n < @props.min
            n = @props.min
        else if n > @props.max
            n = @props.max
        @setState(number:n)
        @props.on_change(n)

    render_save_button: ->
        if @state.number? and @state.number != @props.number
            <Button className='pull-right' bsStyle='success' onClick={@saveChange}><Icon name='save' /> Save</Button>

    render: ->
        unit = if @props.unit? then "#{@props.unit}" else ''
        <Row>
            <Col xs=6>
                <form onSubmit={@saveChange}>
                    <FormGroup>
                        <FormControl
                            type     = 'text'
                            ref      = 'input'
                            value    = {if @state.number? then @state.number else @props.number}
                            onChange = {=>@setState(number:ReactDOM.findDOMNode(@refs.input).value)}
                            onBlur   = {@saveChange}
                            onKeyDown= {(e)=>if e.keyCode == 27 then @setState(number:@props.number)}
                            disabled = {@props.disabled}
                        />
                    </FormGroup>
                </form>
            </Col>
            <Col xs=6 className="lighten">
                {unit}
            </Col>
        </Row>

exports.LabeledRow = LabeledRow = rclass
    displayName : 'Misc-LabeledRow'

    propTypes :
        label      : rtypes.any.isRequired
        style      : rtypes.object
        label_cols : rtypes.number    # number between 1 and 11 (default: 4)

    getDefaultProps: ->
        label_cols : 4

    render: ->
        <Row style={@props.style}>
            <Col xs={@props.label_cols}>
                {@props.label}
            </Col>
            <Col xs={12-@props.label_cols}>
                {@props.children}
            </Col>
        </Row>

help_text =
  backgroundColor: 'white'
  padding        : '10px'
  borderRadius   : '5px'
  margin         : '5px'

exports.Help = rclass
    displayName : 'Misc-Help'

    propTypes :
        button_label : rtypes.string.isRequired
        title        : rtypes.string.isRequired

    getDefaultProps: ->
        button_label : 'Help'
        title        : 'Help'

    getInitialState: ->
        closed : true

    render_title: ->
        <span>
            {@props.title}
        </span>

    render: ->
        if @state.closed
            <div>
                <Button bsStyle='info' onClick={=>@setState(closed:false)}><Icon name='question-circle'/> {@props.button_label}</Button>
            </div>
        else
            <Well style={width:500, zIndex:10, boxShadow:'3px 3px 3px #aaa', position:'absolute'} className='well'>
                <a href='' style={float:'right'} onClick={(e)=>e.preventDefault();@setState(closed:true)}><Icon name='times'/></a>
                <h4>{@props.title}
                </h4>
                <div style={help_text}>
                    {@props.children}
                </div>
            </Well>


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
exports.TimeAgo = rclass
    displayName : 'Misc-TimeAgo'

    propTypes :
        popover     : rtypes.bool
        placement   : rtypes.string

    getDefaultProps: ->
        popover   : true
        minPeriod : 45000
        placement : 'top'
        # critical to use minPeriod>>1000, or things will get really slow in the client!!
        # Also, given our custom formatter, anything more than about 45s is pointless (since we don't show seconds)

    render_timeago: (d) ->
        <TimeAgo title='' date={d} style={@props.style} formatter={timeago_formatter} minPeriod={@props.minPeriod} />

    render: ->
        d = if misc.is_date(@props.date) then @props.date else new Date(@props.date)
        if @props.popover
            s = d.toLocaleString()
            <Tip title={s} id={s} placement={@props.placement}>
                {@render_timeago(d)}
            </Tip>
        else
            @render_timeago(d)


# Important:
# widget can be controlled or uncontrolled -- use default_value for an *uncontrolled* widget
# with callbacks, and value for a controlled one!
#    See http://facebook.github.io/react/docs/forms.html#controlled-components

# Search input box with a clear button (that focuses!), enter to submit,
# escape to also clear.
exports.SearchInput = rclass
    displayName : 'Misc-SearchInput'

    propTypes :
        placeholder     : rtypes.string
        default_value   : rtypes.string
        value           : rtypes.string
        on_change       : rtypes.func    # called on_change(value, get_opts()) each time the search input changes
        on_submit       : rtypes.func    # called on_submit(value, get_opts()) when the search input is submitted (by hitting enter)
        on_escape       : rtypes.func    # called when user presses escape key; on_escape(value *before* hitting escape)
        autoFocus       : rtypes.bool
        autoSelect      : rtypes.bool
        on_up           : rtypes.func    # push up arrow
        on_down         : rtypes.func    # push down arrow
        clear_on_submit : rtypes.bool    # if true, will clear search box on submit (default: false)
        buttonAfter     : rtypes.object

    getInitialState: ->
        value     : @props.default_value ? ''
        ctrl_down : false

    get_opts: ->
        ctrl_down : @state.ctrl_down

    componentWillReceiveProps: (new_props) ->
        if new_props.value?
            @setState(value : new_props.value)

    componentDidMount: ->
        if @props.autoSelect
            ReactDOM.findDOMNode(@refs.input).select()

    clear_and_focus_search_input: ->
        @set_value('')
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
        @props.on_change?(@state.value, @get_opts())
        @props.on_submit?(@state.value, @get_opts())
        if @props.clear_on_submit
            @setState(value:'')

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
        @set_value('')

    render: ->
        <FormGroup>
            <InputGroup>
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

exports.MarkdownInput = rclass
    displayName : 'Misc-MarkdownInput'

    propTypes :
        default_value : rtypes.string
        on_change     : rtypes.func
        on_save       : rtypes.func   # called when saving from editing and switching back
        on_edit       : rtypes.func   # called when editing starts
        on_cancel     : rtypes.func   # called when cancel button clicked
        rows          : rtypes.number
        placeholder   : rtypes.string

    getInitialState: ->
        editing : false
        value   : undefined

    edit: ->
        @props.on_edit?()
        @setState(value:@props.default_value ? '', editing:true)

    cancel: ->
        @props.on_cancel?()
        @setState(editing:false)

    save: ->
        @props.on_save?(@state.value)
        @setState(editing:false)

    keydown: (e) ->
        if e.keyCode==27
            @setState(editing:false)
        else if e.keyCode==13 and e.shiftKey
            @save()

    to_html: ->
        if @props.default_value
            {__html: markdown.markdown_to_html(@props.default_value).s}
        else
            {__html: ''}

    render: ->
        if @state.editing

            tip = <span>
                You may enter (Github flavored) markdown here.  In particular, use # for headings, > for block quotes, *'s for italic text, **'s for bold text, - at the beginning of a line for lists, back ticks ` for code, and URL's will automatically become links.
            </span>

            <div>
                <ButtonToolbar style={paddingBottom:'5px'}>
                    <Button key='save' bsStyle='success' onClick={@save}
                            disabled={@state.value == @props.default_value}>
                        <Icon name='edit' /> Save
                    </Button>
                    <Button key='cancel' onClick={@cancel}>Cancel</Button>
                </ButtonToolbar>
                <form onSubmit={@save} style={marginBottom: '-20px'}>
                    <FormGroup>
                        <FormControl autoFocus
                            ref         = 'input'
                            componentClass = 'textarea'
                            rows        = {@props.rows ? 4}
                            placeholder = {@props.placeholder}
                            value       = {@state.value}
                            onChange    = {=>x=ReactDOM.findDOMNode(@refs.input).value; @setState(value:x); @props.on_change?(x)}
                            onKeyDown   = {@keydown}
                        />
                    </FormGroup>
                </form>
                <div style={paddingTop:'8px', color:'#666'}>
                    <Tip title='Use Markdown' tip={tip}>
                        Format using <a href='https://help.github.com/articles/getting-started-with-writing-and-formatting-on-github/' target='_blank'>Markdown</a>
                    </Tip>
                </div>
            </div>
        else
            <div>
                {<Button onClick={@edit}>Edit</Button>}
                <div onClick={@edit} dangerouslySetInnerHTML={@to_html()}></div>
            </div>

exports.Markdown = rclass
    displayName : 'Misc-Markdown'

    propTypes :
        value      : rtypes.string
        style      : rtypes.object
        project_id : rtypes.string   # optional -- can be used to improve link handling (e.g., to images)
        file_path  : rtypes.string   # optional -- ...
        className  : rtypes.string   # optional class

    shouldComponentUpdate: (newProps) ->
        return @props.value != newProps.value or not underscore.isEqual(@props.style, newProps.style)

    update_mathjax: ->
        if @_x?.has_mathjax?
            $(ReactDOM.findDOMNode(@)).mathjax()

    update_links: ->
        $(ReactDOM.findDOMNode(@)).process_smc_links(project_id:@props.project_id, file_path:@props.file_path)

    componentDidUpdate: ->
        @update_links()
        @update_mathjax()

    componentDidMount: ->
        @update_links()
        @update_mathjax()

    to_html: ->
        if @props.value
            # change escaped characters back for markdown processing
            v = @props.value.replace(/&gt;/g, '>').replace(/&lt;/g, '<')
            @_x = markdown.markdown_to_html(v)
            v = require('./misc_page').sanitize_html(v)
            {__html: @_x.s}
        else
            {__html: ''}

    render: ->
        <span
            className               = {@props.className}
            dangerouslySetInnerHTML = {@to_html()}
            style                   = {@props.style}>
        </span>

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
        activity : rtypes.array.isRequired   # array of strings
        trunc    : rtypes.number             # truncate activity messages at this many characters (default: 80)
        on_clear : rtypes.func               # if given, called when a clear button is clicked

    render_items: ->
        n = @props.trunc ? 80
        trunc = (s) -> misc.trunc(s, n)
        for desc, i in @props.activity
            <div key={i} style={activity_item_style} >
                <Icon name='circle-o-notch' spin /> {trunc(desc)}
            </div>

    render: ->
        if misc.len(@props.activity) > 0
            <div key='activity' style={activity_style}>
                {<CloseX on_close={@props.on_clear} /> if @props.on_clear?}
                {@render_items() if @props.activity.length > 0}
            </div>
        else
            <span />

exports.Tip = Tip = rclass
    displayName : 'Tip'

    propTypes :
        title     : rtypes.oneOfType([rtypes.string, rtypes.node]).isRequired
        placement : rtypes.string   # 'top', 'right', 'bottom', left' -- defaults to 'right'
        tip       : rtypes.oneOfType([rtypes.string, rtypes.node])
        size      : rtypes.string   # "xsmall", "small", "medium", "large"
        delayShow : rtypes.number
        delayHide : rtypes.number
        rootClose : rtypes.bool
        icon      : rtypes.string
        id        : rtypes.string   # can be used for screen readers (otherwise defaults to title)
        style     : rtypes.object

    getDefaultProps: ->
        placement : 'right'
        delayShow : 500
        delayHide : 100
        rootClose : false

    render_title: ->
        <span>{<Icon name={@props.icon}/> if @props.icon} {@props.title}</span>

    render_popover: ->
        if @props.tip
            <Popover
                bsSize = {@props.size}
                title  = {@render_title()}
                id     = {@props.id ? "tip"}
                style  = {zIndex:'1000'}
            >
                <span style={wordWrap:'break-word'}>
                    {@props.tip}
                </span>
            </Popover>
        else
            <Tooltip
                bsSize = {@props.size}
                id     = {@props.id ? "tip"}
                style  = {zIndex:'1000'}
            >
                {@render_title()}
            </Tooltip>

    render: ->
        <OverlayTrigger
            placement = {@props.placement}
            overlay   = {@render_popover()}
            delayShow = {@props.delayShow}
            delayHide = {@props.delayHide}
            rootClose = {@props.rootClose}
            >
            <span style={@props.style}>{@props.children}</span>
        </OverlayTrigger>

exports.SaveButton = rclass
    displayName : 'Misc-SaveButton'

    propTypes :
        unsaved  : rtypes.bool
        disabled : rtypes.bool
        on_click : rtypes.func.isRequired

    render: ->
        <Button bsStyle='success' disabled={@props.saving or not @props.unsaved} onClick={@props.on_click}>
            <Icon name='save' /> Sav{if @props.saving then <span>ing... <Icon name='circle-o-notch' spin /></span> else <span>e</span>}
        </Button>

exports.FileLink = rclass
    displayName : 'Misc-FileLink'

    propTypes :
        path         : rtypes.string.isRequired
        display_name : rtypes.string # if provided, show this as the link and show real name in popover
        full         : rtypes.bool   # true = show full path, false = show only basename
        trunc        : rtypes.number # truncate longer names and show a tooltip with the full name
        style        : rtypes.object
        link         : rtypes.bool   # set to false to make it not be a link
        actions      : rtypes.object.isRequired

    getDefaultProps: ->
        style : {}
        full  : false
        link  : true

    handle_click: (e) ->
        e.preventDefault()
        if misc.endswith(@props.path, '/')
            @props.actions.open_directory(@props.path)
        else
            @props.actions.open_file
                path       : @props.path
                foreground : misc.should_open_in_foreground(e)


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
globalizeLocalizer = require('react-widgets/lib/localizers/globalize')
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
        value     : rtypes.oneOfType([rtypes.string, rtypes.object])
        on_change : rtypes.func.isRequired

    render: ->
        <DateTimePicker
            step       = {60}
            editFormat = {'MMM d, yyyy h:mm tt'}
            parse      = {DATETIME_PARSE_FORMATS}
            value      = {@props.value}
            onChange   = {@props.on_change}
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

# WARNING: the keys of the input components must not be small negative integers
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

#onChange     = {(value) => @props.on_change(value.trim()); console.log(value)}

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
    {salvus_client} = require('./salvus_client')
    return salvus_client.server_time() <= misc.months_before(-3, pay)  # require subscription until 3 months after start (an estimate for when class ended, and less than when what student did pay for will have expired).

project_warning_opts = (opts) ->
    {upgrades_you_can_use, upgrades_you_applied_to_all_projects, course_info, account_id, email_address, upgrade_type} = opts
    total = upgrades_you_can_use?[upgrade_type] ? 0
    used  = upgrades_you_applied_to_all_projects?[upgrade_type] ? 0
    x =
        total          : total
        used           : used
        avail          : total - used
        course_warning : exports.course_warning(course_info?.get?('pay'))  # no *guarantee* that course_info is immutable.js since just comes from database
        course_info    : opts.course_info
        account_id     : account_id
        email_address  : email_address
    return x

exports.CourseProjectWarning = (opts) ->
    {total, used, avail, course_info, course_warning, account_id, email_address} = project_warning_opts(opts)
    if not course_warning
        # nothing
        return <span></span>
    # We may now assume course_info.get is defined, since course_warning is only true if it is.
    pay = course_info.get('pay')
    billing = require('./billing')
    if avail > 0
        action = <billing.BillingPageLink text="move this project to a members only server" />
    else
        action = <billing.BillingPageLink text="buy a course subscription" />
    is_student = account_id == course_info.get('account_id') or email_address == course_info.get('email_address')
    {salvus_client} = require('./salvus_client')
    if pay > salvus_client.server_time()  # in the future
        if is_student
            deadline  = <span>Your instructor requires you to {action} within <TimeAgo date={pay}/>.</span>
        else
            deadline = <span>Your student must buy a course subscription within <TimeAgo date={pay}/>.</span>
        style = 'warning'
        label = 'Warning'
    else
        if is_student
            deadline  = <span>Your instructor requires you to {action} now to continuing using this project.</span>
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
    if course_warning
        return exports.CourseProjectWarning(opts)

    if avail > 0
        # have upgrade available
        suggestion = <span><b><i>You have {avail} unused members-only hosting {misc.plural(avail,'upgrade')}</i></b>.  Click 'Adjust your quotas...' below.</span>
    else if avail <= 0
        url = PolicyPricingPageUrl
        if total > 0
            suggestion = <span>Your {total} members-only hosting {misc.plural(total,'upgrade')} are already in use on other projects.  You can <a href={url} target='_blank' style={cursor:'pointer'}>purchase further upgrades </a> by adding a subscription (you can add the same subscription multiple times), or disable member-only hosting for another project to free a spot up for this one.</span>
        else
            suggestion = <span><Space /><a href={url} target='_blank' style={cursor:'pointer'}>Subscriptions start at only $7/month.</a></span>

    <Alert bsStyle='warning' style={marginTop:'10px'}>
        <h4><Icon name='exclamation-triangle'/>  Warning: this project is <strong>running on a free server</strong></h4>
        <p>
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
            suggestion = <span><Space /><a href={url} target='_blank' style={cursor:'pointer'}>Subscriptions start at only $7/month.</a></span>

    <Alert bsStyle='warning' style={marginTop:'10px'}>
        <h4><Icon name='exclamation-triangle'/>  Warning: this project <strong>does not have full internet access</strong></h4>
        <p>
            Projects without internet access enabled, cannot connect to external websites or download software packages.
            {suggestion}
        </p>
    </Alert>

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
        state : rtypes.string

    getDefaultProps: ->
        state : 'unknown'

    render_spinner:  ->
        <span>... <Icon name='circle-o-notch' spin /></span>

    render: ->
        s = COMPUTE_STATES[@props.state]
        if not s?
            return <Loading />
        {display, desc, icon, stable} = s
        <Tip title={display} tip={desc}>
            <Icon name={icon} /> {display} {@render_spinner() if not stable}
        </Tip>


# info button inside the editor when editing a file. links you back to the file listing with the action prompted
# TODO: move this somewhere else once editor is rewritten
{DropdownButton, MenuItem} = require('react-bootstrap')
EditorFileInfoDropdown = rclass
    displayName : 'Misc-EditorFileInfoDropdown'

    propTypes :
        filename  : rtypes.string.isRequired # expects the full path name
        actions   : rtypes.object.isRequired
        is_public : rtypes.bool

    getDefaultProps: ->
        is_public : false

    handle_click: (name) ->
        @props.actions.open_directory(misc.path_split(@props.filename).head)
        @props.actions.set_all_files_unchecked()
        @props.actions.set_file_checked(@props.filename, true)
        @props.actions.set_file_action(name)

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
            items =
                'download' : 'cloud-download'
                'delete'   : 'trash-o'
                'rename'   : 'pencil'
                'move'     : 'arrows'
                'copy'     : 'files-o'
                'share'    : 'share-square-o'

        for name, icon of items
            @render_menu_item(name, icon)

    render_dropdown_button: (bsSize, className) ->
        <DropdownButton style={marginRight:'2px'} id='file_info_button' bsStyle='info' bsSize={bsSize} title={<Icon name='info-circle' />} className={className}>
            {@render_menu_items()}
        </DropdownButton>

    render: ->
        <div>
            {@render_dropdown_button('large', 'pull-left visible-xs')}
            {@render_dropdown_button(null, 'pull-left hidden-xs')}
        </div>

exports.render_file_info_dropdown = (filename, actions, dom_node, is_public) ->
    ReactDOM.render(<EditorFileInfoDropdown filename={filename} actions={actions} is_public={is_public} />, dom_node)

exports.UPGRADE_ERROR_STYLE = UPGRADE_ERROR_STYLE =
    color        : 'white'
    background   : 'red'
    padding      : '1ex'
    borderRadius : '3px'
    fontWeight   : 'bold'
    marginBottom : '1em'

{PROJECT_UPGRADES} = require('smc-util/schema')

NoUpgrades = rclass
    displayName : 'NoUpgrades'

    propTypes :
        cancel : rtypes.func.isRequired

    billing: (e) ->
        e.preventDefault()
        require('./billing').visit_billing_page()

    render: ->
        <Alert bsStyle='info'>
            <h3><Icon name='exclamation-triangle' /> Your account has no upgrades available</h3>
            <p>You can purchase upgrades starting at $7 / month.</p>
            <p><a href='' onClick={@billing}>Visit the billing page...</a></p>
            <Button onClick={@props.cancel}>Cancel</Button>
        </Alert>

###
 Takes current upgrades data and quota parameters and provides an interface for the user to update these parameters.
 submit_upgrade_quotas will recieve a javascript object in the same format as quota_params
 cancel_upgrading takes no arguments and is called when the cancel button is hit.
###
exports.UpgradeAdjustor = rclass
    displayName : 'UpgradeAdjustor'

    propTypes :
        quota_params                         : rtypes.object.isRequired # from the schema
        submit_upgrade_quotas                : rtypes.func.isRequired
        cancel_upgrading                     : rtypes.func.isRequired
        disable_submit                       : rtypes.bool
        upgrades_you_can_use                 : rtypes.object
        upgrades_you_applied_to_all_projects : rtypes.object
        upgrades_you_applied_to_this_project : rtypes.object

    getDefaultProps: ->
        upgrades_you_can_use                 : {}
        upgrades_you_applied_to_all_projects : {}
        upgrades_you_applied_to_this_project : {}

    getInitialState: ->
        state = {}

        current = @props.upgrades_you_applied_to_this_project

        for name, data of @props.quota_params
            factor = data.display_factor
            current_value = current[name] ? 0
            state["upgrade_#{name}"] = misc.round2(current_value * factor)

        return state

     get_quota_info : ->
        # how much upgrade you currently use on this one project
        current = @props.upgrades_you_applied_to_this_project
        # how much unused upgrade you have remaining
        remaining = misc.map_diff(@props.upgrades_you_can_use, @props.upgrades_you_applied_to_all_projects)
        # maximums you can use, including the upgrades already on this project
        limits = misc.map_sum(current, remaining)
        # additionally, the limits are capped by the maximum per project
        maximum = require('smc-util/schema').PROJECT_UPGRADES.max_per_project
        limits = misc.map_limit(limits, maximum)

        limits    : limits
        remaining : remaining
        current   : current

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

    render_upgrade_row: (name, data, remaining=0, current=0, limit=0) ->
        if not data?
            return

        {display, desc, display_factor, display_unit, input_type} = data

        if input_type == 'checkbox'

            # the remaining count should decrease if box is checked
            val = @state["upgrade_#{name}"]
            show_remaining = remaining + current - val
            show_remaining = Math.max(show_remaining, 0)

            if not @is_upgrade_input_valid(val, limit)
                label = <div style=UPGRADE_ERROR_STYLE>Uncheck this: you do not have enough upgrades</div>
            else
                label = if val == 0 then 'Enable' else 'Enabled'

            <Row key={name} style={marginTop:'5px'}>
                <Col sm=6>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong>
                    </Tip>
                    <br/>
                    You have {show_remaining} unallocated {misc.plural(show_remaining, display_unit)}
                </Col>
                <Col sm=6>
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
            display_current = current * display_factor # current already applied
            if current != 0 and misc.round2(display_current) != 0
                current = misc.round2(display_current)
            else
                current = display_current

            limit = misc.round2(limit * display_factor)
            current_input = misc.parse_number_input(@state["upgrade_#{name}"]) ? 0 # current typed in

            # the amount displayed remaining subtracts off the amount you type in
            show_remaining = misc.round2(remaining + current - current_input)

            val = @state["upgrade_#{name}"]
            if not @is_upgrade_input_valid(val, limit)
                bs_style = 'error'
                if misc.parse_number_input(val)?
                    label = <div style=UPGRADE_ERROR_STYLE>Value too high: not enough upgrades or exceeding limit</div>
                else
                    label = <div style=UPGRADE_ERROR_STYLE>Please enter a number</div>
            else
                label = <span></span>

            remaining_all = Math.max(show_remaining, 0)
            schema_limit = PROJECT_UPGRADES.max_per_project
            display_factor = PROJECT_UPGRADES.params[name].display_factor
            # calculates the amount of remaining quotas: limited by the max upgrades and subtract the already applied quotas
            total_limit = schema_limit[name]*display_factor

            unit = misc.plural(show_remaining, display_unit)
            if total_limit < remaining
                remaining_note = <span> You have {remaining_all} unallocated {unit} (you may allocate up to {total_limit} {unit} here)</span>

            else
                remaining_note = <span>You have {remaining_all} unallocated {unit}</span>

            <Row key={name} style={marginTop:'5px'}>
                <Col sm=6>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong>
                    </Tip>
                    <br/>
                    {remaining_note}
                </Col>
                <Col sm=6>
                    <FormGroup>
                        <InputGroup>
                            <FormControl
                                ref        = {"upgrade_#{name}"}
                                type       = 'text'
                                value      = {val}
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
            if not new_val? or new_val > limit
                return false
            if cur_val isnt new_val
                changed = true
        return changed

    render: ->
        if misc.is_zero_map(@props.upgrades_you_can_use)
            # user has no upgrades on their account
            <NoUpgrades cancel={@props.cancel_upgrading} />
        else
            # NOTE : all units are currently 'internal' instead of display, e.g. seconds instead of hours
            quota_params = @props.quota_params
            # how much upgrade you have used between all projects
            used_upgrades = @props.upgrades_you_applied_to_all_projects
            # how much upgrade you currently use on this one project
            current = @props.upgrades_you_applied_to_this_project
            # how much unused upgrade you have remaining
            remaining = misc.map_diff(@props.upgrades_you_can_use, used_upgrades)
            # maximums you can use, including the upgrades already on this project
            limits = misc.map_sum(current, remaining)
            # additionally, the limits are capped by the maximum per project
            maximum = require('smc-util/schema').PROJECT_UPGRADES.max_per_project
            limits = misc.map_limit(limits, maximum)

            <Alert bsStyle='warning'>
                <h3><Icon name='arrow-circle-up' /> Adjust your project quota contributions</h3>

                <span style={color:"#666"}>Adjust <i>your</i> contributions to the quotas on this project (disk space, memory, cores, etc.).  The total quotas for this project are the sum of the contributions of all collaborators and the free base quotas.</span>
                <hr/>
                <Row>
                    <Col md=1>
                        <b style={fontSize:'12pt'}>Quota</b>
                    </Col>
                    <Col md=5>
                        <Button
                            bsSize  = 'xsmall'
                            onClick = {@max_upgrades}
                            style   = {padding:'0px 5px'}
                        >
                            Max all upgrades
                        </Button>
                        {' '}
                        <Button
                            bsSize  = 'xsmall'
                            onClick = {@clear_upgrades}
                            style   = {padding:'0px 5px'}
                        >
                            Remove all upgrades
                        </Button>
                    </Col>
                    <Col md=6>
                        <b style={fontSize:'12pt'}>Your contribution</b>
                    </Col>
                </Row>
                <hr/>

                {@render_upgrade_row(n, quota_params[n], remaining[n], current[n], limits[n]) for n in PROJECT_UPGRADES.field_order}
                {@props.children}
                <ButtonToolbar style={marginTop:'10px'}>
                    <Button
                        bsStyle  = 'success'
                        onClick  = {=>@save_upgrade_quotas(remaining)}
                        disabled = {@props.disable_submit or not @valid_changed_upgrade_inputs(current, limits)}
                    >
                        <Icon name='arrow-circle-up' /> {if @props.submit_text then @props.submit_text else "Submit changes"}
                    </Button>
                    <Button onClick={@props.cancel_upgrading}>
                        Cancel
                    </Button>
                </ButtonToolbar>
            </Alert>


###
Drag'n'Drop dropzone area
###
ReactDOMServer = require('react-dom/server')   # for dropzone below
Dropzone       = require('react-dropzone-component')

exports.SMC_Dropzone = rclass
    displayName: 'SMC_Dropzone'

    propTypes:
        project_id           : rtypes.string.isRequired
        current_path         : rtypes.string.isRequired
        dropzone_handler     : rtypes.object.isRequired

    dropzone_template : ->
        <div className='dz-preview dz-file-preview'>
            <div className='dz-details'>
                <div className='dz-filename'><span data-dz-name></span></div>
                <img data-dz-thumbnail />
            </div>
            <div className='dz-progress'><span className='dz-upload' data-dz-uploadprogress></span></div>
            <div className='dz-success-mark'><span><Icon name='check'></span></div>
            <div className='dz-error-mark'><span><Icon name='times'></span></div>
            <div className='dz-error-message'><span data-dz-errormessage></span></div>
        </div>

    postUrl : ->
        dest_dir = misc.encode_path(@props.current_path)
        postUrl  = window.smc_base_url + "/upload?project_id=#{@props.project_id}&dest_dir=#{dest_dir}"
        return postUrl

    render: ->
        <div>
            {<div className='close-button pull-right'>
                <span
                    onClick={@props.close_button_onclick}
                    className='close-button-x'
                    style={cursor: 'pointer', fontSize: '18px', color:'gray'}><i className="fa fa-times"></i></span>
            </div> if @props.close_button_onclick?}
            <Tip icon='file' title='Drag and drop files' placement='top'
                tip='Drag and drop files from your computer into the box below to upload them into your project.  You can upload individual files that are up to 30MB in size.'>
                <h4 style={color:"#666"}>Drag and drop files (Currently, each file must be under 30MB; for bigger files, use SSH as explained in project settings.)</h4>
            </Tip>
            <div style={border: '2px solid #ccc', boxShadow: '4px 4px 2px #bbb', borderRadius: '5px', padding: 0, margin: '10px'}>
                <Dropzone
                    config        = {postUrl: @postUrl()}
                    eventHandlers = {@props.dropzone_handler}
                    djsConfig     = {previewTemplate: ReactDOMServer.renderToStaticMarkup(@dropzone_template())} />
            </div>
        </div>