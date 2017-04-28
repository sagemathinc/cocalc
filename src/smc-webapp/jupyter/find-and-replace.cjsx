"""
The find and replace modal dialog
"""

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, ButtonGroup, ControlLabel, FieldGroup, FormControl, FormGroup, InputGroup, Modal} = require('react-bootstrap')
{Icon} = require('../r_misc')

exports.FindAndReplace = rclass
    propTypes :
        actions          : rtypes.object.isRequired
        find_and_replace : rtypes.bool
        cells            : rtypes.immutable.Map.isRequired
        sel_ids          : rtypes.immutable.Set
        cur_id           : rtypes.string

    getInitialState: ->
        all    : false
        case   : false
        regexp : false
        input  : ''

    close: ->
        @props.actions.close_find_and_replace()
        @props.actions.focus(true)

    focus: ->
        $(ReactDOM.findDOMNode(@refs.input)).focus()

    render_case_button: ->
        <Button
            onClick = {=>@setState(case: not @state.case, regexp: false); @focus()}
            title   = 'Match case'
            active  = {@state.case}
        >
            Aa
        </Button>

    render_regexp_button: ->
        <Button
            onClick = {=>@setState(regexp: not @state.regexp, case:false); @focus()}
            title   = 'Use regex (JavaScript regex syntax)'
            active  = {@state.regexp}
        >
            .*
        </Button>

    render_all_button: ->
        <Button
            onClick = {=>@setState(all: not @state.all); @focus()}
            title   = 'Replace in all cells'
            active  = {@state.all}
        >
            <Icon name='arrows-v'/>
        </Button>

    render_input: ->
        place = 'Find'
        if @state.case
            place += ' case sensitive'
        if @state.regexp
            place += ' regular expression'
        <FormControl
            autofocus
            ref         = 'input'
            type        = 'text'
            placeholder = {place}
            value       = {@state.input}
            onChange    = {=>@setState(input : ReactDOM.findDOMNode(@refs.input).value)}
            />

    render_form: ->
        <form>
            <FormGroup>
                <InputGroup>
                    <InputGroup.Button>
                        {@render_case_button()}
                        {@render_regexp_button()}
                        {@render_all_button()}
                    </InputGroup.Button>
                    {@render_input()}
                </InputGroup>
            </FormGroup>
        </form>

    render_results: ->
        <span
            style={color:'#666'}
        >
            No matches, invalid or empty regular expression

            {@state.input}
        </span>

    title: ->
        s = 'Find and Replace in '
        if not @props.find_and_replace
            return s
        if @state.all
            s += "All #{@props.cells.size} Cells"
        else
            if (@props.sel_ids?.size ? 0) == 0
                s += 'the Current Cell'
            else
                num = @props.sel_ids?.add(@props.cur_id).size ? 1
                s += "#{num} Selected Cell#{if num > 1 then 's' else ''}"
        return s

    render: ->
        <Modal show={@props.find_and_replace} bsSize="large" onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='search'/> {@title()} </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {@render_form()}
                {@render_results()}
            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@replace_all} bsStyle='primary'>Replace All</Button>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
