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

BLURRED_STYLE =
    width         : '100%'
    overflowX     : 'hidden'
    background    : '#f7f7f7'
    lineHeight    : 'normal'
    height        : 'auto'
    fontSize      : 'inherit'
    marginBottom  : 0
    padding       : '4px'
    whiteSpace    : 'pre-wrap'
    wordWrap      : 'break-word'
    wordBreak     : 'normal'
    border        : 0
    paddingLeft   : '4px'

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

    focus: (event) ->
        if not @props.actions?  # read only
            return
        if event.shiftKey
            misc_page.clear_selection()
            @props.actions.select_cell_range(@props.id)
            event.stopPropagation()
            return
        if window.getSelection().toString()
            # User is selected some text in the cell; if we switch to edit mode
            # then the selection would be cleared, which is annoying.  NOTE that
            # this makes the behavior slightly different than official Jupyter.
            return
        @props.actions.set_mode('edit')
        @props.actions.unselect_all_cells()
        @props.actions.set_cur_id(@props.id)
        @props.set_click_coords({left:event.clientX, top:event.clientY})

    line_number: (key, line, width) ->
        <div key={key} className='CodeMirror-gutter-wrapper'>
            <div style={left:"-#{width+4}px", width:"#{width-9}px"} className='CodeMirror-linenumber CodeMirror-gutter-elt'>
                {line}
            </div>
        </div>

    render_lines: (width) ->
        mode = @props.options.getIn(['mode', 'name']) ? 'python'
        v = []
        line_numbers = !!@props.options.get('lineNumbers')
        line = 1
        if line_numbers
            append_line_number = =>
                v.push(@line_number(v.length, line, width))
                line += 1
            append_line_number()

        last_type = undefined  # used for detecting introspection
        append = (text, type) ->
            if type?
                v.push(<span key={v.length} className={'cm-'+type}>{text}</span>)
                if text.trim().length > 0
                    last_type = type
            else
                v.push(<span key={v.length}>{text}</span>)
            if line_numbers and text == '\n'
                append_line_number()

        CodeMirror.runMode(@props.value, mode, append)
        line_numbers = false; append('\n')

        @props.actions?.set_last_type(@props.id, last_type)
        return v

    render_code: ->
        if @props.options.get('lineNumbers')
            num_lines = @props.value.split('\n').length
            if num_lines < 100
                width = 30
            else if num_lines < 1000
                width = 39
            else if num_lines < 10000
                width = 49
            else # nobody better do this...
                width = 59
            style = misc.merge(misc.copy(BLURRED_STYLE), {paddingLeft: "#{width+4}px"})
        else
            width = 0
            style = BLURRED_STYLE

        <pre
            className = "CodeMirror cm-s-default CodeMirror-wrap"
            style     = {style}
            onClick   = {@focus}>
            {@render_lines(width)}
            {@render_gutter(width)}
        </pre>

    render_gutter: (width) ->
        if @props.options.get('lineNumbers')
            <div className="CodeMirror-gutters">
                <div className="CodeMirror-gutter CodeMirror-linenumbers" style={width:"#{width-1}px"}>
                </div>
            </div>

    render: ->
        <div style={width:'100%', border:'1px solid rgb(207, 207, 207)', borderRadius: '2px', position:'relative', overflowX:'auto'}>
            {@render_code()}
        </div>






