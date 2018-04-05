###
Show the last latex build log, i.e., output from last time we ran the LaTeX build process.
###

misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes, Fragment} = require('../smc-react')

{Loading} = require('../r_misc')

util = require('../code-editor/util')

exports.BuildLog = rclass ({name}) ->
    displayName: 'LaTeXEditor-BuildLog'

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

    render_latex_stdout: ->
        <Fragment>
            <textarea
                readOnly = {true}
                style    = {color: '#666', background: '#f8f8f0', display: 'block', width: '100%', margin: '5px 0', padding: '10px', flex:1}
                value    = {@props.build_log?.getIn(['latex', 'stdout']) ? ''}
            />
        </Fragment>

    render_latex_stderr: ->
        stderr = @props.build_log?.getIn(['latex', 'stderr'])
        if not stderr
            return
        <textarea
            readOnly = {true}
            style    = {color : 'darkred', background: '#f8f8f0', display: 'block', width: '100%', margin: '5px 0', padding: '10px', flex:1}
            value    = {stderr}
        />

    render_building: ->
        if @props.status
            <div>
                <Loading
                    text  = {@props.status}
                    style = {fontSize: '18pt', textAlign: 'center', marginTop: '15px', color: '#333'}
                />
            </div>

    render: ->
        <div
            className = {'smc-vfill'}
            style     = {overflowY: 'scroll', padding: '5px 15px', fontSize:"#{@props.font_size}px"}
        >
            {@render_building()}
            <h4>LaTeX Output</h4>
            {@render_latex_stdout()}
            {@render_latex_stderr()}
        </div>