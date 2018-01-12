###
Component that shows a warning message if has_uncommitted_changes is true for more than a few seconds.
###


{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Tip} = require('../r_misc')

STYLE =
    backgroundColor : 'red'
    color           : 'white'
    padding         : '5px'
    fontWeight      : 'bold'
    marginLeft      : '5px'
    marginRight     : '-5px'
    borderRadius    : '3px'

exports.UncommittedChanges = rclass
    propTypes:
        has_uncommitted_changes : rtypes.bool
        delay_ms                : rtypes.number

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
        setTimeout(@_check, @props.delay_ms ? 5000 + 1)
        return !!next.has_uncommitted_changes != !!@props.has_uncommitted_changes

    componentWillUnmount: ->
        @_mounted = false

    componentDidMount: ->
        @_mounted = true

    render: ->
        if not @props.has_uncommitted_changes or (new Date() - @_last_change < (@props.delay_ms ? 5000))
            return <span/>
        <span style={STYLE}>
            NOT saved!
        </span>
