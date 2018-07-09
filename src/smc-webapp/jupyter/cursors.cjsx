###
React component that represents cursors of other users.
###

# How long until another user's cursor is no longer displayed, if they don't move.
# (NOTE: might take a little longer since we use a long interval.)
CURSOR_TIME_S = 15

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{debounce} = require('underscore')

{IS_TOUCH} = require('../feature')

misc = require('smc-util/misc')

exports.Cursor = Cursor = rclass
    displayName: 'Cursor'

    propTypes:
        name  : rtypes.string.isRequired
        color : rtypes.string.isRequired
        top   : rtypes.string   # doesn't change
        time  : rtypes.number

    shouldComponentUpdate: (props, state) ->
        if @props.time != props.time
            @show_name(2000)
        return misc.is_different(@props, props, ['name', 'color']) or @state.show_name != state.show_name

    getInitialState: ->
        show_name : true

    componentDidMount: ->
        @_mounted = true
        @_set_timer(2000)

    componentWillUnmount: ->
        @_mounted = false

    _clear_timer: ->
        if @_timer?
            clearTimeout(@_timer)
            delete @_timer

    _set_timer: (timeout) ->
        @_clear_timer()
        @_timer = setTimeout((=>@hide_name()), timeout)

    hide_name: ->
        if not @_mounted
            return
        @_clear_timer()
        @setState(show_name: false)

    show_name: (timeout) ->
        if not @_mounted
            return
        @setState(show_name: true)
        if timeout
            @_set_timer(timeout)

    render: ->
        # onClick is needed for mobile.
        <span
            style        = {color:@props.color, position:'relative', cursor:'text', pointerEvents : 'all', top:@props.top}
            onMouseEnter = {=>@show_name()}
            onMouseLeave = {=>@show_name(2000)}
            onTouchStart = {=>@show_name()}
            onTouchEnd   = {=>@show_name(2000)}
            >
            <span
                style={width: 0, height:'1em', borderLeft: '2px solid', position:'absolute'}
                />
            <span
                style={width: '6px', left: '-2px', top: '-2px', height: '6px', position:'absolute', backgroundColor:@props.color}
                />
            {<span
                style={position: 'absolute', fontSize: '10pt', color: '#fff', top: '-2px', left: '-2px', padding: '2px', whiteSpace: 'nowrap', background:@props.color, fontFamily:'sans-serif', boxShadow: '3px 3px 5px 0px #bbb', opacity:'0.8'}
                >{@props.name}</span> if @state.show_name}
        </span>

PositionedCursor = rclass
    propTypes:
        name       : rtypes.string.isRequired
        color      : rtypes.string.isRequired
        line       : rtypes.number.isRequired
        ch         : rtypes.number.isRequired
        codemirror : rtypes.object.isRequired
        time       : rtypes.number

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['line', 'ch', 'name', 'color', 'time'])

    _render_cursor: (props) ->
        ReactDOM.render(<Cursor name={props.name} color={props.color} top={'-1.2em'} time={@props.time}/>, @_elt)

    componentDidMount: ->
        @_mounted = true
        @_elt = document.createElement("div")
        @_elt.style.position   = 'absolute'
        @_elt.style['z-index'] = '5'
        @_render_cursor(@props)
        @props.codemirror.addWidget({line : @props.line, ch:@props.ch}, @_elt, false)

    _position_cursor: ->
        if not @_mounted or not @_pos? or not @_elt?
            return
        # move the cursor widget to pos:
        # A *big* subtlety here is that if one user holds down a key and types a lot, then their
        # cursor will move *before* their new text arrives.  This sadly leaves the cursor
        # being placed in a position that does not yet exist, hence fails.   To address this,
        # if the position does not exist, we retry.
        x = @props.codemirror.getLine(@_pos.line)
        if not x? or @_pos.ch > x.length
            # oh crap, impossible to position cursor!  Try again in 1s.
            setTimeout(@_position_cursor, 1000)
        else
            @props.codemirror.addWidget(@_pos, @_elt, false)

    componentWillReceiveProps: (next) ->
        if not @_elt?
            return
        if @props.line != next.line or @props.ch != next.ch
            @_pos = {line:next.line, ch:next.ch}
            @_position_cursor()
        # Always update how widget is rendered (this will at least cause it to display for 2 seconds after move/change).
        @_render_cursor(next)

    componentWillUnmount: ->
        @_mounted = false
        if @_elt?
            ReactDOM.unmountComponentAtNode(@_elt)
            @_elt.remove()
            delete @_elt

    render: ->
        # A simple (unused) container to satisfy react.
        <span />

StaticPositionedCursor = rclass
    propTypes:
        name       : rtypes.string.isRequired
        color      : rtypes.string.isRequired
        line       : rtypes.number.isRequired
        ch         : rtypes.number.isRequired
        time       : rtypes.number

    shouldComponentUpdate: (next) ->
        return @props.line  != next.line or \
               @props.ch    != next.ch   or \
               @props.name  != next.name or \
               @props.color != next.color

    render: ->
        style =
            position      : 'absolute'
            height        : 0
            lineHeight    : 'normal'
            fontFamily    : 'monospace'
            whiteSpace    : 'pre'
            top           : '4px'  # must match what is used in codemirror-static.
            left          : '4px'
            pointerEvents : 'none' # so clicking in the spaces (the string position below) doesn't break click to focus cell.

        # we position using newlines and blank spaces, so no measurement is needed.
        position = ('\n' for _ in [0...@props.line]).join('') + (' ' for _ in [0...@props.ch]).join('')
        <div style={style}>{position}<Cursor time={@props.time} name={@props.name} color={@props.color}/></div>


exports.Cursors = rclass
    propTypes:
        cursors    : rtypes.immutable.Map.isRequired
        codemirror : rtypes.object            # optional codemirror editor instance

    reduxProps:
        users:
            user_map: rtypes.immutable.Map
        account:
            account_id : rtypes.string

    getInitialState: ->
        n : 0

    shouldComponentUpdate: (props, state) ->
        return misc.is_different(@props, props, ['cursors', 'user_map', 'account_id']) or @state.n != state.n

    componentDidMount: ->
        @_interval = setInterval((=>@setState(n : @state.n+1)),  CURSOR_TIME_S/2*1000)

    componentWillUnmount: ->
        clearInterval(@_interval)

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
        if @props.codemirror?
            C = PositionedCursor
        else
            C = StaticPositionedCursor
        @props.cursors?.forEach (locs, account_id) =>
            {color, name} = @profile(account_id)
            locs.forEach (pos) =>
                if now - pos.get('time') <= CURSOR_TIME_S*1000
                    if account_id == @props.account_id
                        # don't show our own cursor (we just haven't made this possible due to only keying by account_id)
                        return
                    v.push <C
                        key        = {v.length}
                        time       = {pos.get('time') - 0}
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
