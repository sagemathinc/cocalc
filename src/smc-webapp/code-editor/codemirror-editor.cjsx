###
Single codemirror-based file editor

This is a wrapper around a single codemirror editor view.
###

SAVE_INTERVAL_MS = 2000

{React, ReactDOM,
 rclass, rtypes}     = require('../smc-react')
{three_way_merge}    = require('smc-util/syncstring')
{debounce, throttle} = require('underscore')
misc                 = require('smc-util/misc')

{Cursors}            = require('../jupyter/cursors')

{cm_options}         = require('./cm-options')
codemirror_util      = require('./codemirror-util')
doc                  = require('./doc')

{GutterMarker}       = require('./codemirror-gutter-marker')

STYLE =
    width        : '100%'
    overflow     : 'auto'
    marginbottom : '1ex'
    minheight    : '2em'
    border       : '0px'
    background   : '#fff'

exports.CodemirrorEditor = rclass ({name}) ->
    displayName: 'CodeEditor-CodemirrorEditor'

    propTypes :
        id               : rtypes.string.isRequired
        actions          : rtypes.object.isRequired
        path             : rtypes.string.isRequired
        font_size        : rtypes.number.isRequired
        cursors          : rtypes.immutable.Map
        editor_state     : rtypes.immutable.Map
        read_only        : rtypes.bool
        is_current       : rtypes.bool
        is_public        : rtypes.bool
        content          : rtypes.string  # if defined and is_public, use this static value and editor is read-only
        misspelled_words : rtypes.immutable.Set
        resize           : rtypes.number

    reduxProps :
        account :
            editor_settings : rtypes.immutable.Map.isRequired

    getDefaultProps: ->
        content : ''

    getInitialState: ->
        has_cm : false

    shouldComponentUpdate: (props, state) ->
        return misc.is_different(@state, state, ['has_cm']) or \
               misc.is_different(@props, props, ['editor_settings', 'font_size', 'cursors', 'read_only',
                           'content', 'is_public', 'resize', 'editor_state'])

    componentDidMount: ->
        @init_codemirror()

    componentWillReceiveProps: (next) ->
        if @props.font_size != next.font_size
            @cm_update_font_size()
        if not @cm?
            return
        if @props.read_only != next.read_only
            @cm.setOption('readOnly', next.read_only)
        if @props.is_public and @props.content != next.content
            @cm.setValue(@props.content)
        if @props.misspelled_words != next.misspelled_words
            @cm_highlight_misspelled_words(next.misspelled_words)
        if @props.resize != next.resize or @props.editor_state != next.editor_state
            @cm_refresh()

    _cm_refresh: ->
        @cm?.refresh()

    cm_refresh: ->
        setTimeout(@_cm_refresh, 0)

    cm_highlight_misspelled_words: (words) ->
        @cm.spellcheck_highlight(words?.toJS() ? [])

    cm_update_font_size: ->
        if not @cm?
            return
        # It's important to move the scroll position upon zooming -- otherwise the cursor line
        # move UP/DOWN after zoom, which is very annoying.
        state = codemirror_util.get_state(@cm)
        codemirror_util.restore_state(@cm, state)  # actual restore happens in next refresh cycle after render.

    componentWillUnmount: ->
        if @cm? and not @props.is_public?
            @save_editor_state()
            @save_syncstring()
            @_cm_destroy()

    _cm_undo: ->
        @props.actions.undo()

    _cm_redo: ->
        @props.actions.redo()

    _cm_destroy: ->
        if not @cm?
            return
        @props.actions.unset_cm(@props.id)
        delete @_cm_last_remote
        delete @cm.undo
        delete @cm.redo
        $(@cm.getWrapperElement()).remove()  # remove from DOM -- "Remove this from your tree to delete an editor instance."
        delete @cm

    _cm_cursor: ->
        if not @cm?
            return
        locs = ({x:c.anchor.ch, y:c.anchor.line} for c in @cm.listSelections())
        # is cursor move is being caused by external setValueNoJump, so just a side effect of something another user did.
        side_effect = @cm._setValueNoJump
        @props.actions.set_cursor_locs(locs, side_effect)

    # Save the UI state of the CM (not the actual content) -- scroll position, selections, etc.
    save_editor_state: ->
        if not @cm?
            return
        state = codemirror_util.get_state(@cm)
        if state?
            @props.actions.save_editor_state(@props.id, state)

    # Save the underlying syncstring content.
    save_syncstring: ->
        if not @cm? or @props.is_public
            return
        @props.actions.set_syncstring_to_codemirror()
        @props.actions.syncstring_save()

    safari_hack: ->
        if not $?.browser?.safari
            return
        $(ReactDOM.findDOMNode(@)).make_height_defined()

    init_codemirror: ->
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        if not node?
            return

        @safari_hack()

        options = cm_options
            filename        : @props.path
            editor_settings : @props.editor_settings
            actions         : @props.actions
            frame_id        : @props.id
            gutters         : ['Codemirror-latex-errors']

        @_style_active_line = options.styleActiveLine
        options.styleActiveLine = false

        if @props.is_public
            options.readOnly = true

        # Needed e.g., for vim ":w" support; obviously this is global, so be careful.
        CodeMirror.commands.save ?= (cm) -> cm._actions?.save(true)

        @cm = CodeMirror.fromTextArea(node, options)

        if not @props.is_public
            @cm_highlight_misspelled_words(@props.misspelled_words)

        @cm._actions = @props.actions

        if @props.is_public
            @cm.setValue(@props.content)
        else
            d = doc.get(path: @props.path, cm: @cm)
            if d?
                @cm.swapDoc(d)

        if @props.editor_state?
            codemirror_util.restore_state(@cm, @props.editor_state.toJS())

        save_editor_state = throttle(@save_editor_state, 250)
        @cm.on('scroll', save_editor_state)

        e = $(@cm.getWrapperElement())
        e.addClass('smc-vfill')
        # The Codemirror themes impose their own weird fonts, but most users want whatever
        # they've configured as "monospace" in their browser.  So we force that back:
        e.attr('style', e.attr('style') + '; height:100%; font-family:monospace !important;')
        # see http://stackoverflow.com/questions/2655925/apply-important-css-style-using-jquery

        @setState(has_cm: true)

        @props.actions.set_cm(@props.id, @cm)

        if @props.is_public
            return

        # After this only stuff that we use for the non-public version!
        save_syncstring_throttle = throttle(@save_syncstring, SAVE_INTERVAL_MS, {leading:false})
        #save_syncstring_debounce = debounce(@save_syncstring, SAVE_INTERVAL_MS)

        @cm.on 'change', (instance, changeObj) =>
            save_syncstring_throttle()
            if changeObj.origin? and changeObj.origin != 'setValue'
                @props.actions.setState(has_unsaved_changes: true)
                @props.actions.exit_undo_mode()

        @cm.on 'focus', =>
            @props.actions.set_active_id(@props.id)
            if @_style_active_line
                @cm?.setOption('styleActiveLine', true)

        @cm.on 'blur', =>
            if @_style_active_line
                @cm?.setOption('styleActiveLine', false)

        @cm.on 'cursorActivity', @_cm_cursor
        @cm.on 'cursorActivity', save_editor_state

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

        if @props.is_current
            @cm?.focus()

        setTimeout((=>@cm_refresh(); if @props.is_current then @cm?.focus()), 0)

        @cm.setOption('readOnly', @props.read_only)

    render_cursors: ->
        if @props.cursors? and @cm? and @state.has_cm
            # Very important not to render without cm defined, because that renders to static Codemirror instead.
            <Cursors
                cursors    = {@props.cursors}
                codemirror = {@cm} />

    render_gutter_markers: ->
        if @cm? and @state.has_cm
            <GutterMarker
                codemirror = {@cm}
                line       = {1}
                gutter_id  = {'Codemirror-latex-errors'}
                />

    render: ->
        style = misc.copy(STYLE)
        style.fontSize = "#{@props.font_size}px"
        <div
            style     = {style}
            className = 'smc-vfill cocalc-editor-div' >
            {@render_cursors()}
            {@render_gutter_markers()}
            <textarea />
        </div>
