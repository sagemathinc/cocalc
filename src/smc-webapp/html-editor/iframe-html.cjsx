###
Component that shows rendered HTML in an iFrame, so safe and no mangling needed...
###

misc = require('smc-util/misc')

{Alert} = require('react-bootstrap')

{throttle} = require('underscore')

{HTML} = require('../r_misc')
{React, ReactDOM, rclass, rtypes} = require('../smc-react')

STYLE =
    overflowY : 'scroll'
    width     : '100%'
    borderTop : '1px solid lightgrey'

exports.IFrameHTML = rclass
    displayName: 'HTMLEditor-IFrameHTML'

    propTypes :
        id           : rtypes.string.isRequired
        actions      : rtypes.object.isRequired
        editor_state : rtypes.immutable.Map
        is_fullscreen: rtypes.bool
        project_id   : rtypes.string
        path         : rtypes.string
        reload       : rtypes.number

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['id', 'is_fullscreen', 'project_id', 'path', 'reload'])

    componentWillReceiveProps: (next) ->
        if @props.reload != next.reload
            @reload_iframe()

    on_scroll: ->
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        scroll = $(elt).contents().scrollTop()
        @props.actions.save_editor_state(@props.id, {scroll:scroll})

    init_scroll_handler: ->
        iframe = ReactDOM.findDOMNode(@refs.iframe)
        if iframe?
            iframe.contentDocument.addEventListener('scroll', throttle(@on_scroll, 150))

    restore_scroll: ->
        scroll = @props.editor_state?.get('scroll')
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        elt = $(elt)
        if scroll?
            elt.contents().scrollTop(scroll)
        elt.css('opacity',1)

    render_iframe: ->
        <iframe
            ref     = {'iframe'}
            src     = {"#{window.app_base_url}/#{@props.project_id}/raw/#{@props.path}"}
            width   = {'100%'}
            height  = {'100%'}
            style   = {border:0, opacity:0}
            onLoad  = {=> @restore_scroll(); @init_scroll_handler()}
            >
        </iframe>

    reload_iframe: ->
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        elt.contentDocument.location.reload(true)

    maximize: ->
        @props.actions.set_frame_full(@props.id)

    render_fullscreen_message: ->
        <Alert bsStyle="warning" style={margin:'15px'}>
            IFrame display currently only supported with a single editor view.
            <br/><br/>
            Close other views or <a style={cursor:'pointer'} onClick={@maximize}>maximize this view</a>.
        </Alert>

    render: ->
        # the cocalc-editor-div is needed for a safari hack only
        <div
            style     = {STYLE}
            className = {'cocalc-editor-div smc-vfill'}
        >
            {@render_fullscreen_message() if not @props.is_fullscreen}
            {@render_iframe()}
        </div>


