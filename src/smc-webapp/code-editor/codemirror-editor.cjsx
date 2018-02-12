###
Single codemirror-based file editor

This is a wrapper around a single codemirror editor view.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{three_way_merge} = require('smc-util/syncstring')

{throttle} = require('underscore')

{cm_options} = require('../jupyter/cm_options')

misc = require('smc-util/misc')

STYLE =
    width        : '100%'
    overflow     : 'auto'
    marginbottom : '1ex'
    minheight    : '2em'
    padding      : '5px'
    border       : '1px solid #ccc'
    borderRadius : '3px'
    background   : '#fff'

exports.CodeEditor = rclass
    propTypes :
        actions : rtypes.object.isRequired
        value   : rtypes.string.isRequired

    reduxProps :
        account :
            editor_settings : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return @props.editor_settings != next.editor_settings or \
               @props.font_size       != next.font_size

    componentDidMount: ->
        @init_codemirror(@props.value)

    componentWillReceiveProps: (next) ->
        if not @cm?
            @init_codemirror(next.value)
            return
        if @props.font_size != next.font_size
            @cm_refresh()
        if @props.value != next.value
            @_cm_merge_remote(next.value)

    cm_refresh: ->
        @cm?.refresh()
        setTimeout((=>@cm?.refresh()), 30)

    componentWillUnmount: ->
        if @cm?
            @_cm_save()
            @_cm_destroy()

    _cm_save: ->
        if not @cm?
            return
        value = @cm.getValue()
        if value == @_cm_last_remote
            # only save if we actually changed something
            return
        @_cm_last_remote = value
        @props.actions.set_value(value)

    _cm_merge_remote: (remote) ->
        if not @cm?
            return
        @_cm_last_remote ?= ''
        if @_cm_last_remote == remote
            return  # nothing to do
        local = @cm.getValue()
        new_val = three_way_merge
            base   : @_cm_last_remote
            local  : local
            remote : remote
        @_cm_last_remote = remote
        @cm.setValueNoJump(new_val)

    _cm_undo: ->
        @_cm_save()
        @props.actions.undo()

    _cm_redo: ->
        @_cm_save()
        @props.actions.redo()

    _cm_destroy: ->
        if not @cm?
            return
        delete @_cm_last_remote
        delete @cm.undo
        delete @cm.redo
        $(@cm.getWrapperElement()).remove()  # remove from DOM -- "Remove this from your tree to delete an editor instance."
        delete @cm

    init_codemirror: (value) ->
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        if not node?
            return

        options = @props.editor_settings?.toJS() ? {}
        save_to_disk = => @props.actions.save()
        keys =
            Tab           : => @cm.tab_as_space()
            "Cmd-S"       : save_to_disk
            "Alt-S"       : save_to_disk
            "Ctrl-S"      : save_to_disk
        if options.keyMap == 'vim'
            delete keys.Esc
        options.extraKeys ?= {}
        misc.merge(options.extraKeys, keys)

        @cm = CodeMirror.fromTextArea(node, options)
        $(@cm.getWrapperElement()).css(height:'auto')

        @_cm_last_remote = value
        @cm.setValue(value)

        @_cm_change = throttle(@_cm_save, 2000, {leading:false})
        @cm.on('change', @_cm_change)
        @cm.on('focus',=> @props.actions.disable_key_handler())

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

        if @props.is_current
            @cm?.focus()

        setTimeout((=>@cm_refresh(); if @props.is_current then @cm?.focus()), 0)

    render: ->
        <div style={STYLE}>
            <textarea />
        </div>
