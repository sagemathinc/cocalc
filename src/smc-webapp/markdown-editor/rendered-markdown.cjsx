###
Component that shows rendered markdown.

It also:

   - [ ] tracks and restores scroll position
   - [ ] is scrollable
   - [ ] is zoomable
   - [ ] math is properly typeset
   - [ ] checkbox in markdown are interactive (can click them, which edits file)
###

{throttle} = require('underscore')

{Loading, Markdown} = require('../r_misc')
{React, ReactDOM, rclass, rtypes}     = require('../smc-react')

options = require('./options')

exports.RenderedMarkdown = rclass
    displayName: 'MarkdownEditor-RenderedMarkdown'

    propTypes :
        id           : rtypes.string.isRequired
        actions      : rtypes.object.isRequired
        path         : rtypes.string.isRequired
        project_id   : rtypes.string.isRequired
        font_size    : rtypes.number.isRequired
        read_only    : rtypes.bool
        value        : rtypes.string
        editor_state : rtypes.immutable.Map

    on_scroll: ->
        elt = ReactDOM.findDOMNode(@refs.scroll)
        if not elt?
            return
        scroll = $(elt).scrollTop()
        @props.actions.save_editor_state(@props.id, {scroll:scroll})

    componentDidMount: ->
        @restore_scroll()
        setTimeout(@restore_scroll, 200)
        setTimeout(@restore_scroll, 500)

    restore_scroll: ->
        scroll = @props.editor_state?.get('scroll')
        if scroll?
            elt = ReactDOM.findDOMNode(@refs.scroll)
            if elt?
                $(elt).scrollTop(scroll)

    render: ->
        <div
            style    = {overflowY:'scroll', width:'100%', fontSize:"#{@props.font_size}px"}
            ref      = {'scroll'}
            onScroll = {throttle(@on_scroll, 250)}
        >
            <div
                style    = {maxWidth: options.MAX_WIDTH, margin: '0 auto', padding:'10px'}
            >
                <Markdown
                    value      = {@props.value}
                    project_id = {@props.project_id}
                    file_path  = {@props.path}
                />
            </div>
        </div>

