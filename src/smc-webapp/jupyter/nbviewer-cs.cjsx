###
Viewer for public ipynb files.
###

{ErrorDisplay, Icon, Loading} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{CellList}   = require('./cell-list')

misc = require('smc-util/misc')

exports.NBViewer = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            project_id : rtypes.string
            path       : rtypes.string.isRequired
            loading    : rtypes.object
            error      : rtypes.string
            cell_list  : rtypes.immutable
            cells      : rtypes.immutable
            font_size  : rtypes.number.isRequired
            cm_options : rtypes.immutable

    render_loading: ->
        <Loading
            style = {fontSize: '24pt', textAlign: 'center', marginTop: '15px', color: '#888'}
        />

    render_error: ->
        <ErrorDisplay
            error   = {@props.error}
            onClose = {=>@props.actions.setState(error: undefined)}
        />

    render_cells: ->
        directory  = misc.path_split(@props.path).head
        <CellList
            cell_list  = {@props.cell_list}
            cells      = {@props.cells}
            font_size  = {@props.font_size}
            mode       = 'escape'
            cm_options = {@props.cm_options}
            project_id = {@props.project_id}
            directory  = {directory}
            trust      = {false}
            />

    render_body: ->
        <div style={display: 'flex', flexDirection: 'column', height: '100%', overflowY:'hidden'}>
            {@render_cells()}
        </div>

    render: ->
        if @props.error?
            return @render_error()
        else if @props.cell_list? and @props.cells? and @props.cm_options?
            return @render_body()
        else
            return @render_loading()
