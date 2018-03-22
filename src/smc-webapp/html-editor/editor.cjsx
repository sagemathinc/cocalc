###
Top-level react component for editing HTML documents
###

{React, rclass, rtypes} = require('../smc-react')

{FormatBar}             = require('../markdown-editor/format-bar')
{Editor, set}           = require('../code-editor/editor')

{RenderedHTML}          = require('./rendered-html')
{IFrameHTML}            = require('./iframe-html')
{CodemirrorEditor}      = require('../code-editor/codemirror-editor')

EDITOR_SPEC =
    cm        :
        short     : 'Source'
        name      : 'Source HTML'
        icon      : 'code'
        component : CodemirrorEditor
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel', 'replace', 'find', 'goto_line', \
                         'cut', 'paste', 'copy', 'undo', 'redo', 'reload'])
    html :
        short     : 'View'
        name      : 'HTML (sanitized)'
        icon      : 'html5'
        component : RenderedHTML
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel', 'reload'])

    iframe :
        short     : 'IFrame'
        name      : 'IFrame (unsanitized)'
        icon      : 'globe'
        component : IFrameHTML
        buttons   : set(['print', 'save', 'time_travel', 'reload', 'private-reload'])

exports.Editor = rclass ({name}) ->
    displayName: 'HTMLEditor-Editor'

    propTypes :
        actions    : rtypes.object.isRequired
        path       : rtypes.string.isRequired
        project_id : rtypes.string.isRequired

    reduxProps :
        account :
            editor_settings : rtypes.immutable
        "#{name}" :
            is_public  : rtypes.bool
            format_bar : rtypes.immutable.Map    # optional extra state of the format bar, stored in the Store

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