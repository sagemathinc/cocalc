###
The static buttonbar at the top.
###


{ButtonGroup, Button, Form, FormControl} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc = require('smc-util/misc')
{required, defaults} = misc


exports.TopButtonbar = rclass ({name}) ->
    propTypes :
        actions : rtypes.object.isRequired

    focus: ->
        $(":focus").blur() # battling with react-bootstrap stupidity... ?
        @props.actions.focus(true)

    reduxProps :
        "#{name}" :
            cells               : rtypes.immutable.Map   # map from id to cells
            cur_id              : rtypes.string          # id of currently selected cell
            sel_ids             : rtypes.immutable.Set   # set of selected cells
            has_unsaved_changes : rtypes.bool

    shouldComponentUpdate: (next) ->
        return next.cur_id != @props.cur_id or \
            next.cells?.getIn([@props.cur_id, 'cell_type']) != @props.cells?.getIn([@props.cur_id, 'cell_type']) or \
            next.has_unsaved_changes != @props.has_unsaved_changes

    command: (name, focus) ->
        return =>
            @props.actions?.command(name)
            if focus
                @focus()
            else
                @props.actions.blur()

    render_button: (key, name) ->
        obj = @props.actions._commands?[name]
        if not obj?
            return
        focus = not misc.endswith(obj.m, '...')
        <Button key={key} onClick={@command(name, focus)} title={obj.m} >
            <Icon name={obj.i}/>
        </Button>

    render_buttons: (names) ->
        for key, name of names
            @render_button(key, name)

    render_button_group: (names) ->
        <ButtonGroup>
            {@render_buttons(names)}
        </ButtonGroup>

    render_add_cell: ->
        @render_buttons(['insert cell below'])

    render_group_edit: ->
        @render_button_group(['cut cell', 'copy cell', 'paste cell and replace'])

    render_group_move: ->
        @render_button_group(['move cell up', 'move cell down'])

    render_group_run: ->
        @render_button_group(['run cell and select next', 'interrupt kernel'])

    cell_select_type: (event) ->
        @props.actions.set_selected_cell_type(event.target.value)
        @focus()

    render_select_cell_type: ->
        if @props.sel_ids?.size > 1
            cell_type = 'multi'
        else
            cell_type = @props.cells?.getIn([@props.cur_id, 'cell_type']) ? 'code'
        <FormControl
            componentClass = "select"
            placeholder    = "select"
            onChange       = {@cell_select_type}
            value          = {cell_type ? 'code'}>
            <option value="code"          >Code</option>
            <option value="markdown"      >Markdown</option>
            <option value="raw" >Raw NBConvert</option>
            <option value="multi" disabled >-</option>
        </FormControl>

    render_keyboard: ->
        @render_button('0', 'show keyboard shortcuts')

    render_group_undo_redo: ->
        @render_button_group(['global undo', 'global redo'])

    render_group_zoom: ->
        <ButtonGroup>
            <Button onClick={=>@props.actions.zoom(-1); @focus()}>
                <Icon name='font' style={fontSize:'7pt'}/>
            </Button>
            <Button onClick={=>@props.actions.zoom(1); @focus()}>
                <Icon name='font' style={fontSize:'11pt'}/>
            </Button>
        </ButtonGroup>

    render_group_save_timetravel: ->
        <ButtonGroup>
            <Button
                bsStyle  = "success"
                onClick  = {=>@props.actions.save(); @focus()}
                disabled = {not @props.has_unsaved_changes}>
                <Icon name='save'/> Save
            </Button>
            <Button
                bsStyle = "info"
                onClick = {=>@props.actions.show_history_viewer()}>
                <Icon name='history'/> TimeTravel
            </Button>
        </ButtonGroup>

    render: ->
        <div style={margin: '1px 1px 0px 10px', backgroundColor:'#fff'}>
            <Form inline>
                {@render_add_cell()}
                <span style={marginLeft:'5px'}/>
                {@render_group_edit()}
                <span style={marginLeft:'5px'}/>
                {@render_group_move()}
                <span style={marginLeft:'5px'}/>
                {@render_group_undo_redo()}
                <span style={marginLeft:'5px'}/>
                {@render_group_zoom()}
                <span style={marginLeft:'5px'}/>
                {@render_group_run()}
                <span style={marginLeft:'5px'}/>
                {@render_select_cell_type()}
                <span style={marginLeft:'5px'}/>
                {@render_keyboard()}
                <span style={marginLeft:'5px'}/>
                {@render_group_save_timetravel()}
            </Form>
        </div>