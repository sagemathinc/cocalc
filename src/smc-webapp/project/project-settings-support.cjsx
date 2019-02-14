{React, rtypes, rclass}  = require('../app-framework')

{Panel} = require('react-bootstrap')
{Icon, CloseX2} = require('../r_misc')


exports.ProjectSettingsPanel = rclass
    displayName : 'ProjectSettingsPanel'

    propTypes :
        icon         : rtypes.string.isRequired
        title        : rtypes.string
        title_el     : rtypes.node
        show_header  : rtypes.bool
        close        : rtypes.func

    getDefaultProps: ->
        show_header  : true

    render_header: ->
        return if not @props.show_header
        title = @props.title ? @props.title_el
        return if not title?

        <h3>
            <Icon name={@props.icon} /> {title}
            {<CloseX2 close={@props.close} /> if @props.close}
        </h3>

    render: ->
        <Panel header={@render_header()}>
            {@props.children}
        </Panel>

