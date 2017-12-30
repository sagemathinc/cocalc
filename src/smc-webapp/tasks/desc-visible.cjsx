###
Summary line about what is being shown.
###

{React, rclass, rtypes}  = require('../smc-react')

{plural} = require('smc-util/misc')

exports.DescVisible = rclass
    propTypes:
        num_visible      : rtypes.number
        num_tasks        : rtypes.number
        local_view_state : rtypes.immutable.Map

    render_visible: ->
        <span style={color:'#666'}>
            Showing {@props.num_visible} {plural(@props.num_visible, 'task')}.
        </span>

    render_search: ->
        search = @props.local_view_state.get('search')
        if not search
            return
        <span style={color:'#666', marginLeft:'10px'}>
            Showing tasks that contain <b><i>{search}</i></b>.
        </span>

    render_checked: ->
        v = (type for type in ['done', 'deleted'] when @props.local_view_state.get("show_#{type}"))
        if v.length == 0
            return
        <span style={color:'#666', marginLeft:'10px'}>
            Showing <b><i>{v.join(' and ')}</i></b> tasks.
        </span>

    render: ->
        if not @props.num_visible? or not @props.local_view_state? or not @props.num_tasks?
            return <span />
        <div>
            {@render_visible()}
            {@render_search()}
            {@render_checked()}
        </div>