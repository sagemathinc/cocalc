###
Rendering of static codemirror editor.

Meant to be efficient to render hundreds
of these on the page at once.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc_page     = require('../misc_page')

#{FormGroup, ControlLabel, FormControl, } = require('react-bootstrap')
{Dropdown, MenuItem} = require('react-bootstrap')

BLURRED_STYLE =
    width         : '100%'
    overflowX     : 'hidden'
    border        : '1px solid #cfcfcf'
    borderRadius  : '2px'
    background    : '#f7f7f7'
    lineHeight    : 'normal'
    height        : 'auto'
    fontSize      : 'inherit'
    marginBottom  : 0
    padding       : '4px'
    whiteSpace    : 'pre-wrap'
    wordWrap      : 'break-word'

# WARNING: Complete closing when clicking outside the complete box
# is handled in cell-list on_click.  This is ugly code (since not localized),
# but seems to work well for now.  Could move.
Complete = rclass
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

    key_up: (e) ->
        if e.keyCode == 13
            item = $(ReactDOM.findDOMNode(@)).find("a:focus").text()
            @select(item)
        else
            return

    render: ->
        offset = @props.complete.get('offset')?.toJS()
        style = {cursor:'pointer', top: offset.top+'px', left:offset.left+'px', opacity: .95, zIndex: 10}
        items = (@render_item(item) for item in @props.complete.get('matches')?.toJS())
        <div className = "dropdown open" style = {style}>
            <ul className="dropdown-menu cocalc-complete" style = {maxHeight:'50vh'} onKeyUp={@key_up}>
                {items}
            </ul>
        </div>


exports.CodeMirrorStatic = rclass
    propTypes:
        actions          : rtypes.object
        id               : rtypes.string.isRequired
        options          : rtypes.immutable.Map.isRequired
        value            : rtypes.string.isRequired
        font_size        : rtypes.number
        cursors          : rtypes.immutable.Map
        complete         : rtypes.immutable.Map
        set_click_coords : rtypes.func.isRequired

    render_html: ->
        if @props.value
            elt = document.createElement('pre')
            # The newline at the end is needed so that if the cell
            # ends in a blank line, it is properly rendered.
            mode = @props.options.getIn(['mode', 'name']) ? 'python'
            CodeMirror.runMode(@props.value+'\n', mode, elt)
            {__html: elt.innerHTML}
        else
            {__html: ' '}   # blank space needed for empty cell to get the right height!

    focus: (event) ->
        if not @props.actions?  # read only
            return
        if event.shiftKey
            misc_page.clear_selection()
            @props.actions.select_cell_range(@props.id)
            event.stopPropagation()
            return
        @props.actions.set_mode('edit')
        @props.actions.unselect_all_cells()
        @props.actions.set_cur_id(@props.id)
        @props.set_click_coords({left:event.clientX, top:event.clientY})

    render_code: ->
        <pre
            className               = "CodeMirror cm-s-default"
            style                   = {BLURRED_STYLE}
            onClick                 = {@focus}
            dangerouslySetInnerHTML = {@render_html()} >
        </pre>

    render_complete: ->
        if @props.complete?
            if @props.complete.get('matches')?.size > 0
                <Complete
                    complete = {@props.complete}
                    actions  = {@props.actions}
                    id       = {@props.id}
                />
            # TODO: error info...?

    render: ->
        <div style={width: '100%'}>
            {@render_code()}
            {@render_complete()}
        </div>






