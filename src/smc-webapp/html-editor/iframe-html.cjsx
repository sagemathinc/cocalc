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

exports.IFrameHTML = rclass
    displayName: 'HTMLEditor-IFrameHTML'

    propTypes :
        id           : rtypes.string.isRequired
        actions      : rtypes.object.isRequired
        editor_state : rtypes.immutable.Map
        is_fullscreen: rtypes.bool
        project_id   : rtypes.string
        path         : rtypes.string
        save_to_disk : rtypes.number

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['id', 'is_fullscreen', 'project_id', 'path', 'save_to_disk'])

    componentWillReceiveProps: (next) ->
        if @props.save_to_disk != next.save_to_disk
            @reload_iframe()

    componentDidMount: ->
        @safari_hack()

    on_scroll: ->
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        scroll = $(elt).contents().scrollTop()
        @props.actions.save_editor_state(@props.id, {scroll:scroll})

    init_scroll_handler: ->
        ReactDOM.findDOMNode(@refs.iframe)?.contentDocument.addEventListener('scroll', throttle(@on_scroll, 150))

    click_iframe: ->
        @props.actions.set_active_id(@props.id, 50)

    init_click_handler: ->
        ReactDOM.findDOMNode(@refs.iframe)?.contentDocument.addEventListener('click', @click_iframe)

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
            src     = {"#{window.app_base_url}/#{@props.project_id}/raw/#{@props.path}?param=#{@props.save_to_disk}"}
            width   = {'100%'}
            height  = {'100%'}
            style   = {border:0, opacity:0}
            onLoad  = {=> @restore_scroll(); @init_scroll_handler(); @init_click_handler()}
            >
        </iframe>

    reload_iframe: ->
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        elt.contentDocument.location.reload(true)

    maximize: ->
        @props.actions.set_frame_full(@props.id)

    safari_hack: ->
        if not $.browser?.safari
            return
        $(ReactDOM.findDOMNode(@)).make_height_defined()

    render: ->
        # the cocalc-editor-div is needed for a safari hack only
        <div
            style     = {STYLE}
            className = {'cocalc-editor-div smc-vfill'}
        >
            {@render_iframe()}
        </div>


