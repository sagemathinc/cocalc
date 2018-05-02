###
Top-level react component for editing R markdown documents
###

misc = require('smc-util/misc')

{React, rclass, rtypes} = require('../smc-react')

{FormatBar}             = require('../frame-tree/format-bar')
{RenderedMarkdown}      = require('../markdown-editor/rendered-markdown')

{Editor, set}           = require('../code-editor/editor')
{CodemirrorEditor}      = require('../code-editor/codemirror-editor')


EDITOR_SPEC =
    cm        :
        short     : 'Code'
        name      : 'Source Code'
        icon      : 'code'
        component : CodemirrorEditor
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel', 'replace', 'find', 'goto_line', \
                         'cut', 'paste', 'copy', 'undo', 'redo', 'reload'])
    markdown :
        short         : 'View'
        name          : 'Rendered View (Knitr)'
        icon          : 'eye'
        component     : RenderedMarkdown
        reload_images : true
        buttons       : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel', 'reload'])

exports.Editor = rclass ({name}) ->
    displayName: 'RmdEditor-Editor'

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