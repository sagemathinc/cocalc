###

###

{throttle} = require('underscore')

{React, ReactDOM, rclass, rtypes} = require('../smc-react')

{Loading} = require('../r_misc')

{Document, Page} = require('react-pdf/dist/entry.webpack')
require('react-pdf/dist/Page/AnnotationLayer.css')

util = require('../code-editor/util')


exports.PDFJS = rclass
    displayName: 'LaTeXEditor-PDFJS'

    propTypes :
        id            : rtypes.string.isRequired
        actions       : rtypes.object.isRequired
        editor_state  : rtypes.immutable.Map
        is_fullscreen : rtypes.bool
        project_id    : rtypes.string
        path          : rtypes.string
        reload        : rtypes.number
        font_size     : rtypes.number

    getInitialState: ->
        num_pages : undefined

    render_page: (number, scale) ->
        <Page
            key               = {number}
            className         = {'cocalc-pdfjs-page'}
            pageNumber        = {number}
            renderMode        = {'svg'}
            renderTextLayer   = {false}
            renderAnnotations = {true}
            scale             = {scale}
            onRenderSuccess   = {@restore_scroll}
            onClick           = {(e) => console.log('page click', e.nativeEvent.offsetX, e.nativeEvent.offsetY)}
        />

    render_pages: ->
        console.log 'render_pages', @state.num_pages
        if not @state.num_pages?
            return
        scale = (@props.font_size ? 16)/10
        return (@render_page(n, scale) for n in [1..@state.num_pages])

    render_loading: ->
        <div>
            <Loading
                style = {fontSize: '24pt', textAlign: 'center', marginTop: '15px', color: '#888'}
            />
        </div>

    document_load_success: (info) ->
        console.log 'load', info
        @setState(num_pages: info.numPages)

    on_item_click: (info) ->
        console.log 'on_item_click', info

    # TODO: these are identical in rendered-markdown.cjsx, so chance to refactor!
    on_scroll: ->
        elt = ReactDOM.findDOMNode(@refs.scroll)
        if not elt?
            return
        scroll = $(elt).scrollTop()
        console.log 'on_scroll', scroll
        @props.actions.save_editor_state(@props.id, {scroll:scroll})

    restore_scroll: ->
        scroll = @props.editor_state?.get('scroll')
        if scroll?
            elt = ReactDOM.findDOMNode(@refs.scroll)
            if elt?
                $(elt).scrollTop(scroll)

    render: ->
        file  = "#{util.raw_url(@props.project_id, @props.path)}?param=#{@props.reload}"
        <div style    = {overflowY:'scroll'}
             onScroll = {throttle(@on_scroll, 250)}
             ref      = {'scroll'}
        >
            <Document
                file          = {file}
                onLoadSuccess = {@document_load_success}
                loading       = {@render_loading()}
            >
                {@render_pages()}
            </Document>
        </div>