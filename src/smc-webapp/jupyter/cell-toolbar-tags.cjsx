###
The tag editing toolbar functionality for cells.
###

{Button, FormControl, FormGroup, InputGroup} = require('react-bootstrap')
{React, ReactDOM, rclass, rtypes}  = require('../app-framework')
{Icon} = require('../r_misc')

misc = require('smc-util/misc')

TAG_STYLE =
    padding      : '3px 5px'
    margin       : '3px 3px'
    background   : '#5bc0de'
    borderRadius : '3px'
    color        : 'white'
    display      : 'inline-block'

exports.TagsToolbar = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map.isRequired

    getInitialState: ->
        input : ''

    remove_tag: (tag) ->
        @props.actions.remove_tag(@props.cell.get('id'), tag)

    render_tag: (tag) ->
        <span key={tag} style={TAG_STYLE}>
            {tag}
            <Icon
                name      = 'times'
                style     = {marginLeft:'5px', cursor:'pointer'}
                onClick   = {=>@remove_tag(tag)}
            />
        </span>

    render_tags: ->
        t = @props.cell.get('tags')?.toJS()
        if not t?
            return
        <div style={flex:1}>
            {(@render_tag(tag) for tag in misc.keys(t).sort())}
        </div>

    render_tag_input: ->
        <FormControl
            onFocus     = {@props.actions.blur_lock}
            onBlur      = {@props.actions.focus_unlock}
            ref         = 'input'
            type        = 'text'
            value       = {@state.input}
            onChange    = {=>@setState(input : ReactDOM.findDOMNode(@refs.input).value)}
            style       = {height:'34px'}
            bsSize      = {'small'}
            onKeyDown   = {(e) => if e.which == 13 then @add_tags(); return}
            />

    add_tags: ->
        for tag in misc.split(@state.input)
            @props.actions.add_tag(@props.cell.get('id'), tag, false)
        @props.actions._sync()
        @setState(input:'')

    render_add_button: ->
        <Button
            bsSize   = 'small'
            disabled = {@state.input.length == 0}
            title    = 'Add tag or tags (separate by spaces)'
            onClick  = {@add_tags}
            style    = {height:'34px'}
        >
            Add
        </Button>

    render_input: ->
        <div style={display:'flex'}>
            {@render_tag_input()}
            {@render_add_button()}
        </div>

    render: ->
        <div style={display:'flex'}>
            {@render_tags()}
            {@render_input()}
        </div>
