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
        return misc.is_different(@props, props, ['status', 'font_size']) or \
            @props.build_log?.getIn(['latex', 'parse']) != props.build_log?.getIn(['latex', 'parse'])

    render_status: ->
        if @props.status
            <div style={margin:'15px'}>
                <Loading
                    text  = {@props.status}
                    style = {fontSize: '18pt', textAlign: 'center', marginTop: '15px', color: '#666'}
                />
            </div>

    render_group_content: (group) ->
        v = @props.build_log?.getIn(['latex', 'parse', group])
        if not v? or v.size == 0
            <span>None</span>
        else
            <div>{JSON.stringify(v.toJS())}</div>

    render_group: (group) ->
        <div key={group}>
            <h3>{misc.capitalize(group)}</h3>
            {@render_group_content(group)}
        </div>

    render: ->
        <div
            className = {'smc-vfill'}
            style     = {overflowY: 'scroll', padding: '5px 15px', fontSize:"#{@props.font_size}px"}
        >
            {@render_status()}
            {(@render_group(group) for group in ['errors', 'typesetting', 'warnings'])}
        </div>



