###
Component that shows rendered HTML.
###

misc = require('smc-util/misc')

{throttle} = require('underscore')

{Loading, HTML} = require('smc-webapp/r_misc')
{React, ReactDOM, rclass, rtypes}     = require('smc-webapp/smc-react')

options = require('./options.ts')

exports.RenderedHTML = rclass
    displayName: 'HTMLEditor-RenderedHTML'

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

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['id', 'project_id', 'path', 'font_size', 'read_only', 'value', 'content'])

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

    post_hook: (elt) ->
        #  make html even more sane for editing inside cocalc (not an iframe)
        elt.find('link').remove()   # gets rid of external CSS style
        elt.find('style').remove()  # gets rid of inline CSS style

    render: ->
        value = @props.value ? @props.content
        if not value?
            return <Loading />
        # the cocalc-editor-div is needed for a safari hack only
        <div
            style     = {overflowY:'scroll', width:'100%', fontSize:"#{@props.font_size}px"}
            ref       = {'scroll'}
            onScroll  = {throttle(@on_scroll, 250)}
            className = {'cocalc-editor-div'}
        >
            <div
                style = {maxWidth: options.MAX_WIDTH, margin: '10px auto', padding:'0 10px'}
            >
                <HTML
                    id         = {"frame-#{@props.id}"}
                    value      = {value}
                    project_id = {@props.project_id}
                    file_path  = {misc.path_split(@props.path).head}
                    safeHTML   = {true}
                    post_hook  = {@post_hook}
                />
            </div>
        </div>


