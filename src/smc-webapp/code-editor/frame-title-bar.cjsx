###
FrameTitleBar - title bar in a frame, in the frame tree
###

{React, rclass, rtypes} = require('../smc-react')

title_bar_style =
    background  : '#eee'
    fontSize    : '10pt'
    paddingLeft : '1em'
    color       : '#666'

close_style =
    float        : 'right'
    paddingRight : '2px'
    marginTop    : '-4px'
    marginBottom : '-4px'
    fontSize     : '14pt'
    cursor       : 'pointer'

exports.FrameTitleBar = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        active_id  : rtypes.string
        id         : rtypes.string
        title      : rtypes.string
        deletable  : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.active_id  != next.active_id or \
               @props.id         != next.id or \
               @props.path       != next.path

    click_close: ->
        @props.actions.close_frame(@props.id)

    render_x: ->
        if @props.deletable
            <span
                className='webapp-editor-close-hover-x'
                style={close_style}
                onClick={@click_close} >
                ×
            </span>

    render: ->
        <div style={title_bar_style}>
            {@props.title}
            {@render_x()}
        </div>
