###
Show errors and warnings.
###

{Button}   = require('react-bootstrap')

misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes, Fragment} = require('../smc-react')

{Icon, Loading} = require('../r_misc')

util = require('../code-editor/util')


exports.ErrorsAndWarnings = rclass ({name}) ->
    displayName: 'LaTeXEditor-ErrorsAndWarnings'

    propTypes :
        id            : rtypes.string.isRequired
        actions       : rtypes.object.isRequired
        editor_state  : rtypes.immutable.Map
        is_fullscreen : rtypes.bool
        project_id    : rtypes.string
        path          : rtypes.string
        reload        : rtypes.number
        font_size     : rtypes.number

    reduxProps:
        "#{name}":
            build_log : rtypes.immutable.Map
            status    : rtypes.string

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['build_log', 'status', 'font_size'])

    render_status: ->
        if @props.status
            <div style={margin:'15px'}>
                <Loading
                    text  = {@props.status}
                    style = {fontSize: '18pt', textAlign: 'center', marginTop: '15px', color: '#666'}
                />
            </div>

    render_errors: ->
        errors = @props.build_log?.getIn(['latex', 'parse', 'errors'])
        if not errors?
            return
        <pre>{JSON.stringify(errors)}</pre>

    render_typesetting_issues: ->

    render_warnings: ->

    render: ->
        <div
            className = {'smc-vfill'}
            style     = {overflowY: 'scroll', padding: '5px 15px', fontSize:"#{@props.font_size}px"}
        >
            {@render_errors()}
            {@render_typesetting_issues()}
            {@render_warnings()}
        </div>