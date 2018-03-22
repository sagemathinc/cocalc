###
Component that shows rendered markdown.

It also:

   - [ ] tracks and restores scroll position
   - [ ] is scrollable
   - [ ] is zoomable
   - [ ] math is properly typeset
   - [ ] checkbox in markdown are interactive (can click them, which edits file)
###

{path_split} = require('smc-util/misc')

{throttle} = require('underscore')

{Loading, Markdown} = require('../r_misc')
{React, ReactDOM, rclass, rtypes}     = require('../smc-react')

{process_checkboxes} = require('../tasks/desc-rendering')
{apply_without_math} = require('smc-util/mathjax-utils-2')

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
        content      : rtypes.string         # used instead of file is public
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

    on_click: (e) ->  # same idea as in tasks/desc-rendered.cjsx
        if @props.read_only
            return
        data = e.target?.dataset
        if not data?
            return
        if data.checkbox?
            e.stopPropagation()
            @props.actions.toggle_markdown_checkbox(@props.id, parseInt(data.index), data.checkbox == 'true')

    render: ->
        value = @props.value ? @props.content
        if not value?
            return <Loading />
        value = apply_without_math(value, process_checkboxes)
        # the cocalc-editor-div is needed for a safari hack only
        <div
            style     = {overflowY:'scroll', width:'100%', fontSize:"#{@props.font_size}px"}
            ref       = {'scroll'}
            onScroll  = {throttle(@on_scroll, 250)}
            onClick   = {@on_click}
            className = {'cocalc-editor-div'}
        >
            <div
                style = {maxWidth: options.MAX_WIDTH, margin: '10px auto', padding:'0 10px'}
            >
                <Markdown
                    id         = {"frame-#{@props.id}"}
                    value      = {value}
                    project_id = {@props.project_id}
                    file_path  = {path_split(@props.path).head}
                />
            </div>
        </div>

