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
        id            : rtypes.string.isRequired
        actions       : rtypes.object.isRequired
        editor_state  : rtypes.immutable.Map
        is_fullscreen : rtypes.bool
        project_id    : rtypes.string
        path          : rtypes.string
        reload        : rtypes.number
        font_size     : rtypes.number
        style         : rtypes.object   # should be static; change does NOT cause update.

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['reload', 'font_size'])

    componentWillReceiveProps: (next) ->
        if @props.reload != next.reload
            @reload_iframe()
        if @props.font_size != next.font_size
            @set_iframe_style(next.font_size)

    componentDidMount: ->
        @safari_hack()
        @set_iframe_style(@props.font_size)

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

    render_iframe: ->  # param below is just to avoid caching.
        <iframe
            ref     = {'iframe'}
            src     = {"#{window.app_base_url}/#{@props.project_id}/raw/#{@props.path}?param=#{@props.reload}"}
            width   = {'100%'}
            height  = {'100%'}
            style   = {border:0, opacity:0}
            onLoad  = {=> @set_iframe_style(); @restore_scroll(); @init_scroll_handler(); @init_click_handler()}
            >
        </iframe>

    reload_iframe: ->
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        $(elt).css('opacity', 0)
        elt.contentDocument.location.reload(true)

    set_iframe_style: (font_size) ->
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        body = $(elt).contents().find('body')
        body.css('font-size', "#{font_size ? @props.font_size}px")
        if @props.is_fullscreen and @props.fullscreen_style?
            body.css(@props.fullscreen_style)

    maximize: ->
        @props.actions.set_frame_full(@props.id)

    safari_hack: ->
        if not $?.browser?.safari
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



