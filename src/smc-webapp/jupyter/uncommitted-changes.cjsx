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
        delay_ms                : rtypes.number   # assumed to not change

    getDefaultProps: ->
        delay_ms : 5000

    getInitialState: ->
        counter : 0

    shouldComponentUpdate: (props, state) ->
        return @props.has_uncommitted_changes != props.has_uncommitted_changes or @state.counter != state.counter

    _check: ->
        if @_mounted and @props.has_uncommitted_changes
            # forces a re-render
            @setState(counter : @state.counter+1)

    componentWillUpdate: (new_props) ->
        if new_props.has_uncommitted_changes != @props.has_uncommitted_changes
            @_last_change = new Date()
        if new_props.has_uncommitted_changes
            setTimeout(@_check, @props.delay_ms + 10)

    componentWillUnmount: ->
        @_mounted = false

    componentDidMount: ->
        @_mounted = true
        @_last_change = new Date()  # from truly undefined to known
        setTimeout(@_check, @props.delay_ms + 10)

    render: ->
        if not @props.has_uncommitted_changes
            return <span/>
        @_last_change ?= new Date()
        if new Date() - @_last_change < @props.delay_ms
            return <span/>
        <span style={STYLE}>
            NOT saved!
        </span>
