{React, rtypes, rclass}  = require('../app-framework')

{Panel} = require('react-bootstrap')
{Icon} = require('../r_misc')


exports.ProjectSettingsPanel = rclass
    displayName : 'ProjectSettingsPanel'

    propTypes :
        icon  : rtypes.string.isRequired
        title : rtypes.string.isRequired

    render_header: ->
        <h3><Icon name={@props.icon} /> {@props.title}</h3>

    render: ->
        <Panel header={@render_header()}>
            {@props.children}
        </Panel>

