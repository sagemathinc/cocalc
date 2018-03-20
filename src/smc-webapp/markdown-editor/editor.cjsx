###
Top-level react component for editing markdown documents
###

{React, rclass, rtypes} = require('../smc-react')

{FormatBar} = require('./format-bar')

CodeEditor = require('../code-editor/editor').Editor
{RenderedMarkdown} = require('./rendered-markdown')

LEAF_COMPONENTS =
    md : RenderedMarkdown

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
            leaf_components = {LEAF_COMPONENTS}
            />

    render: ->
        <div className='smc-vfill'>
            {@render_format_bar()}
            {@render_code_editor()}
        </div>