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

Completions = rclass
    propTypes:
        complete : rtypes.immutable.Map.isRequired
        actions  : rtypes.object.isRequired

    select: (item) ->
        console.log("select '#{item}'")
        @close()

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
        switch e.keyCode
            when 27 # escape
                @close()
            when 13 # enter
                item = $(ReactDOM.findDOMNode(@)).find("a:focus").text()
                @select(item)
        return

    render: ->
        items = (@render_item(item) for item in @props.complete.get('matches')?.toJS())
        <div className = "dropdown open" style = {cursor:'pointer'}>
            <ul className="dropdown-menu xyz" style = {maxHeight:'50vh'} onKeyUp={@key_up}>
                {items}
            </ul>
        </div>


exports.CodeMirrorStatic = rclass
    propTypes:
        actions   : rtypes.object
        id        : rtypes.string.isRequired
        options   : rtypes.immutable.Map.isRequired
        value     : rtypes.string.isRequired
        font_size : rtypes.number
        cursors   : rtypes.immutable.Map
        complete  : rtypes.immutable.Map

    render_html: ->
        if @props.value
            elt = document.createElement('pre')
            CodeMirror.runMode(@props.value, 'python', elt)
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
                <Completions
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






