###
Viewer for public ipynb files.
###

{ErrorDisplay, Icon, Loading} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.NBViewer = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            project_id : rtypes.string.isRequired
            path       : rtypes.string.isRequired
            loading    : rtypes.object
            error      : rtypes.string
            ipynb      : rtypes.object

    render_loading: ->
        <Loading
            style = {fontSize: '24pt', textAlign: 'center', marginTop: '15px', color: '#888'}
        />

    render_error: ->
        <ErrorDisplay
            error   = {@props.error}
            onClose = {=>@props.actions.setState(error: undefined)}
        />

    render_ipynb: ->
        <div>{@props.project_id} {@props.path} {JSON.stringify(@props.ipynb)}</div>

    render: ->
        if @props.error?
            return @render_error()
        else if @props.ipynb?
            return @render_ipynb()
        else
            return @render_loading()
