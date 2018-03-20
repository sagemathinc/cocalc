###
Top-level react component for editing markdown documents
###

{React, rclass, rtypes} = require('../smc-react')

{FormatBar} = require('./format-bar')
CodeEditor  = require('../code-editor/editor').Editor

{RenderedMarkdown} = require('./rendered-markdown')
{ProseMirror}      = require('./prosemirror')
{ContentEditable}  = require('./content-editable')
{CodemirrorEditor} = require('../code-editor/codemirror-editor')

EDITOR_SPEC =
    cm        :
        short     : 'Code'
        name      : 'Source code'
        icon      : 'code'
        component : CodemirrorEditor
    markdown :
        short     : 'View'
        name      : 'View'
        icon      : 'eye'
        component : RenderedMarkdown
    prosemirror :
        short     : 'Editable'
        name      : 'Editable view'
        icon      : 'compass'
        component : ProseMirror
    content_editable :
        short     : 'Content'
        name      : 'ContentEditable TEST'
        icon      : 'crosshairs'
        component : ContentEditable


exports.Editor = rclass ({name}) ->
    displayName: 'MardownEditor-Editor'

    propTypes :
        actions    : rtypes.object.isRequired
        path       : rtypes.string.isRequired
        project_id : rtypes.string.isRequired

    reduxProps :
        account :
            editor_settings : rtypes.immutable
        "#{name}" :
            is_public : rtypes.bool

    render_format_bar: ->
        if not @props.editor_settings?.get('extra_button_bar') or @props.is_public
            return
        <FormatBar actions={@props.actions} />

    render_code_editor: ->
        <CodeEditor
            name            = {name}
            actions         = {@props.actions}
            path            = {@props.path}
            project_id      = {@props.project_id}
            editor_spec     = {EDITOR_SPEC}
            />

    render: ->
        <div className='smc-vfill'>
            {@render_format_bar()}
            {@render_code_editor()}
        </div>