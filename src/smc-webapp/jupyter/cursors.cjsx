###
React component that represents cursors of other users.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc = require('smc-util/misc')

Cursor = rclass
    propTypes:
        name  : rtypes.string.isRequired
        color : rtypes.string.isRequired

    getInitialState: ->
        hover : false

    componentDidMount: ->
        @_mounted = true

    componentWillUnmount: ->
        @_mounted = false

    hide: ->
        delete @_timer
        if @_mounted
            @setState(hover: false)

    show: (n) ->
        if @_mounted
            if @_timer?
                clearTimeout(@_timer)
            @setState(hover: true)
            @_timer = setTimeout((=>@hide()), n)

    render: ->
        <span
            style        = {color:@props.color, position:'relative', cursor:'text', pointerEvents : 'all'}
            onMouseEnter = {=>@show(2000)}
            >
            <span
                style={width: 0, height:'1em', borderLeft: '2px solid', position:'absolute'}
                />
            <span
                style={width: '6px', left: '-2px', top: '-2px', height: '6px', position:'absolute', backgroundColor:@props.color}
                />
            {<span
                style={position: 'absolute', fontSize: '10pt', color: '#fff', top: '-14px', left: '-2px', padding: '2px', whiteSpace: 'nowrap', background:@props.color, fontFamily:'sans-serif', boxShadow: '3px 3px 5px 0px #bbb'}
                >{@props.name}</span> if @state.hover}
        </span>


PositionedCursor = rclass
    propTypes:
        name       : rtypes.string.isRequired
        color      : rtypes.string.isRequired
        line       : rtypes.number.isRequired
        ch         : rtypes.number.isRequired
        codemirror : rtypes.object            # optional codemirror editor instance

    render_codemirror: ->
        {left, top} = @props.codemirror.cursorCoords({line:@props.line, ch:@props.ch}, 'local')
        gutter = $(@props.codemirror.getGutterElement()).width()
        <div style={position:'absolute', left:"#{left+gutter}px", top:"#{top}px"}>
            <Cursor name={@props.name} color={@props.color}/>
        </div>

    render_static: ->
        style =
            position      : 'relative'
            height        : 0
            lineHeight    : 'normal'
            fontFamily    : 'monospace'
            whiteSpace    : 'pre'
            top           : '4px'  # must match what is used in codemirror-static.
            left          : '4px'
            pointerEvents : 'none' # so clicking in the spaces (the string position below) doesn't break click to focus cell.

        # we position using newlines and blank spaces, so no measurement is needed.
        position = ('\n' for _ in [0...@props.line]).join('') + (' ' for _ in [0...@props.ch]).join('')
        <div style={style}>{position}<Cursor name={@props.name} color={@props.color}/></div>

    render: ->
        if not @props.codemirror?
            @render_static()
        else
            @render_codemirror()


exports.Cursors = rclass
    propTypes:
        cursors    : rtypes.immutable.Map.isRequired
        codemirror : rtypes.object            # optional codemirror editor instance

    reduxProps:
        "users":
            user_map: rtypes.immutable.Map
        "account":
            account_id : rtypes.string

    profile: (account_id) ->
        user = @props.user_map.get(account_id)
        if user?
            color = user.getIn(['profile', 'color']) ? 'rgb(170,170,170)'
            name  = misc.trunc_middle(user.get('first_name') + ' ' + user.get('last_name'), 60)
        else
            color = 'rgb(170,170,170)'
            name  = 'Private User'
        return {color:color, name:name}

    render: ->
        now = misc.server_time()
        v = []
        @props.cursors?.forEach (locs, account_id) =>
            {color, name} = @profile(account_id)
            locs.forEach (pos) =>
                if now - pos.get('time') <= 60000
                    if account_id == @props.account_id
                        # don't show our own cursor (we just haven't made this possible due to only keying by accoun_id)
                        return
                    v.push <PositionedCursor
                        key        = {v.length}
                        color      = {color}
                        name       = {name}
                        line       = {pos.get('y') ? 0}
                        ch         = {pos.get('x') ? 0}
                        codemirror = {@props.codemirror}
                    />
                return
        <div style={position:'relative', height:0, zIndex:5} >
            {v}
        </div>
