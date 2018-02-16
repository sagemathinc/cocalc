###
Single codemirror-based file editor

This is a wrapper around a single codemirror editor view.
###

SAVE_INTERVAL_MS = 2000

{React, ReactDOM, rclass, rtypes} = require('../smc-react')
{three_way_merge}                 = require('smc-util/syncstring')
{throttle}                        = require('underscore')
{cm_options}                      = require('./cm-options')
misc                              = require('smc-util/misc')


STYLE =
    width        : '100%'
    overflow     : 'auto'
    marginbottom : '1ex'
    minheight    : '2em'
    border       : '1px solid #ccc'
    borderRadius : '3px'
    background   : '#fff'

exports.CodeEditor = rclass
    propTypes :
        actions   : rtypes.object.isRequired
        path      : rtypes.string.isRequired
        font_size : rtypes.number

    reduxProps :
        account :
            editor_settings : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next) ->
        return @props.editor_settings != next.editor_settings or \
               @props.font_size       != next.font_size

    componentDidMount: ->
        @init_codemirror()

    componentWillReceiveProps: (next) ->
        if @props.font_size != next.font_size
            @cm_refresh()

    cm_refresh: ->
        @cm?.refresh()
        setTimeout((=>@cm?.refresh()), 30)

    componentWillUnmount: ->
        if @cm?
            @_cm_destroy()

    _cm_undo: ->
        @props.actions.undo()

    _cm_redo: ->
        @props.actions.redo()

    _cm_destroy: ->
        if not @cm?
            return
        delete @_cm_last_remote
        delete @cm.undo
        delete @cm.redo
        $(@cm.getWrapperElement()).remove()  # remove from DOM -- "Remove this from your tree to delete an editor instance."
        delete @cm
        @props.actions.set_cm()

    save_state: ->
        if not @cm?
            return
        @props.actions.set_syncstring_to_codemirror()
        @props.actions.syncstring_save()

    init_codemirror: ->
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        if not node?
            return

        options = cm_options(filename: @props.path, editor_settings: @props.editor_settings)

        keys =
            Tab            : => @cm?.tab_as_space?()
            "Cmd-S"        : @props.actions.save
            "Alt-S"        : @props.actions.save
            "Ctrl-S"       : @props.actions.save
            "Shift-Ctrl-." : @props.actions.increase_font_size
            "Shift-Ctrl-," : @props.actions.decrease_font_size
            "Shift-Cmd-."  : @props.actions.increase_font_size
            "Shift-Cmd-,"  : @props.actions.decrease_font_size

        misc.merge(options.extraKeys, keys)

        @cm = CodeMirror.fromTextArea(node, options)

        e = $(@cm.getWrapperElement())
        e.addClass('smc-vfill')
        # The Codemirror themes impose their own weird fonts, but most users want whatever
        # they've configured as "monospace" in their browser.  So we force that back:
        e.attr('style', e.attr('style') + '; height:100%; font-family:monospace !important;')
        # see http://stackoverflow.com/questions/2655925/apply-important-css-style-using-jquery

        @save_state_throttle = throttle(@save_state, SAVE_INTERVAL_MS, {leading:false})

        @cm.on 'change', (instance, changeObj) =>
            if changeObj.origin? and changeObj.origin != 'setValue'
                @save_state_throttle()
                @props.actions.exit_undo_mode()

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

        if @props.is_current
            @cm?.focus()

        setTimeout((=>@cm_refresh(); if @props.is_current then @cm?.focus()), 0)

        @props.actions.set_cm(@cm)

    render: ->
        font_size = @props.font_size ? @props.editor_settings.get('font_size') ? 15
        style = misc.merge({fontSize: "#{font_size}px"}, STYLE)
        <div
            style     = {style}
            className = 'smc-vfill' >
            <textarea />
        </div>
