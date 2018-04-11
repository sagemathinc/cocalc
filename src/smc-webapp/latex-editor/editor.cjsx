###
Top-level react component for editing LaTeX documents
###

misc = require('smc-util/misc')

{React, rclass, rtypes} = require('../smc-react')

{FormatBar}             = require('../markdown-editor/format-bar')
{Editor, set}           = require('../code-editor/editor')

{PDFJS}                 = require('./pdfjs')
{PDFEmbed}              = require('./pdf-embed')
{LaTeXJS}               = require('./latexjs')
{CodemirrorEditor}      = require('../code-editor/codemirror-editor')
{Build}                 = require('./build')
{ErrorsAndWarnings}     = require('./errors-and-warnings')

pdf_path = (path) ->
    return path.slice(0, path.length-3) + 'pdf'

EDITOR_SPEC =
    cm        :
        short     : 'LaTeX'
        name      : 'LaTeX Source Code'
        icon      : 'code'
        component : CodemirrorEditor
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel', 'replace', 'find', 'goto_line', \
                         'cut', 'paste', 'copy', 'undo', 'redo', 'help'])

    pdfjs :
        short     : 'PDF View'
        name      : 'PDF View (pdf.js)'
        icon      : 'file-pdf-o'
        component : PDFJS
        buttons   : set(['print', 'save', 'reload', 'decrease_font_size', 'increase_font_size'])
        path      : pdf_path
        style     : {'background': '#525659'}


    error  :
        short     : 'Errors'
        name      : 'Errors and Warnings'
        icon      : 'bug'
        component : ErrorsAndWarnings
        buttons   : set(['reload', 'decrease_font_size', 'increase_font_size'])

    build  :
        short     : 'Build'
        name      : 'Build control'
        icon      : 'terminal'
        component : Build
        buttons   : set(['reload', 'decrease_font_size', 'increase_font_size'])

    embed:
        short     : 'PDF Embed'
        name      : 'PDF Embedded Viewer'
        icon      : 'file-pdf-o'
        buttons   : set(['print', 'save', 'reload'])
        component : PDFEmbed
        path      : pdf_path

    latexjs :
        short     : 'Quick Preview'
        name      : 'Quick Preview (LaTeX.js)'
        icon      : 'file-pdf-o'
        component : LaTeXJS
        buttons   : set(['print', 'save', 'reload', 'decrease_font_size', 'increase_font_size'])
        style     : {'background': '#525659'}


exports.Editor = rclass ({name}) ->
    displayName: 'LaTeX-Editor'

    propTypes :
        actions    : rtypes.object.isRequired
        path       : rtypes.string.isRequired
        project_id : rtypes.string.isRequired

    reduxProps :
        account :
            editor_settings : rtypes.immutable
        "#{name}" :
            is_public     : rtypes.bool
            format_bar    : rtypes.immutable.Map    # optional extra state of the format bar, stored in the Store

    shouldComponentUpdate: (next) ->
        return @props.editor_settings?.get('extra_button_bar') != next.editor_settings?.get('extra_button_bar') or \
            @props.format_bar != next.format_bar

    render_format_bar: ->
        if not @props.editor_settings?.get('extra_button_bar') or @props.is_public
            return
        <FormatBar
            actions = {@props.actions}
            store   = {@props.format_bar}
            />

    render_editor: ->
        <Editor
            name            = {name}
            actions         = {@props.actions}
            path            = {@props.path}
            project_id      = {@props.project_id}
            editor_spec     = {EDITOR_SPEC}
            />

    render: ->
        <div className='smc-vfill'>
            {@render_format_bar()}
            {@render_editor()}
        </div>