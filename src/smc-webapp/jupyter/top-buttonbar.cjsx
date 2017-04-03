###
The static buttonbar at the top.
###


{ButtonGroup, Button, Form, FormControl} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')


exports.TopButtonbar = rclass ({name}) ->
    propTypes :
        actions : rtypes.object.isRequired

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

    render_add_cell: ->
        <Button onClick={=>@props.actions.insert_cell(1)}>
            <Icon name='plus'/>
        </Button>

    render_group_edit: ->
        <ButtonGroup  style={marginLeft:'5px'}>
            <Button onClick={=>@props.actions.cut_selected_cells()}>
                <Icon name='scissors'/>
            </Button>
            <Button onClick={=>@props.actions.copy_selected_cells()}>
                <Icon name='files-o'/>
            </Button>
            <Button onClick={=>@props.actions.paste_cells(1)}>
                <Icon name='clipboard'/>
            </Button>
        </ButtonGroup>

    render_group_move: ->
        <ButtonGroup  style={marginLeft:'5px'}>
            <Button onClick={=>@props.actions.move_selected_cells(-1)}>
                <Icon name='arrow-up'/>
            </Button>
            <Button  onClick={=>@props.actions.move_selected_cells(1)}>
                <Icon name='arrow-down'/>
            </Button>
        </ButtonGroup>

    render_group_run: ->
        <ButtonGroup  style={marginLeft:'5px'}>
            <Button onClick={=>@props.actions.shift_enter_run_selected_cells()} >
                <Icon name='step-forward'/>
            </Button>
            <Button onClick={=>@props.actions.signal('SIGINT')} >
                <Icon name='stop'/>
            </Button>
        </ButtonGroup>

    cell_select_type: (event) ->
        @props.actions.set_selected_cell_type(event.target.value)

    render_select_cell_type: ->
        if @props.sel_ids?.size > 1
            cell_type = 'multi'
        else
            cell_type = @props.cells?.getIn([@props.cur_id, 'cell_type']) ? 'code'
        <FormControl
            style          = {marginLeft : '5px'}
            componentClass = "select"
            placeholder    = "select"
            onChange       = {@cell_select_type}
            value          = {cell_type ? 'code'}>
            <option value="code"          >Code</option>
            <option value="markdown"      >Markdown</option>
            <option value="raw-nbconvert" >Raw NBConvert</option>
            <option value="multi" disabled >-</option>
        </FormControl>

    render_keyboard: ->
        <Button style={marginLeft:'5px'}>
            <Icon name='keyboard-o'/>
        </Button>

    render_group_undo_redo: ->
        <ButtonGroup  style={marginLeft:'5px'}>
            <Button onClick={=>@props.actions.undo()}>
                <Icon name='undo'/>
            </Button>
            <Button onClick={=>@props.actions.redo()}>
                <Icon name='repeat'/>
            </Button>
        </ButtonGroup>

    render_group_zoom: ->
        <ButtonGroup  style={marginLeft:'5px'}>
            <Button onClick={=>@props.actions.zoom(-1)}>
                <Icon name='font' style={fontSize:'7pt'}/>
            </Button>
            <Button onClick={=>@props.actions.zoom(1)}>
                <Icon name='font' style={fontSize:'11pt'}/>
            </Button>
        </ButtonGroup>


    render_group_save_timetravel: ->
        <ButtonGroup  style={marginLeft:'5px'}>
            <Button
                bsStyle  = "success"
                onClick  = {=>@props.actions.save()}
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
                {@render_group_edit()}
                {@render_group_move()}
                {@render_group_run()}
                {@render_select_cell_type()}
                {@render_keyboard()}
                {@render_group_undo_redo()}
                {@render_group_zoom()}
                {@render_group_save_timetravel()}
            </Form>
        </div>