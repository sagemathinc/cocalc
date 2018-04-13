###
This is a renderer using LaTeX.js, which is purely client side.

https://github.com/michael-brade/LaTeX.js
###

{throttle} = require('underscore')

{React, ReactDOM, rclass, rtypes} = require('../smc-react')

misc = require('smc-util/misc')

{HtmlGenerator} = require('../node_modules/latex.js/dist/html-generator.js')

# This CSS can only be used in an iframe...
#require('../node_modules/latex.js/dist/css/base.css')

{parse}         = require('latex.js')

{Loading} = require('../r_misc')

generator = new HtmlGenerator
    bare             : true
    hyphenate        : true
    languagePatterns : require('hyphenation.en-us')

latexjs = (latex) ->
    generator.reset()
    return parse(latex, { generator: generator })

exports.LaTeXJS = rclass
    displayName: 'LaTeXEditor-LaTeXJS'

    propTypes :
        id            : rtypes.string.isRequired
        actions       : rtypes.object.isRequired
        editor_state  : rtypes.immutable.Map
        is_fullscreen : rtypes.bool
        project_id    : rtypes.string
        path          : rtypes.string
        reload        : rtypes.number
        font_size     : rtypes.number
        value         : rtypes.string
        content       : rtypes.string
        editor_state  : rtypes.immutable.Map  # only used for initial render

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['id', 'project_id', 'path', 'font_size', 'read_only', \
               'value', 'content', 'reload_images'])

    on_scroll: ->
        elt = ReactDOM.findDOMNode(@refs.scroll)
        if not elt?
            return
        scroll = $(elt).scrollTop()
        @props.actions.save_editor_state(@props.id, {scroll:scroll})

    componentDidMount: ->
        @update_latexjs(@props.value ? @props.content)
        @restore_scroll()
        setTimeout(@restore_scroll, 200)
        setTimeout(@restore_scroll, 500)

    componentDidUpdate: ->
        setTimeout(@restore_scroll, 1)

    restore_scroll: ->
        scroll = @props.editor_state?.get('scroll')
        if scroll?
            elt = ReactDOM.findDOMNode(@refs.scroll)
            if elt?
                $(elt).scrollTop(scroll)

    update_latexjs: (s) ->
        if not s?
            return
        elt = ReactDOM.findDOMNode(@refs.scroll)
        if not elt?
            return
        elt = $(elt)
        try
            dom = latexjs(s).dom()
        catch err
            dom = $("<div>Error -- #{err}</div>")
        elt.empty()
        elt.append(dom)

    componentWillReceiveProps: (next) ->
        if next.value != @props.value
            @update_latexjs(next.value)
        else if next.content != @props.content
            @update_latexjs(next.content)

    render: ->
        <div
            ref       = {'scroll'}
            onScroll  = {throttle(@on_scroll, 250)}
            className = {'smc-vfill'}
            style     = {background:'white', padding:'15px', overflowY:'scroll', width:'100%', zoom:(@props.font_size ? 16)/16}
        >
        </div>



