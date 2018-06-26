###
The static buttonbar at the top.
###


{ButtonGroup, Button, Form, FormControl} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc = require('smc-util/misc')
{required, defaults} = misc

{UncommittedChanges} = require('./uncommitted-changes')


exports.TopButtonbar = rclass ({name}) ->
    propTypes :
        actions : rtypes.object.isRequired

    focus: ->
        @props.actions.focus(true)

    reduxProps :
        "#{name}" :
            cells                   : rtypes.immutable.Map   # map from id to cells
            cur_id                  : rtypes.string          # id of currently selected cell
            sel_ids                 : rtypes.immutable.Set   # set of selected cells
            has_unsaved_changes     : rtypes.bool
            has_uncommitted_changes : rtypes.bool
            read_only               : rtypes.bool
            kernel_state            : rtypes.string
            kernel_usage            : rtypes.immutable.Map
        "page" :
            fullscreen : rtypes.string

    shouldComponentUpdate: (next) ->
        return next.cur_id != @props.cur_id or \
            next.cells?.getIn([@props.cur_id, 'cell_type']) != @props.cells?.getIn([@props.cur_id, 'cell_type']) or \
            next.has_unsaved_changes != @props.has_unsaved_changes or \
            next.read_only != @props.read_only or \
            next.has_uncommitted_changes != @props.has_uncommitted_changes or \
            next.kernel_state != @props.kernel_state or \
            next.kernel_usage != @props.kernel_usage

    command: (name, focus) ->
        return =>
            $(":focus").blur() # battling with react-bootstrap stupidity... ?
            @props.actions?.command(name)
            if focus
                @focus()
            else
                @props.actions.blur()

    render_button: (key, name) ->
        if typeof(name) == 'object'
            {name, disabled, style, label, className} = name
        style     ?= undefined
        disabled  ?= false
        label     ?= ''
        className ?= undefined
        if @props.read_only  # all buttons disabled in read-only mode
            disabled = true
        obj = @props.actions._commands?[name]
        if not obj?
            return
        focus = not misc.endswith(obj.m, '...')
        if obj.i
            icon = <Icon name={obj.i} />
        else
            icon = undefined
        <Button
            className = {className}
            key       = {key}
            onClick   = {@command(name, focus)}
            title     = {obj.m}
            disabled  = {disabled}
            style     = {style}
        >
            {icon} {label}
        </Button>

    render_buttons: (names) ->
        for key, name of names
            @render_button(key, name)

    render_button_group: (names, hide_xs) ->
        <ButtonGroup className={if hide_xs then 'hidden-xs' else ''}>
            {@render_buttons(names)}
        </ButtonGroup>

    render_add_cell: ->
        @render_buttons(['insert cell below'])

    render_group_edit: ->
        @render_button_group(['cut cell', 'copy cell', 'paste cell and replace'], true)

    render_group_move: ->
        @render_button_group(['move cell up', 'move cell down'], true)

    render_group_run: ->
        if (@props.kernel_usage?.get('cpu') ? 0) >= 50
            stop_style = {backgroundColor:'rgb(92,184,92)', color:'white'}
        else
            stop_style = undefined
        v = [{name:'run cell and select next', label:'Run'}, \
             {name:'interrupt kernel', style:stop_style}, \
             'confirm restart kernel',
             {name:'tab key', label:'Tab'}]
        @render_button_group(v)

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
            className      = 'hidden-xs'
            style          = {maxWidth: '8em'}
            disabled       = {@props.read_only}
            value          = {cell_type ? 'code'}>
            <option value="code"          >Code</option>
            <option value="markdown"      >Markdown</option>
            <option value="raw" >Raw</option>
            <option value="multi" disabled >-</option>
        </FormControl>

    render_keyboard: ->
        @render_button('0', 'show keyboard shortcuts')

    render_assistant: ->
        @render_button('assistant', {name:'show code assistant', label: 'Assistant', className:'pull-right', style: {marginRight: '1px'}})

    render_group_undo_redo: ->
        @render_button_group(['global undo', 'global redo'])

    render_group_zoom: ->
        <ButtonGroup>
            <Button onClick={=>@props.actions.zoom(-1); @focus()} title='Zoom out (make text smaller)'>
                <Icon name='font' style={fontSize:'7pt'}/>
            </Button>
            <Button onClick={=>@props.actions.zoom(1); @focus()}  title='Zoom in (make text larger)'>
                <Icon name='font' style={fontSize:'11pt'}/>
            </Button>
        </ButtonGroup>

    render_uncommitted: ->
        <UncommittedChanges has_uncommitted_changes={@props.has_uncommitted_changes} />

    render_switch_button: ->
        if @props.fullscreen == 'kiosk' or $.browser.firefox
            return
        <Button
            title   = 'Switch to classical notebook'
            onClick = {=>@props.actions.switch_to_classical_notebook()}>
            <Icon name='exchange'/> <span className = 'hidden-sm'>Classical notebook...</span>
        </Button>

    render_close_and_halt: ->
        obj =
            name     : 'close and halt'
            disabled : false
            label    : 'Halt'
        return @render_button('close and halt', obj)

    render_group_save_timetravel: ->
        <ButtonGroup className = 'hidden-xs'>
            <Button
                title    = 'Save file to disk'
                bsStyle  = "success"
                onClick  = {=>@props.actions.save(); @focus()}
                disabled = {not @props.has_unsaved_changes or @props.read_only}>
                <Icon name='save'/> <span className = 'hidden-sm'>{if @props.read_only then 'Readonly' else 'Save'}</span>
                {@render_uncommitted()}
            </Button>
            <Button
                title   = 'Show complete edit history'
                bsStyle = "info"
                onClick = {=>@props.actions.show_history_viewer()}>
                <Icon name='history'/> <span className = 'hidden-sm'>TimeTravel</span>
            </Button>
            {@render_close_and_halt()}
            {### @render_switch_button() ###}
        </ButtonGroup>

    render: ->
        <div style={margin: '1px 1px 0px 1px', backgroundColor:'#fff'}>
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
                {@render_assistant()}
            </Form>
        </div>