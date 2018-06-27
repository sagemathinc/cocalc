"""
The find and replace modal dialog
"""

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')
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
        cell_list        : rtypes.immutable.List

    getInitialState: ->
        all     : false
        case    : false
        regexp  : false
        find    : ''
        replace : ''

    shouldComponentUpdate: (nextProps, nextState) ->
        if not nextProps.find_and_replace and not @props.find_and_replace
            return false
        return true

    close: ->
        @props.actions.close_find_and_replace()
        @props.actions.focus(true)

    focus: ->
        $(ReactDOM.findDOMNode(@refs.find)).focus()

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

    render_find: ->
        place = 'Find'
        if @state.case
            place += ' case sensitive'
        if @state.regexp
            place += ' regular expression'
        <FormControl
            autoFocus   = {true}
            ref         = 'find'
            type        = 'text'
            placeholder = {place}
            value       = {@state.find}
            onChange    = {=>@setState(find : ReactDOM.findDOMNode(@refs.find).value)}
            />

    render_replace: ->
        <FormControl
            style       = {marginTop: '15px'}
            ref         = 'replace'
            type        = 'text'
            placeholder = 'Replace'
            value       = {@state.replace}
            onChange    = {=>@setState(replace : ReactDOM.findDOMNode(@refs.replace).value)}
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
                    {@render_find()}
                </InputGroup>
                {@render_replace()}
            </FormGroup>
        </form>

    get_text: ->
        v = []
        sel = undefined
        if not @state.all
            sel = @props.sel_ids?.add(@props.cur_id)
        @props.cell_list?.forEach (id) =>
            if not sel? or sel.has(id)
                cell = @props.cells.get(id)
                v.push(cell.get('input') ? '')
            return
        return v.join('\n')

    get_matches: ->
        text = @get_text()
        x = find_matches(@state.find, text, @state.case, @state.regexp)
        x.text = text
        return x

    render_abort: (n=0) ->
        <div>
            Only showing first {n} matches
        </div>

    render_error: (error) ->
        <ErrorDisplay
            error   = {error}
            style   = {margin:'1ex'}
        />

    render_matches_title: (n=0) ->
        if n == 0
            s = 'No matches'
        else
            s = "#{n} match#{if n != 1 then 'es' else ''}"
        <h5>{s}</h5>

    render_matches: (matches, text) ->
        if not matches?
            return @render_matches_title(matches?.length)
        v = []
        i = 0
        line_start = 0
        key = 0
        for line in text.split('\n')
            line_stop = line_start + line.length
            w = []  # current line
            s = 0
            while i < matches.length
                {start, stop} = matches[i]
                if start >= line_stop
                    # done -- starts on next line (or later)
                    break
                b_start = Math.max(s, start - line_start)
                b_stop  = Math.min(line.length, stop - line_start)
                w.push(<span key={key}>{line.slice(s, b_start)}</span>)
                key += 1
                w.push(<span key={key} style={backgroundColor: '#ffa'}>{line.slice(b_start, b_stop)}</span>)
                key += 1
                s = b_stop
                if b_stop <= line_stop  # all on this line
                    i += 1
                else
                    # spans multiple lines; but done with this line
                    break
            if s < line.length
                w.push(<span key={key}>{line.slice(s)}</span>)
                key += 1
            v.push(<div key={key}>{w}</div>)
            key += 1
            line_start = line_stop + 1  # +1 for the newline

        <div>
            {@render_matches_title(matches?.length)}
            <pre style={color:'#666', maxHeight: '50vh'}>
                {v}
            </pre>
        </div>

    replace: (cnt) ->
        matches = @_matches?.matches
        if not matches?
            return
        sel = undefined
        if not @state.all
            sel = @props.sel_ids?.add(@props.cur_id)
        i = 0
        cell_start = 0
        replace = @state.replace
        replace_count = 0
        @props.cell_list?.forEach (id) =>
            if sel? and not sel.has(id)
                return
            if cnt? and replace_count >= cnt
                return false # done
            cell = @props.cells.get(id)
            input = cell.get('input') ? ''
            cell_stop = cell_start + input.length
            new_input = ''  # will be new input after replace
            s = 0
            while i < matches.length
                if cnt? and replace_count >= cnt # done
                    i = matches.length
                    break
                {start, stop} = matches[i]
                if start >= cell_stop
                    # done -- starts in next cell
                    break
                b_start = Math.max(s, start - cell_start)
                b_stop  = Math.min(input.length, stop - cell_start)
                new_input += input.slice(s, b_start)
                new_input += replace
                replace_count += 1
                s = b_stop
                if b_stop <= cell_stop  # all in this cell
                    i += 1
                else
                    # spans multiple cells; but done with this cell
                    break
            if s < input.length
                new_input += input.slice(s)
            if input != new_input
                @props.actions.set_cell_input(id, new_input, false)
            cell_start = cell_stop + 1  # +1 for the final newline
            return

        @props.actions._sync()

    render_results: ->
        {matches, abort, error, text} = @_matches
        if error
            return @render_error(error)
        <div>
            {@render_abort(matches?.length) if abort}
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

    render_replace_one_button: ->
        num = @num_matches()
        <Button onClick={=>@replace(1)} bsStyle='primary' disabled={num==0}>
            {@replace_action()} First Match
        </Button>

    num_matches: ->
        return @_matches?.matches?.length ? 0

    replace_action: (num) ->
        if @state.replace then "Replace" else "Delete"

    render_replace_all_button: ->
        num = @num_matches()
        if num > 1
            s = "#{num} Matches"
        else if num > 0
            s = "One Match"
        else
            s = 'All'
        <Button onClick={=>@replace()} bsStyle='primary' disabled={num==0}>
            {@replace_action(num)} {s}
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
                {@render_replace_one_button()}
                {@render_replace_all_button()}
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
