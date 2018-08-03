###
Searching for tasks by full text search and done/deleted status.
###

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{Icon} = require('../r_misc')

{Button, Row, Col, FormControl, FormGroup, InputGroup} = require('react-bootstrap')

{ShowToggle} = require('./show-toggle')

{EmptyTrash} = require('./empty-trash')

exports.Find = rclass
    propTypes:
        actions          : rtypes.object
        local_view_state : rtypes.immutable.Map
        counts           : rtypes.immutable.Map
        focus_find_box   : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.local_view_state != next.local_view_state or \
               @props.counts           != next.counts or \
               !!next.focus_find_box and not @props.focus_find_box

    componentWillReceiveProps: (next) ->
        if next.focus_find_box and (@props.focus_find_box != next.focus_find_box)
            ReactDOM.findDOMNode(@refs.search).focus()

    render_toggle: (type) ->
        count = @props.counts.get(type)
        show  = @props.local_view_state.get("show_#{type}")
        toggle = <ShowToggle
            actions = {@props.actions}
            type    = {type}
            show    = {show}
            count   = {count}
            />
        if show and type == 'deleted' and count > 0
            extra = <EmptyTrash actions={@props.actions} count={count} />
        else
            extra = undefined
        <div style={minWidth:'150px', padding:'2px 5px'}>
            {toggle}
            {extra}
        </div>

    key_down: (evt) ->
        if evt.which == 27
            @props.actions.set_local_view_state(search: '')
            ReactDOM.findDOMNode(@refs.search).blur()
            return false

    clear_and_focus_search_input: ->
        @props.actions.set_local_view_state(search: '')
        ReactDOM.findDOMNode(@refs.search).focus()

    render_search: ->
        <FormGroup style={marginBottom:0, marginRight: '20px'}>
            <InputGroup>
                <FormControl
                    type           = 'text'
                    ref            = 'search'
                    componentClass = 'input'
                    value          = {@props.local_view_state.get('search') ? ''}
                    onChange       = {=>@props.actions.set_local_view_state(search: ReactDOM.findDOMNode(@refs.search).value)}
                    onBlur         = {=>@props.actions.blur_find_box()}
                    onFocus        = {=>@props.actions.disable_key_handler()}
                    onKeyDown      = {@key_down}
                />
                <InputGroup.Button>
                    <Button onClick={@clear_and_focus_search_input}>
                        <Icon name='times-circle' />
                    </Button>
                </InputGroup.Button>
            </InputGroup>
        </FormGroup>

    render: ->
        if not @props.actions? or not @props.local_view_state?
            return <span />
        <div style={display: 'flex', marginLeft:'5px'}>
            {@render_search()}
            {@render_toggle('done')}
            {@render_toggle('deleted')}
        </div>