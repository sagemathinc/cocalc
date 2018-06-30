###
Rendering of static codemirror editor.

Meant to be efficient to render hundreds
of these on the page at once.
###

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

misc_page     = require('../misc_page')

misc = require('smc-util/misc')

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

exports.CodeMirrorStatic = rclass
    displayName : 'CodeMirrorStatic'

    propTypes:
        value            : rtypes.string.isRequired
        actions          : rtypes.object
        id               : rtypes.string
        options          : rtypes.immutable.Map
        font_size        : rtypes.number
        complete         : rtypes.immutable.Map
        set_click_coords : rtypes.func
        style            : rtypes.object   # optional style that is merged into BLURRED_STYLE
        no_border        : rtypes.bool     # if given, do not draw border around whole thing

    focus: (event) ->
        if not @props.actions?  or not @props.id? # read only
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
            event.stopPropagation()
            return
        @props.actions.unselect_all_cells()
        @props.actions.set_cur_id(@props.id)
        @props.actions.set_mode('edit')  # important to set this *AFTER* setting the current id - see issue #2547
        @props.set_click_coords?({left:event.clientX, top:event.clientY})

    line_number: (key, line, width) ->
        <div key={key} className='CodeMirror-gutter-wrapper'>
            <div style={left:"-#{width+4}px", width:"#{width-9}px"} className='CodeMirror-linenumber CodeMirror-gutter-elt'>
                {line}
            </div>
        </div>

    render_lines: (width) ->
        mode = @props.options?.getIn(['mode', 'name']) ? 'python'
        v = []
        line_numbers = !!@props.options?.get('lineNumbers')
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

        return v

    render_code: ->
        # NOTE: for #v1 this line numbers code is NOT used for now.  It works perfectly regarding
        # look and layout, but there is trouble with copying, which copies the line numbers too.
        # This can be fixed via a standard trick of having an invisible text area or div
        # in front with the same content... but that's a speed optimization for later.
        if @props.options?.get('lineNumbers')
            num_lines = @props.value.split('\n').length
            if num_lines < 100
                width = 30
            else if num_lines < 1000
                width = 39
            else if num_lines < 10000
                width = 49
            else # nobody better do this...
                width = 59
            style = misc.merge({paddingLeft: "#{width+4}px"}, BLURRED_STYLE)
            if @props.style?
                style = misc.merge(style, @props.style)
        else
            width = 0
            style = BLURRED_STYLE
            if @props.style?
                style = misc.merge(misc.copy(style), @props.style)

        <pre
            className = "CodeMirror cm-s-default CodeMirror-wrap"
            style     = {style}
            onMouseUp = {@focus}>
            {@render_lines(width)}
            {@render_gutter(width)}
        </pre>

    render_gutter: (width) ->
        if @props.options?.get('lineNumbers')
            <div className="CodeMirror-gutters">
                <div className="CodeMirror-gutter CodeMirror-linenumbers" style={width:"#{width-1}px"}>
                </div>
            </div>

    render: ->
        style =
            width        : '100%'
            borderRadius : '2px'
            position     : 'relative'
            overflowX    : 'auto'
        if not @props.no_border
            style.border = '1px solid rgb(207, 207, 207)'
        <div style={style}>
            {@render_code()}
        </div>






