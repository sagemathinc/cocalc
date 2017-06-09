# 3rd Party Libraries
markdown = require('../markdown')
{Button, ButtonToolbar, FormControl, FormGroup} = require('react-bootstrap')

# Internal Libraries
misc = require('smc-util/misc')
{React, ReactDOM, rclass, rtypes} = require('../smc-react')

# Sibling Libraries
info = require('./info')
actions = require('./actions')
store = require('./store')

state_app = undefined # Expects a state application with stores and actions
exports.init = (redux) =>
    return if redux.getActions(info.name)

    redux.createStore(store.definition)
    redux.createActions(info.name, actions.create(redux))
    state_app = redux
    return exports.MarkdownInput

exports.MarkdownInput = rclass
    displayName : 'WidgetMarkdownInput'

    propTypes :
        persist_id    : rtypes.string # A unique id to identify the input. Required if you want automatic persistence
        attach_to     : rtypes.string # Removes record when given store name is destroyed
        default_value : rtypes.string
        on_change     : rtypes.func
        on_save       : rtypes.func   # called when saving from editing and switching back
        on_edit       : rtypes.func   # called when editing starts
        on_cancel     : rtypes.func   # called when cancel button clicked
        rows          : rtypes.number
        placeholder   : rtypes.string

    reduxProps:
        markdown_inputs :
            open_inputs : rtypes.immutable.Map.isRequired

    getInitialState: ->
        value = @props.default_value ? ''
        editing = false
        if @props.persist_id and @props.open_inputs.has(@props.persist_id)
            value = @props.open_inputs.get(@props.persist_id)
            editing = true

        editing : editing
        value   : value

    componentDidMount: ->
        if @props.attach_to
            state_app.getStore(@props.attach_to).on('destroy', @clear_persist)

    componentWillUnmount: ->
        if @props.persist_id? and not @state.editing
            @clear_persist()

    persist_value: (value) ->
        @actions(info.name).set_value(@props.persist_id, value ? @state.value)

    clear_persist: ->
        @actions(info.name).clear(@props.persist_id)

    set_value: (value) ->
        @props.on_change?(value)
        @persist_value(value)
        @setState(value : value)

    edit: ->
        @props.on_edit?()
        @setState(editing : true, value : @props.default_value)

    cancel: ->
        @props.on_cancel?()
        @clear_persist()
        @setState(editing : false)

    save: ->
        @props.on_save?(@state.value)
        @clear_persist()
        @setState(editing : false)

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
        {Tip, Icon} = require('../r_misc')
        if @state.editing
            tip = <span>
                You may enter (Github flavored) markdown here.  In particular, use # for headings, > for block quotes, *'s for italic text, **'s for bold text, - at the beginning of a line for lists, back ticks ` for code, and URL's will automatically become links.
            </span>
            <div>
                <form onSubmit={@save} style={marginBottom: '-20px'}>
                    <FormGroup>
                        <FormControl
                            autoFocus      = {@props.autoFocus ? true}
                            ref            = 'input'
                            componentClass = 'textarea'
                            rows           = {@props.rows ? 4}
                            placeholder    = {@props.placeholder}
                            value          = {@state.value}
                            onChange       = {(e)=>@set_value(ReactDOM.findDOMNode(@refs.input).value)}
                            onKeyDown      = {@keydown}
                        />
                    </FormGroup>
                </form>
                <div style={paddingTop:'8px', color:'#666'}>
                    <Tip title='Use Markdown' tip={tip}>
                        Format using <a href={info.guide_link} target='_blank'>Markdown</a>
                    </Tip>
                </div>
                <ButtonToolbar style={paddingBottom:'5px'}>
                    <Button key='save' bsStyle='success' onClick={@save}
                            disabled={@state.value == @props.default_value}>
                        <Icon name='edit' /> Save
                    </Button>
                    <Button key='cancel' onClick={@cancel}>Cancel</Button>
                </ButtonToolbar>
            </div>
        else
            <div>
                <div onClick={@edit} dangerouslySetInnerHTML={@to_html()}></div>
                <Button onClick={@edit}>Edit</Button>
            </div>
