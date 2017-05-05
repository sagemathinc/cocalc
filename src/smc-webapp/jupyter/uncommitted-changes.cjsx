###
Component that shows a warning message if has_uncommitted_changes is true for more than a few seconds.
###


{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

STYLE =
    backgroundColor : 'red'
    padding         : '5px'
    marginLeft      : '5px'
    marginRight     : '-5px'
    borderRadius    : '3px'

danger = 'DANGER: File NOT sent to server and not saved to disk.  You will lose work if you close this file.'

exports.UncommittedChanges = rclass
    propTypes:
        has_uncommitted_changes  : rtypes.bool
        delay_ms                 : rtypes.number

    getInitialState: ->
        counter : 0

    _check: ->
        if @_mounted and @props.has_uncommitted_changes
            # force re-render
            @setState(counter : @state.counter+1)

    shouldComponentUpdate: (next, next_state) ->
        if next_state?.counter != @state.counter
            return true
        @_last_change = new Date()
        setTimeout(@_check, @props.delay_ms ? 3000 + 1)
        return next.has_uncommitted_changes != @props.has_uncommitted_changes

    componentWillUnmount: ->
        @_mounted = false

    componentDidMount: ->
        @_mounted = true

    render: ->
        if not @props.has_uncommitted_changes or (new Date() - @_last_change < (@props.delay_ms ? 3000))
            return <span/>
        # actually render it.
        <span
            style = {STYLE}
            title = {danger}
        >
            NOT saved!
        </span>

