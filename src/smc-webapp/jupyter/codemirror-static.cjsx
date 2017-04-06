###
Rendering of static codemirror editor.

Meant to be efficient to render hundreds
of these on the page at once.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc_page     = require('../misc_page')

misc = require('smc-util/misc')

#{FormGroup, ControlLabel, FormControl, } = require('react-bootstrap')
{Dropdown, MenuItem} = require('react-bootstrap')

{Complete} = require('./complete')

{LineNumbers} = require('./line-numbers')

{Cursors} = require('./cursors')

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

    render_line_numbers: ->
        if @props.options.get('lineNumbers')
            style = background: '#f7f7f7'
            if @props.complete?.get('matches')?.size > 0
                width = @props.complete.getIn(['offset', 'gutter'])
                if width?
                    style.width = "#{width}px"

            <LineNumbers
                num_lines = {@props.value.split('\n').length}
                style     = {style}
            />

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

    render_cursors: ->
        if @props.cursors?
            <Cursors cursors = {@props.cursors} />

    render: ->
        <div style={width: '100%', display:'flex'}>
            {@render_line_numbers()}
            <div style={width: '100%'}>
                {@render_cursors()}
                {@render_code()}
                {@render_complete()}
            </div>
        </div>






