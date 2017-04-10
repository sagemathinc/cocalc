###
Introspection display panel
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Icon} = require('../r_misc')

misc = require('smc-util/misc')

{CellOutputMessage} = require('./cell-output-message')

STYLE =
    padding   : '10px 20px 5px'
    overflowY : 'auto'
    border    : '1px solid #888'
    height    : '100vh'

INNER_STYLE =
    border       : '1px solid rgb(207, 207, 207)'
    borderRadius : '2px'
    background   : 'rgb(247, 247, 247)'
    padding      : '5px 25px'


CLOSE_STYLE =
    cursor    : 'pointer'
    position  : 'absolute'
    right     : '18px'
    fontSize  : '14pt'
    color     : '#666'
    marginTop : '-5px'

exports.Introspect = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        introspect : rtypes.immutable.Map.isRequired
        font_size  : rtypes.number

    close: ->
        @props.actions.clear_introspect()

    render_content: ->
        found = @props.introspect.get('found')
        if found? and not found
            <div>Nothing found</div>
        else
            <CellOutputMessage
                message = {@props.introspect}
            />

    render: ->
        if @props.font_size?
            inner_style = misc.merge({fontSize: @props.font_size}, INNER_STYLE)
        else
            inner_style = INNER_STYLE
        <div style={STYLE}>
            <Icon name='times' onClick={@close} style={CLOSE_STYLE} />
            <div style={inner_style}>
                {@render_content()}
            </div>
        </div>