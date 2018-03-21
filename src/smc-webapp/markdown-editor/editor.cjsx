###
Top-level react component for editing markdown documents
###

{React, rclass, rtypes} = require('../smc-react')

{FormatBar} = require('./format-bar')
{Editor, set} = require('../code-editor/editor')

{RenderedMarkdown} = require('./rendered-markdown')
{ProseMirror}      = require('./prosemirror')
{ContentEditable}  = require('./content-editable')
{CodemirrorEditor} = require('../code-editor/codemirror-editor')

EDITOR_SPEC =
    cm        :
        short     : 'Code'
        name      : 'Code'
        icon      : 'code'
        component : CodemirrorEditor
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel', 'replace', 'find', 'goto_line', \
                         'cut', 'paste', 'copy', 'undo', 'redo'])
    markdown :
        short     : 'View'
        name      : 'View'
        icon      : 'eye'
        component : RenderedMarkdown
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel'])
    prosemirror :
        short     : 'Editable'
        name      : 'Editable view'
        icon      : 'compass'
        component : ProseMirror
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel'])
    content_editable :
        short     : 'Content'
        name      : 'ContentEditable (test)'
        icon      : 'crosshairs'
        component : ContentEditable
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel'])


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

    shouldComponentUpdate: (next) ->
        return @props.editor_settings?.get('extra_button_bar') != next.editor_settings?.get('extra_button_bar')

    render_format_bar: ->
        if not @props.editor_settings?.get('extra_button_bar') or @props.is_public
            return
        <FormatBar actions={@props.actions} />

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