###
This is a renderer using pdf.js indirectly via react-pdf.

TODO: I will surely rewrite this from scratch directly using pdf.js, since it's critical to have
multiple views of the same document, where the document only gets loaded once.  Also, it
should survive unmount and remount properly, without having to reload the doc.  This can
only be done via direct use of pdf.js.   But that will get done later.
###

{throttle} = require('underscore')

misc = require('smc-util/misc')

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
        render    : 'svg'    # probably only use this, but easy to switch for now for testing.
        #render    : 'canvas'

    shouldComponentUpdate: (props, state) ->
        return misc.is_different(@props, props, ['reload', 'font_size']) or \
            misc.is_different(@state, state, ['num_pages', 'render'])

    svg_hack: ->
        if @state.render != 'svg'
            return
        editor = $(ReactDOM.findDOMNode(@refs.scroll))
        v = []
        for elt in editor.find(".react-pdf__Page__svg")
            a = $(elt)
            b = $(a.children()[0])
            b.css('max-width','')
            a.width(b.width() + 'px')
        return

    render_page: (number, scale) ->
        <Page
            key               = {number}
            className         = {'cocalc-pdfjs-page'}
            pageNumber        = {number}
            renderMode        = {@state.render}
            renderTextLayer   = {false}
            renderAnnotations = {true}
            scale             = {scale}
            onRenderSuccess   = {@restore_scroll}
            onClick           = {(e) => console.log('page click', e.nativeEvent.offsetX, e.nativeEvent.offsetY)}
        />

    render_pages: ->
        if @state.num_pages?
            setTimeout(@show, 150)
        scale = (@props.font_size ? 16)/10
        return (@render_page(n, scale) for n in [1..@state.num_pages])

    render_loading: ->
        <div>
            <Loading
                style = {fontSize: '24pt', textAlign: 'center', marginTop: '15px', color: '#888', background:'white'}
            />
        </div>

    document_load_success: (info) ->
        @setState(num_pages: info.numPages)

    show: ->
        $(ReactDOM.findDOMNode(@refs.scroll)).css('opacity', 1)

    on_item_click: (info) ->
        console.log 'on_item_click', info

    on_scroll: ->
        elt = ReactDOM.findDOMNode(@refs.scroll)
        if not elt?
            return
        elt = $(elt)
        scroll = {top:elt.scrollTop(), left:elt.scrollLeft()}
        @props.actions.save_editor_state(@props.id, {scroll:scroll})

    restore_scroll: ->
        scroll = @props.editor_state?.get('scroll')
        if scroll?
            elt = ReactDOM.findDOMNode(@refs.scroll)
            if elt?
                elt = $(elt)
                elt.scrollTop(scroll.get?('top'))
                elt.scrollLeft(scroll.get?('left'))
        @svg_hack()

    componentDidUpdate: ->
        @svg_hack()

    render: ->
        file  = "#{util.raw_url(@props.project_id, @props.path)}?param=#{@props.reload}"
        <div style    = {overflow:'scroll', margin:'auto', width:'100%', opacity:0}
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