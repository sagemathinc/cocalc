{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

# WARNING: Complete closing when clicking outside the complete box
# is handled in cell-list on_click.  This is ugly code (since not localized),
# but seems to work well for now.  Could move.
exports.Complete = rclass
    propTypes:
        actions  : rtypes.object.isRequired
        id       : rtypes.string.isRequired
        complete : rtypes.immutable.Map.isRequired

    select: (item) ->
        @props.actions.select_complete(@props.id, item)

    close: ->
        @props.actions.clear_complete()
        @props.actions.set_mode('edit')

    render_item: (item) ->
        <li key={item}>
            <a role="menuitem" tabIndex="-1" onClick={=>@select(item)} >
                {item}
            </a>
        </li>

    componentDidMount: ->
        $(ReactDOM.findDOMNode(@)).find("a:first").focus()

    key: (e) ->
        if e.keyCode == 13
            e.preventDefault()
            e.stopPropagation()
            item = $(ReactDOM.findDOMNode(@)).find("a:focus").text()
            @select(item)
        else
            return

    render: ->
        offset = @props.complete.get('offset')?.toJS()
        style = {cursor:'pointer', top: offset.top+'px', left:offset.left+'px', opacity: .95, zIndex: 10}
        items = (@render_item(item) for item in @props.complete.get('matches')?.toJS())
        <div className = "dropdown open" style = {style}>
            <ul className="dropdown-menu cocalc-complete" style = {maxHeight:'50vh'} onKeyDown={@key} onKeyUp={@key_up}>
                {items}
            </ul>
        </div>
