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

{Alert, Button, ButtonToolbar, Col, Input, OverlayTrigger, Popover, Row, Well} = require('react-bootstrap')

misc = require('misc')

# Font Awesome component -- obviously TODO move to own file
# Converted from https://github.com/andreypopp/react-fa
exports.Icon = Icon = rclass
    displayName : "Icon"

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
        return <i style={style} className={classNames}></i>

exports.Loading = Loading = rclass
    displayName : "Misc-Loading"
    render : ->
        <span><Icon name="circle-o-notch" spin /> Loading...</span>

exports.Saving = Saving = rclass
    displayName : "Misc-Saving"
    render : ->
        <span><Icon name="circle-o-notch" spin /> Saving...</span>

closex_style =
    float      : 'right'
    marginLeft : '5px'

exports.CloseX = CloseX = rclass
    displayName : "Misc-CloseX"

    propTypes:
        on_close : rtypes.func.isRequired
        style    : rtypes.object   # optional style for the icon itself

    render :->
        <a href='' style={closex_style} onClick={(e)=>e.preventDefault();@props.on_close()}>
            <Icon style={@props.style} name='times' />
        </a>


error_text_style =
    marginRight : '1ex'
    whiteSpace  : 'pre-line'

exports.ErrorDisplay = ErrorDisplay = rclass
    displayName : "Misc-ErrorDisplay"

    propTypes:
        error   : rtypes.string.isRequired
        style   : rtypes.object
        onClose : rtypes.func       # TODO: change to on_close everywhere...?

    render_close_button: ->
        <CloseX on_close={@props.onClose} style={fontSize:'11pt'} />

    render : ->
        if @props.style?
            style = misc.copy(error_text_style)
            misc.merge(style, @props.style)
        else
            style = error_text_style
        <Alert bsStyle='danger' style={style}>
            {@render_close_button() if @props.onClose?}
            {@props.error}
        </Alert>


exports.MessageDisplay = MessageDisplay = rclass
    propTypes:
        message : rtypes.string
        onClose : rtypes.func
    render : ->
        <Row style={backgroundColor:'white', margin:'1ex', padding:'1ex', border:'1px solid lightgray', dropShadow:'3px 3px 3px lightgray', borderRadius:'3px'}>
            <Col md=8 xs=8>
                <span style={color:'gray', marginRight:'1ex'}>{@props.message}</span>
            </Col>
            <Col md=4 xs=4>
                <Button className="pull-right" onClick={@props.onClose} bsSize="small">
                    <Icon name='times' />
                </Button>
            </Col>
        </Row>

exports.SelectorInput = SelectorInput = rclass
    displayName : "Misc-SelectorInput"
    propTypes:
        selected  : rtypes.string
        on_change : rtypes.func
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
        <Input value={@props.selected} defaultValue={@props.selected} type='select' ref='input'
               onChange={=>@props.on_change?(@refs.input.getValue())}>
            {@render_options()}
        </Input>

exports.TextInput = rclass
    displayName : "Misc-TextInput"
    propTypes:
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

    render_save_button : ->
        if @state.text? and @state.text != @props.text
            <Button  style={marginBottom:'15px'} bsStyle='success' onClick={@saveChange}><Icon name='save' /> Save</Button>

    render_input: ->
        <Input type={@props.type ? "text"} ref="input" rows={@props.rows}
                   value={if @state.text? then @state.text else @props.text}
                   onChange={=>@setState(text:@refs.input.getValue())}
            />

    render : ->
        <form onSubmit={@saveChange}>
            {@render_input()}
            {@render_save_button()}
        </form>

exports.NumberInput = NumberInput = rclass
    displayName : "Misc-NumberInput"
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
            <Button className="pull-right" bsStyle='success' onClick={@saveChange}><Icon name='save' /> Save</Button>

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
    displayName : "Misc-LabeledRow"
    propTypes:
        label : rtypes.string.isRequired
        style : rtypes.object
    render : ->
        <Row style={@props.style}>
            <Col xs=4>
                {@props.label}
            </Col>
            <Col xs=8>
                {@props.children}
            </Col>
        </Row>

help_text =
  backgroundColor: 'white'
  padding        : '10px'
  borderRadius   : '5px'
  margin         : '5px'

exports.Help = rclass
    displayName : "Misc-Help"
    propTypes:
        button_label : rtypes.string.isRequired
        title        : rtypes.string.isRequired
    getDefaultProps: ->
        button_label : "Help"
        title : "Help"
    getInitialState: ->
        closed : true

    render_title: ->
        <span>
            {@props.title}
        </span>

    render:->
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
        return "now"
    if unit == 'second'
        return "less than a minute #{suffix}"
    if value != 1
        unit += 's'
    return value + ' ' + unit + ' ' + suffix

TimeAgo = require('react-timeago')
exports.TimeAgo = rclass
    displayName : "Misc-TimeAgo"
    render: ->
        <TimeAgo date={@props.date} style={@props.style} formatter={timeago_formatter} />


# Important:
# widget can be controlled or uncontrolled -- use default_value for an *uncontrolled* widget
# with callbacks, and value for a controlled one!
#    See http://facebook.github.io/react/docs/forms.html#controlled-components

# Search input box with a clear button (that focuses!), enter to submit,
# escape to also clear.
exports.SearchInput = rclass
    propTypes:
        placeholder : rtypes.string
        default_value : rtypes.string
        on_change   : rtypes.func    # called each time the search input changes
        on_submit   : rtypes.func    # called when the search input is submitted (by hitting enter)

    getInitialState: ->
        value : @props.default_value

    clear_and_focus_search_input: ->
        @set_value('')
        @refs.input.getInputDOMNode().focus()

    clear_search_button : ->
        <Button onClick={@clear_and_focus_search_input}>
            <Icon name="times-circle" />
        </Button>

    set_value: (value) ->
        @setState(value:value)
        @props.on_change?(value)

    submit: (e) ->
        e?.preventDefault()
        @props.on_change?(@state.value)
        @props.on_submit?(@state.value)

    render: ->
        <form onSubmit={@submit}>
            <Input
                ref         = 'input'
                type        = 'text'
                placeholder = {@props.placeholder}
                value       = {@state.value}
                buttonAfter = {@clear_search_button()}
                onChange    = {=>@set_value(@refs.input.getValue())}
                onKeyDown   = {(e)=>if e.keyCode==27 then @set_value('')}
            />
        </form>


exports.MarkdownInput = rclass
    propTypes:
        default_value : rtypes.string
        on_change     : rtypes.func
        on_save       : rtypes.func
        rows          : rtypes.number
        placeholder   : rtypes.string

    getInitialState: ->
        editing : false
        value   : undefined

    edit: ->
        @setState(value:@props.default_value ? '', editing:true)

    cancel: ->
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
            # don't import misc_page at the module level
            {__html: require('misc_page').markdown_to_html(@props.default_value).s}
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
                    <Input autoFocus
                        ref         = "input"
                        type        = 'textarea'
                        rows        = {@props.rows ? 4}
                        placeholder = {@props.placeholder}
                        value       = {@state.value}
                        onChange    = {=>x=@refs.input.getValue();@setState(value:x); @props.on_change?(x)}
                        onKeyDown   = {@keydown}
                    />
                </form>
                <div style={paddingTop:'8px', color:'#666'}>
                    <Tip title="Use Markdown" tip={tip}>
                        Format using <a href='https://help.github.com/articles/markdown-basics/' target="_blank">Markdown</a>
                    </Tip>
                </div>
            </div>
        else
            <div>
                {<Button onClick={@edit}>Edit</Button>}
                <div onClick={@edit} dangerouslySetInnerHTML={@to_html()}></div>
            </div>



activity_style =
    float           : 'right'
    backgroundColor : 'white'
    position        : 'absolute'
    right           : '5px'
    top             : '5px'
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
    displayName : "ActivityDisplay"

    propTypes : ->
        activity : rtypes.object.isRequired  # array of strings
        trunc    : rtypes.number             # truncate activity messages at this many characters (default: 80)
        on_clear : rtypes.func               # if given, called when a clear button is clicked

    render_items: ->
        n = @props.trunc ? 80
        trunc = (s) -> misc.trunc(s, n)
        for desc, i in @props.activity
            <div key={i} style={activity_item_style} >
                <Icon name="circle-o-notch" spin /> {trunc(desc)}
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
    displayName : "Tip"
    propTypes:
        title     : rtypes.oneOfType([rtypes.string, rtypes.node]).isRequired
        placement : rtypes.string   # 'top', 'right', 'bottom', left' -- defaults to 'right'
        tip       : rtypes.oneOfType([rtypes.string, rtypes.node]).isRequired
        size      : rtypes.string   # "xsmall", "small", "medium", "large"
    render : ->
        <OverlayTrigger
            placement = {@props.placement ? 'right'}
            overlay   = {<Popover bsSize={@props.size} title={@props.title}>{@props.tip}</Popover>}
            delayShow = 600
            >
            <span>{@props.children}</span>
        </OverlayTrigger>

exports.SaveButton = rclass
    propTypes:
        unsaved  : rtypes.bool
        disabled : rtypes.bool
        on_click : rtypes.func.isRequired
    render: ->
        <Button bsStyle='success' disabled={@props.saving or not @props.unsaved} onClick={@props.on_click}>
            <Icon name='save' /> Sav{if @props.saving then <span>ing... <Icon name="circle-o-notch" spin /></span> else <span>e</span>}
        </Button>


DateTimePicker = require('react-widgets/lib/DateTimePicker')

DATETIME_PARSE_FORMATS = [
    "MMM d, yyyy h:mm tt",
    "MMMM d, yyyy h:mm tt",
    "MMM d, yyyy",
    "MMM d, yyyy H:mm"
    "MMMM d, yyyy",
    "MMMM d, yyyy H:mm"
]

exports.DateTimePicker = rclass
    propTypes:
        value     : rtypes.oneOfType([rtypes.string, rtypes.object])
        on_change : rtypes.func.isRequired
    render: ->
        <DateTimePicker
            step       = {60}
            editFormat = {"MMM d, yyyy h:mm tt"}
            parse      = {DATETIME_PARSE_FORMATS}
            value      = {@props.value}
            onChange   = {@props.on_change}
        />
