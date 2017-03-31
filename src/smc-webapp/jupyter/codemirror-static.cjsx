###
Rendering of static codemirror editor.

Meant to be efficient to render hundreds
of these on the page at once.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc_page     = require('../misc_page')


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
    paddingTop    : '4px'
    paddingBottom : '4px'
    paddingLeft   : '4px'
    whiteSpace    : 'pre-wrap'
    wordWrap      : 'break-word'

exports.CodeMirrorStatic = rclass
    propTypes :
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

    render: ->
        # console.log JSON.stringify(@props.complete?.get('matches')?.toJS())
        <pre
            className               = "CodeMirror cm-s-default"
            style                   = {BLURRED_STYLE}
            onClick                 = {@focus}
            dangerouslySetInnerHTML = {@render_html()} >
        </pre>
