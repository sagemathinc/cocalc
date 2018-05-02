###
Top-level react component for editing MediaWiki documents
###

misc = require('smc-util/misc')

{React, rclass, rtypes} = require('smc-webapp/smc-react')

{FormatBar}             = require('../frame-tree/format-bar')
{Editor, set}           = require('../code-editor/editor')

{IFrameHTML}            = require('../html-editor/iframe-html')
{CodemirrorEditor}      = require('../code-editor/codemirror-editor')

{aux_file}              = require('../code-editor/util')


EDITOR_SPEC =
    cm        :
        short     : 'Code'
        name      : 'Source Code'
        icon      : 'code'
        component : CodemirrorEditor
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel', 'replace', 'find', 'goto_line', \
                         'cut', 'paste', 'copy', 'undo', 'redo', 'reload'])

    html :
        short     : 'HTML'
        name      : 'Rendered HTML (pandoc)'
        icon      : 'html5'
        component : IFrameHTML
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel', 'reload'])
        path      : (path) -> aux_file(path, 'html')
        fullscreen_style :  # set via jquery
            'max-width' : '900px'
            'margin'    : 'auto'

exports.Editor = rclass ({name}) ->
    displayName: 'WikiEditor-Editor'

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