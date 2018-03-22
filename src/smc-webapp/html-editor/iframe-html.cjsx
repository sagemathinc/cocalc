###
Component that shows rendered HTML in an iFrame, so safe and no mangling needed...
###

misc = require('smc-util/misc')

{Alert} = require('react-bootstrap')
{path_split} = require('smc-util/misc')

{throttle} = require('underscore')

{Loading, HTML} = require('../r_misc')
{React, ReactDOM, rclass, rtypes}     = require('../smc-react')

options = require('./options')

exports.IFrameHTML = rclass
    displayName: 'HTMLEditor-IFrameHTML'

    propTypes :
        id           : rtypes.string.isRequired
        actions      : rtypes.object.isRequired
        content      : rtypes.string
        editor_state : rtypes.immutable.Map
        is_fullscreen: rtypes.bool

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['id', 'content', 'is_fullscreen'])

    on_scroll: ->
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        scroll = $(elt).contents().scrollTop()
        @props.actions.save_editor_state(@props.id, {scroll:scroll})

    componentDidMount: ->
        @props.actions.reload()
        @set_iframe_content()
        @init_scroll_handler()

    componentDidUpdate: ->
        @set_iframe_content()

    init_scroll_handler: ->
        iframe = ReactDOM.findDOMNode(@refs.iframe)
        if iframe?
            iframe.contentDocument.addEventListener('scroll', throttle(@on_scroll, 150))

    restore_scroll: ->
        scroll = @props.editor_state?.get('scroll')
        if scroll?
            elt = ReactDOM.findDOMNode(@refs.iframe)
            if elt?
                e = $(elt)
                e.contents().scrollTop(scroll)
                e.css('opacity', 1)

    render_iframe: ->
        <iframe
            ref     = {'iframe'}
            src     = {'about:blank'}
            width   = {'100%'}
            height  = {'100%'}
            style   = {border:0}
            onLoad  = {@restore_scroll}
            >
        </iframe>

    set_iframe_content: ->
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        doc = elt.contentWindow.document
        $(elt).css('opacity',0)
        doc.open()
        doc.write(@props.content)
        doc.close()

    maximize: ->
        @props.actions.set_frame_full(@props.id)

    render_fullscreen_message: ->
        <Alert bsStyle="warning" style={margin:'15px'}>
            IFrame display currently only supported with a single editor view.
            <br/><br/>
            Close other views or <a style={cursor:'pointer'} onClick={@maximize}>maximize this view</a>.
        </Alert>

    render: ->
        if not @props.is_fullscreen
            return @render_fullscreen_message()
        # the cocalc-editor-div is needed for a safari hack only
        <div
            style     = {overflowY:'scroll', width:'100%', fontSize:"#{@props.font_size}px"}
            className = {'cocalc-editor-div smc-vfill'}
        >
            {<Loading /> if not @props.content}
            {@render_iframe()}
        </div>


