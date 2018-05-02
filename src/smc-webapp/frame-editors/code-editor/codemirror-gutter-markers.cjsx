###
Component that manages rendering all the gutter markers associated to a Codemirror editor.
###

{Fragment, React, ReactDOM, rclass, rtypes}  = require('smc-webapp/smc-react')

{GutterMarker}       = require('./codemirror-gutter-marker')

exports.GutterMarkers = rclass
    displayName: 'CodeEditor-GutterMarkers'

    propTypes :
        gutter_markers : rtypes.immutable.Map.isRequired
        codemirror     : rtypes.object.isRequired
        set_handle     : rtypes.func.isRequired

    shouldComponentUpdate: (props) ->
        return @props.gutter_markers != props.gutter_markers

    render_gutters: ->
        v = []
        @props.gutter_markers.forEach (info, id) =>
            handle = info.get('handle')
            if handle?
                line = @props.codemirror.lineInfo(handle)?.line
                if not line?
                    # skip adding this gutter, since it is no longer defined (e.g., the line it was in was deleted from doc)
                    return
            line      ?= info.get('line')
            component = info.get('component')
            gutter_id = info.get('gutter_id')
            elt = <GutterMarker
                key        = {id}
                codemirror = {@props.codemirror}
                line       = {line}
                gutter_id  = {gutter_id}
                set_handle = {(handle) => @props.set_handle(id, handle)}
            >
                {component}
            </GutterMarker>
            v.push(elt)
            return
        return v

    render: ->
        <span>
            {@render_gutters()}
        </span>
