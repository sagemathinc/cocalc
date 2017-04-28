"""
The find and replace modal dialog
"""

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, ButtonGroup, ControlLabel, FieldGroup, FormControl, FormGroup, InputGroup, Modal} = require('react-bootstrap')
{ErrorDisplay, Icon} = require('../r_misc')

{find_matches} = require('./find')

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

    shouldComponentUpdate: (nextProps, nextState) ->
        if not nextProps.find_and_replace and not @props.find_and_replace
            return false
        return true

    close: ->
        @props.actions.close_find_and_replace()
        @props.actions.focus(true)

    focus: ->
        $(ReactDOM.findDOMNode(@refs.input)).focus()

    render_case_button: ->
        <Button
            onClick = {=>@setState(case: not @state.case); @focus()}
            title   = 'Match case'
            active  = {@state.case}
        >
            Aa
        </Button>

    render_regexp_button: ->
        <Button
            onClick = {=>@setState(regexp: not @state.regexp); @focus()}
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
            autoFocus   = {true}
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

    get_text: ->
        v = []
        sel = undefined
        if not @state.all
            sel = @props.sel_ids?.add(@props.cur_id)
        @props.cells.forEach (cell, id) =>
            if not sel? or sel.has(id)
                i = cell.get('input')
                if i?
                    v.push(i)
            return
        return v.join('\n')

    get_matches: ->
        text = @get_text()
        console.log 'text=', text
        x = find_matches(@state.input, text, @state.case, @state.regexp)
        x.text = text
        return x

    render_abort: ->
        <div>
            Only showing first 100 matches
        </div>

    render_error: (error) ->
        <ErrorDisplay
            error   = {error}
            style   = {margin:'1ex'}
        />

    render_matches: (matches, text) ->
        if not matches? or matches.length == 0
            return <div style={color:'#666'}>No matches</div>
        <span>
            {JSON.stringify(matches)}
        </span>

    render_results: ->
        {matches, abort, error, text} = @_matches
        <div>
            {@render_abort() if abort}
            {@render_error(error) if error}
            {@render_matches(matches, text)}
        </div>

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

    render_replace_button: ->
        num = @_matches?.matches?.length ? 0
        if num > 1
            s = "#{num} Matches"
        else if num > 0
            s = "One Match"
        else
            s = 'All'
        <Button onClick={@replace_all} bsStyle='primary' disabled={num==0}>
            Replace {s}
        </Button>

    render: ->
        @_matches = @get_matches()
        <Modal show={@props.find_and_replace} bsSize="large" onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='search'/> {@title()} </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {@render_form()}
                {@render_results()}
            </Modal.Body>

            <Modal.Footer>
                {@render_replace_button()}
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
