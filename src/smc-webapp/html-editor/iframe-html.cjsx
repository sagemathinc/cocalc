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
        elt = ReactDOM.findDOMNode(@refs.scroll)
        if not elt?
            return
        scroll = $(elt).scrollTop()
        @props.actions.save_editor_state(@props.id, {scroll:scroll})

    componentDidMount: ->
        @props.actions.reload()
        @set_iframe_content()
        @restore_scroll()
        setTimeout(@restore_scroll, 200)
        setTimeout(@restore_scroll, 500)

    componentDidUpdate: ->
        @set_iframe_content()

    restore_scroll: ->
        scroll = @props.editor_state?.get('scroll')
        if scroll?
            elt = ReactDOM.findDOMNode(@refs.scroll)
            if elt?
                $(elt).scrollTop(scroll)

    render_iframe: ->
        <iframe
            ref     = {'iframe'}
            id      = {"frame-#{@props.id}"}
            src     = {'about:blank'}
            width   = {'100%'}
            height  = {'100%'}
            style   = {border:0}
            />

    set_iframe_content: ->
        elt = ReactDOM.findDOMNode(@refs.iframe)
        if not elt?
            return
        doc = elt.contentWindow.document
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
        #if not @props.is_fullscreen
        #    return @render_fullscreen_message()
        if not @props.content
            return <Loading />
        # the cocalc-editor-div is needed for a safari hack only
        <div
            style     = {overflowY:'scroll', width:'100%', fontSize:"#{@props.font_size}px"}
            ref       = {'scroll'}
            onScroll  = {throttle(@on_scroll, 250)}
            className = {'cocalc-editor-div smc-vfill'}
        >
            {@render_iframe()}
        </div>


