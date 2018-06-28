###
Codemirror-based input cell

TODO:

 - [ ] need to merge in changes rather than just overwrite when get new changes from remote

###


{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{CodeMirrorEditor} = require('./codemirror-editor')
{CodeMirrorStatic} = require('./codemirror-static')

{IS_TOUCH} = require('../feature')

exports.CodeMirror = rclass
    propTypes:
        actions      : rtypes.object
        id           : rtypes.string.isRequired
        options      : rtypes.immutable.Map.isRequired
        value        : rtypes.string.isRequired
        font_size    : rtypes.number  # not explicitly used, but critical to re-render on change so Codemirror recomputes itself!
        is_focused   : rtypes.bool.isRequired
        cursors      : rtypes.immutable.Map
        complete     : rtypes.immutable.Map

    getInitialState: ->
        click_coords : undefined  # coordinates if static input was just clicked on
        last_cursor  : undefined  # last cursor position when editing

    set_click_coords: (coords) ->
        @setState(click_coords: coords)

    set_last_cursor: (pos) ->
        if @_is_mounted  # ignore unless mounted -- can still get called due to caching of cm editor
            @setState(last_cursor: pos)

    componentDidMount: ->
        @_is_mounted = true

    componentWillUnmount: ->
        @_is_mounted = false

    shouldComponentUpdate: (next) ->
        return \
            next.id           != @props.id or \
            next.options      != @props.options or \
            next.value        != @props.value or \
            next.font_size    != @props.font_size or\
            next.is_focused   != @props.is_focused or\
            next.cursors      != @props.cursors or \
            next.complete     != @props.complete

    render: ->
        # Regarding IS_TOUCH, see https://github.com/sagemathinc/cocalc/issues/2584 -- fix that properly and then
        # we can remove this use of the slower non-static fallback...
        if @props.actions? and (IS_TOUCH or @props.is_focused or @props.options.get('lineNumbers') or @props.cursors?.size > 0)
            <CodeMirrorEditor
                actions          = {@props.actions}
                id               = {@props.id}
                options          = {@props.options}
                value            = {@props.value}
                font_size        = {@props.font_size}
                cursors          = {@props.cursors}
                click_coords     = {@state.click_coords}
                set_click_coords = {@set_click_coords}
                set_last_cursor  = {@set_last_cursor}
                last_cursor      = {@state.last_cursor}
                is_focused       = {@props.is_focused}
                complete         = {@props.complete}
                />
        else
            <CodeMirrorStatic
                actions          = {@props.actions}
                id               = {@props.id}
                options          = {@props.options}
                value            = {@props.value}
                font_size        = {@props.font_size}
                complete         = {@props.complete}
                set_click_coords = {@set_click_coords}
                />
