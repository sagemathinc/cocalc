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

    render_item: (item, key) ->
        <Item
            key     = {key}
            item    = {item}
            actions = {@props.actions}
        />

    render_group_content: (content) ->
        if content.size == 0
            <div>None</div>
        else
            w = []
            content.forEach (item) =>
                w.push(@render_item(item, w.length))
                return
            <div>{w}</div>

    render_group: (group) ->
        spec = SPEC[group_to_level(group)]
        content = @props.build_log?.getIn(['latex', 'parse', group])
        if not content?
            return
        <div key={group}>
            <h3><Icon name={spec.icon} style={color:spec.color} /> {misc.capitalize(group)}</h3>
            {@render_group_content(content)}
        </div>

    render: ->
        <div
            className = {'smc-vfill'}
            style     = {overflowY: 'scroll', padding: '5px 15px', fontSize:"#{@props.font_size}px"}
        >
            {@render_status()}
            {(@render_group(group) for group in ['errors', 'typesetting', 'warnings'])}
        </div>

group_to_level = (group) ->
    switch group
        when 'errors'
            return 'error'
        when 'warnings'
            return 'warning'
        else
            return group

exports.SPEC = SPEC =
    error      :
        icon  : 'bug'
        color : '#a00'
    typesetting :
        icon  : 'exclamation-circle'
        color : 'rgb(66, 139, 202)'
    warning    :
        icon  : 'exclamation-triangle'
        color : '#fdb600'

ITEM_STYLES =
    warning :
        borderLeft  : '2px solid ' + SPEC.warning.color
        padding : '15px'
        margin  : '5px 0'
    error :
        borderLeft  : '2px solid ' + SPEC.error.color
        padding : '15px'
        margin  : '5px 0'
    typesetting :
        borderLeft  : '2px solid ' + SPEC.typesetting.color
        padding : '15px'
        margin  : '5px 0'

Item = rclass
    displayName : 'LaTeXEditor-ErrorsAndWarnings-Item'

    propTypes:
        actions : rtypes.object
        item    : rtypes.immutable.Map

    shouldComponentUpdate: (props) ->
        return @props.item != props.item

    edit_source: (e) ->
        e.stopPropagation()
        @props.actions.open_code_editor
            line      : @props.item.get('line')
            file      : @props.item.get('file')
            cursor    : true
            focus     : true
            direction : 'col'

    render_location: ->
        if not @props.item.get('line')
            return
        <div>
            <a onClick={@edit_source} style={cursor:'pointer', float:'right'}>
                Line {@props.item.get('line')} of {misc.path_split(@props.item.get('file')).tail}
            </a>
        </div>

    render_message: ->
        message = @props.item.get('message')
        if not message
            return
        <div>{message}</div>

    render_content: ->
        content = @props.item.get('content')
        if not content
            return
        <pre>{content}</pre>

    render: ->
        <div style={ITEM_STYLES[@props.item.get('level')]}>
            {@render_location()}
            {@render_message()}
            {@render_content()}
        </div>
