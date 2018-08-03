###
Summary line about what is being shown.
###

{React, rclass, rtypes}  = require('../app-framework')

{plural} = require('smc-util/misc')

exports.DescVisible = rclass
    propTypes:
        num_visible      : rtypes.number
        num_tasks        : rtypes.number
        local_view_state : rtypes.immutable.Map
        search_desc      : rtypes.string

    shouldComponentUpdate: (next) ->
        return @props.num_visible      != next.num_visible or \
               @props.num_tasks        != next.num_tasks   or \
               @props.local_view_state != next.local_view_state or \
               @props.search_desc      != next.search_desc

    render_visible: ->
        <span style={color:'#666'}>
            {@props.num_visible} matching {plural(@props.num_visible, 'task')}.
        </span>

    render_search: ->
        if not @props.search_desc
            return
        <span style={color:'#666', marginLeft:'10px'}>
            Tasks that match <b><i>{@props.search_desc}</i></b>.
        </span>

    render_checked: ->
        v = (type for type in ['done', 'deleted'] when @props.local_view_state.get("show_#{type}"))
        if v.length == 0
            return
        <span style={color:'#666', marginLeft:'10px'}>
            Including <b><i>{v.join(' and ')}</i></b> tasks.
        </span>

    render: ->
        if not @props.num_visible? or not @props.local_view_state? or not @props.num_tasks?
            return <span />
        <div style={padding:'10px 0px', float: 'right', marginRight: '15px', fontSize:'12pt', position:'absolute', marginLeft:'5px'}>
            {@render_visible()}
            {@render_search()}
            {@render_checked()}
        </div>