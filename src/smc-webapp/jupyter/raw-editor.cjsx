###
Raw editable view of .ipynb file json, including metadata.

WARNING:  There are many similarities between the code in this file and in
the file codemirror-editor.cjsx, and also many differences.  Part of the
subtlely comes from editing JSON, but not saving when state is invalid.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc = require('smc-util/misc')

{Loading} = require('../r_misc')

{JSONEditor} = require('./json-editor')

exports.RawEditor = rclass
    propTypes:
        actions    : rtypes.object.isRequired
        font_size  : rtypes.number.isRequired
        raw_ipynb  : rtypes.immutable.Map.isRequired
        cm_options : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next) ->
        return @props.font_size  != next.font_size or \
               @props.raw_ipynb  != next.raw_ipynb or \
               @props.cm_options != next.cm_options

    render_desc: ->
        s = "This is an editable view IPynb notebook's underlying .ipynb file "
        s += " (images are replaced by sha1 hashes)."
        <div style={color:"#666", fontSize: '12pt', marginBottom: '15px'}>
            {s}
        </div>

    on_change: (obj) ->
        @props.actions.set_to_ipynb(obj)

    render_editor: ->
        <JSONEditor
            value      = {@props.raw_ipynb}
            font_size  = {@props.font_size}
            on_change  = {@on_change}
            cm_options = {@props.cm_options}
            undo       = {@props.actions.undo}
            redo       = {@props.actions.redo}
        />

    render: ->
        style =
            fontSize        : "#{@props.font_size}px"
            backgroundColor : '#eee'
            height          : '100%'
            overflowY       : 'auto'
            overflowX       : 'hidden'

        viewer_style =
            backgroundColor : '#fff'
            boxShadow       : '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'
            height          : '100%'

        <div style={style}>
            <div style={viewer_style}>
                {@render_editor()}
            </div>
        </div>
